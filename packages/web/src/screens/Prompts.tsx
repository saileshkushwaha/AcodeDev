import React, { useState, useMemo, useCallback } from 'react';import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Badge, Select, Modal, TabBar, useTheme, useIsMobile } from '@acode/ui';
import {
  PROMPT_CATEGORIES,
  extractVariables,
  renderPrompt,
  estimateTokens,
  estimatePromptTokens,
  listModels,
  PROVIDER_LIST,
  type PromptRecord,
  type PromptVersion,
  type PromptCategory,
} from '@acode/core';
import { Markdown } from '../components/Markdown';

// re-export nothing; Chip is used via the ui package in some places below

export function PromptsScreen({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { prompts, evals } = useApp();
  const [, force] = useState(0);
  const refresh = useCallback(() => force((x) => x + 1), []);
  const [tab, setTab] = useState('prompts');
  const isMobile = useIsMobile();

  // Editor (create / edit) state
  const [editor, setEditor] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const all = prompts.all();

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Prompts"
        subtitle="Production-grade prompt library — system prompts, templates and evals, versioned and observable."
        actions={
          <Button onClick={() => setEditor({ open: true, id: null })}>+ New Prompt</Button>
        }
      />
      <TabBar
        tabs={[
          { id: 'prompts', label: `Prompts (${all.length})` },
          { id: 'evals', label: 'Evals' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'prompts' ? (
        <PromptsWorkspace
          onEdit={(p) => setEditor({ open: true, id: p.id })}
          onNavigate={onNavigate}
          refresh={refresh}
          isMobile={isMobile}
        />
      ) : (
        <EvalPanel />
      )}

      {editor.open && (
        <EditorModal
          id={editor.id}
          onClose={() => setEditor({ open: false, id: null })}
          refresh={refresh}
        />
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------- */
/* Workspace: sidebar + filterable results                              */
/* ------------------------------------------------------------------- */
function PromptsWorkspace({
  onEdit,
  onNavigate,
  refresh,
  isMobile,
}: {
  onEdit: (p: PromptRecord) => void;
  onNavigate?: (tab: string) => void;
  refresh: () => void;
  isMobile: boolean;
}) {
  const { prompts } = useApp();
  const { tokens } = useTheme();
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<'all' | 'favorites' | PromptCategory>('all');
  const [activeTag, setActiveTag] = useState('__all__');
  const [sort, setSort] = useState<'recent' | 'favorites' | 'popular' | 'tokens' | 'a-z'>('recent');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [useId, setUseId] = useState<string | null>(null);

  const all = prompts.all();
  const allTags = prompts.allTags();

  const filtered = useMemo(() => {
    let list = [...all];
    if (activeCat === 'favorites') list = list.filter((p) => p.favorite);
    else if (activeCat !== 'all') list = list.filter((p) => p.category === activeCat);
    if (activeTag !== '__all__') list = list.filter((p) => p.tags?.includes(activeTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.tags ?? []).some((t) => t.toLowerCase().includes(q)) ||
          prompts.currentVersion(p.id)?.content.toLowerCase().includes(q),
      );
    }
    switch (sort) {
      case 'favorites': list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)); break;
      case 'popular': list.sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)); break;
      case 'tokens': list.sort((a, b) => estimatePromptTokens(a) - estimatePromptTokens(b)); break;
      case 'a-z': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'recent':
      default: list.sort((a, b) => (b.updatedAt - a.updatedAt)); break;
    }
    return list;
  }, [all, activeCat, activeTag, search, sort, prompts]);

  const stats = useMemo(() => {
    const used = all.reduce((n, p) => n + (p.uses ?? 0), 0);
    const tokens = all.reduce((n, p) => n + estimatePromptTokens(p), 0);
    return { total: all.length, categories: PROMPT_CATEGORIES.length, tags: allTags.length, used, tokens };
  }, [all, allTags]);

  const counts = useMemo(() => {
    const m = new Map<PromptCategory, number>();
    all.forEach((p) => p.category && m.set(p.category, (m.get(p.category) ?? 0) + 1));
    return m;
  }, [all]);

  const detailPrompt = detailId ? prompts.get(detailId) : undefined;
  const usePrompt = useId ? prompts.get(useId) : undefined;

  return (
    <div style={{ display: 'flex', gap: tokens.space4, alignItems: 'flex-start' }}>
      {/* Category sidebar */}
      <aside style={{ width: isMobile ? '100%' : 210, flexShrink: 0 }}>
        {isMobile ? (
          <div style={{ marginBottom: tokens.space3 }}>
            <Select
              value={activeCat}
              onChange={(v) => setActiveCat(v as typeof activeCat)}
              options={[
                { label: 'All categories', value: 'all' },
                { label: '★ Favorites', value: 'favorites' },
                ...PROMPT_CATEGORIES.map((c) => ({
                  label: `${c.icon} ${c.label} (${counts.get(c.id) ?? 0})`,
                  value: c.id,
                })),
              ]}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <CatButton icon="⊞" label="All prompts" count={all.length} active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
            <CatButton icon="★" label="Favorites" count={all.filter((p) => p.favorite).length} active={activeCat === 'favorites'} onClick={() => setActiveCat('favorites')} />
            <div style={{ height: tokens.space2 }} />
            {PROMPT_CATEGORIES.map((c) => (
              <CatButton
                key={c.id}
                icon={c.icon}
                label={c.label}
                count={counts.get(c.id) ?? 0}
                active={activeCat === c.id}
                onClick={() => setActiveCat(c.id)}
                title={c.description}
              />
            ))}
          </div>
        )}

        {/* Stats card */}
        <Card style={{ marginTop: tokens.space3, padding: 0 }} padded={false}>
          <div style={{ padding: tokens.space3, display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
            <StatRow label="Prompts" value={String(stats.total)} />
            <StatRow label="Categories" value={String(stats.categories)} />
            <StatRow label="Tags" value={String(stats.tags)} />
            <StatRow label="Uses" value={String(stats.used)} />
            <StatRow label="Est. tokens" value={formatTokens(stats.tokens)} accent />
          </div>
        </Card>
      </aside>

      {/* Results */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center', marginBottom: tokens.space3, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <Input value={search} onChange={setSearch} placeholder="Search prompts, tags, content…" />
          </div>
          <div style={{ width: 160 }}>
            <Select
              value={sort}
              onChange={(v) => setSort(v as typeof sort)}
              options={[
                { label: 'Sort: Recent', value: 'recent' },
                { label: 'Favorites first', value: 'favorites' },
                { label: 'Most used', value: 'popular' },
                { label: 'Fewest tokens', value: 'tokens' },
                { label: 'A–Z', value: 'a-z' },
              ]}
            />
          </div>
        </div>

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: tokens.space1, flexWrap: 'wrap', marginBottom: tokens.space3 }}>
            <TagPill label="All" active={activeTag === '__all__'} onClick={() => setActiveTag('__all__')} />
            {allTags.map((t) => (
              <TagPill key={t} label={t} active={activeTag === t} onClick={() => setActiveTag(t === activeTag ? '__all__' : t)} />
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <Card>
            <div style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm, textAlign: 'center', padding: tokens.space4 }}>
              No prompts match your filters.
            </div>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: tokens.space3 }}>
            {filtered.map((p) => (
              <PromptCard
                key={p.id}
                prompt={p}
                onOpen={() => setDetailId(p.id)}
                onUse={() => setUseId(p.id)}
                onEdit={() => onEdit(p)}
                onToggleFav={() => { prompts.toggleFavorite(p.id); refresh(); }}
                onCopy={() => copyText(prompts.currentVersion(p.id)?.content ?? '')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail */}
      {detailPrompt && (
        <PromptDetailModal
          id={detailPrompt.id}
          onClose={() => setDetailId(null)}
          onUse={() => { setDetailId(null); setUseId(detailPrompt.id); }}
          refresh={refresh}
        />
      )}

      {/* Use in chat */}
      {usePrompt && (
        <UseInChatModal
          id={usePrompt.id}
          onClose={() => setUseId(null)}
          onNavigate={onNavigate}
          refresh={refresh}
        />
      )}
    </div>
  );
}

function catMeta(cat?: PromptCategory) {
  return PROMPT_CATEGORIES.find((c) => c.id === cat);
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

async function copyText(t: string) {
  try {
    await navigator.clipboard?.writeText(t);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------- */
/* Small building blocks                                               */
/* ------------------------------------------------------------------- */
function StatRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{label}</span>
      <span style={{ fontSize: tokens.fontSizeMd, fontWeight: 700, color: accent ? tokens.primary : tokens.text }}>{value}</span>
    </div>
  );
}

function CatButton({ icon, label, count, active, onClick, title }: { icon: string; label: string; count: number; active: boolean; onClick: () => void; title?: string }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space2,
        padding: `${tokens.space1 + 3}px ${tokens.space2}px`,
        borderRadius: tokens.radiusMd,
        border: 'none',
        background: active ? `${tokens.primary}1a` : 'transparent',
        color: active ? tokens.primary : tokens.textSecondary,
        cursor: 'pointer',
        fontFamily: tokens.fontSans,
        fontSize: tokens.fontSizeSm,
        fontWeight: active ? 600 : 500,
        textAlign: 'left',
      }}
    >
      <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{count}</span>
    </button>
  );
}

function TagPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: `${tokens.space1 - 1}px ${tokens.space2}px`,
        border: `1px solid ${active ? tokens.primary : tokens.borderStrong}`,
        borderRadius: tokens.radiusFull,
        background: active ? `${tokens.primary}1a` : tokens.surface,
        color: active ? tokens.primary : tokens.textSecondary,
        fontSize: tokens.fontSizeXs,
        fontWeight: 600,
        fontFamily: tokens.fontSans,
        cursor: 'pointer',
      }}
    >
      #{label}
    </button>
  );
}

