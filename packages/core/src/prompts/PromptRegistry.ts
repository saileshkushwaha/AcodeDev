import { PROMPT_LIBRARY, type PromptCategory } from './library';

export interface PromptVersion {
  version: number;
  content: string;
  params?: Record<string, unknown>;
  note?: string;
  createdAt: number;
  author?: string;
}

export interface PromptRecord {
  id: string;
  name: string;
  description?: string;
  category?: PromptCategory;
  tags?: string[];
  /** Built-in library prompts are seeded; editable but can be reset. */
  builtin?: boolean;
  /** Optional system/identity prompt separate from user content. */
  systemPrompt?: string;
  currentVersion: number;
  versions: PromptVersion[];
  /** Observability / usage counters. */
  uses?: number;
  lastUsedAt?: number;
  favorite?: boolean;
  updatedAt: number;
}

export interface CreatePromptOpts {
  description?: string;
  note?: string;
  category?: PromptCategory;
  tags?: string[];
  systemPrompt?: string;
  builtin?: boolean;
}

const STORAGE_KEY = 'acode.prompts.v2';

function storage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/** Pull `{{name}}` variables out of a prompt template (deduped, in order). */
export function extractVariables(content: string): string[] {
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const v = m[1].trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Replace `{{var}}` placeholders with user-provided values (missing => empty). */
export function renderPrompt(content: string, values: Record<string, string>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const v = values[key.trim()];
    return v !== undefined ? v : '';
  });
}

/** Rough token estimate (~4 chars ≈ 1 token, with a floor), for display only. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}

/** Compute the estimated token count of a rendered prompt (system + content). */
export function estimatePromptTokens(record: Pick<PromptRecord, 'versions' | 'currentVersion' | 'systemPrompt'>): number {
  const cur = record.versions.find((v) => v.version === record.currentVersion);
  const sys = record.systemPrompt ?? '';
  return estimateTokens(sys + (cur?.content ?? ''));
}

/**
 * Versioned, persistent, categorized prompt store. Built-in enterprise prompts
 * are seeded on first load; user edits, favorites, categories and usage stats
 * are persisted to localStorage.
 */
