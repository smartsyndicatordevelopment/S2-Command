const router = require('express').Router();
const fetch = require('node-fetch');
const { getToken, forceRefresh, getTokenCache, withRetry } = require('../lib/digitsTokens');

const DIGITS_BASE = 'https://connect.digits.com';

// ─── Digits Connect REST helpers ──────────────────────────────────────────────

function businessHeaders(token) {
  const businessId = process.env.DIGITS_BUSINESS_ID || getTokenCache().businessId || '';
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  // The ledger is scoped to the connected business. If an explicit id is set we
  // forward it; otherwise the token's default business is used.
  if (businessId) headers['Digits-Business-Id'] = businessId;
  return headers;
}

async function digitsRequest(method, endpoint, { query, body } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(
        Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])
      ).toString()
    : '';
  const url = `${DIGITS_BASE}${endpoint}${qs}`;

  async function doRequest(token) {
    const opts = { method, headers: businessHeaders(token) };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (r.status === 401) return null;
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Digits API ${r.status} for ${endpoint}: ${text.slice(0, 200)}`);
    }
    return r.json();
  }

  let token = await getToken();
  let data = await doRequest(token);
  if (data === null) {
    token = await forceRefresh();
    data = await doRequest(token);
    if (data === null) throw new Error('Digits API unauthorized after token refresh');
  }
  return data;
}

const digitsGet  = (endpoint, query) => digitsRequest('GET',  endpoint, { query });
const digitsPost = (endpoint, body)  => digitsRequest('POST', endpoint, { body });

function digitsConfigured() {
  try {
    return !!(getTokenCache().accessToken && process.env.DIGITS_CLIENT_ID);
  } catch {
    return false;
  }
}

// ─── P&L statement ────────────────────────────────────────────────────────────
//
// GET /v1/ledger/statement/profit-and-loss returns { rows: [tree] } -- a single
// root StatementRow ("Net Income") with nested children. Each node:
//   { label, total: { amount, code }, summary: { kind }, category, children }
// total.amount is in MINOR UNITS (cents) -> divide by 100 for dollars. Section
// rows carry summary.kind; leaf rows carry category. Income vs expense is decided
// by which section a leaf sits under (leaves have no type of their own).

function dollars(node) {
  const a = node?.total?.amount;
  return typeof a === 'number' ? a / 100 : 0; // minor units -> dollars
}

function kindOf(node) {
  return node?.summary?.kind || null;
}

function childrenOf(node) {
  return Array.isArray(node?.children) ? node.children : [];
}

// Depth-first search for the first node anywhere in the tree with a given summary kind.
function firstByKind(rows, kind) {
  const stack = [...rows];
  while (stack.length) {
    const node = stack.shift();
    if (kindOf(node) === kind) return node;
    stack.unshift(...childrenOf(node));
  }
  return null;
}

// Flatten a section's deepest leaf accounts into { name, amount } line items.
function collectLeaves(node, out) {
  const kids = childrenOf(node);
  if (!kids.length) {
    const amount = Math.abs(dollars(node));
    if (node?.label && amount !== 0) out.push({ name: node.label, amount });
  } else {
    for (const c of kids) collectLeaves(c, out);
  }
  return out;
}

// Preserve hierarchy for the expandable breakdown panels.
function toGroup(node) {
  return {
    name: node?.label || 'Unknown',
    amount: Math.abs(dollars(node)),
    children: childrenOf(node).map(toGroup),
  };
}

function parsePnL(statement) {
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];

  const incomeSec   = firstByKind(rows, 'Income');
  const cogsSec     = firstByKind(rows, 'CostOfGoodsSold');
  const opExSec     = firstByKind(rows, 'OperatingExpenses');
  const otherIncSec = firstByKind(rows, 'OtherIncome');
  const otherExpSec = firstByKind(rows, 'OtherExpenses');
  const netSec      = firstByKind(rows, 'NetIncome');

  const totalIncome   = dollars(incomeSec) + dollars(otherIncSec);
  const totalExpenses = dollars(cogsSec) + dollars(opExSec) + dollars(otherExpSec);
  const netIncome     = netSec ? dollars(netSec) : totalIncome - totalExpenses;

  const incomeSections  = [incomeSec, otherIncSec].filter(Boolean);
  const expenseSections = [cogsSec, opExSec, otherExpSec].filter(Boolean);

  const incomeLines  = incomeSections.reduce((acc, s) => collectLeaves(s, acc), []);
  const expenseLines = expenseSections.reduce((acc, s) => collectLeaves(s, acc), []);

  const groupedIncomeLines  = incomeSections.flatMap(s => childrenOf(s).map(toGroup));
  const groupedExpenseLines = expenseSections.flatMap(s => childrenOf(s).map(toGroup));

  return { totalIncome, totalExpenses, netIncome, expenseLines, incomeLines, groupedExpenseLines, groupedIncomeLines };
}

// Param names per the Digits OpenAPI: startDate, endDate, interval (camelCase).
// The date range defines the period; interval sets the granularity.
async function fetchPnL({ interval, startDate, endDate }) {
  const statement = await withRetry(() =>
    digitsGet('/v1/ledger/statement/profit-and-loss', {
      interval,
      startDate,
      endDate,
    })
  );
  return parsePnL(statement);
}

router.get('/pnl', async (req, res) => {
  if (!digitsConfigured()) {
    const years = [...new Set([2022, 2023, 2024, 2025, new Date().getFullYear()])];
    return res.json({
      years: years.map(y => ({ year: y, totalIncome: 0, totalExpenses: 0, netIncome: 0, expenseLines: [], notConfigured: true })),
      notConfigured: true,
    });
  }

  const reconciled = req.query.reconciled === 'true';
  const now = new Date();
  const currentYear = now.getFullYear();

  let reconciledThrough = null;
  if (reconciled) {
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    reconciledThrough = lastDayPrevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  try {
    const years = [...new Set([2022, 2023, 2024, 2025, currentYear])];
    const results = await Promise.all(
      years.map(async (year) => {
        const startDate = `${year}-01-01`;
        const endDate = year === currentYear ? now.toISOString().split('T')[0] : `${year}-12-31`;
        try {
          const parsed = await fetchPnL({ interval: 'Year', year, index: year, startDate, endDate });
          return { year, ...parsed, startDate, endDate };
        } catch (err) {
          console.error(`Digits P&L ${year} error:`, err.message);
          return { year, totalIncome: 0, totalExpenses: 0, netIncome: 0, expenseLines: [], error: err.message };
        }
      })
    );
    res.json({ years: results, reconciledThrough });
  } catch (err) {
    console.error('Digits /pnl error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P&L data' });
  }
});

router.get('/pnl/monthly', async (req, res) => {
  if (!digitsConfigured()) return res.json({ months: [], notConfigured: true });

  const reconciled = req.query.reconciled === 'true';
  const now = new Date();

  const months = [];
  for (let i = 11; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const isCurrent = i === 0;
    const isMTD = isCurrent && !reconciled;
    if (isCurrent && reconciled) continue;

    const startDate = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = isMTD
      ? now.toISOString().split('T')[0]
      : `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const label = first.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    months.push({ startDate, endDate, label, isMTD, year: first.getFullYear(), monthIndex: first.getMonth() + 1 });
  }

  try {
    const results = await Promise.all(
      months.map(async ({ startDate, endDate, label, isMTD, year, monthIndex }) => {
        try {
          const parsed = await fetchPnL({ interval: 'Month', year, index: monthIndex, startDate, endDate });
          return { label, isMTD, startDate, endDate, ...parsed };
        } catch (err) {
          console.error(`Digits monthly P&L ${label} error:`, err.message);
          return { label, isMTD, startDate, endDate, totalIncome: 0, totalExpenses: 0, netIncome: 0, expenseLines: [] };
        }
      })
    );
    res.json({ months: results });
  } catch (err) {
    console.error('Digits /pnl/monthly error:', err.message);
    res.status(500).json({ error: 'Failed to fetch monthly P&L data' });
  }
});

