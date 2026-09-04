import { useState } from 'react';
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

export function AgentsScreen() {
  const { tokens } = useTheme();
  const { agents, rag, hasKey } = useApp();
  const [name, setName] = useState('My Agent');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant. Answer based on the provided context when available.');
  const [provider, setProvider] = useState<ProviderId>('openrouter');
  const [model, setModel] = useState('nvidia/nemotron-3.5-lightning:free');
  const [tools, setTools] = useState<string[]>(['web_search', 'calculator']);
  const [enableRAG, setEnableRAG] = useState(false);
  const [docs, setDocs] = useState('');
  const [maxIter, setMaxIter] = useState(4);
  const [chat, setChat] = useState('');
  const [conv, setConv] = useState<{ role: string; content: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [, force] = useState(0);
  const refresh = () => force((x) => x + 1);

  const allTools = Toolbox.all();
  const activeTools = allTools.filter((t) => tools.includes(t.name));
  // Keep the provider/model dropdowns in sync with Chat: models filtered per provider.
  const allProviders = listProviders();
  const provDef = allProviders.find((p) => p.id === provider);
  const needsKey = !!(provDef && provDef.needsKey !== false && provDef.kind !== 'local');
  const connected = !needsKey || hasKey(provider);
  const providerModels = listModels(provider);
  const models = providerModels.map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''}`, value: m.id }));
  const providerOptions = allProviders.filter((p) => p.id !== 'local').map((p) => ({ label: p.gateway ? `${p.name} · gateway` : p.name, value: p.id }));

  const ingestDocs = () => {
    if (!docs.trim()) return;
    rag.addDocuments(docs.split('\n').filter((l) => l.trim()));
    refresh();
  };

  const runAgent = async () => {
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
  };

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
              <div key={i} style={{ textAlign: m.role === 'user' ? 'right' : 'left' }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: m.role === 'user' ? tokens.primary : tokens.surfaceHover,
                    color: m.role === 'user' ? tokens.primaryForeground : tokens.text,
                    whiteSpace: 'pre-wrap',
                    maxWidth: '85%',
                    fontSize: 13,
                  }}
                >
                  {m.content}
                </div>
              </div>
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
