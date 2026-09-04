import { useEffect, useState, useCallback } from 'react';
import { useTheme, Card, Button, Input, Badge, TabBar, Spinner, Select, Modal, Chip } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubRepo, GitHubContent, GitHubCommit, GitHubBranch, GitHubRelease, GitHubPullRequest, GitHubIssue, GitHubWorkflowRun } from '@acode/core';
import { makeClient, timeAgo, compact, splitRef, renderMd, trimSha } from './shared';

export function RepositoriesView() {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<GitHubRepo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = makeClient(githubToken);
      setRepos(await c.repos({ perPage: 100 }));
    } finally {
      setLoading(false);
    }
  }, [githubToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = repos.filter((r) => {
    if (filter === 'private' && !r.private) return false;
    if (filter === 'public' && r.private) return false;
    if (filter === 'archived' && !r.archived) return false;
    if (q && !(r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q) || r.fullName.toLowerCase().includes(q))) return false;
    return true;
  });

  const refresh = () => void load();

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1200, margin: '0 auto' }}>
      {selected ? (
        <RepoDetail repo={selected} onBack={() => setSelected(null)} onRefresh={async () => { const c = makeClient(githubToken); const { owner, name } = splitRef(selected.fullName); setSelected(await c.repo(owner, name)); }} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginBottom: tokens.space4, flexWrap: 'wrap' }}>
            <Input value={query} onChange={setQuery} placeholder="Filter repositories..." />
            <div style={{ width: 180, minWidth: 150 }}>
              <Select value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All' },
                { value: 'public', label: 'Public' },
                { value: 'private', label: 'Private' },
                { value: 'archived', label: 'Archived' },
              ]} />
            </div>
            <div style={{ flex: 1 }} />
            <Button onClick={() => setCreateOpen(true)}>+ New repository</Button>
            <Button variant="secondary" onClick={refresh}>{loading ? <Spinner size={15} /> : 'Refresh'}</Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: tokens.space4 }}>
            {loading && filtered.length === 0 ? (
              <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: tokens.space8 }}><Spinner size={28} /></div>
            ) : filtered.length === 0 ? (
              <div style={{ gridColumn: '1/-1', color: tokens.textMuted, padding: tokens.space6, textAlign: 'center' }}>No repositories match</div>
            ) : (
              filtered.map((r) => (
                <Card key={r.fullName} style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2, transition: 'transform 0.12s ease, border-color 0.12s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space2 }}>
                    <button onClick={() => setSelected(r)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, color: tokens.primary }}>{r.name}</div>
                      <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{r.private ? 'Private' : 'Public'}{r.archived ? ' · archived' : ''}</div>
                    </button>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Badge color={tokens.warning}>★ {compact(r.stars)}</Badge>
                    </div>
                  </div>
                  <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, minHeight: 32, lineHeight: 1.5 }}>{r.description || 'No description'}</div>
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: tokens.space3 }}>
                    {r.language && <Badge color={tokens.info}>{r.language}</Badge>}
                    <Stat icon="⑂" label={compact(r.forks)} />
                    <Stat icon="⚑" label={compact(r.openIssues)} />
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{timeAgo(r.updatedAt)}</span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      <CreateRepoModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function Stat({ icon, label }: { icon: string; label: string }) {
  const { tokens } = useTheme();
  return <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 2 }}>{icon} {label}</span>;
}

type RepoViewTab = 'code' | 'commits' | 'branches' | 'releases' | 'pulls' | 'issues' | 'actions';

