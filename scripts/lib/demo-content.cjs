// Invented demo content for the S2 Command test copy. The fictitious sponsor is "ABC Capital Group": invented people,
// example.com addresses only, nothing real. Used by scripts/seed-dev.cjs.

const SPONSOR = 'ABC Capital Group';

// [agent, session name, days ago, [[role, text], ...]]
const CHATS = [
  ['ghl', 'Reactivate dormant investors', 1, [
    ['user', 'How many investors in the ABC Capital Group list have not opened an email in 90 days?'],
    ['assistant', 'About 412 of 1,860 contacts (22%) have not opened anything in 90 days. 138 of them previously invested in Fund I. I would start with those 138: a short personal note from the managing partner, then a 3-email sequence over 10 days.'],
    ['user', 'Draft the first email for the Fund I group. Warm, short, no hype.'],
    ['assistant', 'Subject: A quick update on Maple Grove\n\nHi {{first_name}}, Maple Grove (Fund I) closed its refinance last month and distributions are on schedule. I wanted you to hear it from me first. If you would like a 15 minute call about what we are planning next, reply here. Thank you for your trust. -- Dana Whitfield, ABC Capital Group'],
    ['user', 'Good. Queue it as a draft only, do not send.'],
    ['assistant', 'Saved as a draft named "Fund I reactivation 1". Nothing was sent. It will need your approval in the app before it goes out.'],
  ]],
  ['ghl', 'Pipeline review before the Oakridge raise', 3, [
    ['user', 'Show the investor pipeline by stage for the Oakridge Apartments raise.'],
    ['assistant', 'Oakridge (target $4.5M): Interested 61 contacts ($1.9M soft), Committed 14 ($1.3M), Docs sent 9 ($880K), Funded 6 ($610K). Biggest drop-off is Interested to Committed: 23% convert.'],
    ['user', 'What usually moves people from Interested to Committed?'],
    ['assistant', 'In your history, investors who attend the live Q&A convert at roughly 3x the rate of those who only read the deck. A reminder text the morning of the call lifts attendance about 15%.'],
  ]],
  ['ghl', 'Clean up duplicate contacts', 6, [
    ['user', 'Find duplicate contacts by email.'],
    ['assistant', 'Found 37 duplicate pairs (same email, different spelling of the name). Examples: "Pat Rivera" and "Patricia Rivera" (pat.rivera@example.com). I can propose merges for your review.'],
    ['user', 'Propose them, but do not apply anything.'],
    ['assistant', 'Proposal ready: 37 merges listed with the record I would keep in each pair. Nothing has been changed.'],
  ]],
  ['clickup', 'Weekly planning: closing Oakridge', 2, [
    ['user', 'What is overdue in the Oakridge closing project?'],
    ['assistant', '3 tasks are overdue: (1) Insurance binder from broker, 4 days late, owner Marcus Lee. (2) Lender estoppel letter, 2 days late, owner Priya Nair. (3) Update PPM supplement, 1 day late, owner Dana Whitfield.'],
    ['user', 'Create a follow-up task for the insurance binder due Friday.'],
    ['assistant', 'Created "Chase insurance binder (Oakridge)" assigned to Marcus Lee, due Friday. It is listed in the change log so you can undo it.'],
  ]],
  ['clickup', 'Quarterly investor report checklist', 9, [
    ['user', 'Build a checklist for the Q3 investor report.'],
    ['assistant', 'Checklist: 1) Close books for the quarter. 2) Occupancy and rent roll summary per property. 3) Capex update with photos. 4) Distribution schedule. 5) Market commentary. 6) Compliance review. 7) Send to investors and log opens.'],
    ['user', 'Add owners and put the send date at the 20th.'],
    ['assistant', 'Owners added (Priya: books and distributions, Marcus: capex and photos, Dana: commentary and send). Send date set to the 20th.'],
  ]],
  ['clickup', 'Decision log: refinance vs. sell Maple Grove', 14, [
    ['user', 'Record the decision about Maple Grove.'],
    ['assistant', 'Decision logged: refinance and hold for 24 more months. Reasons: rate lock at 5.6%, rents up 7% year over year, projected equity multiple 1.9x vs 1.6x if sold now. Owner: Dana Whitfield. Review date: next January.'],
  ]],
  ['fb', 'Ad performance last 30 days', 2, [
    ['user', 'Which ad creative should we pause?'],
    ['assistant', 'The "Passive income, explained" video has a cost per lead of $48 against a $22 average and a click-through rate of 0.6%. I suggest pausing it and moving its budget to the "Meet the team" carousel ($17 per lead).'],
    ['user', 'Do not change anything yet. Just note the recommendation.'],
    ['assistant', 'Noted. No ad settings were changed.'],
  ]],
  ['fb', 'Webinar registrations', 5, [
    ['user', 'How many webinar registrations came from Facebook this month?'],
    ['assistant', '214 registrations from Facebook ads at an average of $19.40 each, 31% of them attended live. Retargeting the no-shows with the replay link is the cheapest next step.'],
  ]],
  ['overview', 'Monday morning summary', 1, [
    ['user', 'Give me a summary of the business this week.'],
    ['assistant', 'Sample summary for the test copy: subscriptions steady, 4 new customers, 1 pause. Investor pipeline up 6%. Two ad creatives to review. Three project tasks overdue. This text is invented demo content.'],
  ]],
  ['digits', 'Software subscriptions review', 4, [
    ['user', 'Which software subscriptions look unused?'],
    ['assistant', 'Sample answer for the test copy: three tools show no login in 60 days (a webinar plug-in, a design app, an old survey tool), about $146 a month combined. Nothing real is connected here.'],
  ]],
  ['make', 'Zap-style automation ideas', 7, [
    ['user', 'What could we automate when a new investor books a call?'],
    ['assistant', 'Create the contact record, tag "Booked call", send a confirmation text the same day, add a prep task for the sponsor, and send a reminder two hours before the call.'],
  ]],
  ['ghl', 'Draft: capital call notice wording', 12, [
    ['user', 'Draft a plain-English capital call notice for Oakridge.'],
    ['assistant', 'Draft: "Hello {{first_name}}, this is a notice that the first capital call for Oakridge Apartments is due on the date shown in your investor portal. Please wire the amount listed there. Verify wire instructions by phone with our office before sending funds. We will never change instructions by email."'],
    ['user', 'Add the phone verification line in bold.'],
    ['assistant', 'Done. The verification sentence is now bold in the saved draft. Not sent.'],
  ]],
];

