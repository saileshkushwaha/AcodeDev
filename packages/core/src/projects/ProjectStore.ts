
import { readJSON, writeJSON } from "../storage";
import type { ChatMessage, ProviderId } from "../types";
import { isOn } from "@acode/core";
export type FileChangeStatus = 'added' | 'modified' | 'deleted';

export interface ChangedFile {
  path: string;
  status: FileChangeStatus;
  changedAt: number;
}

export interface ConversationSettings {
  temperature?: number;
  maxTokens?: number;
  freeOnly?: boolean;
  minContext?: string;
  skills?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  changedFiles: ChangedFile[];
  /** Composer/model settings snapshot so history restores the exact session UX. */
  settings?: ConversationSettings;
  /** Hidden from the active session list (toggle via archive/unarchive). */
  archived?: boolean;
  /** Conversation belongs to a deleted project; viewable but not usable for new messages. */
  inactive?: boolean;
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
    const data = readJSON<PersistShape>(STORAGE_KEY);
    if (!data) return;
    if (Array.isArray(data.projects)) this.projects = new Map(data.projects.map((p) => [p.id, p] as const));
    if (Array.isArray(data.conversations)) this.conversations = new Map(data.conversations.map((c) => [c.id, c] as const));
  }

  private persist() {
    const data: PersistShape = {
      projects: [...this.projects.values()],
      conversations: [...this.conversations.values()],
    };
    writeJSON(STORAGE_KEY, data);
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

  /** Update editable fields on a project. Only the fields provided in `updates` are changed. */
  updateProject(id: string, updates: { name?: string; description?: string; color?: string; gitRepo?: string }): ProjectDoc | undefined {
    const p = this.projects.get(id);
    if (!p) return undefined;
    if (updates.name !== undefined) p.name = updates.name.trim() || p.name;
    if (updates.description !== undefined) p.description = updates.description;
    if (updates.color !== undefined) p.color = updates.color;
    if (updates.gitRepo !== undefined) p.gitRepo = updates.gitRepo;
    p.updatedAt = Date.now();
    this.persist();
    return p;
  }

  /**
   * Delete a project. Associated conversations are marked `inactive` (viewable
   * but not usable for new messages) and keep their `projectId` for traceability.
   * Returns the number of conversations that were deactivated.
   */
  deleteProject(id: string): number {
    const p = this.projects.get(id);
    if (!p) return 0;
    let deactivated = 0;
    for (const cid of p.conversations) {
      const c = this.conversations.get(cid);
      if (c && c.projectId === id) {
        if (isOn('projects.inactiveConversations')) {
          c.inactive = true;
        } else {
          c.projectId = undefined;
        }
        c.updatedAt = Date.now();
        deactivated++;
      }
    }
    this.projects.delete(id);
    this.persist();
    return deactivated;
  }

  createConversation(input: { title: string; projectId?: string; provider: ProviderId; model: string; settings?: ConversationSettings }): Conversation {
    const id = `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const conv: Conversation = {
      id,
      title: input.title,
      projectId: input.projectId,
      provider: input.provider,
      model: input.model,
      messages: [],
      changedFiles: [],
      settings: input.settings,
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

  /** Snapshot composer settings onto a conversation so reopening restores them. */
  updateSettings(convId: string, settings: ConversationSettings): void {
    const c = this.conversations.get(convId);
    if (c && settings) {
      c.settings = { ...c.settings, ...settings };
      this.persist();
    }
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

  /** Toggle the archived flag on a conversation (archived sessions are hidden). */
  setArchived(id: string, archived: boolean): void {
    const c = this.conversations.get(id);
    if (c) {
      c.archived = archived;
      c.updatedAt = Date.now();
      this.persist();
    }
  }

  /** Toggle the inactive flag on a conversation. Inactive conversations are viewable but not usable. */
  setInactive(id: string, inactive: boolean): void {
    const c = this.conversations.get(id);
    if (c) {
      c.inactive = inactive;
      c.updatedAt = Date.now();
      this.persist();
    }
  }

  conversationsFor(projectId?: string): Conversation[] {
    const all = [...this.conversations.values()].filter((c) => !c.archived && !c.inactive);
    return (projectId ? all.filter((c) => c.projectId === projectId) : all).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  /** Archived conversations for the restore view (most recently archived first). */
  archivedConversationsFor(projectId?: string): Conversation[] {
    const all = [...this.conversations.values()].filter((c) => c.archived);
    return (projectId ? all.filter((c) => c.projectId === projectId) : all).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }

  /** Inactive conversations (belonged to a deleted project). Viewable but not usable. */
  inactiveConversationsFor(projectId?: string): Conversation[] {
    const all = [...this.conversations.values()].filter((c) => c.inactive);
    return (projectId ? all.filter((c) => c.projectId === projectId) : all).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
}
