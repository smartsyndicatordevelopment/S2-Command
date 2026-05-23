import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Message, TypingIndicator, ApprovalCard, ChangelogPanel } from '../components/AgentChat';

const GREETING = "Hi! I'm connected to your Facebook Ads account. Ask me about campaigns, ad sets, spend, performance, audiences, and more. I can also create and update records -- all changes require your approval before executing.";

const QUICK_PROMPTS = [
  'Show my active campaigns',
  'What did I spend this week?',
  'List my ad sets and budgets',
  'Show campaign performance this month',
  'What ads are running right now?',
  'Show my top performing ads',
  'What is my cost per lead this month?',
  'List my custom audiences',
];

export default function FBAds() {
  const [messages, setMessages]           = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput]                 = useState('');
  const [loading, setLoading]             = useState(false);
  const [hasKey, setHasKey]               = useState(null);
  const [accountId, setAccountId]         = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [approving, setApproving]         = useState(false);
  const [showLog, setShowLog]             = useState(false);
  const [changelog, setChangelog]         = useState([]);
  const [undoingId, setUndoingId]         = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch('/api/fb/config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setHasKey(!!(d.hasToken && d.hasAccountId));
        setAccountId(d.accountId || '');
      })
      .catch(() => setHasKey(false));
  }, []);

  const refreshLog = useCallback(() => {
    fetch('/api/fb/changelog', { credentials: 'include' })
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
      const res  = await fetch('/api/fb/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
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
      const res  = await fetch('/api/fb/execute', {
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
      const res  = await fetch(`/api/fb/undo/${entryId}`, { method: 'POST', credentials: 'include' });
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
          <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Facebook Ads Agent</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
            {accountId
              ? `Account ${accountId} -- all changes require your approval before executing`
              : 'Manage your Facebook ad campaigns in plain English -- all changes require approval'}
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
          FB_ACCESS_TOKEN and FB_AD_ACCOUNT_ID are required. Add them to your Railway environment variables to enable this agent.
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
          <ApprovalCard pending={pendingAction} onApprove={approve} onCancel={cancel} loading={approving} />
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
            hasKey === false ? 'Configure FB_ACCESS_TOKEN and FB_AD_ACCOUNT_ID in Railway to start' :
            'Ask about campaigns, spend, performance, audiences... (Enter to send)'
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
            <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>Change Log</p>
            <span className="text-xs" style={{ color: 'var(--c-muted)' }}>{changelog.length} entries</span>
          </div>
          <ChangelogPanel entries={changelog} undoingId={undoingId} onUndo={undo} />
        </div>
      )}
    </div>
  );
}
