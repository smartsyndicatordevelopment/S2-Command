// Demo data -- served by useApi (and a couple of raw-fetch tabs) whenever the
// "Demo" slider in the header is on. Every financial page reads from here, so the
// numbers below are hand-tuned to be internally consistent (MRR matches the active
// roster, the cash-flow graph balances, expenses tie out across views) and to make
// each screen look fully populated for a walkthrough. No live services are touched
// in demo mode.

const NOW_MS = Date.now();
const now    = Math.floor(NOW_MS / 1000);
const day    = 86400;
const nowDate = new Date(NOW_MS);

const usdc = (dollars) => Math.round(dollars * 100); // dollars -> cents
const isoDate   = (d) => d.toISOString().split('T')[0];
const daysAgoTs = (n) => now - n * day;
const ymKey     = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const emailFor = (name) =>
  'billing@' + name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) + '.com';

// ─── Subscriptions (/api/subscriptions) ──────────────────────────────────────
// Powers Recurring Customers, Overview, Targets, and Business Plan.

function activeSub({ id, customerName, planName, amount, interval = 'month', createdDaysAgo, list, periodEndInDays }) {
  const created = daysAgoTs(createdDaysAgo);
  const currentPeriodEnd =
    periodEndInDays != null
      ? now + periodEndInDays * day
      : interval === 'year'
        ? created + 365 * day
        : now + 18 * day;
  const cycles = interval === 'year'
    ? Math.max(1, Math.round(createdDaysAgo / 365))
    : Math.max(1, Math.round(createdDaysAgo / 30));
  return {
    id,
    customerName,
    customerEmail: emailFor(customerName),
    planName,
    interval,
    actualAmount: amount,
    listPrice: list ?? amount,
    created,
    currentPeriodEnd,
    totalSpend: amount * cycles,
    cancelAt: null,
  };
}

const DEMO_ACTIVE = [
  activeSub({ id: 'sub_d01', customerName: 'Apex Capital Group',     planName: 'Professional',        amount: usdc(499), createdDaysAgo: 342 }),
  activeSub({ id: 'sub_d02', customerName: 'Sunbelt Syndication',    planName: 'Starter',             amount: usdc(199), createdDaysAgo: 208 }),
  activeSub({ id: 'sub_d03', customerName: 'Harbor Wealth Partners', planName: 'Professional',        amount: usdc(499), createdDaysAgo: 175 }),
  activeSub({ id: 'sub_d04', customerName: 'Meridian Fund Partners', planName: 'Enterprise',          amount: usdc(999), createdDaysAgo: 291 }),
  activeSub({ id: 'sub_d05', customerName: 'Blueridge Equity LLC',   planName: 'Starter',             amount: usdc(199), createdDaysAgo: 96 }),
  activeSub({ id: 'sub_d06', customerName: 'Peak Capital Group',     planName: 'Professional Annual', amount: usdc(4990), interval: 'year', createdDaysAgo: 347, periodEndInDays: 18 }),
  activeSub({ id: 'sub_d07', customerName: 'Coastal Syndicators',    planName: 'Enterprise',          amount: usdc(999), createdDaysAgo: 138 }),
  activeSub({ id: 'sub_d08', customerName: 'Keystone Real Estate',   planName: 'Starter',             amount: usdc(199), createdDaysAgo: 61 }),
  activeSub({ id: 'sub_d09', customerName: 'Summit Deal Group',      planName: 'Professional',        amount: usdc(499), createdDaysAgo: 122 }),
  activeSub({ id: 'sub_d10', customerName: 'Vanguard Capital Co',    planName: 'Professional Annual', amount: usdc(4990), interval: 'year', createdDaysAgo: 328, periodEndInDays: 37 }),
  activeSub({ id: 'sub_d11', customerName: 'Lakefront Properties',   planName: 'Professional',        amount: usdc(499), createdDaysAgo: 44 }),
  activeSub({ id: 'sub_d12', customerName: 'GoldPath Investments',   planName: 'Starter',             amount: usdc(199), createdDaysAgo: 27 }),
  activeSub({ id: 'sub_d13', customerName: 'Ironclad Equity',        planName: 'Enterprise Annual',   amount: usdc(9990), interval: 'year', createdDaysAgo: 190, periodEndInDays: 175 }),
  activeSub({ id: 'sub_d14', customerName: 'Cedarstone Partners',    planName: 'Professional',        amount: usdc(499), list: usdc(599), createdDaysAgo: 13 }),
];

