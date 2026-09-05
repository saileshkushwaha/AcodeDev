import { ChatEngine } from '../llm/ChatEngine';
import { estimateTokens } from '../prompts/PromptRegistry';
import { listModels } from '../models/catalog';
import type { ChatMessage, ChatRequest, ProviderId } from '../types';

export type WorkflowNodeType = 'llm' | 'transform' | 'condition' | 'prompt_template' | 'input' | 'output';

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
          case 'condition': {
            const expression = String(node.config.expression ?? 'true');
            output = String(this.evalCondition(expression, { input, upstream: upstreamText }));
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

  private tryParse(s: string) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
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
}