// [id suffix, agent, days ago, description, action, undone]
const CHANGELOG = [
  ['ghl', 1, 'Created draft email "Fund I reactivation 1" (not sent)', { type: 'create_draft', name: 'Fund I reactivation 1' }, false],
  ['ghl', 1, 'Tagged 138 Fund I investors with "reactivation-2026"', { type: 'add_tag', tag: 'reactivation-2026', count: 138 }, false],
  ['ghl', 2, 'Moved 9 contacts from Interested to Committed (Oakridge)', { type: 'move_stage', count: 9 }, false],
  ['ghl', 3, 'Updated opportunity value for "Patel family trust" to $150,000', { type: 'update_opportunity', value: 150000 }, true],
  ['ghl', 4, 'Created smart list "Oakridge no response 14 days"', { type: 'create_list' }, false],
  ['ghl', 6, 'Merged duplicate contacts "Pat Rivera" and "Patricia Rivera"', { type: 'merge_contacts' }, false],
  ['ghl', 8, 'Added webinar attendance tag to 62 contacts', { type: 'add_tag', count: 62 }, false],
  ['ghl', 11, 'Paused workflow "Old welcome sequence"', { type: 'pause_workflow' }, false],
  ['ghl', 12, 'Saved draft capital call notice for Oakridge (not sent)', { type: 'create_draft' }, false],
  ['clickup', 2, 'Created task "Chase insurance binder (Oakridge)" for Marcus Lee', { type: 'create_task' }, false],
  ['clickup', 3, 'Moved task "Lender estoppel letter" to In Progress', { type: 'update_task' }, false],
  ['clickup', 5, 'Set due date on "Update PPM supplement" to Friday', { type: 'update_task' }, true],
  ['clickup', 9, 'Created Q3 investor report checklist (7 tasks)', { type: 'create_tasks', count: 7 }, false],
  ['clickup', 14, 'Logged decision: refinance and hold Maple Grove', { type: 'create_doc' }, false],
  ['clickup', 16, 'Archived 11 completed tasks from the Fund I list', { type: 'archive_tasks', count: 11 }, false],
  ['fb', 2, 'Recorded recommendation to pause "Passive income, explained" (no change made)', { type: 'note' }, false],
  ['fb', 5, 'Raised daily budget on "Meet the team" carousel from $30 to $45', { type: 'update_budget', from: 30, to: 45 }, false],
  ['fb', 10, 'Paused ad set "Cold audience 55+"', { type: 'pause_ad_set' }, true],
  ['fb', 18, 'Duplicated webinar campaign for the Oakridge raise', { type: 'duplicate_campaign' }, false],
];

