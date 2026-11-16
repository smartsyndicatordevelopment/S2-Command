/**
 * Traffic and usage numbers for the Projects page (hover dashboard) and the Utilization tab.
 *
 * Everything is read with the same READ-ONLY Cloudflare token as the health report (secret CF_API_TOKEN, variable CF_ACCOUNT_ID)
 * through Cloudflare's GraphQL analytics. Each query is separate and wrapped, so one dataset that is unavailable shows up as a
 * warning instead of blanking the page. Names are always sent as GraphQL variables, never pasted into the query text.
 */
const cache = require('./metricsCache');
const { cf, CloudflareError, getProjects } = require('./cloudflareProjects');

const USAGE_TTL_MS = 5 * 60 * 1000;
const UTIL_TTL_MS = 10 * 60 * 1000;
const MIN_REFRESH_MS = 30 * 1000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;

async function gql(token, accountId, text, variables) {
  const r = await cf('/graphql', token, { method: 'POST', body: JSON.stringify({ query: text, variables: { a: accountId, ...variables } }) });
  if (r.errors?.length) throw new CloudflareError(r.errors[0].message);
  return r.data?.viewer?.accounts?.[0] || {};
}

const num = (x) => (Number.isFinite(x) ? x : 0);
const ms = (us) => (us == null ? null : Math.round((us / 1000) * 10) / 10); // microseconds to milliseconds, one decimal

/** The last `count` whole hours ending now, as ISO strings on the hour. */
function hourSlots(count, now = Date.now()) {
  const end = Math.floor(now / HOUR) * HOUR;
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * HOUR).toISOString().replace('.000Z', 'Z'));
}
function daySlots(count, now = Date.now()) {
  const end = Math.floor(now / DAY) * DAY;
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * DAY).toISOString().slice(0, 10));
}

/** Pure: puts query rows into a fixed list of slots (a slot with no traffic is zero, because Cloudflare omits empty hours). */
function fillSlots(slots, rows, dimension) {
  const byKey = new Map(rows.map((r) => [String(r.dimensions?.[dimension] || '').replace('.000Z', 'Z'), r.sum || {}]));
  return slots.map((t) => ({ t, requests: num(byKey.get(t)?.requests), errors: num(byKey.get(t)?.errors) }));
}

/**
 * Traffic for one Worker: 24 hourly points, 14 daily points, and the 24-hour totals with speed figures.
 * Pages projects have no per-project analytics, so they answer { available: false }.
 */
async function buildUsage({ token, accountId, kind, name, now = Date.now() }) {
  if (kind === 'pages') return { available: false, reason: 'Cloudflare does not publish traffic numbers per Pages project here.' };
  const warnings = [];
  const safe = async (label, fn, fallback) => { try { return await fn(); } catch (e) { warnings.push(`${label}: ${e.message}`); return fallback; } };
  const since = new Date(now - 24 * HOUR).toISOString();
  const sinceDay = new Date(now - 13 * DAY).toISOString().slice(0, 10);

  const [hourly, daily, totals] = await Promise.all([
    safe('hourly traffic', async () => (await gql(token, accountId,
      'query($a:String!,$n:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){rows:workersInvocationsAdaptive(limit:100,filter:{scriptName:$n,datetime_geq:$s}){dimensions{datetimeHour} sum{requests errors}}}}}',
      { n: name, s: since })).rows || [], []),
    safe('daily traffic', async () => (await gql(token, accountId,
      'query($a:String!,$n:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){rows:workersInvocationsAdaptive(limit:100,filter:{scriptName:$n,date_geq:$d}){dimensions{date} sum{requests errors}}}}}',
      { n: name, d: sinceDay })).rows || [], []),
    safe('speed', async () => (await gql(token, accountId,
      'query($a:String!,$n:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){rows:workersInvocationsAdaptive(limit:1,filter:{scriptName:$n,datetime_geq:$s}){sum{requests errors subrequests cpuTimeUs} quantiles{cpuTimeP50 cpuTimeP99 wallTimeP50}}}}}',
      { n: name, s: since })).rows?.[0] || null, null),
  ]);

  const hours = fillSlots(hourSlots(24, now), hourly, 'datetimeHour');
  const days = fillSlots(daySlots(14, now), daily, 'date');
  const requests = totals ? num(totals.sum?.requests) : hours.reduce((n, h) => n + h.requests, 0);
  const errors = totals ? num(totals.sum?.errors) : hours.reduce((n, h) => n + h.errors, 0);
  return {
    available: true,
    generatedAt: new Date(now).toISOString(),
    hours, days,
    totals: {
      requests, errors,
      subrequests: num(totals?.sum?.subrequests),
      cpuP50Ms: ms(totals?.quantiles?.cpuTimeP50),
      cpuP99Ms: ms(totals?.quantiles?.cpuTimeP99),
      wallP50Ms: ms(totals?.quantiles?.wallTimeP50),
    },
    warnings,
  };
}

