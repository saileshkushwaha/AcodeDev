import { readJSON, writeJSON } from '../storage';

/** Last eval run, persisted so results survive reloads. */
export interface StoredEvalResult {
  name: string;
  passRate: number;
  results: {
    caseId: string;
    pass: boolean;
    score: number;
    input: string;
    actual: string;
    llmJudge?: string;
  }[];
}

/** Definition + cases + last result UI state, kept in one localStorage key. */
export interface EvalSnapshot {
  def?: Partial<{ name: string; model: string; provider: string; type: string; criteria?: string }>;
  sysPrompt?: string;
  inputText?: string;
  expected?: string;
  cases?: { id: string; input: string; expected?: string }[];
  result?: StoredEvalResult | null;
}

const EVAL_KEY = 'acode.evals.v1';

/**
 * Persistence for the interactive eval builder. Eval definitions, cases and
 * the latest run result are saved offline-first so work is never lost on a
 * reload.
 */
export function readEvalSnapshot(): EvalSnapshot | null {
  return readJSON<EvalSnapshot>(EVAL_KEY);
}

export function writeEvalSnapshot(snapshot: EvalSnapshot): void {
  writeJSON(EVAL_KEY, snapshot);
}