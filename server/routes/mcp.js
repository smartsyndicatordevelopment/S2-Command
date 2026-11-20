// Minimal MCP server (Streamable HTTP, JSON responses, stateless) exposing the
// Texas sales tax calculator, so a skill or any MCP client can call it.
//
// Auth: a bearer key in MCP_API_KEY (Worker secret / env var). The endpoint is
// OFF (404) when the key is not set or is shorter than 32 characters. The key is
// compared in constant time.
// Mounted in app.js BEFORE the global body parser and the browser-session gate:
// MCP clients have no browser login, and an unauthenticated caller must not make the
// server parse a large body. This router has its own small parser, run after the key check.
const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const { PgStore } = require('../lib/rateLimitStore');
const { calculateSalesTax, SalesTaxInputError } = require('../lib/salesTaxCalc');

const router = express.Router();
const MIN_KEY_LENGTH = 32;

// Fails closed: if the limiter's store (Postgres) is down, requests are refused rather than unlimited.
const mcpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests -- please wait 15 minutes' },
  store: new PgStore('mcp'),
  passOnStoreError: false,
});

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

function configuredKey() {
  const key = process.env.MCP_API_KEY || '';
  return key.length >= MIN_KEY_LENGTH ? key : '';
}

function keyMatches(provided) {
  const expected = configuredKey();
  if (!expected || !provided) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

const minimal = (t) => ({ id: t.id, date: t.date, amount: t.amount, reason: t.reason, stateSource: t.stateSource });

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
          // Charge id, date, amount and reason only: no customer names or emails unless include_transactions is true.
          unknownTransactions: result.unknownTransactions.map(minimal),
          excludedTransactions: result.excludedTransactions.map(minimal),
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

function requireKey(req, res, next) {
  if (!configuredKey()) {
    if (process.env.MCP_API_KEY) console.error('MCP disabled: MCP_API_KEY is shorter than ' + MIN_KEY_LENGTH + ' characters');
    return res.status(404).json({ error: 'Not found' });
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!keyMatches(token)) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

router.post('/mcp', mcpLimiter, requireKey, express.json({ limit: '32kb' }), async (req, res) => {
  try {
    const body = req.body;
    // Batches are refused: one request would otherwise fan out into many Stripe calls and
    // count as a single hit on the rate limit. (The newer MCP protocol versions dropped batching.)
    if (Array.isArray(body)) {
      return res.status(400).json(rpcError(null, -32600, 'Batch requests are not supported. Send one request at a time.'));
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
