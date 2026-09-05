import { useState, useMemo, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Select, Badge, Modal, useTheme, Spinner } from '@acode/ui';
import {
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowRunResult,
  type WorkflowRunRecord,
  WORKFLOW_CATEGORIES,
  listModels,
  listProviders,
  readRaw,
  writeRaw,
  readJSON,
  writeJSON,
  loadRunHistory,
  saveRunHistory,
  MAX_RUN_HISTORY,
  type ProviderId,
} from '@acode/core';

let nodeSeq = 0;

const ACTIVE_KEY = 'acode.workflows.active';
const BLANK_ID = 'wf_blank';
const DRAFT_KEY = 'acode.workflows.draft.v1';

const DEFAULT_INPUT = 'The team shipped a new feature for the dashboard. It includes streaming responses and a new provider selector. Users can now switch between multiple LLM providers from one screen.';

interface WorkflowDraft {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  defName: string;
  defDesc: string;
  input: string;
}

function loadDraft(id: string): WorkflowDraft | null {
  const map = readJSON<Record<string, WorkflowDraft>>(DRAFT_KEY);
  return map?.[id] ?? null;
}

function saveDraft(id: string, draft: WorkflowDraft) {
  const map = readJSON<Record<string, WorkflowDraft>>(DRAFT_KEY) ?? {};
  map[id] = draft;
  writeJSON(DRAFT_KEY, map);
}

const fmtCost = (usd: number | undefined): string => {
  if (usd === undefined || Number.isNaN(usd)) return '';
  if (usd === 0) return 'free';
  return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
};

const fmtTokens = (r: WorkflowRunResult): string => {
  if (!r.tokens) return '';
  return `${r.tokens.prompt.toLocaleString()}→${r.tokens.completion.toLocaleString()} tok`;
};

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function readActiveId(): string {
  return readRaw(ACTIVE_KEY) ?? BLANK_ID;
}

function persistActiveId(id: string) {
  writeRaw(ACTIVE_KEY, id);
}

