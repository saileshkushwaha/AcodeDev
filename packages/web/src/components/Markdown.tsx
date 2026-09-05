import React, { useState } from 'react';
import { useTheme } from '@acode/ui';

function inline(text: string, renderKey: () => number, tokens: ReturnType<typeof useTheme>['tokens']): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let plain = '';
  const flush = () => {
    if (plain) nodes.push(<span key={renderKey()}>{plain}</span>);
    plain = '';
  };
  while ((m = regex.exec(text)) !== null) {
    flush();
    if (m[1]) nodes.push(<code key={renderKey()} style={{ background: tokens.codeBg, color: tokens.info, padding: '1px 5px', borderRadius: 4, fontSize: '0.92em' }}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) nodes.push(<strong key={renderKey()}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) nodes.push(<em key={renderKey()}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) nodes.push(<a key={renderKey()} href={m[6]} target="_blank" rel="noreferrer" style={{ color: tokens.primary }}>{m[5]}</a>);
    last = regex.lastIndex;
  }
  plain += text.slice(last);
  flush();
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const { tokens } = useTheme();
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ position: 'relative', margin: `${tokens.space2}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${tokens.space1}px ${tokens.space2}px`, background: tokens.bg, borderTopLeftRadius: tokens.radiusSm, borderTopRightRadius: tokens.radiusSm, border: `1px solid ${tokens.border}`, borderBottom: 'none', fontFamily: tokens.fontMono, fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
        <span>{lang || 'code'}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
          style={{ background: 'transparent', border: 'none', color: copied ? tokens.success : tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeXs, fontWeight: 600 }}
        >
          {copied ? '✓ Copied' : '⧉ Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: tokens.space3, background: tokens.codeBg, border: `1px solid ${tokens.border}`, borderBottomLeftRadius: tokens.radiusSm, borderBottomRightRadius: tokens.radiusSm, overflow: 'auto', fontSize: 12.5, lineHeight: 1.6, maxHeight: 480 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Lightweight markdown renderer for chat assistant messages: supports
 * fenced code blocks with copy, inline code, bold/italic, links, headings,
 * lists and paragraphs — no external deps.
 */
export function Markdown({ content }: { content: string }) {
  const { tokens } = useTheme();
  const lines = content.split('\n');
  const out: React.ReactNode[] = [];
  let key = 0;
  const nk = () => key++;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // Fenced code block
    const fenceMatch = line.match(/^```([\w+-]*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(<CodeBlock key={nk()} code={buf.join('\n')} lang={lang} />);
      continue;
    }

    if (t === '') {
      i++;
      continue;
    }

    if (t.startsWith('---') || t.startsWith('***')) {
      i++;
      continue;
    }

    const h = t.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const size = h[1].length === 1 ? 18 : h[1].length === 2 ? 16 : 14.5;
      out.push(<div key={nk()} style={{ fontWeight: 700, fontSize: size, margin: '10px 0 4px', lineHeight: 1.3 }}>{inline(h[2], nk, tokens)}</div>);
      i++;
      continue;
    }

    if (t.startsWith('- ') || t.startsWith('* ') || /^\d+\.\s/.test(t)) {
      const list: string[] = [];
      while (i < lines.length && (/^- /.test(lines[i].trim()) || /^\d+\.\s/.test(lines[i].trim()))) {
        const li = lines[i].trim();
        list.push(li.replace(/^(\d+\.\s|- |\* )/, ''));
        i++;
      }
      out.push(
        <ul key={nk()} style={{ margin: '4px 0', paddingLeft: 22, lineHeight: 1.6 }}>
          {list.map((li, idx) => <li key={idx}>{inline(li, nk, tokens)}</li>)}
        </ul>,
      );
      continue;
    }

    if (t.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        buf.push(lines[i].trim().slice(2));
        i++;
      }
      out.push(
        <div key={nk()} style={{ borderLeft: `3px solid ${tokens.primary}`, background: tokens.bgSubtle, padding: `${tokens.space1}px ${tokens.space3}px`, margin: `${tokens.space1}px 0`, color: tokens.textSecondary, fontStyle: 'italic' }}>
          {buf.map((b, idx) => <div key={idx}>{inline(b, nk, tokens)}</div>)}
        </div>,
      );
      continue;
    }

    // Regular paragraph — group consecutive non-empty non-fence lines
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,4})\s/.test(lines[i]) &&
      !/^(- |\* |\d+\. )/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('> ')) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      out.push(
        <p key={nk()} style={{ margin: '4px 0', lineHeight: 1.7 }}>
          {para.map((p, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <br />}
              {inline(p, nk, tokens)}
            </React.Fragment>
          ))}
        </p>,
      );
    }
  }

  return <div style={{ wordBreak: 'break-word' }}>{out}</div>;
}
