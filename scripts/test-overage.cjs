// Utilization overage estimate: node scripts/test-overage.cjs
const assert = require('node:assert/strict');
const { estimateOverage, PAID_ALLOWANCE, OVERAGE_RATES } = require('../server/lib/cloudflareUsage');

const GB = 1024 ** 3;
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (err) { failed++; console.log(`FAIL ${name}: ${err.message}`); }
}

check('under every included amount costs nothing', () => {
  const o = estimateOverage({ requests: 1e6, cpuMs: 5e6, r2Bytes: 2 * GB, d1Bytes: 1 * GB, kvBytes: 0 });
  assert.equal(o.totalUsd, 0);
  for (const k of Object.keys(o.items)) { assert.equal(o.items[k].over, 0); assert.equal(o.items[k].usd, 0); }
});

check('exactly at an included amount is not over', () => {
  const o = estimateOverage({ requests: PAID_ALLOWANCE.requestsPerMonth, cpuMs: PAID_ALLOWANCE.cpuMsPerMonth, r2Bytes: PAID_ALLOWANCE.r2Bytes });
  assert.equal(o.totalUsd, 0);
});

check('processor time over: 13.1M ms extra at the listed rate', () => {
  const o = estimateOverage({ cpuMs: 43.1e6 });
  assert.equal(o.items.cpu.over, 13.1e6);
  assert.equal(o.items.cpu.usd, Math.round(13.1 * OVERAGE_RATES.cpuMsPerMillion * 100) / 100);
});

check('file storage over: 206 GB is 196 GB extra', () => {
  const o = estimateOverage({ r2Bytes: 206 * GB });
  assert.equal(o.items.r2.over, 196 * GB);
  assert.equal(o.items.r2.usd, Math.round(196 * OVERAGE_RATES.r2PerGb * 100) / 100);
});

check('the total adds the items', () => {
  const o = estimateOverage({ requests: 12e6, cpuMs: 43.1e6, r2Bytes: 206 * GB });
  const sum = o.items.requests.usd + o.items.cpu.usd + o.items.r2.usd + o.items.d1.usd + o.items.kv.usd;
  assert.ok(Math.abs(o.totalUsd - sum) < 0.011, `${o.totalUsd} vs ${sum}`);
  assert.ok(o.totalUsd > 0);
});

check('missing or bad numbers count as zero, never NaN', () => {
  const o = estimateOverage({ requests: NaN, cpuMs: undefined, r2Bytes: null });
  assert.equal(o.totalUsd, 0);
  assert.ok(Object.values(o.items).every((i) => Number.isFinite(i.usd) && Number.isFinite(i.over)));
});

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
