import { useState } from 'react';

export default function StatCard({ label, value, sub, accent, tooltip }) {
  const [show, setShow] = useState(false);
  const accentMap = {
    purple: 'text-purple',
    green: 'text-green',
    yellow: 'text-yellow',
    red: 'text-red',
    white: 'text-white',
  };
  const valueColor = accentMap[accent] || 'text-white';

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted mb-3">{label}</p>
      <div
        className="relative inline-block"
        onMouseEnter={() => tooltip && setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <p className={`font-mono text-3xl font-bold ${valueColor} ${tooltip ? 'cursor-help' : ''}`}>
          {value}
        </p>
        {show && (
          <div className="absolute bottom-full left-0 mb-2 z-50 min-w-max bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted shadow-lg whitespace-pre-line pointer-events-none">
            {tooltip}
          </div>
        )}
      </div>
      {sub && <p className="text-xs text-muted mt-2">{sub}</p>}
    </div>
  );
}
