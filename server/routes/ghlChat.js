const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const LOG_PATH    = path.join(__dirname, '../../sessions/ghl-changelog.json');
const MAX_ENTRIES = 100;

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

// ─── GHL API helpers ──────────────────────────────────────────────────────────

async function callGhlApi(method, endpoint, pathParams, queryParams, body) {
  const apiKey = process.env.GHL_API_KEY;

  let url = `${GHL_BASE}${endpoint}`;
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
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    opts.body = JSON.stringify(body);
  }

  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, opts);
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };
      return { status: r.status, data, url };
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Fetch the current state of a resource before mutating it (for undo support)
async function fetchBeforeState(method, endpoint, pathParams) {
  if (!['PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return null;
  try {
    const result = await callGhlApi('GET', endpoint, pathParams, {}, null);
    return result.status < 300 ? result.data : null;
  } catch {
    return null;
  }
}

// Build an undo action from what was executed
function buildUndoAction(method, endpoint, pathParams, result, beforeState) {
  method = method.toUpperCase();

  if (method === 'POST') {
    // Find the created resource ID in the response
    const d = result?.data;
    const id = d?.id || d?.contact?.id || d?.opportunity?.id ||
               d?.note?.id || d?.task?.id || d?.appointment?.id ||
               d?.post?._id || d?.campaign?.id || d?.template?.id;
    if (!id) return null;
    const deleteEndpoint = endpoint.replace(/\/$/, '') + `/${id}`;
    return { method: 'DELETE', endpoint: deleteEndpoint, pathParams: {}, queryParams: {}, body: null };
  }

  if ((method === 'PUT' || method === 'PATCH') && beforeState) {
    return { method: 'PUT', endpoint, pathParams, queryParams: {}, body: beforeState };
  }

  if (method === 'DELETE' && beforeState) {
    // Best-effort recreate -- strip system-generated fields
    const systemFields = ['id', '_id', 'dateAdded', 'dateUpdated', 'createdAt', 'updatedAt', 'dateCreated'];
    const body = Object.fromEntries(
      Object.entries(beforeState).filter(([k]) => !systemFields.includes(k))
    );
    // Collection endpoint: strip last path segment (the resource ID)
    const createEndpoint = endpoint.replace(/\/[^/{}]+$/, '/');
    return { method: 'POST', endpoint: createEndpoint, pathParams: {}, queryParams: {}, body };
  }

  return null;
}

// ─── Claude tools ─────────────────────────────────────────────────────────────

const READ_TOOL = {
  name: 'read_ghl_data',
  description: 'Fetch read-only data from GHL using GET requests. Use this to look up contacts, search opportunities, list email templates, view appointments, check conversations, and any other read operation. Executes immediately without user approval.',
  input_schema: {
    type: 'object',
    properties: {
      endpoint:    { type: 'string', description: 'GHL API endpoint path, e.g. /contacts/, /conversations/search, /opportunities/search, /calendars/events, /emails/builder, /blogs/posts' },
      pathParams:  { type: 'object', description: 'Values to substitute into {param} placeholders' },
      queryParams: { type: 'object', description: 'URL query string parameters' },
    },
    required: ['endpoint'],
  },
};

const WRITE_TOOL = {
  name: 'write_ghl_data',
  description: 'Create, update, or delete GHL data. This will show a detailed preview to the user and REQUIRE their approval before anything is executed. Use this for all POST, PUT, PATCH, and DELETE operations.',
  input_schema: {
    type: 'object',
    properties: {
      method:              { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] },
      endpoint:            { type: 'string', description: 'GHL API endpoint path' },
      pathParams:          { type: 'object', description: 'Path parameter substitutions' },
      queryParams:         { type: 'object', description: 'Query string parameters' },
      body:                { type: 'object', description: 'Request body for POST/PUT/PATCH' },
      preview_description: { type: 'string', description: 'Plain-English description of exactly what will change -- shown to the user for review before execution. Be specific: include names, values changing from/to, etc.' },
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
  const locationId = process.env.GHL_LOCATION_ID || '';
  const contextSection = context
    ? `\n\nBusiness context (use this to inform your responses and writing):\n${context}`
    : '';

  return `You are a GoHighLevel assistant for Smart Syndicator, a real estate syndication SaaS platform that helps real estate syndicators raise capital, manage investor relations, and run professional investment operations. You help Brandon, the founder, interact with his GHL sub-account using plain English.

Default Location ID: ${locationId}
Always include this as locationId (or location_id) in every request that requires it.

WRITING RULES -- follow these at all times:
- Never use em dashes. Use commas, colons, or a plain double hyphen (--) instead.
- Use American English spelling only (analyze, color, favor, center, etc.)
- Be concise and direct -- no filler phrases or unnecessary caveats
- Format responses with headers and bullet points when listing multiple items
- Summarize data clearly -- never show raw JSON

You have two tools:
1. read_ghl_data -- for all GET/read operations. Executes immediately.
2. write_ghl_data -- for all create/update/delete operations. Requires user approval before executing. You MUST include a clear preview_description describing exactly what will change.

Capabilities:
- Contacts: search, view, create, update, tags, notes, tasks
- Conversations and Messages: search threads, read messages, send SMS and email
- Opportunities: view pipeline, create, update, change status
- Calendars: appointments, free slots, create bookings
- Email Templates: list, create, update HTML templates
- Social Media: accounts, schedule and publish posts
- Blog Posts: list, create, publish, update content
- Workflows: list active automations
- Forms and Surveys: view forms and submissions
- Products and Payments: orders, transactions, subscriptions
- Custom Fields, Tags, Locations: settings and metadata

Response style:
- For writes, include a specific preview_description (e.g. "Add tag 'investor' to contact Jane Doe (ID: abc123)")
- When listing records, use a clean format: name, key detail, ID${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/ghl/chat
router.post('/ghl/chat', async (req, res) => {
  const { messages, context } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'GHL_API_KEY not configured on server' });

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
        const writeBlock = resp.content.find(b => b.type === 'tool_use' && b.name === 'write_ghl_data');

        if (writeBlock) {
          // Pause -- send pending action to client for approval
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

        // All tool uses are reads -- execute and continue loop
        current.push({ role: 'assistant', content: resp.content });
        const toolResults = [];

        for (const block of resp.content) {
          if (block.type !== 'tool_use' || block.name !== 'read_ghl_data') continue;
          let result;
          try {
            result = await callGhlApi('GET', block.input.endpoint, block.input.pathParams, block.input.queryParams, null);
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

// POST /api/ghl/execute  -- user approved a pending action
router.post('/ghl/execute', async (req, res) => {
  const { action, preview } = req.body;
  if (!action?.method || !action?.endpoint) {
    return res.status(400).json({ error: 'action.method and action.endpoint required' });
  }

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'GHL_API_KEY not configured' });

  let result;
  try {
    result = await callGhlApi(action.method, action.endpoint, action.pathParams, action.queryParams, action.body);
  } catch (err) {
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  const success = result.status < 300;
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

  // Use Haiku to generate a natural-language summary of what happened
  let message = success ? `Done. ${preview}` : `Failed (${result.status}). ${JSON.stringify(result.data).slice(0, 200)}`;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const summary = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     'Write a 1-2 sentence plain-English confirmation of a GHL API action that just completed. Be specific. If it failed, describe the error clearly.',
      messages:   [{ role: 'user', content: `Action: ${preview}\nHTTP status: ${result.status}\nResponse: ${JSON.stringify(result.data).slice(0, 500)}` }],
    });
    message = summary.content.find(b => b.type === 'text')?.text || message;
  } catch { /* fall back to simple message */ }

  res.json({ message, logEntryId: entry.id, success });
});

// GET /api/ghl/changelog
router.get('/ghl/changelog', (req, res) => {
  res.json(readLog());
});

// POST /api/ghl/undo/:entryId
router.post('/ghl/undo/:entryId', async (req, res) => {
  const entries = readLog();
  const idx = entries.findIndex(e => e.id === req.params.entryId);

  if (idx === -1) return res.status(404).json({ error: 'Log entry not found' });

  const entry = entries[idx];
  if (entry.undone) return res.status(400).json({ error: 'Already undone' });
  if (!entry.undoAction) return res.status(400).json({ error: 'This action cannot be automatically undone' });

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'GHL_API_KEY not configured' });

  let result;
  try {
    const { method, endpoint, pathParams, queryParams, body } = entry.undoAction;
    result = await callGhlApi(method, endpoint, pathParams, queryParams, body);
  } catch (err) {
    return res.status(502).json({ error: `Undo failed: ${err.message}` });
  }

  entries[idx].undone = true;
  writeLog(entries);

  res.json({ success: result.status < 300, status: result.status });
});

module.exports = router;
