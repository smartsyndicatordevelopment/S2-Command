// Tests for the Projects page additions: types and logo matching, favorites, the traffic box data and the Utilization numbers.
//   node scripts/test-projects-v2.cjs
// No network and no database: Cloudflare is a stand-in fetch and the database is an in-memory stand-in.
const assert = require('node:assert/strict');
const express = require('express');

let failed = 0;
const test = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); } };

// ---- stand-in database ----
const favoriteRows = [];
const cacheRows = new Map();
let failFavorites = false;
const dbPath = require.resolve('../server/lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query: async (sql, params = []) => {
    if (/project_favorites/.test(sql)) {
      if (failFavorites) throw new Error('relation "project_favorites" does not exist');
      if (/^SELECT/i.test(sql)) return { rows: favoriteRows.map((r) => ({ ...r })) };
      if (/^INSERT/i.test(sql)) { if (!favoriteRows.some((r) => r.kind === params[0] && r.name === params[1])) favoriteRows.push({ kind: params[0], name: params[1] }); return { rows: [] }; }
      if (/^DELETE/i.test(sql)) { const i = favoriteRows.findIndex((r) => r.kind === params[0] && r.name === params[1]); if (i >= 0) favoriteRows.splice(i, 1); return { rows: [] }; }
    }
    if (/hidden_projects/.test(sql)) return { rows: [] };
    if (/server_cache/.test(sql)) {
      if (/^SELECT/i.test(sql.trim())) { const hit = cacheRows.get(params[0]); return { rows: hit ? [hit] : [] }; }
      cacheRows.set(params[0], { data: JSON.parse(params[1]), computed_at: new Date() }); return { rows: [] };
    }
    if (/pg_database_size\(current_database/.test(sql)) return { rows: [{ name: 'demo_app', bytes: '1048576', version: 'PostgreSQL 17.2' }] };
    if (/FROM pg_database/.test(sql)) return { rows: [{ name: 'demo_app', bytes: '1048576' }, { name: 'other_app', bytes: '3145728' }] };
    if (/pg_total_relation_size/.test(sql)) return { rows: [{ name: 'chat_messages', bytes: '524288', rows: '-1' }] };
    if (/pg_stat_activity/.test(sql)) return { rows: [{ open: 7, max: 100 }] };
    return { rows: [] };
  },
} };

// ---- stand-in Cloudflare ----
const calls = [];
let graphqlError = null;
const realFetch = globalThis.fetch;
function cloudflareFetch(url, init = {}) {
  const u = String(url);
  if (!u.startsWith('https://api.cloudflare.com/')) return realFetch(url, init);
  const ok = (result) => Promise.resolve(new Response(JSON.stringify({ success: true, errors: [], result }), { status: 200 }));
  if (u.endsWith('/graphql')) {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (graphqlError) return Promise.resolve(new Response(JSON.stringify({ data: null, errors: [{ message: graphqlError }] }), { status: 200 }));
    const q = body.query;
    let rows = [];
    if (/kvStorage/.test(q)) rows = [{ dimensions: { namespaceId: 'kv1' }, max: { byteCount: 100, keyCount: 4 } }, { dimensions: { namespaceId: 'kv1' }, max: { byteCount: 300, keyCount: 9 } }];
    else if (/r2Storage/.test(q)) rows = [{ dimensions: { bucketName: 'media' }, max: { payloadSize: 5000, metadataSize: 10, objectCount: 3 } }, { dimensions: { bucketName: 'backups' }, max: { payloadSize: 900, metadataSize: 0, objectCount: 1 } }];
    else if (/d1Storage/.test(q)) rows = [{ dimensions: { databaseId: 'd1a' }, max: { databaseSizeBytes: 4096 } }];
    else if (/datetimeHour/.test(q)) rows = [{ dimensions: { datetimeHour: '2026-11-15T10:00:00Z' }, sum: { requests: 40, errors: 2 } }];
    else if (/dimensions\{date\}/.test(q)) rows = [{ dimensions: { date: '2026-11-14' }, sum: { requests: 500, errors: 5 } }];
    else if (/quantiles/.test(q)) rows = [{ sum: { requests: 40, errors: 2, subrequests: 90, cpuTimeUs: 80000 }, quantiles: { cpuTimeP50: 1500, cpuTimeP99: 42000, wallTimeP50: 60000 } }];
    else if (/sum\{cpuTimeUs\}/.test(q)) rows = [{ dimensions: { scriptName: 'big-app' }, sum: { cpuTimeUs: 9000000 } }, { dimensions: { scriptName: 'small-app' }, sum: { cpuTimeUs: 1000000 } }];
    else rows = [{ dimensions: { scriptName: 'small-app' }, sum: { requests: 100, errors: 1, subrequests: 5 } }, { dimensions: { scriptName: 'big-app' }, sum: { requests: 900, errors: 9, subrequests: 50 } }];
    return Promise.resolve(new Response(JSON.stringify({ data: { viewer: { accounts: [{ rows }] } }, errors: null }), { status: 200 }));
  }
  if (/kv\/namespaces/.test(u)) return ok([{ id: 'kv1', title: 'sessions' }]);
  if (/r2\/buckets/.test(u)) return ok({ buckets: [{ name: 'media' }, { name: 'backups' }] });
  if (/d1\/database/.test(u)) return ok([{ uuid: 'd1a', name: 'notes' }]);
  if (/hyperdrive/.test(u)) return ok([{ name: 'a' }, { name: 'b' }]);
  if (/queues/.test(u)) return Promise.resolve(new Response(JSON.stringify({ success: false, errors: [{ message: 'not allowed' }] }), { status: 403 }));
  return ok([]);
}
globalThis.fetch = cloudflareFetch;

