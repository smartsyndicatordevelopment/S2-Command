const router = require('express').Router();
const fetch = require('node-fetch');
const { getToken, forceRefresh, getTokenCache, withRetry } = require('../lib/qbTokens');

const QB_BASE = 'https://quickbooks.api.intuit.com';

async function qbGet(endpoint) {
  const realmId = process.env.QB_REALM_ID || getTokenCache().realmId;
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${QB_BASE}/v3/company/${realmId}${endpoint}${sep}minorversion=65`;

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

// -- P&L parser --

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

function extractCategoryRows(rows) {
  const items = [];
  for (const row of rows || []) {
    if (row?.type === 'Data') {
      const name = row?.ColData?.[0]?.value || '';
      const amount = parseAmount(row?.ColData?.[1]?.value);
      if (name && amount) items.push({ name, amount, children: [] });
    } else if (row?.type === 'Section') {
      const header = row?.Header?.ColData?.[0]?.value || '';
      const summaryAmt = parseAmount(row?.Summary?.ColData?.[1]?.value);
      const children = extractCategoryRows(row?.Rows?.Row);
      if (header && summaryAmt) {
        items.push({ name: header, amount: summaryAmt, children });
      } else {
        items.push(...children);
      }
    }
  }
  return items;
}

function parsePnL(data) {
  const rows = data?.Rows?.Row || [];
  let totalIncome = 0;
  let totalExpenses = 0;
  let netIncome = null;
  const expenseLines = [];
  const groupedExpenseLines = [];

  for (const row of rows) {
    if (row?.type !== 'Section') continue;

    const header = row?.Header?.ColData?.[0]?.value || '';
    const summaryLabel = row?.Summary?.ColData?.[0]?.value || '';
    const summaryAmt = parseAmount(row?.Summary?.ColData?.[1]?.value);
    const label = (header || summaryLabel).toLowerCase().trim();

    // Net labels must be checked FIRST -- "net income" contains "income"
    // and would incorrectly match the income branch otherwise.
    if (label.startsWith('net ') || label === 'net income' || label === 'net profit' || label === 'net loss') {
      if (label === 'net income' || label === 'net profit' || label === 'net loss') {
        netIncome = summaryAmt;
      }
      // net operating income, net other income, etc. are intentionally skipped
    } else if ((label.includes('income') || label.includes('revenue')) && !label.startsWith('total')) {
      totalIncome += summaryAmt;
    } else if ((label.includes('expense') || label.includes('cost of')) && !label.startsWith('total')) {
      totalExpenses += summaryAmt;
      expenseLines.push(...extractDataRows(row?.Rows?.Row));
      groupedExpenseLines.push(...extractCategoryRows(row?.Rows?.Row));
    }
  }

  return {
    totalIncome,
    totalExpenses,
    netIncome: netIncome !== null ? netIncome : totalIncome - totalExpenses,
    expenseLines,
    groupedExpenseLines,
  };
}

function qbConfigured() {
  const realmId = process.env.QB_REALM_ID || getTokenCache().realmId;
  return !!(realmId && process.env.QB_CLIENT_ID);
}

router.get('/pnl', async (req, res) => {
  if (!qbConfigured()) {
    const years = [2022, 2023, 2024, 2025, new Date().getFullYear()];
    return res.json({
      years: years.map(y => ({ year: y, totalIncome: 0, totalExpenses: 0, netIncome: 0, expenseLines: [], notConfigured: true })),
      notConfigured: true,
    });
  }

  const reconciled = req.query.reconciled === 'true';

  // Reconciled mode: cap current year at end of last full month so only
  // fully-closed periods (likely reconciled by CPA) are shown.
  const now = new Date();
  const currentYear = now.getFullYear();
  const today = now.toISOString().split('T')[0];

  let currentYearEnd = today;
  let reconciledThrough = null;
  if (reconciled) {
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    currentYearEnd = lastDayPrevMonth.toISOString().split('T')[0];
    reconciledThrough = lastDayPrevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  try {
    const years = [...new Set([2022, 2023, 2024, 2025, currentYear])];

    const results = await Promise.all(
      years.map(async (year) => {
        const startDate = `${year}-01-01`;
        const endDate = year === currentYear ? currentYearEnd : `${year}-12-31`;
        try {
          const data = await withRetry(() =>
            qbGet(`/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Cash`)
          );
          return { year, ...parsePnL(data), startDate, endDate };
        } catch (err) {
          console.error(`QB P&L ${year} error:`, err.message);
          return { year, totalIncome: 0, totalExpenses: 0, netIncome: 0, expenseLines: [], error: err.message };
        }
      })
    );

    res.json({ years: results, reconciledThrough });
  } catch (err) {
    console.error('QB /pnl error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P&L data' });
  }
});

router.get('/pnl/monthly', async (req, res) => {
  if (!qbConfigured()) return res.json({ months: [], notConfigured: true });

  const reconciled = req.query.reconciled === 'true';
  const now = new Date();

  // Build 12 month windows. In reconciled mode use only complete months.
  const months = [];
  const count = 12;
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const isCurrent = i === 0;
    const isMTD = isCurrent && !reconciled;

    // In reconciled mode skip the current in-progress month
    if (isCurrent && reconciled) continue;

    const startDate = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = isMTD
      ? now.toISOString().split('T')[0]
      : `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

    const label = first.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    months.push({ startDate, endDate, label, isMTD });
  }

  try {
    const results = await Promise.all(
      months.map(async ({ startDate, endDate, label, isMTD }) => {
        try {
          const data = await withRetry(() =>
            qbGet(`/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}&accounting_method=Cash`)
          );
          return { label, isMTD, startDate, endDate, ...parsePnL(data) };
        } catch (err) {
          console.error(`QB monthly P&L ${label} error:`, err.message);
          return { label, isMTD, startDate, endDate, totalIncome: 0, totalExpenses: 0, netIncome: 0, expenseLines: [] };
        }
      })
    );
    res.json({ months: results });
  } catch (err) {
    console.error('QB /pnl/monthly error:', err.message);
    res.status(500).json({ error: 'Failed to fetch monthly P&L data' });
  }
});

router.get('/qb/status', (req, res) => {
  const cache = getTokenCache();
  res.json({
    connected: !!cache.accessToken,
    tokenExpired: Date.now() >= cache.expiresAt,
    expiresAt: cache.expiresAt,
  });
});

module.exports = router;
