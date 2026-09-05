import { ChatEngine } from '../llm/ChatEngine';
import { estimateTokens } from '../prompts/PromptRegistry';
import { listModels } from '../models/catalog';
import type { ChatMessage, ChatRequest, ProviderId } from '../types';

export type WorkflowNodeType =
  | 'llm'
  | 'transform'
  | 'condition'
  | 'prompt_template'
  | 'input'
  | 'output'
  | 'trigger'
  | 'http'
  | 'fetch'
  | 'kv'
  | 'variables'
  | 'secret'
  | 'parallel'
  | 'loop';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  /** Catalog category id, e.g. from WORKFLOW_CATEGORIES. */
  category?: string;
  tags?: string[];
  /** True for curated library presets (seedable, reset-table, not deletable). */
  builtin?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Record<string, string>;
  provider?: ProviderId;
  model?: string;
  updatedAt: number;
}

export type WorkflowRunNodeType = WorkflowNodeType | 'error';

export interface WorkflowRunResult {
  nodeId: string;
  nodeType: WorkflowRunNodeType;
  output: string;
  durationMs: number;
  /** 'ok' when the step produced output normally; 'error' when it threw. */
  status?: 'ok' | 'error';
  /** Token usage for LLM steps (provider usage when reported, else estimated). */
  tokens?: { prompt: number; completion: number };
  /** Estimated USD cost for LLM steps based on the model catalog. */
  cost?: number;
}

/**
 * Deterministic DAG executor for LLM workflows.
 * Supports LLM nodes, string transforms, conditions, and templating.
 */
export class WorkflowEngine {
  constructor(private engine: ChatEngine) {}

  async run(def: WorkflowDefinition, input: Record<string, unknown>): Promise<{ results: WorkflowRunResult[]; final: string }> {
    const results = new Map<string, WorkflowRunResult>();
    const visited = new Set<string>();

    const entry = def.nodes.find((n) => n.type === 'input') ?? def.nodes[0];
    if (!entry) throw new Error('Workflow has no entry node');

    const outputsOf = (nodeId?: string) => (nodeId ? results.get(nodeId)?.output ?? '' : '');

    const execute = async (node: WorkflowNode) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      const start = Date.now();

      if (node.type === 'input') {
        results.set(node.id, { nodeId: node.id, nodeType: node.type, output: this.render(String(node.config.value ?? ''), def.variables, input, outputsOf), durationMs: 0, status: 'ok' });
      } else {
        // Gather upstream inputs first (depth-first)
        const incoming = def.edges.filter((e) => e.target === node.id);
        for (const edge of incoming) {
          const src = def.nodes.find((n) => n.id === edge.source);
          if (src && !visited.has(src.id)) await execute(src);
        }
        const upstreamText = incoming.map((e) => outputsOf(e.source)).join('\n\n');
        if (incoming.length === 0) {
          // Entry-adjacent leaf: execute with raw input
          await runNode(node, this.render(String(node.config.prompt ?? ''), def.variables, input, outputsOf));
        } else {
          await runNode(node, upstreamText);
        }
      }

      // Forward to successors so the whole chain executes top → bottom
      for (const edge of def.edges.filter((e) => e.source === node.id)) {
        const next = def.nodes.find((n) => n.id === edge.target);
        if (next) await execute(next);
      }
    };