function RepoDetail({ repo, onBack, onRefresh }: { repo: GitHubRepo; onBack: () => void; onRefresh: () => Promise<void> }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [tab, setTab] = useState<RepoViewTab>('code');
  const [branch, setBranch] = useState(repo.defaultBranch);
  const [path, setPath] = useState('');
  const [starred, setStarred] = useState(false);
  const [repoMeta, setRepoMeta] = useState(repo);
  const { owner, name } = splitRef(repoMeta.fullName);

  useEffect(() => {
    const c = makeClient(githubToken);
    c.isStarred(owner, name).then(setStarred).catch(() => {});
  }, [owner, name, githubToken]);

  const renderTab = () => {
    switch (tab) {
      case 'code': return <CodeBrowser owner={owner} name={name} refName={branch} path={path} onPath={setPath} />;
      case 'commits': return <CommitsPanel owner={owner} name={name} branch={branch} />;
      case 'branches': return <BranchesPanel owner={owner} name={name} />;
      case 'releases': return <ReleasesPanel owner={owner} name={name} />;
      case 'pulls': return <RepoPulls owner={owner} name={name} />;
      case 'issues': return <RepoIssues owner={owner} name={name} />;
      case 'actions': return <RepoActions owner={owner} name={name} />;
    }
  };

  const toggleStar = async () => {
    const c = makeClient(githubToken);
    try {
      if (starred) await c.unstarRepo(owner, name);
      else await c.starRepo(owner, name);
      setStarred(!starred);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="rise">
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeSm, fontWeight: 600, padding: `${tokens.space1}px 0`, marginBottom: tokens.space2 }}>
        ← Back to repositories
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.space4, flexWrap: 'wrap', marginBottom: tokens.space3 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: tokens.fontSizeXl, fontWeight: 700, display: 'flex', alignItems: 'center', gap: tokens.space2, flexWrap: 'wrap' }}>
            <span style={{ color: tokens.textMuted, fontWeight: 500 }}>{owner}/</span>{name}
            <Badge color={repoMeta.private ? tokens.warning : tokens.success}>{repoMeta.private ? 'Private' : 'Public'}</Badge>
            {repoMeta.archived && <Badge color={tokens.textMuted}>archived</Badge>}
          </div>
          {repoMeta.description && <div style={{ color: tokens.textSecondary, fontSize: tokens.fontSizeMd, marginTop: tokens.space1 }}>{repoMeta.description}</div>}
          <div style={{ display: 'flex', gap: tokens.space4, marginTop: tokens.space2, flexWrap: 'wrap' }}>
            {repoMeta.language && <Badge color={tokens.info}>{repoMeta.language}</Badge>}
            <Badge color={tokens.warning}>★ {compact(repoMeta.stars)}</Badge>
            <Badge color={tokens.textSecondary}>⑂ {compact(repoMeta.forks)}</Badge>
            <Badge color={tokens.info}>⚑ {compact(repoMeta.openIssues)}</Badge>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: tokens.space2 }}>
          <Button variant={starred ? 'secondary' : 'primary'} onClick={toggleStar} size="sm">{starred ? '★ Unstar' : '☆ Star'}</Button>
          <a href={repoMeta.htmlUrl} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">Open on GitHub</Button>
          </a>
          <Button variant="secondary" size="sm" onClick={onRefresh}>⟳</Button>
        </div>
      </div>

      {repoMeta.topics.length > 0 && (
        <div style={{ display: 'flex', gap: tokens.space1, flexWrap: 'wrap', marginBottom: tokens.space3 }}>
          {repoMeta.topics.map((t) => <Chip key={t} active>#{t}</Chip>)}
        </div>
      )}

      <Card padded={false}>
        <div style={{ padding: `0 ${tokens.space4}px`, display: 'flex', alignItems: 'center', gap: tokens.space3, borderBottom: `1px solid ${tokens.border}`, flexWrap: 'wrap' }}>
          <TabBar
            tabs={[
              { id: 'code', label: 'Code' },
              { id: 'commits', label: 'Commits' },
              { id: 'branches', label: 'Branches' },
              { id: 'releases', label: 'Releases' },
              { id: 'pulls', label: 'Pull requests' },
              { id: 'issues', label: 'Issues' },
              { id: 'actions', label: 'Actions' },
            ]}
            active={tab}
            onChange={(t) => setTab(t as RepoViewTab)}
          />
          <div style={{ flex: 1 }} />
          {(tab === 'code' || tab === 'commits') && (
            <div style={{ paddingBottom: 8 }}>
              <BranchPicker owner={owner} name={name} value={branch} onChange={setBranch} />
            </div>
          )}
        </div>
        <div style={{ padding: tokens.space4 }}>{renderTab()}</div>
      </Card>
    </div>
  );
}

