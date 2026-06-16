import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';

// Status -> visual mapping. This project already uses a green/yellow/red
// convention across the dashboard, so integration health follows suit.
const STATUS_META = {
  connected:      { label: 'Connected',       color: '#22c55e', Icon: CheckCircle2 },
  degraded:       { label: 'Needs attention', color: '#eab308', Icon: AlertTriangle },
  disconnected:   { label: 'Disconnected',    color: '#ef4444', Icon: XCircle },
  not_configured: { label: 'Not configured',  color: '#6b7280', Icon: MinusCircle },
};

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function StatusDot({ status }) {
  const meta = STATUS_META[status] || STATUS_META.disconnected;
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: '8px', height: '8px', backgroundColor: meta.color }}
    />
  );
}

function IntegrationRow({ integration }) {
  const meta = STATUS_META[integration.status] || STATUS_META.disconnected;
  const { Icon } = meta;
  return (
    <div
      className="flex items-start gap-3 px-4 py-3.5 rounded-lg"
      style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
    >
      <Icon size={16} style={{ color: meta.color, marginTop: '1px' }} className="flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: 'var(--c-text-primary)' }}>
            {integration.name}
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{ color: 'var(--c-muted)', backgroundColor: 'var(--c-subtle-5)', fontSize: '10px' }}
          >
            {integration.category}
          </span>
          {integration.liveChecked === false && (
            <span className="text-xs" style={{ color: 'var(--c-dim)', fontSize: '10px' }} title="Verified from configuration, not a live API call">
              config check
            </span>
          )}
        </div>
        {integration.detail && (
          <p className="text-xs mt-1" style={{ color: 'var(--c-muted)', lineHeight: '1.5' }}>
            {integration.detail}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <StatusDot status={integration.status} />
        <span className="text-xs font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
    </div>
  );
}

export default function Settings() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const check = useCallback(async () => {
    setLoading(true);
    setError(null);
    let attempts = 3;
    while (attempts > 0) {
      try {
        const res = await fetch('/api/status/integrations', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
        setLoading(false);
        return;
      } catch (err) {
        attempts--;
        if (attempts === 0) {
          setError(err.message);
          setLoading(false);
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  const integrations = data?.integrations || [];
  const connectedCount = integrations.filter(i => i.status === 'connected').length;
  const attentionCount = integrations.filter(i => i.status === 'degraded' || i.status === 'disconnected').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Settings</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            Integration status -- live connectivity for every connected system
          </p>
        </div>
        <button
          onClick={check}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs flex-shrink-0 transition-colors"
          style={{
            border: '1px solid var(--c-border)',
            color: 'var(--c-dim)',
            backgroundColor: 'transparent',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking...' : 'Recheck'}
        </button>
      </div>

      {/* Summary bar */}
      {data && !error && (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <StatusDot status="connected" />
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
              <span style={{ color: 'var(--c-text-primary)', fontWeight: 600 }}>{connectedCount}</span> of {data.total} connected
            </span>
          </div>
          {attentionCount > 0 && (
            <div className="flex items-center gap-1.5">
              <StatusDot status="degraded" />
              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                <span style={{ color: 'var(--c-text-primary)', fontWeight: 600 }}>{attentionCount}</span> need attention
              </span>
            </div>
          )}
          {data.checkedAt && (
            <span className="text-xs" style={{ color: 'var(--c-dim)' }}>
              Last checked {fmtTime(data.checkedAt)}
            </span>
          )}
        </div>
      )}

      {error && (
        <div
          className="px-4 py-3 rounded-lg text-xs"
          style={{ border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)', color: '#ef4444' }}
        >
          Failed to load integration status: {error}
        </div>
      )}

      {/* Loading skeleton on first load */}
      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-purple border-t-transparent animate-spin" />
          <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Checking integrations...</p>
        </div>
      )}

      {/* Integration list */}
      {integrations.length > 0 && (
        <div className="space-y-2.5">
          {integrations.map(i => (
            <IntegrationRow key={i.key} integration={i} />
          ))}
        </div>
      )}
    </div>
  );
}
