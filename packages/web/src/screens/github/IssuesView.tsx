import { useEffect, useState, useCallback } from 'react';
import { useTheme, Card, Button, Input, Badge, Spinner, Select, Modal } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubRepo, GitHubIssue, GitHubComment } from '@acode/core';
import { makeClient, timeAgo, splitRef, renderMd } from './shared';
import { EmptyState, LoadingSpinner, BackButton, FilterChips, FormModal } from '../../components/SharedComponents';

interface IssueWithRepo extends GitHubIssue {
  repository: string;
}

export function IssuesView() {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [issues, setIssues] = useState<IssueWithRepo[]>([]);
  const [repoFilter, setRepoFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<IssueWithRepo | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [myLogin, setMyLogin] = useState('');

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
          const list = await c.issues(owner, name, 'all', 30).catch(() => [] as GitHubIssue[]);
          return list.filter((i) => !i.pullRequest).map((i) => ({ ...i, repository: r.fullName }));
        }),
      );
      setIssues(all.flat());
    } finally {
      setLoading(false);
    }
  }, [githubToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = issues.filter((i) => {
    if (stateFilter !== 'all' && i.state !== stateFilter) return false;
    if (repoFilter !== 'all' && i.repository !== repoFilter) return false;
    return true;
  });

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1200, margin: '0 auto' }}>
      {selected ? (
        <IssueDetail issue={selected} onBack={() => setSelected(null)} onChanged={() => void load()} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginBottom: tokens.space4, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>Issues</span>
            <div style={{ width: 180, minWidth: 150 }}>
              <Select value={stateFilter} onChange={(v) => setStateFilter(v as 'open' | 'closed' | 'all')} options={[
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'all', label: 'All' },
              ]} />
            </div>
            <div style={{ flex: 1 }} />
            <Button onClick={() => setCreateOpen(true)}>+ New issue</Button>
            <Button variant="secondary" onClick={() => void load()}>{loading ? <Spinner size={15} /> : 'Refresh'}</Button>
          </div>

          {repos.length > 0 && <FilterChips repos={repos} value={repoFilter} onChange={setRepoFilter} />}

          {loading && filtered.length === 0 ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <EmptyState>No issues matched</EmptyState>
          ) : (
            <Card padded={false}>
              {filtered.map((i, idx) => <IssueRow key={`${i.number}-${i.repository}`} issue={i} onClick={() => setSelected(i)} last={idx === filtered.length - 1} />)}
            </Card>
          )}

          <CreateIssueModal open={createOpen} onClose={() => setCreateOpen(false)} repos={repos} myLogin={myLogin} onCreated={() => { setCreateOpen(false); void load(); }} />
        </>
      )}
    </div>
  );
}

function IssueRow({ issue, onClick, last }: { issue: IssueWithRepo; onClick: () => void; last: boolean }) {
  const { tokens } = useTheme();
  const color = issue.state === 'open' ? tokens.success : tokens.danger;
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: tokens.space3, padding: tokens.space3, background: 'transparent', border: 'none', borderBottom: last ? 'none' : `1px solid ${tokens.border}`, cursor: 'pointer', textAlign: 'left' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ color: tokens.textMuted, fontFamily: tokens.fontMono, fontSize: tokens.fontSizeXs, marginRight: tokens.space1 }}>{issue.repository}</span>
          <span style={{ color: tokens.textMuted, fontSize: tokens.fontSizeXs, marginRight: tokens.space1 }}>#{issue.number}</span>
          {issue.title}
        </div>
        <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 2 }}>
          {issue.state} by <b>{issue.user}</b> · {issue.comments} comments · {timeAgo(issue.updatedAt)}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {issue.labels.slice(0, 3).map((l) => <Badge key={l.name} color={`#${l.color}`}>{l.name}</Badge>)}
      </div>
    </button>
  );
}

