import { useState } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Select, Badge, useTheme, Spinner } from '@acode/ui';
import {
  type WorkflowDefinition,
  type WorkflowNode,
  listModels,
  listProviders,
  type ProviderId,
} from '@acode/core';

let nodeSeq = 0;

export function WorkflowsScreen() {
  const { tokens } = useTheme();
  const { workflows, hasKey } = useApp();
  const [nodes, setNodes] = useState<WorkflowNode[]>([
    { id: 'n_input', type: 'input', name: 'Input', config: { value: 'Summarize the following: {{input}}' }, position: { x: 0, y: 0 } },
    { id: 'n_llm', type: 'llm', name: 'LLM 1', config: { provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free', systemPrompt: 'You are a helpful summarizer.', temperature: 0.4 }, position: { x: 1, y: 1 } },
    { id: 'n_out', type: 'output', name: 'Output', config: {}, position: { x: 2, y: 2 } },
  ]);
  const [edges, setEdges] = useState([
    { id: 'e1', source: 'n_input', target: 'n_llm', sourceHandle: 'out', targetHandle: 'in' },
    { id: 'e2', source: 'n_llm', target: 'n_out', sourceHandle: 'out', targetHandle: 'in' },
  ]);
  const [input, setInput] = useState('The team shipped a new feature for the dashboard. It includes streaming responses and a new provider selector. Users can now switch between multiple LLM providers from one screen.');
  const [result, setResult] = useState<{ results: { nodeId: string; nodeType: string; output: string; durationMs?: number }[]; final: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const addNode = (type: WorkflowNode['type']) => {
    const id = `n_${type}_${++nodeSeq}`;
    let config: Record<string, unknown> = {};
    if (type === 'llm') config = { provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free', systemPrompt: '', temperature: 0.7 };
    if (type === 'transform') config = { operation: 'uppercase' };
    if (type === 'condition') config = { expression: 'upstream.length > 100' };
    if (type === 'prompt_template') config = { template: 'Hello, {{input}}' };
    setNodes((n) => [...n, { id, type, name: `${type} ${++nodeSeq}`, config, position: { x: nodes.length, y: 0 } }]);
    // wire last node -> new node
    const last = nodes[nodes.length - 1];
    setEdges((e) => [...e, { id: `e_${id}`, source: last.id, target: id, sourceHandle: 'out', targetHandle: 'in' }]);
  };

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const updateConfig = (id: string, key: string, value: unknown) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)));
  };

  const runWorkflow = async () => {
    const llmNode = nodes.find((n) => n.type === 'llm');
    const p = (llmNode?.config.provider as ProviderId) ?? 'openrouter';
    const pdef = listProviders().find((x) => x.id === p);
    const needsKey = !!(pdef && pdef.needsKey !== false && pdef.kind !== 'local');
    if (needsKey && !hasKey(p)) {
      setResult({ results: [{ nodeId: 'err', nodeType: 'error', output: `⚠️ ${pdef?.name ?? p} isn't connected. Add an API key (Connections → Keys) or pick a key-free provider such as OpenCode Zen or Kilo Gateway.` }], final: '' });
      return;
    }
    setRunning(true);
    setResult(null);
    const def: WorkflowDefinition = {
      id: 'wf_run',
      name: 'My workflow',
      nodes,
      edges,
      variables: {},
      provider: nodes.find((n) => n.type === 'llm')?.config.provider as ProviderId | undefined,
      model: nodes.find((n) => n.type === 'llm')?.config.model as string | undefined,
      updatedAt: Date.now(),
    };
    try {
      const r = await workflows.run(def, { input });
      setResult(r);
    } catch (e) {
      setResult({ results: [{ nodeId: 'err', nodeType: 'error', output: e instanceof Error ? e.message : String(e) }], final: '' });
    } finally {
      setRunning(false);
    }
  };

  const nodeLabel: Record<string, string> = {
    input: '📥 Input',
    llm: '🧠 LLM',
    transform: '🔧 Transform',
    condition: '🔀 Condition',
    prompt_template: '📝 Template',
    output: '📤 Output',
  };

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Workflows / Pipelines"
        subtitle="Chain LLM calls, transformations, and conditions visually"
        actions={
          <>
            <Button variant="secondary" onClick={() => addNode('llm')}>+ LLM</Button>
            <Button variant="secondary" onClick={() => addNode('transform')}>+ Transform</Button>
            <Button variant="secondary" onClick={() => addNode('condition')}>+ Condition</Button>
            <Button onClick={runWorkflow} disabled={running}>{running ? <Spinner size={16} /> : '▶ Run'}</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'stretch' }}>
        <Card title="Pipeline" subtitle="Click a node to edit it on the right">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {nodes.map((n, i) => (
              <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {i > 0 && <div style={{ width: 20, textAlign: 'center', color: tokens.textMuted }}>↓</div>}
                <div
                  onClick={() => setSelectedNodeId(n.id)}
                  style={{
                    flex: 1,
                    padding: 12,
                    border: `1px solid ${selectedNodeId === n.id ? tokens.primary : n.type === 'llm' ? tokens.primary : tokens.borderStrong}`,
                    borderRadius: 12,
                    background: selectedNodeId === n.id ? `${tokens.primary}0d` : tokens.surfaceHover,
                    cursor: 'pointer',
                    boxShadow: selectedNodeId === n.id ? `0 0 0 2px ${tokens.primary}33` : tokens.shadowSm,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge color={n.type === 'llm' ? tokens.primary : undefined}>{nodeLabel[n.type]}</Badge>
                    <span style={{ fontSize: 12, color: tokens.textMuted }}>#{i + 1}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{n.name}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Selected node" subtitle="Configure the selected node">
          {(() => {
            const focus =
              nodes.find((n) => n.id === selectedNodeId) ??
              nodes.find((n) => n.type === 'llm') ??
              nodes[0];
            return <NodeConfig node={focus} updateConfig={updateConfig} rename={(id, name) => updateNode(id, { name })} />;
          })()}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Input">
          <Input textarea rows={3} value={input} onChange={setInput} monospace />
        </Card>
      </div>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {result.results.map((r) => (
            <Card key={r.nodeId} title={`${r.nodeId} · ${r.nodeType} (${r.durationMs}ms)`}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: tokens.fontMono, color: tokens.text }}>{r.output}</pre>
            </Card>
          ))}
          <Card title="Final output" style={{ border: `1px solid ${tokens.success}` }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: tokens.fontMono, color: tokens.success }}>{result.final}</pre>
          </Card>
        </div>
      )}
    </Page>
  );
}