const DEMO_PAUSED = [
  { id: 'sub_p01', customerName: 'Northwind Holdings', customerEmail: emailFor('Northwind Holdings'), planName: 'Professional', interval: 'month', actualAmount: usdc(499), listPrice: usdc(499), created: daysAgoTs(240), currentPeriodEnd: now + 9 * day, totalSpend: usdc(499 * 6), cancelAt: null },
  { id: 'sub_p02', customerName: 'Riverbend Capital',  customerEmail: emailFor('Riverbend Capital'),  planName: 'Starter',      interval: 'month', actualAmount: usdc(199), listPrice: usdc(199), created: daysAgoTs(150), currentPeriodEnd: now + 4 * day, totalSpend: usdc(199 * 4), cancelAt: null },
];

const DEMO_CANCELED = [
  { id: 'sub_c01', customerName: 'Old Mill Investments', customerEmail: emailFor('Old Mill Investments'), planName: 'Starter',      interval: 'month', actualAmount: usdc(199), listPrice: usdc(199), created: daysAgoTs(320), canceledAt: daysAgoTs(70),  totalSpend: usdc(199 * 8) },
  { id: 'sub_c02', customerName: 'Brickline Group',      customerEmail: emailFor('Brickline Group'),      planName: 'Professional', interval: 'month', actualAmount: usdc(499), listPrice: usdc(499), created: daysAgoTs(410), canceledAt: daysAgoTs(120), totalSpend: usdc(499 * 9) },
  { id: 'sub_c03', customerName: 'Fairview Syndicate',   customerEmail: emailFor('Fairview Syndicate'),   planName: 'Starter',      interval: 'month', actualAmount: usdc(199), listPrice: usdc(199), created: daysAgoTs(260), canceledAt: daysAgoTs(30),  totalSpend: usdc(199 * 7) },
  { id: 'sub_c04', customerName: 'Granite Peak Partners',customerEmail: emailFor('Granite Peak Partners'),planName: 'Professional', interval: 'month', actualAmount: usdc(499), listPrice: usdc(499), created: daysAgoTs(500), canceledAt: daysAgoTs(200), totalSpend: usdc(499 * 10) },
];

const DEMO_ONEOFFS = [
  { id: 'txn_o01', customerName: 'Meridian Fund Partners', customerEmail: emailFor('Meridian Fund Partners'), description: 'Onboarding & data migration',   amount: usdc(1500), created: daysAgoTs(52) },
  { id: 'txn_o02', customerName: 'Apex Capital Group',     customerEmail: emailFor('Apex Capital Group'),     description: 'Custom investor portal setup',   amount: usdc(2500), created: daysAgoTs(88) },
  { id: 'txn_o03', customerName: 'Summit Deal Group',      customerEmail: emailFor('Summit Deal Group'),      description: 'Strategy consulting (4 hrs)',    amount: usdc(800),  created: daysAgoTs(19) },
];

const mrrOfSub = (s) => (s.interval === 'year' ? s.actualAmount / 12 : s.actualAmount);
const DEMO_MRR = Math.round(DEMO_ACTIVE.reduce((sum, s) => sum + mrrOfSub(s), 0) / 100);

// Monthly signups across active + canceled, keyed YYYY-MM for the last 14 months.
function makeMonthlySignups() {
  const counts = [2, 1, 2, 3, 2, 3, 2, 4, 3, 3, 4, 3, 2, 3];
  const out = {};
  counts.forEach((c, i) => {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - (counts.length - 1 - i), 1);
    out[ymKey(d)] = c;
  });
  return out;
}

const DEMO_SUBSCRIPTIONS = {
  subscriptions:        DEMO_ACTIVE,
  pausedSubscriptions:  DEMO_PAUSED,
  canceledSubscriptions: DEMO_CANCELED,
  oneOffTransactions:   DEMO_ONEOFFS,
  mrr:                  DEMO_MRR,
  uniqueClients:        DEMO_ACTIVE.length,
  totalEverCount:       DEMO_ACTIVE.length + DEMO_PAUSED.length + 11,
  totalCanceledAllTime: 11,
  avgSubLengthMonths:   14.6,
  avgLtv:               usdc(6840),
  newCustomersLast3Months: 3,
  monthlySignups:       makeMonthlySignups(),
  // Independent LTV / CAC windows -- { avgLtv (cents), newCustomers }.
  windowedStats: {
    '30':  { avgLtv: usdc(1490), newCustomers: 1 },
    '90':  { avgLtv: usdc(2380), newCustomers: 3 },
    '180': { avgLtv: usdc(4120), newCustomers: 6 },
    '365': { avgLtv: usdc(5960), newCustomers: 11 },
    'all': { avgLtv: usdc(6840), newCustomers: DEMO_ACTIVE.length + 11 },
  },
};

