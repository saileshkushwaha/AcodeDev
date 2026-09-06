/**
 * API key management for OpenRouter and other providers.
 * Uses the provider's management API to list, create, and revoke API keys.
 */

export interface ManagedKey {
  id: string;
  name: string;
  hashed: string;
  created: number;
  lastUsed?: number;
  usage?: number;
  limit?: number | null;
  disabled?: boolean;
}

/** Options for creating a new managed key. */
export interface CreateKeyOptions {
  /** Optional name/description for the key. */
  name?: string;
  /** Optional spending limit in USD. */
  limit?: number | null;
}

export interface KeyManagerApi {
  list(): Promise<ManagedKey[]>;
  create(options?: CreateKeyOptions): Promise<ManagedKey>;
  delete(keyId: string): Promise<void>;
  /** Create a new key and immediately get its plaintext value. */
  createWithSecret(options?: CreateKeyOptions): Promise<{ key: ManagedKey; value: string }>;
}

/**
 * OpenRouter key manager. Uses the OpenRouter API to manage keys.
 * The management key (sk-or-v1-...) must have key management permissions.
 */
export class OpenRouterKeyManager implements KeyManagerApi {
  private baseUrl = 'https://openrouter.ai/api/v1';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async list(): Promise<ManagedKey[]> {
    const res = await fetch(`${this.baseUrl}/keys`, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Key manager list failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { data?: ManagedKey[] };
    return data.data ?? [];
  }

  async create(options: CreateKeyOptions = {}): Promise<ManagedKey> {
    throw new Error('OpenRouter create() does not return a key value — use createWithSecret()');
  }

  /**
   * Create a new API key and get its plaintext value immediately.
   * OpenRouter returns the key value in the response on creation, but it cannot be
   * retrieved again, so we capture it here.
   */
  async createWithSecret(options: CreateKeyOptions = {}): Promise<{ key: ManagedKey; value: string }> {
    const name = options.name ?? `key-${Date.now()}`;
    const res = await fetch(`${this.baseUrl}/keys`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name,
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Key manager create failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { id: string; hash: string; created: number; name?: string; limit?: number | null };
    const key: ManagedKey = {
      id: data.id,
      name: data.name ?? name,
      hashed: data.hash,
      created: data.created,
      limit: data.limit,
    };
    // OpenRouter returns the plaintext key in `key` field, but it's not
    // always included depending on the API version. We handle the case
    // where it might not be returned.
    const value = (data as { key?: string }).key ?? '';
    return { key, value };
  }

  async delete(keyId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/keys/${keyId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Key manager delete failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * Get the key value if this API key itself starts with sk-or-v1-
   * (It can be used as the key value itself)
   */
  static isManagementKey(key: string): boolean {
    return key.startsWith('sk-or-v1-') || key.startsWith('sk-or-');
  }
}

/** Factory function to create a key manager for a given provider. */
export function createKeyManager(provider: string, apiKey: string): KeyManagerApi | null {
  if (provider === 'openrouter') return new OpenRouterKeyManager(apiKey);
  return null;
}
