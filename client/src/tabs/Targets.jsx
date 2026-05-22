import { useApi } from '../hooks/useApi';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';

const TARGET_MRR = 20000;
const BAR_MAX_PX = 180;

function fmtDollars(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

export default function Targets() {
  const subs = useApi('/api/subscriptions');

  if (subs.error) return <ErrorState message={subs.error} onRetry={subs.refetch} />;

  const mrr = subs.data?.mrr || 0;
  const uniqueClients = subs.data?.uniqueClients || 0;
  const pct = Math.min(mrr / TARGET_MRR, 1);
  const actualBarPx = Math.round(pct * BAR_MAX_PX);
  const gap = Math.max(0, TARGET_MRR - mrr);
  const clientTarget = 40;
  const clientPct = Math.min(uniqueClients / clientTarget, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Targets</h1>
        <p className="text-xs text-muted mt-0.5">Live Stripe vs hardcoded goals</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MRR Target bar */}
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-8">MRR Target</p>

          <div className="flex items-end justify-center gap-12">
            {/* Target bar */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted">Target</p>
              <div
                className="w-14 rounded-t-md border border-border relative"
                style={{ height: `${BAR_MAX_PX}px`, backgroundColor: 'var(--c-bar-track)' }}
              >
                <div className="absolute inset-x-0 bottom-0 rounded-t-md" style={{ height: `${BAR_MAX_PX}px`, backgroundColor: 'var(--c-bar-track)' }} />
              </div>
              <p className="font-mono text-sm text-dim">$20K</p>
            </div>

            {/* Actual bar */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted">Actual</p>
              <div
                className="w-14 rounded-t-sm relative"
                style={{ height: `${BAR_MAX_PX}px`, backgroundColor: 'var(--c-bar-track)', borderRadius: '4px 4px 0 0' }}
              >
                {!subs.loading && (
                  <div
                    className="absolute inset-x-0 bottom-0 transition-all"
                    style={{
                      height: `${actualBarPx}px`,
                      backgroundColor: pct >= 1 ? '#22c55e' : '#5c3ff4',
                      borderRadius: actualBarPx === BAR_MAX_PX ? '4px 4px 0 0' : '2px 2px 0 0',
                    }}
                  />
                )}
              </div>
              {subs.loading
                ? <span className="w-4 h-4 border-2 border-purple border-t-transparent rounded-full animate-spin" />
                : <p className="font-mono text-sm text-purple">{fmtDollars(mrr)}</p>}
            </div>
          </div>

          <div className="mt-8 space-y-2 border-t border-border pt-5">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Progress</span>
              {subs.loading
                ? <span className="w-3 h-3 border border-purple border-t-transparent rounded-full animate-spin" />
                : <span className="font-mono text-white">{Math.round(pct * 100)}%</span>}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Gap to close</span>
              {subs.loading
                ? <span className="w-3 h-3 border border-yellow border-t-transparent rounded-full animate-spin" />
                : <span className={`font-mono ${gap === 0 ? 'text-green' : 'text-yellow'}`}>{fmtDollars(gap)}</span>}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">New clients needed (avg)</span>
              {subs.loading
                ? <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" />
                : <span className="font-mono text-dim">
                    {uniqueClients > 0 && mrr > 0 ? Math.ceil(gap / (mrr / uniqueClients)) : '--'}
                  </span>}
            </div>
          </div>
        </Card>

        {/* Client count target */}
        <Card>
          <p className="text-xs font-medium uppercase tracking-widest text-muted mb-8">Client Count Target</p>

          <div className="flex items-end justify-center gap-12">
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted">Target</p>
              <div className="w-14 rounded-t-md" style={{ height: `${BAR_MAX_PX}px`, backgroundColor: 'var(--c-bar-track)' }} />
              <p className="font-mono text-sm text-dim">{clientTarget}</p>
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted">Actual</p>
              <div className="w-14 relative" style={{ height: `${BAR_MAX_PX}px`, backgroundColor: 'var(--c-bar-track)', borderRadius: '4px 4px 0 0' }}>
                {!subs.loading && (
                  <div
                    className="absolute inset-x-0 bottom-0 transition-all"
                    style={{
                      height: `${Math.round(clientPct * BAR_MAX_PX)}px`,
                      backgroundColor: clientPct >= 1 ? '#22c55e' : '#5c3ff4',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                )}
              </div>
              {subs.loading
                ? <span className="w-4 h-4 border-2 border-purple border-t-transparent rounded-full animate-spin" />
                : <p className="font-mono text-sm text-purple">{uniqueClients}</p>}
            </div>
          </div>

          <div className="mt-8 space-y-2 border-t border-border pt-5">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Progress</span>
              {subs.loading
                ? <span className="w-3 h-3 border border-purple border-t-transparent rounded-full animate-spin" />
                : <span className="font-mono text-white">{Math.round(clientPct * 100)}%</span>}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Clients still needed</span>
              {subs.loading
                ? <span className="w-3 h-3 border border-yellow border-t-transparent rounded-full animate-spin" />
                : <span className="font-mono text-yellow">{Math.max(0, clientTarget - uniqueClients)}</span>}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Avg MRR per client</span>
              {subs.loading
                ? <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" />
                : <span className="font-mono text-dim">
                    {uniqueClients > 0 ? fmtDollars(mrr / uniqueClients) : '--'}
                  </span>}
            </div>
          </div>
        </Card>
      </div>

      {/* Milestone table */}
      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Revenue Milestones</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="text-xs text-muted font-medium pb-3 pr-4">Milestone</th>
              <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">MRR Target</th>
              <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">Gap</th>
              <th className="text-xs text-muted font-medium pb-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subs.loading ? (
              <tr>
                <td colSpan={4} className="py-6 text-center">
                  <span className="inline-block w-5 h-5 border-2 border-purple border-t-transparent rounded-full animate-spin" />
                </td>
              </tr>
            ) : (
              [5000, 10000, 15000, 20000, 30000, 50000].map(target => {
                const achieved = mrr >= target;
                const diff = target - mrr;
                return (
                  <tr key={target}>
                    <td className="py-2.5 pr-4 text-dim">{fmtDollars(target)}/mo</td>
                    <td className="py-2.5 pr-4 font-mono text-right text-dim">{fmtDollars(target)}</td>
                    <td className={`py-2.5 pr-4 font-mono text-right ${achieved ? 'text-green' : 'text-yellow'}`}>
                      {achieved ? 'Achieved' : fmtDollars(diff)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${achieved ? 'bg-green/10 text-green' : 'bg-border text-muted'}`}>
                        {achieved ? 'Done' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
