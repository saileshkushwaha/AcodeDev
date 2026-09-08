import type { CryptoAdapter, ProviderId } from '../types';
import type { ConnectorCategory } from './connectors';

/**
 * A stored secret plus lightweight metadata for organizing connectors.
 */
export interface KeyEntry {
  value: string;
  category: ConnectorCategory;
  label: string;
  connectorType?: string;
  createdAt: number;
  updatedAt: number;
  /** Additional API keys for fallback when the primary key fails. */
  keys?: Array<{ value: string; createdAt: number; updatedAt: number; label?: string }>;
  /** OAuth token metadata (stored internally, not for public use). */
  _auth?: { refreshToken?: string; expiresAt?: number };
}

/**
 * Secure in-memory vault for API keys and arbitrary connector secrets.
 * On web it layers encryption over localStorage; on native it uses the secure store.
 *
 * Supports any string id (LLM providers, business SaaS, dev/DevOps, or fully
 * custom connectors) and stores per-entry category/label metadata so the UI
 * can organize connectors by type while remaining adaptable.
 */
export class KeyVault {
  private entries = new Map<string, KeyEntry>();
  private adapter: CryptoAdapter;
  private storageKey = 'acode.vault.v1';
  private readyPromise: Promise<void>;
  private persistChain: Promise<void> = Promise.resolve();
  /** Set when vault had encrypted data but decryption failed (likely lost crypto key). */
  decryptionFailed = false;

  constructor(adapter: CryptoAdapter) {
    this.adapter = adapter;
    this.readyPromise = this.load();
  }

