import { WORKFLOW_LIBRARY } from './library';
import type { WorkflowDefinition } from './WorkflowEngine';

const STORAGE_KEY = 'acode.workflows.v1';

function storage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function clone(def: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(def)) as WorkflowDefinition;
}

/**
 * Persistent workflow store. Built-in library presets are seeded on first
 * load; custom workflows (created by saving an edited preset or a blank
 * canvas) are persisted to localStorage. Built-ins can be reset but never
 * deleted.
 */
export class WorkflowRegistry {
  private store = new Map<string, WorkflowDefinition>();
  private seeded = false;

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as WorkflowDefinition[];
        data.forEach((d) => this.store.set(d.id, d));
        this.seeded = true;
      }
    } catch {
      /* ignore corrupted storage */
    }
    this.ensureSeeded();
  }

  private persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify([...this.store.values()]));
    } catch {
      /* ignore quota errors */
    }
  }

  /** Seed any built-in library presets not already present (backfills new presets on upgrade). */
  ensureSeeded(): number {
    let changed = 0;
    for (const lib of WORKFLOW_LIBRARY) {
      if (this.store.has(lib.id)) continue;
      this.store.set(lib.id, { ...clone(lib), updatedAt: Date.now() });
      changed += 1;
    }
    this.seeded = true;
    if (changed > 0) this.persist();
    return changed;
  }

  all(): WorkflowDefinition[] {
    return [...this.store.values()].sort((a, b) => {
      if (a.builtin && !b.builtin) return -1;
      if (!a.builtin && b.builtin) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  get(id: string): WorkflowDefinition | undefined {
    return this.store.get(id);
  }

  /** Upsert a workflow definition. Used to persist custom edits. */
  save(def: WorkflowDefinition): WorkflowDefinition {
    const record: WorkflowDefinition = {
      ...clone(def),
      builtin: def.builtin ?? this.store.get(def.id)?.builtin ?? false,
      updatedAt: Date.now(),
    };
    this.store.set(record.id, record);
    this.persist();
    return record;
  }

  remove(id: string): boolean {
    const existing = this.store.get(id);
    if (!existing || existing.builtin) return false;
    this.store.delete(id);
    this.persist();
    return true;
  }

  /** Restore a built-in preset back to its curated library definition. */
  resetBuiltin(id: string): WorkflowDefinition | undefined {
    const lib = WORKFLOW_LIBRARY.find((w) => w.id === id);
    if (!lib) return undefined;
    const record = { ...clone(lib), updatedAt: Date.now() };
    this.store.set(record.id, record);
    this.persist();
    return record;
  }

  library(): WorkflowDefinition[] {
    return WORKFLOW_LIBRARY;
  }
}