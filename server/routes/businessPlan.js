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
        'YouTube content flywheel (6-month runway)',
        'Referral program launch',
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
  ],
  risks: [
    { risk: 'Churn from cash-constrained operators', mitigation: 'Annual plan incentive, onboarding success tracking' },
    { risk: 'Large CRM enters vertical (Salesforce, HubSpot)', mitigation: 'Speed + focus -- move faster, niche deeper' },
    { risk: 'Regulatory change in syndication market', mitigation: 'Compliance features as a moat, not a liability' },
    { risk: 'Founder bandwidth constraint', mitigation: 'Hiring plan triggered at $20K MRR' },
  ],
};

// Only these top-level sections are editable -- anything else is ignored on write.
const EDITABLE_SECTIONS = ['vision', 'phases', 'moat', 'risks'];

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
