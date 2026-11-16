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

// ─── Registry ────────────────────────────────────────────────────────────────


// ─── Cloudflare projects (/api/projects) ─────────────────────────────────────
// Powers the Projects page. Made-up project names; a mix of healthy, slow, failing and idle so every state shows.

const hoursAgoIso = (h) => new Date(NOW_MS - h * 3600 * 1000).toISOString();
const demoProject = (name, host, over = {}) => ({
  name, kind: 'worker', status: 'healthy', reason: 'Answering normally',
  url: host ? 'https://' + host : null, hosts: host ? [host] : [],
  httpStatus: host ? 200 : null, latencyMs: host ? 180 : null, checkedAt: hoursAgoIso(0.02),
  lastDeployedAt: hoursAgoIso(30), deployedVia: 'wrangler', triggers: [], requests24h: 1200, errors24h: 0, ...over,
});
const DEMO_PROJECT_LIST = [
  demoProject('northwind-portal', 'portal.northwind-demo.com', {
    status: 'down', reason: 'Last check returned HTTP 502', httpStatus: 502, latencyMs: 410, requests24h: 3120, errors24h: 3120, lastDeployedAt: hoursAgoIso(2),
  }),
  demoProject('harbor-billing', 'billing.harbor-demo.com', {
    status: 'degraded', reason: '96 of 1,480 requests failed (6.5%) in the last 24 hours', latencyMs: 940, requests24h: 1480, errors24h: 96, triggers: ['scheduled'], lastDeployedAt: hoursAgoIso(9),
  }),
  demoProject('summit-leads', 'app.summit-demo.com', {
    status: 'degraded', reason: 'Slow: answered in 3.4 s', latencyMs: 3400, requests24h: 5400, errors24h: 4, triggers: ['scheduled', 'queue'], lastDeployedAt: hoursAgoIso(4),
  }),
  demoProject('s2-command', 'command.demo-company.com', { latencyMs: null, requests24h: 980, triggers: ['scheduled'], lastDeployedAt: hoursAgoIso(1) }),
  demoProject('acme-marketing-site', 'acme-demo.com', { latencyMs: 95, requests24h: 8800, lastDeployedAt: hoursAgoIso(120) }),
  demoProject('bluebird-booking', 'book.bluebird-demo.com', { latencyMs: 260, requests24h: 2100, errors24h: 6, lastDeployedAt: hoursAgoIso(52) }),
  demoProject('cedar-api', 'api.cedar-demo.com', { httpStatus: 404, latencyMs: 130, requests24h: 20400, errors24h: 12, lastDeployedAt: hoursAgoIso(200) }),
  demoProject('delta-docs', 'docs.delta-demo.com', { latencyMs: 110, requests24h: 640, lastDeployedAt: hoursAgoIso(700) }),
  demoProject('evergreen-sync', null, { requests24h: 88, reason: 'No public address; judged by its traffic', triggers: ['queue'], lastDeployedAt: hoursAgoIso(300) }),
  demoProject('old-landing-preview', null, { status: 'inactive', reason: 'No public address and no traffic in the last 24 hours', requests24h: 0, lastDeployedAt: hoursAgoIso(1500) }),
  demoProject('spike-test', null, { status: 'inactive', reason: 'No public address and no traffic in the last 24 hours', requests24h: 0, lastDeployedAt: hoursAgoIso(2200) }),
];
const demoCount = (st) => DEMO_PROJECT_LIST.filter((p) => p.status === st).length;
const DEMO_PROJECTS = {
  configured: true,
  generatedAt: hoursAgoIso(0.05),
  summary: {
    total: DEMO_PROJECT_LIST.length,
    active: DEMO_PROJECT_LIST.length - demoCount('inactive'),
    inactive: demoCount('inactive'),
    healthy: demoCount('healthy'),
    degraded: demoCount('degraded'),
    down: demoCount('down'),
    requests24h: DEMO_PROJECT_LIST.reduce((n, p) => n + p.requests24h, 0),
    errors24h: DEMO_PROJECT_LIST.reduce((n, p) => n + p.errors24h, 0),
  },
  projects: DEMO_PROJECT_LIST,
  warnings: [],
};

const DEMO_DATA = {
  '/api/subscriptions':          DEMO_SUBSCRIPTIONS,
  '/api/revenue':                { ytdRevenue: usdc(74280), year: nowDate.getFullYear(), invoiceCount: 89 },
  '/api/projects':               DEMO_PROJECTS,
  '/api/projects/catalog':       { generatedAt: new Date().toISOString(), projects: [], planHtml: null },
};

export function getDemoResponse(url) {
  const path = url.split('?')[0];
  return DEMO_DATA[path] ?? null;
}
