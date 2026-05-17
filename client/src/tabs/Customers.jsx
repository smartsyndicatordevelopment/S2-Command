import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, Bell } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';

function fmt(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtMrr(dollars) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dollars);
}

function mrrOf(sub) {
  const amt = sub.actualAmount / 100;
  return sub.interval === 'year' ? amt / 12 : amt;
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const COLORS = ['#5c3ff4', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

function useSortable(defaultKey, defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);

  const toggle = (key) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = (arr, getters) => {
    const getter = getters[sortKey];
    if (!getter) return arr;
    return [...arr].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  return { sortKey, sortDir, toggle, sorted };
}

function SortTh({ label, colKey, sortKey, sortDir, onSort, className = '', align = 'left' }) {
  const active = sortKey === colKey;
  const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`text-xs font-medium pb-3 pr-4 cursor-pointer select-none ${className}`}
      style={{ textAlign: align }}
    >
      <span className={`inline-flex items-center gap-1 ${active ? 'text-white' : 'text-muted hover:text-dim'}`}>
        {align === 'right' && <Icon size={10} className="opacity-60" />}
        {label}
        {align !== 'right' && <Icon size={10} className="opacity-60" />}
      </span>
    </th>
  );
}

const DonutTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-white font-medium">{d.name}</p>
      <p className="text-muted">{d.value} subscription{d.value !== 1 ? 's' : ''}</p>
    </div>
  );
};

function DaysChip({ days }) {
  if (days <= 7)  return <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{days}d</span>;
  if (days <= 21) return <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{days}d</span>;
  return          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>{days}d</span>;
}

