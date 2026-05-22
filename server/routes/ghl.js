const router = require('express').Router();
const fetch  = require('node-fetch');

const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// GET /api/ghl/config
router.get('/ghl/config', (req, res) => {
  const key = process.env.GHL_API_KEY || '';
  res.json({
    hasKey:     !!key,
    keyPreview: key ? `...${key.slice(-6)}` : null,
    locationId: process.env.GHL_LOCATION_ID || '',
    source:     'env',
  });
});

// POST /api/ghl/proxy
router.post('/ghl/proxy', async (req, res) => {
  const { method = 'GET', endpoint, pathParams = {}, queryParams = {}, body } = req.body;

  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'GHL_API_KEY environment variable is not set on the server.' });

  let url = `${GHL_BASE}${endpoint}`;
  for (const [k, v] of Object.entries(pathParams)) {
    if (v !== undefined && v !== '') url = url.replace(`{${k}}`, encodeURIComponent(String(v)));
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  if (qs.toString()) url += `?${qs.toString()}`;

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version':       GHL_VERSION,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
  };

  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  try {
    const { status, data } = await withRetry(async () => {
      const r = await fetch(url, opts);
      const ct = r.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await r.json() : { raw: await r.text() };
      return { status: r.status, data };
    });
    res.json({ status, data, url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
