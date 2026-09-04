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
}

export class ChatEngine {
  private vault: KeyVault;
  private resolver?: ChatEngineOpts['resolver'];

  constructor(opts: ChatEngineOpts) {
    this.vault = opts.vault;
    this.resolver = opts.resolver;
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
    const resolved = this.resolver ? { ...req, ...this.resolver(req) } : this.resolve(req);
    const provider = createProvider(resolved.provider, resolved.baseUrl);
    return provider.chat(resolved);
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const resolved = this.resolver ? { ...req, ...this.resolver(req) } : this.resolve(req);
    const provider = createProvider(resolved.provider, resolved.baseUrl);
    yield* provider.stream(resolved);
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
