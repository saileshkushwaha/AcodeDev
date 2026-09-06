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

  constructor(adapter: CryptoAdapter) {
    this.adapter = adapter;
    this.readyPromise = this.load();
  }

  private async load() {
    try {
      const raw = await this.adapter.secureStore.get(this.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      await Promise.all(
        Object.entries(parsed).map(async ([id, payload]) => {
          try {
            const decrypted = await this.adapter.decrypt(payload);
            // New format: JSON entry
            try {
              const entry = JSON.parse(decrypted) as KeyEntry;
              if (entry && typeof entry.value === 'string') {
                this.entries.set(id, entry);
                return;
              }
            } catch {
              /* fall through to legacy */
            }
            // Legacy format: raw secret -> treat as an AI provider key
            this.entries.set(id, {
              value: decrypted,
              category: id === 'local' ? 'ai' : 'ai',
              label: id,
              connectorType: 'LLM',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          } catch {
            /* ignore corrupted */
          }
        }),
      );
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

  clear() {
    this.entries.clear();
    void this.persist();
  }
}
