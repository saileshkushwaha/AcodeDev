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
  const [model, setModel] = useState('nvidia/nemotron-3.5-lightning:free');
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
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [subtab, setSubtab] = useState<'session' | 'files'>('session');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  // Chat context
  const [contextOpen, setContextOpen] = useState(!isMobile);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [linkDraft, setLinkDraft] = useState({ open: false, url: '', title: '' });
  const [attachOpen, setAttachOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);

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

  const messagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pinnedToBottom) bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming, pinnedToBottom, subtab]);

  const onScrollBody = () => {
    const el = messagesRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setPinnedToBottom(nearBottom);
  };

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

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
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

  // ---- session header actions (Rename / Share / Export / Archive / Delete) ----
  const shareSession = async () => {
    const conv = convId ? projects.getConversation(convId) : undefined;
    const transcript = (conv?.messages ?? [])
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? '**User**' : '**Assistant**'}:\n${m.content}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(transcript || 'No messages yet.');
    } catch {
      /* clipboard unavailable */
    }
  };
  const exportSession = () => {
    const conv = convId ? projects.getConversation(convId) : undefined;
    if (!conv) return;
    const lines = ['# ' + (conv.title || 'Chat'), '', ...(conv.messages ?? [])
      .filter((m) => m.role !== 'system')
      .map((m) => `## ${m.role === 'user' ? 'User' : 'Assistant'}\n\n${m.content}`)];
    const blob = new Blob([lines.join('\n\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(conv.title || 'chat').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
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

    const body = { provider, model, messages: history, params: { temperature, maxTokens } };
    let full = '';
    let reasoning = '';
    let contentStreamed = false;
    try {
      const ws = await chat.stream(body);
      for await (const chunk of ws) {
        if (chunk.delta) {
          contentStreamed = true;
          full += chunk.delta;
        }
        if (chunk.reasoning) reasoning += chunk.reasoning;
        const shown = full || (contentStreamed ? '' : reasoning);
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.name === assistantId);
          if (idx >= 0) next[idx] = { role: 'assistant', content: shown };
          return next;
        });
      }
      if (!full && reasoning) {
        full = `🧠 ${reasoning}`;
      }
      setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: full } : m)));
      projects.appendMessage(cid, { role: 'assistant', content: full });
    } catch (e) {
      const errMsg = `⚠️ ${e instanceof Error ? e.message : String(e)}\n\nTip: check your API key or connectivity.`;
      setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: errMsg } : m)));
    }
    // Fallback: streaming produced nothing (empty reply / provider quirk) but a
    // plain request works — fetch the answer via the non-streaming path we know works.
    if (!full && contentStreamed === false) {
      try {
        const res = await chat.chat(body);
        const text = res.content ?? '';
        if (text) {
          full = text;
          setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: text } : m)));
          projects.appendMessage(cid, { role: 'assistant', content: text });
        }
      } catch {
        /* keep whatever the stream produced */
      }
    }
    setStreaming(false);
    refreshSessions();
  };

  const filteredSessions = sessions.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()),
  );

  const connStatus = connected
    ? { ok: true, text: provDef?.name ?? provider }
    : { ok: false, text: provDef?.name ?? provider };

  const activeSession = convId ? projects.getConversation(convId) : undefined;
  const sessionTitle = activeSession?.title ?? 'New session';
  const sessionLetter = (sessionTitle.replace(/\s+/g, ' ').trim().charAt(0) || 'N').toUpperCase();
  const fileCount =
    attachments.length +
    messages.reduce((n, m) => n + (((m as ChatMessage & { attachments?: unknown[] }).attachments)?.length ?? 0), 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: tokens.bg, overflow: 'hidden' }}>
      {/* Top app bar: app switcher · session tab chip · new tab */}
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `0 ${tokens.space2}px`, height: 56, flexShrink: 0, borderBottom: `1px solid ${tokens.border}`, background: tokens.bgElevated }}>
        <IconBtn title="All screens" onClick={() => onNavigate?.('dashboard')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        </IconBtn>

        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <button
            onClick={() => setSessionsOpen((v) => !v)}
            title="Switch session"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space1}px ${tokens.space2}px`, background: tokens.bgSubtle, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusFull, cursor: 'pointer', fontFamily: tokens.fontSans, color: tokens.text, minWidth: 0 }}
          >
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: tokens.surface, color: tokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: tokens.fontSizeSm, flexShrink: 0 }}>{sessionLetter}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: tokens.fontSizeSm, textAlign: 'left' }}>{sessionTitle}</span>
            {convId && (
              <span
                role="button"
                title="Close session"
                onClick={(e) => { e.stopPropagation(); setConvId(null); setMessages([]); }}
                style={{ color: tokens.textMuted, fontSize: 14, padding: 4, lineHeight: 1 }}
              >×</span>
            )}
          </button>

          {sessionsOpen && (
            <SessionPopover
              sessions={filteredSessions}
              activeId={convId}
              search={search}
              setSearch={setSearch}
              onNew={newSession}
              onSelect={selectSession}
              onClose={() => setSessionsOpen(false)}
              onRename={startRename}
              onCommitRename={commitRename}
              onCancelRename={() => setRenaming(null)}
              renaming={renaming}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onClear={clearSession}
              onDelete={deleteSession}
            />
          )}
        </div>

        <IconBtn title="New chat" onClick={newSession}>+</IconBtn>
      </div>

      {/* Secondary tab bar: Session | Files Changed */}
      <div style={{ display: 'flex', gap: tokens.space4, padding: `0 ${tokens.space3}px`, flexShrink: 0, borderBottom: `1px solid ${tokens.border}`, background: tokens.bgElevated }}>
        <SubTab active={subtab === 'session'} onClick={() => setSubtab('session')}>Session</SubTab>
        <SubTab active={subtab === 'files'} onClick={() => setSubtab('files')}>Files Changed{fileCount > 0 ? ` ${fileCount}` : ''}</SubTab>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Content header: title · spinner · overflow menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space3}px ${tokens.space4}px`, flexShrink: 0, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sessionTitle}</div>
          {streaming && <Spinner size={16} color={tokens.primary} />}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <IconBtn small title="Session actions" onClick={() => setOverflowOpen((v) => !v)}>···</IconBtn>
            {overflowOpen && (
              <OverflowMenu
                hasSession={!!convId}
                onRename={() => { setOverflowOpen(false); if (convId) startRename(convId, activeSession?.title ?? ''); }}
                onShare={() => { setOverflowOpen(false); void shareSession(); }}
                onExport={() => { setOverflowOpen(false); exportSession(); }}
                onDelete={() => { setOverflowOpen(false); if (convId) deleteSession(convId); }}
                onClose={() => setOverflowOpen(false)}
              />
            )}
          </div>
        </div>

        {/* Body */}
        {subtab === 'session' ? (
          <div ref={messagesRef} onScroll={onScrollBody} style={{ flex: 1, overflowY: 'auto', padding: tokens.space4, position: 'relative', display: 'flex', flexDirection: 'column', gap: tokens.space4 }}>
            {!connected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, padding: `${tokens.space2}px ${tokens.space3}px`, borderRadius: tokens.radiusMd, border: `1px solid ${tokens.border}`, background: `linear-gradient(90deg, ${tokens.warning}1f, ${tokens.bgElevated})`, flexWrap: 'wrap' }}>
                <span style={{ fontSize: tokens.fontSizeMd }}>⚠️</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{connStatus.text} isn't connected</div>
                  <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary }}>Add your API key to get real responses.</div>
                </div>
                <Button size="sm" onClick={() => onNavigate?.('keys')}>Connect provider</Button>
              </div>
            )}

            {messages.length === 0 ? (
              <div style={{ margin: 'auto', maxWidth: 520, textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: tokens.radiusLg, background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: tokens.fontSizeXl, boxShadow: tokens.shadowMd }}>{sessionLetter}</div>
                <div style={{ fontSize: tokens.fontSizeLg, fontWeight: 700, marginBottom: tokens.space2 }}>What can I help you build?</div>
                <p style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm, margin: '0 0 24px', lineHeight: 1.6 }}>
                  {model ? <><Badge color={tokens.primary}>{model.split('/').pop()}</Badge> will respond in real time.</> : 'Pick a model to get started.'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: tokens.space2 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => handleSend(s)} style={{ textAlign: 'left', padding: tokens.space3, borderRadius: tokens.radiusMd, border: `1px solid ${tokens.borderStrong}`, background: tokens.surface, color: tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeSm, lineHeight: 1.4 }}>
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

            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: tokens.space2, flexWrap: 'wrap' }}>
                {attachments.map((a) => <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />)}
              </div>
            )}
            <div ref={bottomRef} />

            {!pinnedToBottom && messages.length > 0 && (
              <button
                onClick={() => { setPinnedToBottom(true); setSubtab('session'); requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })); }}
                title="Scroll to bottom"
                style={{ position: 'sticky', bottom: tokens.space2, left: '50%', transform: 'translateX(-50%)', width: 40, height: 40, borderRadius: '50%', border: `1px solid ${tokens.borderStrong}`, background: tokens.bgElevated, color: tokens.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: tokens.shadowMd, flexShrink: 0, marginLeft: 'auto', marginRight: 'auto' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m0 0l-5-5m5 5l5-5" /></svg>
              </button>
            )}
          </div>
        ) : (
          <FilesPanel
            attachments={attachments}
            messages={messages}
            selectedSkills={selectedSkills}
            onToggleSkill={toggleSkill}
          />
        )}

        {linkDraft.open && (
          <div style={{ display: 'flex', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space4}px`, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${tokens.border}` }}>
            <div style={{ flex: 1, minWidth: 160 }}><Input value={linkDraft.url} onChange={(v) => setLinkDraft((d) => ({ ...d, url: v }))} placeholder="https://…" onEnter={addLink} /></div>
            <div style={{ flex: 1, minWidth: 140 }}><Input value={linkDraft.title} onChange={(v) => setLinkDraft((d) => ({ ...d, title: v }))} placeholder="Label (optional)" /></div>
            <Button size="sm" onClick={addLink} disabled={!linkDraft.url.trim()}>Add link</Button>
          </div>
        )}
      </div>

      {/* Fixed bottom composer */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${tokens.border}`, background: tokens.bgElevated }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: tokens.space3, position: 'relative' }}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 0, background: tokens.bg, border: `1.5px dashed ${paramsOpen ? tokens.primary : tokens.borderStrong}`, borderRadius: tokens.radiusLg, padding: tokens.space2, transition: 'border-color 0.12s ease' }}
          >
            {/* input */}
            <textarea
              ref={textareaRef}
              rows={2}
              placeholder="Message AcodeDev… (Enter to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setContextOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
              }}
              style={{ width: '100%', background: 'transparent', border: 'none', color: tokens.text, padding: `${tokens.space1}px ${tokens.space2}px`, fontSize: tokens.fontSizeMd, fontFamily: tokens.fontSans, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5, minHeight: 44, maxHeight: 220 }}
            />
            {/* toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space1 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <IconBtn tiny title="Add attachment" onClick={() => setAttachOpen((o) => !o)} active={attachOpen}>+</IconBtn>
                {attachOpen && (
                  <AddMenu
                    onFile={() => { setAttachOpen(false); fileRef.current?.click(); }}
                    onFolder={() => { setAttachOpen(false); folderRef.current?.click(); }}
                    onLink={() => { setAttachOpen(false); setLinkDraft((d) => ({ ...d, open: !d.open })); }}
                    onClose={() => setAttachOpen(false)}
                  />
                )}
              </div>

              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <button
                  onClick={() => setParamsOpen((o) => !o)}
                  title="Model & settings"
                  style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, maxWidth: '100%', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: tokens.fontSans, color: tokens.textSecondary, fontSize: tokens.fontSizeSm, padding: `${tokens.space1}px ${tokens.space2}px`, overflow: 'hidden' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="9" cy="5" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="7" cy="19" r="2" /></svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.split('/').pop() || 'Select model'}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {paramsOpen && (
                  <ParamsMenu
                    showParams={showParams}
                    setShowParams={setShowParams}
                    temperature={temperature}
                    setTemperature={setTemperature}
                    maxTokens={maxTokens}
                    setMaxTokens={setMaxTokens}
                    onClose={() => setParamsOpen(false)}
                    provider={provider}
                    setProvider={setProvider}
                    freeOnly={freeOnly}
                    setFreeOnly={setFreeOnly}
                    minContext={minContext}
                    setMinContext={setMinContext}
                    models={providerModels}
                    model={model}
                    setModel={setModel}
                  />
                )}
              </div>

              <div style={{ flexShrink: 0 }}>
                <button
                  onClick={() => void handleSend()}
                  disabled={(!input.trim() && attachments.length === 0) || streaming}
                  title="Send"
                  aria-label="Send"
                  style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: (!input.trim() && attachments.length === 0) || streaming ? tokens.surfaceHover : tokens.primary, color: (!input.trim() && attachments.length === 0) || streaming ? tokens.textMuted : '#fff', cursor: (!input.trim() && attachments.length === 0) || streaming ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  {streaming ? <Spinner size={16} color="#fff" /> : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m0 0l-6 6m6-6l6 6" /></svg>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: tokens.space1, fontSize: tokens.fontSizeXs, color: tokens.textMuted, textAlign: 'center' }}>
            Responses are generated by the selected model. AI can make mistakes — verify important output.
          </div>
        </div>
      </div>

      {/* Attachments/skill toolbars & hidden inputs */}
      {attachOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 120 }}>
          <div onClick={() => setAttachOpen(false)} style={{ position: 'absolute', inset: 0 }} />
        </div>
      )}
      {skillOpen && (
        <SkillsMenu
          selected={selectedSkills}
          onToggle={toggleSkill}
          onClose={() => setSkillOpen(false)}
        />
      )}
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={onPickFiles} />
      <input ref={folderRef} type="file" multiple style={{ display: 'none' }} {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={onPickFolder} />
    </div>
  );
}

function IconBtn({ title, onClick, children, active, small, tiny }: { title: string; onClick: () => void; children: React.ReactNode; active?: boolean; small?: boolean; tiny?: boolean }) {
  const { tokens } = useTheme();
  const w = tiny ? 34 : small ? 38 : 44;
  return (
    <button
      title={title}
      onClick={onClick}
      style={{ background: active ? `${tokens.primary}1a` : 'transparent', border: `1px solid ${active ? tokens.primary : 'transparent'}`, borderRadius: tokens.radiusMd, width: w, height: w, cursor: 'pointer', fontSize: small || tiny ? 16 : 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: active ? tokens.primary : tokens.textSecondary, transition: 'background 0.12s ease' }}
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


/* ------------------------------------------------------------------ */
/* Context strip: horizontal, wide, below header, collapsible          */
/* ------------------------------------------------------------------ */
function ContextStrip({
  open, onToggle, skills, capabilities, attachmentCount, onOpenAttach, onOpenSkills,
}: {
  open: boolean;
  onToggle: () => void;
  skills: string[];
  capabilities: ModelCapability[];
  attachmentCount: number;
  onOpenAttach: () => void;
  onOpenSkills: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <div style={{ marginBottom: tokens.space2 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space2,
          padding: `${tokens.space1 + 4}px ${tokens.space3}px`,
          border: `1px solid ${tokens.borderStrong}`,
          borderRadius: tokens.radiusMd,
          background: open ? `${tokens.primary}0d` : tokens.bg,
          cursor: 'pointer',
          fontFamily: tokens.fontSans,
          color: tokens.textSecondary,
          fontSize: tokens.fontSizeSm,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14, color: tokens.primary, width: 16, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>▶</span>
        <span style={{ fontWeight: 600, color: tokens.text }}>Chat context</span>
        {capabilities.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {CAP_ORDER.filter((c) => capabilities.includes(c)).slice(0, 6).map((c) => (
              <Badge key={c} color={tokens.success}>{CAPABILITY_LABELS[c]}</Badge>
            ))}
          </span>
        )}
        {skills.length > 0 && (
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {skills.map((id) => {
              const s = getSkill(id);
              return <Badge key={id} color={tokens.primary}>{s?.icon} {s?.name}</Badge>;
            })}
          </span>
        )}
        {attachmentCount > 0 && <Badge color={tokens.accent}>📎 {attachmentCount}</Badge>}
        {open && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: tokens.space2, alignItems: 'center' }}>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onOpenAttach(); }}
              style={{ color: tokens.primary, fontWeight: 600 }}
            >+ Attach</span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onOpenSkills(); }}
              style={{ color: tokens.primary, fontWeight: 600 }}
            >+ Skill</span>
          </span>
        )}
      </button>
    </div>
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

/* ------------------------------------------------------------------ */
/* "+" attachment submenu (anchored above the button)                  */
/* ------------------------------------------------------------------ */
function AddMenu({ onFile, onFolder, onLink, onClose }: { onFile: () => void; onFolder: () => void; onLink: () => void; onClose: () => void }) {
  const { tokens } = useTheme();
  const items = [
    { icon: '📄', label: 'File', fn: onFile },
    { icon: '🖼', label: 'Image', fn: onFile },
    { icon: '📁', label: 'Folder', fn: onFolder },
    { icon: '◫', label: 'SVG', fn: onFile },
    { icon: '⬡', label: 'draw.io', fn: onFile },
    { icon: '🔗', label: 'Link', fn: onLink },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 71, width: 220, background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, boxShadow: tokens.shadowLg, padding: tokens.space1 }}>
        <div style={{ padding: `${tokens.space1}px ${tokens.space2}px`, fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontWeight: 600 }}>Add attachment</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.space1 }}>
          {items.map((it) => (
            <button key={it.label} onClick={() => it.fn()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: `${tokens.space2}px 4px`, border: `1px dashed ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, background: tokens.bg, cursor: 'pointer', color: tokens.textSecondary, fontFamily: tokens.fontSans, fontSize: tokens.fontSizeXs }}>
              <span style={{ fontSize: 18 }}>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Skills popup (anchored above the ✨ button)                          */
