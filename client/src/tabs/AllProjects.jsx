import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, MoreHorizontal } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import ErrorState from '../components/ui/ErrorState';

// The folder-by-folder project list (the same tiles as Brandon's Project Dashboard page): filter box, Recent / A to Z, a tile for
// every project with its description and last-modified time, a "..." menu with the links, and the skills-and-projects plan tab.
// The data comes from GET /api/projects/catalog (built by scripts/build-project-catalog.mjs).

const SORT_KEY = 's2:allProjectsSort';
const SECTION_KEY = 's2:allProjectsSection';

function readStored(key, allowed, fallback) {
  try { const v = localStorage.getItem(key); if (allowed.includes(v)) return v; } catch { /* storage unavailable */ }
  return fallback;
}

function relative(iso) {
  const span = (Date.now() - new Date(iso).getTime()) / 1000;
  const minutes = span / 60;
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) { const h = Math.floor(hours); return h === 1 ? '1 hour ago' : `${h} hours ago`; }
  const days = hours / 24;
  if (days < 30) { const d = Math.floor(days); return d === 1 ? 'yesterday' : `${d} days ago`; }
  if (days < 365) { const m = Math.floor(days / 30); return m === 1 ? '1 month ago' : `${m} months ago`; }
  const y = Math.floor(days / 365);
  return y === 1 ? '1 year ago' : `${y} years ago`;
}

const exact = (iso) => new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function MenuItem({ href, external, disabledReason, onPick, children }) {
  const base = 'block px-3 py-2 text-sm rounded';
  if (!href) {
    return <span role="menuitem" aria-disabled="true" title={disabledReason} className={`${base} text-muted/60 cursor-default`}>{children}</span>;
  }
  return (
    <a
      role="menuitem"
      href={href}
      onClick={onPick}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`${base} text-white hover:bg-purple-muted`}
    >
      {children}
    </a>
  );
}

function ProjectTile({ p, open, onToggle, onClose }) {
  const mainHref = p.dashCommLink || p.folderLink;
  const mainTitle = p.dashCommLink ? `Open ${p.name} in DashComm Pro` : `Open the ${p.name} folder`;
  return (
    <li className={`relative ${open ? 'z-10' : ''}`} data-project={p.name}>
      <div className="h-full bg-card border border-border rounded-lg hover:border-purple transition-colors">
        <a
          href={mainHref}
          title={mainTitle}
          className="flex flex-col gap-2 p-4 pr-10 h-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple"
        >
          <span className="flex items-center gap-3">
            <span className="flex-shrink-0 w-11 h-11 p-1 bg-white border border-border rounded-md overflow-hidden flex items-center justify-center">
              {p.logo && <img src={`/project-logos/${encodeURIComponent(p.logo)}`} alt="" loading="lazy" className="w-full h-full object-contain" />}
            </span>
            <span className="text-sm font-semibold text-white leading-snug">{p.name}</span>
          </span>
          {p.description && <span className="text-xs text-white/80 leading-relaxed">{p.description}</span>}
          <span className="text-xs text-muted font-mono break-all">.\{p.name}</span>
          <span className="flex items-baseline gap-2 mt-auto pt-3 border-t border-border">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Modified</span>
            <span className="text-xs text-purple font-mono" title={exact(p.touched)}>{relative(p.touched)}</span>
          </span>
        </a>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(p.name); }}
          aria-label={`More options for ${p.name}`}
          aria-haspopup="true"
          aria-expanded={open}
          className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded border transition-colors ${open ? 'text-white bg-bg border-border' : 'text-muted border-transparent hover:text-white hover:bg-bg hover:border-border'}`}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
        {open && (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-10 right-2 min-w-[190px] p-1 bg-bg border border-border rounded-lg shadow-lg"
          >
            <MenuItem href={p.production} external onPick={onClose} disabledReason="No production URL set in production.txt">Visit production</MenuItem>
            <MenuItem href={p.dev?.url} external onPick={onClose} disabledReason="No dev URL set in dev.txt">Visit dev</MenuItem>
            {p.dev?.login && <span role="menuitem" aria-label="Dev login" className="block px-3 pb-2 text-xs text-white/80 select-all break-all">Dev login: {p.dev.login}</span>}
            <MenuItem href={p.launchable ? `${p.folderLink}?action=run` : null} onPick={onClose} disabledReason="No launch target set in launch.txt">Launch tool</MenuItem>
            <MenuItem href={p.dashCommLink} onPick={onClose} disabledReason="Needs DashComm Pro folder links registered on the PC that built the catalog">Open in DashComm Pro</MenuItem>
            <MenuItem href={p.scopetaskId ? `https://app.scopetask.com/app/projects/${p.scopetaskId}` : null} external onPick={onClose} disabledReason="No ScopeTask project set in scopetask.txt">Open in ScopeTask</MenuItem>
            <MenuItem href={p.folderLink} onPick={onClose}>Open folder</MenuItem>
          </div>
        )}
      </div>
    </li>
  );
}

