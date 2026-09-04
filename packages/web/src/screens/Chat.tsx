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

const FILE_EXT_RE = /\.(?:[a-z0-9]+)$/i;
function extractChangedFiles(content: string): string[] {
  const found = new Set<string>();
  const entry = /```[^\n]*\s+([^\s`]+)\s*\n/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(content)) !== null) {
    const raw = m[1].split(':')[0].trim();
    const path = raw.replace(/^\.{1,2}\//, '').replace(/^[/\\]/, '').replace(/[`'""]/g, '');
    if (
      path &&
      !path.startsWith('```') &&
      path.split('/').length >= 1 &&
      /^[\w.-]+(\/[\w.@-]+)+$/.test(path) &&
      FILE_EXT_RE.test(path.split('/').pop() ?? '')
    ) {
      found.add(path);
    }
  }
  return [...found];
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

type SessionTab = { id: string; title: string; convId: string | null };

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
  const [freeOnly, setFreeOnly] = useState(true);
  const [minContext, setMinContext] = useState('0');
  const [convId, setConvId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [subtab, setSubtab] = useState<'session' | 'files'>('session');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [changedFiles, setChangedFiles] = useState<{ path: string; status: string; changedAt: number }[]>([]);
  const [tabs, setTabs] = useState<SessionTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const [contextOpen, setContextOpen] = useState(!isMobile);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [linkDraft, setLinkDraft] = useState({ open: false, url: '', title: '' });
  const [attachOpen, setAttachOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

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

  const refreshChangedFiles = useCallback(() => {
    setChangedFiles((projects.changedFilesFor(convId) ?? []) as { path: string; status: string; changedAt: number }[]);
  }, [projects, convId]);

  useEffect(() => {
    refreshSessions();
    refreshChangedFiles();
  }, [refreshSessions, refreshChangedFiles]);

  useEffect(() => {
    if (!providerModels.some((m) => m.id === model)) {
      setModel(providerModels[0]?.id ?? '');
    }
  }, [provider, freeOnly]);

  useEffect(() => {
    if (!convId) {
      setMessages([]);
      return;
    }
    const conv = projects.getConversation(convId);
    setMessages(conv ? conv.messages.filter((m) => m.role !== 'system') : []);
    setProvider(conv?.provider ?? 'openrouter');
    setModel(conv?.model ?? providerModels[0]?.id ?? '');
  }, [convId]);

  useEffect(() => {
    if (pinnedToBottom) bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming, pinnedToBottom, subtab]);

  const onScrollBody = () => {
    const el = messagesRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setPinnedToBottom(nearBottom);
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }
  }, [input]);

  const syncTabFromConv = useCallback((tabId: string, cid: string | null) => {
    setTabs((prev) => prev.map((t) => {
      if (t.id !== tabId) return t;
      if (!cid) return { ...t, title: 'New session', convId: null };
      const conv = projects.getConversation(cid);
      return { ...t, title: conv?.title ?? 'New session', convId: cid };
    }));
  }, [projects]);

  const selectTab = (tabId: string) => {
    setActiveTab(tabId);
    const tab = tabs.find((t) => t.id === tabId);
    if (tab) {
      setConvId(tab.convId);
      setAttachments([]);
    }
  };

  const newSession = () => {
    const conv = projects.createConversation({
      title: 'New session',
      projectId: currentProjectId ?? undefined,
      provider,
      model,
    });
    refreshSessions();
    const tabId = `tab-${Date.now()}`;
    const newTab: SessionTab = { id: tabId, title: conv.title, convId: conv.id };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(tabId);
    setConvId(conv.id);
    setMessages([]);
    setAttachments([]);
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) {
        const conv = projects.createConversation({
          title: 'New session',
          projectId: currentProjectId ?? undefined,
          provider,
          model,
        });
        refreshSessions();
        const newTab: SessionTab = { id: `tab-${Date.now()}`, title: conv.title, convId: conv.id };
        setActiveTab(newTab.id);
        setConvId(conv.id);
        return [newTab];
      }
      if (activeTab === tabId) {
        const last = next[next.length - 1];
        setActiveTab(last.id);
        setConvId(last.convId);
      }
      return next;
    });
  };

  const deleteSession = (id: string) => {
    projects.deleteConversation(id);
    refreshSessions();
    setTabs((prev) => {
      const next = prev.filter((t) => t.convId !== id);
      if (next.length === 0) {
        const conv = projects.createConversation({
          title: 'New session',
          projectId: currentProjectId ?? undefined,
          provider,
          model,
        });
        refreshSessions();
        const newTab: SessionTab = { id: `tab-${Date.now()}`, title: conv.title, convId: conv.id };
        setActiveTab(newTab.id);
        setConvId(conv.id);
        return [newTab];
      }
      if (convId === id) {
        const last = next[next.length - 1];
        setActiveTab(last.id);
        setConvId(last.convId);
      }
      return next;
    });
    if (convId === id) {
      setConvId(null);
      setMessages([]);
    }
  };

  const renameSession = (id: string, title: string) => {
    projects.renameConversation(id, title);
    refreshSessions();
    setTabs((prev) => prev.map((t) => t.convId === id ? { ...t, title } : t));
  };

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

  const toggleSkill = (id: string) => {
    setSelectedSkills((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleSend = async (text?: string) => {
    const raw = (text ?? input).trim();
    if ((!raw && attachments.length === 0) || streaming) return;
    setInput('');

    let cid = convId;
    if (!cid) {
      const conv = projects.createConversation({
        title: raw.slice(0, 40) || 'New session',
        projectId: currentProjectId ?? undefined,
        provider,
        model,
      });
      cid = conv.id;
      setConvId(cid);
      const tabId = activeTab ?? `tab-${Date.now()}`;
      setTabs((prev) => {
        const existing = prev.find((t) => t.id === tabId);
        if (existing) return prev.map((t) => t.id === tabId ? { ...t, convId: cid, title: raw.slice(0, 40) || 'New session' } : t);
        return [...prev, { id: tabId, title: raw.slice(0, 40) || 'New session', convId: cid }];
      });
      setActiveTab(tabId);
      refreshSessions();
    }

    const conv = projects.getConversation(cid)!;
    if ((conv.title === 'New session' || conv.title === 'New chat') && raw) {
      projects.renameConversation(cid, raw.slice(0, 40));
      refreshSessions();
      setTabs((prev) => prev.map((t) => t.convId === cid ? { ...t, title: raw.slice(0, 40) } : t));
    }

    const userMsg: ChatMessage = { role: 'user', content: raw, attachments };
    projects.appendMessage(cid, userMsg);
    const devStorage = projects.getConversation(cid)!;
    const prior = devStorage.messages.filter((m) => m.role !== 'system');
    setMessages([...prior]);
    setAttachments([]);

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
      extractChangedFiles(full).forEach((p) => projects.addChangedFile(cid, p, 'modified'));
    } catch (e) {
      const errMsg = `⚠️ ${e instanceof Error ? e.message : String(e)}\n\nTip: check your API key or connectivity.`;
      setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: errMsg } : m)));
    }
    if (!full && contentStreamed === false) {
      try {
        const res = await chat.chat(body);
        const text = res.content ?? '';
        if (text) {
          full = text;
          setMessages((prev) => prev.map((m) => (m.name === assistantId ? { role: 'assistant', content: text } : m)));
          projects.appendMessage(cid, { role: 'assistant', content: text });
          extractChangedFiles(text).forEach((p) => projects.addChangedFile(cid, p, 'modified'));
        }
      } catch {
        /* keep whatever the stream produced */
      }
    }
    setStreaming(false);
    refreshSessions();
    refreshChangedFiles();
  };

  const filteredSessions = sessions.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()),
  );

  const activeSession = convId ? projects.getConversation(convId) : undefined;
  const sessionTitle = activeSession?.title ?? 'New session';
  const sessionLetter = (sessionTitle.replace(/\s+/g, ' ').trim().charAt(0) || 'N').toUpperCase();
  const fileCount = changedFiles.length;

  const activeTabObj = tabs.find((t) => t.id === activeTab);

  useEffect(() => {
    if (tabs.length === 0) {
      newSession();
    }
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: tokens.bg, overflow: 'hidden' }}>
      {/* Top app bar: grid button · session tabs · + button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space1, padding: `0 ${tokens.space2}px`, height: 44, flexShrink: 0, borderBottom: `1px solid ${tokens.border}`, background: tokens.bgElevated, overflowX: 'auto', overflowY: 'hidden' }}>
        <button
          title="All screens"
          onClick={() => onNavigate?.('dashboard')}
          style={{ width: 32, height: 32, borderRadius: tokens.radiusMd, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.textSecondary, flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        </button>

        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            style={{ display: 'flex', alignItems: 'center', gap: tokens.space1, padding: `4px ${tokens.space2}px`, borderRadius: tokens.radiusMd, background: tab.id === activeTab ? tokens.surface : 'transparent', border: `1px solid ${tab.id === activeTab ? tokens.borderStrong : 'transparent'}`, cursor: 'pointer', flexShrink: 0, maxWidth: 200, transition: 'background 0.1s ease' }}
          >
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>
              {tab.title.replace(/\s+/g, ' ').trim().charAt(0).toUpperCase() || 'P'}
            </span>
            <span style={{ fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tab.id === activeTab ? tokens.text : tokens.textSecondary, maxWidth: 120 }}>
              {tab.title}
            </span>
            <button
              title="Close tab"
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              style={{ width: 18, height: 18, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.textMuted, fontSize: 12, flexShrink: 0 }}
            >×</button>
          </div>
        ))}

        <button
          title="New session"
          onClick={newSession}
          style={{ width: 32, height: 32, borderRadius: tokens.radiusMd, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: tokens.textSecondary, flexShrink: 0, fontSize: 18 }}
        >+</button>
      </div>

      {/* Secondary tab bar: Session | Files Changed */}
      <div style={{ display: 'flex', gap: tokens.space4, padding: `0 ${tokens.space3}px`, flexShrink: 0, borderBottom: `1px solid ${tokens.border}`, background: tokens.bgElevated }}>
        <SubTab active={subtab === 'session'} onClick={() => setSubtab('session')}>Session</SubTab>
        <SubTab active={subtab === 'files'} onClick={() => setSubtab('files')}>Files Changed {fileCount > 0 ? fileCount : ''}</SubTab>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Content header: title · spinner · overflow menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space3}px ${tokens.space4}px`, flexShrink: 0, borderBottom: `1px solid ${tokens.border}` }}>
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sessionTitle}</div>
          {streaming && <Spinner size={16} color={tokens.primary} />}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              title="Session actions"
              onClick={() => setOverflowOpen((v) => !v)}
              style={{ background: 'transparent', border: 'none', color: tokens.textSecondary, cursor: 'pointer', padding: tokens.space1, fontSize: 18, lineHeight: 1 }}
            >···</button>
            {overflowOpen && (
              <OverflowMenu
                hasSession={!!convId}
                onNewSession={() => { setOverflowOpen(false); newSession(); }}
                onRename={() => {
                  setOverflowOpen(false);
                  if (convId) {
                    const title = prompt('Rename session', sessionTitle);
                    if (title !== null && title.trim()) renameSession(convId, title.trim());
                  }
                }}
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
                  <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{provDef?.name ?? provider} isn't connected</div>
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
          <FilesPanel changedFiles={changedFiles} />
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
            <textarea
              ref={textareaRef}
              rows={2}
              placeholder="Ask anything, / for commands, @ for context..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setContextOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
              }}
              style={{ width: '100%', background: 'transparent', border: 'none', color: tokens.text, padding: `${tokens.space1}px ${tokens.space2}px`, fontSize: tokens.fontSizeMd, fontFamily: tokens.fontSans, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5, minHeight: 44, maxHeight: 220 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space1 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  title="Add attachment"
                  onClick={() => setAttachOpen((o) => !o)}
                  style={{ width: 34, height: 34, borderRadius: tokens.radiusMd, background: attachOpen ? `${tokens.primary}1a` : 'transparent', border: `1px solid ${attachOpen ? tokens.primary : 'transparent'}`, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: attachOpen ? tokens.primary : tokens.textSecondary }}
                >+</button>
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
                    freeOnly={freeOnly}
                    setFreeOnly={setFreeOnly}
                    temperature={temperature}
                    setTemperature={setTemperature}
                    maxTokens={maxTokens}
                    setMaxTokens={setMaxTokens}
                    onClose={() => setParamsOpen(false)}
                    provider={provider}
                    setProvider={setProvider}
                    minContext={minContext}
                    setMinContext={setMinContext}
                    models={providerModels}
                    model={model}
                    setModel={setModel}
                    gatewayProviders={gatewayProviders}
                    directProviders={directProviders}
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

      {attachOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 120 }}>
          <div onClick={() => setAttachOpen(false)} style={{ position: 'absolute', inset: 0 }} />
        </div>
      )}
      <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={onPickFiles} />
      <input ref={folderRef} type="file" multiple style={{ display: 'none' }} {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={onPickFolder} />
    </div>
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

function ParamsMenu({ provider, setProvider, gatewayProviders, directProviders, models, model, setModel, freeOnly, setFreeOnly, minContext, setMinContext, temperature, setTemperature, maxTokens, setMaxTokens, onClose }: {
  provider: ProviderId;
  setProvider: (v: ProviderId) => void;
  gatewayProviders: { id: string; name: string }[];
  directProviders: { id: string; name: string }[];
  models: { id: string; name: string; isFree?: boolean; contextWindow?: number }[];
  model: string;
  setModel: (v: string) => void;
  freeOnly: boolean;
  setFreeOnly: (v: boolean) => void;
  minContext: string;
  setMinContext: (v: string) => void;
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
          ...gatewayProviders.map((p) => ({ label: `${p.name} · gateway`, value: p.id })),
          ...directProviders.map((p) => ({ label: p.name, value: p.id })),
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
          <input type="checkbox" checked={temperature !== 0.7 || maxTokens !== 2048} onChange={() => {}} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
          <Input label={`Temperature: ${temperature}`} value={String(temperature)} onChange={(v) => setTemperature(Math.max(0, Math.min(2, Number(v) || 0)))} type="number" />
          <Input label="Max tokens" value={String(maxTokens)} onChange={(v) => setMaxTokens(Math.max(1, Number(v) || 2048))} type="number" />
        </div>
      </div>
    </>
  );
}

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

function OverflowMenu({ hasSession, onNewSession, onRename, onShare, onExport, onDelete, onClose }: {
  hasSession: boolean;
  onNewSession: () => void;
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
        <MenuItem label="New chat" icon="✦" onClick={onNewSession} />
        <MenuItem label="Rename" icon="✎" onClick={onRename} disabled={!hasSession} />
        <MenuItem label="Share…" icon="↗" onClick={onShare} disabled={!hasSession} />
        <MenuItem label="Export…" icon="↓" onClick={onExport} disabled={!hasSession} />
        <div style={{ height: 1, background: tokens.border, margin: `${tokens.space1}px 0` }} />
        <MenuItem label="Delete…" icon="🗑" danger onClick={onDelete} disabled={!hasSession} />
      </div>
    </>
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
  const [expanded, setExpanded] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(msg.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const renderToolCalls = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      const writeMatch = line.match(/^Write\s+([^\s]+)\s+(.+)$/i);
      if (writeMatch) {
        elements.push(
          <div key={`tool-${i}`} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, background: tokens.bgSubtle, borderRadius: tokens.radiusMd, border: `1px solid ${tokens.border}`, marginBottom: tokens.space1 }}>
            <span style={{ fontSize: tokens.fontSizeXs, fontWeight: 700, color: tokens.success, textTransform: 'uppercase' }}>Write</span>
            <span style={{ fontFamily: tokens.fontMono, fontSize: tokens.fontSizeSm, color: tokens.text }}>{writeMatch[1]}</span>
            <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{writeMatch[2]}</span>
          </div>
        );
        i++;
        continue;
      }

      const shellMatch = line.match(/^Shell\s+(.+)$/i);
      if (shellMatch) {
        const cmd = shellMatch[1];
        let output = '';
        let j = i + 1;
        if (j < lines.length && lines[j].startsWith('```')) {
          j++;
          const outputLines: string[] = [];
          while (j < lines.length && !lines[j].startsWith('```')) {
            outputLines.push(lines[j]);
            j++;
          }
          output = outputLines.join('\n');
          j++;
        }
        elements.push(
          <ShellBlock key={`shell-${i}`} command={cmd} output={output} />
        );
        i = j;
        continue;
      }

      elements.push(
        <div key={`line-${i}`} style={{ marginBottom: tokens.space1 }}>
          <Markdown content={line} />
        </div>
      );
      i++;
    }

    return elements;
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
            <div>{renderToolCalls(msg.content)}</div>
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