/* ------------------------------------------------------------------ */
function SkillsMenu({ selected, onToggle, onClose }: { selected: string[]; onToggle: (id: string) => void; onClose: () => void }) {
  const { tokens } = useTheme();
  const groups = [...new Set(BUILTIN_SKILLS.map((s) => s.group))];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 71, width: 320, maxHeight: '60vh', overflowY: 'auto', background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, boxShadow: tokens.shadowLg, padding: tokens.space2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space1 }}>
          <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 700 }}>Skills</div>
          {selected.length > 0 && (
            <button onClick={() => { selected.slice().forEach((id) => onToggle(id)); }} style={{ background: 'transparent', border: 'none', color: tokens.primary, cursor: 'pointer', fontSize: tokens.fontSizeXs, fontFamily: tokens.fontSans }}>Clear all</button>
          )}
        </div>
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: tokens.space2 }}>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{g}</div>
            {BUILTIN_SKILLS.filter((s) => s.group === g).map((s) => (
              <SkillRow key={s.id} skill={s} active={selected.includes(s.id)} onToggle={() => onToggle(s.id)} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Model + generation settings popup (anchored above the branch chip)    */
/* ------------------------------------------------------------------ */
function ParamsMenu({ provider, setProvider, models, model, setModel, freeOnly, setFreeOnly, minContext, setMinContext, showParams, setShowParams, temperature, setTemperature, maxTokens, setMaxTokens, onClose }:
  {
    provider: ProviderId;
    setProvider: (v: ProviderId) => void;
    models: { id: string; name: string; isFree?: boolean; contextWindow?: number }[];
    model: string;
    setModel: (v: string) => void;
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
    onClose: () => void;
  }) {
  const { tokens } = useTheme();
  const context = formatContext(models.find((m) => m.id === model)?.contextWindow ?? 0);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, zIndex: 71, width: 340, maxHeight: '70vh', overflowY: 'auto', background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, boxShadow: tokens.shadowLg, padding: tokens.space3 }}>
        <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 700, marginBottom: tokens.space2 }}>Model</div>
        <Select label="Provider" value={provider} onChange={(v) => { setProvider(v as ProviderId); setModel(models[0]?.id ?? ''); }} options={[
          ...gatewayProvidersLocal().map((p) => ({ label: `${p.name} · gateway`, value: p.id })),
          ...directProvidersLocal().map((p) => ({ label: p.name, value: p.id })),
        ]} />
        <div style={{ marginTop: tokens.space2 }}>
          <Select label={`Model · ${context} ctx`} value={model} onChange={setModel} options={models.map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''} · ${formatContext(m.contextWindow ?? 0)} ctx`, value: m.id }))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginTop: tokens.space3 }}>
          <Toggle checked={freeOnly} onChange={setFreeOnly} label="Free only" />
          <div style={{ width: 86, flexShrink: 0 }}>
            <Input value={minContext} onChange={setMinContext} placeholder="min ctx" />
          </div>
        </div>
        <div style={{ height: 1, background: tokens.border, margin: `${tokens.space3}px 0` }} />
        <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 700, marginBottom: tokens.space2 }}>Generation</div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space2 }}>
          <span style={{ fontSize: tokens.fontSizeSm }}>Advanced</span>
          <input type="checkbox" checked={showParams} onChange={() => setShowParams((s) => !s)} />
        </label>
        {showParams && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
            <Input label={`Temperature: ${temperature}`} value={String(temperature)} onChange={(v) => setTemperature(Math.max(0, Math.min(2, Number(v) || 0)))} type="number" />
            <Input label="Max tokens" value={String(maxTokens)} onChange={(v) => setMaxTokens(Math.max(1, Number(v) || 2048))} type="number" />
          </div>
        )}
      </div>
    </>
  );
}

function gatewayProvidersLocal() {
  return listProviders().filter((p) => p.gateway);
}
function directProvidersLocal() {
  return listProviders().filter((p) => !p.gateway && p.id !== 'local');
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

function MenuItem({ label, icon, onClick, danger, disabled }: { label: string; icon: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ width: '100%', textAlign: 'left', padding: `${tokens.space1}px ${tokens.space2}px`, background: 'transparent', border: 'none', borderRadius: tokens.radiusSm, color: disabled ? tokens.textMuted : danger ? tokens.danger : tokens.text, fontSize: tokens.fontSizeSm, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: tokens.fontSans, opacity: disabled ? 0.6 : 1 }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = tokens.surfaceHover; }}
      onMouseLeave={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
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

/* ------------------------------------------------------------------ */
/* Secondary tab (Session | Files Changed)                             */
/* ------------------------------------------------------------------ */
function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: tokens.fontSans,
        fontSize: tokens.fontSizeMd,
        fontWeight: active ? 700 : 500,
        color: active ? tokens.text : tokens.textMuted,
        padding: `${tokens.space3}px ${tokens.space1}px`,
        position: 'relative',
      }}
    >
      {children}
      {active && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: tokens.primary, borderRadius: tokens.radiusFull }} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Overflow menu (···): Rename / Share / Export / Archive / Delete      */
/* ------------------------------------------------------------------ */
function OverflowMenu({ hasSession, onRename, onShare, onExport, onDelete, onClose }: {
  hasSession: boolean;
  onRename: () => void;
  onShare: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 71, minWidth: 180, background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, boxShadow: tokens.shadowLg, padding: tokens.space1 }}>
        <MenuItem label="Rename" icon="✎" onClick={onRename} />
        <MenuItem label="Share…" icon="↗" onClick={onShare} />
        <MenuItem label="Export…" icon="↓" onClick={onExport} />
        <MenuItem label="Archive" icon="🗂" onClick={onClose} />
        <div style={{ height: 1, background: tokens.border, margin: `${tokens.space1}px 0` }} />
        <MenuItem label="Delete…" icon="🗑" danger onClick={onDelete} disabled={!hasSession} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Session switcher popover (from the top session chip)                 */
/* ------------------------------------------------------------------ */
function SessionPopover({ sessions, activeId, search, setSearch, onNew, onSelect, onClose, onRename, onCommitRename, onCancelRename, renaming, renameValue, setRenameValue, onClear, onDelete }: {
  sessions: Conversation[];
  activeId: string | null;
  search: string;
  setSearch: (v: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRename: (id: string, current: string) => void;
  onCommitRename: (id: string) => void;
  onCancelRename: () => void;
  renaming: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onClear: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { tokens } = useTheme();
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70 }} />
      <div className="rise" style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 71, maxHeight: '60vh', overflowY: 'auto', background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, boxShadow: tokens.shadowLg, padding: tokens.space2 }}>
        <div style={{ marginBottom: tokens.space2 }}>
          <Input value={search} onChange={setSearch} placeholder="Search sessions…" />
        </div>
        <Button full size="sm" variant="secondary" onClick={onNew}>+ New chat</Button>
        <div style={{ marginTop: tokens.space2, fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontWeight: 600, padding: `0 ${tokens.space1}px` }}>SESSIONS ({sessions.length})</div>
        <div style={{ marginTop: 4 }}>
          {sessions.length === 0 ? (
            <div style={{ padding: tokens.space2, fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>No chats yet. Start a new chat!</div>
          ) : (
            sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === activeId}
                renaming={renaming === s.id}
                renameValue={renameValue}
                onRenameValue={setRenameValue}
                onClick={() => { onSelect(s.id); onClose(); }}
                onRename={() => onRename(s.id, s.title)}
                onCommitRename={() => onCommitRename(s.id)}
                onCancelRename={onCancelRename}
                onClear={() => onClear(s.id)}
                onDelete={() => onDelete(s.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Files Changed panel (sub-tab)                                        */
/* ------------------------------------------------------------------ */
function FilesPanel({ attachments, messages, selectedSkills, onToggleSkill }: { attachments: ChatAttachment[]; messages: ChatMessage[]; selectedSkills: string[]; onToggleSkill: (id: string) => void }) {
  const { tokens } = useTheme();
  const msgFiles = messages.flatMap((m) => (m as ChatMessage & { attachments?: ChatAttachment[] }).attachments ?? []);
  const all = [...attachments, ...msgFiles];
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: tokens.space4 }}>
      {all.length === 0 ? (
        <div style={{ textAlign: 'center', padding: tokens.space6, color: tokens.textMuted, fontSize: tokens.fontSizeSm }}>
          No external files changed in this session.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2, marginBottom: tokens.space4 }}>
          {all.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, background: tokens.bgSubtle }}>
              <span style={{ fontSize: 16 }}>{kindIcon[a.kind]}</span>
              <span style={{ flex: 1, fontSize: tokens.fontSizeSm, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
                {a.kind === 'folder' ? `${a.children?.length ?? 0} files` : a.kind === 'link' ? 'link' : a.kind}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontWeight: 600, textTransform: 'uppercase', marginBottom: tokens.space1 }}>Context & Skills</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {BUILTIN_SKILLS.map((s) => (
          <SkillRow key={s.id} skill={s} active={selectedSkills.includes(s.id)} onToggle={() => onToggleSkill(s.id)} />
        ))}
      </div>
    </div>
  );
}