/** Cached traffic for one project. Throws an error starting with "bad " for a name that is not accepted. */
async function getProjectUsage({ kind, name, force = false } = {}) {
  if (!['worker', 'pages'].includes(kind)) throw new Error('bad kind');
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new Error('bad name');
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  if (!token || !accountId) return { available: false, configured: false, reason: 'No Cloudflare token is set on this copy of the app.' };
  const cacheKey = `cloudflare:usage:${kind}:${name}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    const age = Date.now() - new Date(cached.computedAt).getTime();
    if (age < (force ? MIN_REFRESH_MS : USAGE_TTL_MS)) return { ...cached.data, cached: true };
  }
  const report = await buildUsage({ token, accountId, kind, name });
  await cache.set(cacheKey, report);
  return { ...report, cached: false };
}

// ---------- Utilization ----------

// What the Workers Paid plan includes each month. The page assumes this plan because the read-only token cannot read billing.
const PAID_ALLOWANCE = {
  requestsPerMonth: 10_000_000,
  cpuMsPerMonth: 30_000_000,
  kvBytes: 1 * 1024 ** 3,
  r2Bytes: 10 * 1024 ** 3,
  d1Bytes: 5 * 1024 ** 3,
};

function monthStart(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** Pure: totals plus the busiest Workers from the month-to-date rows. */
function summarizeMonth(rows, cpuRows) {
  const by = new Map();
  for (const r of rows) {
    const n = r.dimensions?.scriptName;
    const t = by.get(n) || { name: n, requests: 0, errors: 0, subrequests: 0, cpuMs: 0 };
    t.requests += num(r.sum?.requests); t.errors += num(r.sum?.errors); t.subrequests += num(r.sum?.subrequests);
    by.set(n, t);
  }
  for (const r of cpuRows) {
    const t = by.get(r.dimensions?.scriptName);
    if (t) t.cpuMs += num(r.sum?.cpuTimeUs) / 1000;
  }
  const list = [...by.values()].sort((a, b) => b.requests - a.requests);
  const total = list.reduce((s, w) => ({ requests: s.requests + w.requests, errors: s.errors + w.errors, subrequests: s.subrequests + w.subrequests, cpuMs: s.cpuMs + w.cpuMs }), { requests: 0, errors: 0, subrequests: 0, cpuMs: 0 });
  total.cpuMs = Math.round(total.cpuMs);
  return { total, busiest: list.slice(0, 8).map((w) => ({ ...w, cpuMs: Math.round(w.cpuMs) })) };
}

async function buildCloudflareUtilization({ token, accountId, now = Date.now() }) {
  const warnings = [];
  const safe = async (label, fn, fallback) => { try { return await fn(); } catch (e) { warnings.push(`${label}: ${e.message}`); return fallback; } };
  const start = monthStart(now);
  const day2 = new Date(now - 3 * DAY).toISOString().slice(0, 10);
  const since = new Date(now - 2 * DAY).toISOString();
  const list = (path, pick) => safe(path.split('/').pop(), async () => pick((await cf(path, token)).result), []);

  const [monthRows, cpuRows, kvNs, r2Buckets, d1Dbs, hyperdrive, queues, kvStore, r2Store, d1Store, report] = await Promise.all([
    safe('requests this month', async () => (await gql(token, accountId,
      'query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){rows:workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$s}){dimensions{scriptName} sum{requests errors subrequests}}}}}', { s: start })).rows || [], []),
    safe('CPU time this month', async () => (await gql(token, accountId,
      'query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){rows:workersInvocationsAdaptive(limit:10000,filter:{datetime_geq:$s}){dimensions{scriptName} sum{cpuTimeUs}}}}}', { s: start })).rows || [], []),
    list(`/accounts/${accountId}/storage/kv/namespaces`, (r) => r || []),
    list(`/accounts/${accountId}/r2/buckets`, (r) => r?.buckets || []),
    list(`/accounts/${accountId}/d1/database`, (r) => r || []),
    list(`/accounts/${accountId}/hyperdrive/configs`, (r) => r || []),
    list(`/accounts/${accountId}/queues`, (r) => r || []),
    safe('KV storage', async () => (await gql(token, accountId,
      'query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){rows:kvStorageAdaptiveGroups(limit:1000,filter:{date_geq:$d}){dimensions{namespaceId} max{byteCount keyCount}}}}}', { d: day2 })).rows || [], []),
    safe('R2 storage', async () => (await gql(token, accountId,
      'query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){rows:r2StorageAdaptiveGroups(limit:1000,filter:{datetime_geq:$s}){dimensions{bucketName} max{payloadSize metadataSize objectCount}}}}}', { s: since })).rows || [], []),
    safe('D1 storage', async () => (await gql(token, accountId,
      'query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){rows:d1StorageAdaptiveGroups(limit:1000,filter:{datetime_geq:$s}){dimensions{databaseId} max{databaseSizeBytes}}}}}', { s: since })).rows || [], []),
    safe('project list', () => getProjects(), null),
  ]);

  // Storage rows repeat per day or per hour; keep the largest value seen for each item.
  const maxBy = (rows, idKey, valueOf) => {
    const m = new Map();
    for (const r of rows) { const id = r.dimensions?.[idKey]; m.set(id, Math.max(m.get(id) || 0, valueOf(r.max || {}))); }
    return m;
  };
  const kvBytes = maxBy(kvStore, 'namespaceId', (x) => num(x.byteCount));
  const kvKeys = maxBy(kvStore, 'namespaceId', (x) => num(x.keyCount));
  const r2Bytes = maxBy(r2Store, 'bucketName', (x) => num(x.payloadSize) + num(x.metadataSize));
  const r2Objects = maxBy(r2Store, 'bucketName', (x) => num(x.objectCount));
  const d1Bytes = maxBy(d1Store, 'databaseId', (x) => num(x.databaseSizeBytes));

  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const top = (items) => items.sort((a, b) => b.bytes - a.bytes).slice(0, 6);
  const month = summarizeMonth(monthRows, cpuRows);
  return {
    configured: true,
    plan: { name: process.env.CF_PLAN_NAME || null, assumed: 'Workers Paid', allowance: PAID_ALLOWANCE },
    monthStart: start,
    month,
    storage: {
      kv: { bytes: sum(kvBytes), keys: sum(kvKeys), items: top(kvNs.map((n) => ({ name: n.title, bytes: kvBytes.get(n.id) || 0 }))) },
      r2: { bytes: sum(r2Bytes), objects: sum(r2Objects), items: top(r2Buckets.map((b) => ({ name: b.name, bytes: r2Bytes.get(b.name) || 0, objects: r2Objects.get(b.name) || 0 }))) },
      d1: { bytes: sum(d1Bytes), items: top(d1Dbs.map((d) => ({ name: d.name, bytes: d1Bytes.get(d.uuid) || 0 }))) },
    },
    counts: {
      workers: report ? report.projects.filter((p) => p.kind === 'worker').length : null,
      pages: report ? report.projects.filter((p) => p.kind === 'pages').length : null,
      hyperdrive: hyperdrive.length, kv: kvNs.length, r2: r2Buckets.length, d1: d1Dbs.length, queues: queues.length,
    },
    warnings,
  };
}

// PlanetScale: sizes come from the database itself (works with the app's own login, no extra key), and the plan details come
// from PlanetScale's API when a service token is set (PLANETSCALE_ORG, PLANETSCALE_SERVICE_TOKEN_ID, PLANETSCALE_SERVICE_TOKEN).
async function buildPlanetScaleUtilization({ query }) {
  const warnings = [];
  const safe = async (label, fn, fallback) => { try { return await fn(); } catch (e) { warnings.push(`${label}: ${e.message}`); return fallback; } };
  const [me, cluster, tables, conns] = await Promise.all([
    safe('database size', async () => (await query('SELECT current_database() AS name, pg_database_size(current_database())::bigint AS bytes, split_part(version(), \' on \', 1) AS version')).rows[0], null),
    safe('cluster sizes', async () => (await query('SELECT datname AS name, pg_database_size(datname)::bigint AS bytes FROM pg_database WHERE NOT datistemplate AND datallowconn AND has_database_privilege(datname, \'CONNECT\') ORDER BY 2 DESC')).rows, []),
    safe('table sizes', async () => (await query('SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes, c.reltuples::bigint AS rows FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = \'public\' AND c.relkind = \'r\' ORDER BY 2 DESC LIMIT 8')).rows, []),
    safe('connections', async () => (await query('SELECT (SELECT count(*) FROM pg_stat_activity)::int AS open, current_setting(\'max_connections\')::int AS max')).rows[0], null),
  ]);

  let api = { configured: false };
  const org = process.env.PLANETSCALE_ORG;
  const tid = process.env.PLANETSCALE_SERVICE_TOKEN_ID;
  const tok = process.env.PLANETSCALE_SERVICE_TOKEN;
  if (org && tid && tok) {
    api = await safe('PlanetScale API', async () => {
      const res = await fetch(`https://api.planetscale.com/v1/organizations/${encodeURIComponent(org)}/databases?per_page=100`, {
        headers: { Authorization: `${tid}:${tok}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return {
        configured: true,
        databases: (json.data || []).slice(0, 30).map((d) => ({
          name: d.name, kind: d.kind || null, state: d.state || null, plan: d.plan || null,
          region: d.region?.display_name || d.region?.slug || null, size: d.cluster_name || d.cluster_size || null,
        })),
      };
    }, { configured: true, databases: [] });
  }
  const limitGb = Number(process.env.PLANETSCALE_STORAGE_LIMIT_GB);
  return {
    configured: !!me,
    database: me ? { name: me.name, bytes: Number(me.bytes), version: me.version } : null,
    cluster: { databases: cluster.map((d) => ({ name: d.name, bytes: Number(d.bytes) })), totalBytes: cluster.reduce((n, d) => n + Number(d.bytes), 0), limitBytes: limitGb > 0 ? limitGb * 1024 ** 3 : null },
    tables: tables.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Math.max(0, Number(t.rows)) })),
    connections: conns ? { open: conns.open, max: conns.max } : null,
    api,
    warnings,
  };
}

async function getUtilization({ force = false } = {}) {
  const key = 'utilization:v1';
  const cached = await cache.get(key);
  if (cached) {
    const age = Date.now() - new Date(cached.computedAt).getTime();
    if (age < (force ? MIN_REFRESH_MS : UTIL_TTL_MS)) return { ...cached.data, cached: true };
  }
  const token = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const { query } = require('./db');
  const [cloudflare, planetscale] = await Promise.all([
    token && accountId ? buildCloudflareUtilization({ token, accountId }).catch((e) => ({ configured: true, error: e.message })) : { configured: false },
    buildPlanetScaleUtilization({ query }).catch((e) => ({ configured: false, error: e.message })),
  ]);
  const report = { generatedAt: new Date().toISOString(), cloudflare, planetscale };
  await cache.set(key, report);
  return { ...report, cached: false };
}

module.exports = { getProjectUsage, getUtilization, buildUsage, buildCloudflareUtilization, buildPlanetScaleUtilization, summarizeMonth, fillSlots, hourSlots, daySlots, monthStart, PAID_ALLOWANCE, NAME_RE };