function ShellBlock({ command, output }: { command: string; output: string }) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: tokens.space2 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, background: tokens.bgSubtle, borderRadius: tokens.radiusMd, border: `1px solid ${tokens.border}`, cursor: 'pointer' }}
      >
        <span style={{ fontSize: tokens.fontSizeXs, fontWeight: 700, color: tokens.primary, textTransform: 'uppercase' }}>Shell</span>
        <span style={{ flex: 1, fontFamily: tokens.fontMono, fontSize: tokens.fontSizeSm, color: tokens.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{command}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {open && output && (
        <pre style={{ marginTop: tokens.space1, padding: `${tokens.space2}px ${tokens.space3}px`, background: tokens.bg, borderRadius: tokens.radiusMd, border: `1px solid ${tokens.border}`, fontFamily: tokens.fontMono, fontSize: tokens.fontSizeXs, color: tokens.textSecondary, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 300, overflowY: 'auto' }}>
          {output}
        </pre>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { added: 'Added', modified: 'Modified', deleted: 'Deleted' };
const STATUS_COLOR: Record<string, string> = { added: '#2f9e44', modified: '#e6a23c', deleted: '#e03131' };
function FilesPanel({ changedFiles }: { changedFiles: { path: string; status: string }[] }) {
  const { tokens } = useTheme();
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: tokens.space3 }}>
      {changedFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: tokens.space6, color: tokens.textMuted, fontSize: tokens.fontSizeSm }}>
          No files changed in this session yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space1 }}>
          {changedFiles.map((f) => (
            <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, borderRadius: tokens.radiusMd }}>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: tokens.fontSizeXs,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#fff',
                  background: STATUS_COLOR[f.status] ?? tokens.textMuted,
                  padding: `2px 8px`,
                  borderRadius: tokens.radiusFull,
                  width: 76,
                  textAlign: 'center',
                }}
              >
                {STATUS_LABEL[f.status] ?? f.status}
              </span>
              <span style={{ fontFamily: tokens.fontMono, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
