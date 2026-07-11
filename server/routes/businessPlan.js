const router = require('express').Router();
const { query } = require('../lib/db');

// The editable business plan document. These defaults mirror what used to be
// hardcoded in the client (BusinessPlan.jsx) and seed the DB on first read.
const DEFAULT_PLAN = {
  vision: 'The operating system for real estate capital raisers. Every syndicator running 2+ deals annually uses Smart Syndicator as their LP management layer.',
  phases: [
    {
      phase: 'Phase 1',
      title: 'Foundation',
      status: 'complete',
      items: [
        'Core investor CRM + portal',
        'GHL integration for email/SMS automation',
        'Stripe billing + subscription management',
        'First 10 paying customers',
      ],
    },
    {
      phase: 'Phase 2',
      title: 'Revenue Engine',
      status: 'active',
      items: [
        'Reach $20K MRR',
        'Execute CROS repositioning (framing language, ad copy, demo script pre-frame)',
        'YouTube content flywheel (6-month runway)',
        'Grow affiliate program (25% recurring commissions, live)',
        'Distribution + K-1 workflow module',
      ],
    },
    {
      phase: 'Phase 3',
      title: 'Scale',
      status: 'upcoming',
      items: [
        '$50K MRR + 200 active clients',
        'Accreditation verification integration',
        'Deal room / data room feature',
        'API for sponsor-branded portals',
      ],
    },
    {
      phase: 'Phase 4',
      title: 'Market Leadership',
      status: 'upcoming',
      items: [
        '$100K+ MRR',
        'Partnership with syndication attorneys + CPAs',
        'White-label offering for real estate funds',
        'Acquisition or Series A exploration',
      ],
    },
  ],
  moat: [
    { label: 'Vertical specificity', desc: 'Purpose-built for syndication -- generic CRMs will always be a step behind.' },
    { label: 'GHL ecosystem', desc: 'Deep integration with the tool syndicators already use for marketing automation.' },
    { label: 'Content flywheel', desc: 'YouTube + community builds trust in a relationship-driven market.' },
    { label: 'Switching cost', desc: 'Once investor histories, docs, and distributions live in S2, leaving is painful.' },
    { label: 'High-touch retention', desc: 'One weekly live call with Brandon (office hours, 2 PM CST) combines technical help, capital coaching, and the peer community -- it keeps members implementing.' },
  ],
  flywheel: {
    intro: 'Compounding growth model -- each stage feeds the next. Addressable market: 45,000-55,000 US Operators ($1.2B-$1.8B annual software + services spend) plus 120,000-150,000 Builders ($600M-$900M).',
    stages: [
      {
        stage: 'Acquisition',
        goal: 'Build authority, generate inbound demo requests',
        items: [
          'LinkedIn content engine -- daily posts, client wins',
          'YouTube long form + shorts -- deal breakdowns, automation demos',
          'Scroll-stopper ads on capital-raising pain points',
          'Lead magnets, webinars, podcast guesting',
        ],
      },
      {
        stage: 'Activation',
        goal: 'Tangible result within 3-10 days of joining',
        items: [
          'Demo-driven onboarding',
          'Investor Magnet Sprint -- reactivates dormant contacts, first investor responses within 10 days',
          '$2,000 buildout: CRM config, pipelines, templates, core automations live',
          'Milestones: list cleaned, first campaign sent, first investor conversation',
        ],
      },
      {
        stage: 'Retention',
        goal: 'Keep annual churn under 15%',
        items: [
          'One weekly live call with Brandon (2 PM CST) -- technical help, capital coaching, and the peer community in a single session',
          'Monthly-first billing -- $2,000 setup deters quick cancellations',
          'Template + workflow library updates',
          'Fast support resolution of technical and workflow issues',
        ],
      },
      {
        stage: 'Referral',
        goal: 'Members become the sales channel',
        items: [
          'Affiliate program (live) -- 25% recurring commissions',
          'Bring-a-friend incentives',
          'Showcasing member wins and reactivation results',
          'Office-hours members introduce peers',
        ],
      },
    ],
    keyInsight: 'Activation is the strongest predictor of retention -- the Investor Magnet Sprint is the core mechanism.',
  },
  risks: [
    { risk: 'Churn from cash-constrained operators', mitigation: 'Monthly-first model ($2,000 setup deters quick cancellations), weekly office hours, onboarding success tracking' },
    { risk: 'GHL platform dependency (pricing, white-label terms, outages)', mitigation: 'Member data and automations kept exportable, Make.com workflows are platform-independent, coaching value transcends the platform -- monitor white-label terms for early warning' },
    { risk: 'Large CRM enters vertical (Salesforce, HubSpot)', mitigation: 'Speed + focus -- move faster, niche deeper' },
    { risk: 'Regulatory change in syndication market', mitigation: 'Compliance features as a moat, not a liability' },
    { risk: 'Founder bandwidth constraint', mitigation: 'Hiring plan triggered at $20K MRR' },
  ],
  costComparison: {
    headline: 'Build your investor pipeline yourself, or have it installed.',
    positioning: 'Smart Syndicator is a CROS: a Capital Raising Operating System. A turbocharger for a capital-raising business that is already running -- built for syndicators and fund managers who have deals and investors, not beginners. It accelerates a running business, it does not start one.',
    ssLabel: 'Smart Syndicator : Year One',
    ssTotal: 'About $6,000',
    ssDetail: '$2,000 buildout + $297/month + usage ($20-60/month, like your phone bill). Live in days, not months.',
    diyLabel: 'Assemble It Yourself : Year One',
    diyTotal: '$14,800 to $59,000',
    diyDetail: 'Five vendors, 2-4 months of setup, and the member is the project manager.',
    rows: [
      { item: 'CRM platform', diy: '$100-500/month subscription, configured by them', ss: 'Included -- investor CRM with capital-raising pipelines, ready day one' },
      { item: 'Setup + automation build', diy: '$2,500-7,500 one-time CRM consultant or automation agency', ss: 'Included in buildout -- fields, pipelines, smart lists, automations configured' },
      { item: 'Investor list import', diy: 'Often billed extra, or a weekend in spreadsheets', ss: 'Included in buildout -- imported, cleaned, segmented' },
      { item: 'Email + SMS campaigns', diy: '$1,500-5,000 freelance copywriter plus their time loading sequences', ss: 'Included in buildout -- written for capital raisers, loaded and ready' },
      { item: 'Landing pages + funnels', diy: '$1,000-3,500 designer or funnel builder per project', ss: 'Included -- proven templates, installed' },
      { item: 'Capital-raising coaching', diy: '$5,000-25,000/year program or mastermind, sold separately from tech', ss: 'Included -- weekly live call with a practitioner (LP in apartment deals, GP on 70+ notes across 22 states)' },
      { item: 'Ongoing technical help', diy: '$300-1,000/month VA or agency retainer', ss: 'Included -- live help on the same weekly call, plus ongoing platform management by the team' },
      { item: 'Sending costs (email/SMS)', diy: 'Billed by their CRM anyway', ss: '$20-60/month typical, passed through at cost' },
    ],
    footnote: 'DIY ranges are typical 2026 market rates for each component; third-party pricing varies by provider and scope. Use on sales calls to pre-frame the $2,000 setup + $297/month against the real alternative, not against CRM subscriptions.',
  },
};

