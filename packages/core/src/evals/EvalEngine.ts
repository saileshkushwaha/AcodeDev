import { ChatEngine } from '../llm/ChatEngine';
import type { ChatMessage, ChatRequest, ProviderId } from '../types';

export type EvalType = 'exact' | 'contains' | 'regex' | 'llm_judge' | 'length' | 'custom';

export interface EvalCase {
  id: string;
  input: string;
  expected?: string;
  reference?: string;
}

export interface EvalDefinition {
  id: string;
  name: string;
  model?: string;
  provider?: ProviderId;
  systemPrompt?: string;
  cases: EvalCase[];
  type: EvalType;
  criteria?: string;
  threshold?: number;
}

export interface EvalCaseResult {
  caseId: string;
  input: string;
  expected?: string;
  actual: string;
  pass: boolean;
  score: number; // 0..1
  llmJudge?: string;
  latencyMs: number;
}

export interface EvalRunResult {
  evalId: string;
  name: string;
  model: string;
  provider: ProviderId;
  results: EvalCaseResult[];
  passRate: number;
  durationMs: number;
  ranAt: number;
}

/**
 * Prompt evaluation runner: compares model outputs across cases
 * using deterministic or LLM-judge scoring.
 */
export class EvalEngine {
  constructor(private engine: ChatEngine) {}

  async run(def: EvalDefinition, overrideModel?: string, overrideProvider?: ProviderId): Promise<EvalRunResult> {
    const model = overrideModel ?? def.model ?? 'nvidia/nemotron-3.5-lightning:free';
    const provider = overrideProvider ?? def.provider ?? 'openrouter';
    const started = Date.now();
    const results: EvalCaseResult[] = [];

    for (const c of def.cases) {
      const caseStart = Date.now();
      const messages: ChatMessage[] = [];
      if (def.systemPrompt) messages.push({ role: 'system', content: def.systemPrompt });
      messages.push({ role: 'user', content: c.input });

      const req: ChatRequest = { provider, model, messages };
      const res = await this.engine.chat(req);
      const actual = res.content;

      let pass = false;
      let score = 0;

      if (def.type === 'llm_judge' && def.criteria) {
        const judge = await this.judge(c.input, actual, c.reference, def.criteria, provider);
        pass = judge.pass;
        score = judge.score;
        results.push({ caseId: c.id, input: c.input, expected: c.expected, actual, pass, score, llmJudge: judge.explanation, latencyMs: Date.now() - caseStart });
        continue;
      }

      pass = this.scoreCase(def.type, actual, c);
      score = pass ? 1 : 0;
      results.push({ caseId: c.id, input: c.input, expected: c.expected, actual, pass, score, latencyMs: Date.now() - caseStart });
    }

    const passRate = results.reduce((acc, r) => acc + (r.pass ? 1 : 0), 0) / (results.length || 1);
    return { evalId: def.id, name: def.name, model, provider, results, passRate, durationMs: Date.now() - started, ranAt: Date.now() };
  }

  private scoreCase(type: EvalType, actual: string, c: EvalCase): boolean {
    switch (type) {
      case 'exact':
        return c.expected !== undefined && actual.trim() === c.expected.trim();
      case 'contains':
        return c.expected !== undefined && actual.includes(c.expected);
      case 'regex':
        if (!c.expected) return false;
        try {
          return new RegExp(c.expected).test(actual);
        } catch {
          return false;
        }
      case 'length':
        return actual.length > (Number(c.expected) || 0);
      default:
        return false;
    }
  }

  private async judge(
    input: string,
    actual: string,
    reference: string | undefined,
    criteria: string,
    provider: ProviderId,
  ): Promise<{ pass: boolean; score: number; explanation: string }> {
    const prompt = [
      `You are an evaluation judge. Evaluate the model OUTPUT against the CRITERIA.`,
      `Input: ${input}`,
      reference ? `Reference: ${reference}` : '',
      `Output: ${actual}`,
      `Criteria: ${criteria}`,
      'Reply with a JSON object: {"pass": boolean, "score": number 0..1, "explanation": string}',
    ]
      .filter(Boolean)
      .join('\n');
    const res = await this.engine.chat({ provider, model: 'nvidia/nemotron-3.5-lightning:free', messages: [{ role: 'user', content: prompt }] });
    try {
      const m = res.content.match(/\{[\s\S]*\}/);
      if (!m) return { pass: false, score: 0, explanation: res.content };
      const parsed = JSON.parse(m[0]);
      return { pass: Boolean(parsed.pass), score: Number(parsed.score) || 0, explanation: parsed.explanation || '' };
    } catch {
      return { pass: false, score: 0, explanation: res.content };
    }
  }
}
