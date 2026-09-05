# Workflows / Pipelines

AcodeDev's Workflows screen (`packages/web/src/screens/Workflows.tsx`) is a visual
pipeline editor chaining LLM calls, string transforms, condition checks and prompt
templates. Definitions are deterministic DAGs executed by `WorkflowEngine`
(`packages/core/src/workflows/WorkflowEngine.ts`).

## How it works

A `WorkflowDefinition` contains:

- `nodes` — the pipeline steps
- `edges` — how output flows between nodes
- `variables` — extra templating values (rendered like `{{name}}`)
- `provider` / `model` — fallback provider/model for LLM nodes

### Node types

| Node               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `input`            | Entry node; renders `config.value` (use `{{input}}`)               |
| `llm`              | Chat call. Config: provider, model, systemPrompt, temperature      |
| `transform`        | String op: uppercase, lowercase, trim, truncate, json (pretty)     |
| `condition`        | Boolean eval of `config.expression` against `input` / `upstream`   |
| `prompt_template`  | Renders `config.template` with `{{input}}` / `{{upstream}}`        |
| `output`           | Terminal node; its output becomes `final`                          |

Templating supports `{{input}}`, `{{upstream}}`, and any key in `variables`.
Every downstream LLM can reference the previous stage's text via `{{upstream}}`
in its system prompt.

## Presets (`WORKFLOW_LIBRARY`)

Curated, runnable presets live in
`packages/core/src/workflows/library.ts`. They are seeded into the store on
first load and can be reset from the screen.

Development:

- `wf_ai_platform_advisor` — answer questions about the AcodeDev codebase
- `wf_agent_scaffold` — agent spec for the Agent Builder
- `wf_api_contract` — REST contract design

Planning & specs:

- `wf_prd_builder` — product requirements document
- `wf_chain_of_thought` — Plan → Execute → Verify
- `wf_pr_summary` — pull request body generator

Quality & review:

- `wf_code_review` — single-pass rigorous review
- `wf_code_review_chain` — Review → Fix → Re-review
- `wf_reflection_loop` — Draft → Critique → Final

Writing & docs:

- `wf_release_notes` — categorized release notes
- `wf_commit_messages` — conventional commits

Data & AI:

- `wf_rag_design` — production RAG pipeline design
- `wf_eval_designer` — golden eval suite for the Evals engine
- `wf_model_advisor` — provider/model recommendation
- `wf_summarize_clean` — summarize then normalize a transform node

DevOps & ops:

- `wf_ci_pipeline` — CI/CD pipeline design
- `wf_incident_postmortem` — blameless postmortem

Starter:

- `wf_blank` — empty input → output canvas

## Adding a preset

Append a `build({...})` entry to `WORKFLOW_LIBRARY`. It auto-seeds into every
user's picker on next reload (existing custom edits are untouched).

```ts
build({
  id: 'wf_my_new',
  name: 'My Workflow',
  description: 'One line about what it does.',
  category: 'development',
  tags: ['tag'],
  graph: () => {
    const { node, wire } = graph();
    const input = node('input', 'Input', { value: '{{input}}' });
    const llm = node('llm', 'Reasoner', llmConfig('You are a helpful assistant.', 0.3));
    const output = node('output', 'Output', {});
    return { nodes: [input, llm, output], edges: wire([input.id, llm.id, output.id]) };
  },
}),
```

Keep every preset structurally valid (the core test `presets are structurally
valid` enforces it): at least one `input` and one `output` node, unique node id,
and every non-entry node reachable via an edge.

## Storage & registry

`WorkflowRegistry` (`packages/core/src/workflows/WorkflowRegistry.ts`) persists
workflows to `localStorage` under `acode.workflows.v1`.

- Built-in presets are seeded on construction (`ensureSeeded()`) and marked
  `builtin`.
- `save(def)` upserts; saving a built-in from the screen creates a custom copy
  (fresh id, non-builtin) so presets are never overwritten.
- `remove(id)` refuses to delete built-ins; `resetBuiltin(id)` restores the
  curated definition.

API: `all()`, `get(id)`, `save(def)`, `remove(id)`, `resetBuiltin(id)`,
`library()`.

## Screen features

- **Picker** — choose a preset or a saved workflow; the last active workflow is
  remembered (`acode.workflows.active`).
- **Edit** — rename/describe the workflow, click a node to configure it, add
  LLM / Transform / Condition / Template nodes.
- **Node CRUD** — each node row has controls:
  - `▲▼` move the node up/down — the pipeline always runs top → bottom, so the
    node order *is* the execution order (edges are rewired automatically)
  - `⧉` duplicate a node (config copied; entry/exit nodes excluded)
  - `✕` delete a node (connected links are rewired)
- **Save / Reset / Delete** — save edits (custom copies for presets), reset a
  preset, or delete a custom workflow.
- **Run** — executes the DAG; per-node results and `final` output are shown.
  The engine records each step's output, duration and `ok`/`error` status, so a
  failed LLM call is attributed to the exact step that broke instead of failing
  the whole run.
- **Trace past runs** — each node row shows its status (`✓ 1234ms` or
  `✕ failed`) plus token usage and cost when known, and the pipeline header
  shows a success/error badge with how long ago the run happened. Selecting a
  node shows a **Last run** panel with that step's output, duration and status.
  Runs are persisted as a per-workflow history (newest first, capped at 30,
  key `acode.workflows.runs.v1`; legacy `acode.workflows.lastRun.v1` data
  migrates on first load), so after a failed run you can tweak a prompt,
  reload the workflow (or the page) and still inspect what any previous run
  produced step-by-step. A run picker in the **Run output** header switches
  between past runs.
- **Cost & token telemetry** — LLM steps record prompt/completion token usage
  (from the provider's `usage` when available, otherwise estimated) and an
  estimated USD cost from the model catalog per-1k pricing. The run header
  totals cost and tokens across all steps.
- **Result actions** — copy the final output, send it to Chat, or create a
  GitHub issue with the output as the body (requires a token in
  Connections → Keys).

## Engine

`WorkflowEngine.run(def, input)` resolves nodes in dependency order using DFS
over the edges, memoizes results, and returns
`{ results: WorkflowRunResult[], final: string }`. The engine is deterministic:
same definition + input produces the same shape of execution.