import { useState, useMemo } from 'react';
import { Calculator, Download, AlertTriangle, CheckCircle, FileText, RotateCcw, ChevronDown, ChevronUp, ChevronRight, ChevronsUpDown, Copy, Check } from 'lucide-react';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';

const TX_TAX_RATE = 0.0825;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SOURCE_LABELS = {
  customer_address: 'Customer Record',
  billing_details: 'Billing Details',
  zip: 'ZIP Code',
  manual: 'Manual',
};

const SOURCE_STYLES = {
  customer_address: { backgroundColor: 'rgba(92,63,244,0.15)', color: '#5c3ff4' },
  billing_details:  { backgroundColor: 'rgba(34,197,94,0.1)',  color: '#22c55e' },
  zip:              { backgroundColor: 'var(--c-subtle-5)', color: 'var(--c-muted)' },
  manual:           { backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
};

const STATE_ABBR = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
};

function normalizeState(raw) {
  if (!raw) return '--';
  const trimmed = raw.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const mapped = STATE_ABBR[trimmed.toLowerCase()];
  return mapped || trimmed;
}

function applySort(rows, sort) {
  return [...rows].sort((a, b) => {
    let av, bv;
    switch (sort.key) {
      case 'date':   av = a.date;   bv = b.date;   break;
      case 'amount': av = a.amount; bv = b.amount; break;
      case 'name':   av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); break;
      case 'state':  av = normalizeState(a.resolvedState); bv = normalizeState(b.resolvedState); break;
      default: return 0;
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sort.dir === 'asc' ? cmp : -cmp;
  });
}

