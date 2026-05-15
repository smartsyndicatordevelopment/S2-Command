import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
      <p className="text-muted mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtDollars(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function Financials() {
  const [reconciled, setReconciled] = useState(false);
  const [expenseView, setExpenseView] = useState('monthly');

  const pnl = useApi(`/api/pnl${reconciled ? '?reconciled=true' : ''}`);

  if (pnl.loading) return <Spinner label="Loading QuickBooks data..." />;
  if (pnl.error) return <ErrorState message={pnl.error} onRetry={pnl.refetch} />;

  const notConfigured = pnl.data?.notConfigured;
  const years = pnl.data?.years || [];
  const reconciledThrough = pnl.data?.reconciledThrough;
  const currentYear = new Date().getFullYear();
  const currentPnl = years.find(y => y.year === currentYear) || {};

  const chartData = years.map(y => ({
    year: String(y.year),
    Income: Math.round(y.totalIncome),
    Expenses: Math.round(y.totalExpenses),
    'Net Income': Math.round(y.netIncome),
  }));

  // Expense lines from current YTD, account numbers stripped
  const expenseLines = (currentPnl.expenseLines || [])
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map(e => ({ ...e, name: stripAccountNumber(e.name) }));

  // Use actual months in the YTD period, not always 12
  const endDate = currentPnl.endDate || '';
  const monthsInPeriod = endDate ? parseInt(endDate.split('-')[1], 10) : new Date().getMonth() + 1;
  const divisor = expenseView === 'monthly' ? monthsInPeriod : 1;
  const viewLabel = expenseView === 'monthly' ? '/mo' : '/yr';

  return (
    <div className="space-y-6">
      {/* Header with reconciled toggle */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Financials</h1>
          <p className="text-xs text-muted mt-0.5">
            QuickBooks -- Cash basis
            {reconciled && reconciledThrough && (
              <span className="ml-2 text-green">-- Through {reconciledThrough}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${!reconciled ? 'text-white' : 'text-muted'}`}>All Data</span>
          <button
            onClick={() => setReconciled(r => !r)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              reconciled ? 'bg-green' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                reconciled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={`text-xs ${reconciled ? 'text-green font-medium' : 'text-muted'}`}>Reconciled</span>
        </div>
      </div>

      {notConfigured && (
        <div className="flex items-center justify-between bg-yellow/10 border border-yellow/20 rounded-lg px-4 py-3">
          <p className="text-sm text-yellow">QuickBooks not connected -- add QB_REALM_ID and credentials to .env, then restart the server.</p>
          <a
            href="/auth/quickbooks"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-yellow border border-yellow/30 rounded px-3 py-1.5 hover:bg-yellow/10 transition-colors flex-shrink-0 ml-4"
          >
            Connect QB
          </a>
        </div>
      )}

      {/* Year summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {years.map(y => (
          <div key={y.year} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted mb-2 font-medium">{y.year}{y.year === currentYear ? ' YTD' : ''}</p>
            <p className="text-white text-lg font-bold">{fmtK(y.totalIncome)}</p>
            <p className="text-xs text-muted mt-1">income</p>
            <div className="mt-2 pt-2 border-t border-border">
              <p className={`text-sm font-semibold ${y.netIncome >= 0 ? 'text-green' : 'text-red'}`}>
                {fmtK(y.netIncome)}
              </p>
              <p className="text-xs text-muted">net</p>
            </div>
          </div>
        ))}
      </div>

      {/* Annual chart */}
      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-5">Annual P&L -- All Years</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} barGap={4} barCategoryGap="30%">
            <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtK} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} width={55} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="Income" fill="#5c3ff4" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Expenses" fill="#2a2a3a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Net Income" radius={[3, 3, 0, 0]}>
              {chartData.map((entry, i) => (
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

      {/* Expense breakdown */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted">{currentYear} Expense Breakdown</p>
            <p className="text-xs text-muted mt-0.5">
              QuickBooks line items
              {expenseView === 'monthly' && ` -- avg over ${monthsInPeriod} month${monthsInPeriod !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-bg rounded-lg p-1 border border-border">
            {['monthly', 'annual'].map(v => (
              <button
                key={v}
                onClick={() => setExpenseView(v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  expenseView === v ? 'bg-purple text-white' : 'text-muted hover:text-white'
                }`}
              >
                {v === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        </div>

        {expenseLines.length === 0 ? (
          <p className="text-sm text-muted">No expense data available</p>
        ) : (
          <div className="space-y-2">
            {expenseLines.map((line, i) => {
              const displayAmt = line.amount / divisor;
              const maxAmt = expenseLines[0].amount / divisor;
              const pct = (displayAmt / maxAmt) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <p className="text-sm text-dim w-48 truncate flex-shrink-0">{line.name}</p>
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-purple" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-sm text-white w-24 text-right flex-shrink-0">
                    {fmtDollars(displayAmt)}{viewLabel}
                  </p>
                </div>
              );
            })}
            <div className="pt-3 border-t border-border flex justify-between">
              <p className="text-xs text-muted">Total Expenses</p>
              <p className="text-sm text-yellow">
                {fmtDollars((currentPnl.totalExpenses || 0) / divisor)}{viewLabel}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Historical P&L table */}
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
    </div>
  );
}
