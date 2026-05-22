const now  = Math.floor(Date.now() / 1000);
const day  = 86400;

const DEMO_SUBSCRIPTIONS = [
  { id: 'sub_d01', customerName: 'Apex Capital Group',      planName: 'Professional', actualAmount: 49900, created: now - 3  * day, status: 'active' },
  { id: 'sub_d02', customerName: 'Sunbelt Syndication',     planName: 'Starter',      actualAmount: 19900, created: now - 8  * day, status: 'active' },
  { id: 'sub_d03', customerName: 'Harbor Wealth Partners',  planName: 'Professional', actualAmount: 49900, created: now - 15 * day, status: 'active' },
  { id: 'sub_d04', customerName: 'Meridian Fund Partners',  planName: 'Enterprise',   actualAmount: 99900, created: now - 22 * day, status: 'active' },
  { id: 'sub_d05', customerName: 'Blueridge Equity LLC',    planName: 'Starter',      actualAmount: 19900, created: now - 31 * day, status: 'active' },
  { id: 'sub_d06', customerName: 'Peak Capital Group',      planName: 'Professional', actualAmount: 49900, created: now - 45 * day, status: 'active' },
  { id: 'sub_d07', customerName: 'Coastal Syndicators',     planName: 'Enterprise',   actualAmount: 99900, created: now - 60 * day, status: 'active' },
  { id: 'sub_d08', customerName: 'Keystone Real Estate',    planName: 'Starter',      actualAmount: 19900, created: now - 75 * day, status: 'active' },
  { id: 'sub_d09', customerName: 'Summit Deal Group',       planName: 'Professional', actualAmount: 49900, created: now - 90 * day, status: 'active' },
  { id: 'sub_d10', customerName: 'Vanguard Capital Co',     planName: 'Starter',      actualAmount: 19900, created: now - 100 * day, status: 'active' },
  { id: 'sub_d11', customerName: 'Lakefront Properties',    planName: 'Professional', actualAmount: 49900, created: now - 110 * day, status: 'active' },
  { id: 'sub_d12', customerName: 'GoldPath Investments',    planName: 'Starter',      actualAmount: 19900, created: now - 120 * day, status: 'active' },
];

function makeMonths() {
  const months = [];
  const labels = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const incomes   = [9800, 10200, 11400, 12000, 12800, 13500, 14200, 15000, 15800, 16500, 17200, 18400];
  const expenses  = [7200,  7800,  8100,  8400,  8800,  9100,  9400,  9800, 10100, 10400, 10800, 11200];
  labels.forEach((label, i) => {
    const totalIncome   = incomes[i];
    const totalExpenses = expenses[i];
    months.push({
      label,
      isMTD: i === labels.length - 1,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      groupedExpenseLines: [
        { name: 'Marketing',    amount: Math.round(totalExpenses * 0.30), children: [] },
        { name: 'Contractors',  amount: Math.round(totalExpenses * 0.38), children: [] },
        { name: 'Software',     amount: Math.round(totalExpenses * 0.15), children: [] },
        { name: 'Operations',   amount: Math.round(totalExpenses * 0.17), children: [] },
      ],
      groupedIncomeLines: [
        { name: 'Subscriptions', amount: totalIncome, children: [] },
      ],
    });
  });
  return months;
}

const DEMO_MONTHS = makeMonths();

const DEMO_DATA = {
  '/api/subscriptions': {
    subscriptions: DEMO_SUBSCRIPTIONS,
    mrr: 18400,
    uniqueClients: 12,
  },

  '/api/revenue': {
    ytdRevenue: 14280000,
    year: 2026,
    invoiceCount: 89,
  },

  '/api/pnl': {
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
  },

  '/api/pnl/monthly': {
    months: DEMO_MONTHS,
  },

  '/api/marketing-spend': {
    spend: 2400,
    leads: 18,
    costPerLead: 133,
    customers: 3,
    cac: 800,
    channels: [
      { name: 'LinkedIn',    spend: 1200, leads: 9  },
      { name: 'Email',       spend:  600, leads: 6  },
      { name: 'Referral',    spend:    0, leads: 2  },
      { name: 'Content/SEO', spend:  600, leads: 1  },
    ],
  },

  '/api/software-subscriptions': {
    vendors: [
      { name: 'Railway',      annualEst: 1440, lastCharge: 120, category: 'Infrastructure' },
      { name: 'OpenAI',       annualEst: 1200, lastCharge: 100, category: 'AI' },
      { name: 'Make.com',     annualEst:  600, lastCharge:  50, category: 'Automation' },
      { name: 'ClickUp',      annualEst:  480, lastCharge:  40, category: 'Productivity' },
      { name: 'Stripe',       annualEst:  360, lastCharge:  30, category: 'Payments' },
    ],
    vendors30d: [
      { name: 'Railway',  annualEst: 1440, lastCharge: 120, category: 'Infrastructure' },
      { name: 'OpenAI',   annualEst: 1200, lastCharge: 100, category: 'AI' },
    ],
  },
};

export function getDemoResponse(url) {
  const path = url.split('?')[0];
  return DEMO_DATA[path] ?? null;
}
