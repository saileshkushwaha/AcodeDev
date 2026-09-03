import type { ChatMessage, ProviderId } from '../types';

export interface Conversation {
  id: string;
  title: string;
  projectId?: string;
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
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

/**
 * All-in-one project workspace: ties together conversations, prompts,
 * workflows, agents and evals under a project, plus a GitHub link.
 */
export class ProjectStore {
  private projects = new Map<string, ProjectDoc>();
  private conversations = new Map<string, Conversation>();

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
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.conversations.set(id, conv);
    if (input.projectId) {
      const p = this.projects.get(input.projectId);
      if (p) {
        p.conversations.push(id);
        p.updatedAt = Date.now();
      }
    }
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
    }
  }

  conversationsFor(projectId?: string): Conversation[] {
    const all = [...this.conversations.values()];
    return (projectId ? all.filter((c) => c.projectId === projectId) : all).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
}
