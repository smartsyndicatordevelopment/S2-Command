import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Star, BarChart3, RefreshCw } from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import { demoUsage } from '../../data/demoData';

// Pieces shared by the two project tabs (Cloudflare Health and Brandon's Projects): the logo, the favorite star, grouping by
// type, and the traffic-and-usage box that opens when the mouse rests on a card.

export const fmtNumber = (n) => new Intl.NumberFormat('en-US').format(Math.round(n || 0));
export const fmtCompact = (n) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
export function fmtBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
export function errorRate(requests, errors) {
  if (!requests) return '0%';
  const r = (errors / requests) * 100;
  return `${r < 10 ? r.toFixed(1) : Math.round(r)}%`;
}

export function readStored(key, allowed, fallback) {
  try { const v = localStorage.getItem(key); if (allowed.includes(v)) return v; } catch { /* storage unavailable */ }
  return fallback;
}
export function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** The project's logo, or its initials on a neutral tile when it has none. Decorative: the name is always beside it. */
export function ProjectLogo({ logo, name }) {
  const initials = String(name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  return (
    <span className="flex-shrink-0 w-11 h-11 p-1 bg-white border border-border rounded-md overflow-hidden flex items-center justify-center" aria-hidden="true">
      {logo
        ? <img src={`/project-logos/${encodeURIComponent(logo)}`} alt="" loading="lazy" width="36" height="36" className="w-full h-full object-contain" />
        : <span className="text-sm font-semibold text-black/70">{initials}</span>}
    </span>
  );
}

const iconBtn = 'w-7 h-7 inline-flex items-center justify-center rounded border transition-colors';

export function FavoriteButton({ name, on, onToggle, className = '' }) {
  const label = on ? `Remove ${name} from favorites` : `Add ${name} to favorites`;
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(!on); }}
      aria-pressed={on}
      aria-label={label}
      title={on ? 'Remove from favorites' : 'Add to favorites (favorites are listed first)'}
      className={`${iconBtn} ${on ? 'text-yellow border-border bg-bg' : 'text-muted border-transparent hover:text-white hover:bg-bg hover:border-border'} ${className}`}
    >
      <Star size={15} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

export function TrafficButton({ name, open, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      aria-expanded={open}
      aria-label={`${open ? 'Hide' : 'Show'} traffic and usage for ${name}`}
      title="Traffic and usage (also opens when the mouse rests on the card)"
      className={`${iconBtn} ${open ? 'text-white border-border bg-bg' : 'text-muted border-transparent hover:text-white hover:bg-bg hover:border-border'} ${className}`}
    >
      <BarChart3 size={15} aria-hidden="true" />
    </button>
  );
}

/**
 * Stars, saved on the server. `kindOf(p)` and `nameOf(p)` say how a project is stored ('worker', 'pages' or 'folder').
 * A click shows at once and is rolled back with a message if the save fails.
 */
export function useFavorites() {
  const { isDemo } = useContext(AppContext);
  const [changes, setChanges] = useState({});
  const [error, setError] = useState(null);
  const isFavorite = useCallback((kind, name, saved) => changes[`${kind}:${name}`] ?? !!saved, [changes]);
  const toggle = useCallback(async (kind, name, favorite) => {
    const k = `${kind}:${name}`;
    setError(null);
    setChanges((c) => ({ ...c, [k]: favorite }));
    if (isDemo) return;
    let attempts = 3;
    while (attempts > 0) {
      try {
        const res = await fetch('/api/projects/favorite', {
          method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, name, favorite }),
        });
        if (res.ok) return;
        if (res.status < 500) break; // a refused request will not work on a second try
      } catch { /* network problem: try again */ }
      attempts--;
      if (attempts > 0) await new Promise((r) => setTimeout(r, 600));
    }
    setChanges((c) => ({ ...c, [k]: !favorite }));
    setError(`Could not ${favorite ? 'add' : 'remove'} ${name} ${favorite ? 'to' : 'from'} your favorites. Try again.`);
  }, [isDemo]);
  return { isFavorite, toggle, error };
}

export const GROUPS = [['type', 'Type'], ['none', 'No Grouping']];

