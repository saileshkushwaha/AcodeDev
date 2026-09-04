import { GitHubClient } from '@acode/core';

export function makeClient(token: string): GitHubClient {
  return new GitHubClient({ token });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString();
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function trimSha(sha: string): string {
  return sha.slice(0, 7);
}

export function splitRef(fullName: string): { owner: string; name: string } {
  const [owner, name] = fullName.split('/');
  return { owner, name };
}

/** Minimal GitHub-flavoured markdown renderer (links, bold, code, headings, lists, newlines). */
export function renderMd(md: string | null | undefined): React.ReactNode {
  if (!md) return null;
  // We intentionally return rendered content with basic transforms
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] | null = null;

  const flushList = () => {
    if (list) {
      out.push(
        <ul key={`ul-${out.length}`} style={{ margin: '4px 0', paddingLeft: 20 }}>
          {list.map((li, i) => (
            <li key={i} style={{ margin: '2px 0' }}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = null;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t === '') {
      flushList();
      continue;
    }
    const hd = t.match(/^(#{1,4})\s+(.*)/);
    if (hd) {
      flushList();
      const level = hd[1].length;
      const size = level === 1 ? 20 : level === 2 ? 17 : 15;
      out.push(<div key={`h${out.length}`} style={{ fontWeight: 700, fontSize: size, margin: '8px 0 4px', lineHeight: 1.3 }}>{inline(hd[2])}</div>);
      continue;
    }
    if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!list) list = [];
      list.push(t.slice(2));
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      if (!list) list = [];
      list.push(t.replace(/^\d+\.\s/, ''));
      continue;
    }
    if (t.startsWith('```')) {
      flushList();
      out.push(<pre key={`pre${out.length}`} style={{ background: 'var(--code-bg)', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12, margin: '6px 0' }}>{md}</pre>);
      return out.length ? out : null;
    }
    flushList();
    out.push(<div key={`p${out.length}`} style={{ margin: '4px 0', lineHeight: 1.6 }}>{inline(t)}</div>);
  }
  flushList();
  return out.length ? out : null;
}

function inline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  let plain = '';
  const pushPlain = () => {
    if (plain) nodes.push(<span key={`p${key++}`}>{plain}</span>);
  };
  while ((m = regex.exec(text)) !== null) {
    pushPlain();
    plain = '';
    if (m[1]) nodes.push(<code key={`c${key++}`} style={{ background: 'var(--code-bg)', padding: '1px 5px', borderRadius: 4, fontSize: '0.9em' }}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) nodes.push(<strong key={`s${key++}`}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) {
      const inner = m[3];
      const label = inner.slice(1, inner.indexOf(']('));
      const href = inner.slice(inner.indexOf('](') + 2, -1);
      nodes.push(<a key={`a${key++}`} href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>{label}</a>);
    }
    last = regex.lastIndex;
  }
  plain += text.slice(last);
  pushPlain();
  return nodes;
}
