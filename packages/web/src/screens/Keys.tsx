import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Badge, useTheme, useIsMobile, Modal, Spinner } from '@acode/ui';
import {
  KNOWN_CONNECTORS,
  connectorsFor,
  categoryMeta,
  CONNECTOR_CATEGORIES,
  findConnector,
  maskKey,
  listGatewayProviders,
  getProvider,
  registerProvider,
  unregisterProvider,
  registerModel,
  persistCatalog,
  type ConnectorCategory,
  type KnownConnector,
  type ProviderDef,
} from '@acode/core';

// Base URLs + auth style used for live "Test connection" on supported providers.
const TEST_ENDPOINTS: Record<string, { url: string; auth: 'bearer' | 'x-api-key' | 'query' }> = {
  openrouter: { url: 'https://openrouter.ai/api/v1/models', auth: 'bearer' },
  openai: { url: 'https://api.openai.com/v1/models', auth: 'bearer' },
  anthropic: { url: 'https://api.anthropic.com/v1/models', auth: 'x-api-key' },
  mistral: { url: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  groq: { url: 'https://api.groq.com/openai/v1/models', auth: 'bearer' },
  deepseek: { url: 'https://api.deepseek.com/v1/models', auth: 'bearer' },
  together: { url: 'https://api.together.xyz/v1/models', auth: 'bearer' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/models', auth: 'query' },
};

type Status = 'idle' | 'testing' | 'ok' | 'fail';

const ACCENT: Record<ConnectorCategory, 'primary' | 'accent' | 'success' | 'info' | 'textSecondary'> = {
  ai: 'primary',
  gateway: 'info',
  business: 'accent',
  dev: 'success',
  custom: 'textSecondary',
};

export function KeysScreen() {
  const { tokens } = useTheme();
  const { vault, syncCatalog, refreshCatalog, catalogVersion } = useApp();
  void catalogVersion; // re-render when the provider registry updates
  const isMobile = useIsMobile();

  const [active, setActive] = useState<ConnectorCategory>('ai');
  const [search, setSearch] = useState('');
  const [, force] = useState(0);
  const refresh = useCallback(() => force((x) => x + 1), []);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [gatewayBaseUrls, setGatewayBaseUrls] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, Status>>({});
  const [showCustom, setShowCustom] = useState(false);
  const [showGateway, setShowGateway] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');

  // Seed the GitHub dev connector from the existing GitHub token so both stay in sync.
  useEffect(() => {
    try {
      const gh = localStorage.getItem('acode.github.token');
      if (gh && !vault.hasKey('github')) {
        vault.setKey('github', gh, { category: 'dev', label: 'GitHub', connectorType: 'Git host' });
        refresh();
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const setInput = (id: string, v: string) => setInputs((s) => ({ ...s, [id]: v }));

  const gatewayCards: KnownConnector[] = useMemo(
    () =>
      listGatewayProviders().map((d) => ({
        id: d.id,
        label: d.name,
        category: 'gateway' as ConnectorCategory,
        connectorType: 'Gateway',
        icon: '⇄',
        gateway: true,
        baseUrl: d.baseUrl,
        placeholder: d.needsKey ? 'Paste an API key' : 'No key needed',
        doc: d.website,
        needsKey: d.needsKey,
        // Seeded gateways (openrouter etc.) are not removable; runtime-added ones are.
        removable: !['openrouter'].includes(d.id) && !KNOWN_CONNECTORS.some((c) => c.id === d.id),
        description: d.description,
        isProvider: true,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogVersion],
  );

  const saveKey = (c: KnownConnector, value?: string) => {
    const v = (value ?? inputs[c.id] ?? '').trim();
    if (!v) return;
    vault.setKey(c.id, v, { category: c.category, label: c.label, connectorType: c.connectorType });
    if (c.id === 'github') {
      try {
        localStorage.setItem('acode.github.token', v);
      } catch {
        /* ignore */
      }
    }
    setInputs((s) => ({ ...s, [c.id]: '' }));
    refresh();
    setToast(`Saved ${c.label}`);
  };

  const removeKey = (c: KnownConnector) => {
    vault.removeKey(c.id);
    if (c.id === 'github') {
      try {
        localStorage.removeItem('acode.github.token');
      } catch {
        /* ignore */
      }
    }
    // Runtime-added gateway: unregister its provider + models too.
    if (c.gateway && c.removable) {
      unregisterProvider(c.id);
      persistCatalog();
      refreshCatalog();
    }
    setInputs((s) => ({ ...s, [c.id]: '' }));
    refresh();
  };

  const clearAll = () => {
    vault.clear();
    try {
      localStorage.removeItem('acode.github.token');
    } catch {
      /* ignore */
    }
    refresh();
    setConfirmClear(false);
    setToast('Cleared all connections');
  };

  const test = async (c: KnownConnector) => {
    const key = vault.getKey(c.id);
    if (!key) return;
    setTesting((s) => ({ ...s, [c.id]: 'testing' }));
    try {
      let url = TEST_ENDPOINTS[c.id]?.url;
      if (c.gateway) url = `${(c.baseUrl || getProvider(c.id)?.baseUrl || '').replace(/\/+$/, '')}/models`;
      if (!url) {
        setTesting((s) => ({ ...s, [c.id]: 'fail' }));
        return;
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
      setTesting((s) => ({ ...s, [c.id]: res.ok ? 'ok' : 'fail' }));
    } catch {
      setTesting((s) => ({ ...s, [c.id]: 'fail' }));
    }
  };

  const syncModels = async () => {
    setSyncing(true);
    const added = await syncCatalog();
    persistCatalog();
    setSyncing(false);
    refresh();
    setToast(added === -1 ? 'OpenRouter unavailable' : added > 0 ? `Synced ${added} new models` : 'Catalog is up to date');
  };

  const addGateway = (name: string, baseUrl: string, key: string) => {
    const slug = baseUrl.replace(/^https?:\/\//, '').replace(/[.\/:]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24) || 'gateway';
    const id = `gw-${slug}`;
    const def: ProviderDef = { id, name: name || slug, baseUrl: baseUrl.replace(/\/+$/, ''), kind: 'gateway', auth: 'bearer', gateway: true, needsKey: !!key, website: baseUrl, description: 'Custom OpenAI-compatible gateway.' };
    registerProvider(def);
    if (key) {
      vault.setKey(id, key, { category: 'gateway', label: def.name, connectorType: 'Gateway' });
      // Refresh this gateway's models from its /models endpoint so it appears in Chat.
      void syncGatewayModels(id, baseUrl, key);
    }
    persistCatalog();
    refreshCatalog();
    setShowGateway(false);
    setInputs((s) => ({ ...s, ['gw-key']: '', ['gw-name']: '', ['gw-base']: '' }));
    refresh();
    setToast(`Added gateway ${def.name}`);
  };

  const updateGatewayBaseUrl = (id: string, baseUrl: string) => {
    const def = getProvider(id);
    if (!def) return;
    registerProvider({ ...def, baseUrl });
    persistCatalog();
    refreshCatalog();
  };

  const allEntries = vault.allEntries();
  const countFor = (cat: ConnectorCategory) => {
    if (cat === 'custom') return allEntries.filter(([id]) => !findConnector(id) && !listGatewayProviders().some((g) => g.id === id)).length;
    if (cat === 'gateway') return listGatewayProviders().filter((g) => vault.hasKey(g.id)).length;
    return allEntries.filter(([id, e]) => e.category === cat).length;
  };

  const customList: KnownConnector[] = useMemo(
    () =>
      allEntries
        .filter(([id, e]) => e.category === 'custom' || (!findConnector(id) && !listGatewayProviders().some((g) => g.id === id) && e.category !== 'ai' && e.category !== 'gateway'))
        .map(([id, e]) => ({
          id,
          label: e.label || id,
          category: 'custom' as ConnectorCategory,
          connectorType: e.connectorType,
          placeholder: e.label ? 'Paste a new key' : '…',
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntries.length, catalogVersion],
  );

  const queried = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const known = KNOWN_CONNECTORS.concat(gatewayCards, customList).filter(
      (c) => c.label.toLowerCase().includes(q) || (c.connectorType ?? '').toLowerCase().includes(q),
    );
    return known;
  }, [search, gatewayCards, customList]);

  const list = queried ?? (active === 'custom' ? customList : active === 'gateway' ? gatewayCards : connectorsFor(active));

  return (
    <Page maxWidth={1240}>
      <PageHeader
        title="Connections"
        subtitle="One vault for every trusted credential — AI keys, gateway keys, SaaS tokens and dev secrets. Encrypted in local storage."
        actions={
          <div style={{ display: 'flex', gap: tokens.space2, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setShowGateway(true)}>+ Gateway</Button>
            <Button variant="secondary" onClick={() => setShowCustom(true)}>+ Custom</Button>
            <Button variant="ghost" onClick={() => setConfirmClear(true)}>Clear all</Button>
          </div>
        }
      />

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: tokens.space3, marginBottom: tokens.space5 }}>
        <SummaryStat label="Connectors stored" value={String(allEntries.length)} accent={tokens.primary} icon="🔐" />
        <SummaryStat label="AI providers" value={String(countFor('ai'))} accent={tokens.primary} icon="🧠" />
        <SummaryStat label="Gateways" value={String(listGatewayProviders().length)} accent={tokens.info} icon="⇄" />
        <SummaryStat label="Business apps" value={String(countFor('business'))} accent={tokens.accent} icon="🏢" />
        <SummaryStat label="Dev & DevOps" value={String(countFor('dev'))} accent={tokens.success} icon="🛠" />
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: tokens.space1, marginBottom: tokens.space4, overflowX: 'auto', paddingBottom: 2, flexWrap: 'nowrap' }}>
        {CONNECTOR_CATEGORIES.map((cat) => {
          const isActive = !search && active === cat.id;
          const bg = tokens[ACCENT[cat.id]];
          return (
            <button
              key={cat.id}
              onClick={() => { setActive(cat.id); setSearch(''); }}
              style={{
                padding: `${tokens.space2}px ${tokens.space3}px`,
                borderRadius: tokens.radiusFull,
                border: `1px solid ${isActive ? bg : tokens.borderStrong}`,
                background: isActive ? `${bg}1a` : tokens.surface,
                color: isActive ? bg : tokens.textSecondary,
                fontWeight: 600,
                fontSize: tokens.fontSizeSm,
                fontFamily: tokens.fontSans,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: tokens.space2,
                whiteSpace: 'nowrap',
              }}
            >
              {cat.label}
              <span style={{ background: isActive ? bg : tokens.surfaceHover, color: isActive ? '#fff' : tokens.textMuted, borderRadius: tokens.radiusFull, padding: '0 7px', fontSize: tokens.fontSizeXs }}>
                {countFor(cat.id)}
              </span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <Input value={search} onChange={setSearch} placeholder="Search connectors…" />
      </div>

      {queried && (
        <div style={{ marginBottom: tokens.space3, fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>
          {queried.length} result{queried.length === 1 ? '' : 's'} for “{search}”
        </div>
      )}

      {/* Section heading */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: tokens.space3, flexWrap: 'wrap', gap: tokens.space2 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>{categoryMeta(active).label}</div>
          <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>{categoryMeta(active).description}</div>
        </div>
        <div style={{ display: 'flex', gap: tokens.space2 }}>
          {active === 'gateway' && (
            <Button size="sm" variant="secondary" onClick={() => setShowGateway(true)}>+ Add gateway</Button>
          )}
          {active === 'gateway' && (
            <Button size="sm" variant="ghost" onClick={() => void syncModels()} disabled={syncing}>
              {syncing ? <Spinner size={14} /> : '⇄ Sync models from OpenRouter'}
            </Button>
          )}
          {active === 'custom' && (
            <Button size="sm" variant="secondary" onClick={() => setShowCustom(true)}>+ Add connector</Button>
          )}
        </div>
      </div>

      {/* Connector grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: tokens.space3 }}>
        {list.map((c) => (
          <ConnectorCard
            key={c.id}
            c={c}
            storedKey={vault.getKey(c.id)}
            inputValue={inputs[c.id] ?? ''}
            onInput={(v) => setInput(c.id, v)}
            baseUrlValue={gatewayBaseUrls[c.id] ?? c.baseUrl ?? ''}
            onBaseUrlChange={(v) => { setGatewayBaseUrls((s) => ({ ...s, [c.id]: v })); updateGatewayBaseUrl(c.id, v); }}
            revealed={!!revealed[c.id]}
            toggleReveal={() => setRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))}
            status={testing[c.id] ?? 'idle'}
            onSave={() => saveKey(c)}
            onRemove={() => removeKey(c)}
            onTest={() => void test(c)}
          />
        ))}

        {list.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: tokens.space8, border: `1px dashed ${tokens.borderStrong}`, borderRadius: tokens.radiusLg, textAlign: 'center', color: tokens.textMuted }}>
            {search
              ? 'No connectors match your search.'
              : active === 'gateway'
                ? 'No gateways found. Add one to load models from any OpenAI-compatible provider.'
                : active === 'custom'
                  ? 'No custom connectors yet. Add one to connect any service.'
                  : 'Nothing configured yet in this category.'}
          </div>
        )}
      </div>

      <GatewayModal open={showGateway} onClose={() => setShowGateway(false)} onSave={(name, baseUrl, key) => addGateway(name, baseUrl, key)} inputs={inputs} setInput={setInput} />
      <CustomModal open={showCustom} onClose={() => setShowCustom(false)} onSave={(label, connectorType) => {
        const id = 'custom-' + Date.now();
        const v = inputs['custom-new'] ?? '';
        vault.setKey(id, v, { category: 'custom', label, connectorType: connectorType || 'Custom' });
        setInputs((s) => ({ ...s, ['custom-new']: '' }));
        setShowCustom(false);
        refresh();
        setToast(`Added ${label}`);
      }} inputs={inputs} setInput={setInput} />

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear all connections?">
        <p style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm, lineHeight: 1.6, marginTop: 0 }}>
          This permanently removes <strong style={{ color: tokens.text }}>{allEntries.length}</strong> stored
          credential{allEntries.length === 1 ? '' : 's'} and the GitHub token. This cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space2, marginTop: tokens.space4 }}>
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
          <Button variant="danger" onClick={clearAll}>Clear everything</Button>
        </div>
      </Modal>

      {toast && (
        <div className="rise" style={{ position: 'fixed', bottom: tokens.space5, left: '50%', transform: 'translateX(-50%)', background: tokens.surface, color: tokens.text, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusFull, padding: `${tokens.space2}px ${tokens.space4}px`, boxShadow: tokens.shadowLg, zIndex: 2000, fontSize: tokens.fontSizeSm, fontWeight: 600 }}>
          {toast}
        </div>
      )}
    </Page>
  );
}

/** Fetch a gateway's OpenAI-compatible /models and register them so they appear in Chat/Agents. */
async function syncGatewayModels(gatewayId: string, baseUrl: string, apiKey: string): Promise<void> {
  try {
    const url = `${baseUrl.replace(/\/+$/, '')}/models`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;
    const data = await res.json();
    const models = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
    for (const m of models) {
      const id = String(m.id ?? '');
      if (!id) continue;
      const ctx = Number(m.context_length ?? 0) || 0;
      registerModel({ id, name: String(m.id ?? id), provider: gatewayId, contextWindow: ctx, maxOutput: Number(m.max_tokens ?? 8192) || 8192, isFree: false, tags: ['chat'] });
    }
  } catch {
    /* ignore — key may be invalid or endpoint differs */
  }
}

function SummaryStat({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: string }) {
  const { tokens } = useTheme();
  return (
    <div style={{ background: tokens.surface, border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusLg, padding: `${tokens.space3}px ${tokens.space4}px`, boxShadow: tokens.shadowSm }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, marginBottom: tokens.space2 }}>
        <span style={{ width: 28, height: 28, borderRadius: tokens.radiusMd, background: `${accent}1a`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary }}>{label}</span>
      </div>
      <div style={{ fontSize: tokens.fontSize2xl, fontWeight: 800, color: tokens.text }}>{value}</div>
    </div>
  );
}

function ConnectorCard({
  c, storedKey, inputValue, onInput, baseUrlValue, onBaseUrlChange, revealed, toggleReveal, status, onSave, onRemove, onTest,
}: {
  c: KnownConnector;
  storedKey?: string;
  inputValue: string;
  onInput: (v: string) => void;
  baseUrlValue: string;
  onBaseUrlChange: (v: string) => void;
  revealed: boolean;
  toggleReveal: () => void;
  status: Status;
  onSave: () => void;
  onRemove: () => void;
  onTest: () => void;
}) {
  const { tokens } = useTheme();
  const connected = !!storedKey;
  const accent = tokens[ACCENT[c.category]];

  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, paddingBottom: tokens.space3, borderBottom: `1px solid ${tokens.border}` }}>
        <div style={{ width: 42, height: 42, borderRadius: tokens.radiusMd, background: `${accent}1a`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {c.icon ?? '🔑'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, color: tokens.text }}>{c.label}</div>
          <div style={{ display: 'flex', gap: tokens.space1, marginTop: 3, flexWrap: 'wrap' }}>
            {c.connectorType && <Badge style={{ fontSize: 10 }} color={tokens.textSecondary}>{c.connectorType}</Badge>}
            {c.gateway && <Badge color={tokens.info}>Gateway</Badge>}
            {c.isProvider && <Badge color={tokens.primary}>AI model</Badge>}
          </div>
        </div>
        <Badge color={connected ? tokens.success : tokens.textMuted} style={{ flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? tokens.success : tokens.textMuted, display: 'inline-block' }} />
          {connected ? 'Connected' : 'Not set'}
        </Badge>
      </div>

      {/* Body */}
      <div style={{ paddingTop: tokens.space3, display: 'flex', flexDirection: 'column', gap: tokens.space2, flex: 1 }}>
        {c.gateway && (
          <Input label="Base URL" monospace value={baseUrlValue} onChange={onBaseUrlChange} placeholder="https://api.example.com/v1" />
        )}
        <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Input
              label={c.gateway ? 'API key' : undefined}
              type={revealed ? 'text' : 'password'}
              monospace
              value={storedKey && !revealed && !inputValue ? maskKey(storedKey) : inputValue}
              onChange={onInput}
              placeholder={connected ? `${maskKey(storedKey ?? '')} (saved)` : c.placeholder}
            />
          </div>
          {connected && storedKey && (
            <Button variant="ghost" size="sm" onClick={toggleReveal} style={{ whiteSpace: 'nowrap' }}>
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
          )}
        </div>

        <div style={{ display: 'flex', gap: tokens.space2, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" disabled={!inputValue} onClick={onSave}>Save key</Button>
          <Button size="sm" onClick={onTest} disabled={!connected || status === 'testing'}>
            {status === 'testing' ? <Spinner size={14} /> : 'Test'}
          </Button>
          {connected && (
            <Button variant="ghost" size="sm" onClick={onRemove}>{c.gateway && c.removable ? 'Remove' : 'Remove key'}</Button>
          )}
        </div>

        {status === 'ok' && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.success, fontWeight: 600 }}>✓ Connection verified</div>}
        {status === 'fail' && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.danger, fontWeight: 600 }}>✗ Could not verify — check the key and network</div>}

        {c.doc && (
          <div style={{ marginTop: 'auto', paddingTop: tokens.space2, fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>
            <a href={c.doc} target="_blank" rel="noreferrer" style={{ color: tokens.primary }}>Get a key →</a>
          </div>
        )}
      </div>
    </Card>
  );
}

function GatewayModal({
  open, onClose, onSave, inputs, setInput,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, baseUrl: string, key: string) => void;
  inputs: Record<string, string>;
  setInput: (id: string, v: string) => void;
}) {
  const { tokens } = useTheme();
  const name = inputs['gw-name'] ?? '';
  const baseUrl = inputs['gw-base'] ?? '';
  const key = inputs['gw-key'] ?? '';
  return (
    <Modal open={open} onClose={onClose} title="Add OpenAI-compatible gateway" width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
        <p style={{ margin: 0, color: tokens.textSecondary, fontSize: tokens.fontSizeSm, lineHeight: 1.6 }}>
          Connect any gateway that exposes an OpenAI-compatible <code>/{'{'}base{'}'}/chat/completions</code> API
          (e.g. DeepInfra, Fireworks, Cerebras, Novita, a self-hosted proxy…). Its models are added automatically.
        </p>
        <Input label="Gateway name" value={name} onChange={(v) => setInput('gw-name', v)} placeholder="e.g. My GPU Cloud" />
        <Input label="Base URL" monospace value={baseUrl} onChange={(v) => setInput('gw-base', v)} placeholder="https://api.gateway.example/v1" />
        <Input label="API key (optional)" type="password" monospace value={key} onChange={(v) => setInput('gw-key', v)} placeholder="Paste your key" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space2 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!name.trim() || !baseUrl.trim()} onClick={() => onSave(name.trim(), baseUrl.trim(), key.trim())}>Add gateway</Button>
        </div>
      </div>
    </Modal>
  );
}

function CustomModal({
  open, onClose, onSave, inputs, setInput,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (label: string, connectorType: string) => void;
  inputs: Record<string, string>;
  setInput: (id: string, v: string) => void;
}) {
  const { tokens } = useTheme();
  const label = inputs['custom-label'] ?? '';
  const connectorType = inputs['custom-type'] ?? '';
  const value = inputs['custom-new'] ?? '';
  return (
    <Modal open={open} onClose={onClose} title="Add custom connector" width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
        <Input label="Service name" value={label} onChange={(v) => setInput('custom-label', v)} placeholder="e.g. S3, Twilio, SendGrid" />
        <Input label="Type (optional)" value={connectorType} onChange={(v) => setInput('custom-type', v)} placeholder="e.g. Storage, SMS, Email" />
        <Input label="Secret / API key" type="password" monospace value={value} onChange={(v) => setInput('custom-new', v)} placeholder="Paste your key" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space2 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!label.trim() || !value.trim()} onClick={() => onSave(label.trim(), connectorType.trim())}>Add connector</Button>
        </div>
      </div>
    </Modal>
  );
}