function Section({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
      >
        <Icon size={14} className="text-muted flex-shrink-0" />
        <span className="text-sm font-medium text-white">{title}</span>
        {count !== undefined && (
          <span
            className="text-xs font-mono px-2 py-0.5 rounded ml-1"
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#9ca3af' }}
          >
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-border p-4 space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Customers() {
  const subs = useApi('/api/subscriptions');

  const renewalSort  = useSortable('days', 'asc');
  const subsSort     = useSortable('created', 'desc');
  const pausedSort   = useSortable('created', 'desc');
  const canceledSort = useSortable('canceledAt', 'desc');
  const oneOffSort   = useSortable('created', 'desc');

  const active   = useMemo(() => subs.data?.subscriptions || [], [subs.data]);
  const paused   = useMemo(() => subs.data?.pausedSubscriptions || [], [subs.data]);
  const canceled = useMemo(() => subs.data?.canceledSubscriptions || [], [subs.data]);
  const oneOffs  = useMemo(() => subs.data?.oneOffTransactions || [], [subs.data]);

  const totalEverCount        = subs.data?.totalEverCount || 0;
  const totalCanceledAllTime  = subs.data?.totalCanceledAllTime || 0;
  const avgLtv                = subs.data?.avgLtv || 0;
  const avgSubLengthMonths    = subs.data?.avgSubLengthMonths || 0;

  const upcomingRenewals = useMemo(() => {
    const now    = Math.floor(Date.now() / 1000);
    const cutoff = now + 45 * 24 * 60 * 60;
    return active
      .filter(s => !s.cancelAt && s.interval === 'year' && s.currentPeriodEnd >= now && s.currentPeriodEnd <= cutoff)
      .map(s => ({ ...s, days: Math.ceil((s.currentPeriodEnd - now) / (24 * 60 * 60)) }));
  }, [active]);

  // MRR from active only -- paused excluded per user requirement
  const totalMrr = useMemo(() => active.reduce((sum, s) => sum + mrrOf(s), 0), [active]);

  if (subs.loading) return <Spinner label="Loading subscriptions..." />;
  if (subs.error)   return <ErrorState message={subs.error} onRetry={subs.refetch} />;

  // Donut chart data
  const planCounts = {};
  active.forEach(s => { planCounts[s.planName] = (planCounts[s.planName] || 0) + 1; });
  const planData = Object.entries(planCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const intervalCounts = {};
  active.forEach(s => {
    const label = s.interval === 'year' ? 'Annual' : 'Monthly';
    intervalCounts[label] = (intervalCounts[label] || 0) + 1;
  });
  const intervalData = Object.entries(intervalCounts).map(([name, value]) => ({ name, value }));

  // Sorted table data
  const sortedSubs = subsSort.sorted(active, {
    customerName:     s => s.customerName.toLowerCase(),
    planName:         s => s.planName.toLowerCase(),
    actualAmount:     s => s.actualAmount,
    mrr:              s => mrrOf(s),
    interval:         s => s.interval,
    created:          s => s.created,
    currentPeriodEnd: s => s.currentPeriodEnd,
    totalSpend:       s => s.totalSpend,
  });

  const sortedRenewals = renewalSort.sorted(upcomingRenewals, {
    days:         r => r.days,
    customerName: r => r.customerName.toLowerCase(),
    planName:     r => r.planName.toLowerCase(),
    actualAmount: r => r.actualAmount,
  });

  const sortedPaused = pausedSort.sorted(paused, {
    customerName:     s => s.customerName.toLowerCase(),
    planName:         s => s.planName.toLowerCase(),
    actualAmount:     s => s.actualAmount,
    created:          s => s.created,
    currentPeriodEnd: s => s.currentPeriodEnd,
    totalSpend:       s => s.totalSpend,
  });

  const sortedCanceled = canceledSort.sorted(canceled, {
    customerName: s => s.customerName.toLowerCase(),
    planName:     s => s.planName.toLowerCase(),
    actualAmount: s => s.actualAmount,
    canceledAt:   s => s.canceledAt,
    created:      s => s.created,
    totalSpend:   s => s.totalSpend,
  });

  const sortedOneOffs = oneOffSort.sorted(oneOffs, {
    customerName: s => s.customerName.toLowerCase(),
    description:  s => (s.description || '').toLowerCase(),
    amount:       s => s.amount,
    created:      s => s.created,
  });

  const churnRate   = totalEverCount > 0 ? (totalCanceledAllTime / totalEverCount) * 100 : 0;
  const churnAccent = churnRate < 5 ? 'green' : churnRate < 15 ? 'yellow' : 'red';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Customers</h1>
        <p className="text-xs text-muted mt-0.5">{active.length} active subscriptions -- live from Stripe</p>
      </div>

      {/* Top-line subscriber stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="All-Time Subscribers"
          value={totalEverCount.toLocaleString()}
          sub={`${totalCanceledAllTime.toLocaleString()} canceled all-time`}
          accent="white"
        />
        <StatCard
          label="Active Subscribers"
          value={active.length.toLocaleString()}
          sub={paused.length > 0 ? `+ ${paused.length} paused` : 'currently subscribed'}
          accent="green"
        />
        <StatCard
          label="Global Churn Rate"
          value={`${churnRate.toFixed(1)}%`}
          sub={`${totalCanceledAllTime} canceled of ${totalEverCount} total`}
          accent={churnAccent}
        />
      </div>

      {/* MRR + ARR + LTV + avg length -- active only for MRR/ARR */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="MRR" value={fmtMrr(totalMrr)} sub={`${active.length} active subscriptions`} accent="purple" />
        <StatCard label="ARR" value={fmtMrr(totalMrr * 12)} sub="Annualized" accent="purple" />
        <StatCard
          label="Avg Lifetime Value"
          value={fmt(Math.round(avgLtv))}
          sub="Per unique customer, all-time"
          accent="white"
        />
        <StatCard
          label="Avg Subscription Length"
          value={avgSubLengthMonths >= 24
            ? `${(avgSubLengthMonths / 12).toFixed(1)} yr`
            : `${avgSubLengthMonths.toFixed(1)} mo`}
          sub="Active + canceled, all plans"
          accent="white"
        />
      </div>

      {/* Active Subscriptions section -- starts open */}
      <Section title="Active Subscriptions" count={active.length} defaultOpen>
        {/* Upcoming Annual Renewals */}
        {upcomingRenewals.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell size={13} style={{ color: '#f59e0b' }} />
              <p className="text-xs font-medium uppercase tracking-widest text-muted">Upcoming Annual Renewals</p>
              <span className="text-xs px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                {upcomingRenewals.length} in next 45 days
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <SortTh label="Customer"  colKey="customerName"  {...renewalSort} onSort={renewalSort.toggle} />
                    <SortTh label="Plan"      colKey="planName"      {...renewalSort} onSort={renewalSort.toggle} />
                    <SortTh label="Amount"    colKey="actualAmount"  {...renewalSort} onSort={renewalSort.toggle} align="right" className="text-right" />
                    <SortTh label="Renews"    colKey="days"          {...renewalSort} onSort={renewalSort.toggle} />
                    <th className="text-xs text-muted font-medium pb-3">Days Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedRenewals.map(sub => (
                    <tr key={sub.id}>
                      <td className="py-2.5 pr-4">
                        <p className="text-white">{sub.customerName}</p>
                        <p className="text-xs text-muted">{sub.customerEmail}</p>
                      </td>
                      <td className="py-2.5 pr-4 text-dim">{sub.planName}</td>
                      <td className="py-2.5 pr-4 font-mono text-right" style={{ color: '#22c55e' }}>
                        {fmt(sub.actualAmount)}
                      </td>
                      <td className="py-2.5 pr-4 text-muted text-xs">{fmtDate(sub.currentPeriodEnd)}</td>
                      <td className="py-2.5"><DaysChip days={sub.days} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-3 pt-3 border-t border-border">
              Red = within 7 days -- Amber = 8-21 days -- Gray = 22-45 days
            </p>
          </div>
        )}

        {/* Donut charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">By Plan</p>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={planData} cx="50%" cy={75} innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={2}>
                  {planData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {planData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-dim flex-1">{d.name}</span>
                  <span className="font-mono text-white">{d.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">By Billing Cycle</p>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={intervalData} cx={75} cy={75} innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {intervalData.map((_, i) => <Cell key={i} fill={i === 0 ? '#5c3ff4' : '#22c55e'} />)}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {intervalData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: i === 0 ? '#5c3ff4' : '#22c55e' }} />
                    <span className="text-dim">{d.name}</span>
                    <span className="font-mono text-white ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Active subscriptions table */}
        <div className="overflow-x-auto">
          {active.length === 0 ? (
            <p className="text-sm text-muted">No active subscriptions</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <SortTh label="Customer"     colKey="customerName"     {...subsSort} onSort={subsSort.toggle} />
                  <SortTh label="Plan"         colKey="planName"         {...subsSort} onSort={subsSort.toggle} />
                  <SortTh label="Billed"       colKey="actualAmount"     {...subsSort} onSort={subsSort.toggle} align="right" className="text-right" />
                  <SortTh label="MRR"          colKey="mrr"              {...subsSort} onSort={subsSort.toggle} align="right" className="text-right" />
                  <SortTh label="Cycle"        colKey="interval"         {...subsSort} onSort={subsSort.toggle} />
                  <SortTh label="Started"      colKey="created"          {...subsSort} onSort={subsSort.toggle} />
                  <SortTh label="Next Payment" colKey="currentPeriodEnd" {...subsSort} onSort={subsSort.toggle} />
                  <SortTh label="Total Spend"  colKey="totalSpend"       {...subsSort} onSort={subsSort.toggle} align="right" className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedSubs.map(sub => (
                  <tr key={sub.id}>
                    <td className="py-2.5 pr-4">
                      <p className="text-white">{sub.customerName}</p>
                      <p className="text-xs text-muted">{sub.customerEmail}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-dim">{sub.planName}</td>
                    <td className="py-2.5 pr-4 font-mono text-right text-green">
                      {fmt(sub.actualAmount)}
                      {sub.actualAmount !== sub.listPrice && (
                        <span className="block text-xs text-muted line-through">{fmt(sub.listPrice)}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-right" style={{ color: '#5c3ff4' }}>
                      {fmtMrr(mrrOf(sub))}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sub.interval === 'year' ? 'bg-green/10 text-green' : 'bg-purple-muted text-purple'}`}>
                        {sub.interval === 'year' ? 'Annual' : 'Monthly'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted text-xs">{fmtDate(sub.created)}</td>
                    <td className="py-2.5 pr-4 text-xs text-muted">{fmtDate(sub.currentPeriodEnd)}</td>
                    <td className="py-2.5 font-mono text-right text-dim">{fmt(sub.totalSpend)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border">
                  <td colSpan={3} className="pt-3 text-xs text-muted font-medium uppercase tracking-widest">
                    Total MRR &nbsp;&middot;&nbsp; {active.length} subscriptions
                  </td>
                  <td className="pt-3 font-mono font-semibold text-right" style={{ color: '#5c3ff4' }}>
                    {fmtMrr(totalMrr)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </Section>

      {/* Paused Subscriptions section -- starts collapsed */}
      <Section title="Paused Subscriptions" count={paused.length}>
        {paused.length === 0 ? (
          <p className="text-sm text-muted">No paused subscriptions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <SortTh label="Customer"    colKey="customerName"     {...pausedSort} onSort={pausedSort.toggle} />
                  <SortTh label="Plan"        colKey="planName"         {...pausedSort} onSort={pausedSort.toggle} />
                  <SortTh label="Last Billed" colKey="actualAmount"     {...pausedSort} onSort={pausedSort.toggle} align="right" className="text-right" />
                  <SortTh label="Cycle"       colKey="interval"         {...pausedSort} onSort={pausedSort.toggle} />
                  <SortTh label="Started"     colKey="created"          {...pausedSort} onSort={pausedSort.toggle} />
                  <SortTh label="Period End"  colKey="currentPeriodEnd" {...pausedSort} onSort={pausedSort.toggle} />
                  <SortTh label="Total Spend" colKey="totalSpend"       {...pausedSort} onSort={pausedSort.toggle} align="right" className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedPaused.map(sub => (
                  <tr key={sub.id}>
                    <td className="py-2.5 pr-4">
                      <p className="text-white">{sub.customerName}</p>
                      <p className="text-xs text-muted">{sub.customerEmail}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-dim">{sub.planName}</td>
                    <td className="py-2.5 pr-4 font-mono text-right text-muted">
                      {fmt(sub.actualAmount)}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                        {sub.interval === 'year' ? 'Annual' : 'Monthly'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted text-xs">{fmtDate(sub.created)}</td>
                    <td className="py-2.5 pr-4 text-xs text-muted">{fmtDate(sub.currentPeriodEnd)}</td>
                    <td className="py-2.5 font-mono text-right text-dim">{fmt(sub.totalSpend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Canceled Subscriptions section -- starts collapsed */}
      <Section title="Canceled Subscriptions" count={canceled.length}>
        {canceled.length === 0 ? (
          <p className="text-sm text-muted">No canceled subscriptions in the last 12 months</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <SortTh label="Customer"    colKey="customerName" {...canceledSort} onSort={canceledSort.toggle} />
                  <SortTh label="Plan"        colKey="planName"     {...canceledSort} onSort={canceledSort.toggle} />
                  <SortTh label="Last Billed" colKey="actualAmount" {...canceledSort} onSort={canceledSort.toggle} align="right" className="text-right" />
                  <SortTh label="Canceled"    colKey="canceledAt"   {...canceledSort} onSort={canceledSort.toggle} />
                  <SortTh label="Started"     colKey="created"      {...canceledSort} onSort={canceledSort.toggle} />
                  <SortTh label="Total Spend" colKey="totalSpend"   {...canceledSort} onSort={canceledSort.toggle} align="right" className="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedCanceled.map(sub => (
                  <tr key={sub.id}>
                    <td className="py-2.5 pr-4">
                      <p className="text-white">{sub.customerName}</p>
                      <p className="text-xs text-muted">{sub.customerEmail}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-dim">{sub.planName}</td>
                    <td className="py-2.5 pr-4 font-mono text-right text-muted">
                      {fmt(sub.actualAmount)}
                    </td>
                    <td className="py-2.5 pr-4 text-muted text-xs">
                      {sub.canceledAt ? fmtDate(sub.canceledAt) : '--'}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted">{fmtDate(sub.created)}</td>
                    <td className="py-2.5 font-mono text-right text-dim">{fmt(sub.totalSpend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* One-off Transactions section -- starts collapsed */}
      <Section title="One-off Transactions" count={oneOffs.length}>
        {oneOffs.length === 0 ? (
          <p className="text-sm text-muted">No one-off transactions in the last 12 months</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  <SortTh label="Customer"    colKey="customerName" {...oneOffSort} onSort={oneOffSort.toggle} />
                  <SortTh label="Description" colKey="description"  {...oneOffSort} onSort={oneOffSort.toggle} />
                  <SortTh label="Amount"      colKey="amount"       {...oneOffSort} onSort={oneOffSort.toggle} align="right" className="text-right" />
                  <SortTh label="Date"        colKey="created"      {...oneOffSort} onSort={oneOffSort.toggle} />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedOneOffs.map(txn => (
                  <tr key={txn.id}>
                    <td className="py-2.5 pr-4">
                      <p className="text-white">{txn.customerName}</p>
                      <p className="text-xs text-muted">{txn.customerEmail}</p>
                    </td>
                    <td className="py-2.5 pr-4 text-dim text-xs">{txn.description}</td>
                    <td className="py-2.5 pr-4 font-mono text-right" style={{ color: '#22c55e' }}>
                      {fmt(txn.amount)}
                    </td>
                    <td className="py-2.5 text-xs text-muted">{fmtDate(txn.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
