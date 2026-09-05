import { readRaw, writeRaw, removeKey } from '../storage';
import type { CryptoAdapter, ProviderId } from '../types';

/**
 * Web adapter: real AES-GCM-256 encryption backed by WebCrypto.
 *
 * The secret key is a non-extractable `CryptoKey` persisted in IndexedDB (the
 * standard home for secret key material in browsers). Where IndexedDB is
 * unavailable (older in-app webviews / private browsing quirks) we fall back to
 * an exported key kept in localStorage so the app still works, at a slightly
 * weaker guarantee.
 *
 * Each ciphertext carries its own random 12-byte IV, so identical secrets never
 * encrypt to the same output. Data written by the previous XOR obfuscation
 * scheme is still decryptable transparently so existing keys survive upgrades.
 */
export function webCryptoAdapter(): CryptoAdapter {
  let keyPromise: Promise<CryptoKey> | null = null;

  const LS_KEY = 'acode.vault.key.v1';
  const LEGACY_SALT_KEY = 'acode.local.vault.salt.v1';

  const bytesToBase64 = (bytes: Uint8Array) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };

  const base64ToBytes = (b64: string) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const openIdb = (): Promise<IDBDatabase | null> =>
    new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open('acode.vault', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('keys')) req.result.createObjectStore('keys');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

  const idbGet = (db: IDBDatabase, key: string): Promise<unknown> =>
    new Promise((resolve) => {
      const tx = db.transaction('keys', 'readonly');
      const get = tx.objectStore('keys').get(key);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => resolve(undefined);
    });

  const idbSet = (db: IDBDatabase, key: string, value: unknown): Promise<void> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

  const generateKey = (extractable: boolean) =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);

  const getCryptoKey = async (): Promise<CryptoKey> => {
    if (!keyPromise) {
      keyPromise = (async () => {
        const idb = await openIdb();
        if (idb) {
          try {
            const stored = await idbGet(idb, 'cryptoKey');
            if (stored instanceof CryptoKey) return stored;
            const key = await generateKey(false);
            await idbSet(idb, 'cryptoKey', key);
            return key;
          } catch {
            /* fall through to localStorage fallback */
          }
        }
        const raw = readRaw(LS_KEY);
        if (raw) {
          return await crypto.subtle.importKey('raw', base64ToBytes(raw), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
        }
        const key = await generateKey(true);
        const exported = new Uint8Array(await crypto.subtle.exportKey('raw', key));
        writeRaw(LS_KEY, bytesToBase64(exported));
        return key;
      })();
    }
    return keyPromise;
  };

  const legacyXor = (input: string, decode: boolean): string => {
    const salt = readRaw(LEGACY_SALT_KEY);
    if (!salt) throw new Error('legacy ciphertext without salt');
    const source = decode ? atob(input) : input;
    let out = '';
    for (let i = 0; i < source.length; i++) {
      out += String.fromCharCode(source.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return decode ? out : btoa(out);
  };

  return {
    encrypt: async (plain: string) => {
      const key = await getCryptoKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
      return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
    },
    decrypt: async (cipher: string) => {
      const [ivB64, dataB64] = cipher.split('.');
      if (ivB64 && dataB64) {
        try {
          const key = await getCryptoKey();
          const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(ivB64) },
            key,
            base64ToBytes(dataB64),
          );
          return new TextDecoder().decode(plain);
        } catch {
          /* fall through to legacy */
        }
      }
      return legacyXor(cipher, true);
    },
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