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
// GET /v1/ledger/statement/profit-and-loss returns { kind, rows: [...] }.
// Rows are a flat render list; hierarchy is conveyed by `depth` + row_id naming.
// Amounts live in `money_flow.value` as signed DOLLAR floats (expenses negative).
//
// NOTE: the exact period query-param names are confirmed against the live API on
// first connection. We send the same fields the Digits statement model uses
// (interval/year/index/interval_count). If they differ, digitsRequest throws and
// the caller returns a graceful zeroed result -- nothing crashes.

const PNL_PREFIX = 'com.digits.report.profitandloss.row.';

function numVal(node) {
  const v = node?.money_flow?.value;
  return typeof v === 'number' ? v : 0;
}

function sectionSummary(rows, key) {
  const row = rows.find(r => r.row_id === PNL_PREFIX + key && r.section_summary);
  return row ? numVal(row.section_summary) : 0;
}

function parsePnL(statement) {
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];

  const income      = sectionSummary(rows, 'IncomeSummary');
  const otherIncome = sectionSummary(rows, 'OtherIncomeSummary');
  const cogs        = sectionSummary(rows, 'CostOfGoodsSoldSummary');
  const opEx        = sectionSummary(rows, 'OperatingExpensesSummary');
  const otherEx     = sectionSummary(rows, 'OtherExpensesSummary');
  const netRow      = rows.find(r => r.row_id === PNL_PREFIX + 'NetIncomeSummary' && r.section_summary);

  const totalIncome = income + otherIncome;
  // Expense section totals are negative -- flip to positive magnitude.
  const totalExpenses = -(cogs + opEx + otherEx);

  const expenseLines = [];
  const incomeLines = [];
  for (const r of rows) {
    const leaf = r.leaf_category_summary;
    if (!leaf) continue;
    const name = leaf.label || '';
    const value = numVal(leaf);
    if (!name || value === 0) continue;
    const type = r.ytd_details?.hover?.entity?.category?.type
      || (leaf.money_flow?.business_flow === 'Outbound' ? 'Expense' : 'Income');
    if (type === 'Expense') expenseLines.push({ name, amount: Math.abs(value) });
    else if (type === 'Income') incomeLines.push({ name, amount: Math.abs(value) });
  }

  return {
    totalIncome,
    totalExpenses,
    netIncome: netRow ? numVal(netRow.section_summary) : totalIncome - totalExpenses,
    expenseLines,
    // Grouped variants kept for UI contract parity (flat -> single-level groups).
    groupedExpenseLines: expenseLines.map(l => ({ ...l, children: [] })),
    groupedIncomeLines: incomeLines.map(l => ({ ...l, children: [] })),
  };
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

// ─── Software subscriptions (Digits category subtype) ─────────────────────────
//
// Digits classifies software spend under the BusinessApplicationsAndSoftware
// category subtype, so we can query it directly instead of regex-matching account
// names. Uses POST /v1/ledger/entries/query. Response shape is verified against the
// live API on first connection; until then this returns an empty list on any
// mismatch so the Financials view degrades gracefully rather than erroring.

function ymStr(d) { return d.toISOString().split('T')[0]; }

