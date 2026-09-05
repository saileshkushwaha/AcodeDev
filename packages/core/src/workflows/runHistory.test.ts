import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadRunHistory, saveRunHistory, RUN_HISTORY_KEY, LEGACY_RUN_HISTORY_KEY, MAX_RUN_HISTORY, type WorkflowRunRecord } from './runHistory';
import { writeJSON, writeRaw } from '../storage';

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

function rec(at: number): WorkflowRunRecord {
  return {
    at,
    results: [{ nodeId: 'a', nodeType: 'llm', output: 'ok', durationMs: 10, status: 'ok', tokens: { prompt: 7, completion: 2 }, cost: 0.001 }],
    final: 'ok',
    input: 'hi',
    cost: 0.001,
    elapsedMs: 10,
  };
}

describe('workflow run history', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips runs newest first and isolated per workflow', () => {
    saveRunHistory('wf_a', [rec(3000), rec(2000), rec(1000)]);
    saveRunHistory('wf_b', [rec(999)]);

    expect(loadRunHistory('wf_a').map((r) => r.at)).toEqual([3000, 2000, 1000]);
    expect(loadRunHistory('wf_b')).toHaveLength(1);
    expect(loadRunHistory('wf_missing')).toEqual([]);
  });

  it('caps stored history at MAX_RUN_HISTORY newest runs', () => {
    const runs = Array.from({ length: MAX_RUN_HISTORY + 5 }, (_, i) => rec(MAX_RUN_HISTORY + 4 - i));
    saveRunHistory('wf_c', runs);

    const loaded = loadRunHistory('wf_c');
    expect(loaded).toHaveLength(MAX_RUN_HISTORY);
    expect(loaded[0].at).toBe(MAX_RUN_HISTORY + 4);
    expect(loaded[loaded.length - 1].at).toBe(5);
  });

  it('migrates a legacy single last run when no history exists', () => {
    const legacy = {
      at: 12345,
      results: [{ nodeId: 'a', nodeType: 'llm', output: 'old', durationMs: 5, status: 'ok' }],
      final: 'old',
      input: 'sample',
    };
    writeJSON(LEGACY_RUN_HISTORY_KEY, { wf_d: legacy });

    const loaded = loadRunHistory('wf_d');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].at).toBe(12345);
    expect(loaded[0].cost).toBe(0);
    expect(loaded[0].elapsedMs).toBe(0);
  });

  it('prioritizes the new history key over a legacy record', () => {
    writeJSON(RUN_HISTORY_KEY, { wf_e: [rec(1)] });
    writeJSON(LEGACY_RUN_HISTORY_KEY, { wf_e: { ...rec(2), cost: 5 } });

    const loaded = loadRunHistory('wf_e');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].at).toBe(1);
  });

  it('tolerates corrupted stored JSON without throwing', () => {
    writeRaw(RUN_HISTORY_KEY, '{ broken');
    expect(loadRunHistory('wf_f')).toEqual([]);
  });
});