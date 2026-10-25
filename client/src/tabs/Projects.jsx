import { useContext, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle, ExternalLink, Clock, Rocket, EyeOff, Eye } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { AppContext } from '../context/AppContext';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';
import AllProjects from './AllProjects';

const STATUS = {
  healthy:  { label: 'Healthy',  Icon: CheckCircle2,  pill: 'bg-green-muted',  icon: 'text-green'  },
  degraded: { label: 'Degraded', Icon: AlertTriangle, pill: 'bg-yellow-muted', icon: 'text-yellow' },
  down:     { label: 'Down',     Icon: XCircle,       pill: 'bg-red-muted',    icon: 'text-red'    },
  inactive: { label: 'Inactive', Icon: MinusCircle,   pill: 'bg-white/5',      icon: 'text-muted'  },
};

const TRIGGER_LABEL = { scheduled: 'Scheduled job', queue: 'Queue', email: 'Email', tail: 'Tail', alarm: 'Alarm' };

function timeAgo(iso) {
  if (!iso) return 'unknown';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 60) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const keyOf = (p) => `${p.kind}:${p.name}`;

// How the cards can be ordered. Ties always fall back to the name so the order never jumps around.
const SEVERITY = { down: 0, degraded: 1, healthy: 2, inactive: 3 };
const byName = (a, b) => a.name.localeCompare(b.name);
const SORTS = {
  attention: { label: 'Needs attention first', cmp: (a, b) => (SEVERITY[a.status] - SEVERITY[b.status]) || byName(a, b) },
  name:      { label: 'Name (A to Z)', cmp: byName },
  requests:  { label: 'Most requests (24h)', cmp: (a, b) => ((b.requests24h || 0) - (a.requests24h || 0)) || byName(a, b) },
  errors:    { label: 'Most errors (24h)', cmp: (a, b) => ((b.errors24h || 0) - (a.errors24h || 0)) || byName(a, b) },
  deployed:  { label: 'Recently deployed', cmp: (a, b) => (new Date(b.lastDeployedAt || 0) - new Date(a.lastDeployedAt || 0)) || byName(a, b) },
  slowest:   { label: 'Slowest to answer', cmp: (a, b) => ((b.latencyMs ?? -1) - (a.latencyMs ?? -1)) || byName(a, b) },
};
const SORT_STORAGE_KEY = 's2:projectsSort';
const readSort = () => {
  try { const v = localStorage.getItem(SORT_STORAGE_KEY); if (v && SORTS[v]) return v; } catch { /* storage unavailable */ }
  return 'attention';
};

// Totals for the projects that are not hidden (the server does the same; this keeps the page right the moment you click).
function summarize(projects) {
  const n = (s) => projects.filter(p => p.status === s).length;
  return {
    active: projects.filter(p => p.status !== 'inactive').length,
    inactive: n('inactive'), healthy: n('healthy'), degraded: n('degraded'), down: n('down'),
    requests24h: projects.reduce((t, p) => t + (p.requests24h || 0), 0),
    errors24h: projects.reduce((t, p) => t + (p.errors24h || 0), 0),
  };
}

const fmtNumber = (n) => new Intl.NumberFormat('en-US').format(n || 0);

function errorRate(requests, errors) {
  if (!requests) return '0%';
  const r = (errors / requests) * 100;
  return `${r < 10 ? r.toFixed(1) : Math.round(r)}%`;
}

