import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setStorageErrorHandler } from "../storage";
import {
  loadFlags,
  isOn,
  toggleFlag,
  setFlagOverride,
  resetAllFlags,
  listFlags,
  onFlagsChange,
  hasOverride,
  enumOf,
  FLAG_SPECS,
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

describe('feature flags', () => {
  beforeEach(() => vi.stubGlobal('localStorage', createMemoryStorage()));
  afterEach(() => { vi.unstubAllGlobals(); setStorageErrorHandler(null); });

  it('defaults resolve from the registry without any override', () => {
    loadFlags();
    // Defaults declared in FLAG_SPECS.
    expect(isOn('chat.streaming')).toBe(true);
    expect(isOn('experimental.nativeFileSystem')).toBe(false);
    // Unknown keys are safe and resolve to false.
    expect(isOn('no.such.flag')).toBe(false);
  });

  it('enforces boolean overrides and persists them', () => {
    loadFlags();
    toggleFlag('experimental.nativeFileSystem');
    expect(isOn('experimental.nativeFileSystem')).toBe(true);
    expect(hasOverride('experimental.nativeFileSystem')).toBe(true);

    // Re-load from storage like a fresh boot.
    loadFlags();
    expect(isOn('experimental.nativeFileSystem')).toBe(true);
  });

  it('rejects invalid override types', () => {
    loadFlags();
    setFlagOverride('chat.streaming', 'nope' as unknown as boolean); // string for a bool
    // Invalid value is ignored, so it stays on the default.
    expect(isOn('chat.streaming')).toBe(true);
  });

  it('clearing an override falls back to the default', () => {
    loadFlags();
    toggleFlag('chat.streaming');
    expect(isOn('chat.streaming')).toBe(false);
    setFlagOverride('chat.streaming', undefined);
    expect(isOn('chat.streaming')).toBe(true);
    expect(hasOverride('chat.streaming')).toBe(false);
  });

  it('reset restores every flag to its default', () => {
    loadFlags();
    toggleFlag('experimental.agentsRAG');
    toggleFlag('chat.streaming');
    resetAllFlags();
    expect(hasOverride('experimental.agentsRAG')).toBe(false);
    expect(hasOverride('chat.streaming')).toBe(false);
    expect(isOn('experimental.agentsRAG')).toBe(false);
    expect(isOn('chat.streaming')).toBe(true);
  });

  it('notifies subscribers on change', () => {
    loadFlags();
    let called = 0;
    const off = onFlagsChange(() => called++);
    toggleFlag('chat.streaming');
    expect(called).toBe(1);
    toggleFlag('chat.streaming');
    expect(called).toBe(2);
    off();
    toggleFlag('chat.streaming');
    expect(called).toBe(2); // unsubscribed now
  });

  it('lists every flag with its effective value and overridden state', () => {
    loadFlags();
    toggleFlag('eval.llmJudge');
    const all = listFlags();
    expect(all.length).toBe(FLAG_SPECS.length);
    const judge = all.find((f) => f.spec.key === 'eval.llmJudge')!;
    expect(judge.overridden).toBe(true);
    expect(judge.value).toBe(false);
    const native = all.find((f) => f.spec.key === 'experimental.nativeFileSystem')!;
    expect(native.value).toBe(false);
  });

  it('enum and string flags resolve typed values', () => {
    loadFlags();
    expect(enumOf<'openrouter' | 'openai'>('chat.defaultProvider')).toBe('openrouter');
    setFlagOverride('chat.defaultProvider', 'openai');
    expect(enumOf<'openrouter' | 'openai'>('chat.defaultProvider')).toBe('openai');
    // Unknown enum values are rejected, keeping the default.
    setFlagOverride('chat.defaultProvider', 'not-a-provider' as unknown as string);
    expect(enumOf<'openrouter' | 'openai'>('chat.defaultProvider')).toBe('openai');
  });
});
