import { readRaw, removeKey, writeRaw } from '../storage';
import type { CryptoAdapter, ProviderId } from '../types';

/**
 * Web adapter: AES-like obfuscation layered over localStorage.
 * For production, swap in a real crypto (e.g. WebCrypto) adapter.
 */
export function webCryptoAdapter(): CryptoAdapter {
  const key = 'acode.local.vault.salt.v1';
  let salt = readRaw(key) ?? '';
  if (!salt) {
    salt = Math.random().toString(36).slice(2);
    writeRaw(key, salt);
  }

  const xor = (input: string): string => {
    let out = '';
    for (let i = 0; i < input.length; i++) {
      out += String.fromCharCode(input.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return btoa(out);
  };
  const unxor = (input: string): string => {
    const decoded = atob(input);
    let out = '';
    for (let i = 0; i < decoded.length; i++) {
      out += String.fromCharCode(decoded.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return out;
  };

  return {
    encrypt: xor,
    decrypt: unxor,
    secureStore: {
      set: (k: string, v: string) => {
        writeRaw(k, v);
        return Promise.resolve();
      },
      get: (k: string) => Promise.resolve(readRaw(k) ?? undefined),
      remove: (k: string) => {
        removeKey(k);
        return Promise.resolve();
      },
    },
  };
}

export const KNOWN_PROVIDER_KEYS: { provider: ProviderId; field: string; placeholder: string; doc: string }[] = [
  { provider: 'openrouter', field: 'OpenRouter API key', placeholder: 'sk-or-v1-...', doc: 'https://openrouter.ai/keys' },
  { provider: 'openai', field: 'OpenAI API key', placeholder: 'sk-...', doc: 'https://platform.openai.com/api-keys' },
  { provider: 'google', field: 'Google AI Studio key', placeholder: 'AIza...', doc: 'https://aistudio.google.com/app/apikey' },
  { provider: 'anthropic', field: 'Anthropic API key', placeholder: 'sk-ant-...', doc: 'https://console.anthropic.com/' },
  { provider: 'mistral', field: 'Mistral API key', placeholder: '...', doc: 'https://console.mistral.ai/api-keys' },
  { provider: 'groq', field: 'Groq API key', placeholder: 'gsk_...', doc: 'https://console.groq.com/keys' },
  { provider: 'deepseek', field: 'DeepSeek API key', placeholder: 'sk-...', doc: 'https://platform.deepseek.com/' },
  { provider: 'together', field: 'Together AI key', placeholder: '...', doc: 'https://api.together.ai/settings/api-keys' },
];

export function maskKey(key: string): string {
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(12, key.length - 8))}${key.slice(-4)}`;
}