const PLAN = {
  vision: `${SPONSOR} is a multifamily syndication sponsor that gives everyday investors a clear, honest way to own apartment communities. Within five years we want 12 stabilized properties, 1,500 investors who stay with us, and an investor experience people tell their friends about.`,
  phases: [
    { phase: 'Phase 1', title: 'Foundation', status: 'complete', items: ['Close Fund I (Maple Grove, 148 units)', 'Build investor list to 1,500 contacts', 'Launch investor portal and monthly updates', 'First distributions paid on schedule'] },
    { phase: 'Phase 2', title: 'Second Fund', status: 'active', items: ['Raise $4.5M for Oakridge Apartments (216 units)', 'Run two live investor webinars per quarter', 'Reach 40% repeat-investor rate', 'Hire an investor relations coordinator'] },
    { phase: 'Phase 3', title: 'Scale', status: 'upcoming', items: ['Acquire 3 more properties in the Sun Belt', 'Add a quarterly investor town hall', 'Open a co-GP program with local operators'] },
    { phase: 'Phase 4', title: 'Institutional Quality', status: 'upcoming', items: ['Audited annual financials for every fund', 'Own a portfolio of 12 properties', 'Explore a fund-of-funds structure'] },
  ],
  moat: [
    { label: 'Investor trust', desc: 'Plain-English reports and on-time distributions; every investor can reach a person.' },
    { label: 'Local sourcing', desc: 'Broker relationships in three growth metros produce off-market deals.' },
    { label: 'Education first', desc: 'Free webinars turn curious readers into informed investors.' },
    { label: 'Operations discipline', desc: 'Standard monthly property scorecards catch problems early.' },
  ],
  flywheel: {
    intro: 'Each stage feeds the next: education builds trust, trust brings capital, strong results bring referrals. (Invented demo content for the test copy.)',
    stages: [
      { stage: 'Awareness', goal: 'Reach new accredited investors', items: ['Monthly webinars', 'Short market videos', 'Podcast guest spots', 'Targeted social ads'] },
      { stage: 'Trust', goal: 'Move readers to a first call', items: ['Welcome email series', 'Deal walkthrough videos', 'Open Q&A sessions'] },
      { stage: 'Investing', goal: 'Smooth first investment', items: ['Clear subscription documents', 'Wire verification by phone', 'Portal access in 24 hours'] },
      { stage: 'Referral', goal: 'Investors introduce friends', items: ['Annual investor appreciation event', 'Simple referral introductions', 'Share property wins'] },
    ],
    keyInsight: 'Investors who attend one live Q&A are about three times as likely to invest as those who only read the deck.',
  },
  risks: [
    { risk: 'Interest rate increases', mitigation: 'Fixed-rate or capped debt, conservative leverage, reserves for 6 months of debt service' },
    { risk: 'Slow lease-up at a new property', mitigation: 'Realistic underwriting, pre-leasing plan, flexible renovation schedule' },
    { risk: 'Key person risk', mitigation: 'Documented processes, an operating partner agreement, and key-person insurance' },
    { risk: 'Regulatory changes for private offerings', mitigation: 'Securities counsel review of every offering and ads' },
  ],
  costComparison: {
    headline: 'Passive investing in apartments, without the landlord work.',
    positioning: `${SPONSOR} lets investors own a share of professionally managed apartment communities instead of buying and running a rental alone.`,
    ssLabel: `Invest with ${SPONSOR}`,
    ssTotal: 'From $50,000',
    ssDetail: 'Quarterly reports, portal access, and a named contact. Typical hold: 5 to 7 years.',
    diyLabel: 'Buy a small rental yourself',
    diyTotal: 'Your time plus $60,000 to $100,000',
    diyDetail: 'Find the deal, finance it, manage tenants, handle repairs, and carry the risk alone.',
    rows: [
      { item: 'Finding deals', diy: 'Your own search, often hundreds of hours', ss: 'Sourced and underwritten by the team' },
      { item: 'Property management', diy: 'You or a paid manager', ss: 'Professional third-party manager, supervised monthly' },
      { item: 'Diversification', diy: 'One or two properties', ss: 'A share of a 100+ unit community' },
      { item: 'Reporting', diy: 'Whatever you track yourself', ss: 'Quarterly reports and a K-1 each year' },
    ],
    footnote: 'Invented demo content. Not an offer or advice. Investments involve risk, including loss of principal.',
  },
};

module.exports = { SPONSOR, CHATS, CHANGELOG, PLAN };