// ─── Ledger transaction queries (entries/query) ───────────────────────────────
//
// POST /v1/ledger/entries/query with body { filters, limit, cursor }. Results come
// back under entryDetails[], each { transactionId, date, entry: { amount:{amount,
// code}, description, category:{name,type}, counterparty:{name} } }. amount.amount
// is in MINOR UNITS (cents). Pagination is cursor-based (next.cursor / next.more).
async function digitsQueryEntries(filters, maxPages = 6) {
  const all = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const body = { filters, limit: 1000, ...(cursor ? { cursor } : {}) };
    const data = await withRetry(() => digitsPost('/v1/ledger/entries/query', body));
    const details = Array.isArray(data?.entryDetails) ? data.entryDetails : [];
    all.push(...details);
    if (!data?.next?.more || !data?.next?.cursor) break;
    cursor = data.next.cursor;
  }
  return all;
}

const EXPENSE_CATEGORY_TYPES = ['Expenses', 'CostOfGoodsSold', 'OtherExpenses'];
const INCOME_CATEGORY_TYPES  = ['Income', 'OtherIncome'];
const SOFTWARE_RE  = /software|saas|subscription|\bapps?\b|cloud|platform|\btool/i;
const MARKETING_RE = /advertis|marketing|promo|social media|ad spend|\bads\b/i;

