/**
 * Enterprise prompt library — a curated, production-grade catalog of prompts
 * organized by category for an all-in-one AI development & operations platform.
 *
 * Every prompt uses {{double_brace}} variables so it can be rendered with
 * user-provided values before being sent to an LLM (chat, agent, workflow or
 * eval). Built-in prompts are seeded into the PromptRegistry on first load and
 * are safe to reset.
 */

export type PromptCategory =
  | 'system'
  | 'development'
  | 'architecture'
  | 'security'
  | 'devops'
  | 'data'
  | 'quality'
  | 'product'
  | 'writing'
  | 'workflow'
  | 'communication';

export interface PromptCategoryMeta {
  id: PromptCategory;
  label: string;
  description: string;
  icon: string;
}

export const PROMPT_CATEGORIES: PromptCategoryMeta[] = [
  { id: 'system', label: 'System & Persona', description: 'Model identity, tone and expert roles.', icon: '⚙️' },
  { id: 'development', label: 'Core Development', description: 'Code authoring, refactoring, debugging and reviews.', icon: '👨‍💻' },
  { id: 'architecture', label: 'Architecture & Design', description: 'Systems, data models, APIs and trade-offs.', icon: '🏗️' },
  { id: 'security', label: 'Security', description: 'Audits, threat modeling and hardening.', icon: '🛡️' },
  { id: 'devops', label: 'DevOps & Reliability', description: 'CI/CD, IaC, observability and incident handling.', icon: '🚀' },
  { id: 'data', label: 'Data & AI', description: 'Data analysis, RAG, evals and ML engineering.', icon: '📊' },
  { id: 'quality', label: 'Quality & Testing', description: 'Test strategy, coverage and edge cases.', icon: '✅' },
  { id: 'product', label: 'Product & Business', description: 'PRDs, strategy, pricing and metrics.', icon: '🎯' },
  { id: 'writing', label: 'Writing & Docs', description: 'Documentation, changelogs and technical writing.', icon: '📝' },
  { id: 'workflow', label: 'Workflows & Agents', description: 'Orchestration, tool-use and autonomous loops.', icon: '🔁' },
  { id: 'communication', label: 'Communication', description: 'Email, status and stakeholder updates.', icon: '💬' },
];

export interface LibraryPrompt {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  tags: string[];
  /** Optional system prompt (identity/instructions) separate from the user content. */
  systemPrompt?: string;
  /** User-facing content with {{variables}}. */
  content: string;
}

