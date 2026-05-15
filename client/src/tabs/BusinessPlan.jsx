import Card from '../components/ui/Card';

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

export default function BusinessPlan() {
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
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Unit Economics (Targets)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'ARPU (Monthly)', value: '$400-600' },
            { label: 'LTV (24mo avg)', value: '$8K-12K' },
            { label: 'Target CAC', value: 'under $500' },
            { label: 'LTV : CAC', value: '16:1 minimum' },
            { label: 'Gross Margin', value: '85%+' },
            { label: 'Payback Period', value: 'under 2 months' },
            { label: 'Annual Churn Target', value: 'under 15%' },
            { label: 'NPS Target', value: '50+' },
          ].map(m => (
            <div key={m.label} className="bg-bg border border-border rounded-lg p-3">
              <p className="text-xs text-muted mb-1">{m.label}</p>
              <p className="font-mono text-sm text-white font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
