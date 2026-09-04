import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ToolDefinition,
} from '../types';
import { getProvider } from '../models/catalog';

export interface AbstractProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
  stream(req: ChatRequest): AsyncIterable<ChatStreamChunk>;
}

function buildOpenAIMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.name ? { name: m.name } : {}),
    ...(m.toolCalls && m.toolCalls.length ? { tool_calls: m.toolCalls } : {}),
    ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
  }));
}

export class OpenAICompatibleProvider implements AbstractProvider {
  constructor(public readonly providerId: string, public readonly apiBase: string) {}

  private headers(apiKey?: string) {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: buildOpenAIMessages(req.messages),
      stream: false,
    };
    Object.entries(req.params ?? {}).forEach(([k, v]) => {
      if (v !== undefined && k !== 'stream') body[k] = v;
    });
    if (req.tools?.length) body.tools = req.tools;

    const base = req.baseUrl ?? this.apiBase;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: this.headers(req.apiKey),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      toolCalls: choice?.message?.tool_calls,
      finishReason: choice?.finish_reason,
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined,
    };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: buildOpenAIMessages(req.messages),
      stream: true,
    };
    Object.entries(req.params ?? {}).forEach(([k, v]) => {
      if (v !== undefined && k !== 'stream') body[k] = v;
    });
    if (req.tools?.length) body.tools = req.tools;

    const base = req.baseUrl ?? this.apiBase;
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { ...this.headers(req.apiKey), Accept: 'text/event-stream' },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`LLM error ${res.status}: ${await res.text()}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let usage: { promptTokens?: number; completionTokens?: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          yield { delta: '', done: true, usage };
          return;
        }
        try {
          const data = JSON.parse(payload);
          const delta = data.choices?.[0]?.delta ?? {};
          if (data.usage) usage = { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens };
          yield {
            delta: delta.content ?? '',
            toolCalls: delta.tool_calls,
            finishReason: data.choices?.[0]?.finish_reason,
            usage,
          };
        } catch {
          /* skip malformed */
        }
      }
    }
    yield { delta: '', done: true, usage };
  }
}

export class GoogleProvider implements AbstractProvider {
  async chat(req: ChatRequest): Promise<ChatResponse> {
    return this.call(req, false);
  }
  async *stream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const res = await this.callRaw(req, true);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line.startsWith('data:') && line.length > 5) {
          const json = line.slice(5).trim();
          try {
            const part = JSON.parse(json);
            const t = part.candidates?.[0]?.content?.parts
              ?.map((p: { text?: string }) => p.text ?? '')
              .join('') ?? '';
            if (t) {
              text += t;
              yield { delta: t };
            }
          } catch {
            /* skip */
          }
        }
      }
    }
    yield { delta: '', done: true, content: text };
  }

  private buildContents(messages: ChatMessage[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  }

  private async callRaw(req: ChatRequest, stream: boolean) {
    const base = req.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const key = req.apiKey;
    const contents = this.buildContents(req.messages);
    const system = req.messages.find((m) => m.role === 'system')?.content;
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: req.params?.maxTokens,
        temperature: req.params?.temperature,
        topP: req.params?.topP,
        topK: req.params?.topK,
        stopSequences: req.params?.stop,
      },
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = `${base}/models/${req.model}:${stream ? 'streamGenerateContent' : 'generateContent'}?alt=sse&key=${key}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    return res;
  }

  private async call(req: ChatRequest, stream: boolean): Promise<ChatResponse> {
    if (stream) throw new Error('Use stream() for streaming on Google provider');
    const res = await this.callRaw(req, false);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    return { content: text, finishReason: data.candidates?.[0]?.finishReason };
  }
}

export class AnthropicProvider implements AbstractProvider {
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.callRaw(req, false);
    const data = await res.json();
    return { content: data.content?.[0]?.text ?? '', finishReason: data.stop_reason, usage: data.usage ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens } : undefined };
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const body = this.buildBody(req, true);
    const base = req.baseUrl ?? 'https://api.anthropic.com/v1';
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
            yield { delta: data.delta.text };
          } else if (data.type === 'message_delta') {
            yield { delta: '', done: true, finishReason: data.delta?.stop_reason };
          }
        } catch {
          /* skip */
        }
      }
    }
    yield { delta: '', done: true };
  }

  private buildBody(req: ChatRequest, stream: boolean) {
    const system = req.messages.find((m) => m.role === 'system')?.content;
    const nonSystem = req.messages.filter((m) => m.role !== 'system');
    const parts = nonSystem.map((m) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.params?.maxTokens ?? 4096,
      messages: parts,
      stream,
    };
    if (system) body.system = system;
    if (req.params?.temperature !== undefined) body.temperature = req.params.temperature;
    if (req.params?.topP !== undefined) body.top_p = req.params.topP;
    if (req.params?.stop) body.stop_sequences = req.params.stop;
    return body;
  }

  private async callRaw(req: ChatRequest, stream: boolean) {
    const body = this.buildBody(req, stream);
    const base = req.baseUrl ?? 'https://api.anthropic.com/v1';
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    return res;
  }
}

export function createProvider(provider: string, apiBase?: string): AbstractProvider {
  const def = getProvider(provider);
  const base = apiBase ?? def?.baseUrl;
  if (def?.kind === 'google') return new GoogleProvider();
  if (def?.kind === 'anthropic') return new AnthropicProvider();
  // Everything else — direct OpenAI vendors, gateways, custom providers and any
  // unknown id — speaks the OpenAI-compatible protocol against its base URL.
  return new OpenAICompatibleProvider(provider, base ?? '');
}
