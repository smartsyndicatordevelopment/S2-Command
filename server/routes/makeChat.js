const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('../lib/db');

const AGENT = 'make';

function getMakeBase() {
  const zone = (process.env.MAKE_ZONE || 'us1').toLowerCase();
  return `https://${zone}.make.com/api/v2`;
}

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
    console.error('makeChat: changelog write failed:', err.message);
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
    console.error('makeChat: message persist failed:', err.message);
  }
}

// ─── Make.com API helpers ─────────────────────────────────────────────────────

async function callMakeApi(method, endpoint, queryParams, body) {
  const apiKey = process.env.MAKE_API_KEY;
  const base   = getMakeBase();

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams || {})) {
    if (v != null && v !== '') qs.append(k, String(v));
  }

  const url  = `${base}${endpoint}${qs.toString() ? '?' + qs.toString() : ''}`;
  const opts = {
    method:  method.toUpperCase(),
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    opts.body = JSON.stringify(body);
  }

  for (let i = 0; i < 3; i++) {
    try {
      const r  = await fetch(url, opts);
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };
      return { status: r.status, data };
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchBeforeState(method, endpoint) {
  if (['GET', 'POST'].includes(method.toUpperCase())) return null;
  try {
    const result = await callMakeApi('GET', endpoint, {}, null);
    return result.status < 300 ? result.data : null;
  } catch {
    return null;
  }
}

function buildUndoAction(method, endpoint, result, beforeState) {
  method = method.toUpperCase();

  if (method === 'POST') {
    // Running a scenario has no undo
    if (endpoint.endsWith('/run')) return null;
    // Created resource
    const id = result?.data?.scenario?.id || result?.data?.id;
    if (!id) return null;
    const base = endpoint.split('/').slice(0, -1).join('/');
    return { method: 'DELETE', endpoint: `${base}/${id}`, queryParams: {}, body: null };
  }

  if ((method === 'PATCH' || method === 'PUT') && beforeState) {
    return { method: 'PATCH', endpoint, queryParams: {}, body: beforeState };
  }

  return null;
}

// ─── Claude tools ─────────────────────────────────────────────────────────────

const READ_TOOL = {
  name: 'read_make_data',
  description: 'Fetch read-only data from Make.com: scenarios, executions, connections, webhooks, data stores. Executes immediately without user approval.',
  input_schema: {
    type: 'object',
    properties: {
      endpoint:    { type: 'string', description: 'API path, e.g. /scenarios, /scenarios/{id}, /executions, /connections, /hooks, /data-stores, /data-store-records' },
      queryParams: { type: 'object', description: 'Query params: teamId, scenarioId, limit, pg[offset], dataStoreId, etc.' },
    },
    required: ['endpoint'],
  },
};

const WRITE_TOOL = {
  name: 'write_make_data',
  description: 'Create, update, run, activate, deactivate, or delete Make.com scenarios, hooks, data store records, etc. Requires user approval before executing.',
  input_schema: {
    type: 'object',
    properties: {
      method:              { type: 'string', enum: ['POST', 'PATCH', 'PUT', 'DELETE'] },
      endpoint:            { type: 'string', description: 'e.g. /scenarios/{id}/run to run, PATCH /scenarios/{id} with isEnabled to toggle, DELETE /scenarios/{id} to delete' },
      queryParams:         { type: 'object' },
      body:                { type: 'object', description: 'e.g. {"isEnabled": false} to pause, {"data": {}} to run' },
      preview_description: { type: 'string', description: 'Plain-English description of what will change, shown for user approval.' },
    },
    required: ['method', 'endpoint', 'preview_description'],
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystem(context) {
  const teamId = process.env.MAKE_TEAM_ID || '';
  const zone   = process.env.MAKE_ZONE || 'us1';
  const contextSection = context ? `\n\nBusiness context:\n${context}` : '';

  return `You are a Make.com automation assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon view and manage his Make.com automation workspace using plain English.

Make.com Zone: ${zone}
Default Team ID: ${teamId}
Always include teamId: ${teamId} in query params when listing scenarios, executions, connections, data stores, or hooks -- unless a more specific filter is provided.

WRITING RULES -- follow at all times:
- Never use em dashes. Use commas, colons, or double hyphens (--) instead.
- Use American English spelling only
- Be concise and direct -- no filler phrases
- Format responses with headers and bullet points when listing multiple items
- Summarize data clearly -- never show raw JSON

You have two tools:
1. read_make_data -- for all GET/read operations. Executes immediately.
2. write_make_data -- for all create/update/run/delete operations. Requires user approval. Always include a specific preview_description.

Make.com API conventions:
- To activate a scenario: PATCH /scenarios/{id} with body {"isEnabled": true}
- To deactivate a scenario: PATCH /scenarios/{id} with body {"isEnabled": false}
- To run a scenario immediately: POST /scenarios/{id}/run
- Executions have statuses: success, warning, error, running
- Scenarios have scheduling (interval/cron) and active/inactive state
- Data stores are key-value stores accessible by scenarios

Capabilities:
- Scenarios: list, view details, run, activate/deactivate, rename, view recent executions
- Executions: list recent runs, view details and error messages
- Connections: list and check status of all service connections
- Webhooks: list configured webhooks (hooks)
- Data Stores: list stores and browse records${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/make/config
router.get('/make/config', (req, res) => {
  const apiKey = process.env.MAKE_API_KEY;
  const teamId = process.env.MAKE_TEAM_ID;
  res.json({
    hasKey:    !!apiKey,
    hasTeamId: !!teamId,
    teamId:    teamId || null,
    zone:      process.env.MAKE_ZONE || 'us1',
  });
});

// POST /api/make/chat
router.post('/make/chat', async (req, res) => {
  const { messages, context, sessionId } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.MAKE_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'MAKE_API_KEY not configured on server' });

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
        const writeBlock = resp.content.find(b => b.type === 'tool_use' && b.name === 'write_make_data');

        if (writeBlock) {
          const claudeText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const { method, endpoint, queryParams, body, preview_description } = writeBlock.input;
          const beforeState = await fetchBeforeState(method, endpoint);

          return res.json({
            type:    'pending_action',
            id:      generateId(),
            message: claudeText,
            preview: preview_description,
            action: {
              method,
              endpoint,
              queryParams: queryParams || {},
              body:        body        || null,
              beforeState,
              sessionId,
              lastUser,
            },
          });
        }

        current.push({ role: 'assistant', content: resp.content });
        const toolResults = [];

        for (const block of resp.content) {
          if (block.type !== 'tool_use' || block.name !== 'read_make_data') continue;
          let result;
          try {
            result = await callMakeApi('GET', block.input.endpoint, block.input.queryParams, null);
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

// POST /api/make/execute
router.post('/make/execute', async (req, res) => {
  const { action, preview } = req.body;
  if (!action?.method || !action?.endpoint) {
    return res.status(400).json({ error: 'action.method and action.endpoint required' });
  }

  const apiKey = process.env.MAKE_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'MAKE_API_KEY not configured' });

  let result;
  try {
    result = await callMakeApi(action.method, action.endpoint, action.queryParams, action.body);
  } catch (err) {
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  const success    = result.status < 300;
  const undoAction = success ? buildUndoAction(action.method, action.endpoint, result, action.beforeState) : null;

  const entry = await addLogEntry({
    id:          generateId(),
    timestamp:   new Date().toISOString(),
    description: preview,
    action:      { method: action.method, endpoint: action.endpoint, queryParams: action.queryParams, body: action.body },
    result:      { status: result.status },
    undoAction,
  });

  let message = success ? `Done. ${preview}` : `Failed (${result.status}).`;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const summary = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     'Write a 1-2 sentence plain-English confirmation of a Make.com action that just completed. Use American English. Never use em dashes.',
      messages:   [{ role: 'user', content: `Action: ${preview}\nHTTP status: ${result.status}\nResponse: ${JSON.stringify(result.data).slice(0, 500)}` }],
    });
    message = summary.content.find(b => b.type === 'text')?.text || message;
  } catch { /* fall back */ }

  await persistMessages(action.sessionId, action.lastUser, message);
  res.json({ message, logEntryId: entry.id, success });
});

// GET /api/make/changelog
router.get('/make/changelog', async (req, res) => {
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

// POST /api/make/undo/:entryId
router.post('/make/undo/:entryId', async (req, res) => {
  let entry;
  try {
    const { rows } = await db.query(
      `SELECT * FROM changelog_entries WHERE id = $1 AND agent = $2`,
      [req.params.entryId, AGENT]
    );
    if (!rows.length) return res.status(404).json({ error: 'Log entry not found' });
    entry = rows[0];
    entry.undoAction = entry.undo_action;
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (entry.undone)      return res.status(400).json({ error: 'Already undone' });
  if (!entry.undoAction) return res.status(400).json({ error: 'This action cannot be automatically undone' });

  const apiKey = process.env.MAKE_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'MAKE_API_KEY not configured' });

  let result;
  try {
    const { method, endpoint, queryParams, body } = entry.undoAction;
    result = await callMakeApi(method, endpoint, queryParams, body);
  } catch (err) {
    return res.status(502).json({ error: `Undo failed: ${err.message}` });
  }

  await db.query('UPDATE changelog_entries SET undone = true WHERE id = $1', [req.params.entryId]);
  res.json({ success: result.status < 300, status: result.status });
});

module.exports = router;
