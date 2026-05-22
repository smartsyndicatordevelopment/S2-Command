import { useState } from 'react';
import { Bot, X } from 'lucide-react';
import BusinessChat from './BusinessChat';

export default function AnalystPanel({ activeTab }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Slide-out panel */}
      <div
        className="fixed z-40 overflow-hidden"
        style={{
          top: '52px',
          right: 0,
          bottom: 0,
          width: open ? '400px' : '0',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          className="flex flex-col"
          style={{
            width: '400px',
            height: '100%',
            backgroundColor: 'var(--c-card)',
            borderLeft: '1px solid var(--c-border)',
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between flex-shrink-0 px-4 py-3"
            style={{ borderBottom: '1px solid var(--c-border)' }}
          >
            <div className="flex items-center gap-2">
              <Bot size={14} style={{ color: '#5c3ff4' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--c-dim)' }}>
                Business Analyst
              </span>
              {activeTab && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'rgba(92,63,244,0.12)',
                    color: '#5c3ff4',
                    fontSize: '10px',
                  }}
                >
                  {activeTab}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-6 h-6 rounded transition-colors"
              style={{ color: 'var(--c-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--c-dim)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--c-muted)'; }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Chat fills remaining height */}
          <div className="flex-1 overflow-hidden">
            <BusinessChat
              context={{ activeTab }}
              style={{ height: '100%', borderRadius: 0, border: 'none' }}
            />
          </div>
        </div>
      </div>

      {/* Tab trigger -- always visible on right edge */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed z-40 flex flex-col items-center justify-center gap-1.5"
        style={{
          top: '130px',
          right: open ? '400px' : '0',
          width: '32px',
          height: '88px',
          backgroundColor: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRight: open ? '1px solid var(--c-border)' : 'none',
          borderRadius: '8px 0 0 8px',
          transition: 'right 0.25s cubic-bezier(0.4,0,0.2,1)',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(92,63,244,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--c-card)'; }}
      >
        <Bot size={13} style={{ color: '#5c3ff4' }} />
        <span
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            fontSize: '9px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--c-muted)',
            textTransform: 'uppercase',
            userSelect: 'none',
          }}
        >
          Analyst
        </span>
      </button>
    </>
  );
}