export class PromptRegistry {
  private prompts = new Map<string, PromptRecord>();
  private seeded = false;

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as PromptRecord[];
        data.forEach((p) => this.prompts.set(p.id, p));
        this.seeded = true; // assume previous version seeded; reseed fills gaps anyway
      }
    } catch {
      /* ignore */
    }
    this.ensureSeeded();
  }

  private persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify([...this.prompts.values()]));
    } catch {
      /* ignore quota errors */
    }
  }

  /** Seed any built-in library prompts not already present. */
  ensureSeeded() {
    if (this.seeded) {
      // Still backfill any library prompts added after an existing install.
    }
    let changed = false;
    for (const lp of PROMPT_LIBRARY) {
      if (this.prompts.has(lp.id)) continue;
      const record: PromptRecord = {
        id: lp.id,
        name: lp.name,
        description: lp.description,
        category: lp.category,
        tags: lp.tags,
        systemPrompt: lp.systemPrompt,
        builtin: true,
        currentVersion: 1,
        versions: [{ version: 1, content: lp.content, note: 'Built-in', createdAt: Date.now() }],
        uses: 0,
        favorite: false,
        updatedAt: Date.now(),
      };
      this.prompts.set(lp.id, record);
      changed = true;
    }
    this.seeded = true;
    if (changed) this.persist();
  }

  create(name: string, content: string, opts?: CreatePromptOpts): PromptRecord {
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const record: PromptRecord = {
      id,
      name,
      description: opts?.description,
      category: opts?.category,
      tags: opts?.tags,
      systemPrompt: opts?.systemPrompt,
      builtin: opts?.builtin,
      currentVersion: 1,
      versions: [{ version: 1, content, note: opts?.note ?? 'Initial version', createdAt: Date.now() }],
      uses: 0,
      favorite: false,
      updatedAt: Date.now(),
    };
    this.prompts.set(id, record);
    this.persist();
    return record;
  }

  get(id: string): PromptRecord | undefined {
    return this.prompts.get(id);
  }

  all(): PromptRecord[] {
    return [...this.prompts.values()].sort((a, b) => b.favorite === a.favorite ? b.updatedAt - a.updatedAt : (a.favorite ? -1 : 1));
  }

  currentVersion(id: string): PromptVersion | undefined {
    const r = this.prompts.get(id);
    return r?.versions.find((v) => v.version === r.currentVersion);
  }

  updateMeta(id: string, meta: Partial<Pick<PromptRecord, 'name' | 'description' | 'category' | 'tags' | 'systemPrompt'>>) {
    const r = this.prompts.get(id);
    if (!r) return;
    if (meta.name !== undefined) r.name = meta.name;
    if (meta.description !== undefined) r.description = meta.description;
    if (meta.category !== undefined) r.category = meta.category;
    if (meta.tags !== undefined) r.tags = meta.tags;
    if (meta.systemPrompt !== undefined) r.systemPrompt = meta.systemPrompt;
    r.updatedAt = Date.now();
    this.persist();
  }

  bumpVersion(id: string, content: string, note?: string): PromptRecord {
    const r = this.prompts.get(id);
    if (!r) throw new Error('Prompt not found');
    const next = r.currentVersion + 1;
    r.versions.push({ version: next, content, note, createdAt: Date.now() });
    r.currentVersion = next;
    r.updatedAt = Date.now();
    this.persist();
    return r;
  }

  rollback(id: string, version: number): PromptRecord {
    const r = this.prompts.get(id);
    if (!r) throw new Error('Prompt not found');
    if (!r.versions.some((v) => v.version === version)) throw new Error('Version not found');
    r.currentVersion = version;
    r.updatedAt = Date.now();
    this.persist();
    return r;
  }

  delete(id: string) {
    this.prompts.delete(id);
    this.persist();
  }

  /** Reset a built-in prompt back to its library definition (new versions preserved). */
  resetBuiltin(id: string): PromptRecord | undefined {
    const lp = PROMPT_LIBRARY.find((p) => p.id === id);
    const r = this.prompts.get(id);
    if (!lp || !r) return r;
    const next = r.currentVersion + 1;
    r.versions.push({ version: next, content: lp.content, note: `Reset to built-in v${lp.id}`, createdAt: Date.now() });
    r.currentVersion = next;
    r.systemPrompt = lp.systemPrompt;
    r.category = lp.category;
    r.tags = lp.tags;
    r.description = lp.description;
    r.name = lp.name;
    r.updatedAt = Date.now();
    this.persist();
    return r;
  }

  toggleFavorite(id: string): boolean {
    const r = this.prompts.get(id);
    if (!r) return false;
    r.favorite = !r.favorite;
    r.updatedAt = Date.now();
    this.persist();
    return r.favorite;
  }

  recordUse(id: string) {
    const r = this.prompts.get(id);
    if (!r) return;
    r.uses = (r.uses ?? 0) + 1;
    r.lastUsedAt = Date.now();
    this.persist();
  }

  vars(id: string): string[] {
    const v = this.currentVersion(id);
    const sys = this.prompts.get(id)?.systemPrompt ?? '';
    return [...new Set([...extractVariables(sys), ...extractVariables(v?.content ?? '')])];
  }

  countByCategory(cat: PromptCategory): number {
    return [...this.prompts.values()].filter((p) => p.category === cat).length;
  }

  allTags(): string[] {
    const tags = new Set<string>();
    this.prompts.forEach((p) => (p.tags ?? []).forEach((t) => tags.add(t)));
    return [...tags].sort();
  }
}

/**
 * In-memory + async-persist registry wrapper that works across
 * the state layer (web and mobile).
 */
export class PromptStore {
  constructor(private registry = new PromptRegistry()) {}
  get registryRef() {
    return this.registry;
  }
}

export type { PromptCategory } from './library';
export { PROMPT_CATEGORIES, PROMPT_LIBRARY } from './library';
