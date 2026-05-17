const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const fetch = require('node-fetch');
const { getToken, forceRefresh } = require('../lib/qbTokens');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const OWNER_EMAIL = 'operations@smartsyndicator.com';

const PLAN_NAME_MAP = {
  '29700|month': 'Smart Syndicator Pro Monthly',
  '297000|year': 'Smart Syndicator Pro Annual',
};

function resolvePlanName(price) {
  const key = `${price?.unit_amount}|${price?.recurring?.interval}`;
  if (PLAN_NAME_MAP[key]) return PLAN_NAME_MAP[key];
  return price?.nickname || 'Plan';
}

// -- Shared helpers --

async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function listAllStripe(fetcher) {
  const results = [];
  let hasMore = true;
  let startingAfter;
  while (hasMore) {
    const batch = await withRetry(() => fetcher(startingAfter));
    results.push(...batch.data);
    hasMore = batch.has_more;
    if (batch.data.length > 0) startingAfter = batch.data[batch.data.length - 1].id;
    else hasMore = false;
  }
  return results;
}

// -- QuickBooks helpers --

async function qbGet(endpoint) {
  const realmId = process.env.QB_REALM_ID;
  if (!realmId) throw new Error('QuickBooks not configured (QB_REALM_ID missing)');
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}${endpoint}${sep}minorversion=65`;
  const doRequest = async (token) => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`QB API ${res.status} for ${endpoint}`);
    return res.json();
  };
  let token = await getToken();
  let data = await doRequest(token);
  if (data === null) {
    token = await forceRefresh();
    data = await doRequest(token);
    if (data === null) throw new Error('QB API unauthorized after token refresh');
  }
  return data;
}

function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, '').trim()) || 0;
}

function extractDataRows(rows) {
  const lines = [];
  for (const row of rows || []) {
    if (row?.type === 'Data') {
      const name = row?.ColData?.[0]?.value || '';
      const amount = parseAmount(row?.ColData?.[1]?.value);
      if (name) lines.push({ name, amount });
    } else if (row?.type === 'Section') {
      lines.push(...extractDataRows(row?.Rows?.Row));
    }
  }
  return lines;
}

function parsePnL(data) {
  const rows = data?.Rows?.Row || [];
  let totalIncome = 0, totalExpenses = 0, netIncome = 0;
  const expenseLines = [];
  for (const row of rows) {
    if (row?.type !== 'Section') continue;
    const header = row?.Header?.ColData?.[0]?.value || '';
    const summaryLabel = row?.Summary?.ColData?.[0]?.value || '';
    const summaryAmt = parseAmount(row?.Summary?.ColData?.[1]?.value);
    const label = (header || summaryLabel).toLowerCase();
    if (label.includes('income') || label.includes('revenue')) {
      totalIncome = summaryAmt;
    } else if (label.includes('expense') || label.includes('cost of')) {
      totalExpenses += summaryAmt;
      expenseLines.push(...extractDataRows(row?.Rows?.Row));
    } else if (label.includes('net income') || label.includes('net profit') || label.includes('net loss')) {
      netIncome = summaryAmt;
    }
  }
  if (netIncome === 0 && totalIncome !== 0) netIncome = totalIncome - totalExpenses;
  return { totalIncome, totalExpenses, netIncome, expenseLines };
}

// -- Sales tax helpers --

const TX_ZIP_PREFIXES = ['75', '76', '77', '78', '79'];
const TX_TAX_RATE = 0.0825;
const TX_STATE_VALUES = new Set(['tx', 'texas']);

function isTxState(s) { return TX_STATE_VALUES.has((s || '').toLowerCase().trim()); }
function isTxZip(zip) {
  if (!zip) return false;
  return TX_ZIP_PREFIXES.includes(String(zip).trim().replace(/\D/g, '').substring(0, 2));
}
function hasState(s) { return !!(s || '').trim(); }

// -- Tool implementations --

async function toolGetSubscriptions() {
  const allSubs = await listAllStripe((cursor) =>
    stripe.subscriptions.list({
      status: 'active', limit: 100, expand: ['data.customer'],
      ...(cursor && { starting_after: cursor }),
    })
  );
  const filtered = allSubs.filter(sub => {
    const email = (sub.customer?.email || '').toLowerCase();
    return email !== OWNER_EMAIL && !sub.cancel_at;
  });
  const results = await Promise.all(filtered.map(async (sub) => {
    let actualAmount = null;
    try {
      const invoices = await withRetry(() =>
        stripe.invoices.list({ subscription: sub.id, status: 'paid', limit: 1 })
      );
      if (invoices.data.length > 0) actualAmount = invoices.data[0].total;
    } catch {}
    const price = sub.items.data[0]?.price;
    const listPrice = price?.unit_amount || 0;
    const charged = actualAmount !== null ? actualAmount : listPrice;
    const mrrEq = price?.recurring?.interval === 'year' ? charged / 100 / 12 : charged / 100;
    return {
      customerName: sub.customer?.name || sub.customer?.email || 'Unknown',
      customerEmail: sub.customer?.email || '',
      planName: resolvePlanName(price),
      interval: price?.recurring?.interval || 'month',
      chargedDollars: charged / 100,
      mrrEquivalent: mrrEq,
      started: new Date(sub.created * 1000).toLocaleDateString(),
      nextPayment: new Date(sub.current_period_end * 1000).toLocaleDateString(),
    };
  }));
  const totalMrr = results.reduce((s, r) => s + r.mrrEquivalent, 0);
  return { subscriptions: results, totalMrr, arr: totalMrr * 12, count: results.length };
}

async function toolGetYtdRevenue() {
  const now = new Date();
  const ytdStart = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);
  const allInvoices = await listAllStripe((cursor) =>
    stripe.invoices.list({
      status: 'paid', created: { gte: ytdStart }, limit: 100,
      ...(cursor && { starting_after: cursor }),
    })
  );
  const ytdRevenueCents = allInvoices.reduce((sum, inv) => sum + inv.total, 0);
  return {
    year: now.getFullYear(),
    ytdRevenueDollars: ytdRevenueCents / 100,
    invoiceCount: allInvoices.length,
  };
}

async function toolGetPnL(year) {
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = year === currentYear ? today : `${year}-12-31`;
  const data = await withRetry(() =>
    qbGet(`/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Cash`)
  );
  return { year, ...parsePnL(data), startDate, endDate };
}

async function toolGetSalesTax(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');
  const [year, mo] = month.split('-').map(Number);
  if (mo < 1 || mo > 12) throw new Error('Invalid month');
  const startDate = new Date(Date.UTC(year, mo - 1, 1, 6, 0, 0));
  const endDate = new Date(Date.UTC(year, mo, 1, 5, 59, 59));
  const startTs = Math.floor(startDate.getTime() / 1000);
  const endTs = Math.floor(endDate.getTime() / 1000);

  const charges = await listAllStripe((cursor) =>
    stripe.charges.list({
      created: { gte: startTs, lte: endTs }, limit: 100, expand: ['data.customer'],
      ...(cursor && { starting_after: cursor }),
    })
  );

  const txTransactions = [], otherTransactions = [], unknownTransactions = [];
  for (const charge of charges) {
    if (charge.livemode === false) continue;
    if (charge.status !== 'succeeded' || charge.refunded) continue;
    const customer = typeof charge.customer === 'object' ? charge.customer : null;
    const custEmail = (charge.billing_details?.email || customer?.email || '').toLowerCase().trim();
    if (custEmail === OWNER_EMAIL) continue; // self-purchase -- no legal consideration
    const netAmount = charge.amount - (charge.amount_refunded || 0);
    if (netAmount <= 0) continue;

    const customerState = customer?.address?.state || '';
    const billingState  = charge.billing_details?.address?.state || '';
    const zip           = charge.billing_details?.address?.postal_code || '';
    let state, stateSource;

    if (hasState(customerState)) {
      state = isTxState(customerState) ? 'TX' : 'OTHER'; stateSource = 'customer_address';
    } else if (hasState(billingState)) {
      state = isTxState(billingState) ? 'TX' : 'OTHER'; stateSource = 'billing_details';
    } else if (zip) {
      state = isTxZip(zip) ? 'TX' : 'OTHER'; stateSource = 'zip';
    } else {
      state = null; stateSource = 'unknown';
    }

    const txn = {
      name: charge.billing_details?.name || customer?.name || 'Unknown',
      amountDollars: netAmount / 100,
      stateSource,
    };
    if (state === 'TX') txTransactions.push(txn);
    else if (state === 'OTHER') otherTransactions.push(txn);
    else unknownTransactions.push(txn);
  }

  const txRevenue = txTransactions.reduce((s, t) => s + t.amountDollars, 0);
  return {
    month,
    txRevenueDollars: txRevenue,
    taxRate: '8.25%',
    taxDueDollars: txRevenue * TX_TAX_RATE,
    txTransactionCount: txTransactions.length,
    otherStateCount: otherTransactions.length,
    unknownCount: unknownTransactions.length,
    txTransactions,
    otherTransactions,
    unknownTransactions: unknownTransactions.map(t => ({ ...t, note: 'No state data -- may need manual review' })),
  };
}

// -- Tool registry --

const TOOLS = [
  {
    name: 'get_subscriptions',
    description: 'Fetch all active Stripe subscriptions. Returns each customer\'s name, plan, charged amount, MRR equivalent, and billing cycle, plus total MRR and ARR.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ytd_revenue',
    description: 'Fetch year-to-date Stripe revenue from paid invoices (Jan 1 to today). Returns total dollars collected and invoice count.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_pnl',
    description: 'Fetch QuickBooks Profit & Loss report for a specific year (Cash basis). Returns total income, total expenses, net income, and itemized expense lines.',
    input_schema: {
      type: 'object',
      properties: { year: { type: 'integer', description: 'Year, e.g. 2025 or 2026' } },
      required: ['year'],
    },
  },
  {
    name: 'get_sales_tax',
    description: 'Calculate Texas sales tax liability for a specific month. Pulls all Stripe charges for the month and classifies them by state using address data. Returns TX revenue, 8.25% tax due, and full transaction breakdown.',
    input_schema: {
      type: 'object',
      properties: { month: { type: 'string', description: 'Month in YYYY-MM format, e.g. 2026-04' } },
      required: ['month'],
    },
  },
];

async function executeTool(name, input) {
  switch (name) {
    case 'get_subscriptions': return await toolGetSubscriptions();
    case 'get_ytd_revenue':   return await toolGetYtdRevenue();
    case 'get_pnl':           return await toolGetPnL(input.year);
    case 'get_sales_tax':     return await toolGetSalesTax(input.month);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// -- System prompt --

function buildSystemPrompt(ctx) {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const d = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return [
    `You are an AI business analyst embedded inside Smart Syndicator's internal command center.`,
    `Smart Syndicator is a SaaS platform and CRM built for real estate syndicators and capital raisers.`,
    `You are speaking directly with Brandon, the founder.`,
    `Today: ${date}`,
    ``,
    `== DASHBOARD SNAPSHOT (may be slightly stale) ==`,
    `MRR:            ${d(ctx.mrr || 0)}`,
    `ARR:            ${d((ctx.mrr || 0) * 12)}`,
    `Active Clients: ${ctx.uniqueClients || 0}`,
    `Subscriptions:  ${ctx.subscriptionCount || 0}`,
    `YTD Revenue:    ${d((ctx.ytdRevenue || 0) / 100)}`,
    ``,
    `== LIVE DATA TOOLS ==`,
    `You have four tools that pull LIVE data directly from Stripe and QuickBooks:`,
    `- get_subscriptions   -- all active subs, MRR, ARR (Stripe)`,
    `- get_ytd_revenue     -- year-to-date paid invoices (Stripe)`,
    `- get_pnl(year)       -- full P&L for any year (QuickBooks, Cash basis)`,
    `- get_sales_tax(YYYY-MM) -- Texas 8.25% liability for any month (Stripe charges)`,
    ``,
    `RULE: For any question requiring accurate numbers, call the appropriate tool first. Do not guess from the snapshot above.`,
    ``,
    `== STYLE ==`,
    `Answer directly and concisely. Show calculations when doing math. No filler. Brandon is a busy founder.`,
  ].join('\n');
}

