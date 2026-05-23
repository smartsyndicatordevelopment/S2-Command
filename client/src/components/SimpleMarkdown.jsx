// Renders a small subset of markdown: headers, bullets, bold, italic, hr, line breaks
// No external dependency -- written to match the app's CSS variable theme

export default function SimpleMarkdown({ content, className = '' }) {
  if (!content) return null;

  function renderInline(text) {
    // Split on **bold** and *italic* patterns
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldIdx  = remaining.indexOf('**');
      const italicIdx = remaining.indexOf('*');

      if (boldIdx !== -1 && remaining.indexOf('**', boldIdx + 2) !== -1) {
        const end = remaining.indexOf('**', boldIdx + 2);
        if (boldIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, boldIdx)}</span>);
        parts.push(<strong key={key++} style={{ fontWeight: 600, color: 'var(--c-text-primary)' }}>{remaining.slice(boldIdx + 2, end)}</strong>);
        remaining = remaining.slice(end + 2);
      } else if (italicIdx !== -1 && remaining.indexOf('*', italicIdx + 1) !== -1 && remaining[italicIdx + 1] !== '*') {
        const end = remaining.indexOf('*', italicIdx + 1);
        if (italicIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, italicIdx)}</span>);
        parts.push(<em key={key++}>{remaining.slice(italicIdx + 1, end)}</em>);
        remaining = remaining.slice(end + 1);
      } else {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }
    }
    return parts;
  }

  const lines = content.split('\n');
  const output = [];
  let bullets = [];
  let numbered = [];
  let k = 0;

  function flushBullets() {
    if (bullets.length) {
      output.push(
        <ul key={k++} style={{ margin: '4px 0 8px', paddingLeft: 0, listStyle: 'none' }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px', lineHeight: '1.65', fontSize: '13px', color: 'var(--c-text-primary)' }}>
              <span style={{ color: 'var(--c-muted)', flexShrink: 0, marginTop: '1px' }}>•</span>
              <span>{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  }

  function flushNumbered() {
    if (numbered.length) {
      output.push(
        <ol key={k++} style={{ margin: '4px 0 8px', paddingLeft: 0, listStyle: 'none' }}>
          {numbered.map((n, i) => (
            <li key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px', lineHeight: '1.65', fontSize: '13px', color: 'var(--c-text-primary)' }}>
              <span style={{ color: '#5c3ff4', flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: '16px', fontWeight: 600 }}>{i + 1}.</span>
              <span>{renderInline(n)}</span>
            </li>
          ))}
        </ol>
      );
      numbered = [];
    }
  }

  function flush() { flushBullets(); flushNumbered(); }

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const bullet = line.match(/^[-*] (.+)/);
    const num = line.match(/^\d+\. (.+)/);
    const hr = line.match(/^-{3,}$/) || line.match(/^\*{3,}$/);
    const empty = line.trim() === '';

    if (h1) {
      flush();
      output.push(<p key={k++} style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-text-primary)', margin: '12px 0 4px' }}>{renderInline(h1[1])}</p>);
    } else if (h2) {
      flush();
      output.push(<p key={k++} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-text-primary)', margin: '10px 0 4px' }}>{renderInline(h2[1])}</p>);
    } else if (h3) {
      flush();
      output.push(<p key={k++} style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)', margin: '10px 0 4px' }}>{renderInline(h3[1])}</p>);
    } else if (bullet) {
      flushNumbered();
      bullets.push(bullet[1]);
    } else if (num) {
      flushBullets();
      numbered.push(num[1]);
    } else if (hr) {
      flush();
      output.push(<hr key={k++} style={{ border: 'none', borderTop: '1px solid var(--c-border)', margin: '10px 0' }} />);
    } else if (empty) {
      flush();
      output.push(<div key={k++} style={{ height: '6px' }} />);
    } else {
      flush();
      output.push(<p key={k++} style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--c-text-primary)', margin: '2px 0' }}>{renderInline(line)}</p>);
    }
  }
  flush();

  return <div className={className}>{output}</div>;
}
