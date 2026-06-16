import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { Message, TypingIndicator, SessionSidebar } from '../components/AgentChat';

const GREETING = "Hi! I'm connected to your Digits ledger. Ask me about your P&L, expenses, revenue, transactions, vendors, and financial statements. I read live data from Digits -- this agent is read-only.";

const QUICK_PROMPTS = [
  'Show my P&L for this year',
  'What are my top expenses this quarter?',
  'How does this month compare to last month?',
  'Show my balance sheet',
  'What are my biggest software subscriptions?',
  'Break down my revenue by category',
  'Show cash flow this quarter',
  'Who are my largest vendors?',
];

export default function DigitsAgent() {
  const [messages, setMessages]           = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [connected, setConnected]         = useState(null);
  const [sessions, setSessions]           = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionsLoading, setSessionsLoading]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch('/api/digits/chat-status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setConnected(d.connected && !d.tokenExpired))
      .catch(() => setConnected(false));

    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res  = await fetch('/api/sessions/digits', { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch { /* ignore */ }
  }

  async function newSession() {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/sessions/digits', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Chat' }),
      });
      const s = await res.json();
      setSessions(prev => [s, ...prev]);
      setCurrentSessionId(s.id);
      setMessages([{ role: 'assistant', content: GREETING }]);
    } catch { /* ignore */ }
    setSessionsLoading(false);
  }

  async function selectSession(id) {
    if (id === currentSessionId) return;
    setCurrentSessionId(id);
    setMessages([{ role: 'assistant', content: GREETING }]);
    try {
      const res  = await fetch(`/api/sessions/digits/${id}/messages`, { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        setMessages(data.map(m => ({ role: m.role, content: m.content })));
      }
    } catch { /* ignore */ }
  }

  async function renameSession(id, name) {
    try {
      const res     = await fetch(`/api/sessions/digits/${id}`, {
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
      await fetch(`/api/sessions/digits/${id}`, { method: 'DELETE', credentials: 'include' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([{ role: 'assistant', content: GREETING }]);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const userText = (text ?? input).trim();
    if (!userText || loading || !connected) return;
    setInput('');

    let sessionId = currentSessionId;
    if (!sessionId) {
      const autoName = userText.length > 42 ? userText.slice(0, 42).trimEnd() + '...' : userText;
      try {
        const sr = await fetch('/api/sessions/digits', {
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
      const res  = await fetch('/api/digits/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, sessionId: sessionId || undefined }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || data.error || 'Something went wrong.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error -- please try again.' }]);
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 116px)' }}>
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Digits Agent</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
          Ask about your financials in plain English -- live, read-only data from Digits
        </p>
      </div>

      {connected === false && (
        <div className="mb-4 px-4 py-2.5 rounded text-xs flex-shrink-0 flex items-center justify-between gap-3"
          style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#eab308' }}>
          <span>Digits is not connected or the token has expired.</span>
          <a href="/auth/digits" target="_blank" rel="noreferrer"
            className="underline whitespace-nowrap" style={{ color: '#eab308' }}>
            Connect Digits
          </a>
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
                disabled={loading || !connected}
                className="text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: 'var(--c-subtle-5)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-dim)',
                  cursor: loading || !connected ? 'not-allowed' : 'pointer',
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

          <div className="flex gap-2 mt-3 flex-shrink-0">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              disabled={loading || !connected}
              placeholder={
                connected === false ? 'Connect Digits to start' :
                'Ask about P&L, expenses, revenue, vendors... (Enter to send)'
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
              disabled={loading || !input.trim() || !connected}
              className="px-4 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: loading || !input.trim() || !connected ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
                color: '#fff',
                cursor: loading || !input.trim() || !connected ? 'not-allowed' : 'pointer',
                minWidth: '48px',
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