function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const m = input.trim().match(/^(?:https?:\/\/[^/]+\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/** Wire nodes into a strict top-to-bottom chain: each output feeds the next input. */
function rewireNodes(ns: WorkflowNode[]): WorkflowEdge[] {
  return ns.slice(0, -1).map((n, i) => ({
    id: `e${i + 1}`,
    source: n.id,
    target: ns[i + 1].id,
    sourceHandle: 'out',
    targetHandle: 'in',
  }));
}

export function WorkflowsScreen({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { tokens } = useTheme();
  const { workflows, workflowStore, github, githubToken, hasKey } = useApp();
  const [ver, force] = useState(0);
  const refresh = useCallback(() => force((x) => x + 1), []);

  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [activeId, setActiveId] = useState<string>(readActiveId());
  const [defName, setDefName] = useState('');
  const [defDesc, setDefDesc] = useState('');
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<WorkflowRunRecord[]>([]);
  const [runIdx, setRunIdx] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [finalCollapsed, setFinalCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [ghModal, setGhModal] = useState(false);
  const [ghRepo, setGhRepo] = useState('');
  const [ghTitle, setGhTitle] = useState('');
  const [ghLabels, setGhLabels] = useState('');
  const [ghBusy, setGhBusy] = useState(false);
  const [ghMsg, setGhMsg] = useState('');

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
      // Restore any unsaved draft edits (node graph, name, input) on top of the
      // saved definition, so accidental reloads never lose work-in-progress.
      const draft = loadDraft(def.id);
      const savedNodes = def.nodes.map((n) => ({ ...n }));
      const savedEdges = def.edges.map((e) => ({ ...e }));
      setNodes(Array.isArray(draft?.nodes) ? draft.nodes.map((n) => ({ ...n })) : savedNodes);
      setEdges(Array.isArray(draft?.edges) ? draft.edges.map((e) => ({ ...e })) : savedEdges);
      setDefName(draft?.defName ?? def.name);
      setDefDesc(draft?.defDesc ?? def.description ?? '');
      setInput(draft?.input ?? DEFAULT_INPUT);
      if (Array.isArray(draft?.nodes)) draft.nodes.forEach((n) => { const seq = /_(\d+)$/.exec(n.id); if (seq) nodeSeq = Math.max(nodeSeq, Number(seq[1])); });
      setActiveId(def.id);
      persistActiveId(def.id);
      setHistory(loadRunHistory(def.id));
      setRunIdx(0);
      setCollapsed({});
      setFinalCollapsed(false);
    },
    [workflowStore],
  );

  useEffect(() => {
    loadDef(readActiveId());
  }, [loadDef]);

  // Autosave the working draft so unsaved edits survive reloads.
  useEffect(() => {
    if (!activeId) return;
    saveDraft(activeId, { nodes, edges, defName, defDesc, input });
  }, [activeId, nodes, edges, defName, defDesc, input]);

  // Persist the current run history to storage whenever it changes
  // (initial load, a new run, or switching workflows). This keeps the
  // state updater pure — no side effects inside a React render.
  useEffect(() => {
    if (!activeId) return;
    saveRunHistory(activeId, history);
  }, [activeId, history]);

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
    const next = [...nodes, { id, type, name: `${type} ${seq}`, config, position: { x: nodes.length, y: 0 } }];
    setNodes(next);
    setEdges(rewireNodes(next));
    setSelectedNodeId(id);
  };

  const moveNode = (id: string, dir: 'up' | 'down') => {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const node = nodes[idx];
    if (node.type === 'input' || node.type === 'output') return;
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= nodes.length) return;
    const slot = nodes[target];
    if (slot.type === 'input' || slot.type === 'output') return;
    const next = nodes.map((n) => ({ ...n, position: { ...n.position } }));
    [next[idx], next[target]] = [next[target], next[idx]];
    next.forEach((n, i) => (n.position.x = i));
    setNodes(next);
    setEdges(rewireNodes(next));
    setSelectedNodeId(id);
  };

  const deleteNode = (id: string) => {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    if (!confirm(`Delete node "${nodes[idx].name}"? Connected links will be rewired.`)) return;
    const next = nodes.filter((n) => n.id !== id).map((n) => ({ ...n, position: { ...n.position } }));
    next.forEach((n, i) => (n.position.x = i));
    setNodes(next);
    setEdges(rewireNodes(next));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const duplicateNode = (id: string) => {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const src = nodes[idx];
    if (src.type === 'input' || src.type === 'output') return;
    const dup: WorkflowNode = {
      ...src,
      id: `${src.id}_copy_${++nodeSeq}`,
      name: `${src.name} (copy)`,
      config: JSON.parse(JSON.stringify(src.config) ?? '{}'),
      position: { x: idx + 1, y: 0 },
    };
    const next = nodes.map((n) => ({ ...n, position: { ...n.position } }));
    next.splice(idx + 1, 0, dup);
    next.forEach((n, i) => (n.position.x = i));
    setNodes(next);
    setEdges(rewireNodes(next));
    setSelectedNodeId(dup.id);
  };

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  const updateConfig = (id: string, key: string, value: unknown) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, config: { ...n.config, [key]: value } } : n)));
  };

  const pushRun = useCallback(
    (rec: WorkflowRunRecord) => {
      setHistory((prev) => [rec, ...prev].slice(0, MAX_RUN_HISTORY));
      setRunIdx(0);
      setCollapsed({});
      setFinalCollapsed(false);
    },
    [],
  );

  const runWorkflow = async () => {
    const llmNode = nodes.find((n) => n.type === 'llm');
    const p = (llmNode?.config.provider as ProviderId) ?? 'openrouter';
    const pdef = listProviders().find((x) => x.id === p);
    const needsKey = !!(pdef && pdef.needsKey !== false && pdef.kind !== 'local');
    const startedAt = Date.now();
    const makeRec = (results: WorkflowRunResult[], final: string): WorkflowRunRecord => ({
      at: Date.now(),
      results,
      final,
      input,
      cost: results.reduce((s, x) => s + (x.cost ?? 0), 0),
      elapsedMs: Date.now() - startedAt,
    });
    if (needsKey && !hasKey(p)) {
      pushRun(makeRec([{ nodeId: 'err', nodeType: 'error', output: `⚠️ ${pdef?.name ?? p} isn't connected. Add an API key (Connections → Keys) or pick a key-free provider such as OpenCode Zen or Kilo Gateway.`, durationMs: 0, status: 'error' }], ''));
      return;
    }
    setRunning(true);
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
      pushRun(makeRec(r.results, r.final));
    } catch (e) {
      pushRun(makeRec([{ nodeId: 'err', nodeType: 'error', output: e instanceof Error ? e.message : String(e), durationMs: 0, status: 'error' }], ''));
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

  const currentRun = history[runIdx] ?? null;
  const runResults = currentRun?.results ?? null;
  const lastRunAt = currentRun?.at ?? null;
  const runFinal = currentRun?.final ?? '';
  const runCost = currentRun?.cost ?? 0;
  const runTokens = runResults?.reduce((s, r) => s + (r.tokens?.prompt ?? 0) + (r.tokens?.completion ?? 0), 0) ?? 0;
  const runResultByNode = useMemo(() => {
    const m = new Map<string, WorkflowRunResult>();
    runResults?.forEach((r) => m.set(r.nodeId, r));
    return m;
  }, [runResults]);

  const runOptions = history.map((r, i) => ({
    label: `#${history.length - i} · ${new Date(r.at).toLocaleTimeString()} · ${r.elapsedMs >= 1000 ? `${(r.elapsedMs / 1000).toFixed(1)}s` : `${r.elapsedMs}ms`}${r.cost > 0 ? ` · ${fmtCost(r.cost)}` : ''}`,
    value: String(i),
  }));
  const selectRun = useCallback((idx: number) => {
    setRunIdx(idx);
    setCollapsed({});
    setFinalCollapsed(false);
  }, []);

  const toggleCollapse = useCallback((id: string) => setCollapsed((c) => (c[id] ? { ...c, [id]: false } : { ...c, [id]: true })), []);
  const collapseAllResults = () => setCollapsed(Object.fromEntries((runResults ?? []).map((r) => [r.nodeId, true])));
  const preview = (s: string, n = 96) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

  const copyResult = async () => {
    if (!runFinal) return;
    try {
      await navigator.clipboard?.writeText(runFinal);
    } catch {
      /* ignore */
    }
  };

  const sendToChat = async () => {
    await copyResult();
    onNavigate?.('chat');
  };

  const openSendGitHub = () => {
    setGhRepo('');
    setGhTitle(`[Workflow] ${defName.trim() || 'Untitled'}`);
    setGhLabels('');
    setGhMsg('');
    setGhModal(true);
  };

  const sendToGitHub = async () => {
    if (!runFinal) return;
    if (!githubToken) {
      setGhMsg('No GitHub token set. Add one in Connections → Keys first.');
      return;
    }
    const parsed = parseOwnerRepo(ghRepo);
    if (!parsed) {
      setGhMsg('Enter a repository as owner/name, e.g. anomalyco/AcodeDev.');
      return;
    }
    setGhBusy(true);
    setGhMsg('');
    try {
      const body = [
        `**Generated by workflow:** ${defName.trim() || 'Untitled'}`,
        '',
        new Date().toISOString(),
        '',
        '---',
        '',
        runFinal,
      ].join('\n');
      const labels = ghLabels.split(',').map((l) => l.trim()).filter(Boolean);
      await github().createIssue(parsed.owner, parsed.repo, { title: ghTitle.trim(), body, labels });
      setGhMsg(`✓ Issue created in ${parsed.owner}/${parsed.repo}`);
      setTimeout(() => setGhModal(false), 1200);
    } catch (e) {
      setGhMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setGhBusy(false);
    }
  };

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
            <Button variant="secondary" onClick={() => addNode('prompt_template')}>+ Template</Button>
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
        <Card
          title="Pipeline"
          subtitle="Runs top → bottom · ▲▼ reorders, ⧉ duplicates, ✕ deletes · click to edit"
          actions={
            <span style={{ fontSize: 12, color: tokens.textMuted, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <span>{nodes.length} nodes · {edges.length} links</span>
              {lastRunAt && (
                <Badge color={[...(runResults ?? [])].some((r) => r.status === 'error') ? tokens.danger : tokens.success}>
                  last run {timeAgo(lastRunAt)}
                </Badge>
              )}
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nodes.map((n, i) => {
              const isTerminal = n.type === 'input' || n.type === 'output';
              const canUp = !isTerminal && i > 0 && nodes[i - 1].type !== 'input';
              const canDown = !isTerminal && i < nodes.length - 1 && nodes[i + 1].type !== 'output';
              const stepResult = runResultByNode.get(n.id);
              return (
                <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <RowBtn onClick={() => moveNode(n.id, 'up')} disabled={!canUp} title="Move up">▲</RowBtn>
                    <RowBtn onClick={() => moveNode(n.id, 'down')} disabled={!canDown} title="Move down">▼</RowBtn>
                  </div>
                  {i > 0 && <div style={{ width: 14, textAlign: 'center', color: tokens.textMuted }}>↓</div>}
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
                      {stepResult ? (
                        <Badge color={stepResult.status === 'error' ? tokens.danger : tokens.success}>
                          {stepResult.status === 'error' ? '✕ failed' : `✓ ${stepResult.durationMs}ms`}
                        </Badge>
                      ) : (
                        <span style={{ fontSize: 12, color: tokens.textMuted }}>#{i + 1} · step {i + 1}</span>
                      )}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600 }}>{n.name}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <RowBtn onClick={() => duplicateNode(n.id)} disabled={isTerminal} title={isTerminal ? 'Entry/exit nodes can’t be duplicated' : 'Duplicate'}>⧉</RowBtn>
                    <RowBtn onClick={() => deleteNode(n.id)} danger title="Delete">✕</RowBtn>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card
          title="Selected node"
          subtitle={
            (() => {
              const f = nodes.find((n) => n.id === selectedNodeId) ?? nodes.find((n) => n.type === 'llm') ?? nodes[0];
              return f ? `Step ${nodes.findIndex((x) => x.id === f.id) + 1} · ${f.type} · “${f.name}”` : 'Configure the selected node';
            })()
          }
        >
          {(() => {
            const focus =
              nodes.find((n) => n.id === selectedNodeId) ??
              nodes.find((n) => n.type === 'llm') ??
              nodes[0];
            return focus ? (
              <NodeConfig
                node={focus}
                step={nodes.findIndex((x) => x.id === focus.id) + 1}
                updateConfig={updateConfig}
                rename={(id, name) => updateNode(id, { name })}
                runResult={runResultByNode.get(focus.id) ?? null}
                runAt={lastRunAt}
              />
            ) : (
              <div style={{ color: tokens.textMuted, fontSize: 13 }}>Add nodes to get started.</div>
            );
          })()}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Input">
          <Input textarea rows={3} value={input} onChange={setInput} monospace />
        </Card>
      </div>

      {runResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: tokens.text }}>Run output</span>
            {history.length > 1 && (
              <div style={{ width: 320 }}>
                <Select value={String(runIdx)} onChange={(v) => selectRun(Number(v))} options={runOptions} />
              </div>
            )}
            <span style={{ fontSize: 12, color: tokens.textMuted }}>
              {runIdx === 0 ? `ran ${timeAgo(lastRunAt ?? Date.now())}` : `previous run · ${timeAgo(lastRunAt ?? Date.now())}`}
            </span>
            {runCost > 0 && <Badge color={tokens.primary}>{fmtCost(runCost)}</Badge>}
            {runTokens > 0 && <Badge color={tokens.primary}>{runTokens.toLocaleString()} tok</Badge>}
            <div style={{ flex: 1 }} />
            <Button size="sm" variant="ghost" onClick={() => setCollapsed({})}>Expand all</Button>
            <Button size="sm" variant="ghost" onClick={collapseAllResults}>Collapse all</Button>
          </div>
          {runResults.map((r) => (
            <CollapsibleCard
              key={r.nodeId}
              title={`${r.nodeId} · ${r.nodeType}`}
              subtitle={collapsed[r.nodeId] ? preview(r.output) : undefined}
              expanded={!collapsed[r.nodeId]}
              onToggle={() => toggleCollapse(r.nodeId)}
              actions={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {r.status ? <Badge color={r.status === 'error' ? tokens.danger : tokens.success}>{r.status === 'error' ? '✕ failed' : '✓ ok'}</Badge> : undefined}
                  {r.cost !== undefined && r.cost > 0 && <Badge color={tokens.primary}>{fmtCost(r.cost)}</Badge>}
                  {fmtTokens(r) && <span style={{ fontSize: 12, color: tokens.textMuted, whiteSpace: 'nowrap' }}>{fmtTokens(r)}</span>}
                  <span style={{ fontSize: 12, color: tokens.textMuted, whiteSpace: 'nowrap' }}>{r.durationMs}ms</span>
                </span>
              }
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: tokens.fontMono, color: r.status === 'error' ? tokens.danger : tokens.text, maxHeight: 320, overflow: 'auto' }}>
                {r.output}
              </pre>
            </CollapsibleCard>
          ))}
          <CollapsibleCard
            title="Final output"
            expanded={!finalCollapsed}
            onToggle={() => setFinalCollapsed((v) => !v)}
            style={{ border: `1px solid ${tokens.success}` }}
            actions={
              <>
                <Button size="sm" variant="ghost" onClick={() => void copyResult()} disabled={!runFinal}>⧉ Copy</Button>
                <Button size="sm" variant="ghost" onClick={() => void sendToChat()} disabled={!runFinal}>Send to chat</Button>
                <Button size="sm" variant="secondary" onClick={openSendGitHub} disabled={!runFinal}>Create GitHub issue</Button>
              </>
            }
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: tokens.fontMono, color: tokens.success }}>{runFinal || '(no output)'}</pre>
          </CollapsibleCard>
        </div>
      )}

      {ghModal && (
        <Modal open onClose={() => setGhModal(false)} title="Create GitHub issue" width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="Repository (owner/name)" value={ghRepo} onChange={setGhRepo} placeholder="anomalyco/AcodeDev" monospace />
            <Input label="Title" value={ghTitle} onChange={setGhTitle} />
            <Input label="Labels (comma separated)" value={ghLabels} onChange={setGhLabels} placeholder="workflow, ai" />
            <div style={{ fontSize: 12, color: tokens.textMuted, lineHeight: 1.5 }}>
              The workflow's final output will be attached as the issue body. Note: actions from built-in presets are not executed end-to-end against your GitHub repo unless you have a token connected.
            </div>
            {ghMsg && <div style={{ fontSize: 13, color: ghMsg.startsWith('✓') ? tokens.success : tokens.danger }}>{ghMsg}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button size="sm" variant="ghost" onClick={() => setGhModal(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void sendToGitHub()} disabled={ghBusy || !ghRepo.trim() || !ghTitle.trim()}>
                {ghBusy ? 'Creating…' : 'Create issue'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function CollapsibleCard({ title, subtitle, actions, expanded, onToggle, children, style }: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const { tokens } = useTheme();
  return (
    <Card style={style}>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: tokens.textSecondary, fontSize: 11, width: 10, textAlign: 'center', flexShrink: 0 }}>▶</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>{title}</div>
          {subtitle != null && <div style={{ fontSize: 12, color: tokens.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
        </div>
        {actions != null && <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      {expanded && <div style={{ marginTop: 10 }}>{children}</div>}
    </Card>
  );
}

function RowBtn({ onClick, disabled, title, danger, children }: { onClick: () => void; disabled?: boolean; title?: string; danger?: boolean; children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 26,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${disabled ? tokens.border : tokens.borderStrong}`,
        borderRadius: tokens.radiusSm,
        background: tokens.surface,
        color: danger ? tokens.danger : disabled ? tokens.textMuted : tokens.textSecondary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: tokens.fontSans,
        fontSize: 12,
        lineHeight: 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function NodeConfig({ node, step, updateConfig, rename, runResult, runAt }: {
  node: WorkflowNode;
  step: number;
  updateConfig: (id: string, key: string, value: unknown) => void;
  rename: (id: string, name: string) => void;
  runResult: WorkflowRunResult | null;
  runAt: number | null;
}) {
  const { tokens } = useTheme();
  const nodeProvider = (node.config.provider as ProviderId) || 'openrouter';
  const allProviders = listProviders();
  const providerOptions = allProviders.filter((p) => p.id !== 'local').map((p) => ({ label: p.gateway ? `${p.name} · gateway` : p.name, value: p.id }));
  const models = listModels(nodeProvider).map((m) => ({ label: `${m.name}${m.isFree ? ' · free' : ''}`, value: m.id }));
  const st = runResult?.status ?? 'ok';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge color={tokens.primary}>Step {step} · {node.type}</Badge>
        <Input label="Name" value={node.name} onChange={(v) => rename(node.id, v)} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: tokens.textMuted, marginBottom: 4 }}>
          Last run{runAt ? ` · ${new Date(runAt).toLocaleTimeString()} (${timeAgo(runAt)})` : ''}
        </div>
        {runResult ? (
          <div style={{ border: `1px solid ${st === 'error' ? tokens.danger : tokens.success}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: tokens.surfaceHover, borderBottom: `1px solid ${tokens.border}` }}>
              <span style={{ color: st === 'error' ? tokens.danger : tokens.success, fontWeight: 700, fontSize: 12 }}>{st === 'error' ? '✕ Failed' : '✓ OK'}</span>
              <span style={{ color: tokens.textMuted, fontSize: 12 }}>{runResult.durationMs}ms</span>
            </div>
            <pre style={{ margin: 0, padding: 10, whiteSpace: 'pre-wrap', fontSize: 13, fontFamily: tokens.fontMono, color: st === 'error' ? tokens.danger : tokens.text, maxHeight: 180, overflow: 'auto' }}>
              {runResult.output || '(empty)'}
            </pre>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: tokens.textMuted, padding: '8px 0' }}>No run yet — press ▶ Run to see this step's output here.</div>
        )}
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