  private async load() {
    try {
      const raw = await this.adapter.secureStore.get(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      const ids = Object.keys(parsed);
      let decrypted = 0;
      await Promise.all(
        Object.entries(parsed).map(async ([id, payload]) => {
          try {
            const dec = await this.adapter.decrypt(payload);
            // New format: JSON entry
            try {
              const entry = JSON.parse(dec) as KeyEntry;
              if (entry && typeof entry.value === 'string') {
                this.entries.set(id, entry);
                decrypted++;
                return;
              }
            } catch {
              /* fall through to legacy */
            }
            // Legacy format: raw secret -> treat as an AI provider key
            this.entries.set(id, {
              value: dec,
              category: id === 'local' ? 'ai' : 'ai',
              label: id,
              connectorType: 'LLM',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            decrypted++;
          } catch {
            /* ignore corrupted */
          }
        }),
      );
      // If we had stored data but decrypted nothing, the crypto key was likely lost
      if (ids.length > 0 && decrypted === 0) {
        this.decryptionFailed = true;
        console.warn('[vault] All entries failed to decrypt — crypto key may have been lost. Re-enter your API keys.');
      }
    } catch {
      /* ignore */
    }
  }

  private persist() {
    this.persistChain = this.persistChain
      .then(async () => {
        const out: Record<string, string> = {};
        for (const [id, entry] of this.entries) {
          try {
            out[id] = await this.adapter.encrypt(JSON.stringify(entry));
          } catch {
            /* skip entries that fail to encrypt */
          }
        }
        await this.adapter.secureStore.set(this.storageKey, JSON.stringify(out));
      })
      .catch(() => {
        /* a failed write must not stall subsequent writes */
      });
    return this.persistChain;
  }

  /** Resolves once persisted entries have been loaded into memory. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Resolves once all pending writes have been flushed to storage. */
  flush(): Promise<void> {
    return Promise.all([this.readyPromise, this.persistChain]).then(() => undefined);
  }

  /** Set a key with optional connector metadata (defaults to an AI provider). */
  setKey(id: string, value: string, meta?: { category?: ConnectorCategory; label?: string; connectorType?: string }): void {
    const existing = this.entries.get(id);
    const now = Date.now();
    this.entries.set(id, {
      value,
      category: meta?.category ?? existing?.category ?? 'ai',
      label: meta?.label ?? existing?.label ?? id,
      connectorType: meta?.connectorType ?? existing?.connectorType ?? 'LLM',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    void this.persist();
  }

  /** Set a full entry object (used by the connector manager). */
  setEntry(id: string, entry: KeyEntry): void {
    this.entries.set(id, { ...entry, updatedAt: Date.now() });
    void this.persist();
  }

  getKey(id: string): string | undefined {
    return this.entries.get(id)?.value;
  }

  /** Get all keys (primary + fallback) for a provider, newest first. */
  getKeys(id: string): string[] {
    const entry = this.entries.get(id);
    if (!entry) return [];
    const all = [{ value: entry.value, updatedAt: entry.updatedAt }, ...(entry.keys ?? [])];
    return [...all].sort((a, b) => b.updatedAt - a.updatedAt).map((k) => k.value);
  }

  /** Add a fallback key for a provider. */
  addKey(id: string, value: string, meta?: { label?: string }): void {
    const existing = this.entries.get(id);
    if (!existing) {
      // Create entry if it doesn't exist
      this.setKey(id, value, { category: 'ai', label: meta?.label ?? id, connectorType: 'LLM' });
      return;
    }
    const now = Date.now();
    const keys = existing.keys ?? [];
    keys.push({ value, createdAt: now, updatedAt: now, label: meta?.label });
    this.entries.set(id, { ...existing, keys, updatedAt: now });
    void this.persist();
  }

  /** Remove a specific fallback key by index (0-based, from the keys array). */
  removeKeyAt(id: string, index: number): void {
    const existing = this.entries.get(id);
    if (!existing || !existing.keys) return;
    existing.keys.splice(index, 1);
    this.entries.set(id, existing);
    void this.persist();
  }

  /** Rotate to the next working key — moves the current primary to fallback and promotes the next one. */
  rotateKey(id: string): number | undefined {
    const existing = this.entries.get(id);
    if (!existing) return undefined;
    const all = [existing.value, ...(existing.keys ?? []).map((k) => k.value)];
    if (all.length <= 1) return undefined; // can't rotate, only one key

    const [first, ...rest] = all;
    const newPrimary = rest[0];
    const newKeys = rest.slice(1).map((v, i) => ({
      value: v,
      createdAt: existing.keys?.[i]?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }));
    const now = Date.now();
    this.entries.set(id, {
      ...existing,
      value: newPrimary,
      keys: [{ value: first, createdAt: existing.createdAt, updatedAt: now }, ...newKeys],
      updatedAt: now,
    });
    void this.persist();
    return newKeys.length; // number of remaining fallback keys
  }

  getEntry(id: string): KeyEntry | undefined {
    return this.entries.get(id);
  }

  hasKey(id: string): boolean {
    return this.entries.has(id);
  }

  removeKey(id: string) {
    this.entries.delete(id);
    void this.persist();
  }

  allKeys(): Record<string, string> {
    return Object.fromEntries([...this.entries.entries()].map(([id, e]) => [id, e.value]));
  }

  /** All stored entries as [id, entry] tuples, newest first. */
  allEntries(): [string, KeyEntry][] {
    return [...this.entries.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  }

  /** Convenience compatibility: set a provider key with its display label. */
  setProviderKey(provider: ProviderId, value: string, label: string): void {
    this.setKey(provider, value, { category: 'ai', label, connectorType: 'LLM' });
  }

  /** Store an API management key for automated key rotation (e.g. OpenRouter management key). */
  setManagementKey(provider: string, value: string): void {
    const now = Date.now();
    this.entries.set(`${provider}.mgmt`, {
      value,
      category: 'ai',
      label: `${provider} API management key`,
      connectorType: 'Key Manager',
      createdAt: now,
      updatedAt: now,
    });
    void this.persist();
  }

  /** Get the API management key for a provider. */
  getManagementKey(provider: string): string | undefined {
    return this.entries.get(`${provider}.mgmt`)?.value;
  }

  /** Check if a management key is configured for a provider. */
  hasManagementKey(provider: string): boolean {
    return this.entries.has(`${provider}.mgmt`);
  }

  /** Remove the API management key for a provider. */
  removeManagementKey(provider: string): void {
    this.entries.delete(`${provider}.mgmt`);
    void this.persist();
  }

  /** List all management keys by provider. */
  allManagementKeys(): Array<{ provider: string; value: string }> {
    return [...this.entries.entries()]
      .filter(([id]) => id.endsWith('.mgmt'))
      .map(([id, entry]) => ({ provider: id.replace(/\.mgmt$/, ''), value: entry.value }));
  }

  /** Store an OAuth-authenticated account for a provider. */
  setAccount(
    provider: string,
    accountId: string,
    apiKey: string,
    meta?: { refreshToken?: string; expiresAt?: number; label?: string },
  ): void {
    const now = Date.now();
    const entry: KeyEntry = {
      value: apiKey,
      category: 'ai',
      label: meta?.label ?? `${provider} (${accountId.slice(0, 8)})`,
      connectorType: 'OAuth Account',
      createdAt: now,
      updatedAt: now,
    };
    // Store refresh token and expiry on the entry
    if (meta) {
      (entry as any)._auth = { refreshToken: meta.refreshToken, expiresAt: meta.expiresAt };
    }
    this.entries.set(`${provider}.acct.${accountId}`, entry);
    void this.persist();
  }

  /** Get all OAuth accounts for a provider. */
  getAccounts(provider: string): Array<{ accountId: string; apiKey: string; label: string; refreshToken?: string; expiresAt?: number }> {
    return [...this.entries.entries()]
      .filter(([id]) => id.startsWith(`${provider}.acct.`))
      .map(([id, entry]) => {
        const accountId = id.replace(`${provider}.acct.`, '');
        const auth = (entry as any)._auth;
        return {
          accountId,
          apiKey: entry.value,
          label: entry.label,
          refreshToken: auth?.refreshToken,
          expiresAt: auth?.expiresAt,
        };
      });
  }

  /** Remove an OAuth account. */
  removeAccount(provider: string, accountId: string): void {
    this.entries.delete(`${provider}.acct.${accountId}`);
    void this.persist();
  }

  clear() {
    this.entries.clear();
    void this.persist();
  }
}
