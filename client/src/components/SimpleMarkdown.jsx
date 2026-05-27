// Renders a subset of markdown: headers, bullets, numbered lists, bold, italic, hr, tables, line breaks
// No external dependency -- written to match the app's CSS variable theme

export default function SimpleMarkdown({ content, className = '' }) {
  if (!content) return null;

  function renderInline(text) {
    const parts = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      const boldIdx   = remaining.indexOf('**');
      const italicIdx = remaining.indexOf('*');
      const codeIdx   = remaining.indexOf('`');

      if (codeIdx !== -1 && remaining.indexOf('`', codeIdx + 1) !== -1) {
        const end = remaining.indexOf('`', codeIdx + 1);
        if (codeIdx > 0) parts.push(<span key={key++}>{remaining.slice(0, codeIdx)}</span>);
        parts.push(
          <code key={key++} style={{ fontSize: '11px', fontFamily: 'monospace', backgroundColor: 'var(--c-subtle-5)', padding: '1px 5px', borderRadius: '3px', color: 'var(--c-text-primary)' }}>
            {remaining.slice(codeIdx + 1, end)}
          </code>
        );
        remaining = remaining.slice(end + 1);
      } else if (boldIdx !== -1 && remaining.indexOf('**', boldIdx + 2) !== -1) {
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

  // Parse pipe-delimited table cells from a line
  function parseTableRow(line) {
    return line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());
  }

  function isTableRow(line) {
    return line.trim().startsWith('|') && line.trim().endsWith('|');
  }

  function isSeparatorRow(line) {
    return isTableRow(line) && /^\|[\s|:-]+\|$/.test(line.trim());
  }

  // Detect if a cell value looks numeric (dollar, percent, number, ratio)
  function isNumericCell(val) {
    return /^[\$\-]?[\d,]+(\.\d+)?[x%]?$/.test(val.trim()) || /^\d+(\.\d+)?x$/.test(val.trim());
  }

  function renderTable(rows, key) {
    if (rows.length === 0) return null;
    const headers  = parseTableRow(rows[0]);
    const dataRows = rows.slice(1).filter(r => !isSeparatorRow(r));

    // Determine alignment per column based on first data row
    const firstData = dataRows.length > 0 ? parseTableRow(dataRows[0]) : [];
    const isNumCol  = headers.map((_, ci) => isNumericCell(firstData[ci] || ''));

    return (
      <div key={key} style={{ overflowX: 'auto', margin: '10px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
              {headers.map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '5px 12px 7px',
                    textAlign: isNumCol[i] ? 'right' : 'left',
                    fontWeight: 500,
                    fontSize: '10px',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: 'var(--c-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, ri) => {
              const cells = parseTableRow(row);
              const isLast = ri === dataRows.length - 1;
              return (
                <tr key={ri}>
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '7px 12px',
                        textAlign: isNumCol[ci] ? 'right' : 'left',
                        color: ci === 0 ? 'var(--c-text-primary)' : 'var(--c-dim)',
                        fontWeight: ci === 0 ? 500 : 400,
                        fontFamily: isNumCol[ci] ? 'monospace' : 'inherit',
                        fontSize: isNumCol[ci] ? '11px' : '12px',
                        borderBottom: isLast ? 'none' : '1px solid var(--c-border)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const lines  = content.split('\n');
  const output = [];
  let bullets    = [];
  let numbered   = [];
  let tableRows  = [];
  let k = 0;

  function flushBullets() {
    if (!bullets.length) return;
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

  function flushNumbered() {
    if (!numbered.length) return;
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

  function flushTable() {
    if (!tableRows.length) return;
    output.push(renderTable(tableRows, k++));
    tableRows = [];
  }

  function flush() { flushBullets(); flushNumbered(); flushTable(); }

  for (const line of lines) {
    // Table rows -- buffer until a non-table line breaks the block
    if (isTableRow(line)) {
      flushBullets();
      flushNumbered();
      tableRows.push(line);
      continue;
    } else {
      flushTable();
    }

    const h1     = line.match(/^# (.+)/);
    const h2     = line.match(/^## (.+)/);
    const h3     = line.match(/^### (.+)/);
    const bullet = line.match(/^[-*] (.+)/);
    const num    = line.match(/^\d+\. (.+)/);
    const hr     = line.match(/^-{3,}$/) || line.match(/^\*{3,}$/);
    const empty  = line.trim() === '';

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
      flushTable();
      bullets.push(bullet[1]);
    } else if (num) {
      flushBullets();
      flushTable();
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
