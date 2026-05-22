import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, CheckCircle, XCircle, Clock, RotateCcw, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const GREETING = "Hi! I'm connected to your GoHighLevel account. Ask me anything -- contacts, pipeline, emails, social posts, appointments, blog content, and more. I can also create and update records, and will always show you a preview before making any changes.";

const QUICK_PROMPTS = [
  'Show me my most recent contacts',
  'What opportunities are in my pipeline?',
  'List my active email templates',
  'What appointments are scheduled this week?',
  'Show me my recent conversations',
  'What workflows do I have active?',
  'List my blog posts',
  'Show me recent form submissions',
];

const METHOD_COLORS = {
  GET:    { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
  POST:   { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  PUT:    { bg: 'rgba(234,179,8,0.12)',  color: '#eab308' },
  PATCH:  { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
  DELETE: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
};

function MethodBadge({ method }) {
  const s = METHOD_COLORS[method] || { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af' };
  return (
    <span className="font-bold" style={{ backgroundColor: s.bg, color: s.color, borderRadius: '4px', padding: '1px 6px', fontSize: '10px', letterSpacing: '0.04em' }}>
      {method}
    </span>
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Message({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] rounded-lg px-4 py-3 text-sm"
        style={{
          backgroundColor: isUser ? '#5c3ff4' : 'var(--c-subtle-5)',
          color: isUser ? '#fff' : 'var(--c-text-primary)',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap',
        }}
      >
        {content}
      </div>
    </div>
  );
}

function TypingIndicator() {
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

function ApprovalCard({ pending, onApprove, onCancel, loading }) {
  const methodColor = METHOD_COLORS[pending.action.method] || METHOD_COLORS.POST;
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
        <MethodBadge method={pending.action.method} />
        <code className="text-xs font-mono" style={{ color: 'var(--c-muted)' }}>
          {pending.action.endpoint}
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

function ChangelogPanel({ entries, undoingId, onUndo, onRefresh }) {
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
              <MethodBadge method={entry.action.method} />
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
            <span className="flex-shrink-0 text-xs" style={{ color: 'var(--c-muted)', fontSize: '10px' }}>
              no undo
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function GHLMcp() {
  const [messages, setMessages]         = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [hasKey, setHasKey]             = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [approving, setApproving]       = useState(false);
  const [showLog, setShowLog]           = useState(false);
  const [changelog, setChangelog]       = useState([]);
  const [undoingId, setUndoingId]       = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch('/api/ghl/config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setHasKey(!!d.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  const refreshLog = useCallback(() => {
    fetch('/api/ghl/changelog', { credentials: 'include' })
      .then(r => r.json())
      .then(setChangelog)
      .catch(() => {});
  }, []);

  useEffect(() => { if (showLog) refreshLog(); }, [showLog, refreshLog]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pendingAction]);

  async function send(text) {
    const userText = (text ?? input).trim();
    if (!userText || loading || approving || !hasKey || pendingAction) return;
    setInput('');

    const next = [...messages, { role: 'user', content: userText }];
    setMessages(next);
    setLoading(true);

    try {
      const apiMessages = next.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res  = await fetch('/api/ghl/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();

      if (data.type === 'pending_action') {
        if (data.message) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
        }
        setPendingAction(data);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message || data.error || 'Something went wrong.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error -- please try again.' }]);
    }
    setLoading(false);
  }

  async function approve() {
    if (!pendingAction) return;
    setApproving(true);
    try {
      const res  = await fetch('/api/ghl/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pendingAction.action, preview: pendingAction.preview }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || 'Done.' }]);
      setPendingAction(null);
      refreshLog();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Execution failed -- please try again.' }]);
    }
    setApproving(false);
  }

  function cancel() {
    setMessages(prev => [...prev, { role: 'assistant', content: 'Understood -- change cancelled. What else can I help with?' }]);
    setPendingAction(null);
  }

  async function undo(entryId) {
    setUndoingId(entryId);
    try {
      const res = await fetch(`/api/ghl/undo/${entryId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Change undone successfully.' }]);
        refreshLog();
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: `Undo failed (status ${data.status}).` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Undo failed -- connection error.' }]);
    }
    setUndoingId(null);
  }

  const isBlocked = loading || approving || !!pendingAction;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 116px)' }}>
      {/* Header */}
      <div className="mb-4 flex-shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>GHL Agent</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            Talk to your GoHighLevel account -- all changes require your approval before executing
          </p>
        </div>
        <button
          onClick={() => setShowLog(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs flex-shrink-0"
          style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)', backgroundColor: 'transparent' }}
        >
          <Clock size={11} />
          Change Log
          {showLog ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>

      {hasKey === false && (
        <div className="mb-4 px-4 py-2.5 rounded text-xs flex-shrink-0"
          style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#eab308' }}>
          GHL_API_KEY is not set. Add it to your Railway environment variables to enable this agent.
        </div>
      )}

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={isBlocked || !hasKey}
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{
              backgroundColor: 'var(--c-subtle-5)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-dim)',
              cursor: isBlocked || !hasKey ? 'not-allowed' : 'pointer',
              opacity: !hasKey ? 0.5 : 1,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Message thread */}
      <div
        className="flex-1 overflow-y-auto rounded-lg border p-4 space-y-3 min-h-0"
        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}
      >
        {messages.map((m, i) => <Message key={i} role={m.role} content={m.content} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Approval card */}
      {pendingAction && (
        <div className="mt-3 flex-shrink-0">
          <ApprovalCard
            pending={pendingAction}
            onApprove={approve}
            onCancel={cancel}
            loading={approving}
          />
        </div>
      )}

      {/* Input bar */}
      <div className="flex gap-2 mt-3 flex-shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          disabled={isBlocked || !hasKey}
          placeholder={
            pendingAction ? 'Approve or cancel the proposed change above first' :
            hasKey === false ? 'Configure GHL_API_KEY in Railway to start' :
            'Ask anything about your GHL account... (Enter to send)'
          }
          className="flex-1 px-4 py-3 rounded-lg text-sm resize-none"
          style={{
            backgroundColor: 'var(--c-subtle-5)',
            border: '1px solid var(--c-border)',
            color: 'var(--c-text-primary)',
            outline: 'none',
            lineHeight: '1.5',
            maxHeight: '120px',
          }}
        />
        <button
          onClick={() => send()}
          disabled={isBlocked || !input.trim() || !hasKey}
          className="px-4 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: isBlocked || !input.trim() || !hasKey ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
            color: '#fff',
            cursor: isBlocked || !input.trim() || !hasKey ? 'not-allowed' : 'pointer',
            minWidth: '48px',
          }}
        >
          <Send size={15} />
        </button>
      </div>

      {/* Changelog panel */}
      {showLog && (
        <div
          className="flex-shrink-0 mt-3 rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--c-border)' }}
          >
            <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
              Change Log
            </p>
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{changelog.length} entries</span>
          </div>
          <ChangelogPanel entries={changelog} undoingId={undoingId} onUndo={undo} onRefresh={refreshLog} />
        </div>
      )}
    </div>
  );
}
