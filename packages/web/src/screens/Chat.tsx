import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Button, Card, Select, Input, Toggle, Spinner, useTheme, Badge } from '@acode/ui';
import { listModels, PROVIDER_LIST, getFreeModels, type ChatMessage, type ProviderId } from '@acode/core';

export function ChatScreen() {
  const { tokens } = useTheme();
  const { chat, vault, projects, currentProjectId } = useApp();
  const [provider, setProvider] = useState<ProviderId>('openrouter');
  const [model, setModel] = useState('meta-llama/llama-3.3-70b-instruct:free');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [showParams, setShowParams] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const providerModels = listModels(provider).filter((m) => (freeOnly ? m.isFree : true));
  useEffect(() => {
    if (!providerModels.some((m) => m.id === model)) {
      setModel(providerModels[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, freeOnly]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const userMsgText = input.trim();
    setInput('');

    let conv = convId ? projects.getConversation(convId) : undefined;
    if (!conv) {
      conv = projects.createConversation({ title: userMsgText.slice(0, 40), projectId: currentProjectId ?? undefined, provider, model });
      setConvId(conv.id);
    }

    const userMsg: ChatMessage = { role: 'user', content: userMsgText };
    projects.appendMessage(conv.id, userMsg);
    const prior = projects.getConversation(conv.id)?.messages.filter((m) => m.role !== 'system') ?? [];
    setMessages([...prior]);

    const sys: ChatMessage = { role: 'system', content: 'You are AcodeDev assistant, a helpful AI. Be concise and accurate.' };
    const history: ChatMessage[] = [sys, ...prior];

    setStreaming(true);
    const assistantId = `assist_${Date.now()}`;
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    let full = '';
    try {
      const ws = await chat.stream({
        provider,
        model,
        messages: history,
        params: { temperature, maxTokens },
      });
      for await (const chunk of ws) {
        full += chunk.delta;
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findIndex((m) => m.role === 'assistant' && 'id' in m && (m as { id?: string }).id === assistantId);
          if (idx >= 0) next[idx] = { role: 'assistant', content: full };
          else next.push({ role: 'assistant', content: full });
          return next;
        });
      }
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        const idx = next.findIndex((m) => m.role === 'assistant' && 'id' in m && (m as { id?: string }).id === assistantId);
        const errText = `⚠️ ${e instanceof Error ? e.message : String(e)}\n\nTip: check your API key or connectivity.`;
        if (idx >= 0) next[idx] = { role: 'assistant', content: errText };
        return next;
      });
    } finally {
      setStreaming(false);
      // persist final message (strip internal id)
      const durable = messages.filter((m) => m.role !== 'system');
      durable.forEach((m) => projects.appendMessage(conv.id, { role: m.role, content: m.content }));
    }
  };

  return (
    <Page maxWidth={1100}>
      <PageHeader
        title="Chat & Playground"
        subtitle="Stream conversations with any free model from any provider"
        actions={
          <>
            <Select
              value={provider}
              onChange={(v) => setProvider(v as ProviderId)}
              options={PROVIDER_LIST.map((p) => ({ label: p.name, value: p.id }))}
            />
          </>
        }
      />

      <Card padded={false} style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: tokens.space3, padding: tokens.space3, borderBottom: `1px solid ${tokens.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            value={model}
            onChange={setModel}
            options={providerModels.map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''} (${m.contextWindow / 1000}k ctx)`, value: m.id }))}
          />
          <Toggle checked={freeOnly} onChange={setFreeOnly} label="Free only" />
          <Button size="sm" variant="ghost" onClick={() => setShowParams((s) => !s)}>{showParams ? 'Hide' : 'Show'} params</Button>
          <Button size="sm" variant="ghost" onClick={() => { setMessages([]); projects && setConvId(null); }}>Clear</Button>
        </div>

        {showParams && (
          <div style={{ display: 'flex', gap: tokens.space3, padding: tokens.space3, borderBottom: `1px solid ${tokens.border}`, flexWrap: 'wrap' }}>
            <div style={{ width: 200 }}>
              <Input label={`Temperature: ${temperature}`} value={String(temperature)} onChange={(v) => setTemperature(Math.max(0, Math.min(2, Number(v) || 0)))} type="number" />
            </div>
            <div style={{ width: 200 }}>
              <Input label="Max tokens" value={String(maxTokens)} onChange={(v) => setMaxTokens(Math.max(1, Number(v) || 2048))} type="number" />
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: tokens.space4, display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: tokens.textMuted, marginTop: 40 }}>
              <div style={{ fontSize: tokens.fontSize2xl, marginBottom: tokens.space2 }}>👋</div>
              <div>Ask anything — AcodeDev will use your selected model.</div>
              <div style={{ fontSize: tokens.fontSizeSm, marginTop: tokens.space2 }}>
                Try: "Explain how a workflow works" or "Summarize what I should build next"
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} msg={m} streaming={streaming && i === messages.length - 1} />
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: tokens.space3, borderTop: `1px solid ${tokens.border}` }}>
          <div style={{ display: 'flex', gap: tokens.space2 }}>
            <Input textarea rows={2} placeholder={`Message ${PROVIDER_LIST.find((p) => p.id === provider)?.name} model…`} value={input} onChange={setInput} />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button onClick={handleSend} disabled={!input.trim() || streaming}>
                {streaming ? <Spinner size={16} /> : 'Send'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </Page>
  );
}

function Bubble({ msg, streaming }: { msg: ChatMessage; streaming: boolean }) {
  const { tokens } = useTheme();
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '80%',
          padding: `${tokens.space2}px ${tokens.space3}px`,
          borderRadius: tokens.radiusLg,
          background: isUser ? tokens.primary : tokens.surfaceHover,
          color: isUser ? tokens.primaryForeground : tokens.text,
          borderBottomRightRadius: isUser ? tokens.radiusSm : tokens.radiusLg,
          borderBottomLeftRadius: isUser ? tokens.radiusLg : tokens.radiusSm,
          whiteSpace: 'pre-wrap',
          fontSize: tokens.fontSizeSm,
          fontFamily: msg.role === 'assistant' ? tokens.fontSans : tokens.fontSans,
          lineHeight: 1.5,
        }}
      >
        {msg.content}
        {streaming && <span style={{ opacity: 0.6 }}>▍</span>}
      </div>
    </div>
  );
}
