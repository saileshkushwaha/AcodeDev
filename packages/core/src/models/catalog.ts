import type { ModelInfo, ProviderId } from '../types';

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
    group.forEach((m) => registryModels.set(`${m.provider}::${m.id}`, m as ModelRecord)),
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

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

function parseContext(spec: string | undefined): number {
  if (!spec) return 0;
  const s = String(spec).trim().toLowerCase();
  // "128k", "2.5m", "1 m" style
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(k|m)$/);
  if (m) {
    const n = parseFloat(m[1]);
    return m[2] === 'm' ? n * 1000000 : n * 1000;
  }
  // plain number = raw token count (OpenRouter returns e.g. "131072")
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return 0;
}

/**
 * Fetch OpenRouter's live model catalog and merge the free / big-context models
 * into the registry as OpenRouter provider models, keeping the seeded set.
 * Returns the number of models added.
 */
export async function syncOpenRouterData(): Promise<number> {
  let data: { data: Array<Record<string, unknown>> };
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    data = await res.json();
  } catch {
    return 0;
  }
  if (!Array.isArray(data.data) || data.data.length === 0) return -1;

  let added = 0;
  for (const m of data.data) {
    const id = String(m.id ?? '');
    const name = String(m.name ?? id);
    const ctx = parseContext(String(m.context_length ?? m.contextWindow ?? ''));
    // pricing shape: { prompt: "0", completion: "0", request: "0", image: "0" }
    const pricing = (m.pricing ?? {}) as Record<string, string | undefined>;
    const promptPrice = parseFloat(pricing.prompt ?? '0');
    const completionPrice = parseFloat(pricing.completion ?? '0');
    const isFree = promptPrice === 0 && completionPrice === 0;
    const tags: string[] = [];
    const arch = (m.architecture ?? {}) as Record<string, unknown>;
    if (arch.modalitiy_text || (Array.isArray(arch.input_modalities) && arch.input_modalities.includes('text'))) tags.push('chat');
    if (isFree) tags.push('free');
    if (ctx >= 64000) tags.push('long-context');
    const topProvider = (m.top_provider as Record<string, unknown> | undefined)?.context_length;
    const maxOutput = typeof topProvider === 'number' && topProvider > 0 ? Number(topProvider) : 8192;

    // Only register models that are usable (free OR real context), skip junk.
    if (!id) continue;
    if (!isFree && ctx === 0) continue;

    const record: ModelRecord = {
      id,
      name,
      provider: 'openrouter',
      contextWindow: ctx,
      maxOutput,
      isFree,
      costPer1kIn: promptPrice * 1000,
      costPer1kOut: completionPrice * 1000,
      tags,
    };
    // Do not overwrite curated seeds with worse data; only add new ids.
    if (!registryModels.has(keyOf('openrouter', id))) {
      registerModel(record);
      added++;
    }
  }
  notify();
  return added;
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