// Clean, itemized transaction list for the analyst. Returns entries (most recent
// first) with date, description, counterparty, category, and a signed dollar
// amount (negative = money out). Optional category-name substring filter.
async function queryTransactions({ startDate, endDate, categoryTypes, categoryMatch, limit = 100 } = {}) {
  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = endDate ? new Date(`${endDate}T23:59:59`) : now;

  const filters = { occurredAfter: start.toISOString(), occurredBefore: end.toISOString() };
  if (Array.isArray(categoryTypes) && categoryTypes.length) filters.categoryTypes = categoryTypes;

  const details = await digitsQueryEntries(filters);
  const re = categoryMatch ? new RegExp(categoryMatch, 'i') : null;

  const transactions = details
    .map(ed => {
      const e = ed.entry || {};
      return {
        date:         (ed.date || '').split('T')[0],
        description:  e.description || null,
        counterparty: e.counterparty?.name || null,
        category:     e.category?.name || null,
        categoryType: e.category?.type || null,
        amount:       typeof e.amount?.amount === 'number' ? e.amount.amount / 100 : null,
      };
    })
    .filter(t => t.date && (!re || re.test(t.category || '') || re.test(t.description || '') || re.test(t.counterparty || '')))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  return {
    startDate:   filters.occurredAfter.split('T')[0],
    endDate:     filters.occurredBefore.split('T')[0],
    totalMatched: transactions.length,
    returned:    Math.min(transactions.length, cap),
    transactions: transactions.slice(0, cap),
  };
}

// Group expense entries matching a category-name pattern into per-vendor rollups.
function rollupVendors(details, pattern) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const vendorMonths = {};
  const vendor30d = {};
  for (const ed of details) {
    const e = ed.entry || {};
    const catName = e.category?.name || '';
    if (!pattern.test(catName)) continue;
    const vendor = e.counterparty?.name || e.description || catName || 'Unknown';
    const amount = Math.abs((e.amount?.amount ?? 0) / 100);
    const dateStr = (ed.date || '').split('T')[0];
    if (!dateStr || !(amount > 0)) continue;
    const month = dateStr.substring(0, 7);
    vendorMonths[vendor] = vendorMonths[vendor] || {};
    vendorMonths[vendor][month] = (vendorMonths[vendor][month] || 0) + amount;
    if (new Date(dateStr) >= thirtyDaysAgo) vendor30d[vendor] = (vendor30d[vendor] || 0) + amount;
  }
  const vendors = Object.entries(vendorMonths).map(([name, byMonth]) => {
    const total = Object.values(byMonth).reduce((s, a) => s + a, 0);
    const months = Object.keys(byMonth).length;
    return { name, monthlyAvg: total / 12, freq: months > 1 ? 'Monthly' : 'Annual', count: months, annualEst: total, active: true };
  }).filter(v => v.monthlyAvg >= 1).sort((a, b) => b.monthlyAvg - a.monthlyAvg);
  const vendors30d = Object.entries(vendor30d).map(([name, total]) => (
    { name, monthlyAvg: total, freq: 'Monthly', count: 1, annualEst: total * 12, active: true }
  )).filter(v => v.monthlyAvg >= 1).sort((a, b) => b.monthlyAvg - a.monthlyAvg);
  return { vendors, vendors30d };
}

