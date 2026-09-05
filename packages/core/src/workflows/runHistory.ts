import { readJSON, writeJSON } from '../storage';
import type { WorkflowRunResult } from './WorkflowEngine';

export const RUN_HISTORY_KEY = 'acode.workflows.runs.v1';
export const LEGACY_RUN_HISTORY_KEY = 'acode.workflows.lastRun.v1';
export const MAX_RUN_HISTORY = 30;

/**
 * One persisted execution of a WorkflowDefinition, newest first.
 * `cost` is the summed step cost (USD) and `elapsedMs` the wall-clock
 * duration recorded when the run finished.
 */
export interface WorkflowRunRecord {
  at: number;
  results: WorkflowRunResult[];
  final: string;
  input: string;
  cost: number;
  elapsedMs: number;
}

/**
 * Load a workflow's run history (newest first, already capped at
 * MAX_RUN_HISTORY). Missing or corrupted data yields an empty array.
 * When no history exists yet, a single legacy record written by the
 * pre-history screen under `acode.workflows.lastRun.v1` is migrated in.
 */
export function loadRunHistory(id: string): WorkflowRunRecord[] {
  const map = readJSON<Record<string, WorkflowRunRecord[]>>(RUN_HISTORY_KEY);
  const runs = map?.[id] ?? [];
  if (runs.length > 0) return runs;
  const legacy = readJSON<Record<string, WorkflowRunRecord>>(LEGACY_RUN_HISTORY_KEY)?.[id];
  return legacy ? [{ ...legacy, cost: legacy.cost ?? 0, elapsedMs: legacy.elapsedMs ?? 0 }] : [];
}

/**
 * Persist a workflow's run history (newest first). The list is capped at
 * MAX_RUN_HISTORY newest entries. Idempotent per workflow id.
 */
export function saveRunHistory(id: string, runs: WorkflowRunRecord[]): void {
  const map = readJSON<Record<string, WorkflowRunRecord[]>>(RUN_HISTORY_KEY) ?? {};
  map[id] = runs.slice(0, MAX_RUN_HISTORY);
  writeJSON(RUN_HISTORY_KEY, map);
}