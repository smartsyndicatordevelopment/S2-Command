const router = require('express').Router();
const fetch = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

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
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    opts.body = JSON.stringify(body);
  }

  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };
  return { status: r.status, data };
}

const CLICKUP_TOOL = {
  name: 'call_clickup_api',
  description: 'Make an API call to ClickUp to read or write any workspace data including tasks, lists, folders, spaces, comments, goals, views, time entries, and webhooks.',
  input_schema: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        description: 'HTTP method',
      },
      endpoint: {
        type: 'string',
        description: 'API endpoint path, e.g. /team, /team/{team_id}/space, /list/{list_id}/task, /task/{task_id}, /goal/{goal_id}, /team/{team_id}/time_entries',
      },
      pathParams: {
        type: 'object',
        description: 'Key/value pairs to substitute into {param} placeholders in the endpoint path',
      },
      queryParams: {
        type: 'object',
        description: 'URL query string parameters',
      },
      body: {
        type: 'object',
        description: 'JSON request body for POST/PUT/PATCH requests',
      },
    },
    required: ['method', 'endpoint'],
  },
};

// POST /api/clickup/chat
router.post('/clickup/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.CLICKUP_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'CLICKUP_API_KEY environment variable is not set on the server.' });
  }

  const teamId    = process.env.CLICKUP_TEAM_ID || '';
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = `You are a ClickUp assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon interact with his ClickUp workspace using plain English.

The default Workspace/Team ID is: ${teamId}
Use this as team_id in any endpoint that requires it, unless the user specifies otherwise.

You can read and write data across the entire ClickUp workspace:
- Tasks: search, view, create, update, delete, assign, add tags and dependencies
- Lists, Folders, Spaces: view hierarchy, create and organize structure
- Comments: read and post comments on tasks, lists, and views
- Goals and OKRs: view goals, create key results, update progress
- Time Tracking: view logged time, start/stop timers, create and edit entries
- Views: list and filter tasks across spaces, folders, and lists
- Webhooks: view and manage event subscriptions
- Members: view workspace members and team groups
- Templates: list templates and create tasks from them

How to respond:
- Summarize data clearly -- never dump raw JSON
- Use line breaks and structure to present lists of tasks or records
- For creates and updates, confirm what was done after the API call succeeds
- For DELETE operations, describe what will be deleted before calling the API
- Keep responses concise and actionable
- When retrieving tasks, show name, status, assignee, and due date at minimum`;

  let current = messages.map(m => ({ role: m.role, content: m.content }));
  let finalText = '';

  try {
    for (let i = 0; i < 8; i++) {
      const resp = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system,
        tools:    [CLICKUP_TOOL],
        messages: current,
      });

      if (resp.stop_reason === 'end_turn') {
        finalText = resp.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
        break;
      }

      if (resp.stop_reason === 'tool_use') {
        current.push({ role: 'assistant', content: resp.content });

        const results = [];
        for (const block of resp.content) {
          if (block.type !== 'tool_use') continue;
          const { method, endpoint, pathParams, queryParams, body } = block.input;
          let result;
          try {
            result = await callClickUpApi(method, endpoint, pathParams, queryParams, body);
          } catch (err) {
            result = { error: err.message };
          }
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
        current.push({ role: 'user', content: results });
        continue;
      }

      break;
    }
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  res.json({ message: finalText || 'No response generated.' });
});

module.exports = router;