(async () => {
  const types = require('../server/lib/projectTypes');
  const usage = require('../server/lib/cloudflareUsage');

  // ---- types and matching ----
  const folders = [
    { name: 'LeadSifter', logo: 'LeadSifter.svg' }, { name: 'ThriveMapper_3.0', logo: 'tm.png' }, { name: 'Fal.ai Bridge', logo: 'fal.svg' },
    { name: 'LeadSifter-wt-cloudflare', logo: null }, { name: 'InboxHelm', logo: 'ih.png' }, { name: 'InboxHelm-zoom-fix', logo: null },
    { name: 'DashComm Pro', logo: 'dc.png' }, { name: 'SOPs', logo: null }, { name: 'Mystery Thing', logo: null },
    { name: 'New Shop', logo: null, production: 'https://shop.example.com' }, { name: 'Pinned', logo: null, type: 'tool' }, { name: 'Bad Type', logo: null, type: 'nonsense' },
  ];
  await test('types: apps come first in the group order', () => {
    assert.deepEqual(types.TYPES.slice(0, 3).map((t) => t.id), ['app', 'local', 'site']);
    assert.ok(types.TYPES.every((t) => /^[A-Z]/.test(t.label)));
  });
  await test('types: folders are sorted by list, by copy rules, by types.txt and by fallback', () => {
    const out = Object.fromEntries(types.decorateFolders(folders, []).map((f) => [f.name, f.type]));
    assert.equal(out.LeadSifter, 'app');
    assert.equal(out['DashComm Pro'], 'local');
    assert.equal(out['Fal.ai Bridge'], 'service');
    assert.equal(out.SOPs, 'workspace');
    assert.equal(out['LeadSifter-wt-cloudflare'], 'copy');
    assert.equal(out['InboxHelm-zoom-fix'], 'copy');
    assert.equal(out['New Shop'], 'app', 'a folder with a production address is an app');
    assert.equal(out['Mystery Thing'], 'other');
    assert.equal(out.Pinned, 'tool', 'types.txt wins');
    assert.equal(out['Bad Type'], 'other', 'an unknown type from types.txt is ignored');
  });
  const cfProjects = [
    { kind: 'worker', name: 'lead-sifter', requests24h: 50 }, { kind: 'worker', name: 'lead-sifter-dev', requests24h: 900 },
    { kind: 'worker', name: 'thrivemapper', requests24h: 5 }, { kind: 'worker', name: 'fal-bridge', requests24h: 1 },
    { kind: 'worker', name: 'ferretbooks-site', requests24h: 1 }, { kind: 'worker', name: 'verclipped-mcp', requests24h: 1 },
    { kind: 'pages', name: 'ls-o12-s34', requests24h: 0 }, { kind: 'worker', name: 'inboxhelm', requests24h: 10 }, { kind: 'worker', name: 'unknown-thing', requests24h: 0 },
  ];
  await test('types: Cloudflare projects get a type, their folder and its logo', () => {
    const out = Object.fromEntries(types.decorateCloudflare(cfProjects, folders).map((p) => [p.name, p]));
    assert.deepEqual([out['lead-sifter'].type, out['lead-sifter'].folder, out['lead-sifter'].logo], ['app', 'LeadSifter', 'LeadSifter.svg']);
    assert.deepEqual([out['lead-sifter-dev'].type, out['lead-sifter-dev'].folder], ['dev', 'LeadSifter']);
    assert.equal(out.thrivemapper.folder, 'ThriveMapper_3.0', 'a version number in the folder name is ignored');
    assert.deepEqual([out['fal-bridge'].type, out['fal-bridge'].folder], ['service', 'Fal.ai Bridge']);
    assert.equal(out['ferretbooks-site'].type, 'site');
    assert.equal(out['verclipped-mcp'].type, 'service');
    assert.equal(out['ls-o12-s34'].type, 'hosted');
    assert.deepEqual([out['unknown-thing'].type, out['unknown-thing'].folder, out['unknown-thing'].logo], ['app', null, null]);
  });
  await test('types: a folder is linked to its live Worker, never to a dev copy, and copies get none', () => {
    const out = Object.fromEntries(types.decorateFolders(folders, cfProjects).map((f) => [f.name, f.worker]));
    assert.equal(out.LeadSifter, 'lead-sifter');
    assert.equal(out.InboxHelm, 'inboxhelm');
    assert.equal(out['LeadSifter-wt-cloudflare'], null);
    assert.equal(out.SOPs, null);
  });

  // ---- usage ----
  await test('usage: slots are filled with zeros where Cloudflare sent nothing', () => {
    const now = Date.parse('2026-11-15T10:30:00Z');
    const hours = usage.hourSlots(24, now);
    assert.equal(hours.length, 24);
    assert.equal(hours[23], '2026-11-15T10:00:00Z');
    const filled = usage.fillSlots(hours, [{ dimensions: { datetimeHour: '2026-11-15T10:00:00Z' }, sum: { requests: 7, errors: 1 } }], 'datetimeHour');
    assert.deepEqual(filled[23], { t: '2026-11-15T10:00:00Z', requests: 7, errors: 1 });
    assert.deepEqual(filled[0], { t: hours[0], requests: 0, errors: 0 });
    assert.deepEqual(usage.daySlots(14, now).slice(-1), ['2026-11-15']);
  });
  await test('usage: one Worker gives 24 hours, 14 days and totals in milliseconds', async () => {
    const r = await usage.buildUsage({ token: 't', accountId: 'acct', kind: 'worker', name: 'big-app', now: Date.parse('2026-11-15T10:30:00Z') });
    assert.equal(r.available, true);
    assert.equal(r.hours.length, 24);
    assert.equal(r.days.length, 14);
    assert.equal(r.hours[23].requests, 40);
    assert.equal(r.days.find((d) => d.t === '2026-11-14').requests, 500);
    assert.deepEqual(r.totals, { requests: 40, errors: 2, subrequests: 90, cpuP50Ms: 1.5, cpuP99Ms: 42, wallP50Ms: 60 });
    assert.deepEqual(r.warnings, []);
  });
  await test('usage: the project name travels as a variable, never inside the query text', async () => {
    calls.length = 0;
    await usage.buildUsage({ token: 't', accountId: 'acct', kind: 'worker', name: 'big-app' });
    assert.ok(calls.length >= 3);
    for (const c of calls) { assert.ok(!c.query.includes('big-app')); assert.ok(!c.query.includes('acct')); assert.equal(c.variables.n, 'big-app'); assert.equal(c.variables.a, 'acct'); }
  });
  await test('usage: a Cloudflare error becomes warnings and zeros, not a crash', async () => {
    graphqlError = 'dataset not available';
    const r = await usage.buildUsage({ token: 't', accountId: 'acct', kind: 'worker', name: 'big-app' });
    graphqlError = null;
    assert.equal(r.available, true);
    assert.equal(r.totals.requests, 0);
    assert.equal(r.totals.cpuP50Ms, null);
    assert.equal(r.warnings.length, 3);
  });
  await test('usage: Pages projects say plainly that there are no numbers', async () => {
    const r = await usage.buildUsage({ token: 't', accountId: 'acct', kind: 'pages', name: 'some-site' });
    assert.equal(r.available, false);
    assert.match(r.reason, /Pages/);
  });

  // ---- utilization ----
  await test('utilization: month totals, busiest list and storage add up', async () => {
    const r = await usage.buildCloudflareUtilization({ token: 't', accountId: 'acct', now: Date.parse('2026-11-15T10:30:00Z') });
    assert.equal(r.monthStart, '2026-11-01T00:00:00.000Z');
    assert.deepEqual(r.month.total, { requests: 1000, errors: 10, subrequests: 55, cpuMs: 10000 });
    assert.deepEqual(r.month.busiest.map((w) => w.name), ['big-app', 'small-app']);
    assert.equal(r.month.busiest[0].cpuMs, 9000);
    assert.deepEqual(r.storage.kv, { bytes: 300, keys: 9, items: [{ name: 'sessions', bytes: 300 }] }, 'repeated rows keep the largest value, not the sum');
    assert.equal(r.storage.r2.bytes, 5910);
    assert.equal(r.storage.r2.objects, 4);
    assert.deepEqual(r.storage.r2.items.map((b) => b.name), ['media', 'backups']);
    assert.deepEqual(r.storage.d1, { bytes: 4096, items: [{ name: 'notes', bytes: 4096 }] });
    assert.equal(r.counts.hyperdrive, 2);
    assert.equal(r.counts.queues, 0);
    assert.ok(r.warnings.some((w) => /queues/.test(w)), 'a list the token may not read is reported, not hidden');
    assert.equal(r.plan.allowance.requestsPerMonth, 10000000);
  });
  await test('utilization: database sizes come back as numbers', async () => {
    const { query } = require('../server/lib/db');
    const r = await usage.buildPlanetScaleUtilization({ query });
    assert.equal(r.configured, true);
    assert.deepEqual(r.database, { name: 'demo_app', bytes: 1048576, version: 'PostgreSQL 17.2' });
    assert.equal(r.cluster.totalBytes, 4194304);
    assert.equal(r.cluster.limitBytes, null);
    assert.deepEqual(r.tables, [{ name: 'chat_messages', bytes: 524288, rows: 0 }]);
    assert.deepEqual(r.connections, { open: 7, max: 100 });
    assert.deepEqual(r.api, { configured: false });
  });

  // ---- routes ----
  delete process.env.CF_API_TOKEN; delete process.env.CF_ACCOUNT_ID;
  const app = express();
  app.use(express.json());
  app.use('/api', require('../server/routes/projects'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, json: await r.json() }; };
  const put = async (p, body) => { const r = await fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };

  await test('route: starring a folder shows on the catalog, and unstarring removes it', async () => {
    const name = (await get('/api/projects/catalog')).json.projects[0].name;
    assert.equal((await put('/api/projects/favorite', { kind: 'folder', name, favorite: true })).status, 200);
    let c = (await get('/api/projects/catalog')).json;
    assert.equal(c.projects.find((p) => p.name === name).favorite, true);
    assert.equal(c.projects.filter((p) => p.favorite).length, 1);
    assert.ok(Array.isArray(c.types) && c.types[0].id === 'app');
    assert.ok(c.projects.every((p) => typeof p.type === 'string'));
    assert.ok(!('planHtml' in c), 'the consolidation plan page is gone');
    assert.equal((await put('/api/projects/favorite', { kind: 'folder', name, favorite: false })).status, 200);
    c = (await get('/api/projects/catalog')).json;
    assert.equal(c.projects.filter((p) => p.favorite).length, 0);
  });
  await test('route: bad favorite requests are refused and nothing is saved', async () => {
    assert.equal((await put('/api/projects/favorite', { kind: 'bogus', name: 'x', favorite: true })).status, 400);
    assert.equal((await put('/api/projects/favorite', { kind: 'worker', name: '', favorite: true })).status, 400);
    assert.equal((await put('/api/projects/favorite', { kind: 'worker', name: 'x' })).status, 400);
    assert.equal((await put('/api/projects/favorite', { kind: 'worker', name: 'x'.repeat(201), favorite: true })).status, 400);
    assert.deepEqual(favoriteRows, []);
  });
  await test('route: the catalog still loads when the favorites table is missing', async () => {
    failFavorites = true;
    const r = await get('/api/projects/catalog');
    failFavorites = false;
    assert.equal(r.status, 200);
    assert.ok(r.json.projects.length > 0);
  });
  await test('route: usage refuses odd names and says so when no token is set', async () => {
    assert.equal((await get('/api/projects/usage?kind=worker&name=' + encodeURIComponent('a"b'))).status, 400);
    assert.equal((await get('/api/projects/usage?kind=nope&name=abc')).status, 400);
    assert.equal((await get('/api/projects/usage?kind=worker')).status, 400);
    const r = await get('/api/projects/usage?kind=worker&name=abc');
    assert.equal(r.status, 200);
    assert.equal(r.json.available, false);
  });
  await test('route: with a token, usage is fetched once and then served from the cache', async () => {
    process.env.CF_API_TOKEN = 't'; process.env.CF_ACCOUNT_ID = 'acct';
    calls.length = 0;
    const a = await get('/api/projects/usage?kind=worker&name=big-app');
    assert.equal(a.json.cached, false);
    const n = calls.length;
    const b = await get('/api/projects/usage?kind=worker&name=big-app');
    assert.equal(b.json.cached, true);
    assert.equal(calls.length, n, 'the second read must not call Cloudflare');
    assert.equal(b.json.totals.requests, 40);
  });
  await test('route: utilization reports Cloudflare and the database together', async () => {
    const r = await get('/api/utilization');
    assert.equal(r.status, 200);
    assert.equal(r.json.cloudflare.configured, true);
    assert.equal(r.json.cloudflare.month.total.requests, 1000);
    assert.equal(r.json.planetscale.database.name, 'demo_app');
    assert.ok(!JSON.stringify(r.json).includes('"t"'), 'the token is not in the answer');
  });

  server.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  setTimeout(() => process.exit(failed ? 1 : 0), 200);
})();
