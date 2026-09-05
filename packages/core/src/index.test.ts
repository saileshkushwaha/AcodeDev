import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  KeyVault,
  webCryptoAdapter,
  PromptRegistry,
  RAGMemory,
  WorkflowRegistry,
  WorkflowEngine,
  WORKFLOW_LIBRARY,
  WORKFLOW_CATEGORIES,
  listModels,
  getFreeModels,
  GitHubClient,
  maskKey,
  extractVariables,
  renderPrompt,
  estimateTokens,
  PROMPT_LIBRARY,
  PROMPT_CATEGORIES,
  setStorageBackend,
} from './index';

describe('KeyVault', () => {
  const memStorage = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
    } as Storage;
  };

  beforeEach(() => setStorageBackend(memStorage()));
  afterEach(() => setStorageBackend(undefined));

  it('encrypts with AES-GCM: roundtrip, no plaintext leak, unique IVs', async () => {
    const crypto = webCryptoAdapter();
    const c1 = await crypto.encrypt('sk-or-test');
    expect(c1).not.toContain('sk-or-test');
    expect(await crypto.decrypt(c1)).toBe('sk-or-test');
    const c2 = await crypto.encrypt('sk-or-test');
    expect(c2).not.toBe(c1);
  });

  it('stores, reads and removes keys across vault instances', async () => {
    const vault = new KeyVault(webCryptoAdapter());
    await vault.ready();
    vault.setKey('openrouter', 'sk-or-test');
    expect(vault.getKey('openrouter')).toBe('sk-or-test');
    await vault.flush();
    const persisted = new KeyVault(webCryptoAdapter());
    await persisted.ready();
    expect(persisted.getKey('openrouter')).toBe('sk-or-test');
    persisted.removeKey('openrouter');
    expect(persisted.hasKey('openrouter')).toBe(false);
  });
});

describe('models catalog', () => {
  it('lists free models across providers', () => {
    const free = getFreeModels();
    expect(free.length).toBeGreaterThan(5);
    expect(listModels('openrouter').length).toBeGreaterThan(0);
  });
});

describe('PromptRegistry', () => {
  it('creates and versions prompts', () => {
    const reg = new PromptRegistry();
    const p = reg.create('greeting', 'Hello {{name}}');
    expect(p.currentVersion).toBe(1);
    reg.bumpVersion(p.id, 'Hi {{name}}!', 'shorter');
    expect(reg.get(p.id)!.currentVersion).toBe(2);
    reg.rollback(p.id, 1);
    expect(reg.currentVersion(p.id)!.content).toBe('Hello {{name}}');
  });

  it('seeds the built-in enterprise library', () => {
    const reg = new PromptRegistry();
    const seeded = reg.all().filter((p) => p.builtin);
    expect(seeded.length).toBeGreaterThanOrEqual(PROMPT_LIBRARY.length);
    expect(seeded.length).toBeGreaterThan(30);
    // Every category has at least one prompt
    PROMPT_CATEGORIES.forEach((c) => {
      expect(reg.countByCategory(c.id)).toBeGreaterThan(0);
    });
  });

  it('tracks favorites and usage observability', () => {
    const reg = new PromptRegistry();
    const p = reg.create('metrics', 'Analyze {{data}}');
    expect(reg.toggleFavorite(p.id)).toBe(true);
    reg.recordUse(p.id);
    reg.recordUse(p.id);
    expect(reg.get(p.id)!.uses).toBe(2);
    expect(reg.all()[0].id).toBe(p.id); // favorites sort first
  });
});

describe('prompt helpers', () => {
  it('extracts variables in order and renders them', () => {
    const tpl = 'Review {{code}} for {{standard}} and report {{code}}';
    const vars = extractVariables(tpl);
    expect(vars).toEqual(['code', 'standard']);
    expect(renderPrompt(tpl, { code: 'X', standard: 'OWASP' })).toBe('Review X for OWASP and report X');
  });

  it('estimates tokens proportional to length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('library prompts all have valid categories and variables-like content', () => {
    PROMPT_LIBRARY.forEach((p) => {
      expect(PROMPT_CATEGORIES.some((c) => c.id === p.category)).toBe(true);
      expect(p.id).toBeTruthy();
      expect(p.content.length).toBeGreaterThan(20);
    });
  });
});

