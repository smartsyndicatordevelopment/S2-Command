import { useState } from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import StatCard from '../components/ui/StatCard';
import Card from '../components/ui/Card';
import ErrorState from '../components/ui/ErrorState';
import { fmtNumber, fmtCompact, fmtBytes } from '../components/projects/shared';

// The Utilization tab: how much of each plan is in use across the hosting stack. Cloudflare numbers come from its analytics
// (read-only token), PlanetScale sizes from the database itself, and the other services from the app's own connection checks.

const pctOf = (used, limit) => (limit > 0 ? (used / limit) * 100 : null);
const plural = (n, word) => `${fmtNumber(n)} ${word}${n === 1 ? '' : 's'}`;
const pctText = (p) => (p == null ? '' : p < 0.1 && p > 0 ? 'under 0.1%' : `${p < 10 ? p.toFixed(1) : Math.round(p)}%`);

const fmtUsd = (n) => (n > 0 && n < 0.01 ? 'under $0.01' : `$${n.toFixed(2)}`);

// A labelled bar: used of what the plan includes. Under the included amount the bar is purple (amber from 75% as a heads-up).
// Past it the bar shows the included part in purple and the extra in amber: the extra is pay-as-you-go, billed by use, not
// blocked, so it is never red. `overUsd` is the rough cost of the extra, when it can be worked out.
function Meter({ label, used, limit, format, note, overUsd }) {
  const p = pctOf(used, limit);
  const over = p != null && p > 100;
  const tone = p != null && p >= 75 ? 'bg-yellow' : 'bg-purple';
  const level = p == null || over ? '' : p >= 75 ? ' (getting close to what the plan includes)' : '';
  const includedShare = over ? (limit / used) * 100 : 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-white">{label}</span>
        <span className="text-xs text-muted">
          <span className="text-white">{format(used)}</span>
          {limit ? ` of ${format(limit)} included` : ''}
          {p != null && !over && <span className="text-white">{` · ${pctText(p)} used${level}`}</span>}
          {over && (
            <span className="text-yellow">
              {overUsd != null ? ` · ${format(used - limit)} over, billed by use: about ${fmtUsd(overUsd)} extra` : ` · ${format(used - limit)} over what the plan includes`}
            </span>
          )}
        </span>
      </div>
      {limit ? (
        <div className="mt-1.5 h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--c-bar-track)' }} role="progressbar" aria-label={label}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(p))}
          aria-valuetext={over ? `${format(limit)} included used, plus ${format(used - limit)} over` : `${pctText(p)} of what the plan includes`}>
          {over ? (
            <>
              <div className="h-full bg-purple" style={{ width: `${includedShare}%` }} />
              <div className="h-full bg-yellow" style={{ width: `${100 - includedShare}%` }} />
            </>
          ) : (
            <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(p > 0 ? 1 : 0, p))}%` }} />
          )}
        </div>
      ) : null}
      {note && <p className="text-[11px] text-muted mt-1">{note}</p>}
    </div>
  );
}

function MiniTable({ caption, columns, rows, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="text-left text-[10px] font-medium uppercase tracking-widest text-muted pb-2">{caption}</caption>
        <thead>
          <tr className="text-left text-[11px] text-muted border-b border-border">
            {columns.map((c, i) => <th key={c} scope="col" className={`py-1.5 font-medium ${i ? 'text-right pl-4' : ''}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="py-3 text-xs text-muted">{empty}</td></tr>}
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-border last:border-0">
              {r.map((cell, i) => <td key={i} className={`py-1.5 ${i ? 'text-right pl-4 text-muted whitespace-nowrap' : 'text-white break-all'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Count({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">{label}</dt>
      <dd className="text-lg font-semibold text-white mt-0.5">{value == null ? 'n/a' : fmtNumber(value)}</dd>
    </div>
  );
}

function Warnings({ list }) {
  if (!list?.length) return null;
  return <p className="text-xs text-yellow" role="note">Some numbers could not be read: {list.join('; ')}</p>;
}

function SectionTitle({ title, sub }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function CloudflareSection({ cf }) {
  if (!cf?.configured) {
    return <Card><SectionTitle title="Cloudflare" /><p className="text-sm text-muted">No read-only Cloudflare token is set on this copy of the app (the CF_API_TOKEN secret and the CF_ACCOUNT_ID variable), so there is nothing to show here.</p></Card>;
  }
  if (cf.error) {
    return <Card><SectionTitle title="Cloudflare" /><p className="text-sm text-muted">Cloudflare did not answer just now. Press Refresh Now to try again.</p></Card>;
  }
  const a = cf.plan.allowance;
  const ov = cf.overage || null;
  const now = new Date();
  const dayOfMonth = now.getUTCDate() + now.getUTCHours() / 24;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const pace = (n) => (dayOfMonth > 0.5 ? (n / dayOfMonth) * daysInMonth : n);
  const monthName = new Date(cf.monthStart).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  const planLine = cf.plan.name
    ? `Plan: ${cf.plan.name}.`
    : `Plan: assumed to be ${cf.plan.assumed}. The read-only token cannot see billing, so the plan name is not shown; set the CF_PLAN_NAME variable to show yours.`;
  return (
    <Card className="space-y-6">
      <SectionTitle title="Cloudflare" sub={`${planLine} Monthly numbers count from ${monthName} 1 (UTC). "Included" is what the plan covers before extra charges.`} />
      {ov && (
        <p className="text-sm text-white" role="status">
          {ov.totalUsd > 0
            ? <>Estimated extra this month: <span className="text-yellow font-semibold">about {fmtUsd(ov.totalUsd)}</span> on top of the plan price. <span className="text-muted">Amber bars are over what the plan includes. That part is billed by use, not blocked.</span></>
            : <>Everything is within what the plan includes, so no extra charges are expected this month.</>}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Meter label="Requests This Month" used={cf.month.total.requests} limit={a.requestsPerMonth} format={fmtCompact} overUsd={ov?.items.requests.usd}
          note={`At this pace: about ${fmtCompact(pace(cf.month.total.requests))} by the end of the month. ${fmtNumber(cf.month.total.errors)} ended in an error.`} />
        <Meter label="Processor Time This Month" used={cf.month.total.cpuMs} limit={a.cpuMsPerMonth} format={(v) => `${fmtCompact(v)} ms`} overUsd={ov?.items.cpu.usd}
          note={`The time your code spends working, added up across every request. At this pace: about ${fmtCompact(pace(cf.month.total.cpuMs))} ms by the end of the month.`} />
        <Meter label="File Storage (R2)" used={cf.storage.r2.bytes} limit={a.r2Bytes} format={fmtBytes} overUsd={ov?.items.r2.usd} note={`${plural(cf.storage.r2.objects, 'file')} in ${plural(cf.counts.r2, 'bucket')}.`} />
        <Meter label="Small Database Storage (D1)" used={cf.storage.d1.bytes} limit={a.d1Bytes} format={fmtBytes} overUsd={ov?.items.d1.usd} note={`${plural(cf.counts.d1, 'database')}.`} />
        <Meter label="Key-Value Storage (KV)" used={cf.storage.kv.bytes} limit={a.kvBytes} format={fmtBytes} overUsd={ov?.items.kv.usd} note={`${plural(cf.storage.kv.keys, 'key')} in ${plural(cf.counts.kv, 'store')}.`} />
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 pt-4 border-t border-border">
        <Count label="Workers" value={cf.counts.workers} />
        <Count label="Pages Sites" value={cf.counts.pages} />
        <Count label="R2 Buckets" value={cf.counts.r2} />
        <Count label="D1 Databases" value={cf.counts.d1} />
        <Count label="KV Stores" value={cf.counts.kv} />
        <Count label="Database Links" value={cf.counts.hyperdrive} />
        <Count label="Queues" value={cf.counts.queues} />
      </dl>
      <div className="grid gap-6 lg:grid-cols-2 pt-4 border-t border-border">
        <MiniTable caption="Busiest Projects This Month" columns={['Project', 'Requests', 'Errors', 'Processor Time']} empty="No requests yet this month."
          rows={cf.month.busiest.map((w) => [w.name, fmtNumber(w.requests), fmtNumber(w.errors), `${fmtCompact(w.cpuMs)} ms`])} />
        <MiniTable caption="Largest File Buckets (R2)" columns={['Bucket', 'Size', 'Files']} empty="No buckets."
          rows={cf.storage.r2.items.map((b) => [b.name, fmtBytes(b.bytes), fmtNumber(b.objects)])} />
      </div>
      <Warnings list={cf.warnings} />
    </Card>
  );
}

function PlanetScaleSection({ ps }) {
  if (!ps?.configured || !ps.database) {
    return <Card><SectionTitle title="PlanetScale (Database)" /><p className="text-sm text-muted">The database did not answer the size questions just now. Press Refresh Now to try again.</p><Warnings list={ps?.warnings} /></Card>;
  }
  const c = ps.cluster;
  const others = c.databases.length;
  return (
    <Card className="space-y-6">
      <SectionTitle title="PlanetScale (Database)" sub={`This app's database is "${ps.database.name}" on the shared PlanetScale server (${ps.database.version}). Sizes are read from the database itself.`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Meter label="This App's Database" used={ps.database.bytes} limit={null} format={fmtBytes} />
        <Meter label={`Databases This Login Can See (${others})`} used={c.totalBytes} limit={c.limitBytes} format={fmtBytes}
          note={c.limitBytes ? 'Compared with the storage size set in PLANETSCALE_STORAGE_LIMIT_GB.' : 'To show this as a share of your plan, set the plan\'s storage size in the PLANETSCALE_STORAGE_LIMIT_GB variable.'} />
        {ps.connections && (
          <Meter label="Open Connections" used={ps.connections.open} limit={ps.connections.max} format={fmtNumber}
            note="How many connections the database server has open right now, out of the most it allows." />
        )}
      </div>
      {ps.api?.configured && ps.api.databases?.length > 0 ? (
        <MiniTable caption="Plan Details From PlanetScale" columns={['Database', 'Plan', 'Size', 'Region', 'State']} empty=""
          rows={ps.api.databases.map((d) => [d.name, d.plan || 'n/a', d.size || 'n/a', d.region || 'n/a', d.state || 'n/a'])} />
      ) : (
        <p className="text-xs text-muted">
          The plan name and server size are not shown yet: PlanetScale only gives those to a service token. Add one (PLANETSCALE_ORG,
          PLANETSCALE_SERVICE_TOKEN_ID and PLANETSCALE_SERVICE_TOKEN as Worker secrets, with read access to databases) and they appear here.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2 pt-4 border-t border-border">
        <MiniTable caption="Databases On The Server" columns={['Database', 'Size']} empty="None visible to this login."
          rows={c.databases.slice(0, 12).map((d) => [d.name, fmtBytes(d.bytes)])} />
        <MiniTable caption="Largest Tables In This App" columns={['Table', 'Size', 'Rows (About)']} empty="No tables."
          rows={ps.tables.map((t) => [t.name, fmtBytes(t.bytes), fmtNumber(t.rows)])} />
      </div>
      <Warnings list={ps.warnings} />
    </Card>
  );
}

const SERVICE_WORDS = { connected: 'Connected', degraded: 'Needs Attention', disconnected: 'Disconnected', not_configured: 'Not Set Up' };
const SERVICE_TONE = { connected: 'text-green', degraded: 'text-yellow', disconnected: 'text-red', not_configured: 'text-muted' };

function ServicesSection() {
  const { data, loading, error, refetch } = useApi('/api/status/integrations');
  const list = data?.integrations || [];
  return (
    <Card>
      <SectionTitle title="Other Services" sub="The outside services this app depends on, and whether each one answers. Keys and connections are managed on the Settings page." />
      {loading && !data && <div className="h-24 rounded bg-white/5 animate-pulse" aria-busy="true" aria-label="Checking services" />}
      {error && !data && <ErrorState message="Could not check the other services." onRetry={refetch} />}
      {data && list.length === 0 && <p className="text-sm text-muted">No other services are set up on this copy of the app.</p>}
      {list.length > 0 && (
        <ul className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <li key={s.key} className="flex items-baseline justify-between gap-3 py-2 border-b border-border text-sm" title={s.detail || undefined}>
              <span className="text-white min-w-0 truncate">{s.name}</span>
              <span className={`text-xs font-medium flex-shrink-0 ${SERVICE_TONE[s.status] || 'text-muted'}`}>{SERVICE_WORDS[s.status] || s.status}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading usage numbers">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[124px] rounded-lg bg-card border border-border" />)}</div>
      <div className="h-[520px] rounded-lg bg-card border border-border" />
      <div className="h-[420px] rounded-lg bg-card border border-border" />
    </div>
  );
}

export default function Utilization() {
  const [forced, setForced] = useState(false);
  const { data, loading, error, refetch } = useApi(forced ? '/api/utilization?refresh=1' : '/api/utilization');
  const onRefresh = () => (forced ? refetch() : setForced(true));

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Utilization</h2>
        <p className="text-xs text-muted mt-1">How much of each plan is in use across your hosting: Cloudflare, the PlanetScale database, and the services around them.</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted flex items-center gap-1" role="status" aria-live="polite">
          <Clock size={12} aria-hidden="true" />
          {loading ? 'Checking...' : data ? `Checked ${new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
        </p>
        <button onClick={onRefresh} disabled={loading} title="Read the numbers again (they are otherwise kept for 10 minutes)"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white border border-border rounded px-3 py-1.5 transition-colors disabled:opacity-60">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh Now
        </button>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        {error ? <ErrorState message="Could not load the usage numbers." onRetry={refetch} /> : <Skeleton />}
      </div>
    );
  }

  const cf = data.cloudflare?.configured && !data.cloudflare.error ? data.cloudflare : null;
  const ps = data.planetscale?.configured ? data.planetscale : null;
  const cfStorage = cf ? cf.storage.r2.bytes + cf.storage.kv.bytes + cf.storage.d1.bytes : 0;
  const totalStorage = cfStorage + (ps ? ps.cluster.totalBytes : 0);
  const reqPct = cf ? pctOf(cf.month.total.requests, cf.plan.allowance.requestsPerMonth) : null;
  const cpuPct = cf ? pctOf(cf.month.total.cpuMs, cf.plan.allowance.cpuMsPerMonth) : null;
  const accent = (p) => (p == null ? 'white' : p >= 75 ? 'yellow' : 'green');

  return (
    <div className="space-y-6">
      {header}
      {error && <p className="text-xs text-red" role="alert">The last refresh failed; showing the previous numbers.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Storage In Use" value={fmtBytes(totalStorage)} accent="purple"
          sub={`${fmtBytes(cfStorage)} on Cloudflare, ${ps ? fmtBytes(ps.cluster.totalBytes) : 'n/a'} in databases`} />
        <StatCard label="Requests This Month" value={cf ? fmtCompact(cf.month.total.requests) : 'n/a'} accent={accent(reqPct)}
          sub={cf ? (reqPct > 100 ? `Over the ${fmtCompact(cf.plan.allowance.requestsPerMonth)} included, billed by use` : `${pctText(reqPct)} of the ${fmtCompact(cf.plan.allowance.requestsPerMonth)} included`) : 'Cloudflare is not connected'} />
        <StatCard label="Processor Time This Month" value={cf ? `${fmtCompact(cf.month.total.cpuMs)} ms` : 'n/a'} accent={accent(cpuPct)}
          sub={cf ? (cpuPct > 100 ? `Over the ${fmtCompact(cf.plan.allowance.cpuMsPerMonth)} ms included, about ${fmtUsd(cf.overage?.items.cpu.usd || 0)} extra` : `${pctText(cpuPct)} of the ${fmtCompact(cf.plan.allowance.cpuMsPerMonth)} ms included`) : 'Cloudflare is not connected'} />
        <StatCard label="This App's Database" value={ps ? fmtBytes(ps.database.bytes) : 'n/a'} accent="white"
          sub={ps?.connections ? `${ps.connections.open} of ${ps.connections.max} connections open` : 'PlanetScale'} />
      </div>
      <CloudflareSection cf={data.cloudflare} />
      <PlanetScaleSection ps={data.planetscale} />
      <ServicesSection />
    </div>
  );
}