function IssueDetail({ issue, onBack, onChanged }: { issue: IssueWithRepo; onBack: () => void; onChanged: () => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [detail, setDetail] = useState<GitHubIssue>(issue);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const { owner, name } = splitRef(issue.repository);

  const load = useCallback(async () => {
    const c = makeClient(githubToken);
    try {
      const [d, cm] = await Promise.all([
        c.issue(owner, name, issue.number),
        c.comments(owner, name, issue.number).catch(() => [] as GitHubComment[]),
      ]);
      setDetail(d);
      setComments(cm);
    } catch { /* keep */ }
  }, [owner, name, issue.number, githubToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await makeClient(githubToken).createComment(owner, name, issue.number, comment);
      setComment('');
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setState = async (state: 'open' | 'closed') => {
    setBusy(true);
    try {
      await makeClient(githubToken).updateIssueState(owner, name, issue.number, state);
      await load();
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const color = detail.state === 'open' ? tokens.success : tokens.danger;

  return (
    <div className="rise">
      <BackButton onClick={onBack} label="Back to issues" />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.space3, flexWrap: 'wrap', marginBottom: tokens.space3 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ marginTop: 4 }}><circle cx="12" cy="12" r="9" /></svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)', fontWeight: 700 }}>{detail.title}</h1>
          <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 4 }}>
            {issue.repository} · #{detail.number} opened by <b>{detail.user}</b> · {timeAgo(detail.createdAt)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: tokens.space2 }}>
          {detail.state === 'open'
            ? <Button variant="danger" size="sm" onClick={() => void setState('closed')} disabled={busy}>Close issue</Button>
            : <Button variant="success" size="sm" onClick={() => void setState('open')} disabled={busy}>Reopen</Button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: tokens.space1, flexWrap: 'wrap', marginBottom: tokens.space4 }}>
        {detail.labels.map((l) => <Badge key={l.name} color={`#${l.color}`}>{l.name}</Badge>)}
        {detail.assignees.length > 0 && <Badge color={tokens.info}>👤 {detail.assignees.join(', ')}</Badge>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: tokens.space3, maxWidth: 900 }}>
        {detail.body && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, marginBottom: tokens.space2 }}>
              {detail.userAvatar && <img src={detail.userAvatar} alt="" width={28} height={28} style={{ borderRadius: '50%' }} />}
              <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{detail.user}</span>
              <Badge color={tokens.textMuted}>{detail.authorAssociation}</Badge>
            </div>
            <div style={{ fontSize: tokens.fontSizeSm, lineHeight: 1.7 }}>{renderMd(detail.body)}</div>
          </Card>
        )}

        {comments.map((c) => (
          <Card key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: tokens.space2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2 }}>
                {c.userAvatar && <img src={c.userAvatar} alt="" width={24} height={24} style={{ borderRadius: '50%' }} />}
                <span style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{c.user}</span>
              </div>
              <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{timeAgo(c.createdAt)}</span>
            </div>
            <div style={{ fontSize: tokens.fontSizeSm, lineHeight: 1.7 }}>{renderMd(c.body)}</div>
          </Card>
        ))}

        <Card>
          <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600, marginBottom: tokens.space2 }}>Add a comment</div>
          <Input textarea rows={3} value={comment} onChange={setComment} placeholder="Write a comment (markdown supported)" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: tokens.space2 }}>
            <Button onClick={submitComment} disabled={!comment.trim() || busy}>Comment</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CreateIssueModal({ open, onClose, repos, myLogin, onCreated }: { open: boolean; onClose: () => void; repos: GitHubRepo[]; myLogin: string; onCreated: () => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (repos.length && !repo) setRepo(repos[0].fullName);
  }, [repos, repo]);

  const submit = async () => {
    if (!title.trim() || !repo) return;
    setBusy(true);
    try {
      const { owner, name } = splitRef(repo);
      await makeClient(githubToken).createIssue(owner, name, { title: title.trim(), body });
      onCreated();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New issue">
      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space2 }}>
          <span style={{ fontSize: tokens.fontSizeXs, fontWeight: 600 }}>@{myLogin}</span>
          <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>will create this in</span>
          <div style={{ flex: 1, minWidth: 120 }}>
            <Select value={repo} onChange={setRepo} options={repos.map((r) => ({ value: r.fullName, label: r.fullName }))} />
          </div>
        </div>
        <Input label="Title" value={title} onChange={setTitle} placeholder="Issue title" />
        <Input label="Description (markdown)" textarea rows={5} value={body} onChange={setBody} placeholder="Describe the issue..." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space2 }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || busy}>{busy ? <Spinner size={16} color="#fff" /> : 'Submit new issue'}</Button>
        </div>
      </div>
    </Modal>
  );
}
