import { useState } from 'react';
import { ResponsiveContainer, Sankey, Tooltip, Layer, Rectangle } from 'recharts';
import { useApi } from '../hooks/useApi';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const NODE_COLORS = {
  income:  '#5c3ff4',
  hub:     '#6b7280',
  group:   '#d98a3d',
  expense: '#d98a3d',
  profit:  '#22c55e',
};
const LINK_COLORS = {
  hub:     '#5c3ff4', // income -> Total Income
  group:   '#d98a3d', // Total Income -> expense section
  expense: '#d98a3d', // section -> category (and discounts)
  profit:  '#22c55e', // Total Income -> Net Profit
};

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

function SankeyNode({ x, y, width, height, payload }) {
  const kind = payload.kind || 'expense';
  const color = NODE_COLORS[kind] || '#9aa0a6';
  const value = payload.value || 0;
  const leftCol = payload.depth === 0;

  return (
    <Layer>
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
    </Layer>
  );
}

function SankeyLink({ sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth, payload }) {
  const color = LINK_COLORS[payload?.target?.kind] || '#9aa0a6';
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.3}
    />
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
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(0); // 0 = Full Year, 1-12 = month

  // The current year only has months up to this month; clamp so we never request a future month.
  const maxMonth = year === CURRENT_YEAR ? CURRENT_MONTH : 12;
  const m = month > maxMonth ? 0 : month;
  const { data, loading, error } = useApi(`/api/cashflow?year=${year}${m ? `&month=${m}` : ''}`);

  const nodes = data?.nodes || [];
  const links = data?.links || [];
  const hasData = nodes.length > 0 && links.length > 0;
  const expenseCount = nodes.filter(n => n.kind === 'expense').length;
  const chartHeight = Math.max(620, expenseCount * 34);

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
            <option value={0}>Full Year</option>
            {MONTHS.slice(0, maxMonth).map((name, i) => (
              <option key={i} value={i + 1}>{name} {year}</option>
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
          <ResponsiveContainer width="100%" height={chartHeight}>
            <Sankey
              data={{ nodes, links }}
              node={<SankeyNode />}
              link={<SankeyLink />}
              nodePadding={24}
              nodeWidth={12}
              linkCurvature={0.5}
              iterations={0}
              margin={{ top: 30, right: 210, bottom: 20, left: 180 }}
            >
              <Tooltip
                formatter={(v) => fmt(v)}
                contentStyle={{ backgroundColor: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: '6px', fontSize: '12px' }}
              />
            </Sankey>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
