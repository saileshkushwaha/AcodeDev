import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Badge, useTheme } from '@acode/ui';
import { listModels, getFreeModels, PROVIDER_LIST, type ProviderId } from '@acode/core';

export function Dashboard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { tokens } = useTheme();
  const { projects, prompts, chat, githubToken, hasKey } = useApp();

  const models = listModels();
  const freeCount = getFreeModels().length;
  const projectsList = projects.projectsList();
  const promptCount = prompts.all().length;
  const connectedProviders = PROVIDER_LIST.filter((p) => hasKey(p.id as ProviderId)).length;

  const stats = [
    { label: 'Projects', value: projectsList.length, dest: 'dashboard' },
    { label: 'Prompts', value: promptCount, dest: 'prompts' },
    { label: 'Free models', value: freeCount, dest: 'chat' },
    { label: 'Providers connected', value: connectedProviders, dest: 'keys' },
  ];

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

          <Card title="Model availability" subtitle="Free models across all supported providers">
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
              {PROVIDER_LIST.slice(0, 9).map((p) => {
                const n = listModels(p.id as ProviderId).length;
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: tokens.space3 }}>
                    <span style={{ flex: 1, fontSize: tokens.fontSizeSm }}>{p.name}</span>
                    <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{n} models</span>
                    <DotConnected connected={hasKey(p.id as ProviderId)} />
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
              <Button variant="secondary" full onClick={() => onNavigate('prompts')}>🧪 Run eval</Button>
            </div>
          </Card>
          <Card title="Providers to configure" subtitle="Connect keys to unlock free models">
            {PROVIDER_LIST.filter((p) => !hasKey(p.id as ProviderId) && p.id !== 'local').slice(0, 5).map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${tokens.space1}px 0` }}>
                <span style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary }}>{p.name}</span>
                <Button size="sm" variant="ghost" onClick={() => onNavigate('keys')}>Add</Button>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </Page>
  );
}

function DotConnected({ connected }: { connected: boolean }) {
  const { tokens } = useTheme();
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? tokens.success : tokens.textMuted, display: 'inline-block' }} />;
}
