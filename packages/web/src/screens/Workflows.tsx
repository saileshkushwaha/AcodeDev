import { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Select, Badge, useTheme, Spinner } from '@acode/ui';
import {
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
  WORKFLOW_CATEGORIES,
  listModels,
  listProviders,
  type ProviderId,
} from '@acode/core';

let nodeSeq = 0;

const ACTIVE_KEY = 'acode.workflows.active';
const BLANK_ID = 'wf_blank';

function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? BLANK_ID;
  } catch {
    return BLANK_ID;
  }
}

function persistActiveId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function WorkflowsScreen() {
  const { tokens } = useTheme();
  const { workflows, workflowStore, hasKey } = useApp();
  const [ver, force] = useState(0);
  const refresh = useCallback(() => force((x) => x + 1), []);

  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [activeId, setActiveId] = useState<string>(readActiveId());
  const [defName, setDefName] = useState('');
  const [defDesc, setDefDesc] = useState('');
  const [input, setInput] = useState('The team shipped a new feature for the dashboard. It includes streaming responses and a new provider selector. Users can now switch between multiple LLM providers from one screen.');
  const [result, setResult] = useState<{ results: { nodeId: string; nodeType: string; output: string; durationMs?: number }[]; final: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const allDefs = useMemo(() => workflowStore.all(), [workflowStore, ver]);
  const customCount = allDefs.filter((d) => !d.builtin).length;
  const presetCount = allDefs.length - customCount;

  const activeDef = workflowStore.get(activeId);
  const activeIsBuiltin = Boolean(activeDef?.builtin);

  const loadDef = useCallback(
    (id: string) => {
      const def = workflowStore.get(id) ?? workflowStore.get(BLANK_ID);
      if (!def) return;
      nodeSeq = 0;
      setNodes(def.nodes.map((n) => ({ ...n })));
      setEdges(def.edges.map((e) => ({ ...e })));
      setDefName(def.name);
      setDefDesc(def.description ?? '');
      setActiveId(def.id);
      persistActiveId(def.id);
      setResult(null);
    },
    [workflowStore],
  );

  useEffect(() => {
    loadDef(readActiveId());
  }, [loadDef]);

  const saveDef = () => {
    const existing = workflowStore.get(activeId);
    const name = defName.trim() || 'Untitled workflow';
    const isNewCopy = existing?.builtin || !existing;
    const id = isNewCopy ? `wf_c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}` : existing.id;
    const def: WorkflowDefinition = {
      id,
      name,
      description: defDesc.trim() || undefined,
      nodes,
      edges,
      variables: {},
      provider: nodes.find((n) => n.type === 'llm')?.config.provider as ProviderId | undefined,
      model: nodes.find((n) => n.type === 'llm')?.config.model as string | undefined,
      updatedAt: Date.now(),
    };
    const saved = workflowStore.save(def);
    setActiveId(saved.id);
    persistActiveId(saved.id);
    setDefName(saved.name);
    setDefDesc(saved.description ?? '');
    refresh();
  };

  const deleteDef = () => {
    if (activeIsBuiltin) return;
    if (!confirm(`Delete workflow "${activeDef?.name ?? 'Untitled'}"?`)) return;
    workflowStore.remove(activeId);
    refresh();
    loadDef(BLANK_ID);
  };

  const resetDef = () => {
    if (!confirm(`Reset "${activeDef?.name ?? 'this preset'}" back to its built-in definition?`)) return;
    workflowStore.resetBuiltin(activeId);
    refresh();
    loadDef(activeId);
  };

  const addNode = (type: WorkflowNode['type']) => {
    const seq = ++nodeSeq;
    const id = `n_${type}_${seq}`;
    let config: Record<string, unknown> = {};
    if (type === 'llm') config = { provider: 'openrouter', model: 'nvidia/nemotron-3.5-lightning:free', systemPrompt: '', temperature: 0.7 };
    if (type === 'transform') config = { operation: 'uppercase' };
    if (type === 'condition') config = { expression: 'upstream.length > 100' };
    if (type === 'prompt_template') config = { template: 'Hello, {{input}}' };
    setNodes((ns) => [...ns, { id, type, name: `${type} ${seq}`, config, position: { x: ns.length, y: 0 } }]);
    const last = nodes[nodes.length - 1];
    if (last) setEdges((e) => [...e, { id: `e_${id}`, source: last.id, target: id, sourceHandle: 'out', targetHandle: 'in' }]);
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
      id: activeId && !activeIsBuiltin ? activeId : 'wf_run',
      name: defName.trim() || 'Untitled workflow',
      description: defDesc.trim() || undefined,
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

  const catIcon = (cat?: string) => WORKFLOW_CATEGORIES.find((c) => c.id === cat)?.icon ?? '🔁';
  const workflowOptions = allDefs.map((d) => ({
    label: `${d.builtin ? catIcon(d.category) : '🗀'} ${d.name}${d.builtin ? '' : ' · saved'}`,
    value: d.id,
  }));

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Workflows / Pipelines"
        subtitle="Load a preset or saved workflow, tweak the graph, and run it"
        actions={
          <>
            <Button variant="secondary" onClick={() => addNode('llm')}>+ LLM</Button>
            <Button variant="secondary" onClick={() => addNode('transform')}>+ Transform</Button>
            <Button variant="secondary" onClick={() => addNode('condition')}>+ Condition</Button>
            <Button onClick={runWorkflow} disabled={running}>{running ? <Spinner size={16} /> : '▶ Run'}</Button>
          </>
        }
      />

      <Card title="Workflow" subtitle="Pick a preset, or save your current graph as a reusable workflow" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'start' }}>
            <Select label="Workflow" value={activeId} onChange={(v) => loadDef(v)} options={workflowOptions} />
            <Input label="Name" value={defName} onChange={setDefName} placeholder="My workflow" />
            <Input label="Description" value={defDesc} onChange={setDefDesc} placeholder="What does this pipeline do?" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" onClick={saveDef}>💾 Save</Button>
            <Button size="sm" variant="secondary" onClick={() => loadDef(BLANK_ID)}>＋ Blank</Button>
            {activeIsBuiltin ? (
              <Button size="sm" variant="ghost" onClick={resetDef}>↺ Reset preset</Button>
            ) : (
              <Button size="sm" variant="danger" onClick={deleteDef}>🗑 Delete</Button>
            )}
            <Badge color={activeIsBuiltin ? tokens.primary : undefined}>{activeIsBuiltin ? `${catIcon(activeDef?.category)} preset · ${(activeDef?.tags ?? []).join(' · ')}` : 'custom'}</Badge>
            <span style={{ fontSize: 12, color: tokens.textMuted }}>{presetCount} presets · {customCount} saved</span>
          </div>
        </div>
      </Card>

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
            return focus ? <NodeConfig node={focus} updateConfig={updateConfig} rename={(id, name) => updateNode(id, { name })} /> : <div style={{ color: tokens.textMuted, fontSize: 13 }}>Add nodes to get started.</div>;
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