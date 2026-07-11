import Card from '../components/ui/Card';

const POSITIONING = {
  tagline: 'Your investor pipeline, installed for you.',
  oneLinear: 'Smart Syndicator is the done-for-you capital-raising system: we build the CRM, import and segment the investor list, load the first campaigns, then coach members on one weekly live call until raising feels routine.',
  category: 'Capital Raising Operating System (CROS) -- compared against coaching programs and DFY agencies, never against CRMs',
  differentiation: 'The system is installed and managed for you, with a practitioner on a weekly live call -- not software you configure alone.',
};

const VALUE_PROPS = [
  {
    headline: 'Live in days, not months',
    body: 'The $2,000 buildout ships a working system: CRM configured, investor list imported and segmented, first campaigns loaded, automations on. Most members see their first investor response within 10 days.',
    audience: 'All',
  },
  {
    headline: 'Never miss a follow-up',
    body: 'Capital-raising pipelines, automated nurture, and deal-level tracking keep every investor relationship warm without extra staff.',
    audience: 'Operators with 10+ investors',
  },
  {
    headline: 'A practitioner in your corner',
    body: 'One weekly live call with Brandon -- technical help, capital coaching, and a peer community of active syndicators in a single session.',
    audience: 'Builders raising their first $1M',
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
    reframe: 'What system? If it\'s a spreadsheet, that\'s not a system -- it\'s a liability. If it\'s a generic CRM, nobody installed it for capital raising, nobody manages it, and nobody coaches you on raising with it.',
  },
  {
    objection: '"It\'s too expensive."',
    reframe: 'Compared to what? Capital-raising coaching programs and masterminds run $5,000-$25,000 a year and hand you homework. For $2,000 down and $297 a month you get the system built for you AND the weekly coaching. One closed investor covers years of it.',
  },
  {
    objection: '"I\'m not tech-savvy."',
    reframe: 'You never build anything -- the team installs and manages the platform. If you can join one call a week, you can run this. Your LPs never touch the backend.',
  },
  {
    objection: '"I\'ll set it up after my next raise."',
    reframe: 'The raise is exactly when you need it. Managing investor updates mid-raise without a system is the pain that brings operators to us -- and the buildout takes days, not months.',
  },
];

const COPY_HOOKS = [
  { context: 'Ad headline', text: 'Your investor pipeline, installed for you.' },
  { context: 'Ad headline', text: 'Stop managing investors in a spreadsheet.' },
  { context: 'Email subject', text: 'How are you tracking your investors right now?' },
  { context: 'Email subject', text: 'Before your next raise: one thing to fix.' },
  { context: 'CTA', text: 'See it in 15 minutes.' },
  { context: 'CTA', text: 'Book a demo -- live in days.' },
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
