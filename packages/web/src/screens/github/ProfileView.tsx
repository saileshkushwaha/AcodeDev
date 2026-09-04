import { useEffect, useState } from 'react';
import { useTheme, Card, Badge, Spinner } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubUserInfo, GitHubOrg, GitHubActivityEvent } from '@acode/core';
import { makeClient, timeAgo, shortDate } from './shared';

export function ProfileView({ user }: { user: GitHubUserInfo | null }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [orgs, setOrgs] = useState<GitHubOrg[]>([]);
  const [feed, setFeed] = useState<GitHubActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const c = makeClient(githubToken);
    Promise.all([
      c.activity({ perPage: 20 }).catch(() => [] as GitHubActivityEvent[]),
      c.orgs().catch(() => [] as GitHubOrg[]),
    ])
      .then(([f, o]) => {
        setFeed(f);
        setOrgs(o);
      })
      .finally(() => setLoading(false));
  }, [githubToken]);

  const login = user?.login ?? 'you';

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: tokens.space4, marginBottom: tokens.space4 }}>
        <Card padded={false}>
          <div style={{ padding: tokens.space5, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            {user?.avatarUrl && <img src={user.avatarUrl} alt="" width={96} height={96} style={{ borderRadius: '50%', border: `4px solid ${tokens.primary}` }} />}
            <div style={{ fontSize: tokens.fontSizeXl, fontWeight: 700, marginTop: tokens.space3 }}>{user?.name || login}</div>
            <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>@{login}</div>
            {user?.bio && <p style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, margin: `${tokens.space2}px 0`, lineHeight: 1.5 }}>{user.bio}</p>}
            <div style={{ display: 'flex', gap: tokens.space2, marginTop: tokens.space2, flexWrap: 'wrap', justifyContent: 'center' }}>
              {user?.location && <Badge color={tokens.textSecondary}>📍 {user.location}</Badge>}
              {user?.company && <Badge color={tokens.textSecondary}>🏢 {user.company}</Badge>}
              {user?.blog && <a href={user.blog} target="_blank" rel="noreferrer"><Badge color={tokens.primary}>🔗 {user.blog.replace(/^https?:\/\//, '')}</Badge></a>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', borderTop: `1px solid ${tokens.border}` }}>
            {[
              { label: 'Followers', value: user?.followers ?? 0 },
              { label: 'Following', value: user?.following ?? 0 },
              { label: 'Public repos', value: user?.publicRepos ?? 0 },
              { label: 'Member since', value: user ? shortDate(user.createdAt) : '—' },
            ].map((s) => (
              <div key={s.label} style={{ padding: tokens.space3, textAlign: 'center', borderLeft: `1px solid ${tokens.border}` }}>
                <div style={{ fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{s.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Organizations">
          {loading ? <Spinner size={16} /> : orgs.length === 0 ? (
            <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>No public organizations</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space3 }}>
              {orgs.map((o) => (
                <div key={o.login} style={{ display: 'flex', alignItems: 'center', gap: tokens.space3 }}>
                  {o.avatarUrl && <img src={o.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: tokens.radiusMd }} />}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: tokens.fontSizeSm }}>{o.login}</div>
                    {o.description && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>{o.description}</div>}
                  </div>
                  <div style={{ flex: 1 }} />
                  <Badge color={tokens.primary}>Member</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Public activity">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space6 }}><Spinner /></div>
        ) : feed.length === 0 ? (
          <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>No recent activity</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {feed.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', gap: tokens.space3, padding: `${tokens.space2}px 0`, borderBottom: i < feed.length - 1 ? `1px solid ${tokens.border}` : 'none' }}>
                {e.actorAvatar && <img src={e.actorAvatar} alt="" width={30} height={30} style={{ borderRadius: '50%' }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: tokens.fontSizeSm }}>
                    <b>{e.actor}</b> <span style={{ color: tokens.textSecondary }}>{actionLabel(e)}</span> <b>{e.repo}</b>
                  </div>
                  {e.ref && <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, fontFamily: tokens.fontMono }}>{e.ref}</div>}
                  <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 2 }}>{timeAgo(e.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: tokens.space4 }}>
        Compact view — for the full bio, followers list, and contribution graph, open your GitHub profile.
      </div>
    </div>
  );
}

function actionLabel(e: GitHubActivityEvent): string {
  switch (e.type) {
    case 'PushEvent': return `pushed to`;
    case 'CreateEvent': return `created ${e.refType ?? ''}`;
    case 'DeleteEvent': return `deleted ${e.refType ?? ''}`;
    case 'PullRequestEvent': return `${e.action ?? ''} PR`;
    case 'IssuesEvent': return `${e.action ?? ''} issue`;
    case 'IssueCommentEvent': return `commented on issue`;
    case 'WatchEvent': return `starred`;
    case 'ForkEvent': return `forked`;
    default: return e.type.replace(/Event$/, '').toLowerCase();
  }
}
