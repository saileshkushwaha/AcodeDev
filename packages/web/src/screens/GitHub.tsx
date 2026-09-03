import { useEffect, useState } from 'react';
import { useApp } from '../state/AppProvider';
import { Page, PageHeader } from '../components/Page';
import { Card, Button, Input, Badge, TabBar, useTheme, Spinner } from '@acode/ui';
import { GitHubClient } from '@acode/core';
import type { GitHubUserInfo, GitHubRepo, GitHubPullRequest, GitHubIssue, GitHubWorkflowRun } from '@acode/core';

export function GitHubScreen() {
  const { tokens } = useTheme();
  const { githubToken, setGithubToken } = useApp();
  const [tokenInput, setTokenInput] = useState(githubToken);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<GitHubUserInfo | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('repos');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [prs, setPrs] = useState<GitHubPullRequest[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [runs, setRuns] = useState<GitHubWorkflowRun[]>([]);
  const [detailLoaded, setDetailLoaded] = useState(false);

  const connect = async () => {
    setGithubToken(tokenInput);
    setLoading(true);
    try {
      const client = makeClient(tokenInput);
      const u = await client.user();
      const r = await client.repos();
      setUser(u);
      setRepos(r);
      setConnected(true);
      if (r.length) selectRepo(r[0].fullName, client, u);
    } catch (e) {
      setConnected(false);
      alert(`GitHub connection failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  };

const makeClient = (token: string) => {
  return new GitHubClient({ token });
};

  const selectRepo = async (fullName: string, c?: GitHubClient, u?: GitHubUserInfo) => {
    setSelectedRepo(fullName);
    setDetailLoaded(false);
    const client = c ?? makeClient(githubToken);
    try {
      const [owner, repo] = fullName.split('/');
      const [p, i, w] = await Promise.all([client.pullRequests(owner, repo), client.issues(owner, repo), client.workflowRuns(owner, repo)]);
      setPrs(p);
      setIssues(i);
      setRuns(w);
      setUser(u ?? user);
    } catch {
      setPrs([]); setIssues([]); setRuns([]);
    } finally {
      setDetailLoaded(true);
    }
  };

  useEffect(() => {
    if (githubToken && !connected) {
      void connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="GitHub Dashboard"
        subtitle="Repos, pull requests, issues and CI — all in one place"
        actions={connected && user ? <Badge color={tokens.success}>@{user.login}</Badge> : undefined}
      />

      {!connected ? (
        <Card title="Connect GitHub" subtitle="Your projects, in one place">
          <Input label="Personal access token" type="password" value={tokenInput} onChange={setTokenInput} monospace placeholder="ghp_... or github_pat_..." />
          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button onClick={connect} disabled={!tokenInput || loading}>{loading ? <Spinner size={16} /> : 'Connect'}</Button>
          </div>
          <p style={{ fontSize: 12, color: tokens.textMuted, marginTop: 8 }}>
            Create a token at github.com/settings/tokens with <b>repo</b> scope. For Actions, add <b>workflow</b> scope.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
          <Card title="Repositories" subtitle={`${repos.length} total`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {repos.map((r) => (
                <button
                  key={r.fullName}
                  onClick={() => selectRepo(r.fullName)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: selectedRepo === r.fullName ? tokens.primary : tokens.surfaceHover,
                    color: selectedRepo === r.fullName ? tokens.primaryForeground : tokens.text,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontFamily: tokens.fontSans,
                    fontWeight: 500,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{r.private ? '🔒' : '📦'}</span>
                    <span style={{ flex: 1 }}>{r.name}</span>
                    {r.stars > 0 && <span style={{ opacity: 0.7 }}>★{r.stars}</span>}
                  </div>
                  {r.description && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{r.description}</div>}
                </button>
              ))}
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
              title={selectedRepo ?? 'Select a repo'}
              subtitle="Overview"
              actions={<Badge color={tokens.primary}>{detailLoaded ? 'synced' : '…'}</Badge>}
            >
              <TabBar
                tabs={[
                  { id: 'repos', label: `Repos ${repos.length}` },
                  { id: 'prs', label: `Pull requests ${prs.length}` },
                  { id: 'issues', label: `Issues ${issues.length}` },
                  { id: 'ci', label: `CI ${runs.length}` },
                ]}
                active={tab}
                onChange={setTab}
              />
              <div style={{ padding: 12, paddingLeft: 0 }}>
                {tab === 'prs' && <PrList prs={prs} />}
                {tab === 'issues' && <IssueList issues={issues} />}
                {tab === 'ci' && <CiList runs={runs} />}
                {tab === 'repos' && <RepoGrid repos={repos} />}
              </div>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}

function RepoGrid({ repos }: { repos: GitHubRepo[] }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
      {repos.map((r) => (
        <Card key={r.fullName} style={{ border: `1px solid ${tokens.borderStrong}` }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
          <div style={{ fontSize: 12, color: tokens.textMuted, marginTop: 4 }}>{r.description || 'No description'}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, fontSize: 12, color: tokens.textSecondary }}>
            {r.language && <Badge>{r.language}</Badge>}
            <span>★ {r.stars}</span><span>⑂ {r.forks}</span><span>⚑ {r.openIssues}</span>
          </div>
          <div style={{ fontSize: 11, color: tokens.textMuted, marginTop: 8 }}>
            Updated {new Date(r.updatedAt).toLocaleDateString()}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PrList({ prs }: { prs: GitHubPullRequest[] }) {
  const { tokens } = useTheme();
  if (!prs.length) return <Empty text="No pull requests" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {prs.map((pr) => (
        <div key={`${pr.number}-${pr.updatedAt}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: `1px solid ${tokens.border}`, borderRadius: 8 }}>
          <Badge color={pr.merged ? tokens.info : pr.state === 'closed' ? tokens.danger : tokens.success}>
            {pr.merged ? 'merged' : pr.state}
          </Badge>
          <span style={{ flex: 1, fontSize: 13 }}>#{pr.number} {pr.title}</span>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>by {pr.user}</span>
          <span style={{ fontSize: 11, color: tokens.success }}>+{pr.additions}</span>
          <span style={{ fontSize: 11, color: tokens.danger }}>−{pr.deletions}</span>
        </div>
      ))}
    </div>
  );
}

