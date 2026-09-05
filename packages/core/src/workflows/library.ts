/**
 * Curated workflow library — production-grade, runnable workflows for an
 * all-in-one AI studio & project management platform (AcodeDev).
 *
 * Every preset is a real WorkflowDefinition that the WorkflowEngine can
 * execute as-is. Built-in presets are seeded into the WorkflowRegistry on
 * first load and are safe to reset (custom edits are never overwritten).
 */

import type { ProviderId } from '../types';
import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from './WorkflowEngine';

export type WorkflowCategory =
  | 'development'
  | 'quality'
  | 'writing'
  | 'planning'
  | 'data-ai'
  | 'ops'
  | 'custom';

export interface WorkflowCategoryMeta {
  id: WorkflowCategory;
  label: string;
  description: string;
  icon: string;
}

export const WORKFLOW_CATEGORIES: WorkflowCategoryMeta[] = [
  { id: 'development', label: 'Development', description: 'Code, API and schema generation pipelines.', icon: '👨‍💻' },
  { id: 'quality', label: 'Quality & Review', description: 'Code review, critique and reflection loops.', icon: '🛡️' },
  { id: 'writing', label: 'Writing & Docs', description: 'Release notes, commits and documentation.', icon: '📝' },
  { id: 'planning', label: 'Planning & Specs', description: 'PRDs, plans and architecture briefs.', icon: '🎯' },
  { id: 'data-ai', label: 'Data & AI', description: 'RAG, summarization, transforms and evals.', icon: '📊' },
  { id: 'ops', label: 'DevOps & Ops', description: 'Postmortems, runbooks and reliability.', icon: '🚀' },
  { id: 'custom', label: 'Custom', description: 'Blank canvas workflows', icon: '✏️' },
];

/** Default key-free provider/model used across presets. */
const FREE_MODEL = 'nvidia/nemotron-3.5-lightning:free';

function llmConfig(systemPrompt: string, temperature = 0.3, extra: Record<string, unknown> = {}) {
  return { provider: 'openrouter' as ProviderId, model: FREE_MODEL, systemPrompt, temperature, ...extra };
}

function build(spec: {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  tags: string[];
  graph: () => { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
}): WorkflowDefinition {
  const { nodes, edges } = spec.graph();
  const llm = nodes.find((n) => n.type === 'llm');
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    category: spec.category,
    tags: spec.tags,
    builtin: true,
    nodes,
    edges,
    variables: {},
    provider: llm?.config.provider as ProviderId | undefined,
    model: llm?.config.model as string | undefined,
    updatedAt: 0,
  };
}

/** Fresh per-build node/edge id counters so ids are stable and unique per preset. */
function graph() {
  let seq = 0;
  const node = (type: WorkflowNode['type'], name: string, config: Record<string, unknown>): WorkflowNode => {
    seq += 1;
    return { id: `n${seq}`, type, name, config, position: { x: seq - 1, y: 0 } };
  };
  const wire = (ids: string[]): WorkflowEdge[] =>
    ids.slice(0, -1).map((source, i) => ({
      id: `e${i + 1}`,
      source,
      target: ids[i + 1],
      sourceHandle: 'out',
      targetHandle: 'in',
    }));
  return { node, wire };
}

