import React, { createContext, useContext, useRef, useState, useCallback, useEffect, useMemo } from 'react';
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
  setStorageErrorHandler,
  readGithubToken,
  writeGithubToken,
  readRaw,
  writeRaw,
  removeKey,
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
  vaultTick: number;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [githubToken, setGithubTokenState] = useState<string>(() => readGithubToken());
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(() => readRaw('acode.currentProject'));
  const [catalogVersion, setCatalogVersion] = useState(0);

  // Surface storage failures (e.g. quota exceeded) so silent data loss can't
  // happen without the user at least seeing a console warning.
  useEffect(() => {
    setStorageErrorHandler((key, error) => {
      console.warn(`[storage] failed to write "${key}":`, error);
    });
    return () => setStorageErrorHandler(null);
  }, []);

  const vaultRef = useRef<KeyVault | null>(null);
  if (!vaultRef.current) vaultRef.current = new KeyVault(webCryptoAdapter());

  // Re-render once the vault has decrypted/persisted keys into memory, so
  // key-dependent UI (Keys screen, `hasKey` checks) never reads stale state.
  const [vaultTick, setVaultTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void vaultRef.current
      ?.ready()
      .then(() => {
        if (alive) setVaultTick((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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

  const state: AppState = useMemo(() => ({
    vault: vaultRef.current!,
    vaultTick,
    chat: engineRef.current!,
    agents: agentsRef.current!,
    agentStore: agentStoreRef.current!,
    workflows: workflowsRef.current!,
    workflowStore: workflowStoreRef.current!,
    evals: evalsRef.current!,
    prompts: promptsRef.current!,
    projects,
    rag: ragRef.current!,
    githubToken,
    setGithubToken: useCallback((t: string) => {
      setGithubTokenState(t);
      writeGithubToken(t);
    }, []),
    github: () => new GitHubClient({ token: githubToken }),
    currentProjectId,
    setCurrentProjectId: useCallback((id: string | null) => {
      setCurrentProjectIdState(id);
      if (id) writeRaw('acode.currentProject', id);
      else removeKey('acode.currentProject');
    }, []),
    hasKey: (p: ProviderId) => vaultRef.current?.hasKey(p) ?? false,
    catalogVersion,
    refreshCatalog,
    syncCatalog,
  }), [vaultTick, projects, githubToken, currentProjectId, catalogVersion, refreshCatalog, syncCatalog]);

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export type { ChatMessage, ProviderId };
