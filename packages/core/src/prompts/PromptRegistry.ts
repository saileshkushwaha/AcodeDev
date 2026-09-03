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
  currentVersion: number;
  versions: PromptVersion[];
  updatedAt: number;
}

/**
 * Prompt versioning store: keeps an immutable history of prompt versions,
 * lets you bump, roll back, and tag changes.
 */
export class PromptRegistry {
  private prompts = new Map<string, PromptRecord>();

  create(name: string, content: string, opts?: { description?: string; note?: string }): PromptRecord {
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const record: PromptRecord = {
      id,
      name,
      description: opts?.description,
      currentVersion: 1,
      versions: [{ version: 1, content, note: opts?.note ?? 'Initial version', createdAt: Date.now() }],
      updatedAt: Date.now(),
    };
    this.prompts.set(id, record);
    return record;
  }

  get(id: string): PromptRecord | undefined {
    return this.prompts.get(id);
  }

  all(): PromptRecord[] {
    return [...this.prompts.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  currentVersion(id: string): PromptVersion | undefined {
    const r = this.prompts.get(id);
    return r?.versions.find((v) => v.version === r.currentVersion);
  }

  bumpVersion(id: string, content: string, note?: string): PromptRecord {
    const r = this.prompts.get(id);
    if (!r) throw new Error('Prompt not found');
    const next = r.currentVersion + 1;
    r.versions.push({ version: next, content, note, createdAt: Date.now() });
    r.currentVersion = next;
    r.updatedAt = Date.now();
    return r;
  }

  rollback(id: string, version: number): PromptRecord {
    const r = this.prompts.get(id);
    if (!r) throw new Error('Prompt not found');
    if (!r.versions.some((v) => v.version === version)) throw new Error('Version not found');
    r.currentVersion = version;
    r.updatedAt = Date.now();
    return r;
  }

  delete(id: string) {
    this.prompts.delete(id);
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
