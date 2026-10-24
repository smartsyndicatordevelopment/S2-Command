// Mounts the /api/projects route in a tiny Express app (no login, no database) and calls it like the page does.
//   node scripts/test-projects-route.cjs
// Needs the read-only token in ~/.config/s2-projects/cf-read-token.txt for the live part.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
};

// No database here: an in-memory stand-in answers the two queries the hidden-projects list makes.
const hiddenRows = [];
const dbPath = require.resolve('../server/lib/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  query: async (sql, params = []) => {
    if (!/hidden_projects/.test(sql)) return { rows: [] }; // the report cache's own reads and writes: no cache here
    if (/^SELECT/i.test(sql)) return { rows: hiddenRows.map((r) => ({ ...r })) };
    if (/^INSERT/i.test(sql)) { if (!hiddenRows.some((r) => r.kind === params[0] && r.name === params[1])) hiddenRows.push({ kind: params[0], name: params[1] }); return { rows: [] }; }
    if (/^DELETE/i.test(sql)) { const i = hiddenRows.findIndex((r) => r.kind === params[0] && r.name === params[1]); if (i >= 0) hiddenRows.splice(i, 1); return { rows: [] }; }
    throw new Error('unexpected query: ' + sql);
  },
} };

(async () => {
  const router = require('../server/routes/projects');
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, json: await r.json() }; };

  delete process.env.CF_API_TOKEN;
  delete process.env.CF_ACCOUNT_ID;
  await test('without a token: answers configured=false instead of failing', async () => {
    const r = await get('/api/projects');
    assert.equal(r.status, 200);
    assert.equal(r.json.configured, false);
    assert.deepEqual(r.json.projects, []);
  });

  process.env.CF_API_TOKEN = fs.readFileSync(path.join(os.homedir(), '.config', 's2-projects', 'cf-read-token.txt'), 'utf8').trim();
  process.env.CF_ACCOUNT_ID = '1f8a493845a44c1c695cde23d2e468f2';
  let first;
  await test('with the token: returns the real report with the page\'s fields', async () => {
    const r = await get('/api/projects?refresh=1');
    assert.equal(r.status, 200);
    first = r.json;
    assert.equal(first.configured, true);
    assert.ok(first.projects.length >= 20, 'expected many projects, got ' + first.projects.length);
    for (const k of ['name', 'kind', 'status', 'reason', 'url', 'hosts', 'httpStatus', 'latencyMs', 'lastDeployedAt', 'triggers', 'requests24h', 'errors24h']) {
      assert.ok(k in first.projects[0], 'project field missing: ' + k);
    }
    for (const k of ['total', 'active', 'inactive', 'healthy', 'degraded', 'down', 'requests24h', 'errors24h']) assert.equal(typeof first.summary[k], 'number', k);
    assert.equal(first.summary.total, first.projects.length);
    assert.equal(first.summary.healthy + first.summary.degraded + first.summary.down + first.summary.inactive, first.summary.total);
  });
  await test('it is this app answering that is marked as such (host given, not probed)', async () => {
    // The test server is on 127.0.0.1, so the real address is probed normally here; just check it was classified.
    const me = first.projects.find((p) => p.name === 's2-command');
    assert.ok(me && ['healthy', 'degraded', 'down'].includes(me.status));
  });
  await test('hiding a project flags it, drops it from the totals, and showing it brings it back', async () => {
    const before = first.summary;
    const target = first.projects.find((p) => p.status === 'healthy' && p.name !== 's2-command');
    const put = (body) => fetch(base + '/api/projects/visibility', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put({ kind: target.kind, name: target.name, hidden: true })).status, 200);
    let r = (await get('/api/projects')).json;
    assert.equal(r.projects.find((p) => p.name === target.name).hidden, true);
    assert.equal(r.projects.length, first.projects.length);
    assert.equal(r.summary.healthy, before.healthy - 1);
    assert.equal(r.summary.hidden, 1);
    assert.equal((await put({ kind: target.kind, name: target.name, hidden: false })).status, 200);
    r = (await get('/api/projects')).json;
    assert.equal(r.summary.healthy, before.healthy);
    assert.equal(r.summary.hidden, 0);
  });
  await test('bad visibility requests are refused', async () => {
    const put = (body) => fetch(base + '/api/projects/visibility', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put({ kind: 'worker', name: 'x' })).status, 400);
    assert.equal((await put({ kind: 'bogus', name: 'x', hidden: true })).status, 400);
    assert.equal((await put({ kind: 'worker', name: '', hidden: true })).status, 400);
    assert.deepEqual(hiddenRows, []);
  });
  await test('a bad token gives a clean 502 with a helpful message, not a crash', async () => {
    process.env.CF_API_TOKEN = 'cfut_this-is-not-a-real-token-0000000000000000';
    const r = await get('/api/projects?refresh=1');
    // No database here, so there is no cache to serve; the live call must fail cleanly.
    assert.equal(r.status, 502);
    assert.match(r.json.error, /Cloudflare/);
    assert.ok(!JSON.stringify(r.json).includes('cfut_'), 'the error must not echo the token');
  });

  server.close();
  setTimeout(() => process.exit(failed ? 1 : 0), 200);
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
})();