/**
 * Splits already-sorted projects into sections: Favorites first, then one section per type in the server's order (apps first),
 * or one "All Projects" section when grouping is off. A favorite is listed once, under Favorites.
 */
export function groupProjects(items, { types = [], group = 'type', isFav }) {
  const favorites = items.filter(isFav);
  const rest = items.filter((p) => !isFav(p));
  const sections = [];
  if (favorites.length) sections.push({ id: 'favorites', label: 'Favorites', items: favorites });
  if (group !== 'type') {
    if (rest.length) sections.push({ id: 'all', label: favorites.length ? 'Everything Else' : 'All Projects', items: rest });
    return sections;
  }
  const known = new Set(types.map((t) => t.id));
  for (const t of types) {
    const list = rest.filter((p) => p.type === t.id);
    if (list.length) sections.push({ id: t.id, label: t.label, items: list });
  }
  const stray = rest.filter((p) => !known.has(p.type));
  if (stray.length) sections.push({ id: 'untyped', label: 'Other', items: stray });
  return sections;
}

export function GroupSelect({ value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      Group By
      <select value={value} onChange={(e) => onChange(e.target.value)} title="Put the cards into groups, apps first" className="bg-card text-white border border-border rounded px-2 py-1.5 text-xs">
        {GROUPS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
  );
}

export function SectionHeading({ id, label, count }) {
  return (
    <h3 id={id} className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-widest text-muted mb-3">
      <span className="text-white">{label}</span>
      <span aria-label={`${count} projects`}>{count}</span>
    </h3>
  );
}

// ---------- Traffic and usage box ----------

const usageCache = new Map(); // "kind:name" -> { at, data }
const USAGE_TTL = 5 * 60 * 1000;

async function fetchUsage(kind, name, signal) {
  let attempts = 3;
  let lastError;
  while (attempts > 0) {
    try {
      const res = await fetch(`/api/projects/usage?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`, { credentials: 'include', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      lastError = err;
      attempts--;
      if (attempts > 0) await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw lastError;
}

function useUsage(kind, name, open) {
  const { isDemo } = useContext(AppContext);
  const key = `${kind}:${name}`;
  const [state, setState] = useState({ data: null, loading: false, error: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return undefined;
    if (isDemo) { setState({ data: demoUsage(name), loading: false, error: false }); return undefined; }
    const hit = usageCache.get(key);
    if (hit && Date.now() - hit.at < USAGE_TTL) { setState({ data: hit.data, loading: false, error: false }); return undefined; }
    const ctl = new AbortController();
    setState((s) => ({ data: s.data, loading: true, error: false }));
    fetchUsage(kind, name, ctl.signal).then(
      (data) => { usageCache.set(key, { at: Date.now(), data }); setState({ data, loading: false, error: false }); },
      (err) => { if (err.name !== 'AbortError') setState({ data: null, loading: false, error: true }); },
    );
    return () => ctl.abort();
  }, [open, key, kind, name, isDemo, tick]);
  return { ...state, retry: () => { usageCache.delete(key); setTick((t) => t + 1); } };
}

function Bars({ points, label, labelOf }) {
  const max = Math.max(1, ...points.map((p) => p.requests));
  const total = points.reduce((n, p) => n + p.requests, 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</span>
        <span className="text-[11px] text-muted">{fmtNumber(total)} requests</span>
      </div>
      <div role="img" aria-label={`${label}: ${fmtNumber(total)} requests, busiest point ${fmtNumber(max === 1 && total === 0 ? 0 : max)}`} className="flex items-end gap-px h-12 border-b border-border">
        {points.map((p) => {
          const h = p.requests ? Math.max(4, Math.round((p.requests / max) * 100)) : 0;
          const errorShare = p.requests ? Math.min(1, p.errors / p.requests) : 0;
          return (
            <span key={p.t} title={`${labelOf(p.t)}: ${fmtNumber(p.requests)} requests, ${fmtNumber(p.errors)} errors`} className="flex-1 h-full flex flex-col justify-end">
              <span className="block w-full rounded-t-sm bg-purple relative overflow-hidden" style={{ height: `${h}%` }}>
                {errorShare > 0 && <span className="absolute bottom-0 left-0 right-0 bg-red" style={{ height: `${Math.max(12, errorShare * 100)}%` }} />}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const hourLabel = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric' });
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function Stat({ label, value, hint }) {
  return (
    <div title={hint}>
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-sm text-white mt-0.5">{value}</dd>
    </div>
  );
}

// The box has one fixed height in every state, so nothing jumps when the numbers arrive.
function UsageBody({ usage, name }) {
  const { data, loading, error, retry } = usage;
  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
        <p className="text-xs text-white">Could not load the traffic numbers for {name}.</p>
        <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-border rounded px-3 py-1.5">
          <RefreshCw size={12} aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }
  if (!data || (loading && !data)) {
    return (
      <div className="space-y-3 animate-pulse" aria-busy="true" aria-label="Loading traffic and usage">
        <div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-white/5" />)}</div>
        <div className="h-16 rounded bg-white/5" />
        <div className="h-16 rounded bg-white/5" />
      </div>
    );
  }
  if (data.available === false) {
    return <p className="h-full flex items-center justify-center text-xs text-muted text-center px-4">{data.reason || 'No traffic numbers are available for this project.'}</p>;
  }
  const t = data.totals;
  const cpu = t.cpuP50Ms == null ? 'n/a' : `${t.cpuP50Ms} ms`;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-4 gap-3">
        <Stat label="Requests" value={fmtCompact(t.requests)} hint={`${fmtNumber(t.requests)} requests in the last 24 hours`} />
        <Stat label="Errors" value={`${fmtCompact(t.errors)} (${errorRate(t.requests, t.errors)})`} hint="Requests that ended in an error, and their share of all requests" />
        <Stat label="CPU Time" value={cpu} hint={`Processor time one request uses. Typical request: ${cpu}. Slowest 1 in 100: ${t.cpuP99Ms == null ? 'n/a' : `${t.cpuP99Ms} ms`}`} />
        <Stat label="Outside Calls" value={fmtCompact(t.subrequests)} hint="Calls this project made to other services (databases, other sites) in the last 24 hours" />
      </dl>
      {t.requests === 0 && data.days.every((d) => d.requests === 0)
        ? <p className="text-xs text-muted py-8 text-center">No requests in the last 14 days.</p>
        : (
          <>
            <Bars points={data.hours} label="Last 24 Hours, By Hour" labelOf={hourLabel} />
            <Bars points={data.days} label="Last 14 Days, By Day" labelOf={dayLabel} />
          </>
        )}
    </div>
  );
}

/**
 * Open/close logic for one card's traffic box: opens after the mouse rests on the card for a moment, closes shortly after it
 * leaves, and can be toggled with the card's chart button (for touch and keyboard). Escape closes it.
 */
export function useUsageHover(enabled) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const timer = useRef(null);
  const ref = useRef(null);
  const place = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAbove(window.innerHeight - rect.bottom < 290 && rect.top > 290);
  };
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  if (!enabled) return { open: false, above: false, ref, handlers: {}, toggle() {} };
  return {
    open, above, ref,
    handlers: {
      onMouseEnter: (e) => { if (e.nativeEvent?.pointerType === 'touch') return; clear(); timer.current = setTimeout(() => { place(); setOpen(true); }, 450); },
      onMouseLeave: () => { clear(); timer.current = setTimeout(() => setOpen(false), 180); },
    },
    toggle: () => { clear(); place(); setOpen((o) => !o); },
  };
}

/** The floating traffic box. Sits over the page below (or above) its card, so it never pushes anything. */
export function UsagePopover({ kind, name, title, open, above }) {
  const usage = useUsage(kind, name, open);
  if (!open) return null;
  return (
    <div
      role="group"
      aria-label={`Traffic and usage for ${title || name}`}
      onClick={(e) => e.stopPropagation()}
      className={`absolute left-0 right-0 z-30 ${above ? 'bottom-full mb-2' : 'top-full mt-2'} bg-bg border border-border rounded-lg shadow-lg p-4 usage-pop`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <p className="text-xs font-semibold text-white truncate">Traffic And Usage: {title || name}</p>
        <p className="text-[10px] text-muted flex-shrink-0">Cloudflare, last 24 hours</p>
      </div>
      <div className="h-[212px]"><UsageBody usage={usage} name={title || name} /></div>
    </div>
  );
}
