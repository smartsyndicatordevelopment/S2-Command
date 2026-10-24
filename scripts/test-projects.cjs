// Tests for the Projects page logic.
//   node scripts/test-projects.cjs            unit tests only (no network)
//   node scripts/test-projects.cjs --live     also runs the real report against the Cloudflare account and prints it
//                                             (needs the read-only token in ~/.config/s2-projects/cf-read-token.txt)
const assert = require('node:assert/strict');
const { classify, pickPrimary, hostOfRoute, summarize, applyHidden } = require('../server/lib/cloudflareProjects');

let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
};
const up = { ok: true, status: 200, latencyMs: 300 };

test('answers fast with no errors is healthy', () => {
  assert.equal(classify({ hasPublicUrl: true, probe: up, requests: 1000, errors: 0 }).status, 'healthy');
});
test('a protected app answering 401 or 403 is healthy', () => {
  assert.equal(classify({ hasPublicUrl: true, probe: { ok: true, status: 401, latencyMs: 200 }, requests: 50, errors: 0 }).status, 'healthy');
});
test('a 5xx answer is down', () => {
  const r = classify({ hasPublicUrl: true, probe: { ok: false, status: 502, latencyMs: 400 } });
  assert.equal(r.status, 'down');
  assert.match(r.reason, /HTTP 502/);
});
test('no connection is down with its reason', () => {
  const r = classify({ hasPublicUrl: true, probe: { ok: false, status: 0, error: 'Could not connect' } });
  assert.equal(r.status, 'down');
  assert.equal(r.reason, 'Could not connect');
});
test('slow answer is degraded', () => {
  const r = classify({ hasPublicUrl: true, probe: { ok: true, status: 200, latencyMs: 3200 }, requests: 10, errors: 0 });
  assert.equal(r.status, 'degraded');
  assert.match(r.reason, /Slow/);
});
test('5% or more of requests failing is degraded', () => {
  const r = classify({ hasPublicUrl: true, probe: up, requests: 200, errors: 12 });
  assert.equal(r.status, 'degraded');
  assert.match(r.reason, /12 of 200/);
});
test('4% failing is still healthy', () => {
  assert.equal(classify({ hasPublicUrl: true, probe: up, requests: 200, errors: 8 }).status, 'healthy');
});
test('a few errors on very low traffic do not trigger a percentage', () => {
  assert.equal(classify({ hasPublicUrl: true, probe: up, requests: 4, errors: 2 }).status, 'healthy');
});
test('five errors on low traffic is degraded', () => {
  assert.equal(classify({ hasPublicUrl: true, probe: up, requests: 12, errors: 5 }).status, 'degraded');
});
test('no public address and no traffic is inactive', () => {
  assert.equal(classify({ hasPublicUrl: false, probe: null, requests: 0, errors: 0 }).status, 'inactive');
});
test('no public address but healthy traffic is healthy', () => {
  assert.equal(classify({ hasPublicUrl: false, probe: null, requests: 500, errors: 0 }).status, 'healthy');
});
test('no public address and many errors is degraded', () => {
  assert.equal(classify({ hasPublicUrl: false, probe: null, requests: 100, errors: 30 }).status, 'degraded');
});
test('route host extraction', () => {
  assert.equal(hostOfRoute('App.Example.com/*'), 'app.example.com');
  assert.equal(hostOfRoute('*.example.com/*'), null);
  assert.equal(hostOfRoute(''), null);
});
test('primary address prefers production over staging and www', () => {
  assert.equal(pickPrimary(['staging.frostfm.com', 'www.frostfm.com', 'frostfm.com', 'app.frostfm.com']), 'frostfm.com');
  assert.equal(pickPrimary(['preview.automatewithbrandon.com', 'automatewithbrandon.com']), 'automatewithbrandon.com');
  assert.equal(pickPrimary(['staging.inboxhelm.com']), 'staging.inboxhelm.com');
  assert.equal(pickPrimary([]), null);
});
test('summary counts add up', () => {
  const s = summarize([
    { status: 'healthy', requests24h: 10, errors24h: 1 }, { status: 'down', requests24h: 0, errors24h: 0 },
    { status: 'inactive', requests24h: 0, errors24h: 0 }, { status: 'degraded', requests24h: 5, errors24h: 5 },
  ]);
  assert.deepEqual([s.total, s.active, s.inactive, s.healthy, s.degraded, s.down, s.requests24h, s.errors24h], [4, 3, 1, 1, 1, 1, 15, 6]);
});

test('hiding removes a project from the totals but keeps it in the list, flagged', () => {
  const projects = [
    { kind: 'worker', name: 'a', status: 'healthy', requests24h: 10, errors24h: 0 },
    { kind: 'worker', name: 'b', status: 'down', requests24h: 5, errors24h: 5 },
    { kind: 'pages', name: 'b', status: 'healthy', requests24h: 1, errors24h: 0 },
  ];
  const r = applyHidden({ configured: true, projects, summary: summarize(projects) }, new Set(['worker:b']));
  assert.equal(r.projects.length, 3);
  assert.deepEqual(r.projects.map((p) => p.hidden), [false, true, false]);
  assert.equal(r.summary.down, 0);
  assert.equal(r.summary.healthy, 2);
  assert.equal(r.summary.hidden, 1);
  assert.equal(r.summary.requests24h, 11);
});

(async () => {
  if (process.argv.includes('--live')) {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const token = fs.readFileSync(path.join(os.homedir(), '.config', 's2-projects', 'cf-read-token.txt'), 'utf8').trim();
    const { buildReport } = require('../server/lib/cloudflareProjects');
    const t0 = Date.now();
    const r = await buildReport({ token, accountId: '1f8a493845a44c1c695cde23d2e468f2', selfHost: 'command.smartsyndicator.com' });
    console.log(`\nLIVE report built in ${((Date.now() - t0) / 1000).toFixed(1)} s; warnings: ${r.warnings.length ? r.warnings.join(' | ') : 'none'}`);
    console.log('summary:', JSON.stringify(r.summary));
    for (const p of r.projects) {
      console.log(`${p.status.padEnd(9)} ${p.name.padEnd(24)} ${(p.url || '(no public address)').padEnd(44)} ${String(p.httpStatus ?? '-').padEnd(4)} ${p.latencyMs != null ? p.latencyMs + 'ms' : '-'}`.padEnd(100),
        `req24h=${p.requests24h} err=${p.errors24h} deployed=${(p.lastDeployedAt || '').slice(0, 16)}${p.triggers.length ? ' [' + p.triggers.join(',') + ']' : ''}  ${p.status === 'healthy' ? '' : '<- ' + p.reason}`);
    }
    // Sanity checks on the real data.
    test('live: this app is in the list and answers', () => {
      const me = r.projects.find((p) => p.name === 's2-command');
      assert.ok(me, 's2-command missing');
      assert.equal(me.status, 'healthy');
      assert.equal(me.url, 'https://command.smartsyndicator.com');
    });
    test('live: every project has a status and a last-deploy time', () => {
      for (const p of r.projects) { assert.ok(['healthy', 'degraded', 'down', 'inactive'].includes(p.status), p.name); assert.ok(p.lastDeployedAt, p.name + ' has no deploy time'); }
    });
    test('live: sorted worst first', () => {
      const order = { down: 0, degraded: 1, healthy: 2, inactive: 3 };
      for (let i = 1; i < r.projects.length; i++) assert.ok(order[r.projects[i - 1].status] <= order[r.projects[i].status]);
    });
  }
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
