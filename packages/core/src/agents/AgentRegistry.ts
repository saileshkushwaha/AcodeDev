import type { ProviderId } from '../types';

export interface AgentConvMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  systemPrompt: string;
  provider: ProviderId;
  model: string;
  /** Tool names from the built-in Toolbox. */
  tools: string[];
  enableRAG: boolean;
  maxIter: number;
  conversation: AgentConvMessage[];
  updatedAt: number;
}

const STORAGE_KEY = 'acode.agents.v1';

function storage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function clone(def: AgentDefinition): AgentDefinition {
  return JSON.parse(JSON.stringify(def)) as AgentDefinition;
}

/**
 * Persistent agent store. Agent builder configs (name, prompt, provider,
 * model, tools, RAG flag, iterations) plus a full chat transcript are saved
 * to localStorage so a built agent survives reloads.
 */
export class AgentRegistry {
  private store = new Map<string, AgentDefinition>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as AgentDefinition[];
      (Array.isArray(data) ? data : []).forEach((d) => this.store.set(d.id, d));
    } catch {
      /* corrupted or unavailable storage — start fresh */
    }
  }

  private persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify([...this.store.values()]));
    } catch {
      /* ignore quota errors */
    }
  }

  all(): AgentDefinition[] {
    return [...this.store.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): AgentDefinition | undefined {
    return this.store.get(id);
  }

  /** Upsert an agent configuration (auto-bumps updatedAt). */
  save(def: AgentDefinition): AgentDefinition {
    const record: AgentDefinition = {
      ...clone(def),
      updatedAt: Date.now(),
    };
    this.store.set(record.id, record);
    this.persist();
    return record;
  }

  remove(id: string): boolean {
    if (!this.store.has(id)) return false;
    this.store.delete(id);
    this.persist();
    return true;
  }
}