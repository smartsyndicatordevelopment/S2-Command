const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('../lib/db');
const { getToken, forceRefresh, getTokenCache } = require('../lib/digitsTokens');
const { fetchPnL } = require('./digits');

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

// ─── Claude tools (read-only) ─────────────────────────────────────────────────

// Reliable, pre-parsed P&L (dollars) -- avoids the LLM having to construct the
// statement request and parse the cents tree itself.
async function toolGetPnL({ year, start_date, end_date, interval } = {}) {
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  let startDate, endDate, iv;
  if (start_date && end_date) {
    startDate = start_date;
    endDate = end_date;
    iv = interval || 'Month';
  } else {
    const y = year || currentYear;
    startDate = `${y}-01-01`;
    endDate = y === currentYear ? today : `${y}-12-31`;
    iv = 'Year';
  }
  const parsed = await fetchPnL({ interval: iv, startDate, endDate });
  return { startDate, endDate, interval: iv, ...parsed };
}

const PNL_TOOL = {
  name: 'get_profit_and_loss',
  description: 'Get a Profit & Loss summary for a period, already parsed into dollars. USE THIS for any income / expenses / net income / profit question (e.g. "how much did I make last month", "P&L this quarter", "top expenses this year"). Pass start_date and end_date (YYYY-MM-DD) for a month, quarter, or custom range, or year for a full calendar year. Returns totalIncome, totalExpenses, netIncome (dollars) plus income/expense line items and grouped breakdowns. Prefer this over read_digits_data for anything P&L-related.',
  input_schema: {
    type: 'object',
    properties: {
      start_date: { type: 'string', description: 'Period start YYYY-MM-DD, e.g. 2026-05-01 for May 2026.' },
      end_date:   { type: 'string', description: 'Period end YYYY-MM-DD, e.g. 2026-05-31.' },
      year:       { type: 'integer', description: 'Full calendar year; used only when start_date/end_date are omitted.' },
      interval:   { type: 'string', enum: ['Year', 'Quarter', 'Month'], description: 'Granularity. Defaults to Month for a range, Year for a full year.' },
    },
    required: [],
  },
};

const READ_TOOL = {
  name: 'read_digits_data',
  description: 'Fetch read-only accounting data from Digits: financial statements, transactions, categories, and company info. Executes immediately. This agent is read-only -- it cannot create or modify records.',
  input_schema: {
    type: 'object',
    properties: {
      method:   { type: 'string', enum: ['GET', 'POST'], description: 'GET for statements/categories/company. POST only for /v1/ledger/entries/query.' },
      endpoint: { type: 'string', description: 'Digits read path WITH query params. Statements need startDate, endDate, interval, e.g. /v1/ledger/statement/balance-sheet?startDate=2026-01-01&endDate=2026-05-31&interval=Year. Other paths: /v1/ledger/categories, /v1/ledger/parties, /v1/company. Transactions: POST /v1/ledger/entries/query.' },
      body:     { type: 'object', description: 'JSON body for POST /v1/ledger/entries/query: { filters: { occurredAfter, occurredBefore, categoryTypes, ... }, limit, cursor }. Omit for GET.' },
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

You have two tools. This agent is read-only and cannot create or change records.
1. get_profit_and_loss -- USE THIS for any income, expenses, net income, profit, or P&L question (e.g. "how much did I make last month"). It returns figures already parsed into dollars, so do NOT build P&L requests by hand. Pass start_date + end_date (YYYY-MM-DD) for a month/quarter/range, or year for a full year.
2. read_digits_data -- for everything else: balance sheet, cash flow, AR/AP aging, transaction lookups, categories, vendors, company info.

Digits Connect API conventions (for read_digits_data):
- Statements (GET): /v1/ledger/statement/{balance-sheet|cash-flow|aging/payable|aging/receivable|trial-balance}. Query params: startDate=YYYY-MM-DD, endDate=YYYY-MM-DD, interval=(Year|Quarter|Month). The date range defines the period. ALWAYS include startDate AND endDate in the endpoint string, or the statement comes back as all zeros. Example: /v1/ledger/statement/balance-sheet?startDate=2026-01-01&endDate=2026-05-31&interval=Year.
- Statement response shape: { rows: [tree] } -- a root node with nested children. Each node is { label, total: { amount, code }, summary: { kind }, category, children }. total.amount is in MINOR UNITS (cents): divide by 100 for dollars. Sections are identified by summary.kind (Income, CostOfGoodsSold, GrossProfit, OperatingExpenses, NetOperatingIncome, OtherIncome, OtherExpenses, NetOtherIncome, NetIncome). Leaf accounts carry category instead of summary.
- Transactions (POST /v1/ledger/entries/query): body { filters: { occurredAfter, occurredBefore (ISO datetime), categoryTypes: [Expenses|CostOfGoodsSold|OtherExpenses|Income|...], categoryIds, partyIds, minimumAmount, maximumAmount, type: Credit|Debit }, limit, cursor }. Response: { entryDetails: [ { transactionId, date, entry: { amount: { amount, code }, description, category: { name }, counterparty: { name } } } ], next: { cursor, more } }. entry.amount.amount is in cents: divide by 100.
- Categories (GET): /v1/ledger/categories. Parties/vendors (GET): /v1/ledger/parties. Company (GET): /v1/company.

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
        tools:      [PNL_TOOL, READ_TOOL],
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
          if (block.type !== 'tool_use') continue;
          let result;
          try {
            if (block.name === 'get_profit_and_loss') {
              result = await toolGetPnL(block.input || {});
            } else if (block.name === 'read_digits_data') {
              const method = (block.input.method || 'GET').toUpperCase();
              result = await digitsFetch(method, block.input.endpoint, block.input.body || null);
            } else {
              continue;
            }
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
