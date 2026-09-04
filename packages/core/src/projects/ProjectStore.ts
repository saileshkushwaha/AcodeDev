import type { ChatMessage, ProviderId } from '../types';

export type FileChangeStatus = 'added' | 'modified' | 'deleted';

export interface ChangedFile {
  path: string;
  status: FileChangeStatus;
  changedAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  changedFiles: ChangedFile[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectDoc {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  gitRepo?: string;
  conversations: string[];
  promptIds: string[];
  workflowIds: string[];
  agentIds: string[];
  evalIds: string[];
}

interface PersistShape {
  projects: ProjectDoc[];
  conversations: Conversation[];
}

const STORAGE_KEY = 'acode.projects.v1';

function storage(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

/**
 * All-in-one project workspace: ties together conversations, prompts,
 * workflows, agents and evals under a project, plus a GitHub link.
 *
 * Conversations are persisted to localStorage so chat history survives
 * reloads, with full session CRUD (create/rename/clear/delete).
 */
export class ProjectStore {
  private projects = new Map<string, ProjectDoc>();
  private conversations = new Map<string, Conversation>();

  constructor() {
    this.load();
  }

  private load() {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as PersistShape;
      this.projects = new Map(data.projects.map((p) => [p.id, p] as const));
      this.conversations = new Map(data.conversations.map((c) => [c.id, c] as const));
    } catch {
      /* corrupted or unavailable storage — start fresh */
    }
  }

  private persist() {
    try {
      const data: PersistShape = {
        projects: [...this.projects.values()],
        conversations: [...this.conversations.values()],
      };
      storage()?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* ignore quota / availability errors */
    }
  }

  createProject(name: string, opts?: { description?: string; color?: string; gitRepo?: string }): ProjectDoc {
    const id = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const doc: ProjectDoc = {
      id,
      name,
      description: opts?.description,
      color: opts?.color ?? '#7c3aed',
      gitRepo: opts?.gitRepo,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conversations: [],
      promptIds: [],
      workflowIds: [],
      agentIds: [],
      evalIds: [],
    };
    this.projects.set(id, doc);
    this.persist();
    return doc;
  }

  projectsList(): ProjectDoc[] {
    return [...this.projects.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getProject(id: string): ProjectDoc | undefined {
    return this.projects.get(id);
  }

  createConversation(input: { title: string; projectId?: string; provider: ProviderId; model: string }): Conversation {
    const id = `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const conv: Conversation = {
      id,
      title: input.title,
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      messages: [],
      changedFiles: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.conversations.set(id, conv);
    if (input.projectId) {
      const p = this.projects.get(input.projectId);
      if (p && !p.conversations.includes(id)) {
        p.conversations.push(id);
        p.updatedAt = Date.now();
      }
    }
    this.persist();
    return conv;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  appendMessage(convId: string, msg: ChatMessage) {
    const c = this.conversations.get(convId);
    if (c) {
      c.messages.push(msg);
      c.updatedAt = Date.now();
      this.persist();
    }
  }

  /** Record that a file was changed in a conversation (dedupes by path). */
  addChangedFile(convId: string, path: string, status: FileChangeStatus = 'modified'): void {
    const c = this.conversations.get(convId);
    if (!c || !path.trim()) return;
    const existing = c.changedFiles.find((f) => f.path === path);
    if (existing) {
      existing.status = status;
      existing.changedAt = Date.now();
    } else {
      c.changedFiles.push({ path, status, changedAt: Date.now() });
    }
    c.updatedAt = Date.now();
    this.persist();
  }

  /** Files changed in a conversation, most recent first. */
  changedFilesFor(convId: string | null): ChangedFile[] {
    const c = convId ? this.conversations.get(convId) : undefined;
    return (c?.changedFiles ?? [])
      .slice()
      .sort((a, b) => b.changedAt - a.changedAt);
  }

  /** Rename a conversation. */
  renameConversation(id: string, title: string): void {
    const c = this.conversations.get(id);
    if (c) {
      c.title = title.trim() || c.title;
      c.updatedAt = Date.now();
      this.persist();
    }
  }

  /** Clear a conversation's message history but keep the session + metadata. */
  clearConversation(id: string): void {
    const c = this.conversations.get(id);
    if (c) {
      c.messages = [];
      c.changedFiles = [];
      c.updatedAt = Date.now();
      this.persist();
    }
  }

  /** Delete a conversation and remove its reference from its project. */
  deleteConversation(id: string): void {
    const c = this.conversations.get(id);
    if (!c) return;
    if (c.projectId) {
      const p = this.projects.get(c.projectId);
      if (p) {
        p.conversations = p.conversations.filter((x) => x !== id);
        p.updatedAt = Date.now();
      }
    }
    this.conversations.delete(id);
    this.persist();
  }

  conversationsFor(projectId?: string): Conversation[] {
    const all = [...this.conversations.values()];
    return (projectId ? all.filter((c) => c.projectId === projectId) : all).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
}