function SortTh({ label, colKey, sort, onSort, align = 'left', className = '' }) {
  const active = sort.key === colKey;
  const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
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

function fmt(dollars) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function exportCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportFullReport({ result, derived, monthLabel, periodStart, periodEnd }) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const fix = n => n.toFixed(2);

  // Column definition -- no Category column; sections act as the category label
  const COLS = ['id', 'name', 'email', 'date', 'amount', 'location', 'source', 'exclusion_reason'];
  const COL_HEADERS = ['Transaction ID', 'Name', 'Email', 'Date', 'Amount', 'Location', 'Source', 'Exclusion Reason'];

  const dataLine = r => COLS.map(c => q(r[c])).join(',');
  // Section header: bold label in col A, empty cells fill remaining columns so Excel reads it as a row
  const sectionLine = label => [q(label), ...Array(COLS.length - 1).fill('""')].join(',');

  const txRows = derived.allTxRows.map(t => ({
    id: t.id, name: t.name, email: t.email,
    date: fmtDate(t.date), amount: fix(t.amount / 100),
    location: t.resolvedState || 'TX',
    source: SOURCE_LABELS[t.stateSource] || t.stateSource,
    exclusion_reason: '',
  }));

  const otherRows = derived.allOtherRows.map(t => ({
    id: t.id, name: t.name, email: t.email,
    date: fmtDate(t.date), amount: fix(t.amount / 100),
    location: t.resolvedState || '',
    source: SOURCE_LABELS[t.stateSource] || t.stateSource,
    exclusion_reason: '',
  }));

  const unknownRows = derived.pending.map(t => ({
    id: t.id, name: t.name, email: t.email,
    date: fmtDate(t.date), amount: fix(t.amount / 100),
    location: '', source: 'Unknown',
    exclusion_reason: 'No location data -- manual review required',
  }));

  const excludedRows = (result.excludedTransactions || []).map(t => ({
    id: t.id, name: t.name, email: t.email,
    date: fmtDate(t.date), amount: fix(t.amount / 100),
    location: '', source: '',
    exclusion_reason: t.reason || '',
  }));

  const generated = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const lines = [
    // Report header
    q('S2 Command -- Texas Sales Tax Report'),
    [q('Period'),             q(monthLabel)].join(','),
    [q('Generated'),          q(generated)].join(','),
    [q('Report Period (CT)'), q(`${periodStart} -- ${periodEnd}`)].join(','),
    '',
    // Summary block
    q('SUMMARY'),
    [q('Texas Revenue'),             q(`$${derived.txRevenue.toFixed(2)}`)].join(','),
    [q('Tax Rate'),                  q('8.25%')].join(','),
    [q('Tax Due'),                   q(`$${derived.taxDue.toFixed(2)}`)].join(','),
    [q('Texas Transactions'),        q(String(txRows.length))].join(','),
    [q('Other State Transactions'),  q(String(otherRows.length))].join(','),
    [q('Unclassified Transactions'), q(String(unknownRows.length))].join(','),
    [q('Excluded Transactions'),     q(String(excludedRows.length))].join(','),
    [q('Total Charges Fetched'),     q(String(result.summary.totalChargesFetched))].join(','),
    '',
    // Single column header row for the whole transaction table
    COL_HEADERS.map(q).join(','),
    '',
    // Texas section
    sectionLine(`Texas Transactions (${txRows.length})`),
    ...txRows.map(dataLine),
    '',
    // Other State section
    sectionLine(`Other State Transactions (${otherRows.length})`),
    ...otherRows.map(dataLine),
  ];

  // Unclassified -- only emit if present
  if (unknownRows.length > 0) {
    lines.push('', sectionLine(`Unclassified Transactions (${unknownRows.length})`));
    unknownRows.forEach(r => lines.push(dataLine(r)));
  }

  // Excluded -- always emit
  lines.push('', sectionLine(`Excluded Transactions (${excludedRows.length})`));
  excludedRows.forEach(r => lines.push(dataLine(r)));

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-tax-report-${result.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

export default function SalesTax() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [calculating, setCalculating]       = useState(false);
  const [result, setResult]                 = useState(null);
  const [calcError, setCalcError]           = useState(null);
  const [showExclusions, setShowExclusions] = useState(false);
  const [txRevCopied, setTxRevCopied]       = useState(false);

  const copyTxRevenue = () => {
    if (!derived) return;
    navigator.clipboard.writeText(String(Math.round(derived.txRevenue)));
    setTxRevCopied(true);
    setTimeout(() => setTxRevCopied(false), 1500);
  };
  const [txSort,    setTxSort]    = useState({ key: 'date', dir: 'asc' });
  const [otherSort, setOtherSort] = useState({ key: 'date', dir: 'asc' });

  const toggleTxSort    = (key) => setTxSort(prev    => ({ key, dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc' }));
  const toggleOtherSort = (key) => setOtherSort(prev => ({ key, dir: prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc' }));

  // { [chargeId]: 'TX' | 'OTHER' } -- cleared on each new calculation
  const [classifications, setClassifications] = useState({});

  const classify   = (id, as) => setClassifications(prev => ({ ...prev, [id]: as }));
  const unclassify = (id)     => setClassifications(prev => { const n = { ...prev }; delete n[id]; return n; });

  const calculate = async () => {
    setCalculating(true);
    setCalcError(null);
    setResult(null);
    setClassifications({});

    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    try {
      const data = await fetchWithRetry(`/api/sales-tax?month=${monthStr}`);
      setResult(data);
    } catch (err) {
      setCalcError(err.message);
    } finally {
      setCalculating(false);
    }
  };

  // Derived values -- recomputed whenever result or classifications change
  const derived = useMemo(() => {
    if (!result) return null;

    const manualTx    = result.unknownTransactions.filter(t => classifications[t.id] === 'TX');
    const manualOther = result.unknownTransactions.filter(t => classifications[t.id] === 'OTHER');
    const pending     = result.unknownTransactions.filter(t => !classifications[t.id]);

    const allTxRows = [
      ...result.txTransactions,
      ...manualTx.map(t => ({ ...t, stateSource: 'manual' })),
    ];

    const allOtherRows = [
      ...result.otherTransactions,
      ...manualOther.map(t => ({ ...t, stateSource: 'manual' })),
    ];

    const txRevenue   = allTxRows.reduce((sum, t) => sum + t.amount, 0) / 100;
    const otherRevenue = allOtherRows.reduce((sum, t) => sum + t.amount, 0) / 100;
    const taxDue      = txRevenue * TX_TAX_RATE;

    return { allTxRows, allOtherRows, manualTx, manualOther, pending, txRevenue, otherRevenue, taxDue };
  }, [result, classifications]);

  const years = [];
  for (let y = 2022; y <= now.getFullYear(); y++) years.push(y);

  const monthLabel = result
    ? `${MONTH_NAMES[parseInt(result.month.split('-')[1]) - 1]} ${result.month.split('-')[0]}`
    : null;

  const periodStart = result
    ? new Date(result.period.startUtc).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : null;

  const periodEnd = result
    ? new Date(result.period.endUtc).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : null;

  const totalUnknown = result?.unknownTransactions.length ?? 0;
  const pendingCount = derived?.pending.length ?? 0;
  const classifiedCount = totalUnknown - pendingCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-white">Texas Sales Tax</h1>
        <p className="text-xs text-muted mt-0.5">Monthly liability calculator -- 8.25% Texas state rate -- sourced from Stripe</p>
      </div>

      {/* Controls */}
      <Card>
        <p className="text-xs font-medium uppercase tracking-widest text-muted mb-4">Select Period</p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-muted">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-bg border border-border text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-purple"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-widest text-muted">Year</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-bg border border-border text-white text-xs rounded px-3 py-2 focus:outline-none focus:border-purple"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button
            onClick={calculate}
            disabled={calculating}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-medium transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#5c3ff4', color: '#fff' }}
            onMouseEnter={e => { if (!calculating) e.currentTarget.style.backgroundColor = '#4f35d4'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#5c3ff4'; }}
          >
            <Calculator size={12} />
            {calculating ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </Card>

      {calculating && <Spinner label="Fetching Stripe transactions..." />}

      {calcError && (
        <Card>
          <div className="flex items-center gap-2 text-sm" style={{ color: '#ef4444' }}>
            <AlertTriangle size={14} />
            <span>{calcError}</span>
          </div>
        </Card>
      )}

      {result && derived && !calculating && (
        <>
          {/* Summary -- updates live as user classifies */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-medium uppercase tracking-widest text-muted">
                Summary -- {monthLabel}
              </p>
              <div className="flex items-center gap-3">
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#f59e0b' }}>
                    <AlertTriangle size={11} />
                    {pendingCount} unclassified -- total may be incomplete
                  </span>
                )}
                {pendingCount === 0 && totalUnknown > 0 && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
                    <CheckCircle size={11} />
                    All transactions classified
                  </span>
                )}
                <button
                  onClick={() => exportFullReport({ result, derived, monthLabel, periodStart, periodEnd })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors"
                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-dim)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#5c3ff4'; e.currentTarget.style.color = '#5c3ff4'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-dim)'; }}
                >
                  <Download size={11} />
                  Download Report
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div>
                <p className="text-xs text-muted mb-1 uppercase tracking-widest font-medium">Texas Revenue</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-mono text-white">{fmt(derived.txRevenue)}</p>
                  <button
                    onClick={copyTxRevenue}
                    title="Copy rounded to nearest dollar"
                    className="flex items-center justify-center w-6 h-6 rounded transition-colors"
                    style={{ color: txRevCopied ? '#22c55e' : '#6b7280' }}
                    onMouseEnter={e => { if (!txRevCopied) e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { if (!txRevCopied) e.currentTarget.style.color = '#6b7280'; }}
                  >
                    {txRevCopied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
                <p className="text-xs text-muted mt-1">
                  {derived.allTxRows.length} transaction{derived.allTxRows.length !== 1 ? 's' : ''}
                  {derived.manualTx.length > 0 && (
                    <span style={{ color: '#f59e0b' }}> ({derived.manualTx.length} manual)</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1 uppercase tracking-widest font-medium">Tax Rate</p>
                <p className="text-2xl font-mono" style={{ color: '#5c3ff4' }}>8.25%</p>
                <p className="text-xs text-muted mt-1">Texas state rate</p>
              </div>
              <div>
                <p className="text-xs text-muted mb-1 uppercase tracking-widest font-medium">Tax Due</p>
                <p className="text-2xl font-mono" style={{ color: '#22c55e' }}>{fmt(derived.taxDue)}</p>
                <p className="text-xs text-muted mt-1">Texas liability</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-1.5">
              <p className="text-xs text-muted uppercase tracking-widest font-medium mb-2">Calculation</p>
              <p className="text-sm font-mono text-dim">
                {fmt(derived.txRevenue)} &times; 0.0825 ={' '}
                <span style={{ color: '#22c55e' }}>{fmt(derived.taxDue)}</span>
              </p>
              <p className="text-xs text-muted">
                Period (CT): {periodStart} -- {periodEnd}
              </p>
            </div>
          </Card>

          {/* TX Transaction Log */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted">
                Texas Transactions ({derived.allTxRows.length})
              </p>
              {derived.allTxRows.length > 0 && (
                <button
                  onClick={() => exportCsv(
                    `tx-sales-tax-${result.month}.csv`,
                    derived.allTxRows.map(t => ({
                      name: t.name,
                      email: t.email,
                      date: fmtDate(t.date),
                      amount: (t.amount / 100).toFixed(2),
                      source: SOURCE_LABELS[t.stateSource] || t.stateSource,
                    }))
                  )}
                  className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors"
                >
                  <Download size={12} />
                  Export CSV
                </button>
              )}
            </div>

            {derived.allTxRows.length === 0 ? (
              <p className="text-sm text-muted">No Texas transactions found for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <SortTh label="Name"   colKey="name"   sort={txSort} onSort={toggleTxSort} />
                      <SortTh label="Email"  colKey="email"  sort={txSort} onSort={toggleTxSort} />
                      <SortTh label="Date"   colKey="date"   sort={txSort} onSort={toggleTxSort} />
                      <SortTh label="Amount" colKey="amount" sort={txSort} onSort={toggleTxSort} align="right" className="text-right" />
                      <th className="text-xs text-muted font-medium pb-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {applySort(derived.allTxRows, txSort).map(t => (
                      <tr key={t.id}>
                        <td className="py-2.5 pr-4 text-white">{t.name}</td>
                        <td className="py-2.5 pr-4 text-dim">{t.email}</td>
                        <td className="py-2.5 pr-4 text-muted">{fmtDate(t.date)}</td>
                        <td className="py-2.5 pr-4 font-mono text-right" style={{ color: '#22c55e' }}>
                          {fmt(t.amount / 100)}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={SOURCE_STYLES[t.stateSource] || SOURCE_STYLES.zip}
                            >
                              {SOURCE_LABELS[t.stateSource] || t.stateSource}
                            </span>
                            {t.stateSource === 'manual' && (
                              <button
                                onClick={() => unclassify(t.id)}
                                className="flex items-center gap-0.5 text-xs text-muted hover:text-white transition-colors"
                                title="Undo classification"
                              >
                                <RotateCcw size={10} />
                                Undo
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td colSpan={3} className="pt-3 text-xs text-muted font-medium uppercase tracking-widest">Total</td>
                      <td className="pt-3 font-mono font-semibold text-right" style={{ color: '#22c55e' }}>
                        {fmt(derived.txRevenue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          {/* Classification Panel -- only shown when there are unknowns */}
          {totalUnknown > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {pendingCount > 0 ? (
                    <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                  ) : (
                    <CheckCircle size={14} style={{ color: '#22c55e' }} />
                  )}
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">
                    {pendingCount > 0
                      ? `Location Unknown -- ${pendingCount} remaining`
                      : 'All Unknown Transactions Classified'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Progress pill */}
                  {totalUnknown > 0 && (
                    <span className="text-xs text-muted">
                      {classifiedCount} / {totalUnknown} classified
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <button
                      onClick={() => exportCsv(
                        `tx-unknown-${result.month}.csv`,
                        derived.pending.map(t => ({
                          name: t.name,
                          email: t.email,
                          date: fmtDate(t.date),
                          amount: (t.amount / 100).toFixed(2),
                        }))
                      )}
                      className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors"
                    >
                      <Download size={12} />
                      Export
                    </button>
                  )}
                </div>
              </div>

              {pendingCount > 0 && (
                <p className="text-xs text-muted mb-4">
                  These transactions have no state or ZIP in Stripe. Classify each one below -- Texas adds to your liability total.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="text-xs text-muted font-medium pb-3 pr-4">Name</th>
                      <th className="text-xs text-muted font-medium pb-3 pr-4">Email</th>
                      <th className="text-xs text-muted font-medium pb-3 pr-4">Date</th>
                      <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">Amount</th>
                      <th className="text-xs text-muted font-medium pb-3">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.unknownTransactions.map(t => {
                      const cls = classifications[t.id];
                      return (
                        <tr key={t.id} style={cls ? { opacity: 0.65 } : {}}>
                          <td className="py-2.5 pr-4 text-white">{t.name}</td>
                          <td className="py-2.5 pr-4 text-dim">{t.email}</td>
                          <td className="py-2.5 pr-4 text-muted">{fmtDate(t.date)}</td>
                          <td className="py-2.5 pr-4 font-mono text-right" style={{ color: cls ? '#6b7280' : '#f59e0b' }}>
                            {fmt(t.amount / 100)}
                          </td>
                          <td className="py-2.5">
                            {cls ? (
                              /* Classified -- show result + undo */
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={
                                    cls === 'TX'
                                      ? { backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                                      : { backgroundColor: 'var(--c-subtle-5)', color: 'var(--c-muted)' }
                                  }
                                >
                                  {cls === 'TX' ? 'Texas' : 'Other'}
                                </span>
                                <button
                                  onClick={() => unclassify(t.id)}
                                  className="flex items-center gap-0.5 text-xs text-muted hover:text-white transition-colors"
                                >
                                  <RotateCcw size={10} />
                                  Undo
                                </button>
                              </div>
                            ) : (
                              /* Unclassified -- show action buttons */
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => classify(t.id, 'TX')}
                                  className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                                  style={{ borderColor: '#22c55e', color: '#22c55e' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.12)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Texas
                                </button>
                                <button
                                  onClick={() => classify(t.id, 'OTHER')}
                                  className="px-2 py-1 rounded text-xs font-medium border transition-colors"
                                  style={{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--c-msg-ai-bg)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                >
                                  Other
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Non-Texas Transactions */}
          {derived.allOtherRows.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium uppercase tracking-widest text-muted">
                  Non-Texas Transactions ({derived.allOtherRows.length})
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted font-mono">{fmt(derived.otherRevenue)}</span>
                  <button
                    onClick={() => exportCsv(
                      `non-tx-${result.month}.csv`,
                      derived.allOtherRows.map(t => ({
                        name: t.name,
                        email: t.email,
                        date: fmtDate(t.date),
                        amount: (t.amount / 100).toFixed(2),
                        state: normalizeState(t.resolvedState),
                        source: SOURCE_LABELS[t.stateSource] || t.stateSource,
                      }))
                    )}
                    className="flex items-center gap-1 text-xs text-muted hover:text-white transition-colors"
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border">
                      <SortTh label="Name"   colKey="name"   sort={otherSort} onSort={toggleOtherSort} />
                      <SortTh label="Email"  colKey="email"  sort={otherSort} onSort={toggleOtherSort} />
                      <SortTh label="Date"   colKey="date"   sort={otherSort} onSort={toggleOtherSort} />
                      <SortTh label="State"  colKey="state"  sort={otherSort} onSort={toggleOtherSort} />
                      <SortTh label="Amount" colKey="amount" sort={otherSort} onSort={toggleOtherSort} align="right" className="text-right" />
                      <th className="text-xs text-muted font-medium pb-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {applySort(derived.allOtherRows, otherSort).map(t => (
                      <tr key={t.id}>
                        <td className="py-2.5 pr-4 text-white">{t.name}</td>
                        <td className="py-2.5 pr-4 text-dim">{t.email}</td>
                        <td className="py-2.5 pr-4 text-muted">{fmtDate(t.date)}</td>
                        <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--c-dim)' }}>{normalizeState(t.resolvedState)}</td>
                        <td className="py-2.5 pr-4 font-mono text-right text-dim">
                          {fmt(t.amount / 100)}
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={SOURCE_STYLES[t.stateSource] || SOURCE_STYLES.zip}
                            >
                              {SOURCE_LABELS[t.stateSource] || t.stateSource}
                            </span>
                            {t.stateSource === 'manual' && (
                              <button
                                onClick={() => unclassify(t.id)}
                                className="flex items-center gap-0.5 text-xs text-muted hover:text-white transition-colors"
                                title="Undo classification"
                              >
                                <RotateCcw size={10} />
                                Undo
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td colSpan={4} className="pt-3 text-xs text-muted font-medium uppercase tracking-widest">Total</td>
                      <td className="pt-3 font-mono font-semibold text-right text-dim">
                        {fmt(derived.otherRevenue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* All-clear when no unknowns existed at all */}
          {totalUnknown === 0 && derived.allTxRows.length > 0 && (
            <div className="flex items-center gap-2 text-xs" style={{ color: '#22c55e' }}>
              <CheckCircle size={13} />
              All transactions resolved -- no location unknowns.
            </div>
          )}

          {/* Empty state */}
          {derived.allTxRows.length === 0 && totalUnknown === 0 && derived.allOtherRows.length === 0 && (
            <Card>
              <div className="flex items-center gap-2 text-sm text-muted">
                <FileText size={14} />
                <span>No paid Stripe transactions found for this period.</span>
              </div>
            </Card>
          )}

          {/* Excluded transactions audit log */}
          {result.excludedTransactions?.length > 0 && (
            <Card>
              <button
                onClick={() => setShowExclusions(v => !v)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {showExclusions
                    ? <ChevronDown size={13} style={{ color: 'var(--c-muted)' }} />
                    : <ChevronRight size={13} style={{ color: 'var(--c-muted)' }} />}
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">
                    Excluded Transactions ({result.excludedTransactions.length})
                  </p>
                </div>
                <span className="text-xs text-muted">
                  {result.summary.totalChargesFetched} total charges fetched
                </span>
              </button>

              {showExclusions && (
                <div className="mt-4">
                  <p className="text-xs text-muted mb-3">
                    These charges were fetched from Stripe but excluded from the report. Each exclusion has a documented reason.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="text-xs text-muted font-medium pb-3 pr-4">Name</th>
                          <th className="text-xs text-muted font-medium pb-3 pr-4">Email</th>
                          <th className="text-xs text-muted font-medium pb-3 pr-4">Date</th>
                          <th className="text-xs text-muted font-medium pb-3 pr-4 text-right">Amount</th>
                          <th className="text-xs text-muted font-medium pb-3">Reason Excluded</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.excludedTransactions.map(t => (
                          <tr key={t.id} style={{ opacity: 0.7 }}>
                            <td className="py-2.5 pr-4 text-dim">{t.name}</td>
                            <td className="py-2.5 pr-4 text-muted">{t.email}</td>
                            <td className="py-2.5 pr-4 text-muted">{fmtDate(t.date)}</td>
                            <td className="py-2.5 pr-4 font-mono text-right text-muted">
                              {fmt(t.amount / 100)}
                            </td>
                            <td className="py-2.5">
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: 'var(--c-subtle-5)', color: 'var(--c-muted)' }}
                              >
                                {t.reason}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
