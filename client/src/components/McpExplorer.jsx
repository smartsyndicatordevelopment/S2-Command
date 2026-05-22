import { useState, useEffect } from 'react';
import { Key, Play, CheckCircle, AlertTriangle } from 'lucide-react';
import Card from './ui/Card';

function methodBadge(method) {
  const styles = {
    GET:    { bg: 'rgba(34,197,94,0.12)',  color: '#22c55e' },
    POST:   { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
    PUT:    { bg: 'rgba(234,179,8,0.12)',  color: '#eab308' },
    PATCH:  { bg: 'rgba(249,115,22,0.12)', color: '#f97316' },
    DELETE: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444' },
  };
  return styles[method] || { bg: 'rgba(156,163,175,0.12)', color: '#9ca3af' };
}

export default function McpExplorer({
  title,
  subtitle,
  configRoute,
  proxyRoute,
  apiKeyLabel = 'API Key',
  apiKeyPlaceholder = '',
  configFields = [],
  categories = [],
}) {
  const [hasKey, setHasKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState(null);
  const [extraValues, setExtraValues] = useState({});

  const [selectedCatId, setSelectedCatId] = useState(categories[0]?.id || null);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [pathParams, setPathParams] = useState({});
  const [queryParams, setQueryParams] = useState({});
  const [bodyText, setBodyText] = useState('');
  const [response, setResponse] = useState(null);
  const [running, setRunning] = useState(false);

  const selectedCat = categories.find(c => c.id === selectedCatId);

  useEffect(() => {
    fetch(configRoute, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setHasKey(data.hasKey || false);
        setKeyPreview(data.keyPreview || null);
        setExtraValues(Object.fromEntries(configFields.map(f => [f.key, data[f.key] || ''])));
      })
      .catch(() => {});
  }, [configRoute]);

  useEffect(() => {
    if (!selectedEndpoint) return;
    const newQuery = {};
    for (const p of (selectedEndpoint.queryParams || [])) {
      const firstExtra = configFields[0];
      newQuery[p.name] = (firstExtra && p.name === firstExtra.key) ? extraValues[firstExtra.key] : '';
    }
    setQueryParams(newQuery);
    setPathParams({});
    setBodyText(selectedEndpoint.bodyExample || '');
    setResponse(null);
  }, [selectedEndpoint?.id]);

  async function runRequest() {
    if (!selectedEndpoint) return;
    setRunning(true);
    setResponse(null);
    try {
      let body;
      if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && bodyText.trim()) {
        try { body = JSON.parse(bodyText); } catch { body = bodyText; }
      }
      const res = await fetch(proxyRoute, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: selectedEndpoint.method,
          endpoint: selectedEndpoint.endpoint,
          pathParams,
          queryParams,
          body,
        }),
      });
      setResponse(await res.json());
    } catch (err) {
      setResponse({ error: err.message });
    }
    setRunning(false);
  }

  const inputStyle = { backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', outline: 'none' };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--c-text-primary)' }}>{title}</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-muted)' }}>{subtitle}</p>
      </div>

      {/* Config status */}
      <Card>
        <div className="flex items-center gap-3">
          <Key size={13} style={{ color: '#5c3ff4' }} />
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
            API Configuration
          </p>
          <div className="ml-auto flex items-center gap-4">
            {configFields.map(f => extraValues[f.key] && (
              <span key={f.key} className="text-xs font-mono" style={{ color: 'var(--c-muted)' }}>
                {f.label}: <span style={{ color: 'var(--c-dim)' }}>{extraValues[f.key]}</span>
              </span>
            ))}
            {hasKey ? (
              <span
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e' }}
              >
                <CheckCircle size={11} />
                {apiKeyLabel} configured {keyPreview}
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#eab308' }}
              >
                <AlertTriangle size={11} />
                API key not set -- add to Railway environment variables
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Explorer */}
      <div
        className="rounded border overflow-hidden flex"
        style={{ borderColor: 'var(--c-border)', height: 'calc(100vh - 350px)', minHeight: '520px' }}
      >
        {/* Categories */}
        <div
          className="flex-shrink-0 overflow-y-auto flex flex-col"
          style={{ width: '196px', borderRight: '1px solid var(--c-border)', backgroundColor: 'var(--c-card)' }}
        >
          <div className="px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
              Categories
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCatId(cat.id); setSelectedEndpoint(null); setResponse(null); }}
                className="w-full text-left px-3 py-2 flex items-center justify-between transition-colors"
                style={{
                  backgroundColor: selectedCatId === cat.id ? 'rgba(92,63,244,0.1)' : 'transparent',
                  color: selectedCatId === cat.id ? '#5c3ff4' : 'var(--c-muted)',
                  borderBottom: '1px solid var(--c-border)',
                  borderLeft: selectedCatId === cat.id ? '2px solid #5c3ff4' : '2px solid transparent',
                }}
              >
                <span className="text-xs font-medium truncate pr-1">{cat.label}</span>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--c-muted)', opacity: 0.6, fontSize: '10px' }}>
                  {cat.endpoints.length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint list */}
        <div
          className="flex-shrink-0 flex flex-col"
          style={{ width: '268px', borderRight: '1px solid var(--c-border)', backgroundColor: 'var(--c-bg)' }}
        >
          <div className="px-3 py-2.5 border-b flex-shrink-0" style={{ borderColor: 'var(--c-border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--c-dim)' }}>
              {selectedCat?.label || 'Endpoints'}
              <span className="ml-2 font-normal" style={{ color: 'var(--c-muted)', fontSize: '10px' }}>
                {selectedCat?.endpoints.length || 0} endpoints
              </span>
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {selectedCat?.endpoints.map(ep => {
              const mb = methodBadge(ep.method);
              const isSel = selectedEndpoint?.id === ep.id;
              return (
                <button
                  key={ep.id}
                  onClick={() => setSelectedEndpoint(ep)}
                  className="w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors"
                  style={{
                    backgroundColor: isSel ? 'rgba(92,63,244,0.07)' : 'transparent',
                    borderBottom: '1px solid var(--c-border)',
                    borderLeft: isSel ? '2px solid #5c3ff4' : '2px solid transparent',
                  }}
                >
                  <span
                    className="flex-shrink-0 mt-px font-bold"
                    style={{
                      backgroundColor: mb.bg,
                      color: mb.color,
                      borderRadius: '3px',
                      padding: '1px 4px',
                      fontSize: '9px',
                      letterSpacing: '0.04em',
                      lineHeight: '1.6',
                    }}
                  >
                    {ep.method}
                  </span>
                  <span
                    className="text-xs leading-snug"
                    style={{ color: isSel ? 'var(--c-text-primary)' : 'var(--c-dim)' }}
                  >
                    {ep.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Request builder */}
        <div className="flex-1 flex flex-col min-w-0" style={{ backgroundColor: 'var(--c-card)' }}>
          {!selectedEndpoint ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs" style={{ color: 'var(--c-muted)' }}>
                Select an endpoint to configure and test
              </p>
            </div>
          ) : (
            <>
              {/* Endpoint header bar */}
              <div
                className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
                style={{ borderBottom: '1px solid var(--c-border)' }}
              >
                {(() => {
                  const mb = methodBadge(selectedEndpoint.method);
                  return (
                    <span
                      className="flex-shrink-0 font-bold"
                      style={{ backgroundColor: mb.bg, color: mb.color, borderRadius: '4px', padding: '2px 7px', fontSize: '10px', letterSpacing: '0.04em' }}
                    >
                      {selectedEndpoint.method}
                    </span>
                  );
                })()}
                <code className="text-xs font-mono min-w-0 truncate" style={{ color: 'var(--c-dim)' }}>
                  {selectedEndpoint.endpoint}
                </code>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <p className="text-xs leading-relaxed" style={{ color: 'var(--c-muted)' }}>
                  {selectedEndpoint.description}
                </p>

                {/* Path params */}
                {selectedEndpoint.pathParams?.length > 0 && (
                  <section className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
                      Path Parameters
                    </p>
                    {selectedEndpoint.pathParams.map(p => (
                      <div key={p.name}>
                        <label className="flex items-baseline gap-1 text-xs mb-1" style={{ color: 'var(--c-dim)' }}>
                          <span className="font-mono">{p.name}</span>
                          {p.required && <span style={{ color: '#ef4444' }}>*</span>}
                          <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>{p.description}</span>
                        </label>
                        <input
                          value={pathParams[p.name] || ''}
                          onChange={e => setPathParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                          placeholder={p.name}
                          className="w-full px-3 py-1.5 rounded text-xs font-mono"
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </section>
                )}

                {/* Query params */}
                {selectedEndpoint.queryParams?.length > 0 && (
                  <section className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
                      Query Parameters
                    </p>
                    {selectedEndpoint.queryParams.map(p => (
                      <div key={p.name}>
                        <label className="flex items-baseline gap-1 text-xs mb-1" style={{ color: 'var(--c-dim)' }}>
                          <span className="font-mono">{p.name}</span>
                          {p.required && <span style={{ color: '#ef4444' }}>*</span>}
                          <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>{p.description}</span>
                        </label>
                        <input
                          value={queryParams[p.name] || ''}
                          onChange={e => setQueryParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                          placeholder={p.name}
                          className="w-full px-3 py-1.5 rounded text-xs font-mono"
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </section>
                )}

                {/* Request body */}
                {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && (
                  <section className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
                      Request Body (JSON)
                    </p>
                    <textarea
                      value={bodyText}
                      onChange={e => setBodyText(e.target.value)}
                      rows={10}
                      className="w-full px-3 py-2 rounded text-xs font-mono resize-y"
                      style={{ ...inputStyle, lineHeight: '1.65' }}
                      placeholder="{}"
                      spellCheck={false}
                    />
                  </section>
                )}

                {/* Send button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={runRequest}
                    disabled={running || !hasKey}
                    className="flex items-center gap-2 px-4 py-2 rounded text-xs font-medium"
                    style={{
                      backgroundColor: running || !hasKey ? 'rgba(92,63,244,0.35)' : '#5c3ff4',
                      color: '#fff',
                      cursor: running || !hasKey ? 'not-allowed' : 'pointer',
                    }}
                    title={!hasKey ? 'Save an API key first' : undefined}
                  >
                    {running
                      ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      : <Play size={11} />
                    }
                    {running ? 'Running...' : 'Send Request'}
                  </button>
                  {!hasKey && (
                    <span className="text-xs" style={{ color: '#eab308' }}>
                      Save an API key above to send requests
                    </span>
                  )}
                </div>

                {/* Response */}
                {response && (
                  <section className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>
                        Response
                      </p>
                      {response.status != null && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-mono"
                          style={{
                            backgroundColor: response.status < 300 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: response.status < 300 ? '#22c55e' : '#ef4444',
                          }}
                        >
                          {response.status}
                        </span>
                      )}
                      {response.error && (
                        <span className="text-xs" style={{ color: '#ef4444' }}>{response.error}</span>
                      )}
                      {response.url && (
                        <span className="text-xs font-mono truncate ml-auto" style={{ color: 'var(--c-muted)', maxWidth: '280px' }}>
                          {response.url}
                        </span>
                      )}
                    </div>
                    <pre
                      className="text-xs font-mono overflow-auto rounded p-3"
                      style={{
                        backgroundColor: 'var(--c-subtle-5)',
                        border: '1px solid var(--c-border)',
                        color: 'var(--c-dim)',
                        maxHeight: '320px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: '1.6',
                      }}
                    >
                      {JSON.stringify(response.data ?? response, null, 2)}
                    </pre>
                  </section>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