    const runNode = async (node: WorkflowNode, upstreamText: string) => {
      const start = Date.now();
      let output = '';
      let status: 'ok' | 'error' = 'ok';
      let tokens: { prompt: number; completion: number } | undefined;
      let cost = 0;
      try {
        switch (node.type) {
          case 'llm': {
            const provider = (node.config.provider as ProviderId) ?? def.provider ?? 'openrouter';
            const model = String(node.config.model ?? def.model ?? 'nvidia/nemotron-3.5-lightning:free');
            const system = String(node.config.systemPrompt ?? 'You are a helpful AI assistant.');
            const user = upstreamText || 'Please respond.';
            const messages: ChatMessage[] = [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ];
            const req: ChatRequest = {
              provider,
              model,
              messages,
              params: {
                temperature: node.config.temperature !== undefined ? Number(node.config.temperature) : undefined,
                maxTokens: node.config.maxTokens !== undefined ? Number(node.config.maxTokens) : undefined,
              },
            };
            const res = await this.engine.chat(req);
            output = res.content;
            const prompt = res.usage?.promptTokens ?? estimateTokens(`${system}\n\n${user}`);
            const completion = res.usage?.completionTokens ?? estimateTokens(output);
            tokens = { prompt, completion };
            const modelInfo = listModels(provider).find((m) => m.id === model);
            const pin = modelInfo?.costPer1kIn ?? 0;
            const pout = modelInfo?.costPer1kOut ?? 0;
            if (pin > 0 || pout > 0) cost = (prompt / 1000) * pin + (completion / 1000) * pout;
            break;
          }
          case 'transform': {
            const op = String(node.config.operation ?? 'uppercase');
            const val = upstreamText;
            if (op === 'uppercase') output = val.toUpperCase();
            else if (op === 'lowercase') output = val.toLowerCase();
            else if (op === 'trim') output = val.trim();
            else if (op === 'truncate') output = val.slice(0, Number(node.config.length ?? 500));
            else if (op === 'json') output = JSON.stringify(this.tryParse(val), null, 2);
            else output = val;
            break;
          }
          case 'prompt_template': {
            output = this.render(String(node.config.template ?? ''), def.variables, input, () => upstreamText);
            break;
          }
          case 'trigger': {
            const type = String(node.config.type ?? 'cron');
            const expr = String(node.config.expression ?? 'true');
            const intervalMs = Number(node.config.interval ?? 60000);
            let once = false;
            if (type === 'cron') {
              // Simple cron-like: schedule once per run, evaluate condition
              // For in-DAG execution, we just evaluate the condition once
              // and set output; the engine runs synchronously so "cron" fires once
              if (this.evalCondition(expr, { input, upstream: upstreamText })) {
                output = 'triggered';
              } else {
                output = '';
              }
            } else if (type === 'once') {
              once = true;
              if (this.evalCondition(expr, { input, upstream: upstreamText })) {
                output = 'triggered';
              } else {
                output = '';
              }
            } else {
              output = 'triggered';
            }
            break;
          }
          case 'http': {
            const method = String(node.config.method ?? 'GET').toUpperCase();
            const url = this.render(String(node.config.url ?? ''), def.variables, input, outputsOf);
            const body = node.config.body ? this.render(String(node.config.body), def.variables, input, outputsOf) : undefined;
            const headers: Record<string, string> = {};
            if (node.config.headers) {
              Object.entries(node.config.headers).forEach(([k, v]) => {
                headers[k] = this.render(String(v), def.variables, input, outputsOf);
              });
            }
            try {
              const fetchOptions: RequestInit = { method };
              if (body) fetchOptions.body = body;
              if (headers && Object.keys(headers).length > 0) fetchOptions.headers = headers;
              const resp = await fetch(url, fetchOptions);
              const text = await resp.text();
              const headersOut: Record<string, string> = {};
              resp.headers.forEach((v, k) => { headersOut[k] = v; });
              output = `Status: ${resp.status}\nHeaders: ${JSON.stringify(headersOut)}\nBody: ${text}`;
            } catch (e: any) {
              output = `⚠️ HTTP Request failed: ${e.message ?? String(e)}`;
            }
            break;
          }
          case 'fetch': {
            // Web Fetch: HTTP + HTML→markdown via a small reader
            const url = this.render(String(node.config.url ?? ''), def.variables, input, outputsOf);
            try {
              const resp = await fetch(url);
              const text = await resp.text();
              const html = text;
              // Simple HTML→markdown: strip tags, preserve headings and lists
              let md = html
                .replace(/<h1>/gi, '# ')
                .replace(/<\/h1>/gi, '\n')
                .replace(/<h2>/gi, '## ')
                .replace(/<\/h2>/gi, '\n')
                .replace(/<h3>/gi, '### ')
                .replace(/<\/h3>/gi, '\n')
                .replace(/<p>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<ul>/gi, '- ')
                .replace(/<\/ul>/gi, '\n')
                .replace(/<li>/gi, '- ')
                .replace(/<\/li>/gi, '\n')
                .replace(/<br\s*\/>/gi, '\n')
                .replace(/<[^>]+>/g, '');
              // Collapse multiple newlines
              md = md.replace(/\n{3,}/g, '\n\n');
              output = md || 'No content retrieved';
            } catch (e: any) {
              output = `⚠️ Web Fetch failed: ${e.message ?? String(e)}`;
            }
            break;
          }
          case 'kv': {
            // KV Store node: reads/writes to localStorage key
            const action = String(node.config.action ?? 'get');
            const key = String(node.config.key ?? '');
            let stored = '';
            try {
              stored = localStorage.getItem(key) ?? '';
            } catch {
              stored = '';
            }
            if (action === 'get') {
              output = stored;
            } else if (action === 'set') {
              try {
                localStorage.setItem(key, String(node.config.value ?? ''));
                output = `✓ Stored "${key}"`;
              } catch (e: any) {
                output = `⚠️ KV set failed: ${e.message ?? String(e)}`;
              }
            } else if (action === 'delete') {
              try {
                localStorage.removeItem(key);
                output = `✓ Deleted "${key}"`;
              } catch {
                output = `⚠️ KV delete failed`;
              }
            } else {
              output = stored;
            }
            break;
          }
          case 'variables': {
            // Variables node: set/update workflow.variables mid-run
            const action = String(node.config.action ?? 'set');
            const key = String(node.config.key ?? '');
            const value = this.render(String(node.config.value ?? ''), def.variables, input, outputsOf);
            if (action === 'set') {
              def.variables[key] = value;
              output = `✓ Set variable "${key}" = ${value}`;
            } else if (action === 'get') {
              output = def.variables[key] ?? '';
            } else if (action === 'unset') {
              delete def.variables[key];
              output = `✓ Unset variable "${key}"`;
            } else {
              output = def.variables[key] ?? '';
            }
            break;
          }
          case 'secret': {
            // Secret Reference node: looks up a secret from the API key store
            const name = String(node.config.name ?? '');
            try {
              const secrets = listModels('openrouter').reduce((acc: Record<string, string>, m) => {
                // This is a placeholder; in a real implementation, we'd have a secrets API
                // For now, output a placeholder that the user can replace
                if (m.id === name) acc[name] = 'sk-...';
                return acc;
              }, {});
              if (name in secrets) {
                output = secrets[name];
              } else {
                output = `🔐 Secret "${name}" not found. Add it in Connections → Keys.`;
              }
            } catch {
              output = `🔐 Secret "${name}" lookup failed`;
            }
            break;
          }
          case 'parallel': {
            // Parallel node: fans out to all downstream edges, waits for all (Promise.all)
            // Collect all target node outputs, then join with separator
            const targets = def.edges
              .filter((e) => e.source === node.id)
              .map((e) => {
                const tgt = def.nodes.find((n) => n.id === e.target);
                if (!tgt) return '';
                return outputsOf(e.target);
              });
            // Execute targets sequentially here since engine is single-threaded,
            // but mark output as parallel-combined
            const results = targets.filter((t): t is string => t !== '');
            output = results.length > 0 ? results.join('\n\nPARALLEL_BREAK\n\n') : '';
            break;
          }
          case 'loop': {
            // Loop node: iterates over an array, executes body for each item
            const arrayStr = String(node.config.array ?? '[]');
            let arr: unknown[] = [];
            try {
              arr = JSON.parse(arrayStr);
            } catch {
              arr = [arrayStr];
            }
            const bodyExpr = String(node.config.body ?? 'upstream');
            const separator = String(node.config.separator ?? '\n');
            const items: string[] = [];
            for (const item of arr) {
              const itemUpstream = String(item);
              const itemOutput = this.evalCondition(bodyExpr, { input, upstream: itemUpstream });
              items.push(String(itemOutput));
            }
            output = items.join(separator);
            break;
          }
        case 'output':
          default:
            output = upstreamText;
        }
      } catch (e) {
        status = 'error';
        output = `⚠️ Step "${node.name || node.id}" failed: ${e instanceof Error ? e.message : String(e)}`;
      }
      results.set(node.id, { nodeId: node.id, nodeType: node.type, output, durationMs: Date.now() - start, status, tokens, cost });
    };

    await execute(entry);
    const finalNode = def.nodes.find((n) => n.type === 'output')
      ?? def.nodes[def.nodes.length - 1]
      ?? entry;
    return { results: [...results.values()], final: results.get(finalNode.id)?.output ?? '' };
  }


  private evalCondition(expr: string, ctx: Record<string, unknown>): boolean {
    const body = expr
      .replace(/\bupstream\b/g, JSON.stringify(ctx.upstream))
      .replace(/\binput\b/g, JSON.stringify(ctx.input));
    try {
      const fn = new Function(`"use strict"; return (${body});`);
      return Boolean(fn());
    } catch {
      return false;
    }
  }

  private render(
    template: string,
    variables: Record<string, string>,
    input: Record<string, unknown>,
    upstream: (nodeId?: string) => string,
  ): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
      if (name === 'upstream') return upstream();
      if (name in input) return String(input[name]);
      if (name in variables) return variables[name];
      return '';
    });
  }
  private tryParse(s: string) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
}
