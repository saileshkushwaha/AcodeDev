import type { ModelCapability, ModelInfo, ProviderId } from '../types';

/**
 * Derive the resource capabilities a model can accept from its tags and any
 * multimodal hints carried by the live source. Models default to text + tool
 * + file + folder + link (universal); vision unlocks image/svg/drawio.
 */
export function inferCapabilities(
  tags: string[] = [],
  inputModalities?: string[] | string,
): ModelCapability[] {
  const caps: ModelCapability[] = ['text', 'tool', 'file', 'folder', 'link'];
  const list = Array.isArray(inputModalities)
    ? inputModalities
    : typeof inputModalities === 'string'
      ? [inputModalities]
      : [];
  const hasVision =
    list.length > 0
      ? list.some((m) => m === 'image' || m === 'vision')
      : tags.includes('vision');
  if (hasVision) caps.push('vision', 'image', 'svg', 'drawio');
  if (tags.includes('reasoning') || tags.includes('thinking')) caps.push('reasoning');
  if (tags.includes('code') || tags.includes('coding')) caps.push('code');
  if (tags.includes('vision') || hasVision) {
    if (!caps.includes('vision')) caps.push('vision');
  }
  return [...new Set(caps)];
}

/** Stable label per capability (used by the model selector / context UI). */
export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  text: 'Text',
  tool: 'Tool calling',
  vision: 'Vision / images',
  image: 'Images',
  file: 'Files',
  folder: 'Folders',
  svg: 'SVG',
  drawio: 'draw.io',
  link: 'Links',
  code: 'Code',
  reasoning: 'Reasoning',
};

/**
 * A provider/gateway definition. Providers can be:
 *  - direct vendors with a native protocol (openai / google / anthropic / local)
 *  - OpenAI-compatible gateways (kind 'gateway' or any 'openai' kind) that
 *    expose many third-party models behind a single base URL + key
 */
export type ProviderKind = 'openai' | 'google' | 'anthropic' | 'local' | 'gateway';

export interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  kind: ProviderKind;
  auth: 'bearer' | 'x-api-key' | 'query';
  website?: string;
  /** Aggregator gateway (e.g. OpenRouter) exposing many third-party models. */
  gateway?: boolean;
  /** Local/offline providers usually don't need a key. */
  needsKey?: boolean;
  /** Short description shown in the UI. */
  description?: string;
}

export interface ModelRecord extends ModelInfo {
  provider: string;
}

/* ----------------------------------------------------------------------------
 * Seeded defaults (curated): the built-in vendors + well-known OpenAI-compatible
 * gateways. The in-memory registry can be extended at runtime via register* and
 * by syncing OpenRouter's live model list.
 * ------------------------------------------------------------------------- */

