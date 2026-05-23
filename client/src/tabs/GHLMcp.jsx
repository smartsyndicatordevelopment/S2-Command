import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, CheckCircle, XCircle, Clock, RotateCcw, ChevronDown, ChevronUp,
  AlertTriangle, Mail, Wand2, ExternalLink, Trash2, ChevronRight, Plus, Pencil,
} from 'lucide-react';
import SimpleMarkdown from '../components/SimpleMarkdown';

// ─── Agent tab constants ───────────────────────────────────────────────────────

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

// ─── Shared helpers ────────────────────────────────────────────────────────────

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
    <span style={{ backgroundColor: s.bg, color: s.color, borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em' }}>
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

// ─── Agent tab components ──────────────────────────────────────────────────────

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

function ChangelogPanel({ entries, undoingId, onUndo }) {
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

// ─── Session sidebar ──────────────────────────────────────────────────────────

function SessionSidebar({ sessions, currentId, onSelect, onNew, onRename, onDelete, loading }) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  function startRename(e, session) {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameValue(session.name);
  }

  async function commitRename(id) {
    if (renameValue.trim()) await onRename(id, renameValue.trim());
    setRenamingId(null);
  }

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{ width: '200px', borderRight: '1px solid var(--c-border)', overflowY: 'auto' }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>Chats</span>
        <button
          onClick={onNew}
          disabled={loading}
          title="New chat"
          className="p-1 rounded"
          style={{ color: 'var(--c-muted)', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          <Plus size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <p className="text-xs px-3 py-4" style={{ color: 'var(--c-muted)' }}>No chats yet</p>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className="group flex items-center gap-1 px-3 py-2.5 cursor-pointer"
            style={{
              backgroundColor: s.id === currentId ? 'var(--c-subtle-5)' : 'transparent',
              borderBottom: '1px solid var(--c-border)',
              minHeight: '44px',
            }}
          >
            {renamingId === s.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(s.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename(s.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                onClick={e => e.stopPropagation()}
                className="flex-1 text-xs px-1 py-0.5 rounded"
                style={{
                  backgroundColor: 'var(--c-card)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-text-primary)',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
            ) : (
              <span className="flex-1 text-xs truncate" style={{ color: s.id === currentId ? 'var(--c-text-primary)' : 'var(--c-dim)' }}>
                {s.name}
              </span>
            )}
            {renamingId !== s.id && (
              <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => startRename(e, s)}
                  title="Rename"
                  className="p-0.5 rounded"
                  style={{ color: 'var(--c-muted)' }}
                >
                  <Pencil size={10} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                  title="Delete"
                  className="p-0.5 rounded"
                  style={{ color: 'var(--c-muted)' }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Email Studio components ───────────────────────────────────────────────────

function EmailCard({ email, onPush }) {
  const [expanded, setExpanded] = useState(false);
  const [pushOpen, setPushOpen]   = useState(false);
  const [pushName, setPushName]   = useState(email.subject);
  const [pushing, setPushing]     = useState(false);
  const [pushResult, setPushResult] = useState(null);

  async function handlePush() {
    setPushing(true);
    setPushResult(null);
    try {
      const res  = await fetch('/api/ghl/email-studio/push', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: pushName || email.subject, subject: email.subject, htmlBody: email.htmlBody }),
      });
      const data = await res.json();
      setPushResult(data.success ? 'success' : 'error');
      if (data.success) {
        setPushOpen(false);
        onPush && onPush(email.id);
      }
    } catch {
      setPushResult('error');
    }
    setPushing(false);
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
    >
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded text-xs font-bold"
          style={{
            width: '28px', height: '28px',
            backgroundColor: 'rgba(92,63,244,0.1)',
            color: '#5c3ff4',
          }}
        >
          {email.emailNumber}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--c-text-primary)' }}>
            {email.subject}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            {email.delayDays === 0 ? 'Send immediately' : `Day ${email.delayDays}`}
            {email.previewText && <span style={{ marginLeft: '8px', opacity: 0.7 }}>{email.previewText}</span>}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => { setPushOpen(o => !o); setPushResult(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
            style={{
              backgroundColor: pushResult === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(92,63,244,0.1)',
              color: pushResult === 'success' ? '#22c55e' : '#5c3ff4',
              border: `1px solid ${pushResult === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(92,63,244,0.25)'}`,
            }}
          >
            {pushResult === 'success' ? <CheckCircle size={11} /> : <ExternalLink size={11} />}
            {pushResult === 'success' ? 'Saved' : 'Push to GHL'}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs"
            style={{ color: 'var(--c-muted)', border: '1px solid var(--c-border)', backgroundColor: 'transparent' }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Push form */}
      {pushOpen && (
        <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--c-border)', paddingTop: '12px' }}>
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--c-muted)' }}>
            Save as Email Template in GHL
          </p>
          <div className="flex gap-2">
            <input
              value={pushName}
              onChange={e => setPushName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 px-3 py-2 rounded text-xs"
              style={{
                backgroundColor: 'var(--c-subtle-5)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={handlePush}
              disabled={pushing || !pushName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-xs font-semibold flex-shrink-0"
              style={{
                backgroundColor: pushing || !pushName.trim() ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
                color: '#fff',
                cursor: pushing || !pushName.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {pushing
                ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                : <ExternalLink size={11} />}
              Save
            </button>
          </div>
          {pushResult === 'error' && (
            <p className="text-xs mt-2" style={{ color: '#ef4444' }}>Push failed -- check your GHL API key and try again.</p>
          )}
        </div>
      )}

      {/* HTML preview */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--c-border)' }}>
          <iframe
            srcDoc={email.htmlBody}
            title={`Email ${email.emailNumber} preview`}
            style={{ width: '100%', height: '400px', border: 'none', display: 'block' }}
            sandbox="allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ history, onDelete }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!history.length) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-xs" style={{ color: 'var(--c-muted)' }}>No email sequences generated yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {history.map(entry => (
        <div
          key={entry.id}
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
            >
              <ChevronRight
                size={12}
                style={{
                  color: 'var(--c-muted)',
                  flexShrink: 0,
                  transform: expandedId === entry.id ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s',
                }}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--c-text-primary)' }}>
                  {entry.title || 'Email Sequence'}
                </p>
                <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  {entry.sequence?.length || 0} email{(entry.sequence?.length || 0) !== 1 ? 's' : ''} -- {timeAgo(entry.timestamp)}
                </p>
              </div>
            </button>
            <button
              onClick={() => onDelete(entry.id)}
              className="flex-shrink-0 p-1 rounded"
              style={{ color: 'var(--c-muted)', opacity: 0.6 }}
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {expandedId === entry.id && entry.sequence?.length > 0 && (
            <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid var(--c-border)', paddingTop: '12px' }}>
              <p className="text-xs italic mb-3" style={{ color: 'var(--c-muted)' }}>"{entry.prompt}"</p>
              {entry.sequence.map(email => (
                <EmailCard key={email.id || email.emailNumber} email={email} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function GHLMcp() {
  const [activeTab, setActiveTab] = useState('agent');
  const [hasKey, setHasKey]       = useState(null);
  const [stripeContext, setStripeContext] = useState('');

  // Session state
  const [sessions, setSessions]           = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionsLoading, setSessionsLoading]   = useState(false);

  // Agent state
  const [messages, setMessages]           = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [approving, setApproving]         = useState(false);
  const [showLog, setShowLog]             = useState(false);
  const [changelog, setChangelog]         = useState([]);
  const [undoingId, setUndoingId]         = useState(null);
  const bottomRef = useRef(null);

  // Email Studio state
  const [studioPrompt, setStudioPrompt]     = useState('');
  const [generating, setGenerating]         = useState(false);
  const [currentSequence, setCurrentSequence] = useState(null);
  const [showHistory, setShowHistory]       = useState(false);
  const [studioHistory, setStudioHistory]   = useState([]);
  const [generateError, setGenerateError]   = useState('');

  // ─── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/ghl/config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setHasKey(!!d.hasKey))
      .catch(() => setHasKey(false));

    fetch('/api/subscriptions', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const parts = [];
        const mrr = d?.mrr;
        const clients = d?.uniqueClients ?? d?.activeCount;
        if (mrr != null) parts.push(`MRR: $${(mrr / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
        if (clients != null) parts.push(`Active clients: ${clients}`);
        if (parts.length) setStripeContext(parts.join('. '));
      })
      .catch(() => {});

    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res  = await fetch('/api/sessions/ghl', { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch { /* ignore */ }
  }

  async function newSession() {
    setSessionsLoading(true);
    try {
      const res  = await fetch('/api/sessions/ghl', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Chat' }),
      });
      const s = await res.json();
      setSessions(prev => [s, ...prev]);
      setCurrentSessionId(s.id);
      setMessages([{ role: 'assistant', content: GREETING }]);
      setPendingAction(null);
    } catch { /* ignore */ }
    setSessionsLoading(false);
  }

  async function selectSession(id) {
    if (id === currentSessionId) return;
    setCurrentSessionId(id);
    setPendingAction(null);
    setMessages([{ role: 'assistant', content: GREETING }]);
    try {
      const res  = await fetch(`/api/sessions/ghl/${id}/messages`, { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        setMessages(data.map(m => ({ role: m.role, content: m.content })));
      }
    } catch { /* ignore */ }
  }

  async function renameSession(id, name) {
    try {
      const res  = await fetch(`/api/sessions/ghl/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const updated = await res.json();
      setSessions(prev => prev.map(s => s.id === id ? { ...s, name: updated.name } : s));
    } catch { /* ignore */ }
  }

  async function deleteSession(id) {
    try {
      await fetch(`/api/sessions/ghl/${id}`, { method: 'DELETE', credentials: 'include' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([{ role: 'assistant', content: GREETING }]);
      }
    } catch { /* ignore */ }
  }

  const refreshLog = useCallback(() => {
    fetch('/api/ghl/changelog', { credentials: 'include' })
      .then(r => r.json())
      .then(setChangelog)
      .catch(() => {});
  }, []);

  const refreshStudioHistory = useCallback(() => {
    fetch('/api/ghl/email-studio/history', { credentials: 'include' })
      .then(r => r.json())
      .then(setStudioHistory)
      .catch(() => {});
  }, []);

  useEffect(() => { if (showLog) refreshLog(); }, [showLog, refreshLog]);
  useEffect(() => { if (showHistory) refreshStudioHistory(); }, [showHistory, refreshStudioHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pendingAction]);

  // ─── Agent actions ─────────────────────────────────────────────────────────

  async function send(text) {
    const userText = (text ?? input).trim();
    if (!userText || loading || approving || !hasKey || pendingAction) return;
    setInput('');

    const next = [...messages, { role: 'user', content: userText }];
    setMessages(next);
    setLoading(true);

    try {
      const apiMessages = next.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ghl/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          context: stripeContext || undefined,
          sessionId: currentSessionId || undefined,
        }),
      });
      const data = await res.json();

      if (data.type === 'pending_action') {
        if (data.message) setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
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
      const res = await fetch('/api/ghl/execute', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: pendingAction.action,
          preview: pendingAction.preview,
          sessionId: currentSessionId || undefined,
        }),
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
      const res  = await fetch(`/api/ghl/undo/${entryId}`, { method: 'POST', credentials: 'include' });
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

  // ─── Email Studio actions ──────────────────────────────────────────────────

  async function generate() {
    if (!studioPrompt.trim() || generating) return;
    setGenerating(true);
    setGenerateError('');
    setCurrentSequence(null);

    const contextParts = [];
    if (stripeContext) contextParts.push(stripeContext);
    const context = contextParts.join('\n') || undefined;

    try {
      const res  = await fetch('/api/ghl/email-studio/write', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: studioPrompt, context }),
      });
      const data = await res.json();
      if (data.error) {
        setGenerateError(data.error);
      } else {
        setCurrentSequence(data);
        if (showHistory) refreshStudioHistory();
      }
    } catch {
      setGenerateError('Connection error -- please try again.');
    }
    setGenerating(false);
  }

  async function deleteHistoryEntry(id) {
    try {
      await fetch(`/api/ghl/email-studio/history/${id}`, { method: 'DELETE', credentials: 'include' });
      setStudioHistory(prev => prev.filter(e => e.id !== id));
    } catch { /* ignore */ }
  }

  const isBlocked = loading || approving || !!pendingAction;

  // ─── Tab bar ───────────────────────────────────────────────────────────────

  function TabButton({ id, icon: Icon, label }) {
    const active = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors"
        style={{
          borderBottom: active ? '2px solid #5c3ff4' : '2px solid transparent',
          color: active ? '#5c3ff4' : 'var(--c-muted)',
          backgroundColor: 'transparent',
          marginBottom: '-1px',
        }}
      >
        <Icon size={12} />
        {label}
      </button>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 116px)' }}>
      {/* Header */}
      <div className="mb-0 flex-shrink-0 flex items-start justify-between pb-0">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>GHL Agent</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            Talk to your GoHighLevel account -- all changes require your approval before executing
          </p>
        </div>
        {activeTab === 'agent' && (
          <button
            onClick={() => setShowLog(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs flex-shrink-0"
            style={{ border: '1px solid var(--c-border)', color: 'var(--c-muted)', backgroundColor: 'transparent' }}
          >
            <Clock size={11} />
            Change Log
            {showLog ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-0 mt-3 mb-4 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--c-border)' }}
      >
        <TabButton id="agent"  icon={Send}  label="Agent" />
        <TabButton id="studio" icon={Mail}  label="Email Studio" />
      </div>

      {hasKey === false && (
        <div className="mb-4 px-4 py-2.5 rounded text-xs flex-shrink-0"
          style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#eab308' }}>
          GHL_API_KEY is not set. Add it to your Railway environment variables to enable this agent.
        </div>
      )}

      {/* ── Agent tab ── */}
      {activeTab === 'agent' && (
        <div className="flex flex-1 min-h-0 gap-0" style={{ borderTop: '1px solid var(--c-border)' }}>
          {/* Session sidebar */}
          <SessionSidebar
            sessions={sessions}
            currentId={currentSessionId}
            onSelect={selectSession}
            onNew={newSession}
            onRename={renameSession}
            onDelete={deleteSession}
            loading={sessionsLoading}
          />

          {/* Main chat column */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 pl-4 pt-3">
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
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: '1px solid var(--c-border)' }}
                >
                  <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
                    Change Log
                  </p>
                  <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{changelog.length} entries</span>
                </div>
                <ChangelogPanel entries={changelog} undoingId={undoingId} onUndo={undo} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Email Studio tab ── */}
      {activeTab === 'studio' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Prompt area */}
          <div
            className="rounded-lg p-4 flex-shrink-0"
            style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={13} style={{ color: '#5c3ff4' }} />
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
                Generate Email Sequence
              </p>
            </div>

            {stripeContext && (
              <p className="text-xs mb-3 px-3 py-2 rounded" style={{ backgroundColor: 'var(--c-subtle-5)', color: 'var(--c-muted)' }}>
                Business context: {stripeContext}
              </p>
            )}

            <textarea
              value={studioPrompt}
              onChange={e => setStudioPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) generate(); }}
              rows={3}
              placeholder="Describe the email sequence to write... e.g. 'Write a 4-email welcome sequence for new investors. Emphasize how Smart Syndicator helps them raise capital efficiently and manage investor relations professionally.'"
              className="w-full px-4 py-3 rounded-lg text-sm resize-none"
              style={{
                backgroundColor: 'var(--c-subtle-5)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-text-primary)',
                outline: 'none',
                lineHeight: '1.6',
              }}
            />

            <div className="flex items-center justify-between mt-3">
              <p className="text-xs" style={{ color: 'var(--c-muted)' }}>Cmd+Enter to generate</p>
              <button
                onClick={generate}
                disabled={generating || !studioPrompt.trim() || !hasKey}
                className="flex items-center gap-2 px-5 py-2 rounded text-sm font-semibold"
                style={{
                  backgroundColor: generating || !studioPrompt.trim() || !hasKey ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
                  color: '#fff',
                  cursor: generating || !studioPrompt.trim() || !hasKey ? 'not-allowed' : 'pointer',
                }}
              >
                {generating
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Wand2 size={13} />}
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>

            {generateError && (
              <p className="text-xs mt-3" style={{ color: '#ef4444' }}>{generateError}</p>
            )}
          </div>

          {/* Current sequence results */}
          {currentSequence && (
            <div className="flex-shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: 'var(--c-text-primary)' }}>
                  {currentSequence.title}
                </p>
                <span className="text-xs" style={{ color: 'var(--c-muted)' }}>
                  {currentSequence.sequence.length} email{currentSequence.sequence.length !== 1 ? 's' : ''}
                </span>
              </div>
              {currentSequence.sequence.map(email => (
                <EmailCard key={email.id || email.emailNumber} email={email} />
              ))}
            </div>
          )}

          {/* History section */}
          <div className="flex-shrink-0">
            <button
              onClick={() => setShowHistory(h => !h)}
              className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-xs font-medium text-left"
              style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)', color: 'var(--c-muted)' }}
            >
              <Clock size={12} />
              Past Sequences
              {showHistory ? <ChevronUp size={12} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={12} style={{ marginLeft: 'auto' }} />}
            </button>

            {showHistory && (
              <div className="mt-2">
                <HistoryPanel history={studioHistory} onDelete={deleteHistoryEntry} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
