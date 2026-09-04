import { useEffect, useState, useCallback } from 'react';
import { useTheme, Card, Badge, Spinner, Button } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubUserInfo, GitHubRepo, GitHubNotification, GitHubActivityEvent } from '@acode/core';
import { makeClient, timeAgo, compact } from './shared';
import type { NavId } from './GitHubScreenTypes';

export function OverviewView({
  user,
  onNavigate,
  onUnread,
}: {
  user: GitHubUserInfo | null;
  onNavigate: (n: NavId) => void;
  onUnread: (n: number) => void;
}) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [feed, setFeed] = useState<GitHubActivityEvent[]>([]);
  const [notifs, setNotifs] = useState<GitHubNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const c = makeClient(githubToken);
    try {
      const [r, f, n] = await Promise.all([
        c.repos({ perPage: 100 }),
        c.activity({ perPage: 15 }).catch(() => [] as GitHubActivityEvent[]),
        c.notifications({ all: true }).catch(() => [] as GitHubNotification[]),
      ]);
      setRepos(r);
      setFeed(f);
      setNotifs(n);
      onUnread(n.filter((x) => x.unread).length);
    } finally {
      setLoading(false);
    }
  }, [githubToken, onUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const starred = repos.filter((r) => r.stars > 0).length;
  const openPrs = repoCount_openish(repos);
  const topRepos = [...repos].sort((a, b) => b.stars - a.stars).slice(0, 4);

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: tokens.space4, marginBottom: tokens.space5 }}>
        {/* Profile card */}
        <Card style={{ gridColumn: 'auto' }} padded={false}>
          <div style={{ padding: tokens.space5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" width={72} height={72} style={{ borderRadius: '50%', border: `3px solid ${tokens.primary}` }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: tokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>
                {(user?.login ?? '?')[0]?.toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: tokens.fontSizeLg, fontWeight: 700, marginTop: tokens.space3 }}>{user?.name || user?.login}</div>
            <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>@{user?.login}</div>
            {user?.bio && <p style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, margin: `${tokens.space2}px 0`, lineHeight: 1.5 }}>{user.bio}</p>}
            <button onClick={() => onNavigate('profile')} style={{ marginTop: tokens.space2, background: 'transparent', border: `1px solid ${tokens.borderStrong}`, color: tokens.text, padding: `6px 14px`, borderRadius: tokens.radiusMd, fontWeight: 600, fontSize: tokens.fontSizeSm, cursor: 'pointer' }}>
              View profile
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `1px solid ${tokens.border}` }}>
            {[
              { label: 'Repos', value: user?.publicRepos ?? repos.length },
              { label: 'Followers', value: user?.followers ?? 0 },
              { label: 'Following', value: user?.following ?? 0 },
            ].map((s) => (
              <div key={s.label} style={{ padding: tokens.space3, textAlign: 'center', borderLeft: `1px solid ${tokens.border}` }}>
                <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd }}>{s.value}</div>
                <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Stats card */}
        <Card title="Quick stats" actions={loading ? <Spinner size={14} /> : <Badge color={tokens.success}>{repos.length} repos</Badge>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: tokens.space3 }}>
            {[
              { label: 'Total repos', value: repos.length, color: tokens.primary },
              { label: 'Starred', value: starred, color: tokens.warning },
              { label: 'Open issues', value: repos.reduce((a, b) => a + b.openIssues, 0), color: tokens.info },
              { label: 'Forks', value: repos.reduce((a, b) => a + b.forks, 0), color: tokens.success },
            ].map((s) => (
              <div key={s.label} style={{ background: tokens.bgSubtle, borderRadius: tokens.radiusMd, padding: tokens.space3 }}>
                <div style={{ fontSize: tokens.fontSizeXl, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top repos */}
        <Card title="Top repositories" actions={<button onClick={() => onNavigate('repositories')} style={{ background: 'transparent', border: 'none', color: tokens.primary, fontSize: tokens.fontSizeXs, cursor: 'pointer', fontWeight: 600 }}>View all</button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
            {topRepos.map((r) => (
              <div key={r.fullName} style={{ display: 'flex', alignItems: 'center', gap: tokens.space2, padding: tokens.space2, background: tokens.bgSubtle, borderRadius: tokens.radiusMd }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{r.language || 'Repository'}</div>
                </div>
                <Badge color={tokens.warning}>★ {compact(r.stars)}</Badge>
              </div>
            ))}
            {!topRepos.length && <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted, padding: tokens.space2 }}>No repositories yet</div>}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: tokens.space4 }}>
        {/* Activity feed */}
        <Card title="Activity feed">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space6 }}><Spinner /></div>
          ) : feed.length === 0 ? (
            <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted, padding: tokens.space3 }}>No recent activity</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {feed.map((e, i) => (
                <div key={e.id} style={{ display: 'flex', gap: tokens.space3, padding: `${tokens.space2}px 0`, borderBottom: i < feed.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
                  {e.actorAvatar && <img src={e.actorAvatar} alt="" width={28} height={28} style={{ borderRadius: '50%', flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: tokens.fontSizeSm }}>
                      <b>{e.actor}</b>{' '}
                      <span style={{ color: tokens.textSecondary }}>{eventAction(e)}</span>{' '}
                      <b>{e.repo}</b>
                    </div>
                    {e.ref && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontFamily: tokens.fontMono }}>{e.ref}</div>}
                    <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 2 }}>{timeAgo(e.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Notifications */}
        <Card title="Notifications" actions={<button onClick={() => onNavigate('notifications')} style={{ background: 'transparent', border: 'none', color: tokens.primary, fontSize: tokens.fontSizeXs, cursor: 'pointer', fontWeight: 600 }}>See all</button>}>
          {notifs.length === 0 ? (
            <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted, padding: tokens.space3 }}>All caught up! 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {notifs.slice(0, 5).map((n, i) => (
                <div key={n.id} style={{ display: 'flex', gap: tokens.space2, alignItems: 'flex-start', padding: `${tokens.space2}px 0`, borderBottom: i < 4 ? `1px solid ${tokens.border}` : 'none' }}>
                  {n.unread && <div style={{ width: 8, height: 8, borderRadius: '50%', background: tokens.primary, flexShrink: 0, marginTop: 5 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: tokens.fontSizeSm, color: n.unread ? tokens.text : tokens.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.subject.title}</div>
                    <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{n.repositoryFullName} · {timeAgo(n.updatedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function eventAction(e: GitHubActivityEvent): string {
  switch (e.type) {
    case 'PushEvent': return `pushed to`;
    case 'CreateEvent': return `created ${e.refType ?? ''}`;
    case 'DeleteEvent': return `deleted ${e.refType ?? ''}`;
    case 'PullRequestEvent': return `${e.action ?? ''} PR`;
    case 'IssuesEvent': return `${e.action ?? ''} issue`;
    case 'IssueCommentEvent': return `commented on issue`;
    case 'WatchEvent': return `starred`;
    case 'ForkEvent': return `forked`;
    case 'ReleaseEvent': return `released`;
    case 'MemberEvent': return `added to`;
    default: return e.type.replace(/Event$/, '').toLowerCase();
  }
}

function repoCount_openish(repos: GitHubRepo[]): number {
  return repos.length;
}