export const WORKFLOW_LIBRARY: WorkflowDefinition[] = [
  build({
    id: 'wf_blank',
    name: 'Blank Canvas',
    description: 'Start from scratch: an input node feeding straight to an output. Drop LLM / transform / condition nodes onto it as you like.',
    category: 'custom',
    tags: ['starter', 'empty'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const output = node('output', 'Output', {});
      return { nodes: [input, output], edges: wire([input.id, output.id]) };
    },
  }),
  build({
    id: 'wf_code_review',
    name: 'Rigorous Code Reviewer',
    description: 'A meticulous reviewer persona — input a diff or file plus context and get ranked findings (critical / moderate / nits) with fixes.',
    category: 'quality',
    tags: ['code-review', 'security', 'quality'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Context: {{input}}\n\nPlease review.' });
      const review = node('llm', 'Review', llmConfig(
        'You are an exacting senior code reviewer at a company that ships to production daily. Focus on correctness bugs, race conditions, security issues, performance cliffs and maintainability problems. Never pad with praise: state findings precisely, reference the specific code, explain impact, and give a concrete fix. Provide the review as Markdown.',
        0.2,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, review, output], edges: wire([input.id, review.id, output.id]) };
    },
  }),
  build({
    id: 'wf_code_review_chain',
    name: 'Code Review → Fix → Re-review',
    description: 'Two-pass review chain: a strict reviewer finds issues, then a second LLM turn proposes concrete patches addressing each finding.',
    category: 'quality',
    tags: ['code-review', 'refactor', 'chain'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const review = node('llm', 'Strict reviewer', llmConfig(
        'You are a pedantic senior code reviewer. List concrete findings: exact location, why it matters, severity. No praise, no filler.',
        0.2,
      ));
      const fix = node('llm', 'Fixer', llmConfig(
        'You are a pragmatic senior engineer. Take the review below and rewrite the proposed fixes as concrete, ready-to-apply patches. Output only the patched code and a one-line explanation per fix.\n\nReview:\n{{upstream}}',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, review, fix, output], edges: wire([input.id, review.id, fix.id, output.id]) };
    },
  }),
  build({
    id: 'wf_release_notes',
    name: 'Release Notes Generator',
    description: 'Turn a list of commits/PRs into polished, categorized release notes (New / Improved / Fixed / Breaking) for users.',
    category: 'writing',
    tags: ['release', 'changelog', 'docs'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Changes:\n{{input}}' });
      const writer = node('llm', 'Writer', llmConfig(
        'You are a senior product technical writer. Turn the changes below into release notes: a short headline summary, then categorized sections (New / Improved / Fixed / Breaking) in user-facing language, plus a "how to upgrade" callout for breaking changes.',
        0.4,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, writer, output], edges: wire([input.id, writer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_commit_messages',
    name: 'Conventional Commit Messages',
    description: 'Convert a diff/change summary into atomic conventional commits (type(scope): subject + body).',
    category: 'writing',
    tags: ['git', 'commit', 'workflow'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const commit = node('llm', 'Committer', llmConfig(
        'Generate conventional commit messages for the change below. Follow Conventional Commits (type(scope): subject + body with motivation). If the change covers multiple concerns, split into multiple logical commits. Keep subjects under 72 chars. Output only the commit message(s) in a fenced block.',
        0.2,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, commit, output], edges: wire([input.id, commit.id, output.id]) };
    },
  }),
  build({
    id: 'wf_prd_builder',
    name: 'PRD Builder',
    description: 'Turns a loose idea into a structured product requirements document: problem, goals, user stories, metrics, risks and MVP scope.',
    category: 'planning',
    tags: ['prd', 'product', 'planning'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const brief = node('prompt_template', 'Structure', {
        template: 'Write a product requirements document from the brief below.\n\nIdea / problem:\n{{input}}\n\nInclude: problem statement and user value, goals and non-goals (explicitly), user stories and acceptance criteria, success metrics, dependencies and risks, and an MVP scope vs. later phases.',
      });
      const writer = node('llm', 'Writer', llmConfig(
        'You are a senior product manager. Write a clear, decision-ready PRD. Use headings and bullet lists. Be explicit about non-goals and success metrics.',
        0.4,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, writer, output], edges: wire([input.id, brief.id, writer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_rag_design',
    name: 'RAG System Design',
    description: 'Designs a production RAG pipeline — chunking, embeddings, retrieval, reranking and an eval plan — for your corpus.',
    category: 'data-ai',
    tags: ['rag', 'embeddings', 'architecture'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const brief = node('prompt_template', 'Brief', {
        template: 'Design a production RAG pipeline for the use case below.\n\nCorpus / knowledge base:\n{{input}}\n\nDeliver: chunking strategy, embedding model and dimensions, vector store choice, retrieval approach (hybrid, reranking, metadata filters), context assembly and prompt strategy, and an evaluation plan with golden queries.',
      });
      const designer = node('llm', 'Designer', llmConfig(
        'You are a senior ML engineer specialized in retrieval and RAG. Be concrete and prescriptive — name specific models, hyperparameters and libraries where relevant.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, designer, output], edges: wire([input.id, brief.id, designer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_incident_postmortem',
    name: 'Incident Postmortem',
    description: 'Turns an incident summary into a blameless, timeline-driven postmortem that drives systemic fixes.',
    category: 'ops',
    tags: ['incident', 'postmortem', 'reliability'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Summary / timeline:\n{{input}}' });
      const brief = node('prompt_template', 'Structure', {
        template: 'Produce a blameless postmortem for the incident below.\n\nIncident summary / timeline:\n{{input}}\n\nInclude: a clear timeline, root cause and contributing factors, impact quantification, corrective actions grouped by prevent / detect / respond (each with an owner and due date), and what we should NOT do.',
      });
      const writer = node('llm', 'Writer', llmConfig(
        'You are a reliability lead writing blameless postmortems. Be factual, own the timeline, and end with concrete, owner-assigned actions.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, writer, output], edges: wire([input.id, brief.id, writer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_chain_of_thought',
    name: 'Plan → Execute → Verify',
    description: 'A three-stage reasoning chain: an explicit plan, step-by-step execution, then a verification pass against the objective.',
    category: 'planning',
    tags: ['chain-of-thought', 'reasoning', 'multi-step'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const planner = node('llm', 'Planner', llmConfig(
        'You are a careful planner. For the task below, restate the objective, list the concrete steps you will take, and flag what information is missing. End with a line starting with "PLAN:".',
        0.3,
      ));
      const executor = node('llm', 'Executor', llmConfig(
        'Execute the plan from the previous step. Work through each step, showing your reasoning. Do not skip steps. Task: {{input}}\n\nPlan:\n{{upstream}}',
        0.3,
      ));
      const verifier = node('llm', 'Verifier', llmConfig(
        'You are a skeptical verifier. Check the executed result against the original task and constraints. State explicitly what you checked and whether the result is complete and correct. Output the final answer followed by a short verification note.\n\nOriginal task:\n{{input}}\n\nResult to verify:\n{{upstream}}',
        0.2,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, planner, executor, verifier, output], edges: wire([input.id, planner.id, executor.id, verifier.id, output.id]) };
    },
  }),
  build({
    id: 'wf_reflection_loop',
    name: 'Draft → Critique → Final',
    description: 'A reflection loop: produce a draft answer, critique it against explicit criteria, then deliver an improved final answer.',
    category: 'quality',
    tags: ['reflection', 'self-review', 'writing'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const draft = node('llm', 'Draft', llmConfig('Produce your best draft answer to the following question. Do not critique yourself yet.\n\n{{input}}', 0.5));
      const critique = node('llm', 'Critique', llmConfig(
        'Critique the draft answer below for facts, completeness, edge cases, clarity and structure. List the specific weaknesses, ranked by impact.\n\nDraft:\n{{upstream}}',
        0.3,
      ));
      const finalPass = node('llm', 'Final answer', llmConfig(
        'Rewrite the draft addressing every weakness in the critique. Then run a final consistency check. Output both the critique summary and the improved final answer.\n\nDraft:\n{{upstream}}\n\nCritique:\n(see previous model output)',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, draft, critique, finalPass, output], edges: wire([input.id, draft.id, critique.id, finalPass.id, output.id]) };
    },
  }),
  build({
    id: 'wf_summarize_clean',
    name: 'Summarize + Clean Output',
    description: 'Condenses a long input with the LLM, then a transform node normalizes the output (uppercase, truncate or pretty-print JSON).',
    category: 'data-ai',
    tags: ['summarize', 'transform', 'data'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: '{{input}}' });
      const summary = node('llm', 'Summarizer', llmConfig('You are a concise senior analyst. Summarize the input below into the most important facts, decisions and open questions. Use short bullets.\n\n{{input}}', 0.3));
      const clean = node('transform', 'Clean', { operation: 'uppercase' });
      const output = node('output', 'Output', {});
      return { nodes: [input, summary, clean, output], edges: wire([input.id, summary.id, clean.id, output.id]) };
    },
  }),
  build({
    id: 'wf_ai_platform_advisor',
    name: 'AcodeDev Platform Advisor',
    description: 'A domain expert that answers "how do I do X in this project" questions by walking through the AcodeDev packages, engines and screens.',
    category: 'development',
    tags: ['acodedev', 'onboarding', 'docs'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Question about the AcodeDev codebase:\n{{input}}' });
      const advisor = node('llm', 'Advisor', llmConfig(
        'You are a senior engineer who knows the AcodeDev monorepo inside out: packages/core (LLM providers, agents, workflows, evals, GitHub client), packages/ui (design system), packages/web (React + Vite screens) and packages/mobile (Expo). Answer the question concretely: point to the relevant package, file, engine class or screen, and give a short code-level suggestion. Reference actual module names where possible.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, advisor, output], edges: wire([input.id, advisor.id, output.id]) };
    },
  }),
  build({
    id: 'wf_pr_summary',
    name: 'Pull Request Writer',
    description: 'Turns a diff/feature summary into a ready-to-paste PR: title, motivation, test plan and a self-review checklist.',
    category: 'planning',
    tags: ['github', 'pull-request', 'writing'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Changes / diff:\n{{input}}' });
      const writer = node('llm', 'PR writer', llmConfig(
        'You are a senior engineer about to open a pull request. From the change description below, produce a Markdown PR body: a concise title (conventional), a "What & why" section, a bullet list of key changes, a "Test plan" section with concrete steps, and a self-review checklist (edge cases, performance, security, docs). Keep the title under 72 chars.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, writer, output], edges: wire([input.id, writer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_eval_designer',
    name: 'Eval Suite Designer',
    description: 'Designs golden evaluation cases for a feature — inputs, expected outputs and the scoring type — ready to run in the Evals engine.',
    category: 'data-ai',
    tags: ['evals', 'testing', 'quality'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Feature to evaluate:\n{{input}}' });
      const brief = node('prompt_template', 'Brief', {
        template: 'Design a golden eval suite for the feature below.\n\nFeature / behavior:\n{{input}}\n\nDeliver a set of eval cases, each with: a test input, the expected output, the scoring type to use (contains, exact, regex, or llm_judge with judge criteria), and why the case matters. Cover happy path, boundaries, empty/malformed inputs, and failure modes. Format as a Markdown table.',
      });
      const designer = node('llm', 'Evaluator', llmConfig(
        'You are an ML evaluation engineer. Produce a practical golden dataset: 8-12 varied cases, concrete inputs (not placeholders), explicit expectations, and a recommended scoring strategy per case.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, designer, output], edges: wire([input.id, brief.id, designer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_ci_pipeline',
    name: 'CI/CD Pipeline Designer',
    description: 'Designs a production CI/CD pipeline for your repo: stages, quality gates, caching, secrets and promotion.',
    category: 'ops',
    tags: ['cicd', 'github-actions', 'devops'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Repo / stack:\n{{input}}' });
      const brief = node('prompt_template', 'Brief', {
        template: 'Design a production CI/CD pipeline for this repo.\n\nRepo / stack:\n{{input}}\n\nDeliver: pipeline stages (lint → test → build → scan → deploy), caching strategy, quality gates that block a merge, secret handling, environment promotion (dev/stage/prod), rollback strategy, and observability of the pipeline itself. Reference GitHub Actions workflow concepts concretely.',
      });
      const designer = node('llm', 'Designer', llmConfig(
        'You are a DevOps engineer who ships pipelines for high-velocity teams. Be prescriptive: name real actions, triggers and caches. Call out the gate that matters most for this stack.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, designer, output], edges: wire([input.id, brief.id, designer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_model_advisor',
    name: 'Model & Cost Advisor',
    description: 'Recommends a provider + model for your task based on the platform catalog: free tiers, context window, cost, reasoning and vision needs.',
    category: 'data-ai',
    tags: ['models', 'providers', 'cost', 'llm'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Task, language and constraints:\n{{input}}' });
      const advisor = node('llm', 'Advisor', llmConfig(
        'You are a pragmatic ML platform engineer who knows this app\'s model catalog: OpenRouter (300+ models, many free), direct providers (OpenAI, Google, Anthropic, Mistral, Groq, DeepSeek, Together) and local models. From the task below, recommend 1-3 concrete provider+model options. For each: why it fits (context window, speed, reasoning, cost), the free/paid status, and a fallback for when the primary is rate-limited.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, advisor, output], edges: wire([input.id, advisor.id, output.id]) };
    },
  }),
  build({
    id: 'wf_agent_scaffold',
    name: 'AI Agent Scaffold',
    description: 'Drafts an agent spec for the Agent Builder: identity, system prompt, tools, memory, RAG corpus and guardrails.',
    category: 'development',
    tags: ['agents', 'tools', 'rag', 'scaffold'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'What should the agent do?\n{{input}}' });
      const brief = node('prompt_template', 'Brief', {
        template: 'Draft a complete agent spec for the goal below.\n\nGoal / responsibilities:\n{{input}}\n\nInclude: a short name and one-line identity, the system prompt (role + boundaries), which tools it should have and when to use them (from: search files, read URL, run shell, math, web search), memory strategy (conversation + RAG over which corpus), and safety guardrails. End with a minimal first-version scope.',
      });
      const designer = node('llm', 'Designer', llmConfig(
        'You design reliable, tool-using agents. Keep the system prompt crisp and the guardrails explicit: least-destructive first, confirm side effects, never fabricate tool results. Reference the Toolbox tool names that exist in this platform.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, designer, output], edges: wire([input.id, brief.id, designer.id, output.id]) };
    },
  }),
  build({
    id: 'wf_api_contract',
    name: 'API Contract Designer',
    description: 'Designs a production REST contract — methods, schemas, auth, pagination, errors and versioning — for your feature.',
    category: 'development',
    tags: ['api', 'rest', 'contract', 'design'],
    graph: () => {
      const { node, wire } = graph();
      const input = node('input', 'Input', { value: 'Domain / resources / constraints:\n{{input}}' });
      const brief = node('prompt_template', 'Brief', {
        template: 'Design a production API contract for the following.\n\nDomain / resources:\n{{input}}\n\nFor each endpoint give: method + path, request response schemas, authentication, idempotency, pagination and rate-limiting, and the error format. Call out versioning strategy and backward-compatibility.',
      });
      const designer = node('llm', 'Designer', llmConfig(
        'You are an API design lead. Prefer resource-oriented REST, consistent naming, and explicit error codes. Flag every endpoint that mutates state and how failures are handled.',
        0.3,
      ));
      const output = node('output', 'Output', {});
      return { nodes: [input, brief, designer, output], edges: wire([input.id, brief.id, designer.id, output.id]) };
    },
  }),
];

export function getWorkflowLibrary(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_LIBRARY.find((w) => w.id === id);
}