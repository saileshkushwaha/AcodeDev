import { createProvider } from './provider';
import { KeyVault } from '../keys/KeyVault';
import { getProxyBase } from '../proxy';
import { getProvider } from '../models/catalog';
import type { ChatMessage, ChatRequest, ChatResponse, ChatStreamChunk, CryptoAdapter, ProviderId } from '../types';
import { baseUrlFor } from '../models/catalog';

export interface ChatEngineOpts {
  vault: KeyVault;
  /** Optional override for resolving keys/base URLs */
  resolver?: (req: ChatRequest) => { apiKey: string; baseUrl?: string; bypassVault?: boolean };
  /** Maximum number of key rotations to attempt before giving up. */
  maxRetries?: number;
}

/** Errors that indicate an API key problem and should trigger key rotation. */
const KEY_ERROR_PATTERNS = [
  /401/i,
  /403/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid.*key/i,
  /incorrect.*api.*key/i,
  /authentication/i,
  /credit/i,
  /quota/i,
  /billing/i,
  /rate.*limit/i,
  /insufficient.*balance/i,
];

function isKeyError(err: Error): boolean {
  const msg = err.message;
  return KEY_ERROR_PATTERNS.some((re) => re.test(msg));
}

export class ChatEngine {
  private vault: KeyVault;
  private resolver?: ChatEngineOpts['resolver'];
  private maxRetries: number;

  constructor(opts: ChatEngineOpts) {
    this.vault = opts.vault;
    this.resolver = opts.resolver;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private resolve(req: ChatRequest): ChatRequest {
    if (req.apiKey && req.baseUrl) return req;
    const key = this.vault.getKey(req.provider);
    const realBase = req.baseUrl ?? baseUrlFor(req.provider) ?? '';
    const proxy = getProxyBase();
    const isGateway = getProvider(req.provider)?.gateway;
    // Route browser-blocked gateway calls (no CORS) through the local relay.
    if (proxy && isGateway && realBase) {
      return { ...req, apiKey: key, baseUrl: proxy, upstreamBase: realBase };
    }
    return { ...req, apiKey: key, baseUrl: realBase, upstreamBase: undefined };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const resolved = this.resolver ? { ...req, ...this.resolver(req) } : this.resolve(req);
      const provider = createProvider(resolved.provider, resolved.baseUrl);
      try {
        return await provider.chat(resolved);
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (isKeyError(lastErr)) {
          const remaining = this.vault.rotateKey(req.provider);
          if (remaining === undefined || remaining === 0) {
            // No more keys to rotate
            break;
          }
          // Try next key
          continue;
        }
        // Non-key error, rethrow immediately
        throw lastErr;
      }
    }
    throw lastErr ?? new Error('Request failed');
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const resolved = this.resolver ? { ...req, ...this.resolver(req) } : this.resolve(req);
      const provider = createProvider(resolved.provider, resolved.baseUrl);
      try {
        // For streaming, we can't retry after partial yields, so we catch
        // errors that occur before the first yield.
        let hasYielded = false;
        const chunks: ChatStreamChunk[] = [];
        try {
          for await (const chunk of provider.stream(resolved)) {
            hasYielded = true;
            yield chunk;
          }
          return;
        } catch (e) {
          if (!hasYielded && isKeyError(e instanceof Error ? e : new Error(String(e)))) {
            lastErr = e instanceof Error ? e : new Error(String(e));
            const remaining = this.vault.rotateKey(req.provider);
            if (remaining === undefined || remaining === 0) break;
            continue;
          }
          throw e;
        }
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        break;
      }
    }
    if (lastErr) throw lastErr;
  }

  /**
   * Convenience: run a full chat turn and collect all tool calls,
   * optionally looping the agent loop.
   */
  async runTools(req: ChatRequest): Promise<ChatResponse> {
    return this.chat(req);
  }
}

/** Helpers to build requests */
export function userMsg(content: string): ChatMessage {
  return { role: 'user', content };
}
export function assistantMsg(content: string): ChatMessage {
  return { role: 'assistant', content };
}
export function systemMsg(content: string): ChatMessage {
  return { role: 'system', content };
}

export type { ChatRequest, ChatResponse, ChatStreamChunk, ChatMessage, ProviderId };
