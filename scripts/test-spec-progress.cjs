// Spec progress matching: node scripts/test-spec-progress.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'server', 'data', 'spec-progress.json');
const original = fs.readFileSync(file, 'utf8');
let failed = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (err) { failed++; console.log(`FAIL ${name}: ${err.message}`); }
}

try {
  fs.writeFileSync(file, JSON.stringify({
    generatedAt: '2026-11-20T00:00:00Z',
    apps: [
      { name: 'Test App', aliases: ['test-app-worker'], percent: 42.4, done: 21, total: 50, summary: 'x' },
      { name: 'Broken', percent: 'n/a' },
      { name: 'Over', percent: 140 },
    ],
  }));
  const { applySpecProgress } = require('../server/lib/specProgress');
  const out = applySpecProgress({ projects: [{ name: 'test-app-dev' }, { name: 'Test-App-Worker' }, { name: 'broken' }, { name: 'over' }, { name: 'other' }] }).projects;
  check('matches by name, alias and a dev suffix', () => {
    assert.equal(out[0].specProgress.percent, 42);
    assert.equal(out[1].specProgress.percent, 42);
  });
  check('an entry without a number is ignored', () => assert.equal(out[2].specProgress, undefined));
  check('a percent over 100 is capped', () => assert.equal(out[3].specProgress.percent, 100));
  check('a project with no result is left alone', () => assert.equal(out[4].specProgress, undefined));
  check('a missing file changes nothing', () => {
    fs.unlinkSync(file);
    const data = { projects: [{ name: 'x' }] };
    assert.deepEqual(applySpecProgress(data), data);
  });
} finally {
  fs.writeFileSync(file, original);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
