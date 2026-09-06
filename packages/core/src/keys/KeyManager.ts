/**
 * API key management for OpenRouter and other providers.
 * Uses the provider's management API to list, create, and revoke API keys.
 */

// Browser-compatible crypto helpers using Web Crypto API
function base64URLEncode(buffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  // Browser fallback
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  }
  return base64URLEncode(array.buffer).slice(0, 43);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(hash);
  }
  // Fallback for Node.js (using createHash via dynamic import)
  const { createHash } = await import('node:crypto');
  return base64URLEncode(createHash('sha256').update(verifier).digest().buffer);
}

function generateState(): string {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** OAuth PKCE parameters for initiating a browser-based OAuth flow. */
export interface OAuthPKCEParams {
  url: string;
  codeVerifier: string;
  state: string;
}

/** Supported OAuth providers for the web OAuth flow. */
export type OAuthProvider = 'openrouter' | 'google' | 'github' | 'microsoft';

/** OAuth provider configuration */
export interface OAuthProviderConfig {
  authUrl: string;
  clientId: string;
  scope: string;
}

const OAUTH_PROVIDERS: Record<OAuthProvider, OAuthProviderConfig> = {
  openrouter: {
    authUrl: 'https://openrouter.ai/oauth/auth',
    clientId: 'acode-web',
    scope: 'user:api_keys',
  },
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: '784009182582-s9q7n0k3g4s2r9d4p9p4j9f8n1t3s3.apps.googleusercontent.com',
    scope: 'openid email profile https://www.googleapis.com/auth/userinfo.email',
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    clientId: 'Iv1.b1a2c3d4e5f6g7h8',
    scope: 'read:user user:email',
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    clientId: '12345678-1234-1234-1234-123456789012',
    scope: 'openid email profile',
  },
};

/** Generate OAuth PKCE parameters for the specified provider. */
export async function generateOAuthPKCEParams(redirectUri: string, provider: OAuthProvider = 'openrouter'): Promise<OAuthPKCEParams> {
  const config = OAUTH_PROVIDERS[provider];
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: config.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    provider,
  });
  return {
    url: `${config.authUrl}?${params.toString()}`,
    codeVerifier,
    state,
  };
}

/** Exchange an OAuth authorization code for an access token. */
export async function exchangeOAuthCode(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  provider: OAuthProvider = 'openrouter',
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const config = OAUTH_PROVIDERS[provider];
  const tokenUrl =
    provider === 'openrouter'
      ? 'https://openrouter.ai/oauth/token'
      : provider === 'google'
        ? 'https://oauth2.googleapis.com/token'
        : provider === 'github'
          ? 'https://github.com/login/oauth/access_token'
          : provider === 'microsoft'
            ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
            : '';
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** Result of a key rotation operation. */
export interface KeyRotationResult {
  newApiKey: string;
  oldKeyCount: number;
  rotatedKeys: number;
}

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
    const data = (await res.json()) as { data?: ManagedKey[] };
    return data.data ?? [];
  }

  async create(_options: CreateKeyOptions = {}): Promise<ManagedKey> {
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
    const data = (await res.json()) as { id: string; hash: string; created: number; name?: string; limit?: number | null };
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