// ─── Marketing spend (/api/marketing-spend) ──────────────────────────────────
// Same payload for every ?days= window in demo (the query string is stripped).

const DEMO_MARKETING = {
  spend: 2400,
  spend3m: 7100,
  leads: 18,
  costPerLead: 133,
  customers: 3,
  cac: 800,
  marketingAccounts: ['Facebook Ads', 'LinkedIn Ads', 'Google Ads'],
  channels: [
    { name: 'LinkedIn',    spend: 1200, leads: 9 },
    { name: 'Email',       spend:  600, leads: 6 },
    { name: 'Referral',    spend:    0, leads: 2 },
    { name: 'Content/SEO', spend:  600, leads: 1 },
  ],
};

// ─── P&L (/api/pnl and /api/pnl/monthly) ─────────────────────────────────────

function makeMonths() {
  const labels   = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const incomes  = [9800, 10200, 11400, 12000, 12800, 13500, 14200, 15000, 15800, 16500, 17200, 18400];
  const expenses = [7200,  7800,  8100,  8400,  8800,  9100,  9400,  9800, 10100, 10400, 10800, 11200];
  return labels.map((label, i) => {
    const totalIncome   = incomes[i];
    const totalExpenses = expenses[i];
    return {
      label,
      isMTD: i === labels.length - 1,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      groupedExpenseLines: [
        { name: 'Marketing',   amount: Math.round(totalExpenses * 0.30), children: [] },
        { name: 'Contractors', amount: Math.round(totalExpenses * 0.38), children: [] },
        { name: 'Software',    amount: Math.round(totalExpenses * 0.15), children: [] },
        { name: 'Operations',  amount: Math.round(totalExpenses * 0.17), children: [] },
      ],
      groupedIncomeLines: [
        { name: 'Subscriptions', amount: totalIncome, children: [] },
      ],
    };
  });
}

const DEMO_MONTHS = makeMonths();

const DEMO_PNL = {
  reconciledThrough: '2026-05',
  years: [
    {
      year: 2025,
      totalIncome: 108600,
      totalExpenses: 78200,
      netIncome: 30400,
      endDate: '2025-12',
      groupedExpenseLines: [
        { name: 'Marketing',   amount: 23400, children: [] },
        { name: 'Contractors', amount: 29700, children: [] },
        { name: 'Software',    amount: 11700, children: [] },
        { name: 'Operations',  amount: 13400, children: [] },
      ],
      groupedIncomeLines: [
        { name: 'Subscriptions', amount: 108600, children: [] },
      ],
    },
    {
      year: 2026,
      totalIncome: 142800,
      totalExpenses: 94600,
      netIncome: 48200,
      endDate: '2026-05',
      groupedExpenseLines: [
        { name: 'Marketing',   amount: 28400, children: [] },
        { name: 'Contractors', amount: 35900, children: [] },
        { name: 'Software',    amount: 14200, children: [] },
        { name: 'Operations',  amount: 16100, children: [] },
      ],
      groupedIncomeLines: [
        { name: 'Subscriptions', amount: 142800, children: [] },
      ],
    },
  ],
};

// ─── Software subscriptions (/api/software-subscriptions) ────────────────────

function vendor(name, monthlyAvg, category, freq = 'Monthly', active = true) {
  const annualEst = freq === 'Annual' ? monthlyAvg : monthlyAvg * 12;
  return { name, monthlyAvg, annualEst, lastCharge: monthlyAvg, category, freq, active };
}

