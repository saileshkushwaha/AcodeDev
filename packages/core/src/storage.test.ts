import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readJSON,
  writeJSON,
  readRaw,
  writeRaw,
  removeKey,
  readGithubToken,
  writeGithubToken,
  setStorageErrorHandler,
  readEvalSnapshot,
  writeEvalSnapshot,
  AgentRegistry,
  ProjectStore,
  getProvider,
  registerProvider,
  persistCatalog,
  loadCatalog,
  type AgentDefinition,
} from './index';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('storage layer', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setStorageErrorHandler(null);
  });

  it('round-trips raw and JSON values', () => {
    expect(writeRaw('k', 'v')).toBe(true);
    expect(readRaw('k')).toBe('v');
    expect(readRaw('missing')).toBeNull();

    expect(writeJSON('j', { a: 1 })).toBe(true);
    expect(readJSON<{ a: number }>('j')).toEqual({ a: 1 });
    expect(readJSON('missing')).toBeNull();

    removeKey('k');
    expect(readRaw('k')).toBeNull();
  });

  it('returns null for corrupted JSON instead of throwing', () => {
    writeRaw('bad', '{ not json');
    expect(readJSON('bad')).toBeNull();
  });

  it('reports write failures through the storage error handler', () => {
    const seen: string[] = [];
    setStorageErrorHandler((key, error) => seen.push(`${key}:${(error as Error).message}`));

    const failing = createMemoryStorage();
    failing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    vi.stubGlobal('localStorage', failing);

    expect(writeRaw('k', 'v')).toBe(false);
    expect(writeJSON('j', 1)).toBe(false);
    expect(seen).toEqual(['k:QuotaExceededError', 'j:QuotaExceededError']);
  });

  it('github token helpers write and clear', () => {
    writeGithubToken('gh_token');
    expect(readGithubToken()).toBe('gh_token');
    writeGithubToken('');
    expect(readGithubToken()).toBe('');
  });
});

describe('ProjectStore settings persistence', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', createMemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('restores composer settings onto a reloaded conversation', () => {
    const first = new ProjectStore();
    const conv = first.createConversation({
      title: 'Session',
      provider: 'openrouter',
      model: 'some/model',
      settings: { temperature: 0.3, maxTokens: 512, freeOnly: true, minContext: '8000', skills: ['rag'] },
    });
    first.updateSettings(conv.id, { temperature: 0.9 });

    const second = new ProjectStore();
    const restored = second.getConversation(conv.id)!;
    expect(restored.settings?.temperature).toBe(0.9);
    expect(restored.settings?.maxTokens).toBe(512);
    expect(restored.settings?.minContext).toBe('8000');
    expect(restored.settings?.skills).toEqual(['rag']);

    // Messages survive reloads too.
    second.appendMessage(conv.id, { role: 'user', content: 'hello' });
    const third = new ProjectStore();
    expect(third.getConversation(conv.id)!.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });
});

describe('AgentRegistry persistence', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', createMemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('round-trips an agent definition and transcript', () => {
    const first = new AgentRegistry();
    first.save({
      id: 'main',
      name: 'Builder',
      systemPrompt: 'You are helpful',
      provider: 'openrouter',
      model: 'some/model',
      tools: ['read_file'],
      enableRAG: true,
      maxIter: 3,
      conversation: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
      updatedAt: Date.now(),
    });

    const second = new AgentRegistry();
    const got = second.get('main')!;
    expect(got.name).toBe('Builder');
    expect(got.enableRAG).toBe(true);
    expect(got.tools).toEqual(['read_file']);
    expect(got.conversation).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('remove deletes persisted agents', () => {
    const first = new AgentRegistry();
    first.save({ id: 'x', name: 'X', systemPrompt: '', provider: 'openrouter', model: 'm', tools: [], enableRAG: false, maxIter: 1, conversation: [], updatedAt: Date.now() } satisfies AgentDefinition);
    expect(first.remove('x')).toBe(true);

    const second = new AgentRegistry();
    expect(second.get('x')).toBeUndefined();
  });
});

describe('EvalStore', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', createMemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('round-trips an eval snapshot with cases and last result', () => {
    writeEvalSnapshot({
      def: { name: 'My eval', type: 'contains' },
      sysPrompt: 'Be strict',
      cases: [{ id: '1', input: 'answer 42', expected: '42' }],
      result: { name: 'My eval', passRate: 1, results: [{ caseId: '1', pass: true, score: 1, input: 'answer 42', actual: '42' }] },
    });

    const snap = readEvalSnapshot()!;
    expect(snap.def?.name).toBe('My eval');
    expect(snap.sysPrompt).toBe('Be strict');
    expect(snap.cases).toHaveLength(1);
    expect(snap.result?.passRate).toBe(1);
    expect(snap.result?.results[0].llmJudge).toBeUndefined();
  });

  it('returns null when nothing stored', () => {
    expect(readEvalSnapshot()).toBeNull();
  });
});

describe('catalog seed base-URL overrides', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', createMemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reapplies overridden seed gateway base URLs after reload', () => {
    const seed = getProvider('openrouter');
    expect(seed).toBeDefined();

    registerProvider({ ...seed!, baseUrl: 'https://editable-gateway.example' });
    persistCatalog();

    // Simulate a reload: restore catalog from storage.
    loadCatalog();
    expect(getProvider('openrouter')!.baseUrl).toBe('https://editable-gateway.example');
  });
});