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

  constructor(adapter: CryptoAdapter) {
    this.adapter = adapter;
    this.load();
  }

  private load() {
    void this.adapter.secureStore.get(this.storageKey).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        Object.entries(parsed).forEach(([id, payload]) => {
          try {
            const decrypted = this.adapter.decrypt(payload);
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
              category: (id === 'local' ? 'ai' : 'ai'),
              label: id,
              connectorType: 'LLM',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
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
    this.entries.forEach((entry, id) => {
      out[id] = this.adapter.encrypt(JSON.stringify(entry));
    });
    await this.adapter.secureStore.set(this.storageKey, JSON.stringify(out));
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
