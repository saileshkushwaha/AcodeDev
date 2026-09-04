import type { ProviderId } from '../types';

export type ConnectorCategory = 'ai' | 'business' | 'dev' | 'gateway' | 'custom';

export interface ConnectorCategoryMeta {
  id: ConnectorCategory;
  label: string;
  description: string;
}

export interface KnownConnector {
  /** Stable storage key (for AI providers this equals the ProviderId). */
  id: string;
  /** Human-friendly display name. */
  label: string;
  category: ConnectorCategory;
  /** Coarse service type shown as a badge, e.g. LLM / Git / Database. */
  connectorType?: string;
  /** Whether this key is consumed by the AI engine (maps to a ProviderId). */
  isProvider?: boolean;
  needsKey?: boolean;
  description?: string;
  placeholder: string;
  doc?: string;
  icon?: string;
  /** Aggregator gateway connector (configured via registry + base URL). */
  gateway?: boolean;
  /** For gateways: the OpenAI-compatible base URL. */
  baseUrl?: string;
  /** Whether this connector can be removed at runtime (custom additions). */
  removable?: boolean;
}

export const CONNECTOR_CATEGORIES: ConnectorCategoryMeta[] = [
  { id: 'ai', label: 'AI & Models', description: 'LLM providers powering Chat, Agents and evals.' },
  { id: 'gateway', label: 'Gateways', description: 'Aggregator gateways exposing models from many vendors — add any OpenAI-compatible one.' },
  { id: 'business', label: 'Business & Productivity', description: 'Team apps and SaaS you connect your workflows to.' },
  { id: 'dev', label: 'Developer & DevOps', description: 'Git hosts, clouds and deployment platforms.' },
  { id: 'custom', label: 'Custom', description: 'Bring your own connector for anything else.' },
];

export function categoryMeta(id: ConnectorCategory): ConnectorCategoryMeta {
  return CONNECTOR_CATEGORIES.find((c) => c.id === id) ?? CONNECTOR_CATEGORIES[0];
}

/** Decide the coarse service type for an AI provider. */
function aiType(provider: ProviderId): string {
  return 'LLM';
}

const AI_CONNECTORS: KnownConnector[] = [
  { id: 'openrouter', label: 'OpenRouter', category: 'ai', connectorType: aiType('openrouter'), isProvider: true, placeholder: 'sk-or-v1-…', doc: 'https://openrouter.ai/keys', icon: '✦' },
  { id: 'openai', label: 'OpenAI', category: 'ai', connectorType: aiType('openai'), isProvider: true, placeholder: 'sk-…', doc: 'https://platform.openai.com/api-keys', icon: '◉' },
  { id: 'google', label: 'Google Gemini', category: 'ai', connectorType: aiType('google'), isProvider: true, placeholder: 'AIza…', doc: 'https://aistudio.google.com/app/apikey', icon: '◆' },
  { id: 'anthropic', label: 'Anthropic Claude', category: 'ai', connectorType: aiType('anthropic'), isProvider: true, placeholder: 'sk-ant-…', doc: 'https://console.anthropic.com/', icon: '▲' },
  { id: 'mistral', label: 'Mistral', category: 'ai', connectorType: aiType('mistral'), isProvider: true, placeholder: '…', doc: 'https://console.mistral.ai/api-keys', icon: '◆' },
  { id: 'groq', label: 'Groq', category: 'ai', connectorType: aiType('groq'), isProvider: true, placeholder: 'gsk_…', doc: 'https://console.groq.com/keys', icon: '⚡' },
  { id: 'deepseek', label: 'DeepSeek', category: 'ai', connectorType: aiType('deepseek'), isProvider: true, placeholder: 'sk-…', doc: 'https://platform.deepseek.com/', icon: '◈' },
  { id: 'together', label: 'Together AI', category: 'ai', connectorType: aiType('together'), isProvider: true, placeholder: '…', doc: 'https://api.together.ai/settings/api-keys', icon: '⬡' },
  { id: 'local', label: 'Local / Offline', category: 'ai', connectorType: 'Local', isProvider: true, placeholder: 'optional base URL only', icon: '⛁' },
];