function IssueList({ issues }: { issues: GitHubIssue[] }) {
  const { tokens } = useTheme();
  if (!issues.length) return <Empty text="No open issues" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {issues.map((i) => (
        <div key={i.number} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: `1px solid ${tokens.border}`, borderRadius: 8 }}>
          <span style={{ color: tokens.success }}>◉</span>
          <span style={{ flex: 1, fontSize: 13 }}>#{i.number} {i.title}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {i.labels.map((l) => <Badge key={l} color={tokens.info}>{l}</Badge>)}
          </div>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>{i.comments} 💬</span>
        </div>
      ))}
    </div>
  );
}

function CiList({ runs }: { runs: GitHubWorkflowRun[] }) {
  const { tokens } = useTheme();
  if (!runs.length) return <Empty text="No workflow runs (Actions may be disabled)" />;
  const colorFor = (c: string | null) => (c === 'success' ? tokens.success : c === 'failure' || c === 'cancelled' ? tokens.danger : c === 'in_progress' || c === 'queued' || c === 'pending' ? tokens.warning : tokens.textMuted);
  const labelFor = (c: string | null) => c === 'success' ? '✓ success' : c === 'failure' ? '✗ failed' : c === 'in_progress' ? '⟳ running' : (c ?? '…');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {runs.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, border: `1px solid ${tokens.border}`, borderRadius: 8 }}>
          <Badge color={colorFor(r.conclusion)}>{labelFor(r.conclusion)}</Badge>
          <span style={{ flex: 1, fontSize: 13 }}>{r.name}</span>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>{r.headBranch}</span>
          <span style={{ fontSize: 11, color: tokens.textMuted }}>{new Date(r.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  const { tokens } = useTheme();
  return <div style={{ color: tokens.textMuted, fontSize: 13, padding: 16 }}>{text}</div>;
}
