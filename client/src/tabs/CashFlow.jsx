import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ResponsiveContainer, Sankey, Layer, Rectangle } from 'recharts';
import { useApi } from '../hooks/useApi';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
// Default the view to the previous month, rolling back into December of the
// prior year when the current month is January.
const PREV_MONTH = CURRENT_MONTH === 1 ? 12 : CURRENT_MONTH - 1;
const PREV_MONTH_YEAR = CURRENT_MONTH === 1 ? CURRENT_YEAR - 1 : CURRENT_YEAR;
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Native <option> popups ignore most inherited styling -- set background/text
// explicitly (theme-aware) so the dropdown list has proper contrast.
const OPTION_STYLE = { backgroundColor: 'var(--c-card)', color: 'var(--c-text-primary)' };

const NODE_COLORS = {
  income:       '#5c3ff4',
  hub:          '#6b7280',
  group:        '#d98a3d',
  expense:      '#d98a3d',
  profitBucket: '#22c55e',
  profit:       '#22c55e',
};
const LINK_COLORS = {
  hub:          '#5c3ff4', // income -> Total Income
  group:        '#d98a3d', // Total Income -> expense section
  expense:      '#d98a3d', // section -> category (and discounts)
  profitBucket: '#22c55e', // Total Income -> profit pass-through
  profit:       '#22c55e', // pass-through -> Net Profit
};

// Leaf category nodes are the only ones with itemized transactions to drill into.
const DRILLDOWN_KINDS = new Set(['income', 'expense']);

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtCents = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

// Popup sizing used to clamp the hover panel inside the chart wrapper.
const POPUP_W = 340;
const POPUP_H = 320;

function SankeyNode({ x, y, width, height, payload, onNodeHover, onHoverEnd, onNodeClick, hasTxns }) {
  const kind = payload.kind || 'expense';
  const color = NODE_COLORS[kind] || '#9aa0a6';
  const value = payload.value || 0;
  const leftCol = payload.depth === 0;
  const drillable = hasTxns && hasTxns(payload.name, kind);

  const enter = (e) => onNodeHover(payload, e);
  const leave = () => onHoverEnd();
  const click = drillable ? () => onNodeClick(payload) : undefined;

  // Profit pass-through: a bare green bar, no label (the labeled "Net Profit"
  // node sits one column to its right).
  if (kind === 'profitBucket') {
    return <Layer><Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} radius={2} /></Layer>;
  }

  return (
    <Layer>
      <g
        onMouseEnter={enter}
        onMouseLeave={leave}
        onClick={click}
        style={{ cursor: drillable ? 'pointer' : 'default' }}
      >
        <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} radius={2} />
        {kind === 'hub' ? (
          <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={600} style={{ fill: 'var(--c-text-primary)' }}>
            {payload.name} · {fmt(value)}
          </text>
        ) : (
          <text
            x={leftCol ? x - 8 : x + width + 8}
            y={y + height / 2}
            textAnchor={leftCol ? 'end' : 'start'}
            dominantBaseline="middle"
            fontSize={11}
          >
            <tspan style={{ fill: 'var(--c-text-primary)' }}>{payload.name}</tspan>
            <tspan dx="6" style={{ fill: 'var(--c-muted)' }}>{fmt(value)}</tspan>
          </text>
        )}
      </g>
    </Layer>
  );
}

function SankeyLink({ sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth, payload, onLinkHover, onHoverEnd, onLinkClick }) {
  const color = LINK_COLORS[payload?.target?.kind] || '#9aa0a6';
  const enter = (e) => onLinkHover(payload, e);
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.3}
      style={{ cursor: 'pointer' }}
      onMouseEnter={enter}
      onMouseLeave={onHoverEnd}
      onClick={() => onLinkClick(payload)}
    />
  );
}

