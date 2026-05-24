const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('../lib/db');
const { getToken, forceRefresh, getTokenCache } = require('../lib/qbTokens');

const QB_BASE = 'https://quickbooks.api.intuit.com';
const AGENT   = 'qb';

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function addLogEntry(entry) {
  try {
    await db.query(
      `INSERT INTO changelog_entries(id, agent, timestamp, description, action, result, undo_action, undone)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        entry.id,
        AGENT,
        entry.timestamp,
        entry.description,
        JSON.stringify(entry.action),
        JSON.stringify(entry.result || {}),
        entry.undoAction ? JSON.stringify(entry.undoAction) : null,
        false,
      ]
    );
  } catch (err) {
    console.error('qbChat: changelog write failed:', err.message);
  }
  return entry;
}

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
    console.error('qbChat: message persist failed:', err.message);
  }
}

// ─── QuickBooks API helpers ───────────────────────────────────────────────────

function getRealmId() {
  return process.env.QB_REALM_ID || getTokenCache().realmId;
}

async function qbFetch(method, endpoint, body) {
  const realmId = getRealmId();
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${QB_BASE}/v3/company/${realmId}${endpoint}${sep}minorversion=65`;

  async function doRequest(token) {
    const opts = {
      method: method.toUpperCase(),
      headers: {
        Authorization:  `Bearer ${token}`,
        Accept:         'application/json',
        'Content-Type': 'application/json',
      },
    };
    if (body && ['POST', 'PUT'].includes(method.toUpperCase())) {
      opts.body = JSON.stringify(body);
    }
    const r = await fetch(url, opts);
    if (r.status === 401) return null;
    const data = await r.json();
    return { status: r.status, data };
  }

  let token  = await getToken();
  let result = await doRequest(token);

  if (result === null) {
    token  = await forceRefresh();
    result = await doRequest(token);
    if (result === null) throw new Error('QB API unauthorized after token refresh');
  }

  return result;
}

// ─── Claude tools ─────────────────────────────────────────────────────────────

const READ_TOOL = {
  name: 'read_qb_data',
  description: 'Fetch read-only data from QuickBooks: run IQL queries, fetch reports, and read individual records. Executes immediately without user approval.',
  input_schema: {
    type: 'object',
    properties: {
      endpoint: {
        type: 'string',
        description: 'QB API path after /v3/company/{realmId}. For queries: /query?query=SELECT * FROM Invoice MAXRESULTS 25. For reports: /reports/ProfitAndLoss?date_macro=This+Year. For single records: /invoice/123.',
      },
    },
    required: ['endpoint'],
  },
};

const WRITE_TOOL = {
  name: 'write_qb_data',
  description: 'Create or update QuickBooks records -- invoices, customers, bills, payments. Requires user approval before executing. Always include a specific preview_description.',
  input_schema: {
    type: 'object',
    properties: {
      method:              { type: 'string', enum: ['POST'] },
      endpoint:            { type: 'string', description: 'QB API path, e.g. /invoice (create), /invoice?operation=update (update -- requires SyncToken and Id in body)' },
      body:                { type: 'object', description: 'Full QB entity body. For updates, include Id, SyncToken, and sparse: true.' },
      preview_description: { type: 'string', description: 'Plain-English description of what will be created or changed.' },
    },
    required: ['method', 'endpoint', 'body', 'preview_description'],
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystem(context) {
  const contextSection = context ? `\n\nBusiness context:\n${context}` : '';

  return `You are a QuickBooks accounting assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon understand his financials and manage his QuickBooks company file using plain English.

WRITING RULES -- follow at all times:
- Never use em dashes. Use commas, colons, or double hyphens (--) instead.
- Use American English spelling only
- Be concise and direct -- no filler phrases
- Format financial data as tables or structured lists
- Always include $ signs for dollar amounts and format numbers with commas
- Summarize data clearly -- never show raw JSON

You have two tools:
1. read_qb_data -- for all read operations (queries, reports, individual records). Executes immediately.
2. write_qb_data -- for creating and updating records. Requires user approval. Always include a specific preview_description.

QuickBooks API conventions:
- IQL query format: SELECT * FROM Invoice WHERE DueDate < '2024-01-01' MAXRESULTS 25
  - Entity types: Invoice, Customer, Vendor, Bill, Payment, Expense, Account, Employee, Item, JournalEntry
  - Filter operators: =, !=, <, >, <=, >=, LIKE, IN, BETWEEN
  - Always add MAXRESULTS (max 1000) to limit results
- Reports available: ProfitAndLoss, BalanceSheet, CashFlow, AgedReceivables, AgedPayableDetail, CustomerBalance
  - Parameters: date_macro (This Year, Last Year, This Month, Last Month, This Quarter, Last Quarter), start_date, end_date
- For updates, first read the record to get its current SyncToken, then POST with sparse: true + Id + SyncToken + changed fields
- Dates in IQL use format: 'YYYY-MM-DD'

Capabilities:
- Financial Reports: P&L, Balance Sheet, Cash Flow, Aging reports
- Invoices: list, search, create, update, void
- Customers: list, search, create, update
- Expenses and Bills: list, search, view vendor totals
- Payments: list received payments and bills paid
- Accounts: list chart of accounts and balances${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/qb/chat-status -- check if QB is connected (distinct from /api/qb/status)
router.get('/qb/chat-status', (req, res) => {
  try {
    const cache = getTokenCache();
    res.json({ connected: !!cache.accessToken, tokenExpired: Date.now() >= cache.expiresAt });
  } catch {
    res.json({ connected: false, tokenExpired: true });
  }
});

// POST /api/qb/chat
router.post('/qb/chat', async (req, res) => {
  const { messages, context, sessionId } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  let connected = false;
  try {
    const cache = getTokenCache();
    connected = !!cache.accessToken;
  } catch {}
  if (!connected) return res.status(400).json({ error: 'QuickBooks is not connected. Complete OAuth setup first.' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let current = messages.map(m => ({ role: m.role, content: m.content }));
  const lastUser = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';

  try {
    for (let i = 0; i < 10; i++) {
      const resp = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system:     buildSystem(context || null),
        tools:      [READ_TOOL, WRITE_TOOL],
        messages:   current,
      });

      if (resp.stop_reason === 'end_turn') {
        const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
        await persistMessages(sessionId, lastUser, text);
        return res.json({ message: text });
      }

      if (resp.stop_reason === 'tool_use') {
        const writeBlock = resp.content.find(b => b.type === 'tool_use' && b.name === 'write_qb_data');

        if (writeBlock) {
          const claudeText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const { method, endpoint, body, preview_description } = writeBlock.input;

          return res.json({
            type:    'pending_action',
            id:      generateId(),
            message: claudeText,
            preview: preview_description,
            action: { method, endpoint, body: body || null, sessionId, lastUser },
          });
        }

        current.push({ role: 'assistant', content: resp.content });
        const toolResults = [];

        for (const block of resp.content) {
          if (block.type !== 'tool_use' || block.name !== 'read_qb_data') continue;
          let result;
          try {
            result = await qbFetch('GET', block.input.endpoint, null);
          } catch (err) {
            result = { error: err.message };
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }

        current.push({ role: 'user', content: toolResults });
      }
    }
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  res.json({ message: 'No response generated.' });
});

// POST /api/qb/execute
router.post('/qb/execute', async (req, res) => {
  const { action, preview } = req.body;
  if (!action?.method || !action?.endpoint) {
    return res.status(400).json({ error: 'action.method and action.endpoint required' });
  }

  let result;
  try {
    result = await qbFetch(action.method, action.endpoint, action.body);
  } catch (err) {
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  const success = result.status < 300 && !result.data?.Fault;

  const entry = await addLogEntry({
    id:          generateId(),
    timestamp:   new Date().toISOString(),
    description: preview,
    action:      { method: action.method, endpoint: action.endpoint, body: action.body },
    result:      { status: result.status },
    undoAction:  null,
  });

  let message = success ? `Done. ${preview}` : `Failed: ${result.data?.Fault?.Error?.[0]?.Message || JSON.stringify(result.data).slice(0, 200)}`;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const summary = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     'Write a 1-2 sentence plain-English confirmation of a QuickBooks action that just completed. Use American English. Never use em dashes.',
      messages:   [{ role: 'user', content: `Action: ${preview}\nHTTP status: ${result.status}\nResponse: ${JSON.stringify(result.data).slice(0, 500)}` }],
    });
    message = summary.content.find(b => b.type === 'text')?.text || message;
  } catch { /* fall back */ }

  await persistMessages(action.sessionId, action.lastUser, message);
  res.json({ message, logEntryId: entry.id, success });
});

// GET /api/qb/changelog
router.get('/qb/changelog', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, agent, timestamp, description, action, result, undo_action AS "undoAction", undone
       FROM changelog_entries WHERE agent = $1 ORDER BY timestamp DESC LIMIT 100`,
      [AGENT]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qb/undo/:entryId -- QB undo not supported (SyncToken requirement)
router.post('/qb/undo/:entryId', (req, res) => {
  res.status(400).json({ error: 'Automatic undo is not supported for QuickBooks. Use the QuickBooks dashboard to reverse changes manually.' });
});

module.exports = router;
