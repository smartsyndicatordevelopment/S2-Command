const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';
const LOG_PATH     = path.join(__dirname, '../../sessions/clickup-changelog.json');
const MAX_ENTRIES  = 100;

// ─── Changelog helpers ────────────────────────────────────────────────────────

function readLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); }
  catch { return []; }
}

function writeLog(entries) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

function addLogEntry(entry) {
  const entries = readLog();
  entries.unshift(entry);
  writeLog(entries.slice(0, MAX_ENTRIES));
  return entry;
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── ClickUp API helpers ──────────────────────────────────────────────────────

async function callClickUpApi(method, endpoint, pathParams, queryParams, body) {
  const apiKey = process.env.CLICKUP_API_KEY;

  let url = `${CLICKUP_BASE}${endpoint}`;
  for (const [k, v] of Object.entries(pathParams || {})) {
    if (v != null && v !== '') url = url.replace(`{${k}}`, encodeURIComponent(String(v)));
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams || {})) {
    if (v != null && v !== '') qs.append(k, String(v));
  }
  if (qs.toString()) url += `?${qs.toString()}`;

  const opts = {
    method: method.toUpperCase(),
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
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

async function fetchBeforeState(method, endpoint, pathParams) {
  if (!['PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return null;
  try {
    const result = await callClickUpApi('GET', endpoint, pathParams, {}, null);
    return result.status < 300 ? result.data : null;
  } catch {
    return null;
  }
}

function buildUndoAction(method, endpoint, pathParams, result, beforeState) {
  method = method.toUpperCase();

  if (method === 'POST') {
    const d  = result?.data;
    const id = d?.id || d?.task?.id || d?.comment?.id;
    if (!id) return null;
    const deleteEndpoint = endpoint.replace(/\/$/, '') + `/${id}`;
    return { method: 'DELETE', endpoint: deleteEndpoint, pathParams: {}, queryParams: {}, body: null };
  }

  if ((method === 'PUT' || method === 'PATCH') && beforeState) {
    return { method: 'PUT', endpoint, pathParams, queryParams: {}, body: beforeState };
  }

  if (method === 'DELETE' && beforeState) {
    const systemFields = ['id', 'date_created', 'date_updated', 'date_closed', 'creator', 'url', 'permission_level'];
    const body = Object.fromEntries(
      Object.entries(beforeState).filter(([k]) => !systemFields.includes(k))
    );
    const createEndpoint = endpoint.replace(/\/[^/{}]+$/, '');
    return { method: 'POST', endpoint: createEndpoint, pathParams: {}, queryParams: {}, body };
  }

  return null;
}

// ─── Claude tools ─────────────────────────────────────────────────────────────

const READ_TOOL = {
  name: 'read_clickup_data',
  description: 'Fetch read-only data from ClickUp using GET requests -- tasks, lists, spaces, folders, comments, goals, time entries, members, views. Executes immediately without user approval.',
  input_schema: {
    type: 'object',
    properties: {
      endpoint:    { type: 'string', description: 'API endpoint path, e.g. /team, /team/{team_id}/space, /list/{list_id}/task, /task/{task_id}, /team/{team_id}/time_entries' },
      pathParams:  { type: 'object', description: 'Values for {param} placeholders in the endpoint' },
      queryParams: { type: 'object', description: 'URL query parameters' },
    },
    required: ['endpoint'],
  },
};

const WRITE_TOOL = {
  name: 'write_clickup_data',
  description: 'Create, update, or delete ClickUp data. Shows a preview to the user and REQUIRES their approval before executing.',
  input_schema: {
    type: 'object',
    properties: {
      method:              { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
      endpoint:            { type: 'string', description: 'API endpoint path' },
      pathParams:          { type: 'object', description: 'Path parameter substitutions' },
      queryParams:         { type: 'object', description: 'Query parameters' },
      body:                { type: 'object', description: 'Request body for POST/PUT/PATCH' },
      preview_description: { type: 'string', description: 'Plain-English description of exactly what will change, shown to the user for approval.' },
    },
    required: ['method', 'endpoint', 'preview_description'],
  },
};

// ─── Input sanitization ───────────────────────────────────────────────────────

function sanitizeContext(ctx) {
  if (!ctx || typeof ctx !== 'string') return null;
  return ctx.slice(0, 1000).replace(/system:|assistant:|<\|.*?\|>/gi, '');
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystem(context) {
  const teamId = process.env.CLICKUP_TEAM_ID || '';
  const contextSection = context ? `\n\nBusiness context (use to inform your responses):\n${context}` : '';

  return `You are a ClickUp assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon manage his ClickUp workspace using plain English.

Default Workspace/Team ID: ${teamId}
Use this as team_id in any endpoint that requires it.

WRITING RULES -- follow at all times:
- Never use em dashes. Use commas, colons, or double hyphens (--) instead.
- Use American English spelling only (analyze, color, favor, center, etc.)
- Be concise and direct -- no filler phrases
- Format responses with headers and bullet points when listing multiple items
- Summarize data clearly -- never show raw JSON

You have two tools:
1. read_clickup_data -- for all GET/read operations. Executes immediately.
2. write_clickup_data -- for all create/update/delete operations. Requires user approval before executing. Always include a specific preview_description (e.g. "Create task 'Review Q2 report' in the Marketing list, assigned to Brandon, due June 15").

Capabilities:
- Tasks: search, view, create, update, delete, assign, set due dates, add tags and dependencies
- Lists, Folders, Spaces: view hierarchy, create and organize structure
- Comments: read and post comments on tasks
- Goals and OKRs: view goals, create key results, update progress
- Time Tracking: view logged time, create and update entries
- Views: list and filter tasks across spaces, folders, and lists
- Members: view workspace members and groups${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/clickup/chat
router.post('/clickup/chat', async (req, res) => {
  const { messages, context } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'CLICKUP_API_KEY not configured on server' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let current = messages.map(m => ({ role: m.role, content: m.content }));

  try {
    for (let i = 0; i < 10; i++) {
      const resp = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system:     buildSystem(sanitizeContext(context)),
        tools:      [READ_TOOL, WRITE_TOOL],
        messages:   current,
      });

      if (resp.stop_reason === 'end_turn') {
        const text = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
        return res.json({ message: text });
      }

      if (resp.stop_reason === 'tool_use') {
        const writeBlock = resp.content.find(b => b.type === 'tool_use' && b.name === 'write_clickup_data');

        if (writeBlock) {
          const claudeText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const { method, endpoint, pathParams, queryParams, body, preview_description } = writeBlock.input;
          const beforeState = await fetchBeforeState(method, endpoint, pathParams || {});

          return res.json({
            type:    'pending_action',
            id:      generateId(),
            message: claudeText,
            preview: preview_description,
            action: {
              method,
              endpoint,
              pathParams:  pathParams  || {},
              queryParams: queryParams || {},
              body:        body        || null,
              beforeState,
            },
          });
        }

        current.push({ role: 'assistant', content: resp.content });
        const toolResults = [];

        for (const block of resp.content) {
          if (block.type !== 'tool_use' || block.name !== 'read_clickup_data') continue;
          let result;
          try {
            result = await callClickUpApi('GET', block.input.endpoint, block.input.pathParams, block.input.queryParams, null);
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

// POST /api/clickup/execute -- user approved a pending action
router.post('/clickup/execute', async (req, res) => {
  const { action, preview } = req.body;
  if (!action?.method || !action?.endpoint) {
    return res.status(400).json({ error: 'action.method and action.endpoint required' });
  }

  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'CLICKUP_API_KEY not configured' });

  let result;
  try {
    result = await callClickUpApi(action.method, action.endpoint, action.pathParams, action.queryParams, action.body);
  } catch (err) {
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  const success    = result.status < 300;
  const undoAction = success ? buildUndoAction(action.method, action.endpoint, action.pathParams, result, action.beforeState) : null;

  const entry = addLogEntry({
    id:          generateId(),
    timestamp:   new Date().toISOString(),
    description: preview,
    action:      { method: action.method, endpoint: action.endpoint, pathParams: action.pathParams, queryParams: action.queryParams, body: action.body },
    result:      { status: result.status },
    undoAction,
    undone:      false,
  });

  let message = success ? `Done. ${preview}` : `Failed (${result.status}). ${JSON.stringify(result.data).slice(0, 200)}`;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const summary   = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     'Write a 1-2 sentence plain-English confirmation of a ClickUp action that just completed. Use American English. Never use em dashes.',
      messages:   [{ role: 'user', content: `Action: ${preview}\nHTTP status: ${result.status}\nResponse: ${JSON.stringify(result.data).slice(0, 500)}` }],
    });
    message = summary.content.find(b => b.type === 'text')?.text || message;
  } catch { /* fall back to simple message */ }

  res.json({ message, logEntryId: entry.id, success });
});

// GET /api/clickup/changelog
router.get('/clickup/changelog', (req, res) => {
  res.json(readLog());
});

// POST /api/clickup/undo/:entryId
router.post('/clickup/undo/:entryId', async (req, res) => {
  const entries = readLog();
  const idx     = entries.findIndex(e => e.id === req.params.entryId);

  if (idx === -1) return res.status(404).json({ error: 'Log entry not found' });

  const entry = entries[idx];
  if (entry.undone)    return res.status(400).json({ error: 'Already undone' });
  if (!entry.undoAction) return res.status(400).json({ error: 'This action cannot be automatically undone' });

  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'CLICKUP_API_KEY not configured' });

  let result;
  try {
    const { method, endpoint, pathParams, queryParams, body } = entry.undoAction;
    result = await callClickUpApi(method, endpoint, pathParams, queryParams, body);
  } catch (err) {
    return res.status(502).json({ error: `Undo failed: ${err.message}` });
  }

  entries[idx].undone = true;
  writeLog(entries);

  res.json({ success: result.status < 300, status: result.status });
});

module.exports = router;