router.get('/software-subscriptions', async (req, res) => {
  if (!digitsConfigured()) return res.json({ vendors: [], vendors30d: [], notConfigured: true });

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  try {
    const details = await digitsQueryEntries({
      occurredAfter: start.toISOString(),
      occurredBefore: now.toISOString(),
      categoryTypes: EXPENSE_CATEGORY_TYPES,
    });
    res.json(rollupVendors(details, SOFTWARE_RE));
  } catch (err) {
    console.error('Digits /software-subscriptions error:', err.message);
    // Graceful empty result -- keep the Financials view stable.
    res.json({ vendors: [], vendors30d: [], error: err.message });
  }
});

// ─── Marketing spend (Facebook Ads primary, Digits supplement) ────────────────

const FB_BASE = 'https://graph.facebook.com/v21.0';

async function getFbSpend(rawDays) {
  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return null;
  const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

  let dateParam;
  const days = rawDays === 'all' ? null : parseInt(rawDays, 10);
  if (!days)            dateParam = { date_preset: 'maximum' };
  else if (days <= 7)   dateParam = { date_preset: 'last_7d' };
  else if (days <= 30)  dateParam = { date_preset: 'last_30d' };
  else if (days <= 90)  dateParam = { date_preset: 'last_90d' };
  else                  dateParam = { date_preset: 'maximum' };

  const qs = new URLSearchParams({ fields: 'spend', level: 'account', access_token: token, ...dateParam });
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${FB_BASE}/${actId}/insights?${qs}`);
      const data = await r.json();
      if (data.error) return null;
      const spend = parseFloat(data.data?.[0]?.spend || 0);
      return isNaN(spend) ? null : spend;
    } catch {
      if (i === 2) return null;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

router.get('/marketing-spend', async (req, res) => {
  const rawDays = req.query.days;
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  let start;
  if (!rawDays || rawDays === 'all') {
    start = '2020-01-01';
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(rawDays, 10));
    start = d.toISOString().split('T')[0];
  }

  const fbSpend = await getFbSpend(rawDays);
  const fbSource = fbSpend !== null;

  // Supplement with any non-ad marketing spend tracked in Digits.
  let digitsSpend = 0;
  const marketingAccounts = [];
  if (digitsConfigured()) {
    try {
      const details = await digitsQueryEntries({
        occurredAfter: new Date(start).toISOString(),
        occurredBefore: now.toISOString(),
        categoryTypes: EXPENSE_CATEGORY_TYPES,
      });
      for (const ed of details) {
        const e = ed.entry || {};
        const catName = e.category?.name || '';
        if (!MARKETING_RE.test(catName)) continue;
        const amount = Math.abs((e.amount?.amount ?? 0) / 100);
        if (amount > 0) {
          digitsSpend += amount;
          if (catName && !marketingAccounts.includes(catName)) marketingAccounts.push(catName);
        }
      }
    } catch (err) {
      console.error('Digits /marketing-spend supplement error:', err.message);
    }
  }

  const totalSpend = (fbSource ? fbSpend : 0) + digitsSpend;
  const sources = [];
  if (fbSource) sources.push(`Meta Ads ($${fbSpend.toFixed(2)})`);
  if (marketingAccounts.length) sources.push(...marketingAccounts);

  if (totalSpend === 0 && !fbSource && !digitsConfigured()) {
    return res.json({ spend: 0, marketingAccounts: [], notConfigured: true, startDate: start, endDate: end });
  }

  res.json({ spend: totalSpend, marketingAccounts: sources, startDate: start, endDate: end });
});

// ─── Cash flow (Sankey) ───────────────────────────────────────────────────────
//
// Builds a Sankey-ready { nodes, links } graph from the P&L tree:
//   income leaves --> Total Income --> { expense sections, Discounts, Net Profit }
//   expense section --> its leaf categories
// Contra-revenue leaves (e.g. Discounts/Refunds, stored negative) are modeled as
// an outflow from Total Income so the inflow and outflow sides balance exactly.

const round2 = (n) => Math.round(n * 100) / 100;

// Itemized line items for each Sankey category node. Queries the ledger once for
// the same period and buckets every income/expense entry under its category name
// so the frontend can show a per-category transaction list on hover. Keyed by the
// exact category name (the Sankey leaf node's name); each list is sorted newest
// first and capped so a single popup payload stays small.
const TXNS_PER_CATEGORY_CAP = 1000;

async function txnsByCategory({ startDate, endDate }) {
  const occurredAfter  = new Date(startDate).toISOString();
  const occurredBefore = new Date(`${endDate}T23:59:59`).toISOString();
  const byCat = {};

  const ingest = (details) => {
    for (const ed of details) {
      const e = ed.entry || {};
      const cat = e.category?.name;
      if (!cat) continue;
      const amount = typeof e.amount?.amount === 'number' ? e.amount.amount / 100 : 0;
      if (!amount) continue;
      const date = (ed.date || '').split('T')[0];
      if (!date) continue;
      (byCat[cat] = byCat[cat] || []).push({
        date,
        description:  e.description || null,
        counterparty: e.counterparty?.name || null,
        amount:       round2(amount), // signed: negative = money out
      });
    }
  };

  // Query expenses (known-good category types) and income independently so a
  // rejected income enum can never wipe out the expense breakout.
  try {
    ingest(await digitsQueryEntries({ occurredAfter, occurredBefore, categoryTypes: EXPENSE_CATEGORY_TYPES }));
  } catch (err) {
    console.error('txnsByCategory expense query error:', err.message);
  }
  try {
    ingest(await digitsQueryEntries({ occurredAfter, occurredBefore, categoryTypes: INCOME_CATEGORY_TYPES }));
  } catch (err) {
    console.error('txnsByCategory income query error:', err.message);
  }

  for (const cat of Object.keys(byCat)) {
    byCat[cat].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (byCat[cat].length > TXNS_PER_CATEGORY_CAP) byCat[cat] = byCat[cat].slice(0, TXNS_PER_CATEGORY_CAP);
  }
  return byCat;
}

// Like collectLeaves but keeps the signed dollar amount (income contras are negative).
function collectSignedLeaves(node, out) {
  const kids = childrenOf(node);
  if (!kids.length) {
    const amount = dollars(node);
    if (node?.label && amount !== 0) out.push({ name: node.label, amount });
  } else {
    for (const c of kids) collectSignedLeaves(c, out);
  }
  return out;
}

function buildCashflow(statement) {
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];

  const incomeSec   = firstByKind(rows, 'Income');
  const otherIncSec = firstByKind(rows, 'OtherIncome');
  const cogsSec     = firstByKind(rows, 'CostOfGoodsSold');
  const opExSec     = firstByKind(rows, 'OperatingExpenses');
  const otherExpSec = firstByKind(rows, 'OtherExpenses');
  const netSec      = firstByKind(rows, 'NetIncome');

  const totalIncome   = dollars(incomeSec) + dollars(otherIncSec);
  const totalExpenses = dollars(cogsSec) + dollars(opExSec) + dollars(otherExpSec);
  const netIncome     = netSec ? dollars(netSec) : totalIncome - totalExpenses;

  const nodes = [];
  const links = [];
  const index = {};
  const nodeId = (name, kind) => {
    if (index[name] === undefined) { index[name] = nodes.length; nodes.push({ name, kind }); }
    return index[name];
  };

  const HUB = 'Total Income';
  nodeId(HUB, 'hub');

  // Income side: positive leaves (largest first) flow into the hub; contra leaves
  // (discounts/refunds) net out as an outflow so the two sides balance.
  let contra = 0;
  const incomeLeaves = [];
  [incomeSec, otherIncSec].filter(Boolean).forEach(s => collectSignedLeaves(s, incomeLeaves));
  incomeLeaves.filter(l => l.amount < 0).forEach(l => { contra += -l.amount; });
  const positiveIncome = incomeLeaves.filter(l => l.amount > 0).sort((a, b) => b.amount - a.amount);
  for (const leaf of positiveIncome) {
    links.push({ source: nodeId(leaf.name, 'income'), target: nodeId(HUB, 'hub'), value: round2(leaf.amount) });
  }

  // Net Profit FIRST among the hub's outflows so it pins to the top of the right
  // side (deterministic layout renders the first node in a column at the top).
  // Route it through a short pass-through bucket so it spans the SAME two right
  // columns the expense sections do -- otherwise Net Profit (a sink) gets right-
  // aligned and its long diagonal band overlaps the expense-section flows.
  if (netIncome > 0) {
    const bucket = nodeId('profit-bucket', 'profitBucket'); // col 2, rendered unlabeled
    const leaf   = nodeId('Net Profit', 'profit');          // col 3, labeled
    links.push({ source: nodeId(HUB, 'hub'), target: bucket, value: round2(netIncome) });
    links.push({ source: bucket, target: leaf, value: round2(netIncome) });
  }

  // Expense side: hub -> section -> leaf categories (largest first).
  const sections = [
    { node: cogsSec,     label: 'Cost of Revenue' },
    { node: opExSec,     label: 'Operating Expenses' },
    { node: otherExpSec, label: 'Other Expenses' },
  ].filter(s => s.node);

  for (const { node, label } of sections) {
    const leaves = collectLeaves(node, []).filter(l => l.amount > 0).sort((a, b) => b.amount - a.amount);
    const total = leaves.reduce((s, l) => s + l.amount, 0);
    if (total <= 0) continue;
    links.push({ source: nodeId(HUB, 'hub'), target: nodeId(label, 'group'), value: round2(total) });
    for (const leaf of leaves) {
      links.push({ source: nodeId(label, 'group'), target: nodeId(leaf.name, 'expense'), value: round2(leaf.amount) });
    }
  }

  // Discounts/refunds outflow last (bottom of the right side).
  if (contra > 0) {
    links.push({ source: nodeId(HUB, 'hub'), target: nodeId('Discounts & Refunds', 'expense'), value: round2(contra) });
  }

  return { nodes, links, totalIncome, totalExpenses, netIncome, netLoss: netIncome < 0 };
}

router.get('/cashflow', async (req, res) => {
  if (!digitsConfigured()) return res.json({ nodes: [], links: [], notConfigured: true });

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const today = now.toISOString().split('T')[0];

  const year = parseInt(req.query.year, 10) || currentYear;
  const month = parseInt(req.query.month, 10); // 1-12, or NaN for full year
  const pad = (n) => String(n).padStart(2, '0');

  let interval, startDate, endDate;
  if (month >= 1 && month <= 12) {
    interval = 'Month';
    startDate = `${year}-${pad(month)}-01`;
    const isCurrentMonth = year === currentYear && month === currentMonth;
    endDate = isCurrentMonth ? today : `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  } else {
    interval = 'Year';
    startDate = `${year}-01-01`;
    endDate = year === currentYear ? today : `${year}-12-31`;
  }

  try {
    const statement = await withRetry(() =>
      digitsGet('/v1/ledger/statement/profit-and-loss', { interval, startDate, endDate })
    );

    // Per-category line items for the hover popup. Best-effort: if the ledger
    // query fails, the chart still renders -- categories just have no drilldown.
    let transactionsByCategory = {};
    try {
      transactionsByCategory = await txnsByCategory({ startDate, endDate });
    } catch (err) {
      console.error('Digits /cashflow line-item error:', err.message);
    }

    res.json({
      year,
      month: month >= 1 && month <= 12 ? month : null,
      startDate,
      endDate,
      ...buildCashflow(statement),
      transactionsByCategory,
    });
  } catch (err) {
    console.error('Digits /cashflow error:', err.message);
    res.status(500).json({ error: 'Failed to build cash flow' });
  }
});

