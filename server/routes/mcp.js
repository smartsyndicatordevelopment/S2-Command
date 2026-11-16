// Minimal MCP server (Streamable HTTP, JSON responses, stateless) exposing the
// Texas sales tax calculator, so a skill or any MCP client can call it.
//
// Auth: a bearer key in MCP_API_KEY (Worker secret / env var). The endpoint is
// OFF (404) when the key is not set. The key is compared in constant time.
// Mounted BEFORE the /api session gate because MCP clients have no browser login.
const router = require('express').Router();
const crypto = require('node:crypto');
const { calculateSalesTax, SalesTaxInputError } = require('../lib/salesTaxCalc');

const PROTOCOL_VERSION = '2025-03-26';

const TOOLS = [
  {
    name: 'calculate_texas_sales_tax',
    description:
      'Calculates Texas sales and use tax owed for one calendar month from live Stripe charges. ' +
      'Returns taxable Texas revenue, the 8.25% tax due, and counts of Texas, out-of-state, ' +
      'unknown-state and excluded charges. Charges with no state on file are listed as unknown ' +
      'and are NOT included in the tax due: review them before filing. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'Month to calculate, formatted YYYY-MM (for example 2026-10).' },
        include_transactions: {
          type: 'boolean',
          description: 'Also return every charge grouped as Texas, other, unknown and excluded. Default false (summary plus unknown and excluded lists only).',
        },
      },
      required: ['month'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

function keyMatches(provided) {
  const expected = process.env.MCP_API_KEY;
  if (!expected || !provided) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function callTool(name, args) {
  if (name !== 'calculate_texas_sales_tax') {
    return { error: { code: -32602, message: `Unknown tool: ${name}` } };
  }
  const month = args && args.month;
  try {
    const result = await calculateSalesTax(month);
    const full = args && args.include_transactions === true;
    const payload = full
      ? result
      : {
          month: result.month,
          period: result.period,
          summary: result.summary,
          unknownTransactions: result.unknownTransactions,
          excludedTransactions: result.excludedTransactions,
        };
    return { result: { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: false } };
  } catch (err) {
    if (err instanceof SalesTaxInputError) {
      return { result: { content: [{ type: 'text', text: err.message }], isError: true } };
    }
    console.error('MCP sales tax error:', err.message);
    return { result: { content: [{ type: 'text', text: 'Failed to calculate sales tax. Check that Stripe is configured and try again.' }], isError: true } };
  }
}

async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg && msg.id, -32600, 'Invalid request');
  }
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize':
      return {
        jsonrpc: '2.0', id: msg.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 's2-command', version: '1.0.0' },
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id: msg.id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } };
    case 'tools/call': {
      const out = await callTool(msg.params && msg.params.name, msg.params && msg.params.arguments);
      if (out.error) return { jsonrpc: '2.0', id: msg.id, error: out.error };
      return { jsonrpc: '2.0', id: msg.id, result: out.result };
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

router.post('/mcp', async (req, res) => {
  if (!process.env.MCP_API_KEY) return res.status(404).json({ error: 'Not found' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!keyMatches(token)) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const body = req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handle(body);
    return out ? res.json(out) : res.status(202).end();
  } catch (err) {
    console.error('MCP handler error:', err.message);
    return res.status(500).json(rpcError(null, -32603, 'Internal error'));
  }
});

// This server does not stream, so GET (SSE) and DELETE (sessions) are not offered.
router.all('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());

module.exports = router;
