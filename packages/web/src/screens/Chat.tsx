import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../state/AppProvider';
import { Button, Select, Input, Toggle, Spinner, useTheme, Badge, useIsMobile } from '@acode/ui';
import {
  listModels,
  listProviders,
  BUILTIN_SKILLS,
  getSkill,
  skillsByIds,
  inferCapabilities,
  CAPABILITY_LABELS,
  type ChatMessage,
  type ProviderId,
  type ChatAttachment,
  type AttachmentKind,
  type ModelCapability,
} from '@acode/core';
import type { Conversation } from '@acode/core';
import { Markdown } from '../components/Markdown';

const SYSTEM_PROMPT = 'You are AcodeDev assistant, a helpful AI. Be concise and accurate.';

const SUGGESTIONS = [
  'Explain how a workflow executes a DAG',
  'Summarize what I should build next',
  'Help me debug this code',
  'Write a prompt for code review',
];

const CAP_ORDER: ModelCapability[] = ['text', 'tool', 'vision', 'image', 'file', 'folder', 'svg', 'drawio', 'link', 'code', 'reasoning'];

let _seq = 0;
function uid(): string {
  return `att_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
}

const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf', 'zip', 'gz', 'tar', 'bin', 'exe', 'wasm', 'woff', 'woff2', 'ttf']);

function formatContext(n: number): string {
  if (n <= 0) return '?';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function readTextAsync(f: File): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string) ?? '');
    r.onerror = () => resolve('');
    r.readAsText(f);
  });
}

function fileToAttachment(f: File): Promise<ChatAttachment> {
  const name = f.name;
  const type = f.type;
  const id = uid();
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve({ id, kind: 'image', name, mimeType: type || undefined, src: (r.result as string) ?? undefined, size: f.size });
      r.onerror = () => resolve({ id, kind: 'image', name, mimeType: type || undefined, src: URL.createObjectURL(f), size: f.size });
      r.readAsDataURL(f);
    });
  }
  let kind: AttachmentKind = 'file';
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const text = (r.result as string) ?? '';
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      kind = 'file';
      if (type === 'image/svg+xml' || ext === 'svg') kind = 'svg';
      else if (ext === 'drawio' || name.toLowerCase().includes('drawio') || (text.includes('<mxGraphModel') && ext === 'xml')) kind = 'drawio';
      else if (BINARY_EXT.has(ext) || text.includes('\u0000')) kind = 'file';
      resolve({ id, kind, name, mimeType: type || undefined, text, size: f.size });
    };
    r.onerror = () => resolve({ id, kind, name, mimeType: type || undefined, size: f.size });
    r.readAsText(f);
  });
}

function folderToAttachment(files: File[], folderName: string): Promise<ChatAttachment> {
  const children: ChatAttachment['children'] = [];
  const pushes = files.slice(0, 40).map(async (f) => {
    let text = '';
    if (!BINARY_EXT.has(f.name.split('.').pop()?.toLowerCase() ?? '')) {
      text = await readTextAsync(f);
    }
    children.push({ name: f.name, path: f.webkitRelativePath || f.name, text });
  });
  return Promise.all(pushes).then(() => ({
    id: uid(),
    kind: 'folder' as AttachmentKind,
    name: folderName,
    children,
    size: children.length,
  }));
}

const kindIcon: Record<AttachmentKind, string> = {
  text: '📝',
  file: '📄',
  folder: '📁',
  image: '🖼',
  svg: '◫',
  drawio: '⬡',
  link: '🔗',
};

export function ChatScreen({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { tokens } = useTheme();
  const { chat, projects, currentProjectId, hasKey } = useApp();
  const isMobile = useIsMobile();

  const [provider, setProvider] = useState<ProviderId>('openrouter');
  const [model, setModel] = useState('meta-llama/llama-3.3-70b-instruct:free');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [showParams, setShowParams] = useState(false);
  const [freeOnly, setFreeOnly] = useState(true);
  const [minContext, setMinContext] = useState('0');
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sessionsOpen, setSessionsOpen] = useState(!isMobile);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Chat context
  const [contextOpen, setContextOpen] = useState(!isMobile);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [linkDraft, setLinkDraft] = useState({ open: false, url: '', title: '' });

  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { catalogVersion } = useApp();
  void catalogVersion;

  const allProviders = listProviders();
  const gatewayProviders = allProviders.filter((p) => p.gateway);
  const directProviders = allProviders.filter((p) => !p.gateway && p.id !== 'local');
  const minCtx = Number(minContext) || 0;
  const providerModels = listModels(provider).filter((m) => (freeOnly ? m.isFree : true)).filter((m) => (minCtx > 0 ? m.contextWindow >= minCtx : true));

  const provDef = allProviders.find((p) => p.id === provider);
  const needsKey = !!(provDef && provDef.needsKey !== false && provDef.kind !== 'local');
  const connected = !needsKey || hasKey(provider);

  const modelDef = providerModels.find((m) => m.id === model);
  const capabilities: ModelCapability[] = modelDef?.capabilities ?? inferCapabilities(modelDef?.tags);

  const refreshSessions = useCallback(() => {
    setSessions(projects.conversationsFor(currentProjectId ?? undefined));
  }, [projects, currentProjectId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!providerModels.some((m) => m.id === model)) {
      setModel(providerModels[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, freeOnly]);

  // Load messages when switching session
  useEffect(() => {
    if (!convId) {
      setMessages([]);
      return;
    }
    const conv = projects.getConversation(convId);
    setMessages(conv ? conv.messages.filter((m) => m.role !== 'system') : []);
    setProvider(conv?.provider ?? 'openrouter');
    setModel(conv?.model ?? providerModels[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  useEffect(() => {
    if (!isMobile) {
      setSessionsOpen(true);
      setContextOpen(true);
    }
  }, [isMobile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);

  // Auto-grow the composer textarea as content grows (vertical context space).
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }
  }, [input]);

  const selectSession = (id: string) => {
    setConvId(id);
    setAttachments([]);
    if (isMobile) setSessionsOpen(false);
  };

  const newSession = () => {
    const conv = projects.createConversation({
      title: 'New chat',
      projectId: currentProjectId ?? undefined,
      provider,
      model,
    });
    refreshSessions();
    setConvId(conv.id);
    setMessages([]);
    setAttachments([]);
    if (isMobile) setSessionsOpen(false);
  };

  const deleteSession = (id: string) => {
    projects.deleteConversation(id);
    refreshSessions();
    if (convId === id) {
      setConvId(null);
      setMessages([]);
    }
  };

  const clearSession = (id: string) => {
    projects.clearConversation(id);
    refreshSessions();
    if (convId === id) setMessages([]);
  };

  const startRename = (id: string, current: string) => {
    setRenaming(id);
    setRenameValue(current);
  };
  const commitRename = (id: string) => {
    projects.renameConversation(id, renameValue);
    refreshSessions();
    setRenaming(null);
  };

  // ---- attachments ----
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const f of files) {
      const a = await fileToAttachment(f);
      setAttachments((prev) => [...prev, a]);
    }
  };
  const onPickFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const root = files[0].webkitRelativePath?.split('/')[0] || files[0].name;
    const a = await folderToAttachment(files, root);
    setAttachments((prev) => [...prev, a]);
  };
  const addLink = () => {
    if (!linkDraft.url.trim()) return;
    setAttachments((prev) => [...prev, { id: uid(), kind: 'link', name: linkDraft.title.trim() || linkDraft.url.trim(), url: linkDraft.url.trim() }]);
    setLinkDraft({ open: false, url: '', title: '' });
  };
  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  // ---- send ----
  const handleSend = async (text?: string) => {
    const raw = (text ?? input).trim();
    if ((!raw && attachments.length === 0) || streaming) return;
    setInput('');

    let cid = convId;
    if (!cid) {
      const conv = projects.createConversation({
        title: raw.slice(0, 40) || 'New chat',
        projectId: currentProjectId ?? undefined,
        provider,
        model,
      });
      cid = conv.id;
      setConvId(cid);
      refreshSessions();
    }

    const conv = projects.getConversation(cid)!;
    if (conv.title === 'New chat' && raw) {
      projects.renameConversation(cid, raw.slice(0, 40));
      refreshSessions();
    }

    const userMsg: ChatMessage = { role: 'user', content: raw, attachments };
    projects.appendMessage(cid, userMsg);
    const devStorage = projects.getConversation(cid)!;
    const prior = devStorage.messages.filter((m) => m.role !== 'system');
    setMessages([...prior]);
    setAttachments([]);

    // Compose system prompt from base + active skills
    const active = skillsByIds(selectedSkills);
    let system = SYSTEM_PROMPT;
    if (active.length) {
      const skillBlock = active.map((s) => `<skill name="${s.name}">\n${s.instructions}\n</skill>`).join('\n\n');
      system = `${SYSTEM_PROMPT}\n\nEnable these skills for this conversation:\n${skillBlock}`;
    }

    const history: ChatMessage[] = [{ role: 'system', content: system }, ...prior.map((m) => m.role === 'system' ? { ...m, content: system } : m)];

    setStreaming(true);
    const assistantId = `assist_${Date.now()}`;
    setMessages((prev) => [...prev, { role: 'assistant', content: '', name: assistantId }]);

    let full = '';
    try {
      const ws = await chat.stream({ provider, model, messages: history, params: { temperature, maxTokens } });
      for await (const chunk of ws) {
        full += chunk.delta;
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.name === assistantId);
          if (idx >= 0) next[idx] = { role: 'assistant', content: full };
          return next;
        });
      }
      setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: full } : m)));
      projects.appendMessage(cid, { role: 'assistant', content: full });
    } catch (e) {
      const errMsg = `⚠️ ${e instanceof Error ? e.message : String(e)}\n\nTip: check your API key or connectivity.`;
      setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: errMsg } : m)));
    } finally {
      setStreaming(false);
      refreshSessions();
    }
  };

  const filteredSessions = sessions.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()),
  );

  const connStatus = connected
    ? { ok: true, text: provDef?.name ?? provider }
    : { ok: false, text: provDef?.name ?? provider };

  return (
    <div style={{ display: 'flex', height: '100%', background: tokens.bg }}>
      {/* Sessions sidebar */}
      {sessionsOpen && (
        <>
          {isMobile && (
            <div className="fade-in" onClick={() => setSessionsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
          )}
          <aside
            className="rise"
            style={{
              width: isMobile ? 'min(85vw, 320px)' : 260,
              flexShrink: 0,
              background: tokens.bgSubtle,
              borderRight: `1px solid ${tokens.border}`,
              display: 'flex',
              flexDirection: 'column',
              zIndex: isMobile ? 61 : 'auto',
              position: isMobile ? 'fixed' : 'relative',
              top: 0, bottom: 0, left: 0,
            }}
          >
            <div style={{ padding: tokens.space3, borderBottom: `1px solid ${tokens.border}`, display: 'flex', gap: tokens.space2 }}>
              <Input value={search} onChange={setSearch} placeholder="Search sessions…" />
            </div>
            <div style={{ padding: tokens.space2 }}>
              <Button full onClick={newSession}>
                + New chat
              </Button>
            </div>
            <div style={{ padding: `${tokens.space1}px ${tokens.space3}px`, fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontWeight: 600 }}>
              SESSIONS {sessions.length > 0 ? `(${sessions.length})` : ''}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${tokens.space2}px ${tokens.space2}px` }}>
              {filteredSessions.length === 0 ? (
                <div style={{ padding: tokens.space3, fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>
                  {search ? 'No sessions match' : 'No chats yet. Start a new chat!'}
                </div>
              ) : (
                filteredSessions.map((s) => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    active={s.id === convId}
                    renaming={renaming === s.id}
                    renameValue={renameValue}
                    onRenameValue={setRenameValue}
                    onClick={() => selectSession(s.id)}
                    onRename={() => startRename(s.id, s.title)}
                    onCommitRename={() => commitRename(s.id)}
                    onCancelRename={() => setRenaming(null)}
                    onClear={() => clearSession(s.id)}
                    onDelete={() => deleteSession(s.id)}
                  />
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, borderBottom: `1px solid ${tokens.border}`, background: tokens.bgElevated, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSessionsOpen((v) => !v)}
            aria-label="Toggle sessions"
            style={{ background: 'transparent', border: 'none', color: tokens.text, width: 32, height: 32, borderRadius: tokens.radiusMd, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {convId ? (projects.getConversation(convId)?.title ?? 'Chat') : 'Chat'}
            </div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{convId ? `${messages.filter((m) => m.role === 'user').length} messages` : 'No active session'}</div>
          </div>
          <div style={{ flex: 1 }} />
          {convId && (
            <Button size="sm" variant="ghost" onClick={() => clearSession(convId)}>Clear</Button>
          )}
          <Button size="sm" onClick={() => setContextOpen((v) => !v)}>{contextOpen ? 'Hide context' : 'Context'}</Button>
        </div>

        {/* Not-connected banner */}
        {!connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, padding: `${tokens.space2}px ${tokens.space3}px`, borderBottom: `1px solid ${tokens.border}`, background: `linear-gradient(90deg, ${tokens.warning}1f, ${tokens.bgElevated})`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: tokens.fontSizeMd }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{connStatus.text} isn't connected</div>
              <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary }}>Add your API key to start getting real responses from this provider.</div>
            </div>
            <Button size="sm" onClick={() => onNavigate?.('keys')}>Connect provider</Button>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: tokens.space4, display: 'flex', flexDirection: 'column', gap: tokens.space4, placeItems: 'stretch' }}>
          {messages.length === 0 ? (
            <div style={{ margin: 'auto', maxWidth: 520, textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: tokens.radiusLg, background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: tokens.fontSizeXl, boxShadow: tokens.shadowMd }}>A</div>
              <div style={{ fontSize: tokens.fontSizeLg, fontWeight: 700, marginBottom: tokens.space2 }}>What can I help you build?</div>
              <p style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm, margin: '0 0 24px', lineHeight: 1.6 }}>
                Start a conversation or pick a suggestion below. Your selected model {model ? <Badge color={tokens.primary}>{model.split('/').pop()}</Badge> : ''} will respond in real time.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: tokens.space2 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    style={{ textAlign: 'left', padding: tokens.space3, borderRadius: tokens.radiusMd, border: `1px solid ${tokens.borderStrong}`, background: tokens.surface, color: tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeSm, lineHeight: 1.4, transition: 'border-color 0.12s ease, background 0.12s ease' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.primary; (e.currentTarget as HTMLButtonElement).style.background = tokens.surfaceHover; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = tokens.borderStrong; (e.currentTarget as HTMLButtonElement).style.background = tokens.surface; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <Bubble key={i} msg={m} streaming={streaming && m.name === messages[messages.length - 1].name} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div style={{ padding: tokens.space3, borderTop: `1px solid ${tokens.border}`, background: tokens.bgElevated }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: tokens.space2, flexWrap: 'wrap', marginBottom: tokens.space2 }}>
                {attachments.map((a) => (
                  <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: tokens.space1, flexShrink: 0 }}>
                <IconBtn title="Attach file" onClick={() => fileRef.current?.click()}>📄</IconBtn>
                <IconBtn title="Attach folder" onClick={() => folderRef.current?.click()}>📁</IconBtn>
                <IconBtn title="Attach link" onClick={() => setLinkDraft((d) => ({ ...d, open: !d.open }))}>🔗</IconBtn>
              </div>
              <div style={{ flex: 1 }}>
                <textarea
                  ref={textareaRef}
                  rows={2}
                  placeholder="Message AcodeDev…  (Enter to send, Shift+Enter for newline)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  style={{
                    width: '100%',
                    background: tokens.bg,
                    border: `1px solid ${tokens.borderStrong}`,
                    borderRadius: tokens.radiusMd,
                    color: tokens.text,
                    padding: `${tokens.space2}px ${tokens.space3}px`,
                    fontSize: tokens.fontSizeSm,
                    fontFamily: tokens.fontSans,
                    outline: 'none',
                    resize: 'none',
                    boxSizing: 'border-box',
                    lineHeight: 1.5,
                    minHeight: 48,
                    maxHeight: 220,
                  }}
                />
              </div>
              <Button onClick={() => void handleSend()} disabled={(!input.trim() && attachments.length === 0) || streaming} style={{ height: 48, whiteSpace: 'nowrap' }}>
                {streaming ? <Spinner size={16} color="#fff" /> : 'Send'}
              </Button>
            </div>
            {linkDraft.open && (
              <div style={{ display: 'flex', gap: tokens.space2, marginTop: tokens.space2, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <Input value={linkDraft.url} onChange={(v) => setLinkDraft((d) => ({ ...d, url: v }))} placeholder="https://…" onEnter={addLink} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <Input value={linkDraft.title} onChange={(v) => setLinkDraft((d) => ({ ...d, title: v }))} placeholder="Label (optional)" />
                </div>
                <Button size="sm" onClick={addLink} disabled={!linkDraft.url.trim()}>Add link</Button>
              </div>
            )}
            <div style={{ marginTop: tokens.space1, fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
              Responses are generated by the selected model. AI can make mistakes — verify important output.
            </div>
          </div>
        </div>

        {/* Hidden inputs */}
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={onPickFiles} />
        <input ref={folderRef} type="file" multiple style={{ display: 'none' }} {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={onPickFolder} />
      </div>

      {/* Context panel */}
      {contextOpen && (
        <ContextPanel
          provider={provider}
          setProvider={setProvider}
          model={model}
          setModel={setModel}
          providerModels={providerModels}
          gatewayProviders={gatewayProviders}
          directProviders={directProviders}
          capabilities={capabilities}
          freeOnly={freeOnly}
          setFreeOnly={setFreeOnly}
          minContext={minContext}
          setMinContext={setMinContext}
          showParams={showParams}
          setShowParams={setShowParams}
          temperature={temperature}
          setTemperature={setTemperature}
          maxTokens={maxTokens}
          setMaxTokens={setMaxTokens}
          selectedSkills={selectedSkills}
          setSelectedSkills={setSelectedSkills}
          connected={connected}
          onNavigate={onNavigate}
          isMobile={isMobile}
          onClose={() => setContextOpen(false)}
          onTriggerFile={() => fileRef.current?.click()}
          onTriggerFolder={() => folderRef.current?.click()}
          onTriggerLink={() => setLinkDraft((d) => ({ ...d, open: !d.open }))}
        />
      )}
    </div>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ background: tokens.bg, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, width: 44, height: 44, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
    >
      {children}
    </button>
  );
}

function AttachmentChip({ attachment: a, onRemove }: { attachment: ChatAttachment; onRemove: () => void }) {
  const { tokens } = useTheme();
  const meta = a.kind === 'folder' ? `${a.children?.length ?? 0} files` : a.kind === 'image' ? 'image' : a.kind === 'link' ? 'link' : a.size ? `${(a.size / 1024).toFixed(0)}kb` : a.kind;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: tokens.space1, padding: `4px ${tokens.space2}px`, borderRadius: tokens.radiusFull, border: `1px solid ${tokens.borderStrong}`, background: tokens.bgSubtle, fontSize: tokens.fontSizeXs }}>
      <span>{kindIcon[a.kind]}</span>
      <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{a.name}</span>
      <span style={{ color: tokens.textMuted }}>{meta}</span>
      <button onClick={onRemove} title="Remove" style={{ background: 'transparent', border: 'none', color: tokens.textMuted, cursor: 'pointer', padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

function ContextPanel(props: {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  providerModels: { id: string; name: string; isFree: boolean; contextWindow: number }[];
  gatewayProviders: { id: string; name: string }[];
  directProviders: { id: string; name: string }[];
  capabilities: ModelCapability[];
  freeOnly: boolean;
  setFreeOnly: (v: boolean) => void;
  minContext: string;
  setMinContext: (v: string) => void;
  showParams: boolean;
  setShowParams: React.Dispatch<React.SetStateAction<boolean>>;
  temperature: number;
  setTemperature: (v: number) => void;
  maxTokens: number;
  setMaxTokens: (v: number) => void;
  selectedSkills: string[];
  setSelectedSkills: React.Dispatch<React.SetStateAction<string[]>>;
  connected: boolean;
  onNavigate?: (tab: string) => void;
  isMobile: boolean;
  onClose: () => void;
  onTriggerFile: () => void;
  onTriggerFolder: () => void;
  onTriggerLink: () => void;
}) {
  const { tokens } = useTheme();
  const {
    provider, setProvider, model, setModel, providerModels, gatewayProviders, directProviders,
    capabilities, freeOnly, setFreeOnly, minContext, setMinContext,
    showParams, setShowParams, temperature, setTemperature, maxTokens, setMaxTokens,
    selectedSkills, setSelectedSkills, connected, onNavigate, isMobile, onClose,
    onTriggerFile, onTriggerFolder, onTriggerLink,
  } = props;

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const groups = [...new Set(BUILTIN_SKILLS.map((s) => s.group))];

  return (
    <>
      {isMobile && <div className="fade-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60 }} />}
      <aside
        className="rise"
        style={{
          width: isMobile ? 'min(88vw, 360px)' : 340,
          flexShrink: 0,
          background: tokens.bgSubtle,
          borderLeft: `1px solid ${tokens.border}`,
          display: 'flex',
          flexDirection: 'column',
          zIndex: isMobile ? 61 : 'auto',
          position: isMobile ? 'fixed' : 'relative',
          top: 0, bottom: 0, right: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd }}>Chat context</div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>Model, skills & attached resources</div>
          </div>
          {isMobile && (
            <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
          )}
        </div>

        {/* Model + capabilities */}
        <div style={{ padding: tokens.space3, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600, marginBottom: tokens.space2 }}>Model</div>
          <Select
            label="Provider"
            value={provider}
            onChange={setProvider}
            options={[
              ...gatewayProviders.map((p) => ({ label: `${p.name} · gateway`, value: p.id })),
              ...directProviders.map((p) => ({ label: p.name, value: p.id })),
            ]}
          />
          <div style={{ marginTop: tokens.space2 }}>
            <Select
              label={`Model · ${formatContext(providerModels.find((m) => m.id === model)?.contextWindow ?? 0)} ctx`}
              value={model}
              onChange={setModel}
              options={providerModels.map((m) => ({
                label: `${m.name}${m.isFree ? ' · free' : ''} · ${formatContext(m.contextWindow)} ctx`,
                value: m.id,
              }))}
            />
          </div>

          {/* Capabilities the model can accept */}
          <div style={{ marginTop: tokens.space2 }}>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginBottom: tokens.space1 }}>Accepts</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.space1 }}>
              {CAP_ORDER.filter((c) => capabilities.includes(c)).map((c) => (
                <Badge key={c} color={tokens.success}>{CAPABILITY_LABELS[c]}</Badge>
              ))}
              {capabilities.length === 0 && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>—</span>}
            </div>
          </div>

          {!connected && onNavigate && (
            <div style={{ marginTop: tokens.space2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.space2 }}>
              <span style={{ fontSize: tokens.fontSizeXs, color: tokens.warning }}>Not connected</span>
              <Button size="sm" onClick={() => onNavigate('keys')}>Configure</Button>
            </div>
          )}
        </div>

        {/* Skills */}
        <div style={{ padding: tokens.space3, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space2 }}>
            <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>Skills</div>
            {selectedSkills.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedSkills([])}>Clear</Button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.space1 }}>
            {selectedSkills.length === 0 && (
              <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginBottom: tokens.space1 }}>Enable skills to steer the model's approach.</span>
            )}
            {selectedSkills.map((id) => {
              const s = getSkill(id);
              return (
                <Badge key={id} color={tokens.primary} style={{ cursor: 'pointer' }} >
                  <span onClick={() => toggleSkill(id)} title={s?.description}>{s?.icon} {s?.name} ✕</span>
                </Badge>
              );
            })}
          </div>
          <div style={{ marginTop: tokens.space2 }}>
            {groups.map((g) => (
              <div key={g} style={{ marginBottom: tokens.space2 }}>
                <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: tokens.space1 }}>{g}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space1 }}>
                  {BUILTIN_SKILLS.filter((s) => s.group === g).map((s) => (
                    <SkillRow key={s.id} skill={s} active={selectedSkills.includes(s.id)} onToggle={() => toggleSkill(s.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Attachments */}
        <div style={{ padding: tokens.space3, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600, marginBottom: tokens.space2 }}>Attachments</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: tokens.space1, marginBottom: tokens.space2 }}>
            <AttachBtn icon="📄" label="File" onClick={onTriggerFile} />
            <AttachBtn icon="🖼" label="Image" onClick={onTriggerFile} />
            <AttachBtn icon="📁" label="Folder" onClick={onTriggerFolder} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: tokens.space1 }}>
            <AttachBtn icon="◫" label="SVG" onClick={onTriggerFile} />
            <AttachBtn icon="⬡" label="draw.io" onClick={onTriggerFile} />
            <AttachBtn icon="🔗" label="Link" onClick={onTriggerLink} />
          </div>
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: tokens.space2 }}>
            Attachments travel with your next message. Files, folders, images, SVGs, draw.io diagrams and links are all supported.
          </div>
        </div>

        {/* Params */}
        <div style={{ padding: tokens.space3 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space2 }}>
            <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>Generation</div>
            <Button size="sm" variant="ghost" onClick={() => setShowParams((s) => !s)}>{showParams ? 'Hide' : 'Show'}</Button>
          </div>
          <div style={{ display: 'flex', gap: tokens.space3, alignItems: 'center', marginBottom: tokens.space2, flexWrap: 'wrap' }}>
            <Toggle checked={freeOnly} onChange={setFreeOnly} label="Free only" />
            <div style={{ width: 110 }}>
              <Input value={minContext} onChange={setMinContext} placeholder="min ctx" />
            </div>
          </div>
          {showParams && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
              <Input label={`Temperature: ${temperature}`} value={String(temperature)} onChange={(v) => setTemperature(Math.max(0, Math.min(2, Number(v) || 0)))} type="number" />
              <Input label="Max tokens" value={String(maxTokens)} onChange={(v) => setMaxTokens(Math.max(1, Number(v) || 2048))} type="number" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function AttachBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: `${tokens.space2}px 4px`, border: `1px dashed ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, background: tokens.bg, cursor: 'pointer', color: tokens.textSecondary, fontFamily: tokens.fontSans, fontSize: tokens.fontSizeXs }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SkillRow({ skill, active, onToggle }: { skill: { id: string; name: string; icon: string; description: string }; active: boolean; onToggle: () => void }) {
  const { tokens } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, cursor: 'pointer', padding: `${tokens.space1}px 0` }}>
      <input type="checkbox" checked={active} onChange={onToggle} />
      <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 600, color: active ? tokens.primary : tokens.text }}>{skill.icon} {skill.name}</span>
      <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontFamily: tokens.fontSans }}>— {skill.description}</span>
    </label>
  );
}

function SessionItem({
  session, active, renaming, renameValue, onRenameValue, onClick, onRename, onCommitRename, onCancelRename, onClear, onDelete,
}: {
  session: Conversation;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameValue: (v: string) => void;
  onClick: () => void;
  onRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  const { tokens } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        marginBottom: tokens.space1,
        padding: `${tokens.space2}px ${tokens.space2}px`,
        borderRadius: tokens.radiusMd,
        background: active ? tokens.primary : 'transparent',
        color: active ? tokens.primaryForeground : tokens.text,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: tokens.space2,
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = tokens.surfaceHover; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? tokens.primaryForeground : tokens.textMuted} strokeWidth="1.8" style={{ flexShrink: 0 }}><path d="M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8v.5z" /></svg>
      {renaming ? (
        <div style={{ flex: 1, display: 'flex', gap: tokens.space1, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCommitRename(); if (e.key === 'Escape') onCancelRename(); }}
            style={{ flex: 1, background: tokens.bg, color: tokens.text, border: `1px solid ${tokens.primary}`, borderRadius: 4, padding: '2px 6px', fontSize: tokens.fontSizeSm, fontFamily: tokens.fontSans, outline: 'none' }}
          />
          <button onClick={onCommitRename} style={{ background: 'transparent', border: 'none', color: tokens.success, cursor: 'pointer', fontSize: 14 }}>✓</button>
          <button onClick={onCancelRename} style={{ background: 'transparent', border: 'none', color: tokens.textMuted, cursor: 'pointer', fontSize: 14 }}>✗</button>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.title || 'Untitled'}</div>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-label="Session actions"
            style={{ background: 'transparent', border: 'none', color: active ? tokens.primaryForeground : tokens.textMuted, cursor: 'pointer', padding: 2, lineHeight: 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
          </button>
          {menuOpen && (
            <div
              style={{ position: 'absolute', right: 0, top: '100%', zIndex: 20, background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, boxShadow: tokens.shadowLg, padding: tokens.space1, minWidth: 150 }}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem label="Rename" icon="✎" onClick={() => { setMenuOpen(false); onRename(); }} />
              <MenuItem label="Clear history" icon="○" onClick={() => { setMenuOpen(false); onClear(); }} />
              <MenuItem label="Delete" icon="🗑" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MenuItem({ label, icon, onClick, danger }: { label: string; icon: string; onClick: () => void; danger?: boolean }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', padding: `${tokens.space1}px ${tokens.space2}px`, background: 'transparent', border: 'none', borderRadius: tokens.radiusSm, color: danger ? tokens.danger : tokens.text, fontSize: tokens.fontSizeSm, cursor: 'pointer', fontFamily: tokens.fontSans }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = tokens.surfaceHover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>{label}
    </button>
  );
}

function Bubble({ msg, streaming }: { msg: ChatMessage; streaming: boolean }) {
  const { tokens } = useTheme();
  const isUser = msg.role === 'user';
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(msg.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', gap: tokens.space2 }}>
      {!isUser && (
        <div style={{ width: 30, height: 30, borderRadius: tokens.radiusMd, background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: tokens.fontSizeSm, alignSelf: 'flex-start', flexShrink: 0 }}>A</div>
      )}
      <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: tokens.space1 }}>
        {isUser && msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', gap: tokens.space1, flexWrap: 'wrap' }}>
            {msg.attachments.map((a) => (
              <span key={a.id} style={{ padding: `2px ${tokens.space2}px`, borderRadius: tokens.radiusFull, background: tokens.bgSubtle, border: `1px solid ${tokens.border}`, fontSize: tokens.fontSizeXs }}>
                {kindIcon[a.kind]} {a.name}
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            padding: `${tokens.space3}px ${tokens.space4}px`,
            borderRadius: tokens.radiusLg,
            background: isUser ? tokens.primary : tokens.surface,
            color: isUser ? tokens.primaryForeground : tokens.text,
            border: isUser ? 'none' : `1px solid ${tokens.border}`,
            borderTopLeftRadius: isUser ? tokens.radiusSm : tokens.radiusSm,
            borderTopRightRadius: 0,
            fontSize: tokens.fontSizeSm,
            lineHeight: 1.6,
          }}
        >
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
          ) : (
            <Markdown content={msg.content} />
          )}
          {streaming && <span style={{ display: 'inline-block', width: 8, height: 16, background: tokens.primary, marginLeft: 2, verticalAlign: 'text-bottom', animation: 'acode-pulse 0.9s infinite' }} />}
        </div>
        {!isUser && (
          <button onClick={copy} style={{ alignSelf: 'flex-start', background: 'transparent', border: 'none', color: copied ? tokens.success : tokens.textMuted, cursor: 'pointer', fontSize: tokens.fontSizeXs, fontWeight: 600 }}>
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        )}
      </div>
    </div>
  );
}