// ─── Source / party / transaction sync (write) ────────────────────────────────
//
// Reusable Digits Connect write primitives. S2 Command registers itself as a
// source, then syncs corrected income transactions into it (the native Stripe
// transactions are deleted by the user, so ours become the record of truth).

const S2_SOURCE_EXTERNAL_ID = { issuer: 'command.smartsyndicator.com', id: 's2-income-adjustments' };

// CategoryRef.ledgerId is a numeric (int64) id we don't have, so we reference
// categories by LABEL. Each label resolves to an existing category by name + type
// + subtype (values confirmed from the live chart of accounts).
function catLabel(id, name, type, subtype) {
  return { label: id, name, constraint: [type], preferAi: false, search: { names: [name], type, subtype } };
}

// Label ids used when writing entries.
const LABELS = {
  rebilling:    'rebilling_income',
  subscription: 'subscription_income',
  consulting:   'consulting_income',
  clearing:     'stripe_clearing',
  fees:         'stripe_fees',
};

// Register / update our source and its label->category mappings. Idempotent; adds
// no ledger transactions on its own.
async function ensureS2Source() {
  return await digitsPost('/v1/connection/sources', {
    sources: [{
      externalId: S2_SOURCE_EXTERNAL_ID,
      name: 'S2 Command Income Adjustments',
      type: 'Income',
      subtype: 'SalesRevenue',
      description: 'Re-classify Stripe income into finer categories',
      labels: [
        catLabel(LABELS.rebilling,    'Rebilling Income',     'Income',   'SalesRevenue'),
        catLabel(LABELS.subscription, 'Saas Income (Stripe)', 'Income',   'SalesRevenue'),
        catLabel(LABELS.consulting,   'Consulting Income',    'Income',   'SalesRevenue'),
        catLabel(LABELS.clearing,     'Stripe Clearing',      'Assets',   'BankAccounts'),
        catLabel(LABELS.fees,         'Stripe Fees',          'Expenses', 'GeneralOperations'),
      ],
    }],
  });
}

