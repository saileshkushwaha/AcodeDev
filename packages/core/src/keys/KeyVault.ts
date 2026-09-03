import type { CryptoAdapter, ProviderId } from '../types';

/**
 * Secure in-memory vault for API keys.
 * On web it layers encryption over localStorage; on native it uses the secure store.
 */
export class KeyVault {
  private keys = new Map<ProviderId, string>();
  private adapter: CryptoAdapter;
  private storageKey = 'acode.vault.v1';

  constructor(adapter: CryptoAdapter) {
    this.adapter = adapter;
    this.load();
  }

  private load() {
    void this.adapter.secureStore.get(this.storageKey).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        Object.entries(parsed).forEach(([k, v]) => {
          try {
            this.keys.set(k as ProviderId, this.adapter.decrypt(v));
          } catch {
            /* ignore corrupted */
          }
        });
      } catch {
        /* ignore */
      }
    });
  }

  private async persist() {
    const out: Record<string, string> = {};
    this.keys.forEach((v, k) => {
      out[k] = this.adapter.encrypt(v);
    });
    await this.adapter.secureStore.set(this.storageKey, JSON.stringify(out));
  }

  setKey(provider: ProviderId, key: string) {
    this.keys.set(provider, key);
    void this.persist();
  }

  getKey(provider: ProviderId): string | undefined {
    return this.keys.get(provider);
  }

  hasKey(provider: ProviderId): boolean {
    return !!this.keys.get(provider);
  }

  removeKey(provider: ProviderId) {
    this.keys.delete(provider);
    void this.persist();
  }

  allKeys(): Partial<Record<ProviderId, string>> {
    return Object.fromEntries(this.keys.entries()) as Partial<Record<ProviderId, string>>;
  }

  clear() {
    this.keys.clear();
    void this.persist();
  }
}