const DEMO_SOFTWARE = {
  vendors: [
    vendor('Railway',      120, 'Infrastructure'),
    vendor('OpenAI',       100, 'AI'),
    vendor('Anthropic',     90, 'AI'),
    vendor('Make.com',      50, 'Automation'),
    vendor('ClickUp',       40, 'Productivity'),
    vendor('GoHighLevel',   97, 'CRM'),
    vendor('Figma',         45, 'Design'),
    vendor('Google Workspace', 36, 'Productivity'),
    vendor('Stripe',        30, 'Payments'),
    vendor('Zoom',         149, 'Communication', 'Annual'),
    vendor('Notion',        24, 'Productivity', 'Monthly', false),
  ],
  vendors30d: [
    vendor('Railway',      120, 'Infrastructure'),
    vendor('OpenAI',       100, 'AI'),
    vendor('Anthropic',     90, 'AI'),
    vendor('GoHighLevel',   97, 'CRM'),
    vendor('Make.com',      50, 'Automation'),
    vendor('ClickUp',       40, 'Productivity'),
  ],
};

// ─── Cash Flow (/api/cashflow) ───────────────────────────────────────────────
// Builds the Sankey { nodes, links } exactly the way the server does (node
// indices, kinds, ordering) plus per-category line items for the hover popup
// and the drill-down modal.

const CASHFLOW_INCOME = [
  { name: 'Saas Income (Stripe)', amount: 128400, vendors: ['Apex Capital Group', 'Meridian Fund Partners', 'Coastal Syndicators', 'Harbor Wealth Partners', 'Summit Deal Group', 'Ironclad Equity'] },
  { name: 'Rebilling Income',     amount: 12800,  vendors: ['GoHighLevel Rebill', 'Twilio Rebill', 'Mailgun Rebill'] },
  { name: 'Consulting Income',    amount: 6000,   vendors: ['Apex Capital Group', 'Summit Deal Group'] },
];

const CASHFLOW_GROUPS = [
  {
    label: 'Cost of Revenue',
    leaves: [
      { name: 'Stripe Processing Fees',   amount: 4200, vendors: ['Stripe'] },
      { name: 'Hosting & Infrastructure', amount: 5400, vendors: ['Railway', 'Cloudflare', 'AWS'] },
    ],
  },
  {
    label: 'Operating Expenses',
    leaves: [
      { name: 'Marketing & Advertising', amount: 28400, vendors: ['Facebook Ads', 'LinkedIn Ads', 'Google Ads', 'YouTube'] },
      { name: 'Contractors',             amount: 35900, vendors: ['Upwork', 'Toptal Developer', 'Design Studio', 'VA Services'] },
      { name: 'Software Subscriptions',  amount: 14200, vendors: ['OpenAI', 'Anthropic', 'Make.com', 'ClickUp', 'Figma', 'Zoom'] },
      { name: 'Payroll',                 amount: 9600,  vendors: ['Gusto Payroll'] },
      { name: 'Office & Operations',     amount: 4100,  vendors: ['Google Workspace', 'Notion', 'Bench Bookkeeping'] },
    ],
  },
];

// Deterministically split a category total into line items across its vendors so
// the drill-down pie shows a realistic vendor breakdown that sums to the total.
function makeTxns(name, total, vendors, sign) {
  const count = Math.min(Math.max(vendors.length * 2, 4), 12);
  const rows = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const v = vendors[i % vendors.length];
    // Vary amounts a little (0.7x - 1.3x of the even split) without randomness.
    const base = total / count;
    const wobble = 1 + (((i * 7) % 5) - 2) * 0.12;
    let amount = Math.round(base * wobble);
    if (i === count - 1) amount = total - allocated; // last row absorbs the remainder
    allocated += amount;
    const d = new Date(NOW_MS - (i * 26 + 4) * day * 1000);
    rows.push({
      date: isoDate(d),
      description: `${v} ${sign > 0 ? 'payment' : 'charge'}`,
      counterparty: v,
      amount: sign * Math.abs(amount),
    });
  }
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function buildCashflow() {
  const nodes = [];
  const index = {};
  const id = (nm, kind) => {
    if (index[nm] === undefined) { index[nm] = nodes.length; nodes.push({ name: nm, kind }); }
    return index[nm];
  };
  const links = [];
  const transactionsByCategory = {};

  const HUB = 'Total Income';
  id(HUB, 'hub');

  const totalIncome = CASHFLOW_INCOME.reduce((s, l) => s + l.amount, 0);
  [...CASHFLOW_INCOME].sort((a, b) => b.amount - a.amount).forEach((l) => {
    links.push({ source: id(l.name, 'income'), target: id(HUB, 'hub'), value: l.amount });
    transactionsByCategory[l.name] = makeTxns(l.name, l.amount, l.vendors, 1);
  });

  let totalExpenses = 0;
  CASHFLOW_GROUPS.forEach((g) => { totalExpenses += g.leaves.reduce((s, l) => s + l.amount, 0); });
  const netIncome = totalIncome - totalExpenses;

  // Net Profit pass-through first so it pins to the top of the right side.
  if (netIncome > 0) {
    const bucket = id('profit-bucket', 'profitBucket');
    const leaf   = id('Net Profit', 'profit');
    links.push({ source: id(HUB, 'hub'), target: bucket, value: netIncome });
    links.push({ source: bucket, target: leaf, value: netIncome });
  }

  CASHFLOW_GROUPS.forEach((g) => {
    const total = g.leaves.reduce((s, l) => s + l.amount, 0);
    links.push({ source: id(HUB, 'hub'), target: id(g.label, 'group'), value: total });
    [...g.leaves].sort((a, b) => b.amount - a.amount).forEach((l) => {
      links.push({ source: id(g.label, 'group'), target: id(l.name, 'expense'), value: l.amount });
      transactionsByCategory[l.name] = makeTxns(l.name, l.amount, l.vendors, -1);
    });
  });

  const start = new Date(nowDate.getFullYear(), 0, 1);
  return {
    year: nowDate.getFullYear(),
    month: null,
    startDate: isoDate(start),
    endDate: isoDate(nowDate),
    nodes,
    links,
    totalIncome,
    totalExpenses,
    netIncome,
    netLoss: netIncome < 0,
    transactionsByCategory,
  };
}