// Party CREATE uses a bare-string externalId; party REFERENCE (counterparty) uses
// the {issuer, id} object form, same as a transaction's externalId. Digits dedupes
// parties we create to existing ones by name.
const partyRef = (id) => ({ externalId: { issuer: 'command.smartsyndicator.com', id } });
const STRIPE_PARTY_ID = 'party-stripe';

// Turn a party display name into a stable, source-scoped externalId string.
function partyExternalId(name) {
  return 'party-' + String(name || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// parties: array of { externalId, name, kind }
async function syncParties(parties) {
  return await digitsPost('/v1/source/parties', { parties });
}

// transactions: array of SourceTransaction objects
async function syncTransactions(transactions) {
  return await digitsPost('/v1/source/transactions', { transactions });
}

// ─── Status ───────────────────────────────────────────────────────────────────

router.get('/digits/status', (req, res) => {
  const cache = getTokenCache();
  res.json({
    connected: !!cache.accessToken,
    tokenExpired: Date.now() >= cache.expiresAt,
    expiresAt: cache.expiresAt,
  });
});

module.exports = router;
// Shared helpers for the Overview analyst (chat.js) so the P&L logic lives in one place.
module.exports.fetchPnL = fetchPnL;
module.exports.digitsConfigured = digitsConfigured;
module.exports.queryTransactions = queryTransactions;
// Write primitives + query helper reused by the income re-categorization feature.
module.exports.digitsQueryEntries = digitsQueryEntries;
module.exports.ensureS2Source = ensureS2Source;
module.exports.syncParties = syncParties;
module.exports.syncTransactions = syncTransactions;
module.exports.partyRef = partyRef;
module.exports.partyExternalId = partyExternalId;
module.exports.S2_SOURCE_EXTERNAL_ID = S2_SOURCE_EXTERNAL_ID;
module.exports.STRIPE_PARTY_ID = STRIPE_PARTY_ID;
module.exports.LABELS = LABELS;
