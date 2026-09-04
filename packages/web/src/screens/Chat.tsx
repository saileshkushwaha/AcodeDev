import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../state/AppProvider';
import { Button, Select, Input, Toggle, Spinner, useTheme, Badge, useIsMobile } from '@acode/ui';
import { listModels, listProviders, type ChatMessage, type ProviderId } from '@acode/core';
import type { Conversation } from '@acode/core';
import { Markdown } from '../components/Markdown';

const SYSTEM_PROMPT = 'You are AcodeDev assistant, a helpful AI. Be concise and accurate.';

const SUGGESTIONS = [
  'Explain how a workflow executes a DAG',
  'Summarize what I should build next',
  'Help me debug this code',
  'Write a prompt for code review',
];

function formatContext(n: number): string {
  if (n <= 0) return '?';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function ChatScreen() {
  const { tokens } = useTheme();
  const { chat, projects, currentProjectId } = useApp();
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const { catalogVersion } = useApp();
  void catalogVersion; // re-render when the provider/model catalog updates

  const allProviders = listProviders();
  const gatewayProviders = allProviders.filter((p) => p.gateway);
  const directProviders = allProviders.filter((p) => !p.gateway && p.id !== 'local');
  const minCtx = Number(minContext) || 0;
  const providerModels = listModels(provider).filter((m) => (freeOnly ? m.isFree : true)).filter((m) => (minCtx > 0 ? m.contextWindow >= minCtx : true));

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
    if (!isMobile) setSessionsOpen(true);
  }, [isMobile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);

  const selectSession = (id: string) => {
    setConvId(id);
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

  const handleSend = async (text?: string) => {
    const raw = (text ?? input).trim();
    if (!raw || streaming) return;
    setInput('');

    let cid = convId;
    if (!cid) {
      const conv = projects.createConversation({
        title: raw.slice(0, 40),
        projectId: currentProjectId ?? undefined,
        provider,
        model,
      });
      cid = conv.id;
      setConvId(cid);
      refreshSessions();
    }

    const conv = projects.getConversation(cid)!;
    if (conv.title === 'New chat') {
      projects.renameConversation(cid, raw.slice(0, 40));
      refreshSessions();
    }

    const userMsg: ChatMessage = { role: 'user', content: raw };
    projects.appendMessage(cid, userMsg);
    const devStorage = projects.getConversation(cid)!;
    const prior = devStorage.messages.filter((m) => m.role !== 'system');
    setMessages([...prior]);

    const history: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...prior];

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
              width: isMobile ? 'min(85vw, 320px)' : 280,
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
          <div style={{ width: 220, minWidth: 160 }}>
            <GroupedSelect
              value={provider}
              onChange={(v) => setProvider(v)}
              groups={[
                { label: 'Gateways', options: gatewayProviders.map((p) => ({ label: `${p.name} · many models`, value: p.id })) },
                { label: 'Direct providers', options: directProviders.map((p) => ({ label: p.name, value: p.id })) },
              ]}
            />
          </div>
          <div style={{ width: 260, minWidth: 200 }}>
            <Select value={model} onChange={setModel} options={providerModels.map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''} · ${formatContext(m.contextWindow)} ctx`, value: m.id }))} />
          </div>
          <Toggle checked={freeOnly} onChange={setFreeOnly} label="Free" />
          <div style={{ width: 110, minWidth: 90 }}>
            <Input value={minContext} onChange={setMinContext} placeholder="min ctx" hint="" />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShowParams((s) => !s)}>{showParams ? 'Hide' : 'Params'}</Button>
          {convId && (
            <Button size="sm" variant="ghost" onClick={() => clearSession(convId)}>Clear</Button>
          )}
        </div>

        {showParams && (
          <div style={{ display: 'flex', gap: tokens.space3, padding: tokens.space3, borderBottom: `1px solid ${tokens.border}`, background: tokens.bgSubtle, flexWrap: 'wrap' }}>
            <div style={{ width: 200 }}>
              <Input label={`Temperature: ${temperature}`} value={String(temperature)} onChange={(v) => setTemperature(Math.max(0, Math.min(2, Number(v) || 0)))} type="number" />
            </div>
            <div style={{ width: 200 }}>
              <Input label="Max tokens" value={String(maxTokens)} onChange={(v) => setMaxTokens(Math.max(1, Number(v) || 2048))} type="number" />
            </div>
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
          <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', gap: tokens.space2, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Input
                textarea
                rows={2}
                placeholder="Message AcodeDev…  (Enter to send, Shift+Enter for newline)"
                value={input}
                onChange={setInput}
                onEnter={() => void handleSend()}
              />
            </div>
            <Button onClick={() => void handleSend()} disabled={!input.trim() || streaming} style={{ height: 48, whiteSpace: 'nowrap' }}>
              {streaming ? <Spinner size={16} color="#fff" /> : 'Send'}
            </Button>
          </div>
          <div style={{ maxWidth: 860, margin: `${tokens.space1}px auto 0`, fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
            Responses are generated by the selected model. AI can make mistakes — verify important output.
          </div>
        </div>
      </div>
    </div>
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
        padding: `${tokens.space2}px ${tokens.space3}px`,
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

function GroupedSelect({
  value,
  onChange,
  groups,
}: {
  value: string;
  onChange: (v: string) => void;
  groups: { label: string; options: { label: string; value: string }[] }[];
}) {
  const { tokens } = useTheme();
  const base: React.CSSProperties = {
    width: '100%',
    background: tokens.bg,
    border: `1px solid ${tokens.borderStrong}`,
    borderRadius: tokens.radiusMd,
    color: tokens.text,
    padding: `${tokens.space2}px ${tokens.space3}px`,
    fontSize: tokens.fontSizeSm,
    fontFamily: tokens.fontSans,
    outline: 'none',
    boxSizing: 'border-box',
  };
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={base}>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
