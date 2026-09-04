import { useEffect, useState, useCallback } from 'react';
import { useTheme, Card, Button, Input, Badge, Spinner, Select } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubRepo, GitHubPullRequest, GitHubComment } from '@acode/core';
import { makeClient, timeAgo, splitRef, renderMd, trimSha } from './shared';

export function PullRequestsView() {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [prs, setPrs] = useState<PrWithRepo[]>([]);
  const [myLogin, setMyLogin] = useState('');
  const [repoFilter, setRepoFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PrWithRepo | null>(null);
  const [sourceFilter, setSourceFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const c = makeClient(githubToken);
    try {
      const [repos, me] = await Promise.all([c.repos({ perPage: 100 }), c.user()]);
      setRepos(repos);
      setMyLogin(me.login);
      const all = await Promise.all(
        repos.slice(0, 12).map(async (r) => {
          const { owner, name } = splitRef(r.fullName);
          const list = await c.pullRequests(owner, name, 'all', 20).catch(() => [] as GitHubPullRequest[]);
          return list.map((p) => ({ ...p, repository: r.fullName }));
        }),
      );
      setPrs(all.flat());
    } finally {
      setLoading(false);
    }
  }, [githubToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = prs.filter((pr) => {
    if (stateFilter !== 'all' && pr.state !== stateFilter) return false;
    if (repoFilter !== 'all' && pr.repository !== repoFilter) return false;
    if (sourceFilter === 'mine' && pr.user !== myLogin) return false;
    return true;
  });

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1200, margin: '0 auto' }}>
      {selected ? (
        <PrDetail pr={selected} onBack={() => setSelected(null)} onChanged={() => void load()} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginBottom: tokens.space4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>Pull requests</span>
            <div style={{ width: 200, minWidth: 160 }}>
              <Select value={stateFilter} onChange={(v) => setStateFilter(v as 'open' | 'closed' | 'all')} options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]} />
            </div>
            <div style={{ width: 180, minWidth: 140 }}>
              <Select value={sourceFilter} onChange={setSourceFilter} options={[
                { value: 'all', label: 'All' },
                { value: 'mine', label: 'Created by me' },
              ]} />
            </div>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" onClick={() => void load()}>{loading ? <Spinner size={15} /> : 'Refresh'}</Button>
          </div>

          {repos.length > 0 && <FilterChips repos={repos} value={repoFilter} onChange={setRepoFilter} />}

          {loading && filtered.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space8 }}><Spinner size={28} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: tokens.textMuted, padding: tokens.space8 }}>No pull requests matched</div>
          ) : (
            <Card padded={false}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filtered.map((pr, i) => (
                  <PrRow key={`${pr.number}-${pr.repository}`} pr={pr} onClick={() => setSelected(pr)} last={i === filtered.length - 1} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

interface PrWithRepo extends GitHubPullRequest {
  repository: string;
  repositoryFullName?: string;
}

function PrRow({ pr, onClick, last }: { pr: PrWithRepo; onClick: () => void; last: boolean }) {
  const { tokens } = useTheme();
  const color = pr.merged ? tokens.info : pr.state === 'closed' ? tokens.danger : tokens.success;
  const icon = pr.merged ? '✔' : pr.state === 'closed' ? '✖' : pr.draft ? '○' : '⟳';
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: tokens.space3, padding: tokens.space3, background: 'transparent', border: 'none', borderBottom: last ? 'none' : `1px solid ${tokens.border}`, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ color, fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pr.repository && <span style={{ color: tokens.textMuted, fontFamily: tokens.fontMono, fontSize: tokens.fontSizeXs, marginRight: tokens.space1 }}>{pr.repository}</span>}
          <span style={{ color: tokens.textMuted, fontSize: tokens.fontSizeXs, marginRight: tokens.space1 }}>#{pr.number}</span>
          {pr.title}
        </div>
        <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 2 }}>
          {pr.merged ? 'merged' : pr.state} by <b>{pr.user}</b> · {pr.baseRef} ← {pr.headRef} · {timeAgo(pr.updatedAt)}
        </div>
      </div>
      <div style={{ fontSize: tokens.fontSizeXs, color: tokens.success, whiteSpace: 'nowrap' }}>+{pr.additions}</div>
      <div style={{ fontSize: tokens.fontSizeXs, color: tokens.danger, whiteSpace: 'nowrap' }}>−{pr.deletions}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {pr.labels.slice(0, 2).map((l) => <Badge key={l.name} color={`#${l.color}`}>{l.name}</Badge>)}
      </div>
      {pr.draft && <Badge color={tokens.textMuted}>draft</Badge>}
    </button>
  );
}

