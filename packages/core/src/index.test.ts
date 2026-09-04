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
  extractVariables,
  renderPrompt,
  estimateTokens,
  PROMPT_LIBRARY,
  PROMPT_CATEGORIES,
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
