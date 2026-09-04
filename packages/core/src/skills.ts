/**
 * Chat "skills" — reusable capability profiles that are injected into the
 * system prompt when active. Skills steer how the model approaches a task
 * (code review, debugging, architecture, etc.) and are selected per-conversation
 * from the chat context panel.
 */

export interface Skill {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** System-prompt fragment injected when the skill is active. */
  instructions: string;
  /** Natural "kind" grouping used to organize the skill picker. */
  group: 'coding' | 'review' | 'planning' | 'writing' | 'data' | 'general';
}

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'code-review',
    name: 'Code review',
    icon: '✓',
    group: 'review',
    description: 'Review code for bugs, style, security and performance.',
    instructions:
      'Act as a meticulous senior code reviewer. Read the provided code carefully and report: correctness bugs, security issues, performance problems, style inconsistencies, and suggested fixes. Be concrete and reference specific lines/files.',
  },
  {
    id: 'debug',
    name: 'Debugging',
    icon: '🐞',
    group: 'coding',
    description: 'Diagnose root causes and propose fixes.',
    instructions:
      'Act as a debugging expert. Hypothesize the likely root cause, reproduce the logic mentally, and give step-by-step diagnostics. Provide minimal, correct fixes and explain why each fix addresses the root cause.',
  },
  {
    id: 'architect',
    name: 'System design',
    icon: '◆',
    group: 'planning',
    description: 'Design architecture, data models and APIs.',
    instructions:
      'Act as a software architect. Propose a clear architecture with components, data models, interfaces, failure modes and trade-offs. Prefer diagrams described in text or draw.io/XML when helpful. Justify key decisions.',
  },
  {
    id: 'explain',
    name: 'Explain',
    icon: '?',
    group: 'general',
    description: 'Explain a concept or code in simple terms.',
    instructions:
      'Explain the subject in clear, plain language. Start with a one-line gist, then build up from simple to advanced. Use analogies and short examples. Assume the reader is bright but new to the topic.',
  },
  {
    id: 'summarize',
    name: 'Summarize',
    icon: '≡',
    group: 'writing',
    description: 'Condense long content into key points.',
    instructions:
      'Summarize the provided content concisely. Produce a short executive summary up front, then bullet-point the key points and any action items. Preserve important numbers, names and caveats.',
  },
  {
    id: 'refactor',
    name: 'Refactor',
    icon: '⇄',
    group: 'coding',
    description: 'Improve structure without changing behavior.',
    instructions:
      'Act as a refactoring specialist. Propose structure improvements (naming, decomposition, consolidation, removing duplication) while preserving behavior. Show the before/after and call out any risks.',
  },
  {
    id: 'security-review',
    name: 'Security audit',
    icon: '🛡',
    group: 'review',
    description: 'Find security vulnerabilities and hardening steps.',
    instructions:
      'Act as a security engineer. Audit the provided code/config for OWASP-style risks: injection, authN/authZ, secrets handling, unsafe deserialization, SSRF, dependency risks. Rank by severity and give remediation.',
  },
  {
    id: 'data-analysis',
    name: 'Data analysis',
    icon: '📊',
    group: 'data',
    description: 'Analyze data structures, logs and schemas.',
    instructions:
      'Act as a data analyst. Interpret the provided data (CSV, JSON, logs, schemas), identify patterns and anomalies, and summarize findings with concrete numbers and clear tables where useful.',
  },
  {
    id: 'diagram',
    name: 'Diagram & UML',
    icon: '◫',
    group: 'planning',
    description: 'Produce diagrams (SVG, draw.io/XML, ASCII).',
    instructions:
      'Generate clear diagrams. Prefer real diagram markup: SVG for vector graphics, draw.io/mxfile XML, or ASCII diagrams when quick. Keep them legible and well-labeled.',
  },
];

export function getSkill(id: string): Skill | undefined {
  return BUILTIN_SKILLS.find((s) => s.id === id);
}

export function skillsByIds(ids: string[]): Skill[] {
  return ids.map(getSkill).filter((s): s is Skill => Boolean(s));
}
