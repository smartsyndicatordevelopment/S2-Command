import Card from '../components/ui/Card';

const TRAITS = [
  { label: 'Title', value: 'Real estate syndicator / capital raiser' },
  { label: 'Experience', value: '2-10 years in multifamily or commercial real estate' },
  { label: 'Deal size', value: '$2M - $30M raises, 10-200 investor LPs' },
  { label: 'Pain point', value: 'Investor CRM chaos -- spreadsheets, email threads, no system' },
  { label: 'Tech comfort', value: 'Low to medium -- uses GHL, ClickUp, basic SaaS tools' },
  { label: 'Decision speed', value: 'Fast when pain is acute -- slow when evaluating' },
  { label: 'Buying trigger', value: 'Upcoming raise, compliance concern, or referral from peer' },
  { label: 'Objection #1', value: '"I already have a system" -- usually means spreadsheets' },
  { label: 'Objection #2', value: '"Too expensive" -- usually means value not articulated yet' },
];

const CHANNELS = [
  'BiggerPockets community',
  'Real estate investor podcasts',
  'Apartment Operators Association events',
  'LinkedIn (deal announcements, LP updates)',
  'YouTube (education: underwriting, syndication structure)',
  'Mastermind groups',
  'Referrals from attorneys, CPAs, and operators',
];

const OUTCOMES = [
  'Raise capital faster with less manual work',
  'Look professional to LPs from day one',
  'Never miss a follow-up with an investor lead',
  'Manage accreditation, distributions, and K-1s in one place',
  'Scale from 1 deal to 5+ without adding staff',
];

export default function Avatar() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Customer Avatar</h1>
        <p className="text-xs text-muted mt-0.5">ICP profile -- Smart Syndicator core buyer</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">Profile</p>
            <div className="space-y-0 divide-y divide-border">
              {TRAITS.map(t => (
                <div key={t.label} className="flex gap-4 py-3">
                  <p className="text-xs text-muted w-32 flex-shrink-0 pt-0.5">{t.label}</p>
                  <p className="text-sm text-white">{t.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Where They Hang Out</p>
            <ul className="space-y-2">
              {CHANNELS.map(c => (
                <li key={c} className="flex items-start gap-2 text-xs text-dim">
                  <span className="text-purple mt-0.5">--</span>
                  {c}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Desired Outcomes</p>
            <ul className="space-y-2">
              {OUTCOMES.map(o => (
                <li key={o} className="flex items-start gap-2 text-xs text-dim">
                  <span className="text-green mt-0.5">+</span>
                  {o}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Voice of Customer</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { quote: '"I was running my investor pipeline out of a Google Sheet. It was embarrassing when LPs asked for updates."', type: 'Pain' },
            { quote: '"My attorney told me I needed a proper investor portal before my next raise. That\'s what pushed me to act."', type: 'Trigger' },
            { quote: '"I want something that makes me look like I\'ve done this 20 times even if it\'s my second deal."', type: 'Aspiration' },
            { quote: '"My biggest fear is missing an accredited investor verification or a distribution deadline."', type: 'Fear' },
          ].map(q => (
            <div key={q.type} className="bg-bg border border-border rounded-lg p-4">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium mb-3 inline-block ${
                q.type === 'Pain' ? 'bg-red/10 text-red' :
                q.type === 'Trigger' ? 'bg-yellow/10 text-yellow' :
                q.type === 'Aspiration' ? 'bg-purple-muted text-purple' :
                'bg-border text-muted'
              }`}>{q.type}</span>
              <p className="text-sm text-dim leading-relaxed italic">{q.quote}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
