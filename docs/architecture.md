# Architecture

## Packages

| Package       | Responsibility                                                                      |
| ------------- | ----------------------------------------------------------------------------------- |
| `@acode/core` | Framework-agnostic engine: LLM providers, ChatEngine, agents, workflows, evals,     |
|               | prompts, projects, keys/vault, GitHub client, shared persistence layer.             |
| `@acode/ui`   | Enterprise design system (React components + tokens) used by the web app.            |
| `@acode/web`  | React + Vite single-page app; owns screens, navigation, UI state, and singletons.    |

`components/` in the web package should never import app state; state flows through
`AppProvider`, which owns the long-lived singletons (vault, chat engine, stores).

## Singleton wiring (web)

`AppProvider` creates each engine/store exactly once via a ref, so in-memory state
(e.g. the RAG index, agent map, workflow registry) survives re-renders:

- `KeyVault` (decrypted keys) → supplies `ChatEngine` + `hasKey()` checks
- `ChatEngine` → `WorkflowEngine`, `AgentEngine`, `EvalEngine`
- `WorkflowRegistry`, `PromptRegistry`, `AgentRegistry`, `ProjectStore`, `RAGMemory` → standalone stores

`KeyVault.ready()` resolves once persisted keys have been decrypted into memory;
`AppProvider` re-renders (`vaultTick`) when that completes so key-dependent UI never
reads stale state.

## Persistence layer

Everything reads/writes through `@acode/core/src/storage.ts` helpers
(`readRaw`/`writeRaw`/`readJSON`/`writeJSON`) instead of touching `localStorage`
directly. This gives:

- tolerance to missing/corrupted data (never throws),
- a single supplied error handler that *surfaces* read/write failures (quota,
  private mode) instead of swallowing them,
- a pluggable backend (`setStorageBackend`) — the future mobile app injects
  AsyncStorage/secure store behind the same API.

Per-app keys: `acode.workflows.v1`, `acode.workflows.active`,
`acode.workflows.lastRun.v1`, `acode.vault.v1`, `acode.ui.tab`, `acode.currentProject`,
`sessions:*` (semantic memory), etc.

## Secrets

API keys and connector secrets live in `KeyVault`, encrypted at rest with
**AES-GCM-256** (WebCrypto). See [security.md](./security.md) for the threat model
and key-management details.

## Workflow engine

`WorkflowEngine.run()` executes a node/edge DAG:

- entry is the `input` node (or node 0); the graph is traversed depth-first,
  visiting upstream dependencies before the node itself, then forwarding to
  successors so the whole chain executes,
- every node records its own `{ output, durationMs, status }`; a throwing step is
  attributed to that node instead of aborting the run,
- LLM steps also capture token usage and an estimated dollar cost per step,
- `final` is the terminal `output` node's output.

The Workflows screen models a strict top→bottom chain (reorder/duplicate/delete
rewire the edges), while the engine itself accepts arbitrary DAGs.

## Deployment / CI

- GitHub Actions (`.github/workflows/deploy.yml`) gates on `typecheck` + unit
  tests before a production web build is deployed to GitHub Pages (`/AcodeDev/`).
- Root `npm run ci` runs the same gates locally.
- The relay proxy (`proxy.mjs`) is optional and only used for CORS-blocked
  gateways; it forwards to an allowlist of upstream hosts. It is **not** deployed —
  run it locally.