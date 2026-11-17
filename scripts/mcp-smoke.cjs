// Local smoke test for the MCP endpoint. Uses a throwaway key and a throwaway port.
// Usage: node scripts/mcp-smoke.cjs
const express = require('express');
const path = require('path');

const TEST_KEY = 'smoke-test-only-key-0123456789abcdef-xyz';
process.env.MCP_API_KEY = TEST_KEY;
delete process.env.STRIPE_SECRET_KEY; // proves the failure path is clean when Stripe is absent

// The rate limiter normally keeps its counts in Postgres; use memory so this test needs no database.
const storePath = require.resolve(path.join(__dirname, '..', 'server', 'lib', 'rateLimitStore'));
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { PgStore: function MemoryStore() { return new (require('express-rate-limit').MemoryStore)(); } } };

const app = express();
app.use(express.json());
app.use('/', require(path.join(__dirname, '..', 'server', 'routes', 'mcp')));

const server = app.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  let failed = 0;
  const check = async (label, body, key, expectStatus, expectText) => {
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = `Bearer ${key}`;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await r.text();
    const ok = r.status === expectStatus && (!expectText || text.includes(expectText));
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label} -> ${r.status} ${text.slice(0, 100).replace(/\s+/g, ' ')}`);
  };
  const call = (month) => ({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'calculate_texas_sales_tax', arguments: { month } } });

  await check('no key rejected', { jsonrpc: '2.0', id: 1, method: 'ping' }, null, 401);
  await check('wrong key rejected', { jsonrpc: '2.0', id: 1, method: 'ping' }, 'nope', 401);
  await check('initialize', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, TEST_KEY, 200, 'protocolVersion');
  await check('notification accepted', { jsonrpc: '2.0', method: 'notifications/initialized' }, TEST_KEY, 202);
  await check('tools/list', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, TEST_KEY, 200, 'calculate_texas_sales_tax');
  await check('bad month is a tool error', call('2026-13'), TEST_KEY, 200, '"isError":true');
  await check('unknown tool', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } }, TEST_KEY, 200, '-32602');
  await check('batch refused', [{ jsonrpc: '2.0', id: 1, method: 'ping' }], TEST_KEY, 400, 'Batch requests are not supported');
  await check('non-string month is a tool error', { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'calculate_texas_sales_tax', arguments: { month: ['2026-10'] } } }, TEST_KEY, 200, '"isError":true');
  await check('no Stripe fails cleanly', call('2026-10'), TEST_KEY, 200, 'Failed to calculate');

  process.env.MCP_API_KEY = 'too-short';
  await check('short key disables endpoint', { jsonrpc: '2.0', id: 1, method: 'ping' }, 'too-short', 404);
  server.close();
  process.exit(failed ? 1 : 0);
});
