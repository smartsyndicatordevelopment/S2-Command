// Local smoke test for the MCP endpoint. Uses a throwaway key and a throwaway port.
// Usage: node scripts/mcp-smoke.cjs
const express = require('express');
const path = require('path');

const TEST_KEY = 'smoke-test-only';
process.env.MCP_API_KEY = TEST_KEY;
delete process.env.STRIPE_SECRET_KEY; // proves the failure path is clean when Stripe is absent

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
  await check('no Stripe fails cleanly', call('2026-10'), TEST_KEY, 200, 'Failed to calculate');

  server.close();
  process.exit(failed ? 1 : 0);
});
