import { useEffect, useState, useCallback } from 'react';
import { useTheme, Card, Button, Badge, Spinner, Select } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubRepo, GitHubWorkflowRun } from '@acode/core';
import { makeClient, timeAgo, splitRef, compact, shortDate } from './shared';

export function ActionsView() {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [runs, setRuns] = useState<GitHubWorkflowRun[]>([]);
  const [repoFilter, setRepoFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GitHubWorkflowRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const c = makeClient(githubToken);
    try {
      const repos = await c.repos({ perPage: 100 });
      setRepos(repos);
      const all = await Promise.all(
        repos.slice(0, 20).map(async (r) => {
          const { owner, name } = splitRef(r.fullName);
          const list = await c.workflowRuns(owner, name, 10).catch(() => [] as GitHubWorkflowRun[]);
          return list.map((x) => ({ ...x, repository: r.fullName }));
        }),
      );
      setRuns(all.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } finally {
      setLoading(false);
    }
  }, [githubToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = repoFilter === 'all' ? runs : runs.filter((r) => (r as unknown as { repository: string }).repository === repoFilter);

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginBottom: tokens.space4, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>Actions / CI</span>
        <div style={{ width: 240, minWidth: 180 }}>
          <Select value={repoFilter} onChange={setRepoFilter} options={[
            { value: 'all', label: 'All repositories' },
            ...repos.map((r) => ({ value: r.fullName, label: r.name })),
          ]} />
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" onClick={() => void load()}>{loading ? <Spinner size={15} /> : 'Refresh'}</Button>
      </div>

      {selected ? (
        <RunLogs run={selected} onBack={() => setSelected(null)} />
      ) : loading && filtered.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space8 }}><Spinner size={28} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: tokens.textMuted, padding: tokens.space8 }}>No workflow runs found</div>
      ) : (
        <Card padded={false}>
          {filtered.slice(0, 40).map((r, i) => (
            <RunRow key={`${(r as unknown as { repository: string }).repository}-${r.id}`} run={r} repo={(r as unknown as { repository: string }).repository} onClick={() => setSelected(r)} last={i === Math.min(filtered.length, 40) - 1} />
          ))}
        </Card>
      )}
    </div>
  );
}

function RunRow({ run, repo, onClick, last }: { run: GitHubWorkflowRun; repo: string; onClick: () => void; last: boolean }) {
  const { tokens } = useTheme();
  const c = resultColor(run.conclusion ?? run.status, tokens);
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: tokens.space3, padding: tokens.space3, background: 'transparent', border: 'none', borderBottom: last ? 'none' : `1px solid ${tokens.border}`, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: c, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: tokens.textMuted, fontFamily: tokens.fontMono, fontSize: tokens.fontSizeXs, marginRight: tokens.space1 }}>{repo}</span>
          {run.name} #{run.runNumber}
        </div>
        <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 2 }}>
          {run.event} · branch <b>{run.headBranch}</b> · by {run.actor} · {timeAgo(run.updatedAt)}
        </div>
      </div>
      <Badge color={c}>{run.conclusion ?? run.status}</Badge>
      <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{shortDate(run.createdAt)}</span>
    </button>
  );
}

function RunLogs({ run, onBack }: { run: GitHubWorkflowRun; onBack: () => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const { repository } = run as unknown as { repository: string };
  const { owner, name } = splitRef(repository);

  useEffect(() => {
    setLoading(true);
    makeClient(githubToken).workflowRunLogs(owner, name, run.id).then(setLogs).finally(() => setLoading(false));
  }, [owner, name, run.id, githubToken]);

  return (
    <div className="rise">
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeSm, fontWeight: 600, padding: 0, marginBottom: tokens.space2 }}>
        ← Back to runs
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginBottom: tokens.space3, flexWrap: 'wrap' }}>
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: resultColor(run.conclusion ?? run.status, tokens) }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>{run.name} #{run.runNumber}</div>
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{repository} · {run.event} · {run.headBranch} · {run.headSha.slice(0, 7)}</div>
        </div>
        <div style={{ flex: 1 }} />
        <Badge color={resultColor(run.conclusion ?? run.status, tokens)}>{run.conclusion ?? run.status}</Badge>
      </div>
      <Card title={`Logs (${compact(logs.length)} chars)`}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space6 }}><Spinner /></div>
        ) : (
          <pre style={{ background: 'var(--code-bg)', padding: tokens.space4, borderRadius: tokens.radiusMd, overflow: 'auto', fontSize: 12, lineHeight: 1.5, maxHeight: '60vh', margin: 0 }}>{logs || 'No logs available'}</pre>
        )}
      </Card>
    </div>
  );
}

function resultColor(conclusion: string, tokens: ReturnType<typeof useTheme>['tokens']): string {
  if (conclusion === 'success') return tokens.success;
  if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out' || conclusion === 'action_required') return tokens.danger;
  if (conclusion === 'in_progress' || conclusion === 'queued' || conclusion === 'pending' || conclusion === 'waiting') return tokens.warning;
  return tokens.textMuted;
}
