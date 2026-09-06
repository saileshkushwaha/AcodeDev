import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Badge, useTheme, useIsMobile, Modal, Spinner, Icon } from '@acode/ui';
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
  getProxyBase,
  setProxyBase,
  routeThroughProxy,
  upstreamFromModelsUrl,
  readGithubToken,
  writeGithubToken,
  createKeyManager,
  generateOAuthPKCEParams,
  exchangeOAuthCode,
  type OAuthProvider,
  type ConnectorCategory,
  type KnownConnector,
  type ProviderDef,
  type ManagedKey,
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
  const [fallbackRevealed, setFallbackRevealed] = useState<Record<string, boolean>>({});
  const [fallbackInputs, setFallbackInputs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, Status>>({});
  const [showCustom, setShowCustom] = useState(false);
  const [showGateway, setShowGateway] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [proxyUrl, setProxyUrlState] = useState(getProxyBase());
  const [mgmtKeyInputs, setMgmtKeyInputs] = useState<Record<string, string>>({});
  const [mgmtKeyRevealed, setMgmtKeyRevealed] = useState<Record<string, boolean>>({});
  const [rotationStatus, setRotationStatus] = useState<Record<string, Status>>({});
  const [managedKeys, setManagedKeys] = useState<Record<string, ManagedKey[]>>({});
  const [oauthPending, setOauthPending] = useState<{ provider: string; oauthProvider: OAuthProvider; codeVerifier: string; state: string; popup: Window | null } | null>(null);
  const [oauthStatus, setOauthStatus] = useState<Record<string, 'idle' | 'pending' | 'success' | 'error'>>({});
  const [showOAuthProvider, setShowOAuthProvider] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState<KnownConnector | null>(null);
  const [oauthProvider, setOauthProvider] = useState<OAuthProvider>('openrouter');
  const addCustomConnector = useCallback((label: string, connectorType: string) => {
    const id = 'custom-' + Date.now();
    const v = inputs['custom-new'] ?? '';
    vault.setKey(id, v, { category: 'custom', label, connectorType: connectorType || 'Custom' });
    setInputs((s) => ({ ...s, ['custom-new']: '' }));
    setShowCustom(false);
    refresh();
    setToast(`Added ${label}`);
  }, [vault, inputs, refresh]);

  const setProxyUrl = useCallback((v: string) => { setProxyUrlState(v); setProxyBase(v); }, []);

  // Seed the GitHub dev connector from the existing GitHub token so both stay in sync.
  useEffect(() => {
    const gh = readGithubToken();
    if (gh && !vault.hasKey('github')) {
      vault.setKey('github', gh, { category: 'dev', label: 'GitHub', connectorType: 'Git host' });
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const setInput = useCallback((id: string, v: string) => setInputs((s) => ({ ...s, [id]: v })), []);

  const cachedGatewayProviders = useMemo(() => listGatewayProviders(), [catalogVersion]);

  const gatewayCards: KnownConnector[] = useMemo(
    () =>
      cachedGatewayProviders.map((d) => ({
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
        // Only runtime-added gateways (custom `gw-*`) are removable; seeds stay.
        removable: d.id.startsWith('gw-'),
        description: d.description,
        isProvider: true,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogVersion, cachedGatewayProviders],
  );

  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  const saveKey = useCallback((c: KnownConnector, value?: string) => {
    const v = (value ?? inputsRef.current[c.id] ?? '').trim();
    if (!v) return;
    vault.setKey(c.id, v, { category: c.category, label: c.label, connectorType: c.connectorType });
    if (c.id === 'github') {
      writeGithubToken(v);
    }
    setInputs((s) => ({ ...s, [c.id]: '' }));
    refresh();
    setToast(`Saved ${c.label}`);
  }, [vault, refresh]);

  const removeKey = useCallback((c: KnownConnector) => {
    vault.removeKey(c.id);
    vault.removeManagementKey(c.id);
    if (c.id === 'github') {
      writeGithubToken('');
    }
    if (c.gateway && c.removable) {
      unregisterProvider(c.id);
      persistCatalog();
      refreshCatalog();
    }
    setInputs((s) => ({ ...s, [c.id]: '' }));
    refresh();
  }, [vault, refresh, refreshCatalog]);

  const addFallbackKey = useCallback((c: KnownConnector, value: string) => {
    if (!value) return;
    vault.addKey(c.id, value);
    refresh();
    setToast(`Added fallback key for ${c.label}`);
  }, [vault, refresh]);

  const removeFallbackKey = useCallback((c: KnownConnector, index: number) => {
    vault.removeKeyAt(c.id, index);
    refresh();
    setToast(`Removed fallback key for ${c.label}`);
  }, [vault, refresh]);

  const saveManagementKey = useCallback((c: KnownConnector) => {
    const v = (mgmtKeyInputs[c.id] ?? '').trim();
    if (!v) {
      vault.removeManagementKey(c.id);
      setToast(`Removed management key for ${c.label}`);
    } else {
      vault.setManagementKey(c.id, v);
      setToast(`Saved management key for ${c.label}`);
    }
    setMgmtKeyInputs((s) => ({ ...s, [c.id]: '' }));
    refresh();
  }, [vault, mgmtKeyInputs, refresh]);

  const testManagementKey = useCallback(async (c: KnownConnector) => {
    const mgmtKey = vault.getManagementKey(c.id);
    if (!mgmtKey) return;
    setRotationStatus((s) => ({ ...s, [c.id]: 'testing' }));
    try {
      const manager = createKeyManager(c.id, mgmtKey);
      if (!manager) {
        setRotationStatus((s) => ({ ...s, [c.id]: 'fail' }));
        return;
      }
      const keys = await manager.list();
      setManagedKeys((s) => ({ ...s, [c.id]: keys }));
      setRotationStatus((s) => ({ ...s, [c.id]: 'ok' }));
    } catch {
      setRotationStatus((s) => ({ ...s, [c.id]: 'fail' }));
    }
  }, [vault]);

  const rotateApiKey = useCallback(async (c: KnownConnector) => {
    const mgmtKey = vault.getManagementKey(c.id);
    if (!mgmtKey) {
      setToast('Save a management key first');
      return;
    }
    const manager = createKeyManager(c.id, mgmtKey);
    if (!manager) {
      setToast(`${c.label} does not support key rotation`);
      return;
    }
    setRotationStatus((s) => ({ ...s, [c.id]: 'testing' }));
    try {
      const existing = await manager.list();
      const { key, value } = await manager.createWithSecret({
        name: `${c.label}-auto-${Date.now()}`,
      });
      if (!value) throw new Error('Key value not returned');

      // Replace primary key, move old to fallback
      const existingEntry = vault.getEntry(c.id);
      if (existingEntry) {
        const oldKeys = existingEntry.keys ?? [];
        oldKeys.push({
          value: existingEntry.value,
          createdAt: existingEntry.createdAt,
          updatedAt: existingEntry.updatedAt,
        });
        vault.setEntry(c.id, {
          ...existingEntry,
          value,
          updatedAt: Date.now(),
          keys: oldKeys.slice(-3),
        });
      } else {
        vault.setKey(c.id, value, { category: c.category, label: c.label, connectorType: c.connectorType });
      }

      // Clean up old managed keys (keep 5 most recent)
      const keysToKeep = [...existing].sort((a, b) => b.created - a.created).slice(0, 4);
      for (const oldKey of existing) {
        if (!keysToKeep.some(k => k.id === oldKey.id)) {
          try { await manager.delete(oldKey.id); } catch { /* ignore */ }
        }
      }

      setManagedKeys((s) => ({ ...s, [c.id]: [...existing.slice(0, 4), key] }));
      setRotationStatus((s) => ({ ...s, [c.id]: 'ok' }));
      refresh();
      setToast(`Rotated ${c.label} API key ✓`);
    } catch (e) {
      setRotationStatus((s) => ({ ...s, [c.id]: 'fail' }));
      setToast(`Rotation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [vault, refresh]);

  const clearAll = useCallback(() => {
    vault.clear();
    writeGithubToken('');
    refresh();
    setConfirmClear(false);
    setToast('Cleared all connections');
  }, [vault, refresh]);

  const test = useCallback(async (c: KnownConnector) => {
    const key = vault.getKey(c.id);
    if (!key) return;
    setTesting((s) => ({ ...s, [c.id]: 'testing' }));
    try {
      let url = TEST_ENDPOINTS[c.id]?.url;
      let headers: Record<string, string> = { Authorization: `Bearer ${key}` };
      if (c.gateway) {
        const realBase = (c.baseUrl || getProvider(c.id)?.baseUrl || '').replace(/\/+$/, '');
        const realModels = `${realBase}/models`;
        const proxy = routeThroughProxy(realModels, headers, upstreamFromModelsUrl(realModels));
        url = proxy.url;
        headers = proxy.headers;
      }
      if (!url) {
        setTesting((s) => ({ ...s, [c.id]: 'fail' }));
        return;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(9000) });
      setTesting((s) => ({ ...s, [c.id]: res.ok ? 'ok' : 'fail' }));
    } catch {
      setTesting((s) => ({ ...s, [c.id]: 'fail' }));
    }
  }, [vault]);

  // --- OAuth Account Management ---

  const handleOAuthCallback = useCallback(async (code: string, state: string, provider: string, codeVerifier: string) => {
    // Verify state matches
    if (oauthPending?.provider !== provider || oauthPending?.state !== state) {
      setOauthStatus((s) => ({ ...s, [provider]: 'error' }));
      setToast('OAuth state mismatch');
      return;
    }

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const tokenData = await exchangeOAuthCode(code, codeVerifier, redirectUri, oauthPending.oauthProvider);

      // Store the account
      const apiKey = tokenData.access_token;
      const accountId = `oauth_${Date.now()}`;
      vault.setAccount(provider, accountId, apiKey, {
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
        label: `${provider} OAuth (${accountId.slice(0, 8)})`,
      });

      setOauthStatus((s) => ({ ...s, [provider]: 'success' }));
      refresh();
      setToast(`Account added ✓`);

      if (oauthPending?.popup) {
        oauthPending.popup.close();
      }
    } catch (e) {
      setOauthStatus((s) => ({ ...s, [provider]: 'error' }));
      setToast(`OAuth failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOauthPending(null);
      setTimeout(() => setOauthStatus((s) => ({ ...s, [provider]: 'idle' })), 3000);
    }
  }, [oauthPending, vault, refresh]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our own origin
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      console.log('[Keys] received message:', data.type);
      if (data.type === 'oauth-callback' && oauthPending) {
        console.log('[Keys] OAuth callback received');
        void handleOAuthCallback(data.code, data.state, data.provider, oauthPending.codeVerifier);
      } else if (data.type === 'oauth-error' && oauthPending) {
        setOauthStatus((s) => ({ ...s, [oauthPending.provider]: 'error' }));
        setToast(`OAuth error: ${data.error_description || data.error}`);
        setOauthPending(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [oauthPending, handleOAuthCallback]);

  const startOAuth = useCallback((c: KnownConnector) => {
    if (!c.isProvider && !c.gateway) return;

    setSelectedConnector(c);
    setShowOAuthProvider(true);
  }, []);

  const startOAuthWithProvider = useCallback(async (c: KnownConnector, provider: OAuthProvider) => {
    setShowOAuthProvider(false);
    setSelectedConnector(null);

    setOauthStatus((s) => ({ ...s, [c.id]: 'pending' }));

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      const { url, codeVerifier, state } = await generateOAuthPKCEParams(redirectUri, provider);

      console.log('[Keys] OAuth URL:', url);

      const isSmallScreen = window.innerWidth < 600;
      const width = isSmallScreen ? Math.max(320, window.innerWidth - 20) : 600;
      const height = isSmallScreen ? Math.max(500, window.innerHeight - 40) : 700;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;

      const popup = window.open(
        url,
        'oauth',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      console.log('[Keys] popup opened:', !!popup);

      if (!popup) {
        setOauthStatus((s) => ({ ...s, [c.id]: 'error' }));
        setToast('Could not open OAuth popup. Please disable popup blocker.');
        return;
      }

      setOauthPending({ provider: c.id, oauthProvider: provider, codeVerifier, state, popup });

      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          if (oauthPending) {
            setOauthStatus((s) => ({ ...s, [c.id]: 'idle' }));
            setOauthPending(null);
          }
        }
      }, 1000);
    } catch (e) {
      setOauthStatus((s) => ({ ...s, [c.id]: 'error' }));
      setToast(`OAuth failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [oauthPending]);

  const removeAccount = useCallback((provider: string, accountId: string, label: string) => {
    vault.removeAccount(provider, accountId);
    refresh();
    setToast(`Removed account: ${label}`);
  }, [vault, refresh]);

  const syncModels = useCallback(async () => {
    setSyncing(true);
    const added = await syncCatalog();
    persistCatalog();
    setSyncing(false);
    refresh();
    setToast(added === -1 ? 'Gateways unavailable' : added > 0 ? `Synced ${added} new models` : 'Catalog is up to date');
  }, [refresh]);

  const addGateway = useCallback((name: string, baseUrl: string, key: string) => {
    const slug = baseUrl.replace(/^https?:\/\//, '').replace(/[.\/:]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 24) || 'gateway';
    const id = `gw-${slug}`;
    const def: ProviderDef = { id, name: name || slug, baseUrl: baseUrl.replace(/\/+$/, ''), kind: 'gateway', auth: 'bearer', gateway: true, needsKey: !!key, website: baseUrl, description: 'Custom OpenAI-compatible gateway.' };
    registerProvider(def);
    if (key) {
      vault.setKey(id, key, { category: 'gateway', label: def.name, connectorType: 'Gateway' });
      void syncGatewayModels(id, baseUrl, key);
    }
    persistCatalog();
    refreshCatalog();
    setShowGateway(false);
    setInputs((s) => ({ ...s, ['gw-key']: '', ['gw-name']: '', ['gw-base']: '' }));
    refresh();
    setToast(`Added gateway ${def.name}`);
  }, [vault, refresh]);

  const updateGatewayBaseUrl = useCallback((id: string, baseUrl: string) => {
    const def = getProvider(id);
    if (!def) return;
    registerProvider({ ...def, baseUrl });
    persistCatalog();
    refreshCatalog();
  }, []);

  const allEntries = vault.allEntries();

  const countForAi = useMemo(() => allEntries.filter(([id, e]) => e.category === 'ai').length, [allEntries]);
  const countForGateway = useMemo(() => cachedGatewayProviders.filter((g) => vault.hasKey(g.id)).length, [cachedGatewayProviders, vault]);
  const countForBusiness = useMemo(() => allEntries.filter(([id, e]) => e.category === 'business').length, [allEntries]);
  const countForDev = useMemo(() => allEntries.filter(([id, e]) => e.category === 'dev').length, [allEntries]);
  const countForCustom = useMemo(() => allEntries.filter(([id]) => !findConnector(id) && !cachedGatewayProviders.some((g) => g.id === id)).length, [allEntries, cachedGatewayProviders]);

  const countFor = useCallback((cat: ConnectorCategory) => {
    if (cat === 'custom') return countForCustom;
    if (cat === 'gateway') return countForGateway;
    if (cat === 'ai') return countForAi;
    if (cat === 'business') return countForBusiness;
    if (cat === 'dev') return countForDev;
    return 0;
  }, [countForAi, countForGateway, countForBusiness, countForDev, countForCustom]);

  const customList: KnownConnector[] = useMemo(
    () =>
      allEntries
        .filter(([id, e]) => e.category === 'custom' || (!findConnector(id) && !cachedGatewayProviders.some((g) => g.id === id) && e.category !== 'ai' && e.category !== 'gateway'))
        .map(([id, e]) => ({
          id,
          label: e.label || id,
          category: 'custom' as ConnectorCategory,
          connectorType: e.connectorType,
          placeholder: e.label ? 'Paste a new key' : '…',
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allEntries.length, catalogVersion, cachedGatewayProviders],
  );

  const queried = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const known = KNOWN_CONNECTORS.concat(gatewayCards, customList).filter(
      (c) => c.label.toLowerCase().includes(q) || (c.connectorType ?? '').toLowerCase().includes(q),
    );
    return known;
  }, [search, gatewayCards, customList]);

  const activeConnectors = useMemo(() => connectorsFor(active), [active]);
  const activeCategoryMeta = useMemo(() => categoryMeta(active), [active]);
  const list = queried ?? (active === 'custom' ? customList : active === 'gateway' ? gatewayCards : activeConnectors);

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
        <SummaryStat label="Connectors stored" value={String(allEntries.length)} accent={tokens.primary} icon={<Icon name="lock" size={14} />} />
        <SummaryStat label="AI providers" value={String(countFor('ai'))} accent={tokens.primary} icon={<Icon name="bot" size={14} />} />
        <SummaryStat label="Gateways" value={String(cachedGatewayProviders.length)} accent={tokens.info} icon={<Icon name="repeat" size={14} />} />
        <SummaryStat label="Business apps" value={String(countFor('business'))} accent={tokens.accent} icon={<Icon name="briefcase" size={14} />} />
        <SummaryStat label="Dev & DevOps" value={String(countFor('dev'))} accent={tokens.success} icon={<Icon name="wrench" size={14} />} />
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
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>{activeCategoryMeta.label}</div>
          <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>{activeCategoryMeta.description}</div>
        </div>
        <div style={{ display: 'flex', gap: tokens.space2 }}>
          {active === 'gateway' && (
            <Button size="sm" variant="secondary" onClick={() => setShowGateway(true)}>+ Add gateway</Button>
          )}
          {active === 'gateway' && (
            <Button size="sm" variant="ghost" onClick={() => void syncModels()} disabled={syncing}>
              {syncing ? <Spinner size={14} /> : <><Icon name="repeat" size={14} /> Sync free models from gateways</>}
            </Button>
          )}
          {active === 'custom' && (
            <Button size="sm" variant="secondary" onClick={() => setShowCustom(true)}>+ Add connector</Button>
          )}
        </div>
      </div>

      {/* Connector grid */}
      {active === 'gateway' && (
        <Card style={{ marginBottom: tokens.space3, padding: tokens.space3 }}>
          <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: tokens.space2 }}>
            LOCAL PROXY (optional — needed for gateways without CORS headers)
          </div>
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary, marginBottom: tokens.space3, lineHeight: 1.5 }}>
            Some gateways (OpenCode Zen, Kilo) block direct browser calls. Run <code>node proxy.mjs</code> in the repo root, then set the URL below.
          </div>
          <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <Input
                label="Gateway proxy URL"
                monospace
                value={proxyUrl}
                onChange={setProxyUrl}
                placeholder="http://localhost:8787"
              />
            </div>
          </div>
          {proxyUrl && (
            <div style={{ marginTop: tokens.space2, fontSize: tokens.fontSizeXs, color: tokens.success, fontWeight: 600 }}>
              ✓ Proxy configured — gateway calls route through {proxyUrl}
            </div>
          )}
        </Card>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: tokens.space3 }}>
        {list.map((c) => {
          const entry = vault.getEntry(c.id);
          const fallbackKeys = entry?.keys ?? [];
          return (
          <ConnectorCard
            key={c.id}
            c={c}
            storedKey={vault.getKey(c.id)}
            fallbackKeys={fallbackKeys}
            inputValue={inputs[c.id] ?? ''}
            onInput={(v) => setInput(c.id, v)}
            onAddFallback={(v) => addFallbackKey(c, v)}
            onRemoveFallback={(idx) => removeFallbackKey(c, idx)}
            baseUrlValue={gatewayBaseUrls[c.id] ?? c.baseUrl ?? ''}
            onBaseUrlChange={(v) => { setGatewayBaseUrls((s) => ({ ...s, [c.id]: v })); updateGatewayBaseUrl(c.id, v); }}
            revealed={!!revealed[c.id]}
            toggleReveal={() => setRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))}
            fallbackRevealed={!!fallbackRevealed[c.id]}
            toggleFallbackReveal={() => setFallbackRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))}
            fallbackInput={fallbackInputs[c.id] ?? ''}
            onFallbackInput={(v) => setFallbackInputs((s) => ({ ...s, [c.id]: v }))}
            status={testing[c.id] ?? 'idle'}
            onSave={() => saveKey(c)}
            onRemove={() => removeKey(c)}
            onTest={() => void test(c)}
            managementKey={vault.getManagementKey(c.id)}
            mgmtRevealed={!!mgmtKeyRevealed[c.id]}
            toggleMgmtReveal={() => setMgmtKeyRevealed((s) => ({ ...s, [c.id]: !s[c.id] }))}
            mgmtInput={mgmtKeyInputs[c.id] ?? ''}
            onMgmtInput={(v) => setMgmtKeyInputs((s) => ({ ...s, [c.id]: v }))}
            onSaveMgmt={() => { saveManagementKey(c); }}
            onTestMgmt={() => { setMgmtKeyInputs((s) => ({ ...s, [c.id]: '' })); void testManagementKey(c); }}
            onRotate={() => void rotateApiKey(c)}
            rotationStatus={rotationStatus[c.id] ?? 'idle'}
            managedKeys={managedKeys[c.id]}
            oauthStatus={oauthStatus[c.id] ?? 'idle'}
            onOAuth={() => startOAuth(c)}
            accounts={vault.getAccounts(c.id)}
            onRemoveAccount={(accountId, label) => removeAccount(c.id, accountId, label)}
          />
          );
        })}

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
      <CustomModal open={showCustom} onClose={() => setShowCustom(false)} onSave={addCustomConnector} inputs={inputs} setInput={setInput} />

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

      <Modal open={showOAuthProvider} onClose={() => setShowOAuthProvider(false)} title="Select OAuth Provider">
        <p style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm, marginBottom: tokens.space3 }}>
          Choose your OAuth provider to authenticate with <strong>{selectedConnector?.label || 'this service'}</strong>.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2, marginBottom: tokens.space4 }}>
          <button
            onClick={() => { setOauthProvider('openrouter'); selectedConnector && startOAuthWithProvider(selectedConnector, 'openrouter'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: tokens.space2, padding: tokens.space3,
              background: tokens.surfaceHover,
              border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'inline-flex' }}><Icon name="key" size={18} /></span>
            <span>OpenRouter</span>
          </button>
          <button
            onClick={() => { setOauthProvider('google'); selectedConnector && startOAuthWithProvider(selectedConnector, 'google'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: tokens.space2, padding: tokens.space3,
              background: tokens.surfaceHover,
              border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 20 }}>📧</span>
            <span>Google / Gmail</span>
          </button>
          <button
            onClick={() => { setOauthProvider('github'); selectedConnector && startOAuthWithProvider(selectedConnector, 'github'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: tokens.space2, padding: tokens.space3,
              background: tokens.surfaceHover,
              border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 20 }}>🐙</span>
            <span>GitHub</span>
          </button>
          <button
            onClick={() => { setOauthProvider('microsoft'); selectedConnector && startOAuthWithProvider(selectedConnector, 'microsoft'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: tokens.space2, padding: tokens.space3,
              background: tokens.surfaceHover,
              border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 20 }}>🔷</span>
            <span>Microsoft</span>
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space2 }}>
          <Button variant="ghost" onClick={() => setShowOAuthProvider(false)}>Cancel</Button>
        </div>
      </Modal>
    </Page>
  );
}

/** Fetch a gateway's OpenAI-compatible /models and register them so they appear in Chat/Agents. */
async function syncGatewayModels(gatewayId: string, baseUrl: string, apiKey: string): Promise<void> {
  try {
    const realBase = `${baseUrl.replace(/\/+$/, '')}`;
    const realModels = `${realBase}/models`;
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    // CORS-blocked gateways (OpenCode Zen, Kilo, custom) must go through the local relay.
    const proxy = routeThroughProxy(realModels, headers, upstreamFromModelsUrl(realModels));
    const res = await fetch(proxy.url, { headers: proxy.headers, signal: AbortSignal.timeout(12000) });
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

const SummaryStat = React.memo(function SummaryStat({ label, value, accent, icon }: { label: string; value: string; accent: string; icon: React.ReactNode }) {
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
});

const ConnectorCard = React.memo(function ConnectorCard({
  c, storedKey, fallbackKeys = [], inputValue, onInput, onAddFallback, onRemoveFallback, baseUrlValue, onBaseUrlChange, revealed, toggleReveal, fallbackRevealed, toggleFallbackReveal, fallbackInput, onFallbackInput, status, onSave, onRemove, onTest, managementKey, mgmtRevealed, toggleMgmtReveal, mgmtInput, onMgmtInput, onSaveMgmt, onTestMgmt, onRotate, rotationStatus, managedKeys, oauthStatus, onOAuth, accounts, onRemoveAccount,
}: {
  c: KnownConnector;
  storedKey?: string;
  fallbackKeys?: Array<{ value: string; createdAt: number; updatedAt: number; label?: string }>;
  inputValue: string;
  onInput: (v: string) => void;
  onAddFallback: (value: string, label?: string) => void;
  onRemoveFallback: (index: number) => void;
  baseUrlValue: string;
  onBaseUrlChange: (v: string) => void;
  revealed: boolean;
  toggleReveal: () => void;
  fallbackRevealed: boolean;
  toggleFallbackReveal: () => void;
  fallbackInput: string;
  onFallbackInput: (v: string) => void;
  status: Status;
  onSave: () => void;
  onRemove: () => void;
  onTest: () => void;
  managementKey?: string;
  mgmtRevealed: boolean;
  toggleMgmtReveal: () => void;
  mgmtInput: string;
  onMgmtInput: (v: string) => void;
  onSaveMgmt: () => void;
  onTestMgmt: () => void;
  onRotate: () => void;
  rotationStatus: Status;
  managedKeys?: ManagedKey[];
  oauthStatus: 'idle' | 'pending' | 'success' | 'error';
  onOAuth: () => void;
  accounts?: Array<{ accountId: string; apiKey: string; label: string; refreshToken?: string; expiresAt?: number }>;
  onRemoveAccount: (accountId: string, label: string) => void;
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

        {/* OAuth Account Management (OpenRouter) */}
        {c.id === 'openrouter' && (
          <div style={{ marginTop: tokens.space2, paddingTop: tokens.space2, borderTop: `1px solid ${tokens.border}` }}>
            <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: tokens.space2 }}>
              OAuth Accounts
            </div>
            {(accounts?.length ?? 0) > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
                {accounts?.map((acct) => (
                  <div key={acct.accountId} style={{ display: 'flex', alignItems: 'center', gap: tokens.space1, padding: tokens.space1, background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600, color: tokens.text }}>{acct.label}</div>
                      <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {maskKey(acct.apiKey)}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onRemoveAccount(acct.accountId, acct.label)} title="Remove account" style={{ color: tokens.danger, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={12} /></Button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary, marginBottom: tokens.space2 }}>
                Add multiple OpenRouter accounts via OAuth. Each account's keys are managed independently.
              </div>
            )}
            <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center' }}>
              <Button variant="secondary" size="sm" onClick={onOAuth} disabled={oauthStatus === 'pending'}>
                {oauthStatus === 'pending' ? <Spinner size={14} /> : 'Add account (OAuth)'}
              </Button>
              {oauthStatus === 'success' && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.success }}>✓ Account added</span>}
              {oauthStatus === 'error' && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.danger }}>✗ OAuth failed</span>}
            </div>
          </div>
        )}

        {/* API Key Rotation section (OpenRouter only) */}
        {c.id === 'openrouter' && (
          <div style={{ marginTop: tokens.space2, paddingTop: tokens.space2, borderTop: `1px solid ${tokens.border}` }}>
            <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: tokens.space2 }}>Automatic key rotation</div>
            {!managementKey ? (
              <div>
                <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary, marginBottom: tokens.space2 }}>
                  Add an OpenRouter API management key to enable automatic key rotation. The key will be used to create and revoke API keys automatically when your primary key fails.
                </div>
                <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      label="Management key"
                      type={mgmtRevealed ? 'text' : 'password'}
                      monospace
                      value={mgmtInput}
                      onChange={onMgmtInput}
                      placeholder="sk-or-v1-..."
                    />
                  </div>
                  {managementKey && (
                    <Button variant="ghost" size="sm" onClick={toggleMgmtReveal} style={{ whiteSpace: 'nowrap' }}>
                      {mgmtRevealed ? 'Hide' : 'Reveal'}
                    </Button>
                  )}
                </div>
                <Button variant="secondary" size="sm" style={{ marginTop: tokens.space2 }} disabled={!mgmtInput.trim()} onClick={onSaveMgmt}>Save management key</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
                <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary }}>
                  Management key configured. Click below to rotate your API key.
                </div>
                <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center' }}>
                  <Button variant="secondary" size="sm" onClick={onRotate} disabled={rotationStatus === 'testing'}>
                    {rotationStatus === 'testing' ? <Spinner size={14} /> : 'Rotate key'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onTestMgmt} disabled={rotationStatus === 'testing'}>
                    Refresh key list
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { onMgmtInput(''); onSaveMgmt(); }} style={{ color: tokens.danger, fontSize: 11 }}>Remove management key</Button>
                </div>
                {rotationStatus === 'ok' && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.success, fontWeight: 600 }}>✓ Key rotated successfully</div>}
                {rotationStatus === 'fail' && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.danger, fontWeight: 600 }}>✗ Rotation failed</div>}
                {managedKeys && managedKeys.length > 0 && (
                  <div style={{ marginTop: tokens.space1 }}>
                    <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginBottom: tokens.space1 }}>Managed keys ({managedKeys.length}):</div>
                    {managedKeys.map((mk) => (
                      <div key={mk.id} style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary, padding: `${tokens.space1}px 0`, borderBottom: `1px solid ${tokens.border}` }}>
                        <div style={{ fontWeight: 600 }}>{mk.name}</div>
                        <div style={{ display: 'flex', gap: tokens.space2, marginTop: 2 }}>
                          <span style={{ color: tokens.textMuted }}>Created: {new Date(mk.created * 1000).toLocaleDateString()}</span>
                          {mk.usage !== undefined && <span style={{ color: tokens.textMuted }}>Usage: {mk.usage}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fallback keys section */}
        {connected && (
          <div style={{ marginTop: tokens.space2, paddingTop: tokens.space2, borderTop: `1px solid ${tokens.border}` }}>
            <div style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textMuted, marginBottom: tokens.space2 }}>Fallback keys ({fallbackKeys.length})</div>
            {fallbackKeys.map((fk, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: tokens.space1, marginBottom: tokens.space1 }}>
                <div style={{ flex: 1, padding: `${tokens.space2}px ${tokens.space3}px`, background: tokens.surface, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusMd, fontFamily: tokens.fontMono, fontSize: tokens.fontSizeSm, color: tokens.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fk.value}>
                  {maskKey(fk.value)}
                </div>
                <Button variant="ghost" size="sm" onClick={toggleFallbackReveal} style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                  {fallbackRevealed ? 'Hide' : 'Show'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onRemoveFallback(idx)} title="Remove fallback" style={{ color: tokens.danger, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={12} /></Button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: tokens.space2, marginTop: tokens.space2, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <Input
                  label="New fallback key"
                  type="password"
                  monospace
                  value={fallbackInput}
                  onChange={onFallbackInput}
                  placeholder="Paste a backup API key"
                />
              </div>
              <Button variant="secondary" size="sm" disabled={!fallbackInput.trim()} onClick={() => { onAddFallback(fallbackInput.trim()); onFallbackInput(''); }}>Add</Button>
            </div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: tokens.space1 }}>
              Fallback keys are tried automatically if the primary key fails.
            </div>
          </div>
        )}

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
});

const GatewayModal = React.memo(function GatewayModal({
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
});

const CustomModal = React.memo(function CustomModal({
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
});
