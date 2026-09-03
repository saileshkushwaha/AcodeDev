import { useState } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Badge, Select, Modal, TabBar, useTheme, ProgressBar } from '@acode/ui';
import {
  listModels,
  PROVIDER_LIST,
  type EvalDefinition,
  type EvalCase,
  type EvalRunResult,
  type ProviderId,
  type PromptRecord,
} from '@acode/core';

export function PromptsScreen() {
  const { prompts, evals, vault } = useApp();
  const [, force] = useState(0);
  const refresh = () => force((x) => x + 1);
  const [tab, setTab] = useState('prompts');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [note, setNote] = useState('');

  const allPrompts = prompts.all();

  const startCreate = () => {
    setName(''); setContent(''); setNote(''); setEditId(null); setCreateOpen(true);
  };
  const savePrompt = () => {
    if (editId) {
      const p = prompts.get(editId);
      if (name) p && (p.name = name);
      prompts.bumpVersion(editId, content, note);
    } else {
      prompts.create(name || 'Untitled', content, { note });
    }
    setCreateOpen(false);
    refresh();
  };

  return (
    <Page maxWidth={1100}>
      <PageHeader
        title="Prompts & Evals"
        subtitle="Version your prompts, run evaluations, and compare model outputs"
        actions={<Button onClick={startCreate}>New Prompt</Button>}
      />
      <TabBar
        tabs={[
          { id: 'prompts', label: `Prompts (${allPrompts.length})` },
          { id: 'evals', label: 'Evals' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div style={{ padding: tokens().space4, paddingLeft: 0 }}>
        {tab === 'prompts' ? (
          <PromptList prompts={allPrompts} onNew={startCreate} onEdit={(p) => { setEditId(p.id); setName(p.name); setContent(prompts.currentVersion(p.id)?.content ?? ''); setNote(''); setCreateOpen(true); }} onRollback={(id, v) => { prompts.rollback(id, v); refresh(); }} refresh={refresh} />
        ) : (
          <EvalPanel />
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={editId ? 'Edit Prompt' : 'New Prompt'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Name" value={name} onChange={setName} placeholder="My prompt" />
          <Input label="Prompt content" textarea rows={8} value={content} onChange={setContent} monospace placeholder={'You are a {{role}}…\n\n{{input}}'} />
          <Input label="Version note" value={note} onChange={setNote} placeholder="What changed?" />
          <Button onClick={savePrompt}>{editId ? 'Save new version' : 'Create'}</Button>
        </div>
      </Modal>
    </Page>
  );
}

const tokens = () => ({ space4: 16 });

function PromptList({ prompts, onNew, onEdit, onRollback, refresh }: { prompts: PromptRecord[]; onNew: () => void; onEdit: (p: PromptRecord) => void; onRollback: (id: string, v: number) => void; refresh: () => void }) {
  const { tokens } = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  if (prompts.length === 0) {
    return (
      <Card>
        <div style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm }}>No prompts yet. Create one to start versioning.</div>
      </Card>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {prompts.map((p) => {
        const current = p.versions.find((v) => v.version === p.currentVersion);
        const isOpen = expanded === p.id;
        return (
          <Card key={p.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
              <Badge>v{p.currentVersion}</Badge>
              <Button size="sm" variant="ghost" onClick={() => onEdit(p)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : p.id)}>{isOpen ? 'Hide' : 'History'}</Button>
            </div>
            {current && (
              <pre style={{ background: tokens.codeBg, padding: 8, borderRadius: 8, marginTop: 8, whiteSpace: 'pre-wrap', fontSize: tokens.fontSizeXs, fontFamily: tokens.fontMono }}>
                {current.content}
              </pre>
            )}
            {isOpen && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {p.versions.map((v) => (
                  <div key={v.version} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: tokens.fontSizeSm }}>
                    <Badge color={v.version === p.currentVersion ? tokens.success : undefined}>v{v.version}</Badge>
                    <span style={{ color: tokens.textMuted, flex: 1 }}>{v.note || 'no note'}</span>
                    {v.version !== p.currentVersion && (
                      <Button size="sm" variant="ghost" onClick={() => onRollback(p.id, v.version)}>Rollback</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function EvalPanel() {
  const { tokens } = useTheme();
  const app = useApp();
  const { evals } = app;
  const [open, setOpen] = useState(false);
  const [def, setDef] = useState<Partial<EvalDefinition>>({ name: '', model: 'meta-llama/llama-3.3-70b-instruct:free', provider: 'openrouter', type: 'contains' });
  const [sysPrompt, setSysPrompt] = useState('');
  const [inputText, setInputText] = useState('');
  const [expected, setExpected] = useState('');
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<EvalRunResult | null>(null);

  const modelOpts = PROVIDER_LIST.flatMap((p) => listModels(p.id as ProviderId).map((m) => ({ label: `${p.name} · ${m.name}`, value: m.id })));

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Eval</Button>
      {result && (
        <Card title={`Results · ${result.name}`} subtitle={`${(result.passRate * 100).toFixed(0)}% pass · ${result.results.length} cases`} style={{ marginTop: 16 }}>
          <ProgressBar value={result.passRate * 100} color={result.passRate >= 0.8 ? tokens.success : result.passRate >= 0.5 ? tokens.warning : tokens.danger} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.results.map((r) => (
              <div key={r.caseId} style={{ border: `1px solid ${tokens.border}`, borderRadius: 8, padding: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>Case {r.caseId}</span>
                  <Badge color={r.pass ? tokens.success : tokens.danger}>{r.pass ? 'PASS' : 'FAIL'} · {(r.score * 100).toFixed(0)}%</Badge>
                </div>
                <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, marginTop: 4 }}>Input: {r.input}</div>
                <div style={{ fontSize: tokens.fontSizeXs, marginTop: 4 }}>
                  <span style={{ color: tokens.textMuted }}>Output:</span> {r.actual}
                </div>
                {r.llmJudge && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 4 }}>Judge: {r.llmJudge}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Create Evaluation">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Eval name" value={def.name ?? ''} onChange={(v) => setDef((d) => ({ ...d, name: v }))} />
          <Select label="Model" value={def.model ?? ''} onChange={(v) => setDef((d) => ({ ...d, model: v }))} options={modelOpts} />
          <Select label="Provider" value={def.provider ?? ''} onChange={(v) => setDef((d) => ({ ...d, provider: v as ProviderId }))} options={PROVIDER_LIST.map((p) => ({ label: p.name, value: p.id }))} />
          <Select label="Scoring type" value={def.type ?? 'contains'} onChange={(v) => setDef((d) => ({ ...d, type: v as NonNullable<typeof d.type> }))} options={[
            { label: 'Contains expected text', value: 'contains' },
            { label: 'Exact match', value: 'exact' },
            { label: 'Regex', value: 'regex' },
            { label: 'LLM judge', value: 'llm_judge' },
          ]} />
          {def.type === 'llm_judge' && <Input label="Judge criteria" value={def.criteria ?? ''} onChange={(v) => setDef((d) => ({ ...d, criteria: v }))} placeholder="e.g. Output must be factual and well-structured" />}
          <Input label="Prompt / system prompt" textarea rows={3} value={sysPrompt} onChange={setSysPrompt} />
          <Input label="Test input" textarea rows={2} value={inputText} onChange={setInputText} />
          <Input label="Expected (optional)" value={expected} onChange={setExpected} />
          <Button variant="secondary" onClick={() => { if (inputText) { setCases((c) => [...c, { id: String(c.length + 1), input: inputText, expected: expected || undefined }]); setInputText(''); setExpected(''); } }}>
            Add case ({cases.length})
          </Button>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {cases.map((c) => <Badge key={c.id}>#{c.id}: {c.input.slice(0, 20)}</Badge>)}
          </div>
          <Button
            onClick={async () => {
              setRunning(true);
              setResult(null);
              const full: EvalDefinition = {
                id: `eval_${Date.now()}`,
                name: def.name || 'Untitled eval',
                model: def.model,
                provider: def.provider,
                systemPrompt: sysPrompt || undefined,
                criteria: def.criteria,
                type: (def.type ?? 'contains'),
                cases: cases.length ? cases : [{ id: '1', input: 'Hello world', expected: 'Hello' }],
              };
              const r = await app.evals.run(full, full.model, full.provider);
              setResult(r);
              setOpen(false);
              setRunning(false);
            }}
            disabled={running || cases.length === 0}
          >
            {running ? 'Running…' : 'Run eval'}
          </Button>
        </div>
      </Modal>
    </>
  );
}