describe('workflow library', () => {
  const validNodeTypes = ['input', 'llm', 'transform', 'condition', 'prompt_template', 'output'];

  it('presets are structurally valid: entry + terminal nodes, wired edges, unique ids', () => {
    expect(WORKFLOW_LIBRARY.length).toBeGreaterThanOrEqual(8);
    WORKFLOW_LIBRARY.forEach((w) => {
      expect(w.id).toBeTruthy();
      expect(w.name.length).toBeGreaterThan(0);
      expect(WORKFLOW_CATEGORIES.some((c) => c.id === w.category)).toBe(true);
      expect(w.nodes.length).toBeGreaterThanOrEqual(2);
      expect(w.nodes.some((n) => n.type === 'input')).toBe(true);
      expect(w.nodes.some((n) => n.type === 'output')).toBe(true);

      const ids = w.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
      w.nodes.forEach((n) => expect(validNodeTypes).toContain(n.type));

      w.edges.forEach((e) => {
        expect(ids).toContain(e.source);
        expect(ids).toContain(e.target);
      });
      // graph is connected end to end (every node except input has an inbound edge)
      w.nodes
        .filter((n) => n.type !== 'input')
        .forEach((n) => expect(w.edges.some((e) => e.target === n.id)).toBe(true));
    });
  });

  it('chain workflow wires three LLM stages with the upstream placeholder', () => {
    const w = WORKFLOW_LIBRARY.find((x) => x.id === 'wf_chain_of_thought');
    expect(w).toBeTruthy();
    const llmNodes = w!.nodes.filter((n) => n.type === 'llm');
    expect(llmNodes.length).toBe(3);
    // later stages consume the previous stage's output via {{upstream}}
    llmNodes.slice(1).forEach((n) => {
      expect(String(n.config.systemPrompt ?? '')).toContain('{{upstream}}');
    });
  });
});

describe('WorkflowEngine', () => {
  const fakeEngine = ({ chat: async () => ({ content: 'ok', usage: { promptTokens: 7, completionTokens: 2 } }) }) as any;

  it('records outputs for every step in chain order', async () => {
    const engine = new WorkflowEngine(fakeEngine);
    const nodes = [
      { id: 'in', type: 'input', name: 'Input', config: { value: '{{input}}' }, position: { x: 0, y: 0 } },
      { id: 'a', type: 'llm', name: 'LLM A', config: {}, position: { x: 1, y: 0 } },
      { id: 'b', type: 'transform', name: 'Trim', config: { operation: 'trim' }, position: { x: 2, y: 0 } },
      { id: 'out', type: 'output', name: 'Output', config: {}, position: { x: 3, y: 0 } },
    ];
    const edges = [
      { id: 'e1', source: 'in', target: 'a', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'e2', source: 'a', target: 'b', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'e3', source: 'b', target: 'out', sourceHandle: 'out', targetHandle: 'in' },
    ];
    const r = await engine.run({ id: 't', name: 't', nodes: nodes as any, edges: edges as any, variables: {}, updatedAt: 0 }, { input: '  Hi  ' });
    expect(r.final).toBe('ok');
    expect(r.results).toHaveLength(4);
    expect(r.results.every((x) => x.status === 'ok')).toBe(true);
    expect(r.results.map((x) => x.nodeId)).toEqual(['in', 'a', 'b', 'out']);
    // LLM steps carry token usage (provider-reported here) and a numeric cost.
    const llm = r.results.find((x) => x.nodeId === 'a')!;
    expect(llm.tokens).toEqual({ prompt: 7, completion: 2 });
    expect(llm.cost).toBeTypeOf('number');
  });

  it('estimates tokens when the provider reports no usage', async () => {
    const engine = new WorkflowEngine({ chat: async () => ({ content: 'ok' }) } as any);
    const nodes = [
      { id: 'in', type: 'input', name: 'Input', config: { value: '{{input}}' }, position: { x: 0, y: 0 } },
      { id: 'a', type: 'llm', name: 'LLM A', config: {}, position: { x: 1, y: 0 } },
    ];
    const edges = [{ id: 'e1', source: 'in', target: 'a', sourceHandle: 'out', targetHandle: 'in' }];
    const r = await engine.run({ id: 't', name: 't', nodes: nodes as any, edges: edges as any, variables: {}, updatedAt: 0 }, { input: 'x' });
    const llm = r.results.find((x) => x.nodeId === 'a')!;
    expect(llm.tokens?.prompt).toBeGreaterThan(0);
    expect(llm.tokens?.completion).toBe(1);
  });

  it('attributes a failing step to its node instead of aborting the run', async () => {
    const engine = new WorkflowEngine({ chat: async () => { throw new Error('rate limited'); } } as any);
    const nodes = [
      { id: 'in', type: 'input', name: 'Input', config: { value: '{{input}}' }, position: { x: 0, y: 0 } },
      { id: 'a', type: 'llm', name: 'LLM A', config: {}, position: { x: 1, y: 0 } },
      { id: 'out', type: 'output', name: 'Output', config: {}, position: { x: 2, y: 0 } },
    ];
    const edges = [
      { id: 'e1', source: 'in', target: 'a', sourceHandle: 'out', targetHandle: 'in' },
      { id: 'e2', source: 'a', target: 'out', sourceHandle: 'out', targetHandle: 'in' },
    ];
    const r = await engine.run({ id: 't', name: 't', nodes: nodes as any, edges: edges as any, variables: {}, updatedAt: 0 }, { input: 'x' });
    const failed = r.results.find((x) => x.nodeId === 'a')!;
    expect(failed?.status).toBe('error');
    expect(failed?.output).toContain('rate limited');
    expect(r.results.find((x) => x.nodeId === 'in')!.status).toBe('ok');
  });
});