function BranchPicker({ owner, name, value, onChange }: { owner: string; name: string; value: string; onChange: (b: string) => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [branches, setBranches] = useState<string[]>([]);
  useEffect(() => {
    const c = makeClient(githubToken);
    c.branches(owner, name).then((b) => setBranches(b.map((x) => x.name))).catch(() => {});
  }, [owner, name, githubToken]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: tokens.bg, color: tokens.text, border: `1px solid ${tokens.borderStrong}`, borderRadius: tokens.radiusSm, padding: '4px 8px', fontSize: tokens.fontSizeXs, fontFamily: tokens.fontMono }}>
      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
      {!branches.includes(value) && <option value={value}>{value}</option>}
    </select>
  );
}

function CodeBrowser({ owner, name, refName, path, onPath }: { owner: string; name: string; refName: string; path: string; onPath: (p: string) => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [entries, setEntries] = useState<GitHubContent[] | null>(null);
  const [file, setFile] = useState<{ content: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setFile(null);
    setErr(null);
    const c = makeClient(githubToken);
    c.contents(owner, name, path, refName)
      .then(setEntries)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [owner, name, path, refName, githubToken]);

  const crumb = ['root', ...path.split('/').filter(Boolean)];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space1, flexWrap: 'wrap', marginBottom: tokens.space3, fontSize: tokens.fontSizeSm }}>
        {crumb.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: tokens.space1 }}>
            {i > 0 && <span style={{ color: tokens.textMuted }}>/</span>}
            {i < crumb.length - 1 ? (
              <button onClick={() => onPath(i === 0 ? '' : crumb.slice(1, i + 1).join('/'))} style={{ background: 'none', border: 'none', color: tokens.primary, cursor: 'pointer', fontFamily: tokens.fontMono }}>{c}</button>
            ) : (
              <span style={{ color: tokens.textSecondary, fontFamily: tokens.fontMono }}>{c}</span>
            )}
          </span>
        ))}
      </div>

      {err && <div style={{ color: tokens.danger, fontSize: tokens.fontSizeSm, padding: tokens.space3 }}>{err}</div>}

      {file ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.space2 }}>
            <div style={{ fontFamily: tokens.fontMono, fontWeight: 600, fontSize: tokens.fontSizeSm }}>{file.name}</div>
            <Button variant="ghost" size="sm" onClick={() => setFile(null)}>× close</Button>
          </div>
          <pre style={{ background: 'var(--code-bg)', padding: tokens.space4, borderRadius: tokens.radiusMd, overflow: 'auto', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{file.content}</pre>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space6 }}><Spinner /></div>
      ) : (
        <div style={{ border: `1px solid ${tokens.border}`, borderRadius: tokens.radiusMd, overflow: 'hidden' }}>
          {entries?.map((e, i) => (
            <button
              key={e.path}
              onClick={() => e.type === 'dir' ? onPath(e.path) : openFile(owner, name, e.path, refName, githubToken, setFile)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px ${tokens.space3}px`, background: i % 2 ? tokens.bgSubtle : 'transparent', border: 'none', borderBottom: `1px solid ${tokens.border}`, color: tokens.text, cursor: 'pointer', fontFamily: tokens.fontSans, fontSize: tokens.fontSizeSm, textAlign: 'left' }}
            >
              <span style={{ color: tokens.textMuted }}>{e.type === 'dir' ? '📁' : '📄'}</span>
              <span style={{ fontFamily: tokens.fontMono, fontSize: tokens.fontSizeSm }}>{e.name}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{e.type === 'dir' ? '' : `${compact(e.size)} B`}</span>
            </button>
          ))}
          {entries?.length === 0 && <div style={{ padding: tokens.space4, color: tokens.textMuted, fontSize: tokens.fontSizeSm }}>Empty directory</div>}
        </div>
      )}
    </div>
  );
}

async function openFile(owner: string, name: string, path: string, ref: string, token: string, setFile: (f: { content: string; name: string }) => void) {
  try {
    const f = await makeClient(token).fileContent(owner, name, path, ref);
    setFile({ content: f.content, name: path.split('/').pop() ?? path });
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

function CommitsPanel({ owner, name, branch }: { owner: string; name: string; branch: string }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).commits(owner, name, branch, 50).then(setCommits).catch(() => {}).finally(() => setLoading(false));
  }, [owner, name, branch, githubToken]);
  if (loading) return <div style={{ padding: tokens.space5, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!commits.length) return <Empty text="No commits" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {commits.map((c, i) => (
        <div key={c.sha} style={{ display: 'flex', gap: tokens.space3, padding: `${tokens.space2}px 0`, borderBottom: i < commits.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          {c.authorAvatar ? <img src={c.authorAvatar} alt="" width={30} height={30} style={{ borderRadius: '50%' }} /> : <Avatar text={c.author[0]?.toUpperCase() ?? '?'} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.message.split('\n')[0]}</div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{c.author} · {timeAgo(c.date)}</div>
          </div>
          <code style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontFamily: tokens.fontMono }}>{trimSha(c.sha)}</code>
        </div>
      ))}
    </div>
  );
}

function BranchesPanel({ owner, name }: { owner: string; name: string }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).branches(owner, name).then(setBranches).catch(() => {}).finally(() => setLoading(false));
  }, [owner, name, githubToken]);
  if (loading) return <div style={{ padding: tokens.space5, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!branches.length) return <Empty text="No branches" />;
  return (
    <div>
      {branches.map((b, i) => (
        <div key={b.name} style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.space3, padding: `${tokens.space2}px 0`, borderBottom: i < branches.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tokens.textSecondary} strokeWidth="2"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9a6 6 0 01-6 6h-6" /></svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2 }}>
              <span style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, fontFamily: tokens.fontMono }}>{b.name}</span>
              {b.protected && <Badge color={tokens.warning}>protected</Badge>}
            </div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{b.commitMessage.split('\n')[0] || '—'} · {timeAgo(b.commitDate)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReleasesPanel({ owner, name }: { owner: string; name: string }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).releases(owner, name).then((r) => setReleases(r.filter((x) => !x.draft))).catch(() => {}).finally(() => setLoading(false));
  }, [owner, name, githubToken]);
  if (loading) return <div style={{ padding: tokens.space5, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!releases.length) return <Empty text="No releases" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {releases.map((r, i) => (
        <div key={r.id} style={{ padding: `${tokens.space3}px 0`, borderBottom: i < releases.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, flexWrap: 'wrap' }}>
            <b style={{ fontSize: tokens.fontSizeMd }}>{r.name ?? r.tag}</b>
            <code style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{r.tag}</code>
            {r.prerelease && <Badge color={tokens.info}>pre-release</Badge>}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{timeAgo(r.publishedAt)}</span>
          </div>
          <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, marginTop: tokens.space1, lineHeight: 1.5, maxHeight: 120, overflow: 'hidden' }}>{renderMd(r.body)}</div>
        </div>
      ))}
    </div>
  );
}

function RepoPulls({ owner, name }: { owner: string; name: string }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [prs, setPrs] = useState<GitHubPullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).pullRequests(owner, name, 'all', 50).then(setPrs).catch(() => {}).finally(() => setLoading(false));
  }, [owner, name, githubToken]);
  if (loading) return <div style={{ padding: tokens.space5, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!prs.length) return <Empty text="No pull requests" />;
  return (
    <div>
      {prs.map((pr, i) => (
        <div key={pr.number} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px 0`, borderBottom: i < prs.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          <PrState pr={pr} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{pr.number} {pr.title}</div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>by {pr.user} · {timeAgo(pr.updatedAt)}</div>
          </div>
          <span style={{ fontSize: tokens.fontSizeXs, color: tokens.success }}>+{pr.additions}</span>
          <span style={{ fontSize: tokens.fontSizeXs, color: tokens.danger }}>−{pr.deletions}</span>
        </div>
      ))}
    </div>
  );
}

