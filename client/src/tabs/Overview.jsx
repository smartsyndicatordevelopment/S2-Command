import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Message, TypingIndicator, ApprovalCard, SessionSidebar } from '../components/AgentChat';

const GREETING = "Hi Brandon. I'm your business analyst -- connected live to Stripe, Digits, Facebook Ads, GHL, and Make. Ask me anything about MRR, revenue, expenses, ad performance, your pipeline, or automations. I pull live data before answering.";

const QUICK_PROMPTS = [
  'What is my MRR and ARR right now?',
  'How much YTD revenue have I collected?',
  'Show my P&L for this year',
  'What are my top expenses this quarter?',
  'How are my Facebook ads performing?',
  'Show my GHL pipeline',
  'Who are my most recent signups?',
  "What's my churn looking like?",
];

export default function Overview() {
  const subs = useApi('/api/subscriptions');
  const rev  = useApi('/api/revenue');

  // Live context for the analyst -- always computed so the request body is populated
  const mrr               = subs.data?.mrr || 0;
  const uniqueClients     = subs.data?.uniqueClients || 0;
  const subscriptionCount = subs.data?.subscriptions?.length || 0;
  const ytdRevenue        = rev.data?.ytdRevenue || 0;

  const [messages, setMessages]           = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [approving, setApproving]         = useState(false);
  const [sessions, setSessions]           = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionsLoading, setSessionsLoading]   = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { loadSessions(); }, []);

  async function loadSessions() {
    try {
      const res  = await fetch('/api/sessions/overview', { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data)) setSessions(data);
    } catch { /* ignore */ }
  }

  async function newSession() {
    setSessionsLoading(true);
    try {
      const res = await fetch('/api/sessions/overview', {
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
      const res  = await fetch(`/api/sessions/overview/${id}/messages`, { credentials: 'include' });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        setMessages(data.map(m => ({ role: m.role, content: m.content })));
      }
    } catch { /* ignore */ }
  }

  async function renameSession(id, name) {
    try {
      const res     = await fetch(`/api/sessions/overview/${id}`, {
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
      await fetch(`/api/sessions/overview/${id}`, { method: 'DELETE', credentials: 'include' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([{ role: 'assistant', content: GREETING }]);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, pendingAction]);

  async function send(text) {
    const userText = (text ?? input).trim();
    if (!userText || loading || approving || pendingAction) return;
    setInput('');

    if (!currentSessionId) {
      const autoName = userText.length > 42 ? userText.slice(0, 42).trimEnd() + '...' : userText;
      try {
        const sr = await fetch('/api/sessions/overview', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: autoName }),
        });
        const ns = await sr.json();
        setSessions(prev => [ns, ...prev]);
        setCurrentSessionId(ns.id);
      } catch { /* continue without session */ }
    }

    // history = conversation so far minus the client-only greeting; backend appends the new message
    const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    try {
      const res  = await fetch('/api/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          history,
          context: { mrr, uniqueClients, subscriptionCount, ytdRevenue },
        }),
      });
      const data = await res.json();

      if (data.type === 'pending_action') {
        if (data.message) setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
        setPendingAction(data);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || 'Something went wrong.' }]);
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
      const res  = await fetch('/api/chat/execute', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: pendingAction.action }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || data.error || 'Done.' }]);
      setPendingAction(null);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Execution failed -- please try again.' }]);
    }
    setApproving(false);
  }

  function cancel() {
    setMessages(prev => [...prev, { role: 'assistant', content: 'Understood -- action cancelled. What else can I help with?' }]);
    setPendingAction(null);
  }

  const isBlocked = loading || approving || !!pendingAction;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 116px)' }}>
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Overview</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
          Ask your business analyst anything -- live data across Stripe, Digits, Facebook Ads, GHL, and Make
        </p>
      </div>

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
                disabled={isBlocked}
                className="text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: 'var(--c-subtle-5)',
                  border: '1px solid var(--c-border)',
                  color: 'var(--c-dim)',
                  cursor: isBlocked ? 'not-allowed' : 'pointer',
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
              disabled={isBlocked}
              placeholder={
                pendingAction ? 'Approve or cancel the proposed change above first' :
                'Ask about MRR, revenue, expenses, ads, pipeline... (Enter to send)'
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
              disabled={isBlocked || !input.trim()}
              className="px-4 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: isBlocked || !input.trim() ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
                color: '#fff',
                cursor: isBlocked || !input.trim() ? 'not-allowed' : 'pointer',
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
