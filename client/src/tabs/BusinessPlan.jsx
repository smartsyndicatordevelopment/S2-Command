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
];

const MOAT = [
  { label: 'Vertical specificity', desc: 'Purpose-built for syndication -- generic CRMs will always be a step behind.' },
  { label: 'GHL ecosystem', desc: 'Deep integration with the tool syndicators already use for marketing automation.' },
  { label: 'Content flywheel', desc: 'YouTube + community builds trust in a relationship-driven market.' },
  { label: 'Switching cost', desc: 'Once investor histories, docs, and distributions live in S2, leaving is painful.' },
];

const RISKS = [
  { risk: 'Churn from cash-constrained operators', mitigation: 'Annual plan incentive, onboarding success tracking' },
  { risk: 'Large CRM enters vertical (Salesforce, HubSpot)', mitigation: 'Speed + focus -- move faster, niche deeper' },
  { risk: 'Regulatory change in syndication market', mitigation: 'Compliance features as a moat, not a liability' },
  { risk: 'Founder bandwidth constraint', mitigation: 'Hiring plan triggered at $20K MRR' },
];

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
      target: '$400-600',
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
      actual: '--',
      tooltip: null,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Business Plan</h1>
        <p className="text-xs text-muted mt-0.5">Strategic overview -- Syndication Systems LLC</p>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Vision</p>
        <p className="text-base text-white leading-relaxed">{VISION}</p>
      </Card>

      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Growth Roadmap</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {PHASES.map(p => (
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Competitive Moat</p>
          <div className="space-y-4 divide-y divide-border">
            {MOAT.map(m => (
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
            {RISKS.map(r => (
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
    </div>
  );
}
