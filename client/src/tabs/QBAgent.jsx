import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Message, TypingIndicator, ApprovalCard, ChangelogPanel, SessionSidebar } from '../components/AgentChat';

const GREETING = "Hi! I'm connected to your QuickBooks account. Ask me about your financials, invoices, customers, expenses, and more. I can also create and update records -- all changes require your approval before executing.";

const QUICK_PROMPTS = [
  'Show my P&L for this year',
  'List open invoices',
  'What are my top expenses this quarter?',
  'Show my balance sheet',
  'Who owes me money?',
  'Show cash flow this month',
  'List my customers',
  'What bills are due soon?',
];

export default function QBAgent() {
  const [messages, setMessages]           = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [connected, setConnected]         = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [approving, setApproving]         = useState(false);
  const [showLog, setShowLog]             = useState(false);
  const [changelog, setChangelog]         = useState([]);
  const [undoingId, setUndoingId]         = useState(null);
  const [sessions, setSessions]           = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionsLoading, setSessionsLoading]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch('/api/qb/chat-status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setConnected(d.connected && !d.tokenExpired))
      .catch(() => setConnected(false));

    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res  = await fetch('/api/sessions/qb', { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch { /* ignore */ }
  }

  async function newSession() {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/sessions/qb', {
        method: 'POST', credentials: 'include',
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
      const res  = await fetch(`/api/sessions/qb/${id}/messages`, { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        setMessages(data.map(m => ({ role: m.role, content: m.content })));
      }
    } catch { /* ignore */ }
  }

  async function renameSession(id, name) {
    try {
      const res     = await fetch(`/api/sessions/qb/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const updated = await res.json();
      setSessions(prev => prev.map(s => s.id === id ? { ...s, name: updated.name } : s));
    } catch { /* ignore */ }
  }

  async function deleteSession(id) {
    try {
      await fetch(`/api/sessions/qb/${id}`, { method: 'DELETE', credentials: 'include' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([{ role: 'assistant', content: GREETING }]);
      }
    } catch { /* ignore */ }
  }

  const refreshLog = useCallback(() => {
    fetch('/api/qb/changelog', { credentials: 'include' })
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
    if (!userText || loading || approving || !connected || pendingAction) return;
    setInput('');

    let sessionId = currentSessionId;
    if (!sessionId) {
      const autoName = userText.length > 42 ? userText.slice(0, 42).trimEnd() + '...' : userText;
      try {
        const sr = await fetch('/api/sessions/qb', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: autoName }),
        });
        const ns = await sr.json();
        sessionId = ns.id;
        setSessions(prev => [ns, ...prev]);
        setCurrentSessionId(ns.id);
      } catch { /* continue without session */ }
    }

    const next = [...messages, { role: 'user', content: userText }];
    setMessages(next);
    setLoading(true);

    try {
      const apiMessages = next.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res  = await fetch('/api/qb/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, sessionId: sessionId || undefined }),
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
      const res  = await fetch('/api/qb/execute', {
        method: 'POST', credentials: 'include',
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
      const res  = await fetch(`/api/qb/undo/${entryId}`, { method: 'POST', credentials: 'include' });
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
      <div className="mb-4 flex-shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>QuickBooks Agent</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            Manage your QuickBooks financials in plain English -- all changes require approval
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

      {connected === false && (
        <div className="mb-4 px-4 py-2.5 rounded text-xs flex-shrink-0"
          style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#eab308' }}>
          QuickBooks is not connected or the token has expired. Complete the OAuth flow to enable this agent.
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-0" style={{ borderTop: '1px solid var(--c-border)' }}>
        <SessionSidebar
          sessions={sessions}
          currentId={currentSessionId}
          onSelect={selectSession}
          onNew={newSession}
          onRename={renameSession}
          onDelete={deleteSession}
          loading={sessionsLoading}
        />

        <div className="flex flex-col flex-1 min-w-0 min-h-0 pl-4 pt-3">
          <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => send(p)}
                disabled={isBlocked || !connected}
                className="text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: 'var(--c-subtle-5)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-dim)',
                  cursor: isBlocked || !connected ? 'not-allowed' : 'pointer',
                  opacity: !connected ? 0.5 : 1,
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div
            className="flex-1 overflow-y-auto rounded-lg border p-4 space-y-3 min-h-0"
            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}
          >
            {messages.map((m, i) => <Message key={i} role={m.role} content={m.content} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {pendingAction && (
            <div className="mt-3 flex-shrink-0">
              <ApprovalCard pending={pendingAction} onApprove={approve} onCancel={cancel} loading={approving} />
            </div>
          )}

          <div className="flex gap-2 mt-3 flex-shrink-0">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              disabled={isBlocked || !connected}
              placeholder={
                pendingAction ? 'Approve or cancel the proposed change above first' :
                connected === false ? 'Connect QuickBooks via OAuth to start' :
                'Ask about invoices, P&L, customers, expenses... (Enter to send)'
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
              disabled={isBlocked || !input.trim() || !connected}
              className="px-4 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: isBlocked || !input.trim() || !connected ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
                color: '#fff',
                cursor: isBlocked || !input.trim() || !connected ? 'not-allowed' : 'pointer',
                minWidth: '48px',
              }}
            >
              <Send size={15} />
            </button>
          </div>

          {showLog && (
            <div
              className="flex-shrink-0 mt-3 rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--c-border)' }}
              >
                <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>Change Log</p>
                <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{changelog.length} entries</span>
              </div>
              <ChangelogPanel entries={changelog} undoingId={undoingId} onUndo={undo} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