const BUSINESS_CONNECTORS: KnownConnector[] = [
  { id: 'slack', label: 'Slack', category: 'business', connectorType: 'Messaging', placeholder: 'xoxb-…', doc: 'https://api.slack.com/apps', icon: '#' },
  { id: 'notion', label: 'Notion', category: 'business', connectorType: 'Docs', placeholder: 'secret_…', doc: 'https://www.notion.so/my-integrations', icon: '📄' },
  { id: 'linear', label: 'Linear', category: 'business', connectorType: 'Project mgmt', placeholder: 'lin_api_…', doc: 'https://linear.app/settings/api', icon: '▤' },
  { id: 'asana', label: 'Asana', category: 'business', connectorType: 'Project mgmt', placeholder: '…', doc: 'https://app.asana.com/0/my-apps', icon: '▧' },
  { id: 'trello', label: 'Trello', category: 'business', connectorType: 'Project mgmt', placeholder: '…', doc: 'https://trello.com/app-key', icon: '▭' },
  { id: 'airtable', label: 'Airtable', category: 'business', connectorType: 'Database', placeholder: 'pat…', doc: 'https://airtable.com/create/tokens', icon: '▣' },
  { id: 'hubspot', label: 'HubSpot', category: 'business', connectorType: 'CRM', placeholder: 'pat-…', doc: 'https://developers.hubspot.com/', icon: '☰' },
  { id: 'google-workspace', label: 'Google Workspace', category: 'business', connectorType: 'Productivity', placeholder: '…', doc: 'https://console.cloud.google.com/apis/credentials', icon: 'G' },
];

const DEV_CONNECTORS: KnownConnector[] = [
  { id: 'github', label: 'GitHub', category: 'dev', connectorType: 'Git host', placeholder: 'github_pat_… / ghp_…', doc: 'https://github.com/settings/tokens', icon: '⑂' },
  { id: 'gitlab', label: 'GitLab', category: 'dev', connectorType: 'Git host', placeholder: 'glpat-…', doc: 'https://gitlab.com/-/user_settings/personal_access_tokens', icon: '◧' },
  { id: 'bitbucket', label: 'Bitbucket', category: 'dev', connectorType: 'Git host', placeholder: '…', doc: 'https://bitbucket.org/account/settings/app-password/', icon: '◈' },
  { id: 'aws', label: 'AWS', category: 'dev', connectorType: 'Cloud', placeholder: 'AKIA…', doc: 'https://console.aws.amazon.com/iam', icon: '☁' },
  { id: 'azure', label: 'Azure', category: 'dev', connectorType: 'Cloud', placeholder: '…', doc: 'https://portal.azure.com', icon: '☁' },
  { id: 'gcp', label: 'Google Cloud', category: 'dev', connectorType: 'Cloud', placeholder: 'AIza…', doc: 'https://console.cloud.google.com/apis/credentials', icon: '☁' },
  { id: 'vercel', label: 'Vercel', category: 'dev', connectorType: 'Deploy', placeholder: '…', doc: 'https://vercel.com/account/tokens', icon: '▲' },
  { id: 'render', label: 'Render', category: 'dev', connectorType: 'Deploy', placeholder: 'rnd_…', doc: 'https://dashboard.render.com/u/settings/api-keys', icon: '◈' },
  { id: 'supabase', label: 'Supabase', category: 'dev', connectorType: 'Database', placeholder: 'sbp_…', doc: 'https://supabase.com/dashboard/account/tokens', icon: '⬢' },
  { id: 'docker', label: 'Docker Hub', category: 'dev', connectorType: 'Registry', placeholder: '…', doc: 'https://hub.docker.com/settings/security', icon: '◍' },
  { id: 'stripe', label: 'Stripe', category: 'dev', connectorType: 'Payments', placeholder: 'sk_live_…', doc: 'https://dashboard.stripe.com/apikeys', icon: '◫' },
];

export const KNOWN_CONNECTORS: KnownConnector[] = [
  ...AI_CONNECTORS,
  ...BUSINESS_CONNECTORS,
  ...DEV_CONNECTORS,
].sort((a, b) => a.label.localeCompare(b.label));

export function connectorsFor(category: ConnectorCategory): KnownConnector[] {
  return category === 'custom' ? [] : KNOWN_CONNECTORS.filter((c) => c.category === category);
}

export function findConnector(id: string): KnownConnector | undefined {
  return KNOWN_CONNECTORS.find((c) => c.id === id);
}

/** Mapping of AI provider ids we manage (subset used by the engine). */
export const AI_PROVIDER_IDS: Record<ProviderId, string> = {
  openrouter: 'openrouter',
  openai: 'openai',
  google: 'google',
  anthropic: 'anthropic',
  mistral: 'mistral',
  groq: 'groq',
  deepseek: 'deepseek',
  together: 'together',
  local: 'local',
};
