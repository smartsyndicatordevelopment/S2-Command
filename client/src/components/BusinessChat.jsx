import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Plus, Send, Trash2, Bot, User, Loader } from 'lucide-react';

const STORAGE_KEY = 's2-command-chats';
const MAX_CHATS   = 30;

// -- localStorage helpers --

function loadChats() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function persistChats(chats) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats.slice(0, MAX_CHATS)));
}

function newChatObj(firstMessage = '') {
  return {
    id: crypto.randomUUID(),
    title: firstMessage ? firstMessage.slice(0, 55) : 'New conversation',
    createdAt: Date.now(),
    messages: [],
  };
}

function relTime(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// -- Markdown-lite renderer (bold, inline code, line breaks) --
function renderContent(text) {
  const parts = [];
  // Split by triple-backtick code blocks first
  const codeBlockRe = /```[\s\S]*?```/g;
  let last = 0;
  let match;
  while ((match = codeBlockRe.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) });
    parts.push({ type: 'code', content: match[0].replace(/^```\w*\n?/, '').replace(/```$/, '') });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });

  return parts.map((part, i) => {
    if (part.type === 'code') {
      return (
        <pre key={i} className="my-2 p-3 rounded text-xs overflow-x-auto" style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: '#e4e4e4' }}>
          {part.content}
        </pre>
      );
    }
    // Inline rendering: bold (**text**), inline code (`text`), line breaks
    const lines = part.content.split('\n');
    return (
      <span key={i}>
        {lines.map((line, li) => {
          const segments = [];
          const inlineRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
          let lLast = 0;
          let m;
          while ((m = inlineRe.exec(line)) !== null) {
            if (m.index > lLast) segments.push(<span key={lLast}>{line.slice(lLast, m.index)}</span>);
            if (m[0].startsWith('**')) {
              segments.push(<strong key={m.index} className="text-white font-semibold">{m[0].slice(2, -2)}</strong>);
            } else {
              segments.push(<code key={m.index} className="px-1 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: '#c084fc' }}>{m[0].slice(1, -1)}</code>);
            }
            lLast = m.index + m[0].length;
          }
          if (lLast < line.length) segments.push(<span key={lLast}>{line.slice(lLast)}</span>);
          return (
            <span key={li}>
              {segments}
              {li < lines.length - 1 && <br />}
            </span>
          );
        })}
      </span>
    );
  });
}

// -- Main component --