// Readable, theme-aware replacement for the default (black-text) Recharts
// tooltip. Renders either a flow value (links) or a category's itemized
// transaction list (leaf nodes).
function HoverPopup({ hover }) {
  if (!hover) return null;

  const { left, top, kind } = hover;
  const base = {
    position: 'absolute',
    left,
    top,
    width: POPUP_W,
    zIndex: 50,
    pointerEvents: 'none',
    backgroundColor: 'var(--c-card)',
    border: '1px solid var(--c-border)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
    color: 'var(--c-text-primary)',
    overflow: 'hidden',
  };

  if (hover.type === 'link') {
    return (
      <div style={base}>
        <div className="px-3 py-2 text-xs" style={{ color: 'var(--c-text-primary)' }}>
          <span style={{ color: 'var(--c-muted)' }}>{hover.source} → {hover.target}</span>
          <span className="font-mono font-semibold ml-2">{fmt(hover.value)}</span>
        </div>
      </div>
    );
  }

  const txns = hover.transactions || [];
  const showCount = Math.min(txns.length, 40);
  const accent = NODE_COLORS[kind] || 'var(--c-text-primary)';

  return (
    <div style={base}>
      {/* Header: category name + total */}
      <div className="px-3 py-2 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <span className="text-xs font-semibold truncate" style={{ color: 'var(--c-text-primary)' }}>{hover.name}</span>
        <span className="text-xs font-mono font-semibold flex-shrink-0" style={{ color: accent }}>{fmt(hover.value)}</span>
      </div>

      {txns.length === 0 ? (
        <div className="px-3 py-3 text-xs" style={{ color: 'var(--c-muted)' }}>
          No itemized transactions for this period.
        </div>
      ) : (
        <>
          <div style={{ maxHeight: POPUP_H - 90, overflow: 'hidden' }}>
            {txns.slice(0, showCount).map((t, i) => (
              <div
                key={i}
                className="px-3 py-1.5 flex items-center gap-2 text-xs"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--c-subtle-5)' }}
              >
                <span className="font-mono flex-shrink-0" style={{ color: 'var(--c-muted)', width: 62 }}>{t.date?.slice(5)}</span>
                <span className="truncate flex-1" style={{ color: 'var(--c-text-primary)' }}>
                  {t.counterparty || t.description || '—'}
                </span>
                <span className="font-mono flex-shrink-0" style={{ color: 'var(--c-text-primary)' }}>{fmtCents(Math.abs(t.amount))}</span>
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 text-[11px]" style={{ borderTop: '1px solid var(--c-border)', color: 'var(--c-muted)' }}>
            {txns.length > showCount ? `Showing ${showCount} of ${txns.length} transactions` : `${txns.length} transaction${txns.length === 1 ? '' : 's'}`}
          </div>
        </>
      )}
    </div>
  );
}

const monthLabel = (ym) => {
  const [y, mo] = (ym || '').split('-');
  const i = Number(mo) - 1;
  return i >= 0 && i < 12 ? `${MONTHS[i].slice(0, 3)} ${y}` : ym;
};

// Segmented button group for the sort/group controls.
function Segmented({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>{label}</span>
      <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
        {options.map((o, i) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="text-xs px-2.5 py-1 transition-colors"
            style={{
              backgroundColor: value === o.value ? 'rgba(92,63,244,0.15)' : 'transparent',
              color: value === o.value ? '#5c3ff4' : 'var(--c-muted)',
              borderLeft: i === 0 ? 'none' : '1px solid var(--c-border)',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Click-to-open detail: a scrollable, sortable, groupable table of every
// transaction behind a category (or an aggregated group node).
function TransactionModal({ detail, onClose }) {
  const [sortKey, setSortKey] = useState('amount'); // 'date' | 'amount' | 'name'
  const [sortDir, setSortDir] = useState('desc');   // 'asc' | 'desc'
  const [groupBy, setGroupBy] = useState('none');   // 'none' | 'vendor' | 'month'

  // Reset controls whenever a different category is opened.
  useEffect(() => { setSortKey('amount'); setSortDir('desc'); setGroupBy('none'); }, [detail?.name]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const txns = detail?.transactions || [];

  const sortRows = useCallback((rows) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'amount') return (Math.abs(a.amount) - Math.abs(b.amount)) * mul;
      if (sortKey === 'name') {
        const an = (a.counterparty || a.description || '').toLowerCase();
        const bn = (b.counterparty || b.description || '').toLowerCase();
        return (an < bn ? -1 : an > bn ? 1 : 0) * mul;
      }
      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * mul;
    });
  }, [sortKey, sortDir]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return null;
    const map = {};
    for (const t of txns) {
      const key = groupBy === 'vendor' ? (t.counterparty || t.description || 'Uncategorized') : t.date.slice(0, 7);
      (map[key] = map[key] || []).push(t);
    }
    return Object.entries(map)
      .map(([name, rows]) => ({
        name: groupBy === 'month' ? monthLabel(name) : name,
        rows: sortRows(rows),
        total: rows.reduce((s, r) => s + Math.abs(r.amount), 0),
        count: rows.length,
      }))
      .sort((a, b) => b.total - a.total);
  }, [txns, groupBy, sortRows]);

  const flatRows = useMemo(() => (groupBy === 'none' ? sortRows(txns) : []), [txns, groupBy, sortRows]);

  if (!detail) return null;

  const total = txns.reduce((s, t) => s + Math.abs(t.amount), 0);
  const accent = NODE_COLORS[detail.kind] || 'var(--c-text-primary)';

  const Row = ({ t }) => (
    <div className="px-4 py-2 flex items-center gap-3 text-xs" style={{ borderTop: '1px solid var(--c-subtle-5)' }}>
      <span className="font-mono flex-shrink-0" style={{ color: 'var(--c-muted)', width: 84 }}>{t.date}</span>
      <span className="truncate flex-1" style={{ color: 'var(--c-text-primary)' }}>{t.counterparty || t.description || '—'}</span>
      {t.counterparty && t.description && t.description !== t.counterparty && (
        <span className="truncate hidden sm:block" style={{ color: 'var(--c-muted)', maxWidth: 200 }}>{t.description}</span>
      )}
      <span className="font-mono flex-shrink-0 text-right" style={{ color: 'var(--c-text-primary)', width: 96 }}>{fmtCents(Math.abs(t.amount))}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl flex flex-col"
        style={{ backgroundColor: 'var(--c-card)', border: '1px solid var(--c-border)', maxHeight: '85vh', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: accent }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text-primary)' }}>{detail.name}</h2>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
              {txns.length} transaction{txns.length === 1 ? '' : 's'} · {fmtCents(total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
          >
            Close
          </button>
        </div>

        {/* Controls */}
        <div className="px-4 py-2.5 flex items-center gap-5 flex-wrap" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <Segmented
            label="Sort"
            value={sortKey}
            onChange={setSortKey}
            options={[{ value: 'amount', label: 'Amount' }, { value: 'date', label: 'Date' }, { value: 'name', label: 'Name' }]}
          />
          <button
            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
            className="text-xs px-2 py-1 rounded"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)' }}
            title="Toggle sort direction"
          >
            {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
          <Segmented
            label="Group"
            value={groupBy}
            onChange={setGroupBy}
            options={[{ value: 'none', label: 'None' }, { value: 'vendor', label: 'Vendor' }, { value: 'month', label: 'Month' }]}
          />
        </div>

        {/* Body */}
        <div className="overflow-y-auto" style={{ flex: 1 }}>
          {txns.length === 0 ? (
            <p className="px-4 py-6 text-xs" style={{ color: 'var(--c-muted)' }}>No itemized transactions for this period.</p>
          ) : groupBy === 'none' ? (
            flatRows.map((t, i) => <Row key={i} t={t} />)
          ) : (
            groups.map((g) => (
              <div key={g.name}>
                <div
                  className="px-4 py-2 flex items-center justify-between sticky top-0"
                  style={{ backgroundColor: 'var(--c-subtle-5)', borderTop: '1px solid var(--c-border)', borderBottom: '1px solid var(--c-border)' }}
                >
                  <span className="text-xs font-semibold" style={{ color: 'var(--c-text-primary)' }}>
                    {g.name} <span style={{ color: 'var(--c-muted)' }}>· {g.count}</span>
                  </span>
                  <span className="text-xs font-mono font-semibold" style={{ color: accent }}>{fmtCents(g.total)}</span>
                </div>
                {g.rows.map((t, i) => <Row key={i} t={t} />)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}>
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>{label}</p>
      <p className="text-lg font-semibold mt-1 font-mono" style={{ color }}>{fmt(value)}</p>
    </div>
  );
}

export default function CashFlow() {
  const [year, setYear] = useState(PREV_MONTH_YEAR);
  const [month, setMonth] = useState(PREV_MONTH); // 0 = Full Year, 1-12 = month
  const [hover, setHover] = useState(null);
  const [detail, setDetail] = useState(null);
  const wrapRef = useRef(null);

  // The current year only has months up to this month; clamp so we never request a future month.
  const maxMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12;
  const m = month > maxMonth ? 0 : month;
  const { data, loading, error } = useApi(`/api/cashflow?year=${year}${m ? `&month=${m}` : ''}`);

  const nodes = data?.nodes || [];
  const links = data?.links || [];
  const hasData = nodes.length > 0 && links.length > 0;
  const expenseCount = nodes.filter(n => n.kind === 'expense').length;
  const chartHeight = Math.max(620, expenseCount * 34);

  // Category name -> transaction list, normalized so a leaf node's name resolves
  // regardless of casing/whitespace differences between the P&L and the ledger.
  const txnIndex = data?.transactionsByCategory || {};
  const normalizedTxns = useCallback(() => {
    const idx = {};
    for (const [k, v] of Object.entries(txnIndex)) idx[k.trim().toLowerCase()] = v;
    return idx;
  }, [txnIndex]);
  const txnsFor = (name) => normalizedTxns()[String(name || '').trim().toLowerCase()] || [];

  // Group nodes (e.g. "Operating Expenses") have no transactions of their own --
  // aggregate every leaf category that flows out of them, derived from the links.
  const childrenByGroup = {};
  for (const l of links) {
    const s = nodes[l.source], t = nodes[l.target];
    if (s?.kind === 'group' && DRILLDOWN_KINDS.has(t?.kind)) {
      (childrenByGroup[s.name] = childrenByGroup[s.name] || []).push(t.name);
    }
  }
  const groupTxns = (name) => {
    const all = (childrenByGroup[name] || []).flatMap(txnsFor);
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return all;
  };

  // Line items for any node, whichever kind it is.
  const txnsForNode = (name, kind) =>
    DRILLDOWN_KINDS.has(kind) ? txnsFor(name) : kind === 'group' ? groupTxns(name) : [];
  const hasTxns = (name, kind) => txnsForNode(name, kind).length > 0;

  // Clamp a popup's top-left so it stays inside the chart wrapper.
  const clamp = (cx, cy) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { left: cx, top: cy };
    let left = cx - rect.left + 14;
    let top = cy - rect.top + 14;
    if (left + POPUP_W > rect.width) left = cx - rect.left - POPUP_W - 14;
    if (left < 4) left = 4;
    if (top + POPUP_H > rect.height) top = Math.max(4, rect.height - POPUP_H - 4);
    if (top < 4) top = 4;
    return { left, top };
  };

  const onNodeHover = (payload, e) => {
    const kind = payload.kind || 'expense';
    setHover({
      type: 'node',
      kind,
      name: payload.name,
      value: payload.value || 0,
      transactions: txnsForNode(payload.name, kind),
      ...clamp(e.clientX, e.clientY),
    });
  };

  const onLinkHover = (payload, e) => {
    // A flow band is the easiest thing to hover, so make it drill in too: show the
    // line items for whichever endpoint is a spendable category (target first --
    // the expense side; then source -- the income side). Otherwise show the flow.
    const target = payload?.target, source = payload?.source;
    const cat =
      (target && hasTxns(target.name, target.kind) && { node: target }) ||
      (source && hasTxns(source.name, source.kind) && { node: source }) ||
      null;

    if (cat) {
      const { name, kind } = cat.node;
      setHover({
        type: 'node',
        kind,
        name,
        value: payload?.value || 0,
        transactions: txnsForNode(name, kind),
        ...clamp(e.clientX, e.clientY),
      });
      return;
    }

    setHover({
      type: 'link',
      source: source?.name || '',
      target: target?.name || '',
      value: payload?.value || 0,
      ...clamp(e.clientX, e.clientY),
    });
  };

  const onHoverEnd = () => setHover(null);

  // Click opens the full, scrollable/sortable/groupable transaction table.
  const openDetail = (name, kind, value) => {
    const transactions = txnsForNode(name, kind);
    if (!transactions.length) return;
    setHover(null);
    setDetail({ name, kind, value: value || 0, transactions });
  };
  const onNodeClick = (payload) => openDetail(payload.name, payload.kind || 'expense', payload.value);
  const onLinkClick = (payload) => {
    const target = payload?.target, source = payload?.source;
    const node =
      (target && hasTxns(target.name, target.kind) && target) ||
      (source && hasTxns(source.name, source.kind) && source) ||
      null;
    if (node) openDetail(node.name, node.kind, payload?.value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Cash Flow</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            Revenue and expense flow -- live from Digits{data?.startDate ? ` · ${data.startDate} to ${data.endDate}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className="text-xs px-3 py-1.5 rounded transition-colors"
              style={{
                backgroundColor: y === year ? 'rgba(92,63,244,0.15)' : 'transparent',
                border: '1px solid var(--c-border)',
                color: y === year ? '#5c3ff4' : 'var(--c-muted)',
              }}
            >
              {y}
            </button>
          ))}
          <select
            value={m}
            onChange={e => setMonth(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded outline-none"
            style={{ backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)' }}
          >
            <option value={0} style={OPTION_STYLE}>Full Year</option>
            {MONTHS.slice(0, maxMonth).map((name, i) => (
              <option key={i} value={i + 1} style={OPTION_STYLE}>{name} {year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      {hasData && (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total Income"   value={data.totalIncome}   color="#5c3ff4" />
          <Stat label="Total Expenses" value={data.totalExpenses} color="#d98a3d" />
          <Stat label={data.netLoss ? 'Net Loss' : 'Net Profit'} value={data.netIncome} color={data.netLoss ? '#ef4444' : '#22c55e'} />
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-purple border-t-transparent animate-spin" />
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Building cash flow...</p>
        </div>
      )}

      {!loading && data?.notConfigured && (
        <div className="px-4 py-3 rounded-lg text-xs" style={{ border: '1px solid rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.06)', color: '#eab308' }}>
          Digits is not connected. Connect it from Settings to see your cash flow.
        </div>
      )}

      {!loading && error && (
        <div className="px-4 py-3 rounded-lg text-xs" style={{ border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)', color: '#ef4444' }}>
          Failed to load cash flow: {error}
        </div>
      )}

      {!loading && !error && !data?.notConfigured && !hasData && (
        <p className="text-sm py-12 text-center" style={{ color: 'var(--c-muted)' }}>No cash flow data for {year}.</p>
      )}

      {/* Sankey */}
      {!loading && hasData && (
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}>
          <p className="text-[11px] mb-2" style={{ color: 'var(--c-muted)' }}>
            Hover a category to peek · click to open the full transaction list (sortable, groupable).
          </p>
          <div ref={wrapRef} className="relative">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <Sankey
                data={{ nodes, links }}
                node={<SankeyNode onNodeHover={onNodeHover} onHoverEnd={onHoverEnd} onNodeClick={onNodeClick} hasTxns={hasTxns} />}
                link={<SankeyLink onLinkHover={onLinkHover} onHoverEnd={onHoverEnd} onLinkClick={onLinkClick} />}
                nodePadding={24}
                nodeWidth={12}
                linkCurvature={0.5}
                iterations={0}
                margin={{ top: 30, right: 210, bottom: 20, left: 180 }}
              />
            </ResponsiveContainer>
            <HoverPopup hover={hover} />
          </div>
        </div>
      )}

      <TransactionModal detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
