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

function ViewToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-bg rounded-lg p-1 border border-border">
      {['Annual', 'T-12'].map(v => (
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
      <span className={`text-xs ${!value ? 'text-white' : 'text-muted'}`}>All</span>
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
      <span className={`text-xs ${value ? 'text-green font-medium' : 'text-muted'}`}>Reconciled</span>
    </div>
  );
}

function ExpenseBreakdown({ lines, divisor, totalExpenses, label }) {
  const [view, setView] = useState('monthly');
  const div = view === 'monthly' ? divisor : 1;
  const suffix = view === 'monthly' ? '/mo' : '/yr';
  const max = lines[0]?.amount / div || 1;

  return (
    <Card>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted">{label}</p>
          <p className="text-xs text-muted mt-0.5">QuickBooks line items</p>
        </div>
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
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted">No expense data available</p>
      ) : (
        <div className="space-y-2">
          {lines.map((line, i) => {
            const amt = line.amount / div;
            return (
              <div key={i} className="flex items-center gap-3">
                <p className="text-sm text-dim w-48 truncate flex-shrink-0">{line.name}</p>
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-purple" style={{ width: `${(amt / max) * 100}%` }} />
                </div>
                <p className="text-sm text-white w-24 text-right flex-shrink-0">
                  {fmtDollars(amt)}{suffix}
                </p>
              </div>
            );
          })}
          <div className="pt-3 border-t border-border flex justify-between">
            <p className="text-xs text-muted">Total Expenses</p>
            <p className="text-sm text-yellow">{fmtDollars(totalExpenses / div)}{suffix}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Financials() {
  const [viewMode, setViewMode] = useState('Annual');
  const [reconciled, setReconciled] = useState(false);

  const pnl = useApi(`/api/pnl${reconciled ? '?reconciled=true' : ''}`);
  const monthly = useApi(
    viewMode === 'T-12' ? `/api/pnl/monthly${reconciled ? '?reconciled=true' : ''}` : null
  );

  const currentYear = new Date().getFullYear();

  // -- Annual view data --
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

  const annualExpenseLines = (currentPnl.expenseLines || [])
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map(e => ({ ...e, name: stripAccountNumber(e.name) }));

  // -- T-12 view data --
  const months = monthly.data?.months || [];

  const t12ChartData = months.map(m => ({
    label: m.label + (m.isMTD ? '*' : ''),
    Income: Math.round(m.totalIncome),
    Expenses: Math.round(m.totalExpenses),
    'Net Income': Math.round(m.netIncome),
  }));

  // Aggregate expense lines across all T-12 months, show monthly avg
  const t12ExpenseMap = {};
  months.forEach(m => {
    (m.expenseLines || []).forEach(line => {
      const name = stripAccountNumber(line.name);
      t12ExpenseMap[name] = (t12ExpenseMap[name] || 0) + line.amount;
    });
  });
  const t12MonthCount = months.length || 12;
  const t12ExpenseLines = Object.entries(t12ExpenseMap)
    .map(([name, total]) => ({ name, amount: total / t12MonthCount }))
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const t12TotalExpenses = months.reduce((s, m) => s + m.totalExpenses, 0) / t12MonthCount;

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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {years.map(y => (
                  <div key={y.year} className="bg-card border border-border rounded-lg p-4">
                    <p className="text-xs text-muted mb-2 font-medium">{y.year}{y.year === currentYear ? ' YTD' : ''}</p>
                    <p className="text-white text-lg font-bold">{fmtK(y.totalIncome)}</p>
                    <p className="text-xs text-muted mt-1">income</p>
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className={`text-sm font-semibold ${y.netIncome >= 0 ? 'text-green' : 'text-red'}`}>{fmtK(y.netIncome)}</p>
                      <p className="text-xs text-muted">net</p>
                    </div>
                  </div>
                ))}
              </div>

              <Card>
                <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">Annual P&L -- All Years</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={annualChartData} barGap={4} barCategoryGap="30%">
                    <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<AnnualTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="Income" fill="#5c3ff4" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#2a2a3a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Net Income" radius={[3, 3, 0, 0]}>
                      {annualChartData.map((entry, i) => (
                        <Cell key={i} fill={entry['Net Income'] >= 0 ? '#22c55e' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 mt-2">
                  {[['Income', '#5c3ff4'], ['Expenses', '#2a2a3a'], ['Net Income', '#22c55e']].map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-xs text-muted">{label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <ExpenseBreakdown
                lines={annualExpenseLines}
                divisor={monthsInPeriod}
                totalExpenses={currentPnl.totalExpenses || 0}
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
              {/* Summary stat row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Avg Monthly Income', value: months.reduce((s, m) => s + m.totalIncome, 0) / t12MonthCount, color: 'text-purple' },
                  { label: 'Avg Monthly Expenses', value: t12TotalExpenses, color: 'text-dim' },
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

              {/* Bar chart: Income + Expenses per month */}
              <Card>
                <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">
                  Monthly Income vs Expenses -- Trailing 12 Months
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={t12ChartData} barGap={3} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="Income" name="Income" fill="#5c3ff4" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Expenses" name="Expenses" fill="#2a2a3a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 mt-2">
                  {[['Income', '#5c3ff4'], ['Expenses', '#2a2a3a']].map(([label, color]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="text-xs text-muted">{label}</span>
                    </div>
                  ))}
                  {reconciled && <span className="text-xs text-muted ml-auto">Reconciled months only</span>}
                </div>
              </Card>

              {/* Line chart: Net Income trend */}
              <Card>
                <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">
                  Net Income Trend -- Trailing 12 Months
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={t12ChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<MonthlyTooltip />} cursor={{ stroke: '#3a3a4a', strokeWidth: 1 }} />
                    <ReferenceLine y={0} stroke="#3a3a4a" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="Net Income"
                      name="Net Income"
                      stroke="#9ca3af"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const fill = payload['Net Income'] >= 0 ? '#22c55e' : '#ef4444';
                        return <circle key={cx} cx={cx} cy={cy} r={4} fill={fill} stroke="none" />;
                      }}
                      activeDot={{ r: 5, fill: '#ffffff' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                {months.some(m => m.isMTD) && (
                  <p className="text-xs text-muted mt-2">* Current month is MTD (month-to-date)</p>
                )}
              </Card>

              {/* Expense breakdown: T-12 monthly average */}
              <ExpenseBreakdown
                lines={t12ExpenseLines}
                divisor={1}
                totalExpenses={t12TotalExpenses}
                label="Expense Breakdown -- T-12 Monthly Avg"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