/* ------------------------------------------------------------------- */
/* Prompt card                                                         */
/* ------------------------------------------------------------------- */
const PromptCard = React.memo(function PromptCard({
  prompt,
  onOpen,
  onUse,
  onEdit,
  onToggleFav,
  onCopy,
}: {
  prompt: PromptRecord;
  onOpen: () => void;
  onUse: () => void;
  onEdit: () => void;
  onToggleFav: () => void;
  onCopy: () => void;
}) {
  const { tokens } = useTheme();
  const meta = catMeta(prompt.category);
  const cur = prompt.versions.find((v) => v.version === prompt.currentVersion);
  const vars = extractVariables((prompt.systemPrompt ?? '') + (cur?.content ?? ''));
  const tokensEst = estimatePromptTokens(prompt);

  return (
    <Card
      style={{ display: 'flex', flexDirection: 'column', gap: 0, cursor: 'pointer' }}
      padded={false}
    >
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} style={{ padding: tokens.space3, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2 }}>
          <span style={{ fontSize: tokens.fontSizeMd }}>{meta?.icon ?? '📄'}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: tokens.fontSizeMd, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prompt.name}</span>
          <button
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleFav(); }}
            title={prompt.favorite ? 'Unfavorite' : 'Favorite'}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: prompt.favorite ? '#f59e0b' : tokens.textMuted, fontSize: 16 }}
          >
            {prompt.favorite ? '★' : '☆'}
          </button>
        </div>
        <div style={{ marginTop: tokens.space1, fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
          {meta?.label} · v{prompt.currentVersion}
          {prompt.builtin && <span style={{ marginLeft: 6 }}>· built-in</span>}
        </div>
        <div style={{ marginTop: tokens.space2, fontSize: tokens.fontSizeSm, color: tokens.textSecondary, lineHeight: 1.4, minHeight: 40 }}>
          {prompt.description ?? 'No description'}
        </div>

        <div style={{ marginTop: tokens.space2, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(prompt.tags ?? []).slice(0, 3).map((t) => <Badge key={t}>#{t}</Badge>)}
        </div>
      </div>
      <div style={{ padding: `${tokens.space2}px ${tokens.space3}px`, borderTop: `1px solid ${tokens.border}`, display: 'flex', alignItems: 'center', gap: tokens.space2 }}>
        <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
          {vars.length} var{vars.length === 1 ? '' : 's'} · ~{formatTokens(tokensEst)} tok · {prompt.uses ?? 0} uses
        </span>
        <div style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" onClick={onCopy}>⧉ Copy</Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>✎</Button>
        <Button size="sm" onClick={onUse}>Use in chat</Button>
      </div>
    </Card>
  );
});

/* ------------------------------------------------------------------- */
/* Highlighted prompt content with {{var}} emphasis                    */
/* ------------------------------------------------------------------- */
function HighlightedPrompt({ content }: { content: string }) {
  const { tokens } = useTheme();
  const parts = content.split(/(\{\{\s*[a-zA-Z0-9_.-]+\s*\}\})/g);
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: tokens.fontMono, fontSize: tokens.fontSizeSm, lineHeight: 1.5 }}>
      {parts.map((p, i) =>
        /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/.test(p) ? (
          <span key={i} style={{ background: `${tokens.primary}22`, color: tokens.primary, borderRadius: 4, padding: '0 3px' }}>{p}</span>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </pre>
  );
}

/* ------------------------------------------------------------------- */
/* Detail modal                                                        */
/* ------------------------------------------------------------------- */
function PromptDetailModal({ id, onClose, onUse, refresh }: { id: string; onClose: () => void; onUse: () => void; refresh: () => void }) {
  const { prompts } = useApp();
  const { tokens } = useTheme();
  const [tab, setTab] = useState<'prompt' | 'history'>('prompt');
  const p = prompts.get(id);
  if (!p) return null;
  const meta = catMeta(p.category);
  const cur = p.versions.find((v) => v.version === p.currentVersion);
  const vars = extractVariables((p.systemPrompt ?? '') + (cur?.content ?? ''));
  const copies = [p.systemPrompt, cur?.content].filter(Boolean).join('\n\n');

  return (
    <Modal open onClose={onClose} title={`${meta?.icon ?? ''} ${p.name}`} width={760}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.space1, marginBottom: tokens.space3 }}>
        {p.category && <Badge color={tokens.primary}>{meta?.label}</Badge>}
        <Badge>v{p.currentVersion}</Badge>
        {(p.tags ?? []).map((t) => <Badge key={t}>#{t}</Badge>)}
        <Badge>~{formatTokens(estimatePromptTokens(p))} tokens</Badge>
        <Badge>{p.uses ?? 0} uses</Badge>
      </div>
      {p.description && (
        <p style={{ margin: `0 0 ${tokens.space3}px`, color: tokens.textSecondary, fontSize: tokens.fontSizeSm }}>{p.description}</p>
      )}

      <TabBar
        tabs={[
          { id: 'prompt', label: 'Prompt' },
          { id: 'history', label: `History (${p.versions.length})` },
        ]}
        active={tab}
        onChange={(t) => setTab(t as 'prompt' | 'history')}
      />

      {tab === 'prompt' ? (
        <div style={{ marginTop: tokens.space3, display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
          {p.systemPrompt && (
            <div>
              <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: 4 }}>SYSTEM PROMPT</div>
              <div style={{ background: tokens.bgSubtle, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, padding: tokens.space3 }}>
                <HighlightedPrompt content={p.systemPrompt} />
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: 4 }}>PROMPT CONTENT</div>
            <div style={{ background: tokens.bgSubtle, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, padding: tokens.space3 }}>
              <HighlightedPrompt content={cur?.content ?? ''} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: tokens.space2, flexWrap: 'wrap' }}>
            <Button onClick={onUse}>Use in chat</Button>
            <Button variant="secondary" onClick={() => copyText(copies)}>Copy prompt</Button>
            {p.builtin ? (
              <Button variant="ghost" onClick={() => { if (confirm('Reset this prompt to its built-in definition? (creates a new version)')) { prompts.resetBuiltin(p.id); refresh(); } }}>Reset to built-in</Button>
            ) : null}
          </div>
        </div>
      ) : (
        <HistoryList prompt={p} refresh={refresh} />
      )}
    </Modal>
  );
}

