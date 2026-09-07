import { useEffect, useState } from 'react';
import { useTheme, Button, Input, Spinner, Badge, GithubIcon } from '@acode/ui';
import { useApp } from '../state/AppProvider';
import type { GitHubUserInfo } from '@acode/core';
import { makeClient } from './github/shared';
import { OverviewView } from './github/OverviewView';
import { RepositoriesView } from './github/RepositoriesView';
import { PullRequestsView } from './github/PullRequestsView';
import { IssuesView } from './github/IssuesView';
import { ActionsView } from './github/ActionsView';
import { NotificationsView } from './github/NotificationsView';
import { SearchView } from './github/SearchView';
import type { NavId } from './github/GitHubScreenTypes';

export function GitHubScreen() {
  const { tokens } = useTheme();
  const { githubToken, setGithubToken } = useApp();
  const [tokenInput, setTokenInput] = useState(githubToken);
  const [connecting, setConnecting] = useState(false);
  const [user, setUser] = useState<GitHubUserInfo | null>(null);
  const [nav, setNav] = useState<NavId>('overview');
  const [unread, setUnread] = useState(0);
  const [pendingRepo, setPendingRepo] = useState<string | null>(null);
  // A saved token means we treat the account as connected immediately and
  // validate it in the background, so the GitHub UI renders without a flash
  // of the token screen on every navigation.
  const connected = !!githubToken;

  const openRepo = (fullName: string) => {
    setPendingRepo(fullName);
    setNav('repositories');
  };

  // Validate an existing token in the background: refresh the profile and
  // unread count without ever blocking the UI behind the network call.
  useEffect(() => {
    if (!githubToken) return;
    let alive = true;
    const refresh = async () => {
      try {
        const client = makeClient(githubToken);
        const u = await client.user();
        if (!alive) return;
        setUser(u);
        client
          .notifications({ all: true })
          .then((n) => alive && setUnread(n.filter((x) => x.unread).length))
          .catch(() => {});
      } catch {
        /* keep whatever UI is shown; a bad token surfaces only on explicit connect */
      }
    };
    void refresh();
    return () => {
      alive = false;
    };
  }, [githubToken]);

  const connect = async () => {
    setGithubToken(tokenInput);
    setConnecting(true);
    try {
      const client = makeClient(tokenInput);
      const u = await client.user();
      setUser(u);
      client
        .notifications({ all: true })
        .then((n) => setUnread(n.filter((x) => x.unread).length))
        .catch(() => {});
    } catch (e) {
      setGithubToken('');
      alert(`GitHub connection failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setGithubToken('');
    setUser(null);
  };

  if (!connected) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'clamp(24px, 6vw, 72px) 16px' }}>
        <div style={{ width: '100%', maxWidth: 460, animation: 'acode-rise 0.3s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: tokens.surface,
                border: `1px solid ${tokens.borderStrong}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GithubIcon size={24} color={tokens.text} />
            </div>
            <div>
              <div style={{ fontSize: tokens.fontSizeLg, fontWeight: 700 }}>GitHub</div>
              <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textMuted }}>The full developer workspace</div>
            </div>
          </div>

          <div
            style={{
              background: tokens.surface,
              border: `1px solid ${tokens.border}`,
              borderRadius: tokens.radiusLg,
              padding: tokens.space5,
              boxShadow: tokens.shadowMd,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Connect your account</div>
            <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, marginBottom: 16 }}>
              Browse repos and code, review pull requests, track issues and CI, read notifications — all from AcodeDev.
            </div>
            <Input
              label="Personal access token"
              type="password"
              value={tokenInput}
              onChange={setTokenInput}
              monospace
              placeholder="github_pat_..."
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
              <Button onClick={connect} disabled={!tokenInput || connecting}>
                {connecting ? <Spinner size={16} color="#fff" /> : 'Connect'}
              </Button>
            </div>
            <p style={{ fontSize: tokens.fontSizeXs, color: tokens.textMuted, marginTop: 16, lineHeight: 1.5 }}>
              Your token stays in your browser (localStorage) and is only sent to api.github.com. Create one at{' '}
              <span style={{ color: tokens.primary }}>github.com/settings/tokens</span> with <b>repo</b> and <b>workflow</b> scopes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top nav bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: tokens.space2,
          padding: `${tokens.space2}px ${tokens.space4}px`,
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 700, marginRight: tokens.space2, whiteSpace: 'nowrap' }}>GitHub</span>
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'repositories', label: 'Repositories' },
            { id: 'pulls', label: 'Pull requests' },
            { id: 'issues', label: 'Issues' },
            { id: 'actions', label: 'Actions' },
            { id: 'notifications', label: 'Notifications' },
            { id: 'search', label: 'Search' },
          ] as { id: NavId; label: string }[]
        ).map((n) => (
          <button
            key={n.id}
            onClick={() => {
              if (n.id === 'repositories') setPendingRepo(null);
              setNav(n.id);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: tokens.space1,
              padding: `${tokens.space2}px ${tokens.space3}px`,
              borderRadius: tokens.radiusMd,
              border: 'none',
              background: nav === n.id ? tokens.primary : 'transparent',
              color: nav === n.id ? tokens.primaryForeground : tokens.textSecondary,
              fontWeight: 600,
              fontSize: tokens.fontSizeSm,
              fontFamily: tokens.fontSans,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {n.label}
            {n.id === 'notifications' && unread > 0 && (
              <Badge color={tokens.danger} style={{ padding: '0 6px' }}>
                {unread}
              </Badge>
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {user && (
          <button
            onClick={disconnect}
            title="Disconnect"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: tokens.space2,
              background: 'transparent',
              border: `1px solid ${tokens.borderStrong}`,
              borderRadius: tokens.radiusFull,
              padding: '3px 6px 3px 3px',
              cursor: 'pointer',
            }}
          >
            {user.avatarUrl && <img src={user.avatarUrl} alt="" width={26} height={26} style={{ borderRadius: '50%' }} />}
            <span style={{ fontSize: tokens.fontSizeXs, fontWeight: 600, color: tokens.textSecondary }}>@{user.login}</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {nav === 'overview' && <OverviewView user={user} onNavigate={setNav} onUnread={setUnread} onOpenRepo={openRepo} />}
        {nav === 'repositories' && (
          <RepositoriesView initialRepo={pendingRepo ?? undefined} onInitialRepoConsumed={() => setPendingRepo(null)} />
        )}
        {nav === 'pulls' && <PullRequestsView />}
        {nav === 'issues' && <IssuesView />}
        {nav === 'actions' && <ActionsView />}
        {nav === 'notifications' && <NotificationsView onUnread={setUnread} />}
        {nav === 'search' && <SearchView />}
      </div>
    </div>
  );
}
