import { useEffect, useState, useCallback } from 'react';
import { useTheme, Card, Button, Spinner } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubNotification } from '@acode/core';
import { makeClient, timeAgo } from './shared';

export function NotificationsView({ onUnread }: { onUnread: (n: number) => void }) {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [notifs, setNotifs] = useState<GitHubNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const c = makeClient(githubToken);
      const n = await c.notifications({ all: showAll });
      setNotifs(n);
      onUnread(n.filter((x) => x.unread).length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [githubToken, showAll, onUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    try {
      await makeClient(githubToken).markNotificationRead(id);
      setNotifs((prev) => prev.filter((n) => n.id !== id));
      onUnread(notifs.filter((n) => n.id !== id && n.unread).length);
    } catch (e) {
      console.error(e);
    }
  };

  const markAllRead = async () => {
    try {
      await makeClient(githubToken).markAllNotificationsRead();
      void load();
    } catch (e) {
      console.error(e);
    }
  };

  const unread = notifs.filter((n) => n.unread).length;

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space3, marginBottom: tokens.space4, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: tokens.fontSizeLg }}>Notifications</span>
        {!showAll && unread > 0 && <span style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>{unread} unread</span>}
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: tokens.space1, cursor: 'pointer', fontSize: tokens.fontSizeSm, color: tokens.textSecondary }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show read
        </label>
        <Button variant="secondary" size="sm" onClick={markAllRead}>Mark all read</Button>
        <Button variant="secondary" size="sm" onClick={() => void load()}>{loading ? <Spinner size={14} /> : 'Refresh'}</Button>
      </div>

      {loading && notifs.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: tokens.space8 }}><Spinner size={28} /></div>
      ) : notifs.length === 0 ? (
        <div style={{ textAlign: 'center', color: tokens.textMuted, padding: tokens.space8 }}>
          {showAll ? 'No notifications' : 'All caught up! 🎉'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
          {notifs.map((n) => (
            <Card key={n.id} style={{ opacity: n.unread ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.space3 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.unread ? tokens.primary : 'transparent', border: n.unread ? 'none' : `1px solid ${tokens.borderStrong}`, marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: tokens.fontSizeSm, fontWeight: 600 }}>{n.subject.title}</div>
                  <div style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 2 }}>
                    {typeLabel(n.subject.type)} · {n.repositoryFullName} · {timeAgo(n.updatedAt)}
                  </div>
                  {n.reason && <span style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted }}>Reason: {n.reason.replace(/_/g, ' ')}</span>}
                </div>
                {n.unread && (
                  <Button variant="secondary" size="sm" onClick={() => void markRead(n.id)}>Mark read</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function typeLabel(t: string): string {
  switch (t) {
    case 'Issue': return 'Issue';
    case 'PullRequest': return 'Pull request';
    case 'Release': return 'Release';
    case 'Discussion': return 'Discussion';
    case 'RepositoryVulnerabilityAlert': return 'Security alert';
    default: return t;
  }
}
