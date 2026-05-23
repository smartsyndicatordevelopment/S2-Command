const router    = require('express').Router();
const fetch     = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const FB_BASE     = 'https://graph.facebook.com/v21.0';
const LOG_PATH    = path.join(__dirname, '../../sessions/fb-changelog.json');
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

// Ensure ad account ID has "act_" prefix
function normalizeAccountId(id) {
  if (!id) return id;
  return id.startsWith('act_') ? id : `act_${id}`;
}

// ─── Facebook API helpers ─────────────────────────────────────────────────────

async function callFbApi(method, fbPath, queryParams, body) {
  const token = process.env.FB_ACCESS_TOKEN;

  const qs = new URLSearchParams({ access_token: token });
  for (const [k, v] of Object.entries(queryParams || {})) {
    if (v != null && v !== '') qs.append(k, String(v));
  }

  const url  = `${FB_BASE}${fbPath}?${qs.toString()}`;
  const opts = { method: method.toUpperCase(), headers: { 'Content-Type': 'application/json' } };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    opts.body = JSON.stringify(body);
  }

  for (let i = 0; i < 3; i++) {
    try {
      const r    = await fetch(url, opts);
      const data = await r.json();
      return { status: r.status, data };
    } catch (err) {
      if (i === 2) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchBeforeState(method, fbPath) {
  // Only capture before-state for updates (POST to an object ID) and deletes
  if (method.toUpperCase() === 'GET') return null;
  // Heuristic: if path ends with a numeric/alphanumeric ID segment, it's an update
  const isObjectPath = /\/[\w\d_]+$/.test(fbPath) && !/\/(campaigns|adsets|ads|adcreatives|insights|customaudiences)$/.test(fbPath);
  if (!isObjectPath) return null;
  try {
    const result = await callFbApi('GET', fbPath, {}, null);
    return result.status < 300 ? result.data : null;
  } catch {
    return null;
  }
}

function buildUndoAction(method, fbPath, result, beforeState) {
  method = method.toUpperCase();

  if (method === 'POST') {
    const id = result?.data?.id;
    if (!id) return null;
    // For Facebook, "delete" means setting status=DELETED
    return { method: 'POST', path: `/${id}`, queryParams: {}, body: { status: 'DELETED' } };
  }

  if (method === 'DELETE' && beforeState) {
    return { method: 'POST', path: fbPath, queryParams: {}, body: { status: beforeState.status || 'PAUSED' } };
  }

  if (beforeState) {
    const systemFields = ['id', 'account_id', 'created_time', 'updated_time', 'adlabels'];
    const body = Object.fromEntries(
      Object.entries(beforeState).filter(([k]) => !systemFields.includes(k))
    );
    return { method: 'POST', path: fbPath, queryParams: {}, body };
  }

  return null;
}

// ─── Claude tools ─────────────────────────────────────────────────────────────

const READ_TOOL = {
  name: 'read_fb_data',
  description: 'Fetch read-only data from the Facebook Marketing API using GET requests -- campaigns, ad sets, ads, insights, audiences, pages. Executes immediately without user approval.',
  input_schema: {
    type: 'object',
    properties: {
      path:        { type: 'string', description: 'API path after graph.facebook.com/v21.0, e.g. /{ad_account_id}/campaigns, /{campaign_id}/insights, /{ad_account_id}/adsets, /{ad_account_id}/ads' },
      queryParams: { type: 'object', description: 'Query params: fields, date_preset, time_range ({"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}), level, breakdowns, limit, etc.' },
    },
    required: ['path'],
  },
};

const WRITE_TOOL = {
  name: 'write_fb_data',
  description: 'Create or update Facebook campaigns, ad sets, ads, or creatives. Requires user approval before executing. Include a specific preview_description.',
  input_schema: {
    type: 'object',
    properties: {
      method:              { type: 'string', enum: ['POST', 'DELETE'] },
      path:                { type: 'string', description: 'API path, e.g. /{ad_account_id}/campaigns to create, /{campaign_id} to update/pause' },
      queryParams:         { type: 'object', description: 'Query parameters' },
      body:                { type: 'object', description: 'Request body -- for updates, only include changed fields' },
      preview_description: { type: 'string', description: 'Plain-English description of exactly what will change, shown to the user for approval.' },
    },
    required: ['method', 'path', 'preview_description'],
  },
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystem(context) {
  const rawAccountId = process.env.FB_AD_ACCOUNT_ID || '';
  const accountId    = normalizeAccountId(rawAccountId);
  const contextSection = context ? `\n\nBusiness context (use to inform your responses):\n${context}` : '';

  return `You are a Facebook Ads assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon manage his Facebook ad account using plain English.

Ad Account ID: ${accountId}
Use this as {ad_account_id} in all API paths. Always format it with the "act_" prefix.

WRITING RULES -- follow at all times:
- Never use em dashes. Use commas, colons, or double hyphens (--) instead.
- Use American English spelling only (analyze, optimize, etc.)
- Be concise and direct -- no filler phrases
- Format responses with headers and bullet points when presenting data
- Summarize metrics clearly -- never show raw JSON. Use $ for spend, % for rates.

You have two tools:
1. read_fb_data -- for all GET/read operations. Executes immediately.
2. write_fb_data -- for all create/update/delete operations. Requires user approval. Always include a specific preview_description.

Facebook API conventions:
- Campaigns are paused/activated by POSTing {"status":"PAUSED"} or {"status":"ACTIVE"} to /{campaign_id}
- Ad sets and ads use the same status pattern
- To get performance, use /{ad_account_id}/insights with fields like spend, impressions, clicks, ctr, cpm, cpc, actions, cost_per_action_type, reach, frequency
- Use date_preset values: today, yesterday, this_week, last_7d, last_14d, last_30d, this_month, last_month
- Always include useful fields in GET requests: for campaigns use fields=id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time

Capabilities:
- Campaigns: list, create, pause, activate, update budget and schedule
- Ad Sets: list, view targeting and budgets, create, update
- Ads: list, view, update status
- Insights: spend, ROAS, impressions, clicks, CTR, CPM, CPC, conversions by date range
- Audiences: list custom audiences and lookalike audiences
- Creative: list ad creatives${contextSection}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/fb/config
router.get('/fb/config', (req, res) => {
  const token     = process.env.FB_ACCESS_TOKEN;
  const accountId = process.env.FB_AD_ACCOUNT_ID;
  res.json({
    hasToken:     !!token,
    hasAccountId: !!accountId,
    tokenPreview: token ? `...${token.slice(-6)}` : null,
    accountId:    accountId ? normalizeAccountId(accountId) : null,
  });
});

// POST /api/fb/chat
router.post('/fb/chat', async (req, res) => {
  const { messages, context } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'FB_ACCESS_TOKEN not configured on server' });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let current = messages.map(m => ({ role: m.role, content: m.content }));

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
        return res.json({ message: text });
      }

      if (resp.stop_reason === 'tool_use') {
        const writeBlock = resp.content.find(b => b.type === 'tool_use' && b.name === 'write_fb_data');

        if (writeBlock) {
          const claudeText = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const { method, path: fbPath, queryParams, body, preview_description } = writeBlock.input;
          const beforeState = await fetchBeforeState(method, fbPath);

          return res.json({
            type:    'pending_action',
            id:      generateId(),
            message: claudeText,
            preview: preview_description,
            action: {
              method,
              path:        fbPath,
              endpoint:    fbPath,
              queryParams: queryParams || {},
              body:        body        || null,
              beforeState,
            },
          });
        }

        current.push({ role: 'assistant', content: resp.content });
        const toolResults = [];

        for (const block of resp.content) {
          if (block.type !== 'tool_use' || block.name !== 'read_fb_data') continue;
          let result;
          try {
            result = await callFbApi('GET', block.input.path, block.input.queryParams, null);
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

// POST /api/fb/execute -- user approved a pending action
router.post('/fb/execute', async (req, res) => {
  const { action, preview } = req.body;
  if (!action?.method || !(action?.path || action?.endpoint)) {
    return res.status(400).json({ error: 'action.method and action.path required' });
  }

  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'FB_ACCESS_TOKEN not configured' });

  const fbPath = action.path || action.endpoint;
  let result;
  try {
    result = await callFbApi(action.method, fbPath, action.queryParams, action.body);
  } catch (err) {
    return res.status(502).json({ error: `Execution failed: ${err.message}` });
  }

  const success    = result.status < 300 && !result.data?.error;
  const undoAction = success ? buildUndoAction(action.method, fbPath, result, action.beforeState) : null;

  const entry = addLogEntry({
    id:          generateId(),
    timestamp:   new Date().toISOString(),
    description: preview,
    action:      { method: action.method, path: fbPath, queryParams: action.queryParams, body: action.body },
    result:      { status: result.status },
    undoAction,
    undone:      false,
  });

  let message = success ? `Done. ${preview}` : `Failed: ${result.data?.error?.message || JSON.stringify(result.data).slice(0, 200)}`;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const summary   = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system:     'Write a 1-2 sentence plain-English confirmation of a Facebook Ads action that just completed. Use American English. Never use em dashes.',
      messages:   [{ role: 'user', content: `Action: ${preview}\nHTTP status: ${result.status}\nResponse: ${JSON.stringify(result.data).slice(0, 500)}` }],
    });
    message = summary.content.find(b => b.type === 'text')?.text || message;
  } catch { /* fall back to simple message */ }

  res.json({ message, logEntryId: entry.id, success });
});

// GET /api/fb/changelog
router.get('/fb/changelog', (req, res) => {
  res.json(readLog());
});

// POST /api/fb/undo/:entryId
router.post('/fb/undo/:entryId', async (req, res) => {
  const entries = readLog();
  const idx     = entries.findIndex(e => e.id === req.params.entryId);

  if (idx === -1) return res.status(404).json({ error: 'Log entry not found' });

  const entry = entries[idx];
  if (entry.undone)      return res.status(400).json({ error: 'Already undone' });
  if (!entry.undoAction) return res.status(400).json({ error: 'This action cannot be automatically undone' });

  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) return res.status(400).json({ error: 'FB_ACCESS_TOKEN not configured' });

  let result;
  try {
    const { method, path: fbPath, queryParams, body } = entry.undoAction;
    result = await callFbApi(method, fbPath, queryParams, body);
  } catch (err) {
    return res.status(502).json({ error: `Undo failed: ${err.message}` });
  }

  entries[idx].undone = true;
  writeLog(entries);

  res.json({ success: result.status < 300 && !result.data?.error, status: result.status });
});

module.exports = router;
