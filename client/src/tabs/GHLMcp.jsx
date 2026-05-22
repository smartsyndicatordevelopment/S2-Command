import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';

const GREETING = "Hi! I'm connected to your GoHighLevel account. Ask me anything -- I can look up contacts, check your pipeline, read conversations, list email templates, show blog posts, review appointments, and much more. I can also create and update records for you.";

const QUICK_PROMPTS = [
  'Show me my most recent contacts',
  'What opportunities are in my pipeline?',
  'List my active email templates',
  'What appointments are scheduled this week?',
  'Show me my recent conversations',
  'What workflows do I have active?',
  'List my blog posts',
  "Show me recent form submissions",
];

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
          {[0, 150, 300].map(delay => (
            <span
              key={delay}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: 'var(--c-muted)', animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export default function GHLMcp() {
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    fetch('/api/ghl/config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setHasKey(!!d.hasKey))
      .catch(() => setHasKey(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const userText = (text ?? input).trim();
    if (!userText || loading || !hasKey) return;
    setInput('');

    const next = [...messages, { role: 'user', content: userText }];
    setMessages(next);
    setLoading(true);

    try {
      // Skip the greeting when sending history to the API
      const apiMessages = next.slice(1).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/ghl/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message || data.error || 'Something went wrong.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error -- please try again.' }]);
    }
    setLoading(false);
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 116px)' }}>
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>GHL Assistant</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
          Talk to your GoHighLevel account in plain English -- contacts, pipeline, emails, social, blogs, and more
        </p>
      </div>

      {/* Key not configured warning */}
      {hasKey === false && (
        <div
          className="mb-4 px-4 py-2.5 rounded text-xs flex-shrink-0"
          style={{ backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', color: '#eab308' }}
        >
          GHL_API_KEY is not set. Add it to your Railway environment variables to enable this assistant.
        </div>
      )}

      {/* Quick prompt chips */}
      <div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={loading || !hasKey}
            className="text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{
              backgroundColor: 'var(--c-subtle-5)',
              border: '1px solid var(--c-border)',
              color: 'var(--c-dim)',
              cursor: loading || !hasKey ? 'not-allowed' : 'pointer',
              opacity: !hasKey ? 0.5 : 1,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Message thread */}
      <div
        className="flex-1 overflow-y-auto rounded-lg border p-4 space-y-3 mb-3"
        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}
      >
        {messages.map((m, i) => <Message key={i} role={m.role} content={m.content} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-2 flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          disabled={loading || !hasKey}
          placeholder={
            hasKey === false
              ? 'Configure GHL_API_KEY in Railway to start'
              : 'Ask anything about your GHL account... (Enter to send, Shift+Enter for new line)'
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
          disabled={loading || !input.trim() || !hasKey}
          className="px-4 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: loading || !input.trim() || !hasKey ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
            color: '#fff',
            cursor: loading || !input.trim() || !hasKey ? 'not-allowed' : 'pointer',
            minWidth: '48px',
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
