/**
 * Integration status -- read-only health probes for every connected system.
 *
 * GET /api/status/integrations
 *   Returns a live snapshot of each integration's connectivity.
 *
 * Design notes:
 * - Each probe runs in parallel, is wrapped so it can never reject the request,
 *   and uses a short timeout. Unlike data-fetching calls (which retry 3x per the
 *   project standard), a status probe intentionally does NOT retry -- retrying
 *   would mask a real outage and make a "down" system look slow instead of down.
 * - Probes are read-only and cheap. Anthropic is config-only (we do not spend
 *   tokens to verify it); that probe is flagged liveChecked:false so the UI can
 *   footnote it honestly.
 */

const router = require('express').Router();
const Stripe = require('stripe');
const fetch = require('node-fetch');
const db = require('../lib/db');
const { getTokenCache } = require('../lib/digitsTokens');

const PROBE_TIMEOUT_MS = 6000;

function mk(key, name, category, status, detail, liveChecked = true) {
  return { key, name, category, status, detail, liveChecked };
}

// Run a fetch-based probe with an abort timeout.
async function timedFetch(url, options = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Wrap a probe so an unexpected throw degrades to a disconnected result.
async function safe(fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    return { ...fallback, status: 'disconnected', detail: err.message || 'Probe failed' };
  }
}

// -- Individual probes --

async function checkPostgres() {
  if (!process.env.DATABASE_URL) {
    return mk('postgres', 'Postgres', 'Infrastructure', 'not_configured', 'DATABASE_URL not set');
  }
  await db.query('SELECT 1');
  return mk('postgres', 'Postgres', 'Infrastructure', 'connected', 'Database responding');
}

async function checkStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return mk('stripe', 'Stripe', 'Billing', 'not_configured', 'STRIPE_SECRET_KEY not set');
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: PROBE_TIMEOUT_MS,
    maxNetworkRetries: 0,
  });
  const balance = await stripe.balance.retrieve();
  return mk('stripe', 'Stripe', 'Billing', 'connected', `${balance.livemode ? 'Live' : 'Test'} mode -- API reachable`);
}

function checkDigits() {
  const clientId = process.env.DIGITS_CLIENT_ID;
  let cache = null;
  try { cache = getTokenCache(); } catch { /* encryption key missing */ }

  const hasToken = !!(cache && cache.accessToken);
  if (!clientId && !hasToken) {
    return mk('digits', 'Digits', 'Accounting', 'not_configured', 'DIGITS_CLIENT_ID not set -- create the Digits app and add credentials', false);
  }
  if (!hasToken) {
    return mk('digits', 'Digits', 'Accounting', 'disconnected', 'OAuth not connected -- run the Digits connect flow', false);
  }
  if (Date.now() >= cache.expiresAt) {
    return mk('digits', 'Digits', 'Accounting', 'degraded', 'Access token expired -- will auto-refresh on next use', false);
  }
  return mk('digits', 'Digits', 'Accounting', 'connected', 'OAuth token valid', false);
}

async function checkMeta() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return mk('meta', 'Facebook Ads (Meta)', 'Advertising', 'not_configured', 'META_ACCESS_TOKEN not set');
  }
  const r = await timedFetch(`https://graph.facebook.com/v21.0/me?fields=name&access_token=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (data.error) {
    return mk('meta', 'Facebook Ads (Meta)', 'Advertising', 'disconnected', data.error.message);
  }
  if (!process.env.META_AD_ACCOUNT_ID) {
    return mk('meta', 'Facebook Ads (Meta)', 'Advertising', 'degraded', `Token valid as ${data.name || data.id}, but META_AD_ACCOUNT_ID not set`);
  }
  return mk('meta', 'Facebook Ads (Meta)', 'Advertising', 'connected', `Authenticated as ${data.name || data.id}`);
}

async function checkGhl() {
  const key = process.env.GHL_API_KEY;
  const loc = process.env.GHL_LOCATION_ID;
  if (!key) {
    return mk('ghl', 'GoHighLevel', 'CRM', 'not_configured', 'GHL_API_KEY not set');
  }
  const qs = new URLSearchParams({ ...(loc ? { locationId: loc } : {}), limit: '1' });
  const r = await timedFetch(`https://services.leadconnectorhq.com/contacts/?${qs}`, {
    headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', Accept: 'application/json' },
  });
  if (!r.ok) {
    return mk('ghl', 'GoHighLevel', 'CRM', 'disconnected', `API returned HTTP ${r.status}`);
  }
  await r.json();
  if (!loc) {
    return mk('ghl', 'GoHighLevel', 'CRM', 'degraded', 'API key valid, but GHL_LOCATION_ID not set');
  }
  return mk('ghl', 'GoHighLevel', 'CRM', 'connected', 'API key valid');
}

async function checkMake() {
  const key = process.env.MAKE_API_KEY;
  if (!key) {
    return mk('make', 'Make.com', 'Automation', 'not_configured', 'MAKE_API_KEY not set');
  }
  const zone = (process.env.MAKE_ZONE || 'us1').toLowerCase();
  const r = await timedFetch(`https://${zone}.make.com/api/v2/users/me`, {
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
  });
  if (!r.ok) {
    return mk('make', 'Make.com', 'Automation', 'disconnected', `API returned HTTP ${r.status}`);
  }
  await r.json();
  return mk('make', 'Make.com', 'Automation', 'connected', `Zone ${zone} -- API reachable`);
}

async function checkClickUp() {
  const key = process.env.CLICKUP_API_KEY;
  if (!key) {
    return mk('clickup', 'ClickUp', 'Project Management', 'not_configured', 'CLICKUP_API_KEY not set');
  }
  const r = await timedFetch('https://api.clickup.com/api/v2/user', {
    headers: { Authorization: key },
  });
  if (!r.ok) {
    return mk('clickup', 'ClickUp', 'Project Management', 'disconnected', `API returned HTTP ${r.status}`);
  }
  const data = await r.json();
  return mk('clickup', 'ClickUp', 'Project Management', 'connected', `Authenticated as ${data.user?.username || 'user'}`);
}

function checkAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return mk('anthropic', 'Anthropic (Claude)', 'AI', 'not_configured', 'ANTHROPIC_API_KEY not set', false);
  }
  // Config-only: we do not spend tokens on a live ping.
  return mk('anthropic', 'Anthropic (Claude)', 'AI', 'connected', 'API key configured -- powers the analyst and all agents', false);
}

// -- Route --

router.get('/status/integrations', async (req, res) => {
  const probes = [
    safe(checkPostgres,  mk('postgres',   'Postgres',              'Infrastructure',     'disconnected', '')),
    safe(checkStripe,    mk('stripe',     'Stripe',                'Billing',            'disconnected', '')),
    safe(checkDigits,    mk('digits',     'Digits',                'Accounting',         'disconnected', '', false)),
    safe(checkMeta,      mk('meta',       'Facebook Ads (Meta)',   'Advertising',        'disconnected', '')),
    safe(checkGhl,       mk('ghl',        'GoHighLevel',           'CRM',                'disconnected', '')),
    safe(checkMake,      mk('make',       'Make.com',              'Automation',         'disconnected', '')),
    safe(checkClickUp,   mk('clickup',    'ClickUp',               'Project Management', 'disconnected', '')),
    safe(checkAnthropic, mk('anthropic',  'Anthropic (Claude)',    'AI',                 'disconnected', '', false)),
  ];

  const integrations = await Promise.all(probes);
  const checkedAt = new Date().toISOString();

  const summary = integrations.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  res.json({ checkedAt, total: integrations.length, summary, integrations });
});

module.exports = router;
