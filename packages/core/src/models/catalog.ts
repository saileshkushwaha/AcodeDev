import type { ModelInfo, ProviderId } from '../types';

const FREE_MODELS: Record<ProviderId, ModelInfo[]> = {
  openrouter: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat', 'fast'] },
    { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat', 'reasoning'] },
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (free)', provider: 'openrouter', contextWindow: 1000000, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'vision'] },
    { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat'] },
    { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (free)', provider: 'openrouter', contextWindow: 128000, maxOutput: 4096, isFree: true, tags: ['chat', 'fast', 'small'] },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (free)', provider: 'openrouter', contextWindow: 32768, maxOutput: 4096, isFree: true, tags: ['chat'] },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', contextWindow: 128000, maxOutput: 16384, isFree: false, costPer1kIn: 0.00015, costPer1kOut: 0.0006, tags: ['chat'] },
  ],
  google: [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (free tier)', provider: 'google', contextWindow: 1000000, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'vision'] },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (free tier)', provider: 'google', contextWindow: 1000000, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'vision'] },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (free tier)', provider: 'google', contextWindow: 2000000, maxOutput: 8192, isFree: true, tags: ['chat', 'vision'] },
  ],
  anthropic: [
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, maxOutput: 8192, isFree: false, costPer1kIn: 0.0008, costPer1kOut: 0.004, tags: ['chat', 'fast'] },
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small', provider: 'mistral', contextWindow: 32000, maxOutput: 4096, isFree: true, tags: ['chat'] },
    { id: 'mistral-medium-latest', name: 'Mistral Medium', provider: 'mistral', contextWindow: 32000, maxOutput: 4096, isFree: false, tags: ['chat'] },
    { id: 'open-mistral-7b', name: 'Mistral 7B', provider: 'mistral', contextWindow: 32000, maxOutput: 4096, isFree: true, tags: ['chat', 'small'] },
  ],
  groq: [
    { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B (Groq)', provider: 'groq', contextWindow: 131072, maxOutput: 32768, isFree: true, tags: ['chat', 'fast'] },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)', provider: 'groq', contextWindow: 131072, maxOutput: 8192, isFree: true, tags: ['chat', 'fast', 'small'] },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B (Groq)', provider: 'groq', contextWindow: 8192, maxOutput: 8192, isFree: true, tags: ['chat', 'small'] },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', provider: 'groq', contextWindow: 32768, maxOutput: 32768, isFree: true, tags: ['chat'] },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', contextWindow: 128000, maxOutput: 8192, isFree: false, costPer1kIn: 0.00027, costPer1kOut: 0.0011, tags: ['chat', 'reasoning'] },
  ],
  together: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B (Together)', provider: 'together', contextWindow: 128000, maxOutput: 4096, isFree: false, costPer1kIn: 0.00088, costPer1kOut: 0.00088, tags: ['chat'] },
  ],
  local: [
    { id: 'local/default', name: 'Local model (llama.cpp)', provider: 'local', contextWindow: 32768, maxOutput: 4096, isFree: true, tags: ['chat', 'offline'] },
  ],
};

export function listModels(provider?: ProviderId): ModelInfo[] {
  if (provider) return FREE_MODELS[provider] ?? [];
  return Object.values(FREE_MODELS).flat();
}

export function getModel(id: string): ModelInfo | undefined {
  return Object.values(FREE_MODELS).flat().find((m) => m.id === id);
}

export function getFreeModels(): ModelInfo[] {
  return Object.values(FREE_MODELS).flat().filter((m) => m.isFree);
}

export const PROVIDER_LIST: { id: ProviderId; name: string }[] = [
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google Gemini' },
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'mistral', name: 'Mistral' },
  { id: 'groq', name: 'Groq' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'together', name: 'Together AI' },
  { id: 'local', name: 'Local / Offline' },
];

export const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  anthropic: 'https://api.anthropic.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  together: 'https://api.together.xyz/v1',
  local: 'http://localhost:11434/v1',
};