function NodeConfig({ node, updateConfig, rename }: { node: WorkflowNode; updateConfig: (id: string, key: string, value: unknown) => void; rename: (id: string, name: string) => void }) {
  const { tokens } = useTheme();
  const nodeProvider = (node.config.provider as ProviderId) || 'openrouter';
  const allProviders = listProviders();
  const providerOptions = allProviders.filter((p) => p.id !== 'local').map((p) => ({ label: p.gateway ? `${p.name} · gateway` : p.name, value: p.id }));
  const models = listModels(nodeProvider).map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''}`, value: m.id }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge color={tokens.primary}>{node.type}</Badge>
        <Input label="Name" value={node.name} onChange={(v) => rename(node.id, v)} />
      </div>
      {node.type === 'llm' && (
        <>
          <Select label="Provider" value={nodeProvider} onChange={(v) => updateConfig(node.id, 'provider', v)} options={providerOptions} />
          <Select label="Model" value={String(node.config.model)} onChange={(v) => updateConfig(node.id, 'model', v)} options={models} />
          <Input label="System prompt" textarea rows={3} value={String(node.config.systemPrompt ?? '')} onChange={(v) => updateConfig(node.id, 'systemPrompt', v)} />
          <Input label="Temperature" type="number" value={String(node.config.temperature ?? 0.7)} onChange={(v) => updateConfig(node.id, 'temperature', Number(v))} />
        </>
      )}
      {node.type === 'transform' && (
        <Select label="Operation" value={String(node.config.operation)} onChange={(v) => updateConfig(node.id, 'operation', v)} options={[
          { label: 'Uppercase', value: 'uppercase' },
          { label: 'Lowercase', value: 'lowercase' },
          { label: 'Trim', value: 'trim' },
          { label: 'Truncate', value: 'truncate' },
          { label: 'Pretty JSON', value: 'json' },
        ]} />
      )}
      {node.type === 'condition' && (
        <Input label="Condition expression" monospace value={String(node.config.expression)} onChange={(v) => updateConfig(node.id, 'expression', v)} hint="Use upstream / input, e.g. upstream.length > 100" />
      )}
      {node.type === 'prompt_template' && (
        <Input label="Template" textarea rows={3} value={String(node.config.template)} onChange={(v) => updateConfig(node.id, 'template', v)} hint="Use {{input}} / {{upstream}}" />
      )}
      {node.type === 'input' && (
        <Input label="Default input template" textarea rows={2} value={String(node.config.value)} onChange={(v) => updateConfig(node.id, 'value', v)} />
      )}
    </div>
  );
}