router.get('/software-subscriptions', async (req, res) => {
  if (!digitsConfigured()) return res.json({ vendors: [], vendors30d: [], notConfigured: true });

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  try {
    const result = await withRetry(() =>
      digitsPost('/v1/ledger/entries/query', {
        origin: { interval: 'Month', year: start.getFullYear(), index: start.getMonth() + 1, interval_count: 12 },
        filter: { category_subtypes: ['BusinessApplicationsAndSoftware'], category_types: { types: ['Expenses'] } },
        pagination: { offset: 0, limit: 1000 },
      })
    );

    const entries = result?.entries || result?.transactions || result?.rows || [];
    const vendorMonths = {};
    const vendor30d = {};
    for (const e of entries) {
      const name = e.party?.name || e.partyName || e.description || e.memo || 'Unknown';
      const occurredSec = e.occurred_at?.seconds || e.occurredAt?.seconds;
      const date = occurredSec ? new Date(occurredSec * 1000) : null;
      const amount = Math.abs(e.amount?.value ?? e.money_flow?.value ?? 0);
      if (!date || !(amount > 0)) continue;
      const month = ymStr(date).substring(0, 7);
      vendorMonths[name] = vendorMonths[name] || {};
      vendorMonths[name][month] = (vendorMonths[name][month] || 0) + amount;
      if (date >= thirtyDaysAgo) vendor30d[name] = (vendor30d[name] || 0) + amount;
    }

    const vendors = Object.entries(vendorMonths).map(([name, byMonth]) => {
      const total = Object.values(byMonth).reduce((s, a) => s + a, 0);
      return { name, monthlyAvg: total / 12, freq: Object.keys(byMonth).length > 1 ? 'Monthly' : 'Annual', count: Object.keys(byMonth).length, annualEst: total, active: true };
    }).filter(v => v.monthlyAvg >= 1).sort((a, b) => b.monthlyAvg - a.monthlyAvg);

    const vendors30d = Object.entries(vendor30d).map(([name, total]) => (
      { name, monthlyAvg: total, freq: 'Monthly', count: 1, annualEst: total * 12, active: true }
    )).filter(v => v.monthlyAvg >= 1).sort((a, b) => b.monthlyAvg - a.monthlyAvg);

    res.json({ vendors, vendors30d });
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

  // Supplement with any non-ad marketing spend tracked in Digits (SalesAndMarketing).
  let digitsSpend = 0;
  const marketingAccounts = [];
  if (digitsConfigured()) {
    try {
      const startDate = new Date(start);
      const result = await withRetry(() =>
        digitsPost('/v1/ledger/entries/query', {
          origin: { interval: 'Month', year: startDate.getFullYear(), index: startDate.getMonth() + 1, interval_count: 12 },
          filter: { category_subtypes: ['SalesAndMarketing'], category_types: { types: ['Expenses'] } },
          pagination: { offset: 0, limit: 1000 },
        })
      );
      const entries = result?.entries || result?.transactions || result?.rows || [];
      for (const e of entries) {
        const amount = Math.abs(e.amount?.value ?? e.money_flow?.value ?? 0);
        if (amount > 0) {
          digitsSpend += amount;
          const name = e.category?.name || e.party?.name;
          if (name && !marketingAccounts.includes(name)) marketingAccounts.push(name);
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

// ─── Status ───────────────────────────────────────────────────────────────────

router.get('/digits/status', (req, res) => {
  const cache = getTokenCache();
  res.json({
    connected: !!cache.accessToken,
    tokenExpired: Date.now() >= cache.expiresAt,
    expiresAt: cache.expiresAt,
  });
});

// TEMPORARY diagnostic -- remove once P&L is confirmed. Dumps a depth-limited
// skeleton of the live Digits P&L response so the actual node structure (field
// names + nesting) is visible without an unmanageable full JSON paste. Arrays are
// capped to 4 items per level so deep trees stay small but their shape is intact.
function skeleton(node, depth = 0) {
  if (depth > 20) return '...';
  if (Array.isArray(node)) {
    const out = node.slice(0, 8).map(n => skeleton(n, depth + 1));
    if (node.length > 8) out.push(`...(${node.length} total)`);
    return out;
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) out[k] = skeleton(node[k], depth + 1);
    return out;
  }
  if (typeof node === 'string' && node.length > 80) return node.slice(0, 80) + '...';
  return node;
}

router.get('/digits/debug-pnl', async (req, res) => {
  if (!digitsConfigured()) return res.json({ error: 'not configured' });
  const year = parseInt(req.query.year, 10) || 2025;
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  try {
    const statement = await digitsGet('/v1/ledger/statement/profit-and-loss', { interval: 'Year', startDate, endDate });
    res.json({
      year,
      topLevelKeys: Object.keys(statement || {}),
      structure: skeleton(statement),
      parsed: parsePnL(statement),
    });
  } catch (err) {
    res.json({ year, error: err.message });
  }
});

module.exports = router;
// Shared helpers for the Overview analyst (chat.js) so the P&L logic lives in one place.
module.exports.fetchPnL = fetchPnL;
module.exports.digitsConfigured = digitsConfigured;
