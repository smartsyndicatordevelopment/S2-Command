/**
 * Cloudflare project health for the Projects page.
 *
 * Reads the Cloudflare account with a READ-ONLY API token (secret CF_API_TOKEN, plus CF_ACCOUNT_ID) and, for every Worker (and
 * Pages project, if the account has any), works out:
 *   - its public address (custom domain, else route host),
 *   - whether that address answers right now (a short GET with a timeout),
 *   - last deploy time and how it was deployed,
 *   - requests and errors over the last 24 hours (Workers analytics),
 * then classifies it healthy / degraded / down, or inactive when it has no public address and no traffic.
 *
 * The result is cached in server_cache for a few minutes so opening the page does not re-probe every site each time.
 */
const cache = require('./metricsCache');
const { query } = require('./db');

const API = 'https://api.cloudflare.com/client/v4';
const CACHE_KEY = 'cloudflare:projects';
const CACHE_TTL_MS = 5 * 60 * 1000;     // a cached result is served for this long
const MIN_REFRESH_MS = 30 * 1000;       // a manual refresh is ignored if the data is fresher than this
const PROBE_TIMEOUT_MS = 6000;
const SLOW_MS = 2500;                    // slower than this counts as degraded
const PROBE_CONCURRENCY = 6;
const MIN_REQUESTS_FOR_RATE = 20;        // below this many requests an error percentage is too noisy to judge
const DEGRADED_ERROR_RATE = 0.05;

class CloudflareError extends Error {}

async function cf(path, token, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !json || json.success === false) {
    const detail = json?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new CloudflareError(`Cloudflare API ${path.split('?')[0]}: ${detail}`);
  }
  return json;
}

// Runs fn over items with at most `limit` in flight; results keep the input order.
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

// "app.example.com/*" -> "app.example.com". Wildcard hosts cannot be probed, so they return null.
function hostOfRoute(pattern) {
  const host = String(pattern || '').split('/')[0];
  return host && !host.includes('*') ? host.toLowerCase() : null;
}

// Prefer a production-looking address over staging/preview ones, then the shortest (usually the apex or "app.").
function pickPrimary(hosts) {
  if (!hosts.length) return null;
  const score = (h) => (/(^|\.)(staging|preview|dev|test)\./.test(h) || /^(staging|preview|dev|test)\./.test(h) ? 1000 : 0) + (h.startsWith('www.') ? 100 : 0) + h.length;
  return [...hosts].sort((a, b) => score(a) - score(b))[0];
}

async function probe(host, selfHost) {
  const checkedAt = new Date().toISOString();
  if (selfHost && host === selfHost) {
    // This very request is being answered by that address, so it is up by definition (and probing yourself can loop).
    return { ok: true, self: true, status: 200, latencyMs: null, checkedAt };
  }
  const started = Date.now();
  try {
    const res = await fetch(`https://${host}/`, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': 'S2-Command-Health-Check/1.0' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    try { await res.body?.cancel(); } catch { /* ignore */ }
    // Anything below 500 means the site answered (a 401 or 403 from a protected app is a healthy answer).
    return { ok: res.status < 500, status: res.status, latencyMs, checkedAt };
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, status: 0, latencyMs: Date.now() - started, checkedAt, error: timedOut ? `No answer within ${PROBE_TIMEOUT_MS / 1000} s` : 'Could not connect' };
  }
}

function pct(x) { return `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`; }

