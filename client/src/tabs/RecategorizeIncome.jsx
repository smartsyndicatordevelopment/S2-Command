import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { getDemoResponse } from '../data/demoData';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const PREV_MONTH = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1;
const PREV_YEAR = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// Income categories the analyst can assign (label -> display name).
const CATEGORY_OPTIONS = [
  { label: 'rebilling_income',    name: 'Rebilling Income' },
  { label: 'subscription_income', name: 'Saas Income (Stripe)' },
  { label: 'consulting_income',   name: 'Consulting Income' },
];
const NAME_BY_LABEL = Object.fromEntries(CATEGORY_OPTIONS.map(o => [o.label, o.name]));

const OPTION_STYLE = { backgroundColor: 'var(--c-card)', color: 'var(--c-text-primary)' };
const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

export default function RecategorizeIncome() {
  const { isDemo } = useApp();
  const [year, setYear] = useState(PREV_YEAR);
  const [month, setMonth] = useState(PREV_MONTH);
  const [preview, setPreview] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  const loadPreview = useCallback(async () => {
    setLoading(true); setError(null); setResult(null); setOverrides({});
    if (isDemo) {
      setPreview(getDemoResponse('/api/digits/recat/preview'));
      setLoading(false);
      return;
    }
    try {
      const r = await fetch(`/api/digits/recat/preview?year=${year}&month=${month}`, { credentials: 'include' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to load preview');
      setPreview(d);
    } catch (e) { setError(e.message); setPreview(null); }
    setLoading(false);
  }, [year, month, isDemo]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const labelFor = (it) => overrides[it.transactionId] || it.proposedLabel;

  async function apply() {
    if (!preview?.previewId) return;
    setApplying(true); setError(null);
    if (isDemo) {
      // Demo mode: simulate the write without touching Digits.
      setTimeout(() => {
        setResult({ applied: recognized.length, skipped: preview.unrecognizedCount || 0 });
        setApplying(false);
      }, 600);
      return;
    }
    try {
      const r = await fetch('/api/digits/recat/apply', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previewId: preview.previewId, overrides }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to apply');
      setResult(d);
    } catch (e) { setError(e.message); }
    setApplying(false);
  }

  const items = preview?.items || [];
  const recognized = items.filter(i => i.recognized);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Re-categorize Income</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            Rebuild "Sales Uncategorized" Stripe income into the right categories, then bulk-delete the originals in Digits.
          </p>
        </div>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', outline: 'none' }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1} style={OPTION_STYLE}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', outline: 'none' }}>
            {YEARS.map(y => <option key={y} value={y} style={OPTION_STYLE}>{y}</option>)}
          </select>
          <button onClick={loadPreview} disabled={loading} title="Re-check for income that needs re-categorizing"
            className="text-sm px-3 py-2 rounded-lg font-medium flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={loading ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
            </svg>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm px-4 py-3 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {loading && <p className="text-sm" style={{ color: 'var(--c-muted)' }}>Loading uncategorized income…</p>}

      {!loading && preview && (
        <>
          {preview.rules?.length > 0 && (
            <div className="rounded-lg border p-4" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}>
              <p className="text-xs font-medium uppercase tracking-widest mb-3" style={{ color: 'var(--c-muted)' }}>Re-categorization rules</p>
              <div className="space-y-2">
                {preview.rules.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm flex-wrap">
                    <span style={{ color: 'var(--c-dim)' }}>
                      {r.fallback ? 'Otherwise' : 'If'} <span style={{ color: 'var(--c-text-primary)' }}>{r.when}</span>
                    </span>
                    <span style={{ color: 'var(--c-muted)' }}>→</span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(92,63,244,0.12)', color: '#8b74ff' }}>{r.categoryName}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--c-muted)' }}>
                Rules run top to bottom -- the first match wins. You can still override any single row in the table below before applying.
              </p>
            </div>
          )}

          <div className="flex gap-3 flex-wrap text-xs">
            <span className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-dim)' }}>
              {preview.count} in Sales Uncategorized
            </span>
            <span className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(92,63,244,0.12)', border: '1px solid rgba(92,63,244,0.25)', color: '#8b74ff' }}>
              {preview.subscriptionCount} → Saas Income (Stripe)
            </span>
            <span className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(92,63,244,0.12)', border: '1px solid rgba(92,63,244,0.25)', color: '#8b74ff' }}>
              {preview.rebillingCount} → Rebilling Income
            </span>
            {preview.unrecognizedCount > 0 && (
              <span className="px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', color: '#eab308' }}>
                {preview.unrecognizedCount} skipped (unusual structure)
              </span>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--c-muted)' }}>Nothing in Sales Uncategorized for this month. 🎉</p>
          ) : (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--c-border)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--c-subtle-5)', color: 'var(--c-muted)' }}>
                    <th className="text-left font-medium px-3 py-2">Date</th>
                    <th className="text-left font-medium px-3 py-2">Party</th>
                    <th className="text-right font-medium px-3 py-2">Amount</th>
                    <th className="text-left font-medium px-3 py-2">Re-categorize to</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.transactionId} style={{ borderTop: '1px solid var(--c-border)', opacity: it.recognized ? 1 : 0.5 }}>
                      <td className="px-3 py-2" style={{ color: 'var(--c-dim)' }}>{it.date}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--c-text-primary)' }}>
                        {it.party || <span style={{ color: 'var(--c-muted)' }}>—</span>}
                        <span className="block text-xs truncate" style={{ color: 'var(--c-muted)', maxWidth: '340px' }}>{it.description}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--c-text-primary)' }}>{usd(it.amountDollars)}</td>
                      <td className="px-3 py-2">
                        {it.recognized ? (
                          <select value={labelFor(it)} onChange={e => setOverrides(p => ({ ...p, [it.transactionId]: e.target.value }))}
                            className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', outline: 'none' }}>
                            {CATEGORY_OPTIONS.map(o => <option key={o.label} value={o.label} style={OPTION_STYLE}>{o.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs" style={{ color: '#eab308' }}>skipped</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recognized.length > 0 && !result && (
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}>
              <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>How to run this</p>
              <ol className="text-sm space-y-2" style={{ color: 'var(--c-dim)' }}>
                <li><span style={{ color: '#8b74ff', fontWeight: 600 }}>Step 1.</span> In Digits, open Sales Uncategorized for {MONTHS[month - 1]} {year}, select these {recognized.length} transactions, and <b>delete them</b>.</li>
                <li><span style={{ color: '#8b74ff', fontWeight: 600 }}>Step 2.</span> Come back here and click <b>Create corrected versions</b> below. They'll appear in Digits (correctly categorized) after Digits processes them — usually within a few hours.</li>
              </ol>
              <button onClick={apply} disabled={applying}
                className="text-sm px-4 py-2 rounded-lg font-medium"
                style={{ backgroundColor: applying ? 'rgba(92,63,244,0.4)' : '#5c3ff4', color: '#fff', cursor: applying ? 'not-allowed' : 'pointer' }}>
                {applying ? 'Creating…' : `Create ${recognized.length} corrected versions`}
              </button>
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: 'rgba(92,63,244,0.3)', backgroundColor: 'rgba(92,63,244,0.08)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text-primary)' }}>
                Created {result.applied} corrected transaction{result.applied === 1 ? '' : 's'}.
                {result.skipped ? ` (${result.skipped} skipped.)` : ''}
              </p>
              <p className="text-xs" style={{ color: 'var(--c-dim)' }}>
                They'll show in Digits once its processing pass runs (usually within a few hours). If you haven't already,
                delete the {result.applied} original{result.applied === 1 ? '' : 's'} in Digits so income isn't double-counted.
              </p>
              <button onClick={loadPreview} className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-dim)', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