function StatusPill({ status }) {
  const s = STATUS[status] || STATUS.inactive;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${s.pill}`}>
      <s.Icon size={13} className={s.icon} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-sm text-white mt-0.5">{value}</dd>
    </div>
  );
}

function VisibilityButton({ p, hidden, onToggle }) {
  const Icon = hidden ? Eye : EyeOff;
  const verb = hidden ? 'Show' : 'Hide';
  return (
    <button
      type="button"
      onClick={() => onToggle(p, !hidden)}
      aria-label={`${verb} ${p.name} on this page`}
      title={`${verb} this project`}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-white border border-border rounded px-2 py-1 transition-colors"
    >
      <Icon size={12} aria-hidden="true" />
      {verb}
    </button>
  );
}

function ProjectCard({ p, onToggle }) {
  const answer = p.httpStatus == null ? 'No address' : p.httpStatus === 0 ? 'No answer' : `HTTP ${p.httpStatus}`;
  const speed = p.latencyMs == null ? (p.url ? 'This app' : 'n/a') : `${p.latencyMs} ms`;
  return (
    <li>
      <Card className="h-full flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate" title={p.name}>{p.name}</h3>
            {p.url ? (
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${p.url.replace('https://', '')} (opens in a new tab)`}
                className="inline-flex items-center gap-1 text-xs text-muted hover:text-white underline-offset-2 hover:underline break-all"
              >
                {p.url.replace('https://', '')}
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            ) : (
              <p className="text-xs text-muted">No public address</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <StatusPill status={p.status} />
            <VisibilityButton p={p} hidden={false} onToggle={onToggle} />
          </div>
        </div>

        {p.status !== 'healthy' && <p className="text-xs text-white" role="note">{p.reason}</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-auto">
          <Metric label="Last check" value={`${answer}, ${speed}`} />
          <Metric label="Requests (24h)" value={fmtNumber(p.requests24h)} />
          <Metric label="Errors (24h)" value={`${fmtNumber(p.errors24h)} (${errorRate(p.requests24h, p.errors24h)})`} />
          <Metric label="Last deployed" value={timeAgo(p.lastDeployedAt)} />
        </dl>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border text-[11px] text-muted">
          <span className="inline-flex items-center gap-1"><Rocket size={11} aria-hidden="true" />{p.kind === 'pages' ? 'Pages' : 'Worker'}{p.deployedVia ? `, deployed via ${p.deployedVia}` : ''}</span>
          {p.triggers.map(t => (
            <span key={t} className="rounded border border-border px-1.5 py-0.5 text-muted">{TRIGGER_LABEL[t] || t}</span>
          ))}
        </div>
      </Card>
    </li>
  );
}