function FilterChips({ repos, value, onChange }: { repos: GitHubRepo[]; value: string; onChange: (v: string) => void }) {
  const { tokens } = useTheme();
  return (
    <div style={{ display: 'flex', gap: tokens.space1, flexWrap: 'wrap', marginBottom: tokens.space3 }}>
      {repos.map((r) => (
        <button key={r.fullName} onClick={() => onChange(r.fullName === value ? 'all' : r.fullName)} style={{ padding: '4px 10px', borderRadius: tokens.radiusFull, border: `1px solid ${tokens.borderStrong}`, background: r.fullName === value ? tokens.primary : 'transparent', color: r.fullName === value ? tokens.primaryForeground : tokens.textSecondary, fontSize: tokens.fontSizeXs, fontWeight: 600, cursor: 'pointer' }}>
          {r.name}
        </button>
      ))}
    </div>
  );
}

function PrDetail({ pr, onBack, onChanged }: { pr: PrWithRepo; onBack: () => void; onChanged: () => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [detail, setDetail] = useState<GitHubPullRequest>(pr);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [diff, setDiff] = useState('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [comment, setComment] = useState('');
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const { owner, name } = splitRef(pr.repository);

  const load = useCallback(async () => {
    const c = makeClient(githubToken);
    try {
      const [d, cm] = await Promise.all([
        c.pullRequest(owner, name, pr.number),
        c.comments(owner, name, pr.number).catch(() => [] as GitHubComment[]),
      ]);
      setDetail(d);
      setComments(cm);
    } catch {
      /* keep existing */
    }
  }, [owner, name, pr.number, githubToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDiff = async () => {
    setLoadingDiff(true);
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/pulls/${pr.number}`, {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github.diff', 'X-GitHub-Api-Version': '2022-11-28' },
      });
      setDiff(await res.text());
      setShowDiff(true);
    } catch {
      setDiff('Failed to load diff');
      setShowDiff(true);
    } finally {
      setLoadingDiff(false);
    }
  };

  const submitComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await makeClient(githubToken).createComment(owner, name, pr.number, comment);
      setComment('');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') => {
    setBusy(true);
    try {
      await makeClient(githubToken).createReview(owner, name, pr.number, review, event);
      setReview('');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doMerge = async (method: 'merge' | 'squash' | 'rebase') => {
    setBusy(true);
    try {
      await makeClient(githubToken).mergePullRequest(owner, name, pr.number, undefined, method);
      await load();
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stateColor = detail.merged ? tokens.info : detail.state === 'closed' ? tokens.danger : tokens.success;

  return (
    <div className="rise">
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: tokens.textSecondary, cursor: 'pointer', fontSize: tokens.fontSizeSm, fontWeight: 600, padding: 0, marginBottom: tokens.space2 }}>
        ← Back to pull requests
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.space2, flexWrap: 'wrap', marginBottom: tokens.space2 }}>
        <span style={{ color: stateColor, fontSize: 18, marginTop: 2 }}>{detail.merged ? '✔' : detail.state === 'closed' ? '✖' : '⟳'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: 700 }}>{detail.title}</h1>
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 4 }}>
            {pr.repository} · #{detail.number} opened by <b>{detail.user}</b> · {baseRef(detail)} · {timeAgo(detail.updatedAt)}
          </div>
        </div>
        <Badge color={stateColor}>{detail.merged ? 'Merged' : detail.state}{detail.draft ? ' · draft' : ''}</Badge>
      </div>

      <div style={{ display: 'flex', gap: tokens.space4, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: tokens.space2, alignItems: 'center', fontSize: tokens.fontSizeSm }}>
          <span style={{ color: tokens.success }}>+{detail.additions}</span>
          <span style={{ color: tokens.danger }}>−{detail.deletions}</span>
          <span style={{ color: tokens.textMuted }}>{detail.comments} comments</span>
        </div>
        <div style={{ flex: 1 }} />
        {!detail.merged && detail.state === 'open' && !detail.draft && (
          <div style={{ display: 'flex', gap: tokens.space2 }}>
            <Button variant="success" size="sm" onClick={() => void doMerge('merge')} disabled={busy}>{busy ? <Spinner size={14} /> : 'Merge'}</Button>
            <Button variant="secondary" size="sm" onClick={() => void doMerge('squash')} disabled={busy}>Squash</Button>
            <Button variant="secondary" size="sm" onClick={() => void doMerge('rebase')} disabled={busy}>Rebase</Button>
          </div>
        )}
      </div>

      <div style={{ marginTop: tokens.space4, display: 'grid', gridTemplateColumns: '1fr', gap: tokens.space4, alignItems: 'start' }}>
        {/* Main column */}
        <div>
          {detail.body && (
            <Card style={{ marginBottom: tokens.space3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, marginBottom: tokens.space2 }}>
                {detail.userAvatar && <img src={detail.userAvatar} alt="" width={26} height={26} style={{ borderRadius: '50%' }} />}
                <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{detail.user}</span>
                <Badge color={tokens.textMuted}>{detail.authorAssociation}</Badge>
              </div>
              <div style={{ fontSize: tokens.fontSizeSm, lineHeight: 1.6 }}>{renderMd(detail.body)}</div>
            </Card>
          )}

          {comments.length > 0 && (
            <Card title={`Comments (${comments.length})`} style={{ marginBottom: tokens.space3 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
                {comments.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: tokens.space2 }}>
                    {c.userAvatar ? <img src={c.userAvatar} alt="" width={28} height={28} style={{ borderRadius: '50%' }} /> : <Avatar text={c.user[0]?.toUpperCase() ?? '?'} />}
                    <div style={{ flex: 1, background: tokens.bgSubtle, borderRadius: tokens.radiusMd, padding: tokens.space3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: tokens.space1 }}>
                        <span style={{ fontSize: tokens.fontSizeXs, fontWeight: 600 }}>{c.user}</span>
                        <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{timeAgo(c.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: tokens.fontSizeSm, lineHeight: 1.6 }}>{renderMd(c.body)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Comment box */}
          <Card>
            <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600, marginBottom: tokens.space2 }}>Leave a comment</div>
            <Input textarea rows={3} value={comment} onChange={setComment} placeholder="Write a comment (markdown supported)" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: tokens.space2 }}>
              <Button onClick={submitComment} disabled={!comment.trim() || busy}>Comment</Button>
            </div>
          </Card>
        </div>

        {/* Side column — review */}
        <div>
          <Card title="Code review">
            <Input textarea rows={4} value={review} onChange={setReview} placeholder="Review summary..." />
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2, marginTop: tokens.space3 }}>
              <Button variant="success" size="sm" onClick={() => void submitReview('APPROVE')} disabled={busy || (!review.trim() && true)}>✓ Approve</Button>
              <Button variant="danger" size="sm" onClick={() => void submitReview('REQUEST_CHANGES')} disabled={busy}>✗ Request changes</Button>
              <Button variant="secondary" size="sm" onClick={() => void submitReview('COMMENT')} disabled={busy}>Comment</Button>
            </div>
            <div style={{ marginTop: tokens.space4 }}>
              <Button variant="secondary" size="sm" full onClick={loadDiff} disabled={loadingDiff}>
                {loadingDiff ? <Spinner size={14} /> : showDiff ? 'Refresh diff' : 'Show diff'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {showDiff && (
        <Card title="Diff" style={{ marginTop: tokens.space4 }}>
          <pre style={{ background: 'var(--code-bg)', padding: tokens.space4, borderRadius: tokens.radiusMd, overflow: 'auto', fontSize: 12, lineHeight: 1.6, maxHeight: 500, margin: 0 }}>{diff}</pre>
        </Card>
      )}
    </div>
  );
}

function baseRef(pr: GitHubPullRequest): string {
  return `${pr.baseRef} ← ${pr.headRef}`;
}

function Avatar({ text }: { text: string }) {
  const { tokens } = useTheme();
  return <div style={{ width: 28, height: 28, borderRadius: '50%', background: tokens.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: tokens.fontSizeXs, fontWeight: 600 }}>{text}</div>;
}