// Only these top-level sections are editable -- anything else is ignored on write.
const EDITABLE_SECTIONS = ['vision', 'phases', 'flywheel', 'moat', 'risks', 'costComparison'];

async function readPlan() {
  const { rows } = await query('SELECT data FROM business_plan WHERE id = 1');
  if (rows.length && rows[0].data) {
    // Backfill any missing sections from defaults so the page never renders blank.
    return { ...DEFAULT_PLAN, ...rows[0].data };
  }
  // Seed the default document on first access.
  await query(
    `INSERT INTO business_plan(id, data) VALUES(1, $1) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(DEFAULT_PLAN)]
  );
  return DEFAULT_PLAN;
}

// Merge a partial update ({ vision?, phases?, moat?, risks? }) into the current
// plan and persist. Returns the saved document.
async function updatePlan(partial) {
  const current = await readPlan();
  const next = { ...current };
  for (const key of EDITABLE_SECTIONS) {
    if (partial && partial[key] !== undefined) next[key] = partial[key];
  }
  await query(
    `INSERT INTO business_plan(id, data, updated_at) VALUES(1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(next)]
  );
  return next;
}

router.get('/business-plan', async (req, res) => {
  try {
    res.json(await readPlan());
  } catch (err) {
    console.error('business-plan read error:', err.message);
    res.status(500).json({ error: 'Failed to load business plan' });
  }
});

module.exports = router;
module.exports.readPlan = readPlan;
module.exports.updatePlan = updatePlan;
module.exports.DEFAULT_PLAN = DEFAULT_PLAN;
module.exports.EDITABLE_SECTIONS = EDITABLE_SECTIONS;
