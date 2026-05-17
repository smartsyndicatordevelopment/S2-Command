import { useApi } from '../hooks/useApi';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import BusinessChat from '../components/BusinessChat';

function fmt(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtDollars(dollars) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars);
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Overview() {
  const subs = useApi('/api/subscriptions');
  const rev  = useApi('/api/revenue');
  const pnl  = useApi('/api/pnl');

  const error = subs.error || rev.error;

  // Derived values -- computed unconditionally so chat context is always populated
  const allSubs        = subs.data?.subscriptions || [];
  const mrr            = subs.data?.mrr || 0;
  const uniqueClients  = subs.data?.uniqueClients || 0;
  const ytdRevenue     = rev.data?.ytdRevenue || 0;
  const ytdYear        = rev.data?.year || new Date().getFullYear();
  const currentYearPnl = pnl.data?.years?.find(y => y.year === ytdYear);
  const netIncome      = currentYearPnl?.netIncome || 0;
  const totalExpenses  = currentYearPnl?.totalExpenses || 0;
  const arr            = mrr * 12;
  const targetMRR      = 20000;
  const mrrProgress    = Math.min((mrr / targetMRR) * 100, 100);
  const recentSubs     = [...allSubs].sort((a, b) => b.created - a.created).slice(0, 5);

  const chatContext = {
    mrr,
    arr,
    uniqueClients,
    subscriptionCount: allSubs.length,
    ytdRevenue,
    targetMRR,
    recentSignups: recentSubs,
    subscriptions: allSubs,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Overview</h1>
        <p className="text-xs text-muted mt-0.5">Live data -- Stripe + QuickBooks</p>
      </div>

      {error && (
        <ErrorState message={error} onRetry={() => { subs.refetch(); rev.refetch(); pnl.refetch(); }} />
      )}

      {/* KPI grid -- always rendered; each card spins independently */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="MRR" value={fmtDollars(mrr)} sub={`${Math.round(mrrProgress)}% of $20K target`} accent="purple" loading={subs.loading} />
        <StatCard label="ARR" value={fmtDollars(arr)} sub="Annualized" accent="purple" loading={subs.loading} />
        <StatCard label={`${ytdYear} YTD Revenue`} value={fmt(ytdRevenue)} sub={`${rev.data?.invoiceCount || 0} invoices paid`} accent="green" loading={rev.loading} />
        <StatCard label="Active Clients" value={uniqueClients} sub={`${allSubs.length} subscriptions`} accent="white" loading={subs.loading} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="YTD Net Income" value={fmtDollars(netIncome)} sub="QuickBooks (Cash)" accent={netIncome >= 0 ? 'green' : 'red'} loading={pnl.loading} />
        <StatCard label="YTD Expenses" value={fmtDollars(totalExpenses)} sub="QuickBooks (Cash)" accent="yellow" loading={pnl.loading} />
        <StatCard
          label="MRR to Target Gap"
          value={fmtDollars(Math.max(0, targetMRR - mrr))}
          sub="Needed to hit $20K/mo"
          accent={mrr >= targetMRR ? 'green' : 'red'}
          loading={subs.loading}
        />
        <StatCard
          label="Avg Revenue / Client"
          value={uniqueClients > 0 ? fmtDollars(mrr / uniqueClients) : '$0'}
          sub="Monthly"
          accent="white"
          loading={subs.loading}
        />
      </div>

      {/* MRR progress bar */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted">MRR vs $20K Target</p>
          <p className="text-xs text-dim">{subs.loading ? ' ' : `${fmtDollars(mrr)} / $20,000`}</p>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          {!subs.loading && (
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${mrrProgress}%`, backgroundColor: mrrProgress >= 100 ? '#22c55e' : '#5c3ff4' }}
            />
          )}
        </div>
        <p className="text-xs text-muted mt-2">{subs.loading ? ' ' : `${Math.round(mrrProgress)}% of monthly revenue target`}</p>
      </Card>

      {/* Recent signups */}
      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Recent Signups</p>
        {subs.loading ? (
          <div className="flex justify-center py-8">
            <span className="w-5 h-5 border-2 border-purple border-t-transparent rounded-full animate-spin" />
          </div>
        ) : recentSubs.length === 0 ? (
          <p className="text-sm text-muted">No active subscriptions</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="text-xs text-muted font-medium pb-3 pr-4">Customer</th>
                <th className="text-xs text-muted font-medium pb-3 pr-4">Plan</th>
                <th className="text-xs text-muted font-medium pb-3 pr-4">Amount</th>
                <th className="text-xs text-muted font-medium pb-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentSubs.map(sub => (
                <tr key={sub.id}>
                  <td className="py-2.5 pr-4 text-white">{sub.customerName}</td>
                  <td className="py-2.5 pr-4 text-dim">{sub.planName}</td>
                  <td className="py-2.5 pr-4 font-mono text-green">{fmt(sub.actualAmount)}</td>
                  <td className="py-2.5 text-muted">{fmtDate(sub.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Business chat -- always rendered so history persists across loads */}
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">Business Analyst</p>
        <BusinessChat context={chatContext} />
      </div>
    </div>
  );
}
