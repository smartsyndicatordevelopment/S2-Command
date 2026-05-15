import Card from '../components/ui/Card';

const METRICS = [
  { label: 'Monthly Ad Spend', value: '--', sub: 'Update manually' },
  { label: 'CAC', value: '--', sub: 'Cost per acquisition' },
  { label: 'LTV', value: '--', sub: 'Lifetime value estimate' },
  { label: 'LTV : CAC', value: '--', sub: 'Target: 3:1 or better' },
];

const CHANNELS = [
  { name: 'YouTube Organic', status: 'active', leads: '--', cac: '--' },
  { name: 'Meta Ads', status: 'inactive', leads: '--', cac: '--' },
  { name: 'Google Ads', status: 'inactive', leads: '--', cac: '--' },
  { name: 'Podcast / Referral', status: 'active', leads: '--', cac: '--' },
  { name: 'LinkedIn Organic', status: 'active', leads: '--', cac: '--' },
  { name: 'Email / Newsletter', status: 'active', leads: '--', cac: '--' },
];

const FUNNEL = [
  { stage: 'Awareness', metric: 'YouTube views / impressions', value: '--' },
  { stage: 'Interest', metric: 'Website visitors (monthly)', value: '--' },
  { stage: 'Consideration', metric: 'Free trial / demo requests', value: '--' },
  { stage: 'Conversion', metric: 'New paid signups', value: '--' },
  { stage: 'Retention', metric: 'Monthly churn rate', value: '--' },
];

export default function SalesAds() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Sales & Ads</h1>
        <p className="text-xs text-muted mt-0.5">Marketing performance -- update manually or connect an ads API</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {METRICS.map(m => (
          <div key={m.label} className="bg-card border border-border rounded-lg p-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">{m.label}</p>
            <p className="font-mono text-3xl font-bold text-dim">{m.value}</p>
            <p className="text-xs text-muted mt-2">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Acquisition Channels</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                <th className="text-xs text-muted font-medium pb-3 pr-4">Channel</th>
                <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">Leads</th>
                <th className="text-xs text-muted font-medium pb-3 text-right">CAC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CHANNELS.map(ch => (
                <tr key={ch.name}>
                  <td className="py-2.5 pr-4">
                    <span className="text-dim">{ch.name}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${ch.status === 'active' ? 'bg-green/10 text-green' : 'bg-border text-muted'}`}>
                      {ch.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-right text-muted">{ch.leads}</td>
                  <td className="py-2.5 font-mono text-right text-muted">{ch.cac}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Sales Funnel</p>
          <div className="space-y-4">
            {FUNNEL.map((f, i) => (
              <div key={f.stage}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-white font-medium">{f.stage}</span>
                  <span className="font-mono text-sm text-dim">{f.value}</span>
                </div>
                <p className="text-xs text-muted">{f.metric}</p>
                {i < FUNNEL.length - 1 && (
                  <div className="mt-3 border-b border-border" />
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Notes</p>
        <p className="text-sm text-dim leading-relaxed">
          This tab is a placeholder. To add live data, connect Meta Ads API, Google Ads API, or pipe funnel data from GHL.
          Update channel metrics monthly or wire up Make.com to pull ad spend automatically.
        </p>
      </Card>
    </div>
  );
}
