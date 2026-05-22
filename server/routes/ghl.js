const router = require('express').Router();
const fs     = require('fs');
const path   = require('path');
const fetch  = require('node-fetch');

const CONFIG_PATH = path.join(__dirname, '../../sessions/ghl-config.json');
const GHL_BASE    = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { apiKey: '', locationId: '' }; }
}

function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

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
  const cfg = readConfig();
  res.json({
    hasKey:     !!cfg.apiKey,
    keyPreview: cfg.apiKey ? `...${cfg.apiKey.slice(-6)}` : null,
    locationId: cfg.locationId || '',
  });
});

// POST /api/ghl/config
router.post('/ghl/config', (req, res) => {
  const { apiKey, locationId } = req.body;
  const existing = readConfig();
  writeConfig({
    apiKey:     typeof apiKey     === 'string' ? (apiKey     || existing.apiKey)     : existing.apiKey,
    locationId: typeof locationId === 'string' ? (locationId || existing.locationId) : existing.locationId,
  });
  res.json({ ok: true });
});

// DELETE /api/ghl/config (clear key)
router.delete('/ghl/config', (req, res) => {
  writeConfig({ apiKey: '', locationId: '' });
  res.json({ ok: true });
});

// POST /api/ghl/proxy -- proxies any GHL API call through the server
router.post('/ghl/proxy', async (req, res) => {
  const { method = 'GET', endpoint, pathParams = {}, queryParams = {}, body } = req.body;

  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

  const cfg = readConfig();
  if (!cfg.apiKey) return res.status(400).json({ error: 'No GHL API key configured. Add your key in the GHL MCP tab.' });

  // Build URL -- replace {param} placeholders
  let url = `${GHL_BASE}${endpoint}`;
  for (const [k, v] of Object.entries(pathParams)) {
    if (v !== undefined && v !== '') url = url.replace(`{${k}}`, encodeURIComponent(String(v)));
  }

  // Build query string
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  }
  if (qs.toString()) url += `?${qs.toString()}`;

  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
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
      let data;
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await r.json();
      } else {
        data = { raw: await r.text() };
      }
      return { status: r.status, data };
    });
    res.json({ status, data, url });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
