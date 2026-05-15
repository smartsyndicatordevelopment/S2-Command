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

function parsePnL(data) {
  const rows = data?.Rows?.Row || [];
  let totalIncome = 0;
  let totalExpenses = 0;
  let netIncome = 0;
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

  if (netIncome === 0 && totalIncome !== 0) {
    netIncome = totalIncome - totalExpenses;
  }

  return { totalIncome, totalExpenses, netIncome, expenseLines };
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

  try {
    const currentYear = new Date().getFullYear();
    const today = new Date().toISOString().split('T')[0];
    const years = [...new Set([2022, 2023, 2024, 2025, currentYear])];

    const results = await Promise.all(
      years.map(async (year) => {
        const startDate = `${year}-01-01`;
        const endDate = year === currentYear ? today : `${year}-12-31`;
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

    res.json({ years: results });
  } catch (err) {
    console.error('QB /pnl error:', err.message);
    res.status(500).json({ error: 'Failed to fetch P&L data' });
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
