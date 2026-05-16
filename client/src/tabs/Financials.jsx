import { useState } from 'react';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, CartesianGrid,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';

function fmtK(val) {
  if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function fmtDollars(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function stripAccountNumber(name) {
  return name.replace(/^\d[\d.]*\s+/, '');
}

// -- Module-level tree helpers --

function mergeIntoTree(treeMap, items) {
  (items || []).forEach(item => {
    const name = stripAccountNumber(item.name);
    if (!treeMap[name]) treeMap[name] = { name, amount: 0, children: {} };
    treeMap[name].amount += item.amount;
    mergeIntoTree(treeMap[name].children, item.children);
  });
}

function treeMapToLines(treeMap) {
  return Object.values(treeMap)
    .map(node => ({ name: node.name, amount: node.amount, children: treeMapToLines(node.children) }))
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function processGroupedLines(items) {
  return (items || [])
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map(e => ({
      name: stripAccountNumber(e.name),
      amount: e.amount,
      children: processGroupedLines(e.children),
    }));
}


// -- Tooltips --

const AnnualTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmtDollars(p.value)}</p>
      ))}
    </div>
  );
};

const MonthlyTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs min-w-[140px]">
      <p className="text-muted mb-1.5 font-medium">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="mb-0.5" style={{ color: p.color }}>
          {p.name}: {fmtDollars(p.value)}
        </p>
      ))}
    </div>
  );
};

// -- Controls --

function ViewToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-bg rounded-lg p-1 border border-border">
      {['T-12', 'Annual'].map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            value === v ? 'bg-purple text-white' : 'text-muted hover:text-white'
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ReconciledSwitch({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${value ? 'text-green font-medium' : 'text-muted'}`}>Reconciled</span>
      <button
        onClick={() => onChange(v => !v)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
          value ? 'bg-green' : 'bg-border'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
      <span className={`text-xs ${!value ? 'text-white' : 'text-muted'}`}>All</span>
    </div>
  );
}

// -- Expandable row (recursive) --

function ExpenseRow({ line, div, max, suffix, depth }) {
  const [open, setOpen] = useState(false);
  const amt = line.amount / div;
  const hasChildren = line.children?.length > 0;
  const barOpacity = Math.max(0.25, 1 - depth * 0.25);

  return (
    <div>
      <div
        className={`flex items-center gap-3 py-0.5 ${hasChildren ? 'cursor-pointer group' : ''}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onClick={() => hasChildren && setOpen(o => !o)}
      >
        <span className="w-3 text-xs text-muted flex-shrink-0 text-center select-none">
          {hasChildren ? (open ? '▾' : '▸') : ''}
        </span>
        <p className={`truncate flex-shrink-0 w-44 ${
          depth === 0
            ? `text-sm font-medium text-white${hasChildren ? ' group-hover:text-purple transition-colors' : ''}`
            : `text-sm${hasChildren ? ' text-white font-medium group-hover:text-purple transition-colors' : ' text-dim'}`
        }`}>
          {line.name}
        </p>
        <div className={`flex-1 rounded-full overflow-hidden bg-border ${depth === 0 ? 'h-1.5' : 'h-1'}`}>
          <div
            className="h-full rounded-full"
            style={{ width: `${(amt / max) * 100}%`, backgroundColor: `rgba(92,63,244,${barOpacity})` }}
          />
        </div>
        <p className={`flex-shrink-0 w-24 text-right ${depth === 0 ? 'text-sm text-white' : 'text-xs text-dim'}`}>
          {fmtDollars(amt)}{suffix}
        </p>
      </div>
      {hasChildren && open && (
        <div className="border-l border-border/40 ml-5 pl-1 mt-0.5 mb-1.5">
          {line.children.map((child, j) => (
            <ExpenseRow key={j} line={child} div={div} max={max} suffix={suffix} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// -- Financial breakdown card (income or expense) --

function FinancialBreakdown({ lines, divisor, totalAmount, label, isIncome = false, showToggle = true }) {
  const [view, setView] = useState('monthly');
  const div = showToggle ? (view === 'monthly' ? divisor : 1) : 1;
  const suffix = showToggle && view === 'monthly' ? '/mo' : '';
  const max = lines[0]?.amount / div || 1;

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted">{label}</p>
          <p className="text-xs text-muted mt-0.5">QuickBooks line items -- click categories to expand</p>
        </div>
        {showToggle && (
          <div className="flex items-center gap-1 bg-bg rounded-lg p-1 border border-border">
            {['monthly', 'annual'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  view === v ? 'bg-purple text-white' : 'text-muted hover:text-white'
                }`}
              >
                {v === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        )}
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">No data available</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((line, i) => (
            <ExpenseRow key={i} line={line} div={div} max={max} suffix={suffix} depth={0} />
          ))}
          <div className="pt-3 border-t border-border flex justify-between">
            <p className="text-xs text-muted">{isIncome ? 'Total Income' : 'Total Expenses'}</p>
            <p className={`text-sm ${isIncome ? 'text-purple' : 'text-yellow'}`}>
              {fmtDollars(totalAmount / div)}{suffix}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

// -- Main --

export default function Financials() {
  const [viewMode, setViewMode] = useState('T-12');
  const [reconciled, setReconciled] = useState(true);
  const [showIncomeLine, setShowIncomeLine] = useState(false);
  const [showExpenseLine, setShowExpenseLine] = useState(false);
  const [subSort, setSubSort] = useState({ col: 'monthlyAvg', dir: 'desc' });
  const [hideInactive, setHideInactive] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);

  const pnl = useApi(`/api/pnl${reconciled ? '?reconciled=true' : ''}`);
  const monthly = useApi(
    viewMode === 'T-12' ? `/api/pnl/monthly${reconciled ? '?reconciled=true' : ''}` : null
  );
  const subscriptions = useApi(viewMode === 'T-12' ? '/api/software-subscriptions' : null);

  const currentYear = new Date().getFullYear();

  // Annual view data
  const notConfigured = pnl.data?.notConfigured;
  const years = pnl.data?.years || [];
  const reconciledThrough = pnl.data?.reconciledThrough;
  const currentPnl = years.find(y => y.year === currentYear) || {};

  const annualChartData = years.map(y => ({
    year: String(y.year),
    Income: Math.round(y.totalIncome),
    Expenses: Math.round(y.totalExpenses),
    'Net Income': Math.round(y.netIncome),
  }));

  const endDate = currentPnl.endDate || '';
  const monthsInPeriod = endDate ? parseInt(endDate.split('-')[1], 10) : new Date().getMonth() + 1;
  const annualExpenseLines = processGroupedLines(currentPnl.groupedExpenseLines);

  // T-12 view data
  const months = monthly.data?.months || [];
  const t12MonthCount = months.length || 12;
  const lastMonth = months[months.length - 1] || {};

  const t12ChartData = months.map(m => ({
    label: m.label + (m.isMTD ? '*' : ''),
    Income: Math.round(m.totalIncome),
    Expenses: Math.round(m.totalExpenses),
    'Net Income': Math.round(m.netIncome),
  }));

  // T-12 expense tree
  const t12ExpTreeMap = {};
  months.forEach(m => mergeIntoTree(t12ExpTreeMap, m.groupedExpenseLines || []));
  const t12ExpenseLines = treeMapToLines(t12ExpTreeMap);
  const t12TotalExpenses = months.reduce((s, m) => s + m.totalExpenses, 0);

  // T-12 income tree
  const t12IncTreeMap = {};
  months.forEach(m => mergeIntoTree(t12IncTreeMap, m.groupedIncomeLines || []));
  const t12IncomeLines = treeMapToLines(t12IncTreeMap);
  const t12TotalIncome = months.reduce((s, m) => s + m.totalIncome, 0);

  // Last month processed lines
  const lastMonthExpenseLines = processGroupedLines(lastMonth.groupedExpenseLines);
  const lastMonthIncomeLines = processGroupedLines(lastMonth.groupedIncomeLines);

  // Software subscriptions (from transaction-level QB query)
  const softwareSubs = subscriptions.data?.vendors || [];

  const freqOrder = { Monthly: 0, Quarterly: 1, 'Semi-Annual': 2, Annual: 3 };
  const sortedSubs = [...softwareSubs].sort((a, b) => {
    const { col, dir } = subSort;
    let av = a[col], bv = b[col];
    if (col === 'freq') { av = freqOrder[av] ?? 99; bv = freqOrder[bv] ?? 99; }
    if (col === 'active') { av = av ? 0 : 1; bv = bv ? 0 : 1; }
    if (col === 'name') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  const thirty = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const filteredSubs = sortedSubs
    .filter(s => !hideInactive || s.active)
    .filter(s => !recentOnly || (s.lastTxnDate && s.lastTxnDate >= thirty));

  const toggleSort = (col) =>
    setSubSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });

  const SortIcon = ({ col }) => {
    if (subSort.col !== col) return <span className="ml-1 text-border">↕</span>;
    return <span className="ml-1 text-purple">{subSort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const showAnnual = viewMode === 'Annual';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Financials</h1>
          <p className="text-xs text-muted mt-0.5">
            QuickBooks -- Cash basis
            {reconciled && reconciledThrough && showAnnual && (
              <span className="ml-2 text-green">-- Through {reconciledThrough}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <ReconciledSwitch value={reconciled} onChange={setReconciled} />
        </div>
      </div>

      {notConfigured && (
        <div className="flex items-center justify-between bg-yellow/10 border border-yellow/20 rounded-lg px-4 py-3">
          <p className="text-sm text-yellow">QuickBooks not connected.</p>
          <a href="/auth/quickbooks" target="_blank" rel="noreferrer"
            className="text-xs text-yellow border border-yellow/30 rounded px-3 py-1.5 hover:bg-yellow/10 transition-colors flex-shrink-0 ml-4">
            Connect QB
          </a>
        </div>
      )}

      {/* ── ANNUAL VIEW ── */}
      {showAnnual && (
        <>
          {pnl.loading ? <Spinner label="Loading QuickBooks data..." /> :
           pnl.error ? <ErrorState message={pnl.error} onRetry={pnl.refetch} /> : (
            <>
              <Card>
                <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">Annual P&L -- All Years</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={annualChartData} barGap={4} barCategoryGap="30%">
                    <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<AnnualTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="Income" fill="#5c3ff4" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Net Income" radius={[3, 3, 0, 0]}>
                      {annualChartData.map((entry, i) => (
                        <Cell key={i} fill={entry['Net Income'] >= 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 mt-2">
                  {[['Income', '#5c3ff4'], ['Expenses', '#f59e0b'], ['Net Income', '#22c55e']].map(([l, color]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-xs text-muted">{l}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <FinancialBreakdown
                lines={annualExpenseLines}
                divisor={monthsInPeriod}
                totalAmount={currentPnl.totalExpenses || 0}
                label={`${currentYear} Expense Breakdown`}
              />

              <Card>
                <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Historical P&L Summary</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <th className="text-xs text-muted font-medium pb-3 pr-4">Year</th>
                      <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">Income</th>
                      <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">Expenses</th>
                      <th className="text-xs text-muted font-medium pb-3 text-right">Net Income</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...years].reverse().map(y => (
                      <tr key={y.year}>
                        <td className="py-2.5 pr-4 text-white font-medium">
                          {y.year}{y.year === currentYear ? <span className="text-purple text-xs ml-1">YTD</span> : ''}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-dim">{fmtDollars(y.totalIncome)}</td>
                        <td className="py-2.5 pr-4 text-right text-dim">{fmtDollars(y.totalExpenses)}</td>
                        <td className={`py-2.5 text-right font-semibold ${y.netIncome >= 0 ? 'text-green' : 'text-red'}`}>
                          {fmtDollars(y.netIncome)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}

      {/* ── T-12 VIEW ── */}
      {!showAnnual && (
        <>
          {monthly.loading ? <Spinner label="Loading 12 months of data..." /> :
           monthly.error ? <ErrorState message={monthly.error} onRetry={monthly.refetch} /> : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Avg Monthly Income', value: t12TotalIncome / t12MonthCount, color: 'text-purple' },
                  { label: 'Avg Monthly Expenses', value: t12TotalExpenses / t12MonthCount, color: 'text-dim' },
                  { label: 'Avg Monthly Net', value: months.reduce((s, m) => s + m.netIncome, 0) / t12MonthCount, color: null },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted mb-2">{label}</p>
                    <p className={`text-lg font-bold ${color || (value >= 0 ? 'text-green' : 'text-red')}`}>
                      {fmtDollars(value)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              <Card>
                <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">
                  Monthly P&L -- Trailing 12 Months
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={t12ChartData} barGap={3} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="Income" name="Income" fill="#5c3ff4" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Expenses" name="Expenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Net Income" name="Net Income" radius={[3, 3, 0, 0]}>
                      {t12ChartData.map((entry, i) => (
                        <Cell key={i} fill={entry['Net Income'] >= 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 mt-2">
                  {[['Income', '#5c3ff4'], ['Expenses', '#f59e0b'], ['Net Income', '#22c55e']].map(([l, color]) => (
                    <div key={l} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-xs text-muted">{l}</span>
                    </div>
                  ))}
                  {reconciled && <span className="text-xs text-muted ml-auto">Reconciled months only</span>}
                </div>
              </Card>

              {/* Net income trend with optional income / expense overlays */}
              <Card>
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">
                    Net Income Trend -- Trailing 12 Months
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowIncomeLine(v => !v)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        showIncomeLine
                          ? 'bg-purple/20 border-purple text-purple'
                          : 'border-border text-muted hover:text-white'
                      }`}
                    >
                      + Income
                    </button>
                    <button
                      onClick={() => setShowExpenseLine(v => !v)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        showExpenseLine
                          ? 'bg-yellow/20 border-yellow text-yellow'
                          : 'border-border text-muted hover:text-white'
                      }`}
                    >
                      + Expenses
                    </button>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={t12ChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<MonthlyTooltip />} cursor={{ stroke: '#3a3a4a', strokeWidth: 1 }} />
                    <ReferenceLine y={0} stroke="#3a3a4a" strokeDasharray="4 4" />
                    {showIncomeLine && (
                      <Line type="monotone" dataKey="Income" name="Income" stroke="#5c3ff4"
                        strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} strokeDasharray="5 3" />
                    )}
                    {showExpenseLine && (
                      <Line type="monotone" dataKey="Expenses" name="Expenses" stroke="#f59e0b"
                        strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} strokeDasharray="5 3" />
                    )}
                    <Line
                      type="monotone" dataKey="Net Income" name="Net Income"
                      stroke="#9ca3af" strokeWidth={2}
                      dot={({ cx, cy, payload }) => {
                        const fill = payload['Net Income'] >= 0 ? '#22c55e' : '#ef4444';
                        return <circle key={cx} cx={cx} cy={cy} r={4} fill={fill} stroke="none" />;
                      }}
                      activeDot={{ r: 5, fill: '#ffffff' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                {months.some(m => m.isMTD) && (
                  <p className="text-xs text-muted mt-2">* Current month is MTD</p>
                )}
              </Card>

              {/* Revenue breakdowns */}
              <FinancialBreakdown
                lines={t12IncomeLines}
                divisor={t12MonthCount}
                totalAmount={t12TotalIncome}
                label="Revenue Breakdown -- T-12 Monthly Avg"
                isIncome
              />

              {/* Expense breakdowns */}
              <FinancialBreakdown
                lines={t12ExpenseLines}
                divisor={t12MonthCount}
                totalAmount={t12TotalExpenses}
                label="Expense Breakdown -- T-12 Monthly Avg"
              />

              {/* Software subscriptions */}
              {subscriptions.loading && (
                <Spinner label="Loading software subscriptions..." />
              )}
              {!subscriptions.loading && softwareSubs.length > 0 && (
                <Card>
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-widest text-muted">Software Subscriptions</p>
                      <p className="text-xs text-muted mt-0.5">
                        Detected from QuickBooks -- billing frequency estimated from transaction history
                      </p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-muted whitespace-nowrap">Active only</span>
                        <button
                          onClick={() => setHideInactive(v => !v)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${hideInactive ? 'bg-green' : 'bg-border'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${hideInactive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-muted whitespace-nowrap">Last 30 days</span>
                        <button
                          onClick={() => setRecentOnly(v => !v)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${recentOnly ? 'bg-purple' : 'bg-border'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${recentOnly ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </label>
                      <p className="text-xs text-muted">{filteredSubs.length} vendors</p>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="text-xs text-muted font-medium pb-3 pr-4 cursor-pointer hover:text-white select-none" onClick={() => toggleSort('name')}>
                          Vendor<SortIcon col="name" />
                        </th>
                        <th className="text-xs text-muted font-medium pb-3 pr-4 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('monthlyAvg')}>
                          Avg / mo<SortIcon col="monthlyAvg" />
                        </th>
                        <th className="text-xs text-muted font-medium pb-3 pr-4 text-center cursor-pointer hover:text-white select-none" onClick={() => toggleSort('freq')}>
                          Billing<SortIcon col="freq" />
                        </th>
                        <th className="text-xs text-muted font-medium pb-3 pr-4 text-center cursor-pointer hover:text-white select-none" onClick={() => toggleSort('active')}>
                          Status<SortIcon col="active" />
                        </th>
                        <th className="text-xs text-muted font-medium pb-3 text-right cursor-pointer hover:text-white select-none" onClick={() => toggleSort('annualEst')}>
                          Annual Est.<SortIcon col="annualEst" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredSubs.map((sub, i) => (
                        <tr key={i}>
                          <td className="py-2.5 pr-4 text-white">{sub.name}</td>
                          <td className="py-2.5 pr-4 text-right text-dim">{fmtDollars(sub.monthlyAvg)}</td>
                          <td className="py-2.5 pr-4 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              sub.freq === 'Monthly' ? 'bg-purple/20 text-purple' :
                              sub.freq === 'Annual' ? 'bg-green/20 text-green' :
                              'bg-border text-muted'
                            }`}>
                              {sub.freq}
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              sub.active ? 'bg-green/20 text-green' : 'bg-red/20 text-red'
                            }`}>
                              {sub.active ? 'Active' : 'Cancelled'}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-white font-medium">{fmtDollars(sub.annualEst)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td className="pt-3 text-xs text-muted" colSpan={4}>
                          {recentOnly ? 'Total spent in last 30 days' : 'Total annual software spend (estimated)'}
                        </td>
                        <td className="pt-3 text-right text-sm text-yellow font-semibold">
                          {recentOnly
                            ? fmtDollars(filteredSubs.reduce((s, v) => s + v.last30Total, 0))
                            : fmtDollars(filteredSubs.reduce((s, v) => s + v.annualEst, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </Card>
              )}

              {/* 1-month snapshots -- together at bottom */}
              {lastMonth.label && (
                <FinancialBreakdown
                  lines={lastMonthIncomeLines}
                  divisor={1}
                  totalAmount={lastMonth.totalIncome || 0}
                  label={`Revenue Breakdown -- ${lastMonth.label}`}
                  isIncome
                  showToggle={false}
                />
              )}
              {lastMonth.label && (
                <FinancialBreakdown
                  lines={lastMonthExpenseLines}
                  divisor={1}
                  totalAmount={lastMonth.totalExpenses || 0}
                  label={`Expense Breakdown -- ${lastMonth.label}`}
                  showToggle={false}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
