import Card from '../components/ui/Card';

const POSITIONING = {
  tagline: 'The CRM built for capital raisers.',
  oneLinear: 'Smart Syndicator gives real estate syndicators a professional investor portal, pipeline CRM, and compliance workflow -- so they can raise capital faster without the spreadsheet chaos.',
  category: 'Investor CRM / Capital Raising Platform',
  differentiation: 'Built exclusively for syndicators, not adapted from a generic CRM.',
};

const VALUE_PROPS = [
  {
    headline: 'Professional from day one',
    body: 'LPs see a branded investor portal the moment you onboard them -- no more emailing PDFs or sharing Dropbox links.',
    audience: 'All',
  },
  {
    headline: 'Never miss a follow-up',
    body: 'Pipeline stages, automated reminders, and deal-level tracking keep every investor relationship organized without extra staff.',
    audience: 'Operators with 10+ investors',
  },
  {
    headline: 'Compliance built in',
    body: 'Track accreditation status, subscription agreements, and K-1 delivery in one place -- audit-ready at all times.',
    audience: 'Operators planning multiple raises',
  },
  {
    headline: 'Scale without chaos',
    body: 'Go from 20 LPs to 200 using the same system. No rebuilding spreadsheets before every new deal.',
    audience: 'Growth-stage syndicators',
  },
];

const OBJECTIONS = [
  {
    objection: '"I already have a system."',
    reframe: 'What system? If it\'s a spreadsheet, that\'s not a system -- it\'s a liability. If it\'s a generic CRM, it wasn\'t built for syndication compliance.',
  },
  {
    objection: '"It\'s too expensive."',
    reframe: 'One missed investor follow-up on a $5M raise costs you more than a year of Smart Syndicator. What\'s your current system costing you in deals you don\'t close?',
  },
  {
    objection: '"I\'m not tech-savvy."',
    reframe: 'If you can use email and GHL, you can use Smart Syndicator. Onboarding takes one session. Your LPs never touch the backend.',
  },
  {
    objection: '"I\'ll set it up after my next raise."',
    reframe: 'The raise is exactly when you need it. The pain of managing investor updates mid-raise without a system is what drives operators to us.',
  },
];

const COPY_HOOKS = [
  { context: 'Ad headline', text: 'Stop managing investors in a spreadsheet.' },
  { context: 'Ad headline', text: 'Your LPs deserve better than a Google Sheet.' },
  { context: 'Email subject', text: 'How are you tracking your investors right now?' },
  { context: 'Email subject', text: 'Before your next raise: one thing to fix.' },
  { context: 'CTA', text: 'See it in 15 minutes.' },
  { context: 'CTA', text: 'Start your first deal free.' },
];

export default function Messaging() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Messaging</h1>
        <p className="text-xs text-muted mt-0.5">Brand messaging framework -- Smart Syndicator</p>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">Positioning</p>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted mb-1">Tagline</p>
            <p className="text-xl font-semibold text-white">{POSITIONING.tagline}</p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted mb-1">One-liner</p>
            <p className="text-sm text-dim leading-relaxed">{POSITIONING.oneLinear}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <p className="text-xs text-muted mb-1">Category</p>
              <p className="text-sm text-white">{POSITIONING.category}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-1">Key Differentiator</p>
              <p className="text-sm text-white">{POSITIONING.differentiation}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {VALUE_PROPS.map(vp => (
          <div key={vp.headline} className="bg-card border border-border rounded-lg p-5">
            <span className="text-xs text-muted bg-bg border border-border rounded-full px-2 py-0.5 mb-3 inline-block">{vp.audience}</span>
            <p className="text-sm font-semibold text-white mb-2">{vp.headline}</p>
            <p className="text-xs text-dim leading-relaxed">{vp.body}</p>
          </div>
        ))}
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">Objection Handling</p>
        <div className="space-y-4 divide-y divide-border">
          {OBJECTIONS.map(o => (
            <div key={o.objection} className="pt-4 first:pt-0">
              <p className="text-sm font-medium text-yellow mb-2">{o.objection}</p>
              <p className="text-sm text-dim leading-relaxed">{o.reframe}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Copy Hooks</p>
        <div className="space-y-2">
          {COPY_HOOKS.map((h, i) => (
            <div key={i} className="flex items-start gap-4 py-2.5 border-b border-border last:border-0">
              <span className="text-xs text-muted bg-bg border border-border rounded px-2 py-0.5 flex-shrink-0 w-24 text-center">{h.context}</span>
              <p className="text-sm text-white">{h.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