export function CloudflareHealth() {
  // The first refresh switches to the "refresh" URL (which also fetches); later ones refetch it.
  const [forced, setForced] = useState(false);
  const { data, loading, error, refetch } = useApi(forced ? '/api/projects?refresh=1' : '/api/projects');
  const onRefresh = () => (forced ? refetch() : setForced(true));

  // Your hide/show choices are saved on the server; `changes` holds the ones made since the page loaded so they show at once.
  const { isDemo } = useContext(AppContext);
  const [changes, setChanges] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [sort, setSort] = useState(readSort);
  function changeSort(value) {
    setSort(value);
    try { localStorage.setItem(SORT_STORAGE_KEY, value); } catch { /* storage unavailable */ }
  }
  async function toggle(p, hidden) {
    const k = keyOf(p);
    setSaveError(null);
    setChanges(c => ({ ...c, [k]: hidden }));
    if (isDemo) return;
    try {
      const res = await fetch('/api/projects/visibility', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: p.kind, name: p.name, hidden }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setChanges(c => ({ ...c, [k]: !hidden }));
      setSaveError(`Could not ${hidden ? 'hide' : 'show'} ${p.name}. Try again.`);
    }
  }

  if (loading && !data) return <Spinner label="Checking your Cloudflare projects..." />;
  if (error && !data) return <ErrorState message="Could not load your Cloudflare projects." onRetry={refetch} />;
  if (!data) return <Spinner label="Checking your Cloudflare projects..." />;

  if (data.configured === false) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-white mb-2">Cloudflare projects</h2>
        <p className="text-sm text-muted">
          This page needs a read-only Cloudflare token. Set the <code>CF_API_TOKEN</code> secret and the <code>CF_ACCOUNT_ID</code> variable on the
          Worker, then reload.
        </p>
      </Card>
    );
  }

  const isHidden = (p) => changes[keyOf(p)] ?? p.hidden ?? false;
  const hiddenList = data.projects.filter(isHidden).sort(byName);
  const visible = data.projects.filter(p => !isHidden(p));
  const summary = summarize(visible);
  const active = visible.filter(p => p.status !== 'inactive').sort((SORTS[sort] || SORTS.attention).cmp);
  const inactive = visible.filter(p => p.status === 'inactive').sort(byName);
  const attention = summary.degraded + summary.down;
  const attentionAccent = summary.down > 0 ? 'red' : summary.degraded > 0 ? 'yellow' : 'green';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Cloudflare projects</h2>
          <p className="text-xs text-muted mt-1">Health and latest status of every project in your Cloudflare account.</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted flex items-center gap-1" role="status" aria-live="polite">
            <Clock size={12} aria-hidden="true" />
            {loading ? 'Checking...' : `Checked ${timeAgo(data.generatedAt)}`}
          </p>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => changeSort(e.target.value)}
              className="bg-card text-white border border-border rounded px-2 py-1.5 text-xs"
            >
              {Object.entries(SORTS).map(([id, o]) => <option key={id} value={id}>{o.label}</option>)}
            </select>
          </label>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-border rounded px-3 py-1.5 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh now
          </button>
        </div>
      </div>

      {saveError && <p className="text-xs text-red" role="alert">{saveError}</p>}

      {error && <p className="text-xs text-red" role="alert">The last refresh failed; showing the previous check.</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active projects" value={summary.active} sub={`${summary.inactive} inactive`} accent="purple" />
        <StatCard label="Healthy" value={summary.healthy} sub={`of ${summary.active} active`} accent="green" />
        <StatCard
          label="Needs attention"
          value={attention}
          sub={attention === 0 ? 'Everything is answering' : `${summary.down} down, ${summary.degraded} degraded`}
          accent={attentionAccent}
        />
        <StatCard
          label="Requests (24h)"
          value={fmtNumber(summary.requests24h)}
          sub={`${fmtNumber(summary.errors24h)} errors (${errorRate(summary.requests24h, summary.errors24h)})`}
          accent="white"
        />
      </div>

      {data.warnings?.length > 0 && (
        <p className="text-xs text-yellow" role="note">Some details could not be read: {data.warnings.join('; ')}</p>
      )}

      <section aria-label="Active projects">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map(p => <ProjectCard key={keyOf(p)} p={p} onToggle={toggle} />)}
        </ul>
      </section>

      {inactive.length > 0 && (
        <details className="bg-card border border-border rounded-lg">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-white">
            Inactive projects ({inactive.length})
            <span className="ml-2 text-xs font-normal text-muted">no public address and no traffic in the last 24 hours</span>
          </summary>
          <ul className="px-5 pb-4 divide-y divide-border">
            {inactive.map(p => (
              <li key={keyOf(p)} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-white">{p.name}</span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-muted">last deployed {timeAgo(p.lastDeployedAt)}</span>
                  <VisibilityButton p={p} hidden={false} onToggle={toggle} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {hiddenList.length > 0 && (
        <details className="bg-card border border-border rounded-lg">
          <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-white">
            Hidden projects ({hiddenList.length})
            <span className="ml-2 text-xs font-normal text-muted">not counted in the totals above</span>
          </summary>
          <ul className="px-5 pb-4 divide-y divide-border">
            {hiddenList.map(p => (
              <li key={keyOf(p)} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <StatusPill status={p.status} />
                  <span className="text-white truncate">{p.name}</span>
                </span>
                <VisibilityButton p={p} hidden onToggle={toggle} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const VIEWS = [
  { id: 'all', label: 'All projects' },
  { id: 'health', label: 'Cloudflare health' },
];
const VIEW_STORAGE_KEY = 's2:projectsView';
const readView = () => {
  try { const v = localStorage.getItem(VIEW_STORAGE_KEY); if (VIEWS.some(x => x.id === v)) return v; } catch { /* storage unavailable */ }
  return 'all';
};

export default function Projects() {
  const [view, setView] = useState(readView);
  function show(id) {
    setView(id);
    try { localStorage.setItem(VIEW_STORAGE_KEY, id); } catch { /* storage unavailable */ }
  }
  function onKeyDown(e, i) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = VIEWS[(i + step + VIEWS.length) % VIEWS.length].id;
    show(next);
    document.getElementById(`projects-view-${next}`)?.focus();
  }
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Projects views" className="flex gap-2 border-b border-border">
        {VIEWS.map((v, i) => (
          <button
            key={v.id}
            id={`projects-view-${v.id}`}
            role="tab"
            type="button"
            aria-selected={view === v.id}
            aria-controls={`projects-panel-${v.id}`}
            tabIndex={view === v.id ? 0 : -1}
            onClick={() => show(v.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${view === v.id ? 'text-white border-purple' : 'text-muted border-transparent hover:text-white'}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`projects-panel-${view}`} aria-labelledby={`projects-view-${view}`}>
        {view === 'all' ? <AllProjects /> : <CloudflareHealth />}
      </div>
    </div>
  );
}