const DEMO_CASHFLOW = buildCashflow();

// ─── Re-categorize Income (/api/digits/recat/preview) ────────────────────────
// This tab uses a raw fetch, so it reads this payload directly in demo mode.

const DEMO_RECAT = {
  previewId: 'demo-preview',
  count: 5,
  subscriptionCount: 3,
  rebillingCount: 1,
  unrecognizedCount: 1,
  rules: [
    { when: 'party or description mentions "rebill"',       categoryName: 'Rebilling Income' },
    { when: 'amount matches a known subscription plan price', categoryName: 'Saas Income (Stripe)' },
    { fallback: true, when: 'anything else',                 categoryName: 'Saas Income (Stripe)' },
  ],
  items: [
    { transactionId: 'demo_r1', date: isoDate(daysAgoDateObj(6)),  party: 'Apex Capital Group',     description: 'Stripe payout -- Professional plan', amountDollars: 499,  recognized: true,  proposedLabel: 'subscription_income' },
    { transactionId: 'demo_r2', date: isoDate(daysAgoDateObj(11)), party: 'Sunbelt Syndication',    description: 'Stripe payout -- Starter plan',      amountDollars: 199,  recognized: true,  proposedLabel: 'subscription_income' },
    { transactionId: 'demo_r3', date: isoDate(daysAgoDateObj(14)), party: 'GoHighLevel Rebill',     description: 'Rebilling -- SMS + email credits',   amountDollars: 320,  recognized: true,  proposedLabel: 'rebilling_income' },
    { transactionId: 'demo_r4', date: isoDate(daysAgoDateObj(18)), party: 'Meridian Fund Partners', description: 'Stripe payout -- Enterprise plan',   amountDollars: 999,  recognized: true,  proposedLabel: 'subscription_income' },
    { transactionId: 'demo_r5', date: isoDate(daysAgoDateObj(23)), party: 'Unknown deposit',        description: 'Bank transfer -- unclear source',    amountDollars: 1450, recognized: false, proposedLabel: null },
  ],
};

function daysAgoDateObj(n) { return new Date(NOW_MS - n * day * 1000); }

// ─── Registry ────────────────────────────────────────────────────────────────

const DEMO_DATA = {
  '/api/subscriptions':          DEMO_SUBSCRIPTIONS,
  '/api/revenue':                { ytdRevenue: usdc(74280), year: nowDate.getFullYear(), invoiceCount: 89 },
  '/api/pnl':                    DEMO_PNL,
  '/api/pnl/monthly':            { months: DEMO_MONTHS },
  '/api/marketing-spend':        DEMO_MARKETING,
  '/api/software-subscriptions': DEMO_SOFTWARE,
  '/api/cashflow':               DEMO_CASHFLOW,
  '/api/digits/recat/preview':   DEMO_RECAT,
};

export function getDemoResponse(url) {
  const path = url.split('?')[0];
  return DEMO_DATA[path] ?? null;
}