export default function BusinessChat({ context, style = {} }) {
  const [chats, setChats]           = useState(() => loadChats());
  const [activeChatId, setActiveChatId] = useState(() => loadChats()[0]?.id || null);
  const [input, setInput]           = useState('');
  const [sending, setSending]       = useState(false);
  const [error, setError]           = useState(null);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const textareaRef = useRef(null);

  const activeChat = chats.find(c => c.id === activeChatId) || null;
  const messages   = activeChat?.messages || [];

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const updateChats = useCallback((updated) => {
    setChats(updated);
    persistChats(updated);
  }, []);

  const startNewChat = useCallback(() => {
    const chat = newChatObj();
    const updated = [chat, ...chats];
    updateChats(updated);
    setActiveChatId(chat.id);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [chats, updateChats]);

  const deleteChat = useCallback((id, e) => {
    e.stopPropagation();
    const updated = chats.filter(c => c.id !== id);
    updateChats(updated);
    if (activeChatId === id) setActiveChatId(updated[0]?.id || null);
  }, [chats, activeChatId, updateChats]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setError(null);

    // Ensure there's an active chat
    let chatId = activeChatId;
    let base   = chats;

    if (!chatId || !base.find(c => c.id === chatId)) {
      const chat = newChatObj(text);
      base = [chat, ...chats];
      chatId = chat.id;
      setActiveChatId(chatId);
    }

    const userMsg = { role: 'user', content: text };

    // Append user message and set title on first message
    const withUser = base.map(c => {
      if (c.id !== chatId) return c;
      return {
        ...c,
        title: c.messages.length === 0 ? text.slice(0, 55) : c.title,
        messages: [...c.messages, userMsg],
      };
    });
    updateChats(withUser);

    try {
      const currentChat = withUser.find(c => c.id === chatId);
      // history = all messages except the one we just added (backend appends it)
      const history = currentChat.messages.slice(0, -1);

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text, history, context }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      const assistantMsg = { role: 'assistant', content: data.reply };
      const withReply = withUser.map(c => {
        if (c.id !== chatId) return c;
        return { ...c, messages: [...c.messages, assistantMsg] };
      });
      updateChats(withReply);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, sending, activeChatId, chats, context, updateChats]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Auto-resize textarea
  const handleInput = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <div className="rounded-lg border overflow-hidden flex" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)', height: '480px', ...style }}>

      {/* Sidebar -- saved chats */}
      <div className="flex flex-col border-r" style={{ width: '220px', borderColor: 'var(--c-border)', flexShrink: 0 }}>
        <div className="flex items-center justify-between px-3 py-3 border-b" style={{ borderColor: 'var(--c-border)' }}>
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: '#6b7280' }}>Chats</span>
          <button
            onClick={startNewChat}
            title="New chat"
            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
            style={{ color: '#6b7280' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(92,63,244,0.15)'; e.currentTarget.style.color = '#5c3ff4'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="text-xs p-3" style={{ color: '#6b7280' }}>No saved chats yet.</p>
          ) : (
            chats.map(chat => {
              const isActive = chat.id === activeChatId;
              return (
                <div
                  key={chat.id}
                  onClick={() => { setActiveChatId(chat.id); setError(null); }}
                  className="group flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors relative"
                  style={{ backgroundColor: isActive ? 'rgba(92,63,244,0.12)' : 'transparent' }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <MessageSquare size={12} className="mt-0.5 flex-shrink-0" style={{ color: isActive ? '#5c3ff4' : '#6b7280' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate leading-tight" style={{ color: isActive ? '#fff' : '#9ca3af' }}>
                      {chat.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#4b5563' }}>{relTime(chat.createdAt)}</p>
                  </div>
                  <button
                    onClick={(e) => deleteChat(chat.id, e)}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                    style={{ color: '#6b7280' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--c-border)' }}>
          <Bot size={14} style={{ color: '#5c3ff4' }} />
          <span className="text-xs font-medium" style={{ color: '#9ca3af' }}>
            {activeChat ? activeChat.title : 'Business Analyst'}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#4b5563' }}>
              <Bot size={28} />
              <p className="text-xs text-center">
                Ask anything about your business -- MRR, clients,<br />revenue trends, or who to follow up with.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
                style={{ backgroundColor: msg.role === 'user' ? 'rgba(92,63,244,0.2)' : 'rgba(255,255,255,0.06)' }}
              >
                {msg.role === 'user'
                  ? <User size={11} style={{ color: '#5c3ff4' }} />
                  : <Bot  size={11} style={{ color: '#9ca3af' }} />}
              </div>
              <div
                className="max-w-[80%] px-3 py-2 rounded-lg text-xs leading-relaxed"
                style={
                  msg.role === 'user'
                    ? { backgroundColor: 'rgba(92,63,244,0.15)', color: '#e4e4e4' }
                    : { backgroundColor: 'rgba(255,255,255,0.04)', color: '#d1d5db', border: '0.5px solid #2a2a3a' }
                }
              >
                {renderContent(msg.content)}
              </div>
            </div>
          ))}

          {/* Thinking indicator */}
          {sending && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <Bot size={11} style={{ color: '#9ca3af' }} />
              </div>
              <div className="px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '0.5px solid #2a2a3a' }}>
                <Loader size={12} className="animate-spin" style={{ color: '#6b7280' }} />
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs px-2" style={{ color: '#ef4444' }}>Error: {error}</p>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-4 pb-4 pt-2">
          <div className="flex items-end gap-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-subtle)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              placeholder="Ask about MRR, clients, revenue, churn..."
              rows={1}
              disabled={sending}
              className="flex-1 bg-transparent text-xs resize-none outline-none leading-relaxed"
              style={{ color: '#e4e4e4', minHeight: '20px', maxHeight: '120px', caretColor: '#5c3ff4' }}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="flex-shrink-0 w-7 h-7 rounded flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ backgroundColor: input.trim() && !sending ? '#5c3ff4' : 'transparent' }}
            >
              <Send size={12} style={{ color: input.trim() && !sending ? '#fff' : '#6b7280' }} />
            </button>
          </div>
          <p className="text-xs mt-1.5" style={{ color: '#374151' }}>Enter to send &nbsp;·&nbsp; Shift+Enter for new line</p>
        </div>
      </div>
    </div>
  );
}
