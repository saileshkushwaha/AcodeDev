import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';
import {
  KeyVault,
  webCryptoAdapter,
  ChatEngine,
  AgentEngine,
  AgentRegistry,
  Toolbox,
  RAGMemory,
  WorkflowEngine,
  WorkflowRegistry,
  EvalEngine,
  PromptRegistry,
  ProjectStore,
  GitHubClient,
  loadCatalog,
  persistCatalog,
  onCatalogChange,
  syncAllGateways,
  type ChatMessage,
  type ProviderId,
} from '@acode/core';

export interface AppState {
  vault: KeyVault;
  chat: ChatEngine;
  agents: AgentEngine;
  agentStore: AgentRegistry;
  workflows: WorkflowEngine;
  workflowStore: WorkflowRegistry;
  evals: EvalEngine;
  prompts: PromptRegistry;
  projects: ProjectStore;
  rag: RAGMemory;
  githubToken: string;
  setGithubToken: (t: string) => void;
  github: () => GitHubClient;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  hasKey: (p: ProviderId) => boolean;
  catalogVersion: number;
  refreshCatalog: () => void;
  syncCatalog: () => Promise<number>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [githubToken, setGithubTokenState] = useState<string>(() => {
    try {
      return localStorage.getItem('acode.github.token') ?? '';
    } catch {
      return '';
    }
  });
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('acode.currentProject');
    } catch {
      return null;
    }
  });
  const [catalogVersion, setCatalogVersion] = useState(0);

  const vaultRef = useRef<KeyVault | null>(null);
  if (!vaultRef.current) vaultRef.current = new KeyVault(webCryptoAdapter());

  const engineRef = useRef<ChatEngine | null>(null);
  if (!engineRef.current) engineRef.current = new ChatEngine({ vault: vaultRef.current });

  // Load persisted provider/model catalog, then refresh from OpenRouter in the
  // background and persist the enriched catalog for offline use.
  useEffect(() => {
    loadCatalog();
    setCatalogVersion((v) => v + 1);
    const off = onCatalogChange(() => setCatalogVersion((v) => v + 1));
    void syncAllGateways()
      .then(() => {
        persistCatalog();
        setCatalogVersion((v) => v + 1);
      })
      .catch(() => {});
    return off;
  }, []);

  const refreshCatalog = useCallback(() => setCatalogVersion((v) => v + 1), []);
  const syncCatalog = useCallback(async () => {
    const added = await syncAllGateways();
    persistCatalog();
    setCatalogVersion((v) => v + 1);
    return added;
  }, []);

  const projectsRef = useRef<ProjectStore | null>(null);
  if (!projectsRef.current) projectsRef.current = new ProjectStore();
  const projects = projectsRef.current;

  // Keep engine/store singletons across renders so their in-memory state
  // (e.g. the RAG index) is never wiped by a re-render.
  const agentsRef = useRef<AgentEngine | null>(null);
  if (!agentsRef.current) agentsRef.current = new AgentEngine(engineRef.current, { name: 'a', systemPrompt: '', tools: Toolbox.all() });

  const agentStoreRef = useRef<AgentRegistry | null>(null);
  if (!agentStoreRef.current) agentStoreRef.current = new AgentRegistry();

  const workflowsRef = useRef<WorkflowEngine | null>(null);
  if (!workflowsRef.current) workflowsRef.current = new WorkflowEngine(engineRef.current);

  const workflowStoreRef = useRef<WorkflowRegistry | null>(null);
  if (!workflowStoreRef.current) workflowStoreRef.current = new WorkflowRegistry();

  const evalsRef = useRef<EvalEngine | null>(null);
  if (!evalsRef.current) evalsRef.current = new EvalEngine(engineRef.current);

  const promptsRef = useRef<PromptRegistry | null>(null);
  if (!promptsRef.current) promptsRef.current = new PromptRegistry();

  const ragRef = useRef<RAGMemory | null>(null);
  if (!ragRef.current) ragRef.current = new RAGMemory();

  const state: AppState = {
    vault: vaultRef.current,
    chat: engineRef.current,
    agents: agentsRef.current,
    agentStore: agentStoreRef.current,
    workflows: workflowsRef.current,
    workflowStore: workflowStoreRef.current,
    evals: evalsRef.current,
    prompts: promptsRef.current,
    projects,
    rag: ragRef.current,
    githubToken,
    setGithubToken: useCallback((t: string) => {
      setGithubTokenState(t);
      try {
        localStorage.setItem('acode.github.token', t);
      } catch {
        /* ignore */
      }
    }, []),
    github: () => new GitHubClient({ token: githubToken }),
    currentProjectId,
    setCurrentProjectId: useCallback((id: string | null) => {
      setCurrentProjectIdState(id);
      try {
        if (id) localStorage.setItem('acode.currentProject', id);
        else localStorage.removeItem('acode.currentProject');
      } catch {
        /* ignore */
      }
    }, []),
    hasKey: (p) => vaultRef.current?.hasKey(p) ?? false,
    catalogVersion,
    refreshCatalog,
    syncCatalog,
  };

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export type { ChatMessage, ProviderId };