function PlanFrame({ html }) {
  if (!html) return <Card><p className="text-sm text-muted">The consolidation plan page was not found when the catalog was built.</p></Card>;
  return (
    <iframe
      title="Skills and projects consolidation plan"
      srcDoc={html}
      sandbox=""
      className="w-full rounded-lg border border-border bg-bg"
      style={{ height: '75vh' }}
    />
  );
}

export default function AllProjects() {
  const { data, loading, error, refetch } = useApi('/api/projects/catalog');
  const [section, setSection] = useState(() => readStored(SECTION_KEY, ['projects', 'plan'], 'projects'));
  const [sort, setSort] = useState(() => readStored(SORT_KEY, ['recent', 'name'], 'recent'));
  const [term, setTerm] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const search = useRef(null);

  function pickSection(id) {
    setSection(id);
    try { localStorage.setItem(SECTION_KEY, id); } catch { /* storage unavailable */ }
  }
  function pickSort(id) {
    setSort(id);
    try { localStorage.setItem(SORT_KEY, id); } catch { /* storage unavailable */ }
  }

  // Slash focuses the filter from anywhere on this view; Escape closes an open menu; a click elsewhere closes it too.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setOpenMenu(null);
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if (e.key === '/' && !typing && section === 'projects' && search.current) {
        e.preventDefault();
        search.current.focus();
      }
    }
    const close = () => setOpenMenu(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', close);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', close); };
  }, [section]);

  const shown = useMemo(() => {
    const projects = data?.projects || [];
    const t = term.trim().toLowerCase();
    const hit = projects.filter(p => !t || `${p.name} ${p.description || ''}`.toLowerCase().includes(t));
    return hit.sort(sort === 'name'
      ? (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      : (a, b) => b.touched.localeCompare(a.touched));
  }, [data, term, sort]);

  if (loading && !data) return <Spinner label="Loading your projects..." />;
  if (error && !data) return <ErrorState message="Could not load the project list." onRetry={refetch} />;
  if (!data) return <Spinner label="Loading your projects..." />;

  const total = data.projects.length;
  const sectionBtn = (id, label) => (
    <button
      type="button"
      aria-pressed={section === id}
      onClick={() => pickSection(id)}
      className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider rounded border transition-colors ${section === id ? 'bg-white text-black border-white' : 'text-muted border-border hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Brandon&apos;s projects</h2>
          <p className="text-xs text-muted mt-1">
            {total} projects. Click a tile to open it in DashComm Pro (or its folder if that link is not set up). Last-modified times are from
            {' '}{exact(data.generatedAt)}, when the list was last rebuilt.
          </p>
        </div>
        <div className="flex gap-2">
          {sectionBtn('projects', 'Projects')}
          {sectionBtn('plan', 'Skills and projects consolidation')}
        </div>
      </div>

      {section === 'plan' ? <PlanFrame html={data.planHtml} /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="relative w-full max-w-sm">
              <span className="sr-only">Filter projects</span>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                ref={search}
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setTerm(''); return; }
                  if (e.key === 'Enter' && shown[0]) window.location.href = shown[0].dashCommLink || shown[0].folderLink;
                }}
                placeholder="Filter projects... (press / to focus)"
                autoComplete="off"
                className="w-full bg-card text-white border border-border rounded-lg pl-9 pr-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-purple"
              />
            </label>
            <div className="flex gap-2" role="group" aria-label="Sort projects">
              {[['recent', 'Recent'], ['name', 'A to Z']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={sort === id}
                  onClick={() => pickSort(id)}
                  className={`px-3 py-1.5 text-xs font-medium uppercase tracking-wider rounded border transition-colors ${sort === id ? 'bg-white text-black border-white' : 'text-muted border-border hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <Card><p className="text-sm text-muted text-center">No project matches that filter.</p></Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map(p => (
                <ProjectTile
                  key={p.name}
                  p={p}
                  open={openMenu === p.name}
                  onToggle={(name) => setOpenMenu(cur => (cur === name ? null : name))}
                  onClose={() => setOpenMenu(null)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