// -- Route --

const VALID_ROLES = new Set(['user', 'assistant']);
const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY_ENTRIES = 40;
const MAX_HISTORY_CONTENT_LEN = 10000;

router.post('/chat', async (req, res) => {
  const { message, history, context } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ error: 'message too long (max 4000 characters)' });
  }

  // Only pass known numeric fields into the system prompt -- never raw client strings
  const safeContext = {
    mrr:               Number((context || {}).mrr)               || 0,
    uniqueClients:     Number((context || {}).uniqueClients)     || 0,
    subscriptionCount: Number((context || {}).subscriptionCount) || 0,
    ytdRevenue:        Number((context || {}).ytdRevenue)        || 0,
  };

  // Validate history: only known roles, string content, bounded length
  const safeHistory = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY_ENTRIES)
        .filter(m => VALID_ROLES.has(m?.role) && typeof m?.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_CONTENT_LEN) }))
    : [];

  const systemPrompt = buildSystemPrompt(safeContext);
  let messages = [
    ...safeHistory,
    { role: 'user', content: message.trim() },
  ];

  let attempts = 3;
  while (attempts > 0) {
    try {
      // Agentic loop -- continues until Claude returns end_turn (no more tool calls)
      while (true) {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS,
          messages,
        });

        if (response.stop_reason === 'end_turn') {
          const text = response.content.find(b => b.type === 'text')?.text || '';
          return res.json({ reply: text });
        }

        if (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
          const toolResults = await Promise.all(
            toolUseBlocks.map(async (block) => {
              try {
                const result = await executeTool(block.name, block.input);
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(result, null, 2),
                };
              } catch (err) {
                return {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: `Error: ${err.message}`,
                  is_error: true,
                };
              }
            })
          );
          messages = [
            ...messages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResults },
          ];
          continue;
        }

        // Unexpected stop reason -- return whatever text exists
        const text = response.content.find(b => b.type === 'text')?.text || '';
        return res.json({ reply: text || 'No response generated.' });
      }
    } catch (err) {
      attempts--;
      if (attempts === 0) {
        console.error('Chat API error:', err.message);
        return res.status(500).json({ error: 'Failed to get a response. Please try again.' });
      }
      await new Promise(r => setTimeout(r, 1000 * (3 - attempts)));
    }
  }
});

module.exports = router;
