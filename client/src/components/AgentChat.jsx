// Shared UI primitives used by all agent tabs (ClickUp, Facebook, etc.)
// Import what you need: Message, TypingIndicator, ApprovalCard, ChangelogPanel, MethodBadge, timeAgo
import SimpleMarkdown from './SimpleMarkdown';
import { AlertTriangle, CheckCircle, XCircle, Clock, RotateCcw } from 'lucide-react';

export const METHOD_COLORS = {
  GET:    { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  POST:   { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  PUT:    { bg: 'rgba(234,179,8,0.12)',  color: '#eab308' },
  PATCH:  { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
  DELETE: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
};

export function MethodBadge({ method }) {
  const s = METHOD_COLORS[method] || { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af' };
  return (
    <span style={{ backgroundColor: s.bg, color: s.color, borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em' }}>
      {method}
    </span>
  );
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Message({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] rounded-lg px-4 py-3 text-sm"
        style={{
          backgroundColor: isUser ? '#5c3ff4' : 'var(--c-subtle-5)',
          color: isUser ? '#fff' : 'var(--c-text-primary)',
          lineHeight: '1.7',
        }}
      >
        {isUser
          ? <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
          : <SimpleMarkdown content={content} />
        }
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="px-4 py-3 rounded-lg" style={{ backgroundColor: 'var(--c-subtle-5)' }}>
        <span className="inline-flex items-center gap-1">
          {[0, 150, 300].map(d => (
            <span key={d} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: 'var(--c-muted)', animationDelay: `${d}ms` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

export function ApprovalCard({ pending, onApprove, onCancel, loading }) {
  return (
    <div
      className="rounded-lg p-4 flex-shrink-0"
      style={{ border: '1px solid rgba(234,179,8,0.3)', backgroundColor: 'rgba(234,179,8,0.05)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={13} style={{ color: '#eab308' }} />
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#eab308' }}>
          Proposed Change -- Review Before Approving
        </p>
      </div>

      <p className="text-sm mb-3" style={{ color: 'var(--c-text-primary)', lineHeight: '1.6' }}>
        {pending.preview}
      </p>

      <div className="flex items-center gap-2 mb-4">
        <MethodBadge method={pending.action?.method || 'POST'} />
        <code className="text-xs font-mono" style={{ color: 'var(--c-muted)' }}>
          {pending.action?.endpoint || pending.action?.path || ''}
        </code>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onApprove}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold"
          style={{
            backgroundColor: loading ? 'rgba(34,197,94,0.3)' : '#22c55e',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            : <CheckCircle size={12} />}
          Approve
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold"
          style={{
            border: '1px solid var(--c-border)',
            color: 'var(--c-dim)',
            backgroundColor: 'transparent',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <XCircle size={12} />
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ChangelogPanel({ entries, undoingId, onUndo }) {
  if (!entries.length) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>No changes logged yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
      {entries.map(entry => (
        <div
          key={entry.id}
          className="flex items-start gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--c-border)', opacity: entry.undone ? 0.5 : 1 }}
        >
          <Clock size={11} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--c-muted)' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <MethodBadge method={entry.action?.method || 'POST'} />
              <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{timeAgo(entry.timestamp)}</span>
              {entry.undone && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--c-border)', color: 'var(--c-muted)' }}>
                  undone
                </span>
              )}
            </div>
            <p className="text-xs leading-snug" style={{ color: 'var(--c-dim)' }}>{entry.description}</p>
          </div>
          {!entry.undone && entry.undoAction && (
            <button
              onClick={() => onUndo(entry.id)}
              disabled={!!undoingId}
              className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{
                border: '1px solid var(--c-border)',
                color: 'var(--c-muted)',
                backgroundColor: 'transparent',
                cursor: undoingId ? 'not-allowed' : 'pointer',
                opacity: undoingId && undoingId !== entry.id ? 0.5 : 1,
              }}
            >
              {undoingId === entry.id
                ? <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
                : <RotateCcw size={10} />}
              Undo
            </button>
          )}
          {!entry.undone && !entry.undoAction && (
            <span className="flex-shrink-0 text-xs" style={{ color: 'var(--c-muted)', fontSize: '10px' }}>no undo</span>
          )}
        </div>
      ))}
    </div>
  );
}
