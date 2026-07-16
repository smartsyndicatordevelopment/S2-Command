import { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, X, ImagePlus } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { Message, TypingIndicator, ApprovalCard, SessionSidebar } from '../components/AgentChat';

// Image attachments -- kept in sync with the server caps in server/routes/chat.js.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
let attachmentSeq = 0;

const GREETING = "Hi Brandon. I'm your business analyst -- connected live to Stripe, Digits, Facebook Ads, GHL, Make, and ClickUp. Ask me anything about MRR, revenue, expenses, ad performance, your pipeline, automations, or tasks. I pull live data before answering.";

const QUICK_PROMPTS = [
  'What is my MRR and ARR right now?',
  'How much YTD revenue have I collected?',
  'Show my P&L for this year',
  'What are my top expenses this quarter?',
  'How are my Facebook ads performing?',
  'Show my GHL pipeline',
  'How many overdue ClickUp tasks do I have?',
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
  const [attachments, setAttachments]           = useState([]);
  const [dragActive, setDragActive]             = useState(false);
  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);
  const dragDepth  = useRef(0);

  useEffect(() => { loadSessions(); }, []);

  // -- Image attachments (paste, drop, or click-to-browse) --

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => ALLOWED_IMAGE_TYPES.includes(f.type));
    if (!files.length) return;
    setAttachments(prev => {
      let next = prev;
      for (const file of files) {
        if (next.length >= MAX_IMAGES) break;
        if (file.size > MAX_IMAGE_BYTES) continue;
        const id = ++attachmentSeq;
        const reader = new FileReader();
        reader.onload = () => setAttachments(cur =>
          cur.some(a => a.id === id)
            ? cur.map(a => (a.id === id ? { ...a, dataUrl: reader.result } : a))
            : cur
        );
        reader.readAsDataURL(file);
        next = [...next, { id, dataUrl: null, mediaType: file.type, name: file.name }];
      }
      return next;
    });
  }

  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgs = [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length) { e.preventDefault(); addFiles(imgs); }
  }

  function onDragEnter(e) {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer?.types?.includes('Files')) setDragActive(true);
  }
  function onDragOver(e) { e.preventDefault(); }
  function onDragLeave(e) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) { dragDepth.current = 0; setDragActive(false); }
  }
  function onDrop(e) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (isBlocked) return;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  }

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
    // Only images that finished reading (have a dataUrl) can be sent.
    const ready = attachments.filter(a => a.dataUrl);
    if ((!userText && ready.length === 0) || loading || approving || pendingAction) return;
    setInput('');
    setAttachments([]);

    const imagesPayload = ready.map(a => ({
      media_type: a.mediaType,
      data: a.dataUrl.split(',')[1] || '',
    }));
    const imageUrls = ready.map(a => a.dataUrl);

    // Capture the session id locally -- setCurrentSessionId is async, so we can't
    // rely on currentSessionId being updated in time for the request body below.
    let sessionId = currentSessionId;
    if (!sessionId) {
      const nameBase = userText || (imageUrls.length > 1 ? `${imageUrls.length} images` : 'Image');
      const autoName = nameBase.length > 42 ? nameBase.slice(0, 42).trimEnd() + '...' : nameBase;
      try {
        const sr = await fetch('/api/sessions/overview', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: autoName }),
        });
        const ns = await sr.json();
        setSessions(prev => [ns, ...prev]);
        setCurrentSessionId(ns.id);
        sessionId = ns.id;
      } catch { /* continue without session */ }
    }

    // history = conversation so far minus the client-only greeting; backend appends the new message
    const history = messages.slice(1).map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { role: 'user', content: userText, images: imageUrls }]);
    setLoading(true);

    try {
      const res  = await fetch('/api/chat', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          images: imagesPayload,
          history,
          context: { mrr, uniqueClients, subscriptionCount, ytdRevenue },
          sessionId,
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
        body: JSON.stringify({
          action: pendingAction.action,
          sessionId: currentSessionId,
          preview: pendingAction.preview,
        }),
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
  const canSend   = !isBlocked && (!!input.trim() || attachments.some(a => a.dataUrl));

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 116px)' }}>
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>Overview Agent</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>
          Ask your business analyst anything -- live data across Stripe, Digits, Facebook Ads, GHL, Make, and ClickUp
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

        <div
          className="flex flex-col flex-1 min-w-0 min-h-0 pl-4 pt-3"
          style={{ position: 'relative' }}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {dragActive && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg pointer-events-none"
              style={{
                backgroundColor: 'rgba(92,63,244,0.08)',
                border: '2px dashed #5c3ff4',
                margin: '0 0 0 1rem',
              }}
            >
              <div className="flex items-center gap-2 text-sm font-medium" style={{ color: '#5c3ff4' }}>
                <ImagePlus size={18} /> Drop image to attach
              </div>
            </div>
          )}
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
            {messages.map((m, i) => <Message key={i} role={m.role} content={m.content} images={m.images} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {pendingAction && (
            <div className="mt-3 flex-shrink-0">
              <ApprovalCard pending={pendingAction} onApprove={approve} onCancel={cancel} loading={approving} />
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 flex-shrink-0">
              {attachments.map(a => (
                <div
                  key={a.id}
                  className="relative rounded-lg overflow-hidden"
                  style={{ width: '64px', height: '64px', border: '1px solid var(--c-border)', backgroundColor: 'var(--c-subtle-5)' }}
                >
                  {a.dataUrl
                    ? <img src={a.dataUrl} alt={a.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <span className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--c-muted)', borderTopColor: 'transparent' }} />
                      </div>}
                  <button
                    onClick={() => removeAttachment(a.id)}
                    title="Remove"
                    className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full"
                    style={{ width: '16px', height: '16px', backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-3 flex-shrink-0">
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              multiple
              className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isBlocked || attachments.length >= MAX_IMAGES}
              title={attachments.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images` : 'Attach image'}
              className="px-3 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'var(--c-subtle-5)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-dim)',
                cursor: isBlocked || attachments.length >= MAX_IMAGES ? 'not-allowed' : 'pointer',
              }}
            >
              <Paperclip size={15} />
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={onPaste}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              disabled={isBlocked}
              placeholder={
                pendingAction ? 'Approve or cancel the proposed change above first' :
                'Ask anything -- paste or drop an image too... (Enter to send)'
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
              disabled={!canSend}
              className="px-4 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: canSend ? '#5c3ff4' : 'rgba(92,63,244,0.35)',
                color: '#fff',
                cursor: canSend ? 'pointer' : 'not-allowed',
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