// Pure: turns the facts about one project into { status, reason }. status is one of
// healthy | degraded | down | inactive.
function classify({ hasPublicUrl, probe: p, requests = 0, errors = 0 }) {
  const rate = requests >= MIN_REQUESTS_FOR_RATE ? errors / requests : null;
  const manyErrors = rate != null ? rate >= DEGRADED_ERROR_RATE : errors >= 5;
  const errorNote = `${errors} of ${requests} requests failed (${requests ? pct(errors / requests) : '0%'}) in the last 24 hours`;

  if (!hasPublicUrl) {
    if (!requests) return { status: 'inactive', reason: 'No public address and no traffic in the last 24 hours' };
    return manyErrors ? { status: 'degraded', reason: errorNote } : { status: 'healthy', reason: 'No public address; judged by its traffic' };
  }
  if (!p || !p.ok) {
    const why = p?.error || (p?.status ? `Last check returned HTTP ${p.status}` : 'Did not answer');
    return { status: 'down', reason: why };
  }
  if (manyErrors) return { status: 'degraded', reason: errorNote };
  if (p.latencyMs != null && p.latencyMs > SLOW_MS) return { status: 'degraded', reason: `Slow: answered in ${(p.latencyMs / 1000).toFixed(1)} s` };
  return { status: 'healthy', reason: 'Answering normally' };
}

const SEVERITY = { down: 0, degraded: 1, healthy: 2, inactive: 3 };

function summarize(projects) {
  const count = (s) => projects.filter((p) => p.status === s).length;
  const active = projects.filter((p) => p.status !== 'inactive');
  return {
    total: projects.length,
    active: active.length,
    inactive: count('inactive'),
    healthy: count('healthy'),
    degraded: count('degraded'),
    down: count('down'),
    requests24h: projects.reduce((n, p) => n + (p.requests24h || 0), 0),
    errors24h: projects.reduce((n, p) => n + (p.errors24h || 0), 0),
  };
}

async function buildReport({ token, accountId, selfHost }) {
  const warnings = [];
  const safe = async (label, fn, fallback) => {
    try { return await fn(); } catch (err) { warnings.push(`${label}: ${err.message}`); return fallback; }
  };

  const [scripts, domains, zones, pagesProjects] = await Promise.all([
    cf(`/accounts/${accountId}/workers/scripts`, token).then((r) => r.result || []),
    safe('custom domains', () => cf(`/accounts/${accountId}/workers/domains`, token).then((r) => r.result || []), []),
    safe('zones', () => cf('/zones?per_page=50', token).then((r) => r.result || []), []),
    safe('pages projects', () => cf(`/accounts/${accountId}/pages/projects`, token).then((r) => r.result || []), []),
  ]);

  // Routes live on each zone.
  const routes = (await pool(zones, 5, (z) =>
    safe(`routes for ${z.name}`, () => cf(`/zones/${z.id}/workers/routes`, token).then((r) => r.result || []), []))).flat();

  // Requests and errors per Worker over the last 24 hours.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const analytics = await safe('traffic analytics', async () => {
    const query = `query { viewer { accounts(filter: {accountTag: "${accountId}"}) {
      workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: "${since}"}) { dimensions { scriptName } sum { requests errors } } } } }`;
    const r = await cf('/graphql', token, { method: 'POST', body: JSON.stringify({ query }) });
    if (r.errors?.length) throw new CloudflareError(r.errors[0].message);
    return r.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];
  }, []);
  const traffic = new Map();
  for (const row of analytics) {
    const name = row.dimensions?.scriptName;
    const t = traffic.get(name) || { requests: 0, errors: 0 };
    t.requests += row.sum?.requests || 0;
    t.errors += row.sum?.errors || 0;
    traffic.set(name, t);
  }

  const hostsByScript = new Map();
  const addHost = (script, host) => {
    if (!script || !host) return;
    if (!hostsByScript.has(script)) hostsByScript.set(script, new Set());
    hostsByScript.get(script).add(host);
  };
  for (const d of domains) addHost(d.service, String(d.hostname || '').toLowerCase());
  for (const r of routes) addHost(r.script, hostOfRoute(r.pattern));

  const items = [
    ...scripts.map((s) => ({
      kind: 'worker',
      name: s.id,
      hosts: [...(hostsByScript.get(s.id) || [])],
      lastDeployedAt: s.modified_on || s.created_on || null,
      deployedVia: s.last_deployed_from || null,
      triggers: (s.handlers || []).filter((h) => h !== 'fetch'),
      requests24h: traffic.get(s.id)?.requests || 0,
      errors24h: traffic.get(s.id)?.errors || 0,
    })),
    ...pagesProjects.map((p) => ({
      kind: 'pages',
      name: p.name,
      hosts: (p.domains || []).map((d) => String(d).toLowerCase()),
      lastDeployedAt: p.latest_deployment?.created_on || null,
      deployedVia: p.latest_deployment?.deployment_trigger?.type || null,
      triggers: [],
      requests24h: 0,
      errors24h: 0,
      pagesStatus: p.latest_deployment?.latest_stage?.status || null,
    })),
  ];

  const projects = await pool(items, PROBE_CONCURRENCY, async (item) => {
    const primary = pickPrimary(item.hosts);
    const p = primary ? await probe(primary, selfHost) : null;
    let { status, reason } = classify({ hasPublicUrl: !!primary, probe: p, requests: item.requests24h, errors: item.errors24h });
    if (item.kind === 'pages' && item.pagesStatus === 'failure' && status === 'healthy') {
      status = 'degraded';
      reason = 'The latest deployment failed (the site is still serving the previous one)';
    }
    return {
      name: item.name,
      kind: item.kind,
      status,
      reason,
      url: primary ? `https://${primary}` : null,
      hosts: item.hosts,
      httpStatus: p ? p.status : null,
      latencyMs: p ? p.latencyMs : null,
      checkedAt: p ? p.checkedAt : null,
      lastDeployedAt: item.lastDeployedAt,
      deployedVia: item.deployedVia,
      triggers: item.triggers,
      requests24h: item.requests24h,
      errors24h: item.errors24h,
    };
  });

  projects.sort((a, b) => (SEVERITY[a.status] - SEVERITY[b.status]) || a.name.localeCompare(b.name));
  return { configured: true, generatedAt: new Date().toISOString(), summary: summarize(projects), projects, warnings };
}