export const PROMPT_LIBRARY: LibraryPrompt[] = [
  /* ----------------------------- SYSTEM & PERSONA ----------------------------- */
  {
    id: 'persona_architect',
    name: 'Expert Software Architect',
    description: 'A senior architect persona that produces rigorous system designs with explicit trade-offs.',
    category: 'system',
    tags: ['persona', 'architecture', 'design'],
    systemPrompt:
      'You are a principal software architect with 20 years of experience across distributed systems, cloud platforms and large-scale data. You reason from first principles, cite concrete industry patterns, and always surface trade-offs, risks and cost implications. You prefer precise technical language over fluff.',
    content:
      'Act as my software architect for the problem below.\n\nProblem / goal:\n{{problem}}\n\nConstraints (tech stack, team size, budget, deadlines, compliance):\n{{constraints}}\n\nProduce:\n1. A recommended architecture with components and their responsibilities\n2. Data flow and key interfaces\n3. The two or three hardest risks and how to mitigate them\n4. What you explicitly decided NOT to do and why\n\nKeep it concrete and actionable.',
  },
  {
    id: 'persona_code_reviewer',
    name: 'Rigorous Code Reviewer',
    description: 'A meticulous reviewer that finds real bugs, not style nits.',
    category: 'system',
    tags: ['persona', 'code-review', 'quality'],
    systemPrompt:
      'You are an exacting senior code reviewer at a company that ships to production daily. You focus on correctness bugs, race conditions, security issues, performance cliffs and maintainability problems. You never pad reviews with praise; you state findings precisely, reference the specific code, explain the impact, and give a concrete fix.',
    content:
      'Review the following code for a production change.\n\nContext: {{context}}\n\nCode:\n```\n{{code}}\n```\n\nReport:\n- Critical issues (correctness, security, data loss) — highest priority\n- Moderate issues (performance, error handling, maintainability)\n- Nitpicks worth one line\nFor each finding give: location, why it matters, and a suggested patch.',
  },
  {
    id: 'persona_security',
    name: 'Security Engineer',
    description: 'Adversarial-minded persona for hardening audits and threat modeling.',
    category: 'system',
    tags: ['persona', 'security', 'audit'],
    systemPrompt:
      'You are a senior application security engineer familiar with OWASP ASVS, the MITRE ATT&CK framework and common cloud misconfigurations. You think adversarially — assume the attacker is skilled and persistent. You rank findings by severity with realistic exploitability and give concrete remediation.',
    content:
      'Perform a security review with an attacker\'s mindset.\n\nScope (system, architecture, code, or config):\n{{scope}}\n\nDeliver:\n1. Threat model: assets, trust boundaries, likely attack paths\n2. Ranked vulnerabilities (Critical / High / Medium / Low) with exploit scenario\n3. Remediation steps for each\n4. Quick wins to apply first',
  },
  {
    id: 'persona_data_analyst',
    name: 'Data Analyst',
    description: 'Opinionated analyst persona for interpreting data and metrics.',
    category: 'system',
    tags: ['persona', 'data', 'metrics'],
    systemPrompt:
      'You are a senior data analyst. You are rigorous about statistical validity, suspicious of correlation, and always separate signal from noise. You prefer tables and concrete numbers over prose, and you call out data-quality problems before drawing conclusions.',
    content:
      'Analyze the following data and distill actionable insight.\n\nData:\n{{data}}\n\nQuestions to answer:\n{{questions}}\n\nDeliver: a top-line summary, key findings with supporting numbers, any anomalies or data-quality caveats, and concrete recommended next steps, in that order.',
  },
  {
    id: 'persona_writer',
    name: 'Technical Writer',
    description: 'Clear, user-focused writer persona for docs and manuals.',
    category: 'system',
    tags: ['persona', 'writing', 'docs'],
    systemPrompt:
      'You are a senior technical writer. You write at the appropriate level for the audience, active voice, short sentences, concrete examples, and no unnecessary jargon. You lead with "what and why" before "how".',
    content:
      'Write about the following topic for the given audience.\n\nTopic:\n{{topic}}\n\nAudience & level:\n{{audience}}\n\nFormat/constraints:\n{{constraints}}\n\nUse headings, bullets and a worked example where useful.',
  },

  /* ----------------------------- CORE DEVELOPMENT ----------------------------- */
  {
    id: 'dev_generate',
    name: 'Generate Production Code',
    description: 'Produces clean, tested, idiomatic code for a feature with edge-case handling.',
    category: 'development',
    tags: ['code', 'feature', 'implementation'],
    content:
      'Implement the following feature in production quality.\n\nLanguage / framework:\n{{language}}\n\nRequirements:\n{{requirements}}\n\nConstraints / conventions:\n{{constraints}}\n\nFor each non-trivial piece: provide the code, a short explanation of the approach, how errors and edge cases are handled, and any tests you would add.',
  },
  {
    id: 'dev_refactor',
    name: 'Refactor for Maintainability',
    description: 'Improves structure, naming and cohesion without changing behavior.',
    category: 'development',
    tags: ['refactor', 'maintainability', 'code'],
    content:
      'Refactor the following code to improve clarity and maintainability WITHOUT changing its observable behavior.\n\nCode:\n```\n{{code}}\n```\n\nFocus on: naming, function/component decomposition, removing duplication, consistent error handling, and reducing cognitive load. Show before → after for the meaningful changes and briefly justify each. Flag anything where a behavior change was necessary to improve safety.',
  },
  {
    id: 'dev_debug',
    name: 'Debug Root Cause',
    description: 'Systematic root-cause analysis with a minimal reproducible hypothesis.',
    category: 'development',
    tags: ['debug', 'troubleshooting', 'bug'],
    content:
      'Help me find the root cause of this bug.\n\nSymptom / error:\n{{symptom}}\n\nRelevant code:\n```\n{{code}}\n```\n\nEnvironment / recent changes:\n{{context}}\n\nWork in order: (1) restate the most likely root cause as one hypothesis, (2) list the quickest tests to confirm it, (3) give the fix, (4) list regressions to watch for afterward.',
  },
  {
    id: 'dev_unit_tests',
    name: 'Design Unit Tests',
    description: 'A focused test suite covering happy path, edge cases and failure modes.',
    category: 'development',
    tags: ['testing', 'unit-test', 'quality'],
    content:
      'Design a unit-test suite for the following code.\n\nCode:\n```\n{{code}}\n```\n\nTesting framework: {{framework}}\n\nCover: the happy path, boundary values, invalid inputs, error/failure paths, and any stateful or time-dependent behavior. For each test give a one-line intent, the setup, the assertion, and why it matters. Prefer behavior-focused tests over implementation details.',
  },
  {
    id: 'dev_api_design',
    name: 'Design REST / API Contract',
    description: 'Resource-oriented API design with status codes, errors and pagination.',
    category: 'development',
    tags: ['api', 'rest', 'contract'],
    content:
      'Design a production API contract for the following use case.\n\nDomain / resources:\n{{domain}}\n\nConsumers & constraints:\n{{constraints}}\n\nFor each endpoint give: method + path, request/response schema, authentication, idempotency, pagination and rate-limiting behavior, and the error format. Call out versioning strategy and backward-compatibility guarantees.',
  },
  {
    id: 'dev_db_design',
    name: 'Design Database Schema',
    description: 'Normalized-but-pragmatic schema with indexing and migration notes.',
    category: 'development',
    tags: ['database', 'sql', 'schema'],
    content:
      'Design a database schema for the following requirements.\n\nEntities & relationships:\n{{requirements}}\n\nDatabase: {{database}}\n\nDeliver: table definitions with types and constraints, the key relationships, which indexes you would add and the query patterns they serve, and a migration/backfill strategy for existing data. Call out any denormalization you chose and why.',
  },

  /* ----------------------------- ARCHITECTURE & DESIGN ----------------------------- */
  {
    id: 'arch_tradeoffs',
    name: 'Evaluate Architecture Trade-offs',
    description: 'Compare candidate solutions against explicit criteria with a decision matrix.',
    category: 'architecture',
    tags: ['architecture', 'decision', 'comparison'],
    content:
      'Compare the following candidate approaches and recommend one.\n\nProblem:\n{{problem}}\n\nCandidates:\n{{candidates}}\n\nCriteria (weight importance 1–5): {{criteria}}\n\nProduce: a decision matrix scoring each candidate per criterion, a short analysis of the top two, the recommended choice, and what would change your recommendation.',
  },
  {
    id: 'arch_microservices',
    name: 'Microservices / Service Boundaries',
    description: 'Bounded contexts, contracts and ownership for a service split.',
    category: 'architecture',
    tags: ['microservices', 'architecture', 'bounded-context'],
    content:
      'Help me decompose this into services with clear boundaries.\n\nCurrent system / monolith surface:\n{{surface}}\n\nGoals & drivers (scale, autonomy, compliance):\n{{goals}}\n\nDeliver: the proposed service decomposition with each service\'s responsibility and data ownership, the contracts/interfaces between them, how shared data and transactions are handled, and which pieces should stay together to avoid distributed-monolith pain.',
  },
  {
    id: 'arch_event_driven',
    name: 'Event-Driven Design',
    description: 'Events, topics, ordering, idempotency and replay for async systems.',
    category: 'architecture',
    tags: ['events', 'kafka', 'async', 'architecture'],
    content:
      'Design an event-driven pipeline for the following scenario.\n\nBusiness flow:\n{{scenario}}\n\nPlatform: {{platform}}\n\nDeliver: the event schema and topic/stream layout, producing and consuming services, ordering and partitioning strategy, exactly-once/idempotency handling, failure and DLQ/replay strategy, and how observability is maintained across the flow.',
  },
  {
    id: 'arch_migration',
    name: 'Migration & Cutover Plan',
    description: 'Low-risk migration Playbook: phases, rollback, validation.',
    category: 'architecture',
    tags: ['migration', 'cutover', 'planning'],
    content:
      'Create a low-risk migration plan.\n\nFrom:\n{{from}}\n\nTo:\n{{to}}\n\nConstraints / freeze windows:\n{{constraints}}\n\nDeliver: a phased plan with data-migration approach, dual-run/validation strategy, a detailed rollback plan for each phase, success criteria per milestone, and the communication plan for stakeholders.',
  },

  /* ----------------------------- SECURITY ----------------------------- */
  {
    id: 'sec_threat_model',
    name: 'Threat Model',
    description: 'Assets, trust boundaries, STRIDE and prioritized mitigations.',
    category: 'security',
    tags: ['threat-model', 'security', 'stride'],
    content:
      'Build a threat model for the following system.\n\nArchitecture / components:\n{{architecture}}\n\nData & assets:\n{{assets}}\n\nApply STRIDE and deliver: trust boundaries and data-flow diagram in text, the highest-value attack surfaces, prioritized threats with likelihood×impact, and concrete mitigations mapped to each. End with a "minimum to ship safely" checklist.',
  },
  {
    id: 'sec_dependency_audit',
    name: 'Dependency & Supply-Chain Audit',
    description: 'Audits dependencies for risk: CVEs, maintenance, license, provenance.',
    category: 'security',
    tags: ['dependencies', 'supply-chain', 'audit'],
    content:
      'Audit this dependency list (or description) for supply-chain risk.\n\nDependencies:\n{{dependencies}}\n\nType of project: {{project_type}}\n\nFor each dependency assess: known vulnerabilities, maintenance/abandonment status, license risk, and provenance. Rank by urgency. Recommend concrete actions: pinning, upgrades, replacements, or a policy (SCA, SBOM, signing) to enforce.',
  },
  {
    id: 'sec_authz',
    name: 'Authentication & Authorization Design',
    description: 'Session, token, RBAC/ABAC and least-privilege design.',
    category: 'security',
    tags: ['auth', 'authz', 'oauth', 'security'],
    content:
      'Design the auth for the following product.\n\nRequirements:\n{{requirements}}\n\nAuth provider / stack:\n{{stack}}\n\nDeliver: recommended authN (sessions vs tokens, OIDC/OAuth flows, MFA), authZ model (RBAC/ABAC and role definitions), least-privilege defaults, password/credential handling and storage, token lifecycle (refresh, revocation), and the audit-logging you need.',
  },
  {
    id: 'sec_incident',
    name: 'Incident Response Runbook',
    description: 'Detection, containment, eradication and postmortem prompts.',
    category: 'security',
    tags: ['incident', 'response', 'runbook'],
    content:
      'Write an incident-response runbook for the following scenario.\n\nScenario / signal:\n{{scenario}}\n\nSystems & owners:\n{{systems}}\n\nProduce: step-by-step detection & triage (severity rubric), immediate containment actions (with blast-radius reduction), eradication and recovery, evidence preservation and communication template, and a postmortem template that drives systemic fixes.',
  },

  /* ----------------------------- DEVOPS & RELIABILITY ----------------------------- */
  {
    id: 'devops_ci',
    name: 'Design CI/CD Pipeline',
    description: 'Stages, gates, caching, secrets and rollback for a build pipeline.',
    category: 'devops',
    tags: ['cicd', 'pipeline', 'github-actions'],
    content:
      'Design a production CI/CD pipeline for this repo.\n\nRepo / stack:\n{{stack}}\n\nTooling (e.g. GitHub Actions): {{tooling}}\n\nDeliver: pipeline stages (lint → test → build → scan → deploy), caching strategy, quality gates (what blocks a merge), secret handling, environment promotion (dev/stage/prod), rollback strategy, and observability of the pipeline itself.',
  },
  {
    id: 'devops_terraform',
    name: 'Design IaC (Terraform)',
    description: 'Module layout, state, environments and drift handling for IaC.',
    category: 'devops',
    tags: ['terraform', 'iac', 'infrastructure'],
    content:
      'Design an IaC layout for the following infrastructure.\n\nResources to manage:\n{{resources}}\n\nProvider / conventions:\n{{provider}}\n\nDeliver: module structure, remote state and locking strategy, environment (workspace/branch) strategy, how secrets are injected, drift and plan/apply promotion workflow, and the guardrails (policies/OPA) you would add.',
  },
  {
    id: 'devops_observability',
    name: 'Observability & SLO Design',
    description: 'Metrics, logs, traces, dashboards, alerts and error budgets.',
    category: 'devops',
    tags: ['observability', 'slo', 'monitoring', 'alerting'],
    content:
      'Design the observability stack for the following service.\n\nService / critical flows:\n{{service}}\n\nInstrumentation platform: {{platform}}\n\nDeliver: the key SLIs and SLO targets with error budgets, the highest-value dashboards, the alerting rules that avoid alert fatigue (with severity and runbooks), log/trace correlation, and how to continuously improve signal quality.',
  },
  {
    id: 'devops_postmortem',
    name: 'Incident Postmortem',
    description: 'Blameless, timeline-driven retrospective that drives systemic fixes.',
    category: 'devops',
    tags: ['postmortem', 'incident', 'reliability'],
    content:
      'Turn this incident into a blameless postmortem.\n\nIncident summary / timeline:\n{{summary}}\n\nImpact:\n{{impact}}\n\nProduce: a clear timeline of events, the root cause (and contributing factors), impact quantification, the corrective actions grouped by prevent / detect / respond (each with an owner and due date), and what we should NOT do.',
  },

  /* ----------------------------- DATA & AI ----------------------------- */
  {
    id: 'data_rag',
    name: 'RAG System Design',
    description: 'Chunking, embedding, retrieval, reranking and evaluation for RAG.',
    category: 'data',
    tags: ['rag', 'embeddings', 'retrieval'],
    content:
      'Design a production RAG pipeline for the following use case.\n\nCorpus / knowledge base:\n{{corpus}}\n\nQuery patterns:\n{{queries}}\n\nDeliver: chunking strategy, embedding model and dimensions, vector store choice, retrieval approach (hybrid, reranking, metadata filters), context assembly and prompt strategy, and an evaluation plan with golden queries to measure retrieval quality and answer quality.',
  },
  {
    id: 'data_prompt_optimization',
    name: 'Optimize a Prompt',
    description: 'Iteratively improves a prompt with structure, examples and fences.',
    category: 'data',
    tags: ['prompt', 'optimization', 'llm'],
    content:
      'Optimize this prompt for accuracy and robustness.\n\nCurrent prompt:\n{{prompt}}\n\nGoal / expected output:\n{{goal}}\n\nKnown failure modes:\n{{failures}}\n\nReturn an improved rewrite that: has a clear role and task, explicit input/output format, few-shot examples where helpful, instruction to handle ambiguity, and guardrails against the listed failures. Explain each change you made and why.',
  },
  {
    id: 'data_metrics_pull',
    name: 'Pull Metrics & Health',
    description: 'Turn a request into measurable outcomes and KPIs.',
    category: 'data',
    tags: ['metrics', 'kpi', 'analysis'],
    content:
      'Define the metrics that matter for the following initiative.\n\nInitiative / goal:\n{{goal}}\n\nAvailable data:\n{{data}}\n\nDeliver: a north-star metric, the input/leading and lagging KPIs, how each is calculated and where it is sourced, target values and time horizon, and the instrumentation or data changes needed to measure them reliably.',
  },

  /* ----------------------------- QUALITY & TESTING ----------------------------- */
  {
    id: 'quality_strategy',
    name: 'Test Strategy',
    description: 'Test pyramid, risk-based coverage and tooling for the team.',
    category: 'quality',
    tags: ['testing', 'strategy', 'quality'],
    content:
      'Design a pragmatic test strategy for this project.\n\nProject / critical surfaces:\n{{project}}\n\nCurrent pain points:\n{{pain_points}}\n\nDeliver: the test pyramid that fits (unit/component/integration/E2E split), what each layer catches and where it runs, coverage goals tied to risk (not vanity %), the tools to adopt, and how to make tests fast and reliable (data isolation, flake policy).',
  },
  {
    id: 'quality_edge_cases',
    name: 'Uncover Edge Cases',
    description: 'Brainstorms edge cases, boundaries and failure modes to test.',
    category: 'quality',
    tags: ['edge-cases', 'testing', 'qa'],
    content:
      'For the following feature, enumerate the edge cases and failure modes we must handle (or test) before shipping.\n\nFeature / behavior:\n{{feature}}\n\nInputs & invariants:\n{{inputs}}\n\nCover: boundary values, empty/null/malformed inputs, concurrency and re-entrancy, time/zone dependencies, overflow and large inputs, partial failures and retries, and security-relevant cases. Mark each as MUST-FIX or SHOULD-TEST.',
  },

  /* ----------------------------- PRODUCT & BUSINESS ----------------------------- */
  {
    id: 'product_prd',
    name: 'Write a PRD',
    description: 'Problem, audience, scope, success metrics, and non-goals.',
    category: 'product',
    tags: ['prd', 'product', 'requirements'],
    content:
      'Write a product requirements document for the following idea.\n\nIdea / problem:\n{{idea}}\n\nTarget users & jobs-to-be-done:\n{{audience}}\n\nInclude: problem statement and user value, goals and non-goals (explicitly), user stories and acceptance criteria, success metrics, dependencies and risks, and an MVP scope vs. later phases.',
  },
  {
    id: 'product_github_release',
    name: 'Release Notes & Changelog',
    description: 'Clear, structured release notes from a set of changes.',
    category: 'product',
    tags: ['release', 'changelog', 'writing'],
    content:
      'Turn the following changes into polished release notes.\n\nChanges (commits/PRs/features):\n{{changes}}\n\nAudience: {{audience}}\n\nProduce: a short headline summary, then categorized sections (New / Improved / Fixed / Breaking) using user-facing language, deprecation and migration notes if any, and a "how to upgrade" callout for breaking changes.',
  },
  {
    id: 'product_metrics_review',
    name: 'Metrics & KPI Review',
    description: 'Interprets dashboard/product metrics for decisions.',
    category: 'product',
    tags: ['metrics', 'product', 'analysis'],
    content:
      'Interpret these product metrics and recommend actions.\n\nMetrics (with trend/context):\n{{metrics}}\n\nBusiness goal:\n{{goal}}\n\nAssess: what the numbers really say (and their caveats/quality), which lever is most impactful to move next, what to investigate further, and a concrete experiment or ship decision with its success criteria.',
  },

  /* ----------------------------- WRITING & DOCS ----------------------------- */
  {
    id: 'write_readme',
    name: 'README Generator',
    description: 'Clear README: what, why, quickstart, config, contributing.',
    category: 'writing',
    tags: ['readme', 'docs', 'writing'],
    content:
      'Write a high-quality README for this project.\n\nProject:\n{{project}}\n\nKey features:\n{{features}}\n\nStarter usage / show commands:\n{{usage}}\n\nInclude: a one-paragraph value pitch, feature list, quickstart (install → first run), configuration table, common workflows, contribution guidelines, and a troubleshooting section. Match the tone to the audience: {{audience}}.',
  },
  {
    id: 'write_commit',
    name: 'Conventional Commit Messages',
    description: 'Turn a diff summary into conventional, atomic commit messages.',
    category: 'writing',
    tags: ['commit', 'git', 'writing'],
    content:
      'Generate conventional commit message(s) for the following change.\n\nChange summary / diff:\n{{diff}}\n\nStyle: {{style}}\n\nFollow Conventional Commits (type(scope): subject + body with motivation). If the change covers multiple concerns, split into multiple logical commits. Keep the subject under 72 chars and reference the ticket {{ticket}} where relevant.',
  },
  {
    id: 'write_api_doc',
    name: 'API Reference Docs',
    description: 'Endpoint-level docs with request/response, errors, examples.',
    category: 'writing',
    tags: ['api', 'docs', 'reference'],
    content:
      'Write API reference documentation for the following endpoint(s).\n\nEndpoint / schema:\n{{api}}\n\nFor each: a plain-language description of what it does, authentication requirement, request parameters (required/optional, types, defaults), an example request and response, the error codes you can expect and what they mean, and rate-limit/usage notes.',
  },

  /* ----------------------------- WORKFLOWS & AGENTS ----------------------------- */
  {
    id: 'wf_chain',
    name: 'Chain-of-Thought Workflow',
    description: 'Guides a model through plan → execute → verify in stages.',
    category: 'workflow',
    tags: ['chain-of-thought', 'workflow', 'planning'],
    content:
      'Approach the task below in explicit stages. Do not jump ahead.\n\nStage 1 — Plan: restate the objective, list the steps, and identify what information is missing.\nStage 2 — Execute: do each step, showing your reasoning.\nStage 3 — Verify: check the result against the objective and known constraints; state clearly what you checked.\nStage 4 — Deliver: the final answer and any caveats.\n\nTask:\n{{task}}',
  },
  {
    id: 'wf_agent_guardrails',
    name: 'Agent Guardrails',
    description: 'System prompt for a tool-using agent with safety constraints.',
    category: 'workflow',
    tags: ['agent', 'tools', 'guardrails'],
    systemPrompt:
      'You are an autonomous agent. You have access to tools: {{tools}}. Always: (1) decide before you act whether a tool is needed, (2) prefer the least-destructive action that meets the goal, (3) never perform irreversible or financially/materially consequential actions without explicit confirmation, (4) if a tool call fails, diagnose and retry at most twice, then report, (5) never fabricate tool results — if you did not get a result, say so. Reflect before each tool use: what do I expect, what could go wrong?',
    content: 'Complete this task using your tools. Describe your plan briefly, then act. Goal: {{goal}}',
  },
  {
    id: 'wf_reflection',
    name: 'Reflection Loop',
    description: 'Self-critique and improve an initial answer via a review pass.',
    category: 'workflow',
    tags: ['reflection', 'self-review', 'quality'],
    content:
      'Produce your best answer, then follow the reflection loop.\n\nDraft the answer to:\n{{question}}\n\nThen: (1) Critique your draft — facts, completeness, edge cases, clarity. (2) List the specific weaknesses. (3) Revise the draft addressing each weakness. (4) Do a final consistency check. Give both the critique and the improved final answer.',
  },

  /* ----------------------------- COMMUNICATION ----------------------------- */
  {
    id: 'comm_email',
    name: 'Professional Email',
    description: 'Appropriate-tone email for the given recipient and intent.',
    category: 'communication',
    tags: ['email', 'communication'],
    content:
      'Write an email for this purpose.\n\nIntent / recipient:\n{{intent}}\n\nKey points to convey:\n{{points}}\n\nTone: {{tone}}\n\nSubject line first, then a clear body: greeting, context, the ask/point, any deadline or action needed, and a courteous close. Keep it skimmable and under ~150 words unless detail is required.',
  },
  {
    id: 'comm_status',
    name: 'Status / Progress Update',
    description: 'Concise, stakeholder-ready progress update with risks and next steps.',
    category: 'communication',
    tags: ['status', 'update', 'communication'],
    content:
      'Write a status update for this work.\n\nAccomplished:\n{{accomplished}}\n\nIn progress / stuck on:\n{{in_progress}}\n\nRisks & help needed:\n{{risks}}\n\nAudience (execs, team, client): {{audience}}\n\nStructure: a one-line headline, "What\'s done", "What\'s next", and "Where I need help / risks". Be honest about deltas from plan and avoid jargon.',
  },
  {
    id: 'comm_meeting_notes',
    name: 'Meeting Summary & Action Items',
    description: 'Turns rough notes into decisions, owners and actions.',
    category: 'communication',
    tags: ['meeting', 'summary', 'action-items'],
    content:
      'Turn these raw notes into a clean meeting summary.\n\nNotes:\n{{notes}}\n\nProduce: a one-paragraph summary, the decisions made (with who decided), open questions, and a table of action items (owner · action · due). Flag anything that needs follow-up confirmation.',
  },
];
