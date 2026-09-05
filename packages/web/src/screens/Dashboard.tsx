import { useEffect, useState, useMemo, useCallback } from 'react';
import React from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Badge, useTheme, Spinner } from '@acode/ui';
import { listModels, getFreeModels, listProviders, getProvider, type ProviderId } from '@acode/core';

export function Dashboard({ onNavigate, onOpenEvaluations }: { onNavigate: (id: string) => void; onOpenEvaluations?: () => void }) {
  const { tokens } = useTheme();
  const { projects, prompts, chat, githubToken, hasKey, syncCatalog, catalogVersion } = useApp();
  void catalogVersion;

  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    setSyncing(true);
    await syncCatalog();
    setSyncing(false);
  }, [syncCatalog]);

  const providers = useMemo(() => listProviders(), []);
  const gateways = useMemo(() => providers.filter((p) => p.gateway), [providers]);
  const allModels = useMemo(() => listModels(), []);
  const freeModels = useMemo(() => getFreeModels(), []);
  const freeCount = freeModels.length;
  const projectsList = useMemo(() => projects.projectsList(), [projects]);
  const promptCount = prompts.all().length;
  const connectedProviders = useMemo(() => providers.filter((p) => hasKey(p.id as ProviderId) || p.id === 'local').length, [providers, hasKey]);

  const providerModelCounts = useMemo(() => {
    const counts = new Map<string, { all: number; free: number }>();
    for (const p of providers) {
      const models = allModels.filter((m) => m.provider === p.id);
      counts.set(p.id, { all: models.length, free: models.filter((m) => m.isFree).length });
    }
    return counts;
  }, [providers, allModels]);

  const unconfiguredProviders = useMemo(() =>
    providers.filter((p) => !hasKey(p.id as ProviderId) && p.id !== 'local')
      .sort((a, b) => Number(b.gateway) - Number(a.gateway))
      .slice(0, 6),
    [providers, hasKey]
  );

  const stats = useMemo(() => [
    { label: 'Projects', value: projectsList.length, dest: 'dashboard' },
    { label: 'Prompts', value: promptCount, dest: 'prompts' },
    { label: 'Free models', value: freeCount, dest: 'chat' },
    { label: 'Providers connected', value: connectedProviders, dest: 'keys' },
  ], [projectsList.length, promptCount, freeCount, connectedProviders]);

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        subtitle="Everything in one place — manage your AI projects, models, agents and GitHub."
        actions={
          <>
            <Button variant="ghost" onClick={() => onNavigate('github')}>GitHub {githubToken ? '•' : ''}</Button>
            <Button onClick={() => onNavigate('chat')}>New Chat</Button>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: tokens.space4, marginBottom: tokens.space5 }}>
        {stats.map((s) => (
          <Card key={s.label} style={{ cursor: 'pointer' }} padded>
            <div onClick={() => onNavigate(s.dest)}>
              <div style={{ fontSize: tokens.fontSize3xl, fontWeight: 700, color: tokens.primary }}>{s.value}</div>
              <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, marginTop: tokens.space1 }}>{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: tokens.space4, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space4 }}>
          <Card title="Recent Projects" subtitle="Your all-in-one workspaces" actions={<Button size="sm" onClick={() => onNavigate('dashboard')}>New</Button>}>
            {projectsList.length === 0 ? (
              <div style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeSm }}>No projects yet. Create one to get started.</div>
            ) : (
              projectsList.slice(0, 6).map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, padding: `${tokens.space2}px 0`, borderBottom: `1px solid ${tokens.border}` }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                  <span style={{ flex: 1, fontWeight: 500 }}>{p.name}</span>
                  {p.gitRepo && <Badge>git</Badge>}
                  <span style={{ color: tokens.textMuted, fontSize: tokens.fontSizeXs }}>{(p.conversations?.length ?? 0)} convs</span>
                </div>
              ))
            )}
          </Card>

          <Card
            title="Model providers"
            subtitle={`Free & live models — ${gateways.length} gateways (OpenRouter, OpenCode Zen, Kilo & more)`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => void sync()} disabled={syncing}>
                {syncing ? <Spinner size={14} /> : '⇄ Sync'}
              </Button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2, maxHeight: 320, overflowY: 'auto' }}>
              {providers.map((p) => {
                const counts = providerModelCounts.get(p.id) ?? { all: 0, free: 0 };
                const connected = hasKey(p.id as ProviderId) || (p.id === 'local');
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: tokens.space3 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 500 }}>{p.name}</span>
                      {p.gateway && <Badge style={{ marginLeft: 6, fontSize: 10 }} color={tokens.info}>gateway</Badge>}
                    </div>
                    <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, whiteSpace: 'nowrap' }}>
                      {counts.free} free · {counts.all} models
                    </span>
                    <DotConnected connected={connected} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space4 }}>
          <Card title="Quick actions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
              <Button variant="secondary" full onClick={() => onNavigate('chat')}>💬 New chat</Button>
              <Button variant="secondary" full onClick={() => onNavigate('workflows')}>⚡ New workflow</Button>
              <Button variant="secondary" full onClick={() => onNavigate('agents')}>🤖 New agent</Button>
              <Button variant="secondary" full onClick={() => onOpenEvaluations ? onOpenEvaluations() : onNavigate('prompts')}>🧪 Run eval</Button>
            </div>
          </Card>
          <Card title="Providers to configure" subtitle="Connect keys to unlock free models">
            {unconfiguredProviders.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${tokens.space1}px 0` }}>
                <span style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary }}>
                  {p.name}
                  {p.gateway && <Badge style={{ fontSize: 9, marginLeft: 5 }} color={tokens.info}>gateway</Badge>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => onNavigate('keys')}>Add</Button>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Page>
  );
}

const DotConnected = React.memo(function DotConnected({ connected }: { connected: boolean }) {
  const { tokens } = useTheme();
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? tokens.success : tokens.textMuted, display: 'inline-block' }} />;
});
