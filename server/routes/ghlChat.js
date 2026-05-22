const router = require('express').Router();
const fetch = require('node-fetch');
const Anthropic = require('@anthropic-ai/sdk');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

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

  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };
  return { status: r.status, data };
}

const GHL_TOOL = {
  name: 'call_ghl_api',
  description: 'Make an API call to GoHighLevel to read or write any sub-account data including contacts, conversations, opportunities, calendars, email templates, social posts, blog posts, workflows, forms, surveys, products, payments, and more.',
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
        description: 'API endpoint path, e.g. /contacts/, /conversations/search, /opportunities/search, /emails/builder, /calendars/events, /social-media-posting/{locationId}/posts, /blogs/posts',
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

// POST /api/ghl/chat
router.post('/ghl/chat', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'GHL_API_KEY environment variable is not set on the server.' });
  }

  const locationId = process.env.GHL_LOCATION_ID || '';
  const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = `You are a GoHighLevel assistant for Smart Syndicator, a real estate syndication SaaS platform. You help Brandon interact with his GHL sub-account using plain English.

The default Location ID for all requests is: ${locationId}
Always include this as locationId (or location_id) in every request that requires it, unless the user specifies otherwise.

You can read and write data across the entire GHL platform:
- Contacts: search, view, create, update, add/remove tags, notes, tasks
- Conversations and Messages: search threads, read messages, send SMS and email
- Opportunities: view pipeline deals, create, update, change status
- Calendars: view appointments, check free slots, create bookings
- Email Templates: list, create, update HTML email templates
- Social Media: view accounts, schedule and publish posts
- Blog Posts: list, create, publish and update blog content
- Workflows: list active automation workflows
- Forms and Surveys: view forms and recent submissions
- Products and Payments: view products, orders, transactions, subscriptions
- Locations and Custom Fields: view and manage location settings and custom fields

How to respond:
- Present data in clear, readable summaries -- never dump raw JSON
- Use line breaks and indentation to organize lists of records
- For creates and updates, confirm what was done after the API call succeeds
- For DELETE operations, tell the user what will be deleted before calling the API
- Keep responses concise and direct
- When a result set is large, summarize and offer to filter further`;

  let current = messages.map(m => ({ role: m.role, content: m.content }));
  let finalText = '';

  try {
    for (let i = 0; i < 8; i++) {
      const resp = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system,
        tools:    [GHL_TOOL],
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
            result = await callGhlApi(method, endpoint, pathParams, queryParams, body);
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