function HistoryList({ prompt, refresh }: { prompt: PromptRecord; refresh: () => void }) {
  const { prompts } = useApp();
  const { tokens } = useTheme();
  const [active, setActive] = useState<number>(prompt.currentVersion);
  const v = prompt.versions.find((x) => x.version === active);
  return (
    <div style={{ display: 'flex', gap: tokens.space3, marginTop: tokens.space3 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
        {[...prompt.versions].sort((a, b) => b.version - a.version).map((ver) => (
          <button
            key={ver.version}
            onClick={() => setActive(ver.version)}
            style={{
              textAlign: 'left', padding: `${tokens.space1 + 2}px ${tokens.space2}px`, borderRadius: tokens.radiusSm,
              border: ver.version === active ? `1px solid ${tokens.primary}` : `1px solid ${tokens.border}`,
              background: ver.version === active ? `${tokens.primary}1a` : tokens.surface,
              color: tokens.text, cursor: 'pointer', fontSize: tokens.fontSizeXs, fontFamily: tokens.fontSans,
            }}
          >
            <div style={{ fontWeight: 700 }}>v{ver.version}{ver.version === prompt.currentVersion ? ' · current' : ''}</div>
            <div style={{ color: tokens.textMuted }}>{ver.note || 'no note'}</div>
            <div style={{ color: tokens.textMuted }}>{new Date(ver.createdAt).toLocaleDateString()}</div>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {v && (
          <div style={{ background: tokens.bgSubtle, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, padding: tokens.space3 }}>
            <HighlightedPrompt content={v.content} />
          </div>
        )}
        {v && v.version !== prompt.currentVersion && (
          <div style={{ marginTop: tokens.space2 }}>
            <Button size="sm" variant="secondary" onClick={() => { prompts.rollback(prompt.id, v.version); refresh(); }}>Rollback to v{v.version}</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- */
/* Use in chat modal: variable fill + provider/model + rendered preview */
/* ------------------------------------------------------------------- */
function UseInChatModal({ id, onClose, onNavigate, refresh }: { id: string; onClose: () => void; onNavigate?: (tab: string) => void; refresh: () => void }) {
  const { prompts } = useApp();
  const { tokens } = useTheme();
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('meta-llama/llama-3.3-70b-instruct:free');
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const p = prompts.get(id);
  if (!p) return null;
  const cur = p.versions.find((v) => v.version === p.currentVersion);
  const vars = extractVariables((p.systemPrompt ?? '') + (cur?.content ?? ''));
  const modelOpts = listModels(provider as never).map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''}`, value: m.id }));
  const _providerRef = provider;
  void _providerRef;

  const setVar = (k: string, val: string) => setValues((vs) => ({ ...vs, [k]: val }));

  const rendered = renderPrompt(cur?.content ?? '', values);
  const sysRendered = renderPrompt(p.systemPrompt ?? '', values);
  const totalTokens = estimateTokens(rendered + '\n' + sysRendered);
  const allFilled = vars.every((v) => (values[v] ?? '').trim().length > 0);

  const doCopyOpen = async () => {
    const txt = [sysRendered && `<system>\n${sysRendered}\n</system>`, rendered].filter(Boolean).join('\n\n');
    await copyText(txt);
    prompts.recordUse(p.id);
    refresh();
    setCopied(true);
    setTimeout(() => { onClose(); onNavigate?.('chat'); }, 400);
  };

  return (
    <Modal open onClose={onClose} title={`Use “${p.name}” in chat`} width={720}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.space3, marginBottom: tokens.space3 }}>
        <Select label="Provider" value={provider} onChange={setProvider} options={PROVIDER_LIST.map((x) => ({ label: x.name, value: x.id }))} />
        <Select label="Model" value={model} onChange={setModel} options={modelOpts} />
      </div>

      {vars.length > 0 ? (
        <div style={{ marginBottom: tokens.space3 }}>
          <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: tokens.space1 }}>
            Fill variables ({vars.filter((v) => (values[v] ?? '').trim()).length}/{vars.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
            {vars.map((v) => (
              <Input key={v} label={`{{${v}}}`} value={values[v] ?? ''} onChange={(val) => setVar(v, val)} placeholder={`{{${v}}}`} />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginBottom: tokens.space3 }}>No variables — the prompt is ready to use as-is.</div>
      )}

      <div style={{ marginBottom: tokens.space3 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space1 }}>
          <span style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted }}>RENDERED PREVIEW</span>
          <Badge color={tokens.primary}>~{totalTokens} tokens</Badge>
        </div>
        <div style={{ background: tokens.bgSubtle, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, padding: tokens.space3, maxHeight: 220, overflow: 'auto' }}>
          <Markdown content={rendered} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={() => void doCopyOpen()} disabled={vars.length > 0 && !allFilled}>
          {copied ? '✓ Copied' : 'Copy & open chat'}
        </Button>
        <Button variant="ghost" onClick={() => { prompts.recordUse(p.id); refresh(); onClose(); onNavigate?.('chat'); }}>Use without copying</Button>
        {!allFilled && vars.length > 0 && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.warning }}>Fill all variables to enable copy.</span>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- */
/* Editor modal (create / edit)                                        */
/* ------------------------------------------------------------------- */
function EditorModal({ id, onClose, refresh }: { id: string | null; onClose: () => void; refresh: () => void }) {
  const { prompts } = useApp();
  const { tokens } = useTheme();
  const existing = id ? prompts.get(id) : undefined;
  const isNew = !existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<PromptCategory | ''>(existing?.category ?? '');
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '));
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? '');
  const [content, setContent] = useState(existing ? prompts.currentVersion(id!)?.content ?? '' : '');
  const [note, setNote] = useState('');

  const save = () => {
    if (!name.trim() || !content.trim()) return;
    const tagArr = tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (isNew) {
      prompts.create(name, content, {
        description: description || undefined,
        category: category || undefined,
        tags: tagArr,
        systemPrompt: systemPrompt || undefined,
        note: note || 'Initial version',
      });
    } else {
      const fresh = prompts.get(id!);
      const cv = prompts.currentVersion(id!)?.content;
      if (cv === content) {
        prompts.updateMeta(id!, { name, description: description || undefined, category: category || undefined, tags: tagArr, systemPrompt: systemPrompt || undefined });
      } else {
        prompts.updateMeta(id!, { name, description: description || undefined, category: category || undefined, tags: tagArr, systemPrompt: systemPrompt || undefined });
        prompts.bumpVersion(id!, content, note || 'Updated');
      }
    }
    refresh();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={isNew ? 'New Prompt' : `Edit ${existing?.name ?? ''}`} width={720}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.space3 }}>
          <Input label="Name" value={name} onChange={setName} placeholder="My production prompt" />
          <Select
            label="Category"
            value={category || ''}
            onChange={(v) => setCategory(v as PromptCategory)}
            options={[{ label: '— uncategorized —', value: '' }, ...PROMPT_CATEGORIES.map((c) => ({ label: `${c.icon} ${c.label}`, value: c.id }))]}
          />
        </div>
        <Input label="Description" value={description} onChange={setDescription} placeholder="What this prompt is for (one line)" />
        <Input label="Tags (comma separated)" value={tags} onChange={setTags} placeholder="code-review, security, …" />
        <Input label="System prompt (optional)" textarea rows={3} value={systemPrompt} onChange={setSystemPrompt} monospace placeholder="You are a senior engineer who…" />
        <Input label="Prompt content" textarea rows={10} value={content} onChange={setContent} monospace placeholder={'You are a {{role}}…\n\n{{input}}'} />
        {!isNew && <Input label="Version note" value={note} onChange={setNote} placeholder="What changed in this version?" />}
        <div style={{ display: 'flex', gap: tokens.space2, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!name.trim() || !content.trim()}>
            {isNew ? 'Create prompt' : 'Save version'}
          </Button>
        </div>
        <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
          {extractVariables(content).length} variable(s) detected · ~{formatTokens(estimateTokens(content))} tokens
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- */
/* Evals (kept functional, moderately polished)                        */
/* ------------------------------------------------------------------- */
function EvalPanel() {
  const { tokens } = useTheme();
  const app = useApp();
  const { evals } = app;
  const [open, setOpen] = useState(false);
  const [def, setDef] = useState<Partial<{ name: string; model: string; provider: string; type: string; criteria?: string }>>({ name: '', model: 'meta-llama/llama-3.3-70b-instruct:free', provider: 'openrouter', type: 'contains' });
  const [sysPrompt, setSysPrompt] = useState('');
  const [inputText, setInputText] = useState('');
  const [expected, setExpected] = useState('');
  const [cases, setCases] = useState<{ id: string; input: string; expected?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ name: string; passRate: number; results: { caseId: string; pass: boolean; score: number; input: string; actual: string; llmJudge?: string }[] } | null>(null);

  const modelOpts = PROVIDER_LIST.flatMap((p) => listModels(p.id as never).map((m) => ({ label: `${p.name} · ${m.name}`, value: m.id })));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: tokens.space3 }}>
        <Button onClick={() => setOpen(true)}>+ New Eval</Button>
      </div>
      {result && (
        <Card title={`Results · ${result.name}`} subtitle={`${(result.passRate * 100).toFixed(0)}% pass · ${result.results.length} cases`} style={{ marginTop: 0 }}>
          <div style={{ marginBottom: tokens.space3 }}>
            <div style={{ width: '100%', height: 8, background: tokens.surfaceHover, borderRadius: tokens.radiusFull, overflow: 'hidden' }}>
              <div style={{ width: `${result.passRate * 100}%`, height: '100%', background: result.passRate >= 0.8 ? tokens.success : result.passRate >= 0.5 ? tokens.warning : tokens.danger, borderRadius: tokens.radiusFull }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
            {result.results.map((r) => (
              <div key={r.caseId} style={{ border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, padding: tokens.space3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>Case {r.caseId}</span>
                  <Badge color={r.pass ? tokens.success : tokens.danger}>{r.pass ? 'PASS' : 'FAIL'} · {(r.score * 100).toFixed(0)}%</Badge>
                </div>
                <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary }}>Input: {r.input}</div>
                <div style={{ fontSize: tokens.fontSizeXs, marginTop: 4 }}><span style={{ color: tokens.textMuted }}>Output:</span> {r.actual}</div>
                {r.llmJudge && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 4 }}>Judge: {r.llmJudge}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Create Evaluation" width={640}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
          <Input label="Eval name" value={def.name ?? ''} onChange={(v) => setDef((d) => ({ ...d, name: v }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.space3 }}>
            <Select label="Model" value={def.model ?? ''} onChange={(v) => setDef((d) => ({ ...d, model: v }))} options={modelOpts} />
            <Select label="Provider" value={def.provider ?? ''} onChange={(v) => setDef((d) => ({ ...d, provider: v }))} options={PROVIDER_LIST.map((p) => ({ label: p.name, value: p.id }))} />
          </div>
          <Select label="Scoring type" value={def.type ?? 'contains'} onChange={(v) => setDef((d) => ({ ...d, type: v }))} options={[
            { label: 'Contains expected text', value: 'contains' },
            { label: 'Exact match', value: 'exact' },
            { label: 'Regex', value: 'regex' },
            { label: 'LLM judge', value: 'llm_judge' },
          ]} />
          {def.type === 'llm_judge' && <Input label="Judge criteria" value={def.criteria ?? ''} onChange={(v) => setDef((d) => ({ ...d, criteria: v }))} placeholder="e.g. Output must be factual and well-structured" />}
          <Input label="Prompt / system prompt" textarea rows={3} value={sysPrompt} onChange={setSysPrompt} />
          <Input label="Test input" textarea rows={2} value={inputText} onChange={setInputText} />
          <Input label="Expected (optional)" value={expected} onChange={setExpected} />
          <Button variant="secondary" onClick={() => { if (inputText) { setCases((c) => [...c, { id: String(c.length + 1), input: inputText, expected: expected || undefined }]); setInputText(''); setExpected(''); } }}>
            Add case ({cases.length})
          </Button>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {cases.map((c) => <Badge key={c.id}>#{c.id}: {c.input.slice(0, 20)}</Badge>)}
          </div>
          <Button
            onClick={async () => {
              setRunning(true);
              setResult(null);
              const r = await app.evals.run(
                {
                  id: `eval_${Date.now()}`,
                  name: def.name || 'Untitled eval',
                  model: def.model,
                  provider: def.provider,
                  systemPrompt: sysPrompt || undefined,
                  criteria: def.criteria,
                  type: (def.type ?? 'contains'),
                  cases: cases.length ? cases : [{ id: '1', input: 'Hello world', expected: 'Hello' }],
                } as never,
                def.model,
                def.provider,
              ) as never;
              const rr = r as unknown as { name: string; passRate: number; results: { caseId: string; pass: boolean; score: number; input: string; actual: string; llmJudge?: string }[] };
              setResult(rr);
              setOpen(false);
              setRunning(false);
            }}
            disabled={running || cases.length === 0}
          >
            {running ? 'Running…' : 'Run eval'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
