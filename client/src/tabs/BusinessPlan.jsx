import { useState } from 'react';
import Card from '../components/ui/Card';
import { useApi } from '../hooks/useApi';

const VISION = 'The operating system for real estate capital raisers. Every syndicator running 2+ deals annually uses Smart Syndicator as their LP management layer.';

const PHASES = [
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
];

const MOAT = [
  { label: 'Vertical specificity', desc: 'Purpose-built for syndication -- generic CRMs will always be a step behind.' },
  { label: 'GHL ecosystem', desc: 'Deep integration with the tool syndicators already use for marketing automation.' },
  { label: 'Content flywheel', desc: 'YouTube + community builds trust in a relationship-driven market.' },
  { label: 'Switching cost', desc: 'Once investor histories, docs, and distributions live in S2, leaving is painful.' },
  { label: 'High-touch retention', desc: 'One weekly live call with Brandon (office hours, 2 PM CST) combines technical help, capital coaching, and the peer community -- it keeps members implementing.' },
];

const FLYWHEEL = {
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
};

const RISKS = [
  { risk: 'Churn from cash-constrained operators', mitigation: 'Monthly-first model ($2,000 setup deters quick cancellations), weekly office hours, onboarding success tracking' },
  { risk: 'GHL platform dependency (pricing, white-label terms, outages)', mitigation: 'Member data and automations kept exportable, Make.com workflows are platform-independent, coaching value transcends the platform -- monitor white-label terms for early warning' },
  { risk: 'Large CRM enters vertical (Salesforce, HubSpot)', mitigation: 'Speed + focus -- move faster, niche deeper' },
  { risk: 'Regulatory change in syndication market', mitigation: 'Compliance features as a moat, not a liability' },
  { risk: 'Founder bandwidth constraint', mitigation: 'Hiring plan triggered at $20K MRR' },
];

const COST_COMPARISON = {
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
};

function comparisonAsText(c) {
  const lines = [
    c.headline.toUpperCase(),
    '',
    c.positioning,
    '',
    `${c.diyLabel}: ${c.diyTotal}`,
    c.diyDetail,
    '',
    `${c.ssLabel}: ${c.ssTotal}`,
    c.ssDetail,
    '',
    'LINE BY LINE',
    ...c.rows.map(r => `- ${r.item}\n  DIY: ${r.diy}\n  Smart Syndicator: ${r.ss}`),
    '',
    c.footnote,
  ];
  return lines.join('\n');
}

const statusColor = {
  complete: 'bg-green/10 text-green border-green/20',
  active: 'bg-purple-muted text-purple border-purple/20',
  upcoming: 'bg-border text-muted border-border',
};

function fmtUsd(n, decimals = 0) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: decimals }).format(n);
}

function fmtK(n) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : fmtUsd(n);
}

