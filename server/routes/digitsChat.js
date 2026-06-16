const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('../lib/db');
const { getToken, forceRefresh, getTokenCache } = require('../lib/digitsTokens');

const DIGITS_BASE = 'https://connect.digits.com';
const AGENT = 'digits';

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function persistMessages(sessionId, userText, assistantText) {
  if (!sessionId) return;
  try {
    await db.query(
      `INSERT INTO chat_messages(session_id, role, content)
       VALUES($1,'user',$2),($1,'assistant',$3)`,
      [sessionId, userText, assistantText]
    );
    await db.query('UPDATE chat_sessions SET updated_at = now() WHERE id = $1', [sessionId]);
  } catch (err) {
    console.error('digitsChat: message persist failed:', err.message);
  }
}

// ─── Digits read helper ───────────────────────────────────────────────────────

const ALLOWED_PREFIXES = ['/v1/ledger/', '/v1/company', '/v1/organization'];

async function digitsFetch(method, endpoint, body) {
  if (!ALLOWED_PREFIXES.some(p => endpoint.startsWith(p))) {
    throw new Error(`Endpoint not allowed: ${endpoint}. Only read endpoints under /v1/ledger, /v1/company, /v1/organization are permitted.`);
  }
  const url = `${DIGITS_BASE}${endpoint}`;

  async function doRequest(token) {
    const opts = {
      method: method.toUpperCase(),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    };
    const businessId = process.env.DIGITS_BUSINESS_ID || getTokenCache().businessId || '';
    if (businessId) opts.headers['Digits-Business-Id'] = businessId;
    if (body && method.toUpperCase() === 'POST') opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (r.status === 401) return null;
    const data = await r.json();
    return { status: r.status, data };
  }

  let token = await getToken();
  let result = await doRequest(token);
  if (result === null) {
    token = await forceRefresh();
    result = await doRequest(token);
    if (result === null) throw new Error('Digits API unauthorized after token refresh');
  }
  return result;
}

// ─── Claude tool (read-only) ──────────────────────────────────────────────────

const READ_TOOL = {
  name: 'read_digits_data',
  description: 'Fetch read-only accounting data from Digits: financial statements, transactions, categories, and company info. Executes immediately. This agent is read-only -- it cannot create or modify records.',
  input_schema: {
    type: 'object',
    properties: {
      method:   { type: 'string', enum: ['GET', 'POST'], description: 'GET for statements/categories/company. POST only for /v1/ledger/entries/query.' },
      endpoint: { type: 'string', description: 'Digits read path. Statements: /v1/ledger/statement/profit-and-loss, /balance-sheet, /cash-flow, /aging/payable, /aging/receivable. Transactions: POST /v1/ledger/entries/query. Also: /v1/ledger/categories, /v1/ledger/parties, /v1/company.' },
      body:     { type: 'object', description: 'JSON body for POST /v1/ledger/entries/query (origin period + filter). Omit for GET.' },
    },
    required: ['method', 'endpoint'],
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystem(context) {
  const contextSection = context ? `\n\nBusiness context:\n${context}` : '';

  return `You are a Digits accounting assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon understand his financials using plain English, backed by live data from Digits.

WRITING RULES -- follow at all times:
- Never use em dashes. Use commas, colons, or double hyphens (--) instead.
- Use American English spelling only
- Be concise and direct -- no filler phrases
- Format financial data as tables or structured lists
- Always include $ signs for dollar amounts and format numbers with commas
- Summarize data clearly -- never show raw JSON

You have ONE tool, read_digits_data, for all read operations. This agent is read-only and cannot create or change records.

Digits Connect API conventions:
- Financial statements (GET): /v1/ledger/statement/profit-and-loss, /balance-sheet, /cash-flow, /aging/payable, /aging/receivable, /trial-balance
  - Period is specified with interval (Day, Week, Month, Quarter, Year), year, index (month 1-12 / quarter 1-4 / year=the year), and interval_count.
- Transactions (POST /v1/ledger/entries/query): body with origin { interval, year, index, interval_count } and filter (category_types, category_subtypes, party_ids, minimum/maximum, occurred_after/occurred_before).
- Categories (GET): /v1/ledger/categories. Parties/vendors (GET): /v1/ledger/parties. Company (GET): /v1/company.
- Amounts in statement responses are dollar floats in money_flow.value; expenses are negative.

Capabilities:
- Financial reports: P&L, Balance Sheet, Cash Flow, AR/AP aging
- Transaction lookups and category breakdowns
- Vendor / party spend analysis${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/digits/chat-status', (req, res) => {
  try {
    const cache = getTokenCache();
    res.json({ connected: !!cache.accessToken, tokenExpired: Date.now() >= cache.expiresAt });
  } catch {
    res.json({ connected: false, tokenExpired: true });
  }
});

router.post('/digits/chat', async (req, res) => {
  const { messages, context, sessionId } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  let connected = false;
  try { connected = !!getTokenCache().accessToken; } catch {}
  if (!connected) return res.status(400).json({ error: 'Digits is not connected. Complete OAuth setup first.' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const current = messages.map(m => ({ role: m.role, content: m.content }));
  const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';

  try {
    for (let i = 0; i < 10; i++) {
      const resp = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system:     buildSystem(context || null),
        tools:      [READ_TOOL],
        messages:   current,
      });

      if (resp.stop_reason === 'end_turn') {
        const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
        await persistMessages(sessionId, lastUser, text);
        return res.json({ message: text });
      }

      if (resp.stop_reason === 'tool_use') {
        current.push({ role: 'assistant', content: resp.content });
        const toolResults = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use' || block.name !== 'read_digits_data') continue;
          let result;
          try {
            const method = (block.input.method || 'GET').toUpperCase();
            result = await digitsFetch(method, block.input.endpoint, block.input.body || null);
          } catch (err) {
            result = { error: err.message };
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result).slice(0, 60000) });
        }
        current.push({ role: 'user', content: toolResults });
      }
    }
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  res.json({ message: 'No response generated.' });
});

module.exports = router;
