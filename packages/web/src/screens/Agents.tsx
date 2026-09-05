import { useState, useEffect, useCallback, useMemo } from 'react';
import React from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Select, Toggle, Badge, useTheme, Spinner } from '@acode/ui';
import { Toolbox, listModels, listProviders, type ProviderId } from '@acode/core';

const TOOL_NAMES: Record<string, string> = {
  web_search: 'Web search',
  calculator: 'Calculator',
  code_interpreter: 'Code interpreter',
  fetch_url: 'Fetch URL',
};

type ConvMsg = { role: 'user' | 'assistant'; content: string };

const ConvMsgItem = React.memo(function ConvMsgItem({ msg, tokens }: { msg: ConvMsg; tokens: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <div style={{ textAlign: msg.role === 'user' ? 'right' : 'left' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '8px 12px',
          borderRadius: 12,
          background: msg.role === 'user' ? tokens.primary : tokens.surfaceHover,
          color: msg.role === 'user' ? tokens.primaryForeground : tokens.text,
          whiteSpace: 'pre-wrap',
          maxWidth: '85%',
          fontSize: 13,
        }}
      >
        {msg.content}
      </div>
    </div>
  );
});

export function AgentsScreen() {
  const { tokens } = useTheme();
  const { agents, agentStore, rag, hasKey } = useApp();
  const saved = agentStore.all()[0];
  const mainId = saved?.id ?? 'main';
  const [name, setName] = useState(saved?.name ?? 'My Agent');
  const [systemPrompt, setSystemPrompt] = useState(saved?.systemPrompt ?? 'You are a helpful AI assistant. Answer based on the provided context when available.');
  const [provider, setProvider] = useState<ProviderId>(saved?.provider ?? 'openrouter');
  const [model, setModel] = useState(saved?.model ?? 'nvidia/nemotron-3.5-lightning:free');
  const [tools, setTools] = useState<string[]>(saved?.tools ?? ['web_search', 'calculator']);
  const [enableRAG, setEnableRAG] = useState(saved?.enableRAG ?? false);
  const [docs, setDocs] = useState('');
  const [maxIter, setMaxIter] = useState(saved?.maxIter ?? 4);
  const [chat, setChat] = useState('');
  const [conv, setConv] = useState<ConvMsg[]>(saved?.conversation ?? []);
  const [running, setRunning] = useState(false);
  const [, force] = useState(0);
  const refresh = useCallback(() => force((x) => x + 1), []);

  // Persist the agent configuration + transcript so it survives reloads.
  useEffect(() => {
    agentStore.save({
      id: mainId,
      name,
      systemPrompt,
      provider,
      model,
      tools,
      enableRAG,
      maxIter,
      conversation: conv,
      updatedAt: Date.now(),
    });
  }, [mainId, agentStore, name, systemPrompt, provider, model, tools, enableRAG, maxIter, conv]);

  const allTools = useMemo(() => Toolbox.all(), []);
  const activeTools = useMemo(() => allTools.filter((t) => tools.includes(t.name)), [allTools, tools]);
  const allProviders = useMemo(() => listProviders(), []);
  const provDef = useMemo(() => allProviders.find((p) => p.id === provider), [allProviders, provider]);
  const needsKey = useMemo(() => !!(provDef && provDef.needsKey !== false && provDef.kind !== 'local'), [provDef]);
  const connected = useMemo(() => !needsKey || hasKey(provider), [needsKey, provider, hasKey]);
  const providerModels = useMemo(() => listModels(provider), [provider]);
  const models = useMemo(() => providerModels.map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''}`, value: m.id })), [providerModels]);
  const providerOptions = useMemo(() => allProviders.filter((p) => p.id !== 'local').map((p) => ({ label: p.gateway ? `${p.name} · gateway` : p.name, value: p.id })), [allProviders]);

  const ingestDocs = useCallback(() => {
    if (!docs.trim()) return;
    rag.addDocuments(docs.split('\n').filter((l) => l.trim()));
    refresh();
  }, [docs, rag, refresh]);

  const runAgent = useCallback(async () => {
    if (!chat.trim() || running) return;
    if (!connected) {
      setConv((c) => [...c, { role: 'user', content: chat }]);
      setConv((c) => [...c, { role: 'assistant', content: `⚠️ ${provDef?.name ?? provider} isn't connected. Add an API key (Connections → Keys) or pick a key-free provider such as OpenCode Zen or Kilo Gateway.` }]);
      setChat('');
      return;
    }
    setRunning(true);
    setConv((c) => [...c, { role: 'user', content: chat }]);
    const input = chat;
    setChat('');

    try {
      let finalInput = input;
      if (enableRAG && rag.size > 0) {
        const ctx = rag.retrieve(input, 5);
        finalInput = `Using the following context, answer the question.\n\nContext:\n${ctx}\n\nQuestion: ${input}`;
      }
      const run = await agents.run(finalInput, {
        name,
        systemPrompt,
        model,
        providerId: provider,
        tools: activeTools,
        maxIterations: maxIter,
      });
      setConv((c) => [...c, { role: 'assistant', content: run.final }]);
    } catch (e) {
      setConv((c) => [...c, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setRunning(false);
    }
  }, [chat, running, connected, provDef, provider, agents, rag, name, systemPrompt, model, activeTools, maxIter]);

  return (
    <Page maxWidth={1100}>
      <PageHeader title="AI Agent Builder" subtitle="Create agents with tools, memory, and RAG over your documents" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Agent configuration">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input label="Agent name" value={name} onChange={setName} />
              <Input label="System prompt" textarea rows={4} value={systemPrompt} onChange={setSystemPrompt} />
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}><Select label="Provider" value={provider} onChange={(v) => { setProvider(v as ProviderId); setModel(listModels(v as ProviderId)[0]?.id ?? model); }} options={providerOptions} /></div>
                <div style={{ flex: 2 }}><Select label="Model" value={model} onChange={setModel} options={models} /></div>
                {!connected && <Badge color={tokens.danger}>No key</Badge>}
              </div>
              <Input label="Max tool iterations" type="number" value={String(maxIter)} onChange={(v) => setMaxIter(Math.max(1, Number(v) || 4))} />
            </div>
          </Card>

          <Card title="Tools" subtitle="Tools the agent can call">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allTools.map((t) => (
                <div key={t.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{TOOL_NAMES[t.name]}</div>
                    <div style={{ fontSize: 12, color: tokens.textMuted }}>{t.description}</div>
                  </div>
                  <Toggle checked={tools.includes(t.name)} onChange={(v) => setTools((cur) => (v ? [...cur, t.name] : cur.filter((x) => x !== t.name)))} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Knowledge / RAG" subtitle="Chat with your documents">
            <Toggle checked={enableRAG} onChange={setEnableRAG} label="Enable document retrieval" />
            <div style={{ marginTop: 8 }}>
              <Input textarea rows={3} value={docs} onChange={setDocs} placeholder="Paste documents, one per line…" />
            </div>
            <div style={{ marginTop: 8 }}>
              <Button variant="secondary" onClick={ingestDocs}>Ingest ({rag.size} chunks)</Button>
            </div>
          </Card>
        </div>

        <Card title="Chat with agent" subtitle={`${activeTools.length} tools enabled ${enableRAG ? '· RAG on' : ''}`} padded>
          <div style={{ height: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {conv.length === 0 && <div style={{ color: tokens.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Ask your agent something</div>}
            {conv.map((m, i) => (
              <ConvMsgItem key={i} msg={m} tokens={tokens} />
            ))}
            {running && <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: tokens.textMuted, fontSize: 13 }}><Spinner size={14} /> Agent thinking…</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={chat} onChange={setChat} placeholder="Message the agent…" />
            <Button onClick={runAgent} disabled={!chat.trim() || running}>{running ? '…' : 'Send'}</Button>
          </div>
        </Card>
      </div>
    </Page>
  );
}
