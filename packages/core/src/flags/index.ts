import { readJSON, writeJSON } from '../storage';

/**
 * Feature flag registry.
 *
 * Flags let us ship and evaluate features progressively: each flag declares a
 * typed default plus optional per-user/override value. Overrides persist to
 * localStorage (through the shared storage layer, so quota/availability errors
 * are surfaced consistently) and any change notifies subscribers so React
 * contexts can re-render immediately.
 *
 * Design goals:
 *  - Type-safe: `on(flag)` resolves a bool, `value(flag)` resolves any T.
 *  - Offline-first: overrides stored locally; a remote provider can be bolted
 *    onto the same resolution path later without changing call sites.
 *  - Stateless default + override merge: `defaults` is the code-level source
 *    of truth; `override` (when set) wins.
 */

export const FLAGS_STORAGE_KEY = 'acode.flags.v1';
export type StorageErrorHandler = (key: string, error: unknown) => void;
let errorHandler: StorageErrorHandler | null = null;
export function setStorageErrorHandler(handler: StorageErrorHandler | null): void { errorHandler = handler; }


export interface BaseFlagSpec {
  key: string;
  kind: FlagKind;
  /** Default used when no override is set. */
  default: unknown;
  /** Short human label shown in the Flags screen. */
  label: string;
  /** Longer description shown in the Flags screen. */
  description: string;
  /** Grouping for the Flags screen. */
  group: string;
  /**
   * When true the flag is hidden from the user-facing Flags screen and can
   * only be toggled via the API / devtools. Good for internal kill switches.
   */
  hidden?: boolean;
  /** Optional allowed values for enum flags. */
  options?: string[];
}

export interface FlagSpec<T = unknown> extends Omit<BaseFlagSpec, 'default'> {
  key: string;
  kind: FlagKind;
  default: T;
}

/**
 * Registry of every flag in the app. Keep this explicit so the whole surface
 * is discoverable in one place.
 */
export const FLAG_SPECS: FlagSpec[] = [
  {
    key: 'chat.diffViewer',
    kind: 'boolean',
    default: true,
    label: 'Inline diff viewer',
    description: 'Render file diffs inline in the chat file panel (uses the local relay proxy when available).',
    group: 'Chat',
  },
  {
    key: 'chat.streaming',
    kind: 'boolean',
    default: true,
    label: 'Streaming responses',
    description: 'Stream assistant responses token-by-token with live syntax highlighting.',
    group: 'Chat',
  },
  {
    key: 'experimental.nativeFileSystem',
    kind: 'boolean',
    default: false,
    label: 'Native file system (experimental)',
    description: 'Enable direct read/write to the local file system through the relay proxy (/fs/read, /fs/write).',
    group: 'Experimental',
  },
  {
    key: 'projects.inactiveConversations',
    kind: 'boolean',
    default: true,
    label: 'Inactive conversations',
    description: 'Allow conversations to be marked inactive (viewable but not usable) when a project is deleted, preserving chat history.',
    group: 'Projects',
  },
  {
    key: 'workflows.finalOutputMode',
    kind: 'enum',
    default: 'md',
    options: ['md', 'raw'],
    label: 'Final output mode',
    description: 'Control how workflow run results are copied: Markdown fenced code block or plain text.',
    group: 'Workflows',
  },
  {
    key: 'experimental.agentsRAG',
    kind: 'boolean',
    default: false,
    label: 'Agent RAG + tool calling',
    description: 'Enable retrieval-augmented generation and tool use for AI Agents. Off by default until hardened.',
    group: 'Experimental',
  },
  {
    key: 'experimental.gatewaySync',
    kind: 'boolean',
    default: true,
    label: 'Gateway catalog sync',
    description: 'Fetch live model catalogs from gateways (OpenRouter, OpenCode Zen, Kilo) in the background on launch.',
    group: 'Sync',
  },
  {
    key: 'plingo.proxyRelay',
    kind: 'boolean',
    default: true,
    label: 'Proxy relay',
    description: 'Route blocked (CORS) gateway requests through the local relay proxy. Disable to call gateways directly.',
    group: 'Sync',
  },
  {
    key: 'eval.llmJudge',
    kind: 'boolean',
    default: true,
    label: 'LLM judge evals',
    description: 'Allow LLM-as-judge scoring for prompt evals (uses a second model call per case).',
    group: 'Prompts & Evals',
  },
  {
    key: 'chat.defaultProvider',
    kind: 'enum',
    default: 'openrouter',
    options: ['openrouter', 'openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek', 'together', 'local'],
    label: 'Default chat provider',
    description: 'Provider pre-selected when opening a brand-new chat session.',
    group: 'Chat',
  },
  {
    key: 'github.pullRequests',
    kind: 'boolean',
    default: true,
    label: 'GitHub pull requests',
    description: 'Show pull request browsing, diffs and comments inside the GitHub screen.',
    group: 'GitHub',
  },
  {
    key: 'mobile.secureStore',
    kind: 'boolean',
    default: false,
    hidden: true,
    label: 'Secure store (native)',
    description: 'Use the native secure store for the key vault on mobile builds.',
    group: 'Platform',
  },
];