describe('WorkflowRegistry', () => {
  it('seeds the full built-in library and marks presets as builtin', () => {
    const reg = new WorkflowRegistry();
    const seedCount = reg.ensureSeeded();
    const builtins = reg.all().filter((d) => d.builtin);
    expect(builtins.length).toBeGreaterThanOrEqual(WORKFLOW_LIBRARY.length);
    expect(builtins.every((d) => d.builtin)).toBe(true);
  });

  it('saves custom workflows, updates in place, and never deletes builtins', () => {
    const reg = new WorkflowRegistry();
    const saved = reg.save({
      id: 'wf_c_test',
      name: 'My custom',
      nodes: [{ id: 'n1', type: 'input', name: 'Input', config: { value: '{{input}}' }, position: { x: 0, y: 0 } }],
      edges: [],
      variables: {},
      updatedAt: Date.now(),
    });
    expect(saved.builtin).toBe(false);
    expect(reg.get('wf_c_test')?.name).toBe('My custom');

    reg.save({ ...saved, name: 'Renamed' });
    expect(reg.get('wf_c_test')?.name).toBe('Renamed');

    expect(reg.remove('wf_blank')).toBe(false);
    expect(reg.remove('wf_c_test')).toBe(true);
    expect(reg.get('wf_c_test')).toBeUndefined();
  });

  it('saving a copy of a builtin preset yields a deletable custom workflow', () => {
    const reg = new WorkflowRegistry();
    const blank = reg.get('wf_blank')!;
    const copy = reg.save({ ...blank, builtin: undefined, id: 'wf_c_copy', name: 'My blank copy' });
    expect(copy.builtin).toBe(false);
    expect(reg.remove('wf_c_copy')).toBe(true);
    expect(reg.remove('wf_blank')).toBe(false);
  });

  it('resetBuiltin restores the curated definition untouched', () => {
    const reg = new WorkflowRegistry();
    const blank = reg.get('wf_blank')!;
    const tampered = reg.save({ ...blank, nodes: [] });
    expect(reg.get('wf_blank')!.nodes).toHaveLength(0);
    const restored = reg.resetBuiltin('wf_blank');
    const pristine = WORKFLOW_LIBRARY.find((x) => x.id === 'wf_blank')!;
    expect(restored!.nodes.length).toBeGreaterThan(0);
    expect(restored!.nodes.length).toBe(pristine.nodes.length);
    expect(restored!.edges.length).toBe(pristine.edges.length);
  });
});

describe('RAGMemory', () => {
  it('retrieves relevant chunks', () => {
    const rag = new RAGMemory();
    rag.addDocuments(['The capital of France is Paris.', 'Pizza is a popular Italian food.', 'Mount Everest is the tallest peak.']);
    const hit = rag.retrieve('Where is the capital of France?');
    expect(hit).toContain('Paris');
  });
});

describe('maskKey', () => {
  it('masks secrets', () => {
    expect(maskKey('sk-abcdefghijkl')).not.toContain('abcdefghijkl');
    expect(maskKey('abc').length).toBe(3);
  });
});