function RepoIssues({ owner, name }: { owner: string; name: string }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).issues(owner, name, 'open', 50).then(setIssues).catch(() => {}).finally(() => setLoading(false));
  }, [owner, name, githubToken]);
  if (loading) return <div style={{ padding: tokens.space5, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!issues.length) return <Empty text="No open issues" />;
  const color = (s: string) => (s === 'open' ? tokens.success : tokens.danger);
  return (
    <div>
      {issues.map((i, idx) => (
        <div key={i.number} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px 0`, borderBottom: idx < issues.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color(i.state)} strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{i.number} {i.title}</div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>by {i.user} · {i.comments} comments</div>
          </div>
          {i.labels.slice(0, 2).map((l) => <Badge key={l.name} color={`#${l.color}`}>{l.name}</Badge>)}
        </div>
      ))}
    </div>
  );
}

function RepoActions({ owner, name }: { owner: string; name: string }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [runs, setRuns] = useState<GitHubWorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).workflowRuns(owner, name).then(setRuns).catch(() => {}).finally(() => setLoading(false));
  }, [owner, name, githubToken]);
  if (loading) return <div style={{ padding: tokens.space5, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!runs.length) return <Empty text="No workflow runs" />;
  const c = (conclusion: string | null) => conclusion === 'success' ? tokens.success : conclusion === 'failure' || conclusion === 'cancelled' ? tokens.danger : tokens.warning;
  return (
    <div>
      {runs.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: `${tokens.space2}px 0`, borderBottom: i < runs.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: c(r.conclusion), flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm }}>{r.name} #{r.runNumber}</div>
            <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{r.event} · {r.headBranch} · {timeAgo(r.createdAt)}</div>
          </div>
          <Badge color={c(r.conclusion)}>{r.conclusion ?? r.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function CreateRepoModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [initReadme, setInitReadme] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await makeClient(githubToken).createRepo({ name: name.trim(), description: desc, private: isPrivate, autoInit: initReadme });
      onCreated();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a new repository">
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
        <Input label="Repository name" value={name} onChange={setName} placeholder="my-awesome-project" monospace />
        <Input label="Description" value={desc} onChange={setDesc} placeholder="Short description" />
        <label style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, cursor: 'pointer' }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
          <span style={{ fontSize: tokens.fontSizeSm }}>Private repository</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, cursor: 'pointer' }}>
          <input type="checkbox" checked={initReadme} onChange={(e) => setInitReadme(e.target.checked)} />
          <span style={{ fontSize: tokens.fontSizeSm }}>Initialize with a README</span>
        </label>
        <div style={{ display: 'flex', gap: tokens.space2, justifyContent: 'flex-end', marginTop: tokens.space2 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || busy}>{busy ? <Spinner size={16} color="#fff" /> : 'Create repository'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PrState({ pr }: { pr: GitHubPullRequest }) {
  const { tokens } = useTheme();
  const color = pr.merged ? tokens.info : pr.state === 'closed' ? tokens.danger : tokens.success;
  const icon = pr.merged ? '✔' : pr.state === 'closed' ? '✖' : '⟳';
  return <span style={{ color, width: 20, textAlign: 'center' }}>{icon}</span>;
}

function Avatar({ text }: { text: string }) {
  const { tokens } = useTheme();
  return <div style={{ width: 30, height: 30, borderRadius: '50%', background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{text}</div>;
}

function Empty({ text }: { text: string }) {
  const { tokens } = useTheme();
  return <div style={{ color: tokens.textMuted, fontSize: tokens.fontSizeSm, padding: tokens.space4 }}>{text}</div>;
}