const FLAG_MAP: ReadonlyMap<string, FlagSpec> = new Map(FLAG_SPECS.map((f) => [f.key, f]));

/** Overrides loaded from localStorage: flag key -> stored value. */
const overrides = new Map<string, unknown>();

const listeners = new Set<() => void>();

/** Register a subscriber fired whenever any flag value may have changed. */
export function onFlagsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* never let a subscriber break the registry */
    }
  });
}

/** Load persisted overrides (called once at app start; idempotent). */
export function loadFlags(): void {
  const data = readJSON<Record<string, unknown>>(FLAGS_STORAGE_KEY);
  if (!data) return;
  for (const [key, value] of Object.entries(data)) {
    const spec = FLAG_MAP.get(key);
    if (!spec) continue;
    if (!isValidValue(spec, value)) continue;
    overrides.set(key, value);
  }
}

/** Validate a candidate override value against its spec. */
function isValidValue(spec: FlagSpec, value: unknown): boolean {
  if (spec.kind === 'boolean') return typeof value === 'boolean';
  if (spec.kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (spec.kind === 'string') return typeof value === 'string';
  if (spec.kind === 'enum') return typeof value === 'string' && (spec.options?.includes(value) ?? true);
  return true;
}

function persistOverrides() {
  writeJSON(FLAGS_STORAGE_KEY, Object.fromEntries(overrides.entries()));
}

/** Whether any override currently exists for this flag. */
export function hasOverride(key: string): boolean {
  return overrides.has(key);
}

/** True when the flags screen is opted into seeing hidden/internal flags. */
export function showHiddenFlags(enabled: boolean): void {
  writeJSON(FLAGS_STORAGE_KEY, { ...Object.fromEntries(overrides.entries()), __hidden: enabled });
}

/** Resolve the effective (default-or-override) value of a flag. */
export function valueOf<T>(key: string): T {
  const spec = FLAG_MAP.get(key);
  if (!spec) return undefined as T;
  if (overrides.has(key)) return overrides.get(key) as T;
  return spec.default as T;
}

/** Resolve a boolean flag (returns false for unknown keys). */
export function isOn(key: string): boolean {
  return Boolean(valueOf<unknown>(key));
}

/** Resolve an enum / string flag (returns default for unknown keys). */
export function enumOf<T extends string>(key: string): T {
  const spec = FLAG_MAP.get(key);
  if (spec?.kind === 'enum' || spec?.kind === 'string') return valueOf<T>(key);
  return ((spec?.default ?? '') as T);
}

/** Get the current effective value for display in the Flags screen. */
export function currentValue<T = unknown>(key: string): T {
  return valueOf<T>(key);
}

/**
 * Set a flag override for this user. Pass `undefined` to clear the override
 * and fall back to the default. Persists and notifies subscribers.
 */
export function setFlagOverride(key: string, value: unknown | undefined): void {
  const spec = FLAG_MAP.get(key);
  if (!spec) return;
  if (value === undefined || value === null) {
    overrides.delete(key);
  } else {
    if (!isValidValue(spec, value)) return;
    overrides.set(key, value);
  }
  persistOverrides();
  notify();
}

/** Toggle a boolean flag override (no-op for non-boolean flags). */
export function toggleFlag(key: string): void {
  const spec = FLAG_MAP.get(key);
  if (!spec || spec.kind !== 'boolean') return;
  setFlagOverride(key, !isOn(key));
}

/** Clear every override, returning all flags to their defaults. */
export function resetAllFlags(): void {
  overrides.clear();
  writeJSON(FLAGS_STORAGE_KEY, {});
  notify();
}

/** List every flag, with its effective value and whether it is overridden. */
export function listFlags(): { spec: FlagSpec; value: unknown; overridden: boolean }[] {
  return FLAG_SPECS.map((spec) => ({
    spec,
    value: overrides.has(spec.key) ? overrides.get(spec.key) : spec.default,
    overridden: overrides.has(spec.key),
  }));
}

/** Where the user can toggle hidden flags; mirrors the __hidden marker. */
export function hiddenFlagsVisible(): boolean {
  const data = readJSON<Record<string, unknown>>(FLAGS_STORAGE_KEY);
  return data?.__hidden === true;
}