/**
 * Returns the report, from the cache when it is fresh. `force` re-checks everything unless the data is under 30 s old.
 */
async function getProjects({ force = false, selfHost = null } = {}) {
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!token || !accountId) {
    return { configured: false, generatedAt: null, summary: summarize([]), projects: [], warnings: [] };
  }
  const cached = await cache.get(CACHE_KEY);
  if (cached) {
    const age = Date.now() - new Date(cached.computedAt).getTime();
    if (age < (force ? MIN_REFRESH_MS : CACHE_TTL_MS)) return { ...cached.data, cached: true, ageSeconds: Math.round(age / 1000) };
  }
  const report = await buildReport({ token, accountId, selfHost });
  await cache.set(CACHE_KEY, report);
  return { ...report, cached: false, ageSeconds: 0 };
}

const key = (p) => `${p.kind}:${p.name}`;

/** Names the owner chose to hide, as "kind:name" strings. */
async function getHiddenKeys() {
  const { rows } = await query('SELECT kind, name FROM hidden_projects');
  return new Set(rows.map(key));
}

/** Show or hide one project. Only a "worker" or "pages" project with a plain name is accepted. */
async function setHidden({ kind, name, hidden }) {
  if (!['worker', 'pages'].includes(kind)) throw new Error('bad kind');
  if (typeof name !== 'string' || !name || name.length > 200) throw new Error('bad name');
  if (hidden) {
    await query('INSERT INTO hidden_projects (kind, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kind, name]);
  } else {
    await query('DELETE FROM hidden_projects WHERE kind = $1 AND name = $2', [kind, name]);
  }
}

/**
 * Marks each project hidden or not, and counts only the visible ones in the summary (the totals on the page are about what
 * you chose to see). Hidden projects stay in the list, flagged, so they can be shown again.
 */
function applyHidden(report, hiddenKeys) {
  const projects = report.projects.map((p) => ({ ...p, hidden: hiddenKeys.has(key(p)) }));
  const summary = summarize(projects.filter((p) => !p.hidden));
  summary.hidden = projects.filter((p) => p.hidden).length;
  return { ...report, projects, summary };
}

module.exports = { getProjects, getHiddenKeys, setHidden, applyHidden, buildReport, classify, pickPrimary, hostOfRoute, summarize, CloudflareError };