export default function BusinessPlan() {
  const subs = useApi('/api/subscriptions');
  const mktg = useApi('/api/marketing-spend');
  const plan = useApi('/api/business-plan');

  // Editable plan content -- served from the API (agent-editable), with the
  // hardcoded constants as a fallback while loading or if a section is missing.
  const vision = plan.data?.vision || VISION;
  const phases = plan.data?.phases || PHASES;
  const flywheel = plan.data?.flywheel || FLYWHEEL;
  const moat   = plan.data?.moat   || MOAT;
  const risks  = plan.data?.risks  || RISKS;
  const comparison = plan.data?.costComparison || COST_COMPARISON;

  const mrr               = subs.data?.mrr || 0;
  const uniqueClients     = subs.data?.uniqueClients || 0;
  const avgLtv            = (subs.data?.avgLtv || 0) / 100;
  const totalCanceled     = subs.data?.totalCanceledAllTime || 0;
  const totalEver         = subs.data?.totalEverCount || 0;
  const newLast3m         = subs.data?.newCustomersLast3Months || 0;
  const spend3m           = mktg.data?.spend3m || 0;
  const qbReady           = !mktg.data?.notConfigured && mktg.data !== null;

  const arpu          = uniqueClients > 0 ? mrr / uniqueClients : 0;
  const cac           = qbReady && newLast3m > 0 ? spend3m / newLast3m : 0;
  const ltvCacRatio   = cac > 0 && avgLtv > 0 ? avgLtv / cac : 0;
  const paybackMonths = arpu > 0 && cac > 0 ? cac / arpu : 0;
  const churnPct      = totalEver > 0 ? (totalCanceled / totalEver) * 100 : 0;

  const a = (val, fmt) => (val > 0 ? fmt(val) : '--');

  const metrics = [
    {
      label: 'ARPU (Monthly)',
      target: '~$297',
      actual: a(arpu, v => fmtUsd(v)),
      tooltip: arpu > 0
        ? `MRR (${fmtUsd(mrr)}) / ${uniqueClients} active clients`
        : null,
    },
    {
      label: 'LTV (24mo avg)',
      target: '$8K-12K',
      actual: a(avgLtv, v => fmtK(v)),
      tooltip: avgLtv > 0
        ? `Total all-time spend / unique paying customers`
        : null,
    },
    {
      label: 'Target CAC',
      target: 'under $500',
      actual: a(cac, v => fmtUsd(v)),
      tooltip: cac > 0
        ? `${fmtUsd(spend3m)} mktg spend (90 days) / ${newLast3m} new customers`
        : qbReady ? `No Digits marketing categories found` : `Connect Digits to calculate`,
    },
    {
      label: 'LTV : CAC',
      target: '16:1 minimum',
      actual: a(ltvCacRatio, v => `${v.toFixed(1)}:1`),
      tooltip: ltvCacRatio > 0
        ? `LTV (${fmtK(avgLtv)}) / CAC (${fmtUsd(cac)})`
        : null,
    },
    {
      label: 'Gross Margin',
      target: '85%+',
      actual: '79%',
      tooltip: 'Lifetime gross margin from the books (static reference) -- live calculation needs cost-of-services categorization in Digits',
    },
    {
      label: 'MRR vs Breakeven',
      target: '$4,703/mo',
      actual: a(mrr, v => fmtUsd(v)),
      tooltip: mrr > 0
        ? `Current MRR (${fmtUsd(mrr)}) covers ${((mrr / 4703) * 100).toFixed(0)}% of the $4,703/mo lifetime-average breakeven`
        : null,
    },
    {
      label: 'Payback Period',
      target: 'under 2 months',
      actual: a(paybackMonths, v => `${v.toFixed(1)} mo`),
      tooltip: paybackMonths > 0
        ? `CAC (${fmtUsd(cac)}) / ARPU (${fmtUsd(arpu)})`
        : null,
    },
    {
      label: 'Annual Churn Target',
      target: 'under 15%',
      actual: totalEver > 0 ? `${churnPct.toFixed(1)}%` : '--',
      tooltip: totalEver > 0
        ? `${totalCanceled} canceled / ${totalEver} all-time subscribers`
        : null,
    },
    {
      label: 'NPS Target',
      target: '50+',
      actual: '--',
      tooltip: null,
    },
  ];

  const isLoading = subs.loading || mktg.loading;
  const [hoveredMetric, setHoveredMetric] = useState(null);
  const [copyState, setCopyState] = useState('idle');

  async function copyComparison() {
    try {
      await navigator.clipboard.writeText(comparisonAsText(comparison));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Business Plan</h1>
        <p className="text-xs text-muted mt-0.5">Strategic overview -- Syndication Systems LLC</p>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Vision</p>
        <p className="text-base text-white leading-relaxed">{vision}</p>
      </Card>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Growth Roadmap</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {phases.map(p => (
            <div key={p.phase} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted">{p.phase}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor[p.status]}`}>
                  {p.status === 'complete' ? 'Done' : p.status === 'active' ? 'Now' : 'Later'}
                </span>
              </div>
              <p className="text-sm font-semibold text-white mb-3">{p.title}</p>
              <ul className="space-y-1.5">
                {p.items.map(item => (
                  <li key={item} className="flex items-start gap-1.5 text-xs text-dim">
                    <span className="text-purple mt-0.5 flex-shrink-0">--</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-2">Growth Flywheel</p>
        <p className="text-xs text-dim leading-relaxed mb-4">{flywheel.intro}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {flywheel.stages.map((s, i) => (
            <div key={s.stage} className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-mono text-muted">{i + 1}</span>
                <p className="text-sm font-semibold text-purple">{s.stage}</p>
              </div>
              <p className="text-xs text-white mb-3">{s.goal}</p>
              <ul className="space-y-1.5">
                {s.items.map(item => (
                  <li key={item} className="flex items-start gap-1.5 text-xs text-dim">
                    <span className="text-purple mt-0.5 flex-shrink-0">--</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {flywheel.keyInsight && (
          <p className="text-xs text-muted mt-3 leading-relaxed">
            <span className="text-purple font-medium">Key insight: </span>
            {flywheel.keyInsight}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Competitive Moat</p>
          <div className="space-y-4 divide-y divide-border">
            {moat.map(m => (
              <div key={m.label} className="pt-4 first:pt-0">
                <p className="text-sm font-medium text-purple mb-1">{m.label}</p>
                <p className="text-xs text-dim leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Risk Register</p>
          <div className="space-y-4 divide-y divide-border">
            {risks.map(r => (
              <div key={r.risk} className="pt-4 first:pt-0">
                <p className="text-sm font-medium text-yellow mb-1">{r.risk}</p>
                <p className="text-xs text-dim leading-relaxed">{r.mitigation}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Unit Economics Targets</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map(m => (
            <div key={m.label} className="bg-bg border border-border rounded-lg p-3">
              <p className="text-xs text-muted mb-2">{m.label}</p>
              <div className="flex justify-between items-end gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Target</p>
                  <p className="font-mono text-sm text-white font-semibold">{m.target}</p>
                </div>
                <div
                  className="relative text-right"
                  onMouseEnter={() => m.tooltip && setHoveredMetric(m.label)}
                  onMouseLeave={() => setHoveredMetric(null)}
                >
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-0.5">Actual</p>
                  {isLoading ? (
                    <span className="inline-block w-3 h-3 border border-yellow border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <p className={`font-mono text-sm font-semibold ${m.actual === '--' ? 'text-muted' : 'text-yellow'} ${m.tooltip ? 'cursor-help' : ''}`}>
                      {m.actual}
                    </p>
                  )}
                  {hoveredMetric === m.label && m.tooltip && (
                    <div className="absolute bottom-full right-0 mb-2 z-50 max-w-xs bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted shadow-lg whitespace-pre-line pointer-events-none">
                      {m.tooltip}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">CROS Cost Comparison -- Sales Tool</p>
            <p className="text-sm font-semibold text-white">{comparison.headline}</p>
          </div>
          <button
            onClick={copyComparison}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-white hover:border-purple transition-colors"
          >
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy for marketing'}
          </button>
        </div>
        <p className="text-xs text-dim leading-relaxed mb-5">{comparison.positioning}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-bg border border-border rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">{comparison.diyLabel}</p>
            <p className="font-mono text-xl font-semibold text-white">{comparison.diyTotal}</p>
            <p className="text-xs text-dim mt-1.5 leading-relaxed">{comparison.diyDetail}</p>
          </div>
          <div className="bg-purple-muted border border-purple/20 rounded-lg p-4">
            <p className="text-[10px] uppercase tracking-wider text-purple mb-1.5">{comparison.ssLabel}</p>
            <p className="font-mono text-xl font-semibold text-purple">{comparison.ssTotal}</p>
            <p className="text-xs text-dim mt-1.5 leading-relaxed">{comparison.ssDetail}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="text-[10px] uppercase tracking-wider text-muted font-medium py-2 pr-4 w-1/4">Component</th>
                <th className="text-[10px] uppercase tracking-wider text-muted font-medium py-2 pr-4">Assemble it yourself</th>
                <th className="text-[10px] uppercase tracking-wider text-purple font-medium py-2">Smart Syndicator</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map(r => (
                <tr key={r.item} className="border-b border-border last:border-b-0">
                  <td className="py-3 pr-4 text-xs font-medium text-white align-top">{r.item}</td>
                  <td className="py-3 pr-4 text-xs text-dim align-top leading-relaxed">{r.diy}</td>
                  <td className="py-3 text-xs text-dim align-top leading-relaxed">{r.ss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted mt-4 leading-relaxed">{comparison.footnote}</p>
      </Card>
    </div>
  );
}