const SEED_PROVIDERS: ProviderDef[] = [
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', kind: 'gateway', auth: 'bearer', website: 'https://openrouter.ai', gateway: true, needsKey: true, description: '800+ models from every vendor, incl. free and huge-context options.' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', kind: 'openai', auth: 'bearer', website: 'https://platform.openai.com', needsKey: true, description: 'GPT models directly from OpenAI.' },
  { id: 'google', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', kind: 'google', auth: 'query', website: 'https://aistudio.google.com', needsKey: true, description: 'Gemini models with huge context (up to 2M).' },
  { id: 'anthropic', name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1', kind: 'anthropic', auth: 'x-api-key', website: 'https://console.anthropic.com', needsKey: true, description: 'Claude models directly from Anthropic.' },
  { id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', kind: 'openai', auth: 'bearer', website: 'https://console.mistral.ai', needsKey: true, description: 'Open-weight Mistral models.' },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', kind: 'openai', auth: 'bearer', website: 'https://console.groq.com', needsKey: true, description: 'Ultra-fast inference (LPU) — Llama and others free.' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', kind: 'openai', auth: 'bearer', website: 'https://platform.deepseek.com', needsKey: true, description: 'DeepSeek V3 / R1 at low cost.' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', kind: 'openai', auth: 'bearer', website: 'https://api.together.ai', needsKey: true, description: 'Open models on rented GPUs.' },
  { id: 'deepinfra', name: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai', kind: 'openai', auth: 'bearer', website: 'https://deepinfra.com', needsKey: true, description: 'Cheap open model inference gateway.' },
  { id: 'fireworks', name: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', kind: 'openai', auth: 'bearer', website: 'https://fireworks.ai', needsKey: true, description: 'Fast open-model serving gateway.' },
  { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', kind: 'openai', auth: 'bearer', website: 'https://cerebras.ai', needsKey: true, description: 'Wafer-scale, ultra-low latency models.' },
  { id: 'novita', name: 'Novita AI', baseUrl: 'https://api.novita.ai/v3/openai', kind: 'openai', auth: 'bearer', website: 'https://novita.ai', needsKey: true, description: 'Open-model GPU cloud gateway.' },
  { id: 'opencode', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', kind: 'gateway', auth: 'bearer', website: 'https://opencode.ai/zen', gateway: true, needsKey: true, description: 'OpenCode-curated models incl. the free Big Pickle and other free coding models.' },
  { id: 'kilocode', name: 'Kilo Gateway', baseUrl: 'https://api.kilo.ai/api/gateway', kind: 'gateway', auth: 'bearer', website: 'https://kilo.ai/gateway', gateway: true, needsKey: true, description: 'OpenRouter-compatible gateway to hundreds of models incl. free ones.' },
  { id: 'local', name: 'Local / Offline', baseUrl: 'http://localhost:11434/v1', kind: 'local', auth: 'bearer', needsKey: false, description: 'Local llama.cpp / Ollama-compatible server.' },
];

const FREE_MODELS: Record<string, ModelInfo[]> = {
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat', 'fast'] },
    { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat', 'reasoning'] },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)', provider: 'openrouter', contextWindow: 1000000, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'vision'] },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat'] },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat', 'fast', 'small'] },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (free)', provider: 'openrouter', contextWindow: 32768, maxOutput: 4096, isFree: true, tags: ['chat'] },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', contextWindow: 128000, maxOutput: 16384, isFree: false, costPer1kIn: 0.00015, costPer1kOut: 0.0006, tags: ['chat'] },
  ],
  google: [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (free tier)', provider: 'google', contextWindow: 1000000, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'vision'] },
    { id: 'gemini-2.5-pro-exp-03-25', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 1000000, maxOutput: 65536, isFree: false, tags: ['chat', 'reasoning'] },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (free tier)', provider: 'google', contextWindow: 2000000, maxOutput: 8192, isFree: true, tags: ['chat', 'vision'] },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, maxOutput: 8192, isFree: false, costPer1kIn: 0.0008, costPer1kOut: 0.004, tags: ['chat', 'fast'] },
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral', contextWindow: 32000, maxOutput: 4096, isFree: true, tags: ['chat'] },
    { id: 'mistral-medium-latest', name: 'Mistral Medium', provider: 'mistral', contextWindow: 32000, maxOutput: 4096, isFree: false, tags: ['chat'] },
  ],
  groq: [
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Groq)', provider: 'groq', contextWindow: 131072, maxOutput: 32768, isFree: true, tags: ['chat', 'fast'] },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)', provider: 'groq', contextWindow: 131072, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'small'] },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Groq)', provider: 'groq', contextWindow: 8192, maxOutput: 8192, isFree: true, tags: ['chat', 'small'] },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', contextWindow: 128000, maxOutput: 8192, isFree: false, costPer1kIn: 0.00027, costPer1kOut: 0.0011, tags: ['chat', 'reasoning'] },
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B (Together)', provider: 'together', contextWindow: 128000, maxOutput: 4096, isFree: false, costPer1kIn: 0.00088, costPer1kOut: 0.00088, tags: ['chat'] },
  ],
  deepinfra: [
    { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B (DeepInfra)', provider: 'deepinfra', contextWindow: 128000, maxOutput: 8192, isFree: false, tags: ['chat'] },
  ],
  fireworks: [
    { id: 'accounts/fireworks/models/llama-v3p1-70b-instruct', name: 'Llama 3.1 70B (Fireworks)', provider: 'fireworks', contextWindow: 131072, maxOutput: 8192, isFree: false, tags: ['chat'] },
  ],
  cerebras: [
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Cerebras)', provider: 'cerebras', contextWindow: 131072, maxOutput: 8192, isFree: false, tags: ['chat', 'fast'] },
  ],
  novita: [
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B (Novita)', provider: 'novita', contextWindow: 131072, maxOutput: 8192, isFree: false, tags: ['chat'] },
  ],
  opencode: [
    { id: 'big-pickle', name: 'Big Pickle (free)', provider: 'opencode', contextWindow: 1048576, maxOutput: 65536, isFree: true, tags: ['chat', 'coding', 'long-context'] },
    { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (free)', provider: 'opencode', contextWindow: 1048576, maxOutput: 65536, isFree: true, tags: ['chat', 'coding', 'fast', 'free'] },
    { id: 'mimo-v2.5-free', name: 'MiMo V2.5 (free)', provider: 'opencode', contextWindow: 262144, maxOutput: 65536, isFree: true, tags: ['chat', 'coding', 'free'] },
    { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (free)', provider: 'opencode', contextWindow: 524288, maxOutput: 65536, isFree: true, tags: ['chat', 'coding', 'free'] },
    { id: 'north-mini-code-free', name: 'North Mini Code (free)', provider: 'opencode', contextWindow: 262144, maxOutput: 32768, isFree: true, tags: ['chat', 'coding', 'fast', 'free'] },
  ],
  kilocode: [
    { id: 'kilo-auto/free', name: 'Kilo Auto Free', provider: 'kilocode', contextWindow: 1000000, maxOutput: 65536, isFree: true, tags: ['chat', 'auto', 'free'] },
    { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B (free)', provider: 'kilocode', contextWindow: 262144, maxOutput: 32768, isFree: true, tags: ['chat', 'free'] },
    { id: 'stepfun/step-3.7-flash:free', name: 'StepFun Step 3.7 Flash (free)', provider: 'kilocode', contextWindow: 262144, maxOutput: 32768, isFree: true, tags: ['chat', 'fast', 'free'] },
    { id: 'poolside/laguna-s-2.1:free', name: 'Poolside Laguna S 2.1 (free)', provider: 'kilocode', contextWindow: 262144, maxOutput: 32768, isFree: true, tags: ['chat', 'coding', 'free'] },
    { id: 'nvidia/nemotron-3.5-lightning:free', name: 'Nemotron 3.5 Lightning (free)', provider: 'kilocode', contextWindow: 262144, maxOutput: 32768, isFree: true, tags: ['chat', 'coding', 'free'] },
  ],
  local: [
    { id: 'local/default', name: 'Local model (llama.cpp)', provider: 'local', contextWindow: 32768, maxOutput: 4096, isFree: true, tags: ['chat', 'offline'] },
  ],
};

/* ----------------------------------------------------------------------------
 * In-memory registry with change notification.
 * ------------------------------------------------------------------------- */

const registryProviders = new Map<string, ProviderDef>();
const registryModels = new Map<string, ModelRecord>();
const listeners = new Set<() => void>();

function seed() {
  SEED_PROVIDERS.forEach((p) => registryProviders.set(p.id, p));
  Object.values(FREE_MODELS).forEach((group) =>
    group.forEach((m) =>
      registryModels.set(
        `${m.provider}::${m.id}`,
        { ...m, capabilities: (m as ModelRecord).capabilities ?? inferCapabilities(m.tags) } as ModelRecord,
      ),
    ),
  );
}
seed();

/** Runtime additions (not part of the curated seed) we persist for offline use. */
const seedModelKeys = new Set<string>();
Object.values(FREE_MODELS)
  .flat()
  .forEach((m) => seedModelKeys.add(`${m.provider}::${m.id}`));

function notify() {
  listeners.forEach((l) => l());
}

function keyOf(provider: string, modelId: string) {
  return `${provider}::${modelId}`;
}

/** Subscribe to registry changes (e.g. after an OpenRouter sync). Returns unsubscribe. */
export function onCatalogChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function registerProvider(def: ProviderDef) {
  registryProviders.set(def.id, def);
  notify();
}

export function unregisterProvider(id: string) {
  registryProviders.delete(id);
  // remove its models too
  [...registryModels.keys()].filter((k) => k.startsWith(`${id}::`)).forEach((k) => registryModels.delete(k));
  notify();
}

export function registerModel(m: ModelRecord | ModelInfo) {
  const rec: ModelRecord = { ...m, provider: m.provider };
  registryModels.set(keyOf(rec.provider, rec.id), rec);
  notify();
}

export function getProvider(id: string): ProviderDef | undefined {
  return registryProviders.get(id);
}

export function listProviders(): ProviderDef[] {
  return [...registryProviders.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function listGatewayProviders(): ProviderDef[] {
  return listProviders().filter((p) => p.gateway);
}

/** Registry of the provider id -> name used across the dashboard. */
export const PROVIDER_LIST: { id: string; name: string }[] = listProviders().map((p) => ({ id: p.id, name: p.name }));
// Keep PROVIDER_LIST in sync when providers change (screens re-render on a
// catalog version bump, re-reading this array which is updated in place).
listeners.add(() => {
  PROVIDER_LIST.length = 0;
  registryProviders.forEach((p) => PROVIDER_LIST.push({ id: p.id, name: p.name }));
  PROVIDER_LIST.sort((a, b) => a.name.localeCompare(b.name));
});

export function listModels(provider?: string): ModelRecord[] {
  if (provider) {
    const def = getProvider(provider);
    let ids = [...registryModels.values()].filter((m) => m.provider === provider);
    // Prioritize free then the biggest context windows; prevents every dropdown
    // from ballooning when a gateway (e.g. OpenRouter) has thousands of models.
    ids.sort(
      (a, b) =>
        (b.isFree ? 1 : 0) - (a.isFree ? 1 : 0) ||
        b.contextWindow - a.contextWindow ||
        a.name.localeCompare(b.name),
    );
    if (def?.gateway && ids.length > GATEWAY_MODEL_CAP) ids = ids.slice(0, GATEWAY_MODEL_CAP);
    return ids;
  }
  return [...registryModels.values()];
}

/** Max models surfaced per gateway provider in compact dropdowns. */
export const GATEWAY_MODEL_CAP = 60;

export function getModel(id: string): ModelRecord | undefined {
  for (const m of registryModels.values()) {
    if (m.id === id || keyOf(m.provider, m.id) === id) return m;
  }
  return undefined;
}

export function getFreeModels(): ModelRecord[] {
  return [...registryModels.values()].filter((m) => m.isFree);
}

/** Filtered, searchable model query for the Model Browser / selectors. */
export function searchModels(opts: {
  provider?: string;
  free?: boolean;
  minContext?: number;
  q?: string;
  limit?: number;
} = {}): ModelRecord[] {
  let res = [...registryModels.values()];
  if (opts.provider) res = res.filter((m) => m.provider === opts.provider);
  if (opts.free) res = res.filter((m) => m.isFree);
  if (opts.minContext !== undefined && opts.minContext > 0) res = res.filter((m) => m.contextWindow >= (opts.minContext as number));
  if (opts.q) {
    const q = opts.q.toLowerCase();
    res = res.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }
  res.sort((a, b) => b.contextWindow - a.contextWindow || a.name.localeCompare(b.name));
  if (opts.limit) res = res.slice(0, opts.limit);
  return res;
}

export function baseUrlFor(provider: string): string | undefined {
  return getProvider(provider)?.baseUrl;
}

export function DEFAULT_BASE_URLS(provider: string): Record<string, string> {
  const out: Record<string, string> = {};
  registryProviders.forEach((p) => (out[p.id] = p.baseUrl));
  if (provider) return { [provider]: registryProviders.get(provider)?.baseUrl ?? '' };
  return out;
}

/* ----------------------------------------------------------------------------
 * OpenRouter live sync.
 * ------------------------------------------------------------------------- */

/** OpenAI-compatible gateways we can pull live model lists from (no key required). */
export interface GatewaySource {
  id: string; // registry provider id
  modelsUrl: string;
  /** Some gateways return pricing; others only expose free by id suffix. */
  hasPricing?: boolean;
}
export const GATEWAY_SOURCES: GatewaySource[] = [
  { id: 'openrouter', modelsUrl: 'https://openrouter.ai/api/v1/models', hasPricing: true },
  { id: 'opencode', modelsUrl: 'https://opencode.ai/zen/v1/models' },
  { id: 'kilocode', modelsUrl: 'https://api.kilo.ai/api/gateway/models', hasPricing: true },
];

function parseContext(spec: string | undefined): number {
  if (!spec) return 0;
  const s = String(spec).trim().toLowerCase();
  // "128k", "2.5m", "1 m" style
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|m)$/);
  if (m) {
    const n = parseFloat(m[1]);
    return m[2] === 'm' ? n * 1000000 : n * 1000;
  }
  // plain number = raw token count (e.g. "131072")
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return 0;
}

/** True if a model id is free (explicit flag, `:free`/`-free` suffix, or Big Pickle). */
function isFreeModelId(id: string): boolean {
  if (!id) return false;
  const lower = id.toLowerCase();
  return (
    lower === 'big-pickle' ||
    lower.startsWith('kilo-auto/free') ||
    lower.endsWith(':free') ||
    /(^|\/)([a-z0-9._-]+)-free$/i.test(lower) ||
    /^[a-z0-9._-]+-free$/i.test(lower.split('/').pop() ?? '')
  );
}

function priceOf(pricing: unknown, key: string): number | null {
  if (pricing == null) return null;
  if (typeof pricing === 'object') {
    const v = (pricing as Record<string, unknown>)[key];
    if (v != null) return parseFloat(String(v));
  }
  if (typeof pricing === 'string') {
    // "free" or "0"
    if (pricing.trim().toLowerCase() === 'free') return 0;
    return parseFloat(pricing);
  }
  return null;
}

/**
 * Fetch a gateway's live model catalog and merge usable models (free, or free
 * with a real context window) into the registry under that provider id.
 * Returns the number of models added, or -1 if the endpoint was unreachable.
 */
export async function syncGatewayData(source: GatewaySource): Promise<number> {
  let data: { data?: Array<Record<string, unknown>>; models?: Array<Record<string, unknown>> };
  try {
    const res = await fetch(source.modelsUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${source.id} ${res.status}`);
    data = await res.json();
  } catch {
    return 0;
  }
  const arr = Array.isArray(data.data) ? data.data : Array.isArray((data as { models?: unknown }).models) ? (data as { models: Array<Record<string, unknown>> }).models : [];
  if (!Array.isArray(arr) || arr.length === 0) return -1;

  let added = 0;
  for (const m of arr) {
    const id = String(m.id ?? '');
    if (!id) continue;
    const name = String(m.name ?? id);
    const ctx = parseContext(String(m.context_length ?? m.contextWindow ?? m.context ?? ''));
    const isFree =
      source.hasPricing === false
        ? isFreeModelId(id)
        : isFreeModelId(id) ||
          (m.isFree === true) ||
          (priceOf((m as { pricing?: unknown }).pricing, 'prompt') === 0 && priceOf((m as { pricing?: unknown }).pricing, 'completion') === 0);

    // Skip paid models with no context (junk); keep all free so the free catalog is rich.
    if (!isFree && ctx === 0) continue;

    const promptPrice = priceOf((m as { pricing?: unknown }).pricing, 'prompt');
    const completionPrice = priceOf((m as { pricing?: unknown }).pricing, 'completion');
    const topProvider = (m.top_provider as Record<string, unknown> | undefined)?.context_length;
    const maxOutput = (typeof topProvider === 'number' && topProvider > 0 ? Number(topProvider) : Number(m.max_tokens ?? 0)) || 8192;

    const tags: string[] = ['chat'];
    if (isFree) tags.push('free');
    if (ctx >= 64000) tags.push('long-context');

    const arch = (m.architecture ?? {}) as Record<string, unknown> | undefined;
    const direct = arch?.input_modalities as string[] | undefined;
    const nested = (arch?.modalities as { input?: string[] } | undefined)?.input;
    const textFlag = arch?.modalitiy_text;
    const modalities: string[] | string | undefined =
      direct ?? nested ?? (textFlag !== undefined ? (textFlag ? ['text', 'image'] : ['text']) : undefined);
    const capabilities = inferCapabilities(tags, modalities);

    const record: ModelRecord = {
      id,
      name,
      provider: source.id,
      contextWindow: ctx,
      maxOutput,
      isFree,
      costPer1kIn: promptPrice != null ? promptPrice * 1000 : undefined,
      costPer1kOut: completionPrice != null ? completionPrice * 1000 : undefined,
      tags,
      capabilities,
    };
    // Don't overwrite curated seeds with worse data; only add new ids.
    if (!registryModels.has(keyOf(source.id, id))) {
      registryModels.set(keyOf(source.id, id), record);
      added++;
    }
  }
  notify();
  return added;
}

/** Sync a single remote sources (by registry provider id). Returns models added. */
export async function syncGatewayById(providerId: string): Promise<number> {
  const src = GATEWAY_SOURCES.find((s) => s.id === providerId);
  if (!src) return 0;
  return syncGatewayData(src);
}

/** Sync every configured gateway (OpenRouter, OpenCode Zen, Kilo). Returns total added. */
export async function syncAllGateways(): Promise<number> {
  const results = await Promise.all(GATEWAY_SOURCES.map((s) => syncGatewayData(s)));
  const added = results.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const reachable = results.some((r) => r >= 0);
  return reachable ? added : -1;
}

/** Backward-compatible single source sync (OpenRouter). */
export async function syncOpenRouterData(): Promise<number> {
  return syncGatewayById('openrouter');
}

/* Persistence helpers for synced/runtime catalog data (offline-first).
 * We only persist non-seed additions (OpenRouter-synced models, custom
 * gateways/providers) to keep localStorage small; seeds re-seed on load. */
const CATALOG_STORE = 'acode.catalog.v1';

function persistedModelKeys(): string[] {
  // keep custom providers' models + openrouter synced models, drop seed keys
  return [...registryModels.keys()].filter(
    (k) => !seedModelKeys.has(k) && (getProvider(k.split('::')[0])?.gateway || k.startsWith('custom::')),
  );
}

export function persistCatalog() {
  try {
    const customProviders = [...registryProviders.entries()].filter(([id]) => {
      const def = registryProviders.get(id);
      return def && !SEED_PROVIDERS.some((s) => s.id === id);
    });
    const modelKeys = persistedModelKeys();
    const payload = {
      providers: customProviders,
      models: modelKeys.map((k) => [k, registryModels.get(k) as ModelRecord]),
      syncedAt: Date.now(),
    };
    localStorage.setItem(CATALOG_STORE, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_STORE);
    if (!raw) return false;
    const data = JSON.parse(raw) as { providers?: [string, ProviderDef][]; models?: [string, ModelRecord][] };
    if (Array.isArray(data.providers)) {
      data.providers.forEach(([id, def]) => def && registryProviders.set(id, def));
    }
    if (Array.isArray(data.models)) {
      data.models.forEach(([k, rec]) => {
        if (!rec) return;
        // respect seed precedence & avoid stale duplicates
        if (seedModelKeys.has(k)) return;
        const [pid, mid] = k.split('::');
        registryModels.set(k, { ...rec, provider: pid, id: mid });
      });
    }
    notify();
    return true;
  } catch {
    return false;
  }
}
