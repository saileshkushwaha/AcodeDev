import { describe, it, expect } from 'vitest';
import {
  KeyVault,
  webCryptoAdapter,
  PromptRegistry,
  RAGMemory,
  listModels,
  getFreeModels,
  GitHubClient,
  maskKey,
} from './index';

describe('KeyVault', () => {
  it('encrypts and decrypts keys', () => {
    const vault = new KeyVault(webCryptoAdapter());
    vault.setKey('openrouter', 'sk-or-test');
    expect(vault.getKey('openrouter')).toBe('sk-or-test');
    vault.removeKey('openrouter');
    expect(vault.hasKey('openrouter')).toBe(false);
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
