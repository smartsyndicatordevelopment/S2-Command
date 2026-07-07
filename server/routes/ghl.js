const router = require('express').Router();
const fetch  = require('node-fetch');
const metricsCache = require('../lib/metricsCache');

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

// ─── Reusable read helper + cached computations ───────────────────────────────

async function ghlGet(endpoint, queryParams = {}) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!apiKey) throw new Error('GHL_API_KEY not configured');
  const qs = new URLSearchParams(Object.fromEntries(
    Object.entries({ locationId, ...queryParams }).filter(([, v]) => v != null && v !== '')
  ));
  return withRetry(async () => {
    const r = await fetch(`${GHL_BASE}${endpoint}?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Accept: 'application/json' },
    });
    if (!r.ok && r.status !== 200) throw new Error(`GHL API ${r.status} for ${endpoint}`);
    return r.json();
  });
}

// Pipeline: opportunity count, total value, and per-stage breakdown.
async function computeGhlPipeline() {
  const data = await ghlGet('/opportunities/search', { limit: '100' });
  const opps = data.opportunities || [];
  const byStage = {};
  let totalValue = 0;
  for (const opp of opps) {
    const stage = opp.pipelineStageId || 'Unknown';
    const stageName = opp.pipelineStageName || opp.pipelineStageId || 'Unknown';
    if (!byStage[stage]) byStage[stage] = { name: stageName, count: 0, value: 0 };
    byStage[stage].count++;
    byStage[stage].value += parseFloat(opp.monetaryValue || 0);
    totalValue += parseFloat(opp.monetaryValue || 0);
  }
  return {
    totalOpportunities: opps.length,
    totalPipelineValue: totalValue,
    byStage: Object.values(byStage).sort((a, b) => b.count - a.count),
  };
}

// Contacts: total count.
async function computeGhlContacts() {
  let totalContacts = null;
  try {
    const allData = await ghlGet('/contacts/', { limit: '1' });
    totalContacts = allData.meta?.total ?? allData.total ?? null;
  } catch (err) {
    console.error('computeGhlContacts error:', err.message);
  }
  return { totalContacts, recentContacts30d: null };
}

// Cache-first reader: serve from server_cache, fall back to a live compute + store.
function cachedReader(cacheKey, compute) {
  return async (req, res) => {
    try {
      const cached = await metricsCache.get(cacheKey);
      if (cached) return res.json({ ...cached.data, cachedAt: cached.computedAt });
      const data = await compute();
      await metricsCache.set(cacheKey, data);
      res.json(data);
    } catch (err) {
      console.error(`GHL ${cacheKey} error:`, err.message);
      res.status(500).json({ error: `Failed to fetch ${cacheKey}` });
    }
  };
}

router.get('/ghl/pipeline', cachedReader('ghl:pipeline', computeGhlPipeline));
router.get('/ghl/contacts', cachedReader('ghl:contacts', computeGhlContacts));

// GET /api/ghl/config
router.get('/ghl/config', (req, res) => {
  res.json({
    hasKey:        !!process.env.GHL_API_KEY,
    hasLocationId: !!process.env.GHL_LOCATION_ID,
    source:        'env',
  });
});

const ALLOWED_GHL_PREFIXES = [
  '/contacts', '/conversations', '/opportunities', '/calendars', '/locations',
  '/users', '/workflows', '/campaigns', '/forms', '/surveys', '/emails',
  '/social-media-posting', '/blogs', '/products', '/payments', '/medias',
  '/companies', '/funnels', '/links', '/snapshots',
];

// POST /api/ghl/proxy
router.post('/ghl/proxy', async (req, res) => {
  const { method = 'GET', endpoint, pathParams = {}, queryParams = {}, body } = req.body;

  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  if (!ALLOWED_GHL_PREFIXES.some(p => endpoint.startsWith(p))) {
    return res.status(400).json({ error: 'endpoint not allowed' });
  }

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
// Exported so the sync runner / metricsCache can warm these in the background.
module.exports.computeGhlPipeline = computeGhlPipeline;
module.exports.computeGhlContacts = computeGhlContacts;
