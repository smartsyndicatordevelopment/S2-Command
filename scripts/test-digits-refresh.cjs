// Tests the Digits token refresh lock on the LOCAL test database (s2_node) with a stubbed Digits server. No real keys.
// Expected: several requests that find an expired token at the same moment cause exactly ONE refresh call, and all of them
// get the new token; the new token is stored encrypted in the database.
//   node scripts/test-digits-refresh.cjs
process.env.DATABASE_URL = 'postgresql://frost:frost@127.0.0.1:5433/s2_node';
process.env.ENCRYPTION_KEY = '0'.repeat(64);
process.env.DIGITS_CLIENT_ID = 'test-client';
process.env.DIGITS_CLIENT_SECRET = 'test-secret';

const Module = require('node:module');
let refreshCalls = 0;
const fakeFetch = async (url, opts) => {
  refreshCalls++;
  await new Promise((r) => setTimeout(r, 300)); // the other requests arrive while this one is in flight
  const body = JSON.parse(opts.body);
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: `new-access-${refreshCalls}`, refresh_token: `rotated-from-${body.refresh_token}`, expires_in: 3600 }),
    text: async () => '',
  };
};
// Make `require('node-fetch')` inside digitsTokens return the stub.
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'node-fetch') return fakeFetch;
  return origLoad.call(this, request, ...rest);
};

const db = require('../server/lib/db');
const tokens = require('../server/lib/digitsTokens');

(async () => {
  await db.runMigrations();
  await db.query('DELETE FROM digits_tokens');
  // Seed an expired token row, encrypted the way the app does it, through the app's own setTokens.
  await tokens.setTokens({ accessToken: 'old-access', refreshToken: 'refresh-1', businessId: 'biz-1', expiresAt: 1 });

  // Simulate several app copies: each starts with its own stale in-memory cache read from the database.
  const results = await Promise.all([1, 2, 3, 4].map(() => tokens.getToken()));
  const distinct = [...new Set(results)];
  const row = (await db.query('SELECT expires_at FROM digits_tokens WHERE id = 1')).rows[0];
  const raw = (await db.query('SELECT access_token FROM digits_tokens WHERE id = 1')).rows[0].access_token;

  const checks = [
    ['exactly one refresh call', refreshCalls === 1, `calls=${refreshCalls}`],
    ['all four callers got the same new token', distinct.length === 1 && distinct[0] === 'new-access-1', `tokens=${distinct.join(',')}`],
    ['new expiry stored in the database', Number(row.expires_at) > Date.now(), ''],
    ['stored token is encrypted, not plain text', !raw.includes('new-access'), ''],
  ];
  let bad = 0;
  for (const [name, ok, extra] of checks) {
    console.log(ok ? 'PASS' : 'FAIL', name, extra);
    if (!ok) bad++;
  }
  await db.query('DELETE FROM digits_tokens');
  await db.getPool().end();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
