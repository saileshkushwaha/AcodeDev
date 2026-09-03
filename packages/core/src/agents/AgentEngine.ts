import type { ChatMessage, ChatRequest, ToolDefinition, ToolCall } from '../types';
import { ChatEngine } from '../llm/ChatEngine';

export interface AgentTool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  model?: string;
  providerId?: ChatRequest['provider'];
  tools: AgentTool[];
  maxIterations?: number;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

/**
 * Tool-calling agent loop with memory.
 * Runs a chat turn, if the model requests tools execute them,
 * feed results back, and repeat until no tool calls remain.
 */
export class AgentEngine {
  private engine: ChatEngine;
  private tools: AgentTool[];

  constructor(engine: ChatEngine, config: AgentConfig) {
    this.engine = engine;
    this.tools = config.tools;
  }

  private toToolDefs(tools: AgentTool[]): ToolDefinition[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: { type: 'object', properties: {} },
    }));
  }

  async run(
    input: string,
    config: AgentConfig,
    history: ChatMessage[] = [],
  ): Promise<{ conversation: ChatMessage[]; final: string }> {
    const maxIter = config.maxIterations ?? 6;
    const tools = config.tools.length ? this.toToolDefs(config.tools) : undefined;
    const conversation: ChatMessage[] = [
      { role: 'system', content: config.systemPrompt },
      ...history,
      { role: 'user', content: input },
    ];

    for (let i = 0; i < maxIter; i++) {
      const req: ChatRequest = {
        provider: config.providerId ?? 'openrouter',
        model: config.model ?? 'meta-llama/llama-3.3-70b-instruct:free',
        messages: conversation,
        tools,
      };
      const res = await this.engine.chat(req);

      if (res.toolCalls && res.toolCalls.length) {
        conversation.push({ role: 'assistant', content: res.content, toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
          const output = await this.executeTool(call, config.tools);
          conversation.push({ role: 'tool', content: output, toolCallId: call.id });
        }
        continue;
      }

      conversation.push({ role: 'assistant', content: res.content });
      return { conversation, final: res.content };
    }
    const last = conversation[conversation.length - 1];
    return { conversation, final: last?.content ?? '' };
  }

  private async executeTool(call: ToolCall, tools: AgentTool[]): Promise<string> {
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) return `Error: unknown tool "${call.name}"`;
    try {
      const args = call.arguments ? JSON.parse(call.arguments) : {};
      const out = await tool.execute(args);
      return typeof out === 'string' ? out : JSON.stringify(out);
    } catch (e) {
      return `Error executing tool: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
