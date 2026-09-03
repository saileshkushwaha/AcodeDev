export type ProviderId =
  | 'openrouter'
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'mistral'
  | 'groq'
  | 'deepseek'
  | 'together'
  | 'local';

export type ConnectionMode = 'openrouter' | 'direct' | 'local';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stop?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  stream?: boolean;
}

export interface ChatRequest {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  params?: ModelParams;
  tools?: ToolDefinition[];
  baseUrl?: string;
  apiKey?: string;
}

export interface ChatStreamChunk {
  delta: string;
  toolCalls?: ToolCall[];
  done?: boolean;
  finishReason?: string;
  content?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  maxOutput: number;
  isFree: boolean;
  costPer1kIn?: number;
  costPer1kOut?: number;
  tags: string[];
}

export type CryptoAdapter = {
  encrypt: (plain: string) => string;
  decrypt: (cipher: string) => string;
  secureStore: {
    set: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | undefined>;
    remove: (key: string) => Promise<void>;
  };
};
