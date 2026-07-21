import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight, Bell } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { useApi } from '../hooks/useApi';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';

function fmt(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function fmtMrr(dollars) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dollars);
}

function mrrOf(sub) {
  const amt = sub.actualAmount / 100;
  return sub.interval === 'year' ? amt / 12 : amt;
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(ts) {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((ts - now) / (24 * 60 * 60));
}

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

function DaysChip({ days }) {
  if (days <= 7)  return <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>{days}d</span>;
  if (days <= 21) return <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>{days}d</span>;
  return          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--c-avatar-bg)', color: 'var(--c-dim)' }}>{days}d</span>;
}

function Section({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ backgroundColor: 'var(--c-subtle)' }}
      >
        <Icon size={14} className="text-muted flex-shrink-0" />
        <span className="text-sm font-medium text-white">{title}</span>
        {count !== undefined && (
          <span
            className="text-xs font-mono px-2 py-0.5 rounded ml-1"
            style={{ backgroundColor: 'var(--c-subtle-8)', color: 'var(--c-dim)' }}
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

const WINDOW_OPTIONS = [
  { value: '30',  label: '30d' },
  { value: '90',  label: '90d' },
  { value: '180', label: '6mo' },
  { value: '365', label: '12mo' },
  { value: 'all', label: 'All Time' },
];

const WINDOW_LABELS = { '30': '30 days', '90': '90 days', '180': '6 months', '365': '12 months', 'all': 'all time' };

export default function Customers() {
  const [ltvWindow, setLtvWindow]       = useState('all');
  const [cacWindow, setCacWindow]       = useState('90');
  const [ltvHover, setLtvHover]         = useState(false);
  const [cacHover, setCacHover]         = useState(false);
  const [signupWindow, setSignupWindow] = useState('12');

  const subs = useApi('/api/subscriptions');
  const mktg = useApi(`/api/marketing-spend?days=${cacWindow}`);

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
  const avgSubLengthMonths    = subs.data?.avgSubLengthMonths || 0;

  // LTV -- driven by ltvWindow selector independently
  const ltvStats    = subs.data?.windowedStats?.[ltvWindow] || {};
  const ltvDollars  = (ltvStats.avgLtv || 0) / 100;
  const ltvCustomers = ltvStats.newCustomers || 0;

  // CAC -- driven by cacWindow selector independently
  const cacStats           = subs.data?.windowedStats?.[cacWindow] || {};
  const windowNewCustomers = cacStats.newCustomers || 0;
  const spend              = mktg.loading ? 0 : (mktg.data?.spend || 0);
  const marketingAccounts  = mktg.loading ? [] : (mktg.data?.marketingAccounts || []);
  const qbConfigured       = !mktg.loading && !mktg.data?.notConfigured && mktg.data !== null;
  const cac                = windowNewCustomers > 0 ? spend / windowNewCustomers : 0;

  // LTV:CAC -- recalculates from each card's independent window
  const ltvCacRatio = cac > 0 && ltvDollars > 0 ? ltvDollars / cac : 0;

  const upcomingRenewals = useMemo(() => {
    const now    = Math.floor(Date.now() / 1000);
    const cutoff = now + 45 * 24 * 60 * 60;
    return active
      .filter(s => !s.cancelAt && s.interval === 'year' && s.currentPeriodEnd >= now && s.currentPeriodEnd <= cutoff)
      .map(s => ({ ...s, days: Math.ceil((s.currentPeriodEnd - now) / (24 * 60 * 60)) }));
  }, [active]);

  // MRR from active only -- paused excluded per user requirement
  const totalMrr = useMemo(() => active.reduce((sum, s) => sum + mrrOf(s), 0), [active]);

  // Signup bar chart data
  const signupChartData = useMemo(() => {
    const raw = subs.data?.monthlySignups || {};
    const allKeys = Object.keys(raw).sort();
    if (allKeys.length === 0) return [];

    let keys;
    if (signupWindow === 'all') {
      keys = allKeys;
    } else {
      const months = parseInt(signupWindow, 10);
      const now = new Date();
      const cutoffKeys = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        cutoffKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      keys = cutoffKeys;
    }

    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return keys.map(key => {
      const [year, month] = key.split('-').map(Number);
      const label = `${MONTH_NAMES[month - 1]} '${String(year).slice(2)}`;
      return { key, label, signups: raw[key] || 0 };
    });
  }, [subs.data, signupWindow]);

  if (subs.error) return <ErrorState message={subs.error} onRetry={subs.refetch} />;

  // Sorted table data
  const sortedSubs = subsSort.sorted(active, {
    customerName:     s => s.customerName.toLowerCase(),
    planName:         s => s.planName.toLowerCase(),
    actualAmount:     s => s.actualAmount,
    mrr:              s => mrrOf(s),
    interval:         s => s.interval,
    created:          s => s.created,
    currentPeriodEnd: s => s.currentPeriodEnd,
    daysUntil:        s => s.currentPeriodEnd,
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
        <h1 className="text-lg font-semibold text-white">Recurring Customers</h1>
        <p className="text-xs text-muted mt-0.5">{subs.loading ? 'Loading from Stripe...' : `${active.length} active subscriptions -- live from Stripe`}</p>
      </div>

      {/* Row 1 -- revenue metrics */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          label="MRR"
          value={fmtMrr(totalMrr)}
          sub={`${active.length} active subscriptions`}
          accent="purple"
          tooltip={`Total recurring revenue expected every month from all active subscriptions.\nSum of all active sub amounts; annual plans divided by 12\n${active.length} active subscriptions`}
          loading={subs.loading}
        />
        <StatCard
          label="ARR"
          value={fmtMrr(totalMrr * 12)}
          sub="Annualized"
          accent="purple"
          tooltip={`What the business would earn in a full year if MRR stayed flat.\nMRR (${fmtMrr(totalMrr)}) × 12`}
          loading={subs.loading}
        />

        {/* LTV -- independent window selector */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">Avg Lifetime Value</p>
            <select
              value={ltvWindow}
              onChange={e => setLtvWindow(e.target.value)}
              className="text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-muted focus:outline-none cursor-pointer hover:text-white transition-colors"
            >
              {WINDOW_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div
            className="relative inline-block"
            onMouseEnter={() => setLtvHover(true)}
            onMouseLeave={() => setLtvHover(false)}
          >
            {subs.loading
              ? <span className="inline-block w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <p className="font-mono text-3xl font-bold text-white cursor-help">
                  {ltvDollars > 0 ? fmtMrr(ltvDollars) : '--'}
                </p>}
            {ltvHover && !subs.loading && (
              <div className="absolute bottom-full left-0 mb-2 z-50 min-w-max max-w-xs bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted shadow-lg whitespace-pre-line pointer-events-none">
                {ltvDollars > 0
                  ? `The average total revenue generated per customer who signed up in the selected window.\nTotal paid invoices from ${ltvCustomers} customer${ltvCustomers !== 1 ? 's' : ''} ÷ ${ltvCustomers} customer${ltvCustomers !== 1 ? 's' : ''}`
                  : `No customers acquired in ${WINDOW_LABELS[ltvWindow]}`}
              </div>
            )}
          </div>
          <p className="text-xs text-muted mt-2">
            {subs.loading ? ' ' : ltvWindow === 'all' ? 'All customers, all time' : `Customers from last ${WINDOW_LABELS[ltvWindow]}`}
          </p>
        </div>

        {/* CAC -- independent window selector */}
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">Customer Acq. Cost</p>
            <select
              value={cacWindow}
              onChange={e => setCacWindow(e.target.value)}
              className="text-xs bg-bg border border-border rounded px-1.5 py-0.5 text-muted focus:outline-none cursor-pointer hover:text-white transition-colors"
            >
              {WINDOW_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div
            className="relative inline-block"
            onMouseEnter={() => setCacHover(true)}
            onMouseLeave={() => setCacHover(false)}
          >
            {(subs.loading || mktg.loading)
              ? <span className="inline-block w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <p className="font-mono text-3xl font-bold text-white cursor-help">
                  {windowNewCustomers > 0 ? (cac > 0 ? fmtMrr(cac) : '$0') : '--'}
                </p>}
            {cacHover && !subs.loading && !mktg.loading && (
              <div className="absolute bottom-full left-0 mb-2 z-50 min-w-max max-w-xs bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted shadow-lg whitespace-pre-line pointer-events-none">
                {qbConfigured
                  ? marketingAccounts.length > 0
                    ? `How much it costs on average to acquire one new paying customer.\n${fmtMrr(spend)} marketing spend ÷ ${windowNewCustomers} new customers\nAccounts: ${marketingAccounts.join(', ')}`
                    : `How much it costs on average to acquire one new paying customer.\nNo marketing/advertising expense categories found in this window`
                  : 'How much it costs on average to acquire one new paying customer.\nConnect Digits to calculate'}
              </div>
            )}
          </div>
          <p className="text-xs text-muted mt-2">
            {subs.loading || mktg.loading ? ' ' : `${windowNewCustomers} new customers -- ${cacWindow === 'all' ? 'all time' : `last ${WINDOW_LABELS[cacWindow]}`}`}
          </p>
        </div>

        <StatCard
          label="LTV : CAC"
          value={ltvCacRatio > 0 ? `${Math.round(ltvCacRatio)}:1` : '--'}
          sub={ltvCacRatio > 0 ? `LTV ${WINDOW_OPTIONS.find(o => o.value === ltvWindow)?.label} / CAC ${WINDOW_OPTIONS.find(o => o.value === cacWindow)?.label}` : 'Lifetime value per acquisition dollar'}
          accent={ltvCacRatio >= 16 ? 'green' : ltvCacRatio >= 8 ? 'yellow' : ltvCacRatio > 0 ? 'red' : 'white'}
          tooltip={ltvCacRatio > 0
            ? `How many dollars of lifetime value are generated for every dollar spent acquiring a customer. Higher is better.\nLTV window: ${WINDOW_LABELS[ltvWindow]} -- CAC window: ${cacWindow === 'all' ? 'all time' : `last ${WINDOW_LABELS[cacWindow]}`}\nLTV (${fmtMrr(ltvDollars)}) ÷ CAC (${fmtMrr(cac)})`
            : qbConfigured ? 'How many dollars of lifetime value are generated per acquisition dollar.\nRequires CAC data from Digits' : 'How many dollars of lifetime value are generated per acquisition dollar.\nConnect Digits to calculate'}
          loading={subs.loading || mktg.loading}
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

        {/* Active subscriptions table */}
        <div className="overflow-x-auto">
          {subs.loading ? (
            <div className="flex justify-center py-8">
              <span className="w-5 h-5 border-2 border-purple border-t-transparent rounded-full animate-spin" />
            </div>
          ) : active.length === 0 ? (
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
                  <SortTh label="Days Left"    colKey="daysUntil"        {...subsSort} onSort={subsSort.toggle} />
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
                    <td className="py-2.5 pr-4">
                      {(() => {
                        const d = daysUntil(sub.currentPeriodEnd);
                        return d >= 0
                          ? <DaysChip days={d} />
                          : <span className="text-xs text-muted">--</span>;
                      })()}
                    </td>
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
                  <td colSpan={5} />
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

      {/* Subscriber health metrics */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="All-Time Subscribers"
          value={totalEverCount.toLocaleString()}
          sub={`${totalCanceledAllTime.toLocaleString()} canceled all-time`}
          accent="white"
          tooltip={`Every unique customer who has ever held a subscription, regardless of current status.\n${active.length} active + ${paused.length} paused + ${totalCanceledAllTime} canceled`}
          loading={subs.loading}
        />
        <StatCard
          label="Active Subscribers"
          value={active.length.toLocaleString()}
          sub={paused.length > 0 ? `+ ${paused.length} paused` : 'currently subscribed'}
          accent="green"
          tooltip={`Customers with a live, billing subscription right now. Paused subscriptions are excluded since they generate no revenue.\n${active.length} currently paying${paused.length > 0 ? ` -- ${paused.length} paused excluded` : ''}`}
          loading={subs.loading}
        />
        <StatCard
          label="Global Churn Rate"
          value={`${churnRate.toFixed(1)}%`}
          sub={`${totalCanceledAllTime} canceled of ${totalEverCount} total`}
          accent={churnAccent}
          tooltip={`The percentage of all customers who have ever canceled. Lower is better -- under 15% annually is healthy.\n${totalCanceledAllTime} canceled ÷ ${totalEverCount} all-time subscribers`}
          loading={subs.loading}
        />
        <StatCard
          label="Avg Subscription Length"
          value={avgSubLengthMonths >= 24
            ? `${(avgSubLengthMonths / 12).toFixed(1)} yr`
            : `${avgSubLengthMonths.toFixed(1)} mo`}
          sub="Active + canceled, all plans"
          accent="white"
          tooltip={`The average time a customer stays subscribed, across both active and canceled accounts. Longer means better retention.\nSum of all subscription lifespans ÷ ${totalEverCount} subscriptions\nActive = time so far; canceled = full lifespan`}
          loading={subs.loading}
        />
      </div>

      {/* Subscription signups bar chart */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted">Subscription Signups</p>
            <p className="text-xs text-muted mt-0.5">New subscriptions per month -- active, paused, and canceled</p>
          </div>
          <div className="flex items-center gap-1 bg-bg rounded-lg p-1 border border-border">
            {[['6', '6mo'], ['12', '12mo'], ['24', '24mo'], ['all', 'All Time']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSignupWindow(val)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  signupWindow === val ? 'bg-purple text-white' : 'text-muted hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {subs.loading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="w-6 h-6 border-2 border-purple border-t-transparent rounded-full animate-spin" />
          </div>
        ) : signupChartData.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No signup data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={signupChartData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={signupWindow === 'all' ? 'preserveStartEnd' : 0}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
                      <p className="text-muted mb-1">{label}</p>
                      <p className="text-purple font-mono">{payload[0].value} signup{payload[0].value !== 1 ? 's' : ''}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="signups" radius={[3, 3, 0, 0]}>
                {signupChartData.map((entry) => (
                  <Cell key={entry.key} fill="#5c3ff4" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
