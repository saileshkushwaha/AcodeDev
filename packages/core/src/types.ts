/**
 * Provider identifier. Dynamic — any OpenAI-compatible gateway or vendor id is
 * accepted. The built-in ids (openrouter, openai, google, anthropic, mistral,
 * groq, deepseek, together, local) are seeded by the catalog registry and can
 * be extended at runtime (e.g. from OpenRouter's live model list or custom
 * gateways).
 */
export type ProviderId = string;

export type ConnectionMode = 'openrouter' | 'direct' | 'local';

/** Resource kinds a user can attach to a chat message. */
export type AttachmentKind =
  | 'text' // arbitrary text
  | 'file' // a text/code file
  | 'folder' // a folder containing files
  | 'image' // image (PNG/JPEG/WebP/GIF) via data URL
  | 'svg' // SVG document
  | 'drawio' // draw.io XML diagram
  | 'link'; // URL reference

export interface ChatAttachment {
  id: string;
  kind: AttachmentKind;
  /** Display name (file name, link title, etc.). */
  name: string;
  /** MIME type when known (e.g. image/png, text/plain, image/svg+xml). */
  mimeType?: string;
  /** For image: a data URL or remote URL. */
  src?: string;
  /** For text/file/svg/drawio: raw textual content. */
  text?: string;
  /** For link: the target URL. */
  url?: string;
  /** For folder: flattened child files. */
  children?: { name: string; path: string; text: string }[];
  /** Byte size when known. */
  size?: number;
}

/** Modal capabilities a given model can accept in a chat message. */
export type ModelCapability =
  | 'text' // plain text
  | 'tool' // function/tool calling
  | 'vision' // images
  | 'image' // image generation is out of scope; reserved
  | 'file' // text/code files
  | 'folder' // folder of files
  | 'svg'
  | 'drawio'
  | 'link'
  | 'code' // code-aware
  | 'reasoning'; // chain-of-thought / reasoning model

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  /** Rich content parts (text + images) for multimodal providers. */
  parts?: ChatContentPart[];
  /** User-supplied resources attached to this message. */
  attachments?: ChatAttachment[];
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
  /** Resource kinds this model can accept in a message (defaults to text+tool). */
  capabilities?: ModelCapability[];
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
