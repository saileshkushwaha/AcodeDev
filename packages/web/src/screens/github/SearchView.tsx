import { useState } from 'react';
import { useTheme, Card, Input, Button, Badge, Spinner } from '@acode/ui';
import { useApp } from '../../state/AppProvider';
import type { GitHubRepo, GitHubSearchResult } from '@acode/core';
import { makeClient, compact } from './shared';
import { EmptyState, LoadingSpinner } from '../../components/SharedComponents';

type Mode = 'repositories' | 'users';

export function SearchView() {
  const { tokens } = useTheme();
  const { githubToken } = useApp();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('repositories');
  const [results, setResults] = useState<{ repos: GitHubSearchResult<GitHubRepo>; users: GitHubSearchResult<{ login: string; avatarUrl: string; htmlUrl: string }> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const c = makeClient(githubToken);
      const [repos, users] = await Promise.all([
        c.searchRepos(query, 30),
        c.searchUsers(query, 30),
      ]);
      setResults({ repos, users });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const activeResults = results ? (mode === 'repositories' ? results.repos : results.users) : null;

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 28px)', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ fontWeight: 700, fontSize: tokens.fontSizeLg, marginBottom: tokens.space3 }}>Search GitHub</div>
      <div style={{ display: 'flex', gap: tokens.space2, marginBottom: tokens.space4, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input value={query} onChange={setQuery} placeholder="Search repositories and users..." onEnter={search} />
        </div>
        <Button onClick={search} disabled={!query.trim() || loading}>{loading ? <Spinner size={16} color="#fff" /> : 'Search'}</Button>
      </div>

      {(activeResults || loading) && (
        <div style={{ display: 'flex', gap: tokens.space1, marginBottom: tokens.space3 }}>
          <ModeBtn active={mode === 'repositories'} onClick={() => setMode('repositories')} label={`Repositories ${results ? results.repos.total : ''}`} />
          <ModeBtn active={mode === 'users'} onClick={() => setMode('users')} label={`Users ${results ? results.users.total : ''}`} />
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : !searched ? (
        <EmptyState>Search across GitHub's public repositories and users.</EmptyState>
      ) : !activeResults || (activeResults as { items: unknown[] }).items.length === 0 ? (
        <EmptyState>No results for "{query}"</EmptyState>
      ) : mode === 'repositories' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: tokens.space4 }}>
          {(results?.repos.items ?? []).map((r) => (
            <Card key={r.fullName} style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: tokens.space2 }}>
                <div style={{ fontWeight: 700, fontSize: tokens.fontSizeMd, color: tokens.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fullName}</div>
                <Badge color={tokens.warning}>★ {compact(r.stars)}</Badge>
              </div>
              <div style={{ fontSize: tokens.fontSizeSm, color: tokens.textSecondary, minHeight: 32, lineHeight: 1.5 }}>{r.description || 'No description'}</div>
              <div style={{ marginTop: 'auto', display: 'flex', gap: tokens.space3, flexWrap: 'wrap' }}>
                {r.language && <Badge color={tokens.info}>{r.language}</Badge>}
                <Badge color={tokens.textSecondary}>⑂ {compact(r.forks)}</Badge>
                <Badge color={tokens.info}>⚑ {compact(r.openIssues)}</Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.space2 }}>
          {(results?.users.items ?? []).map((u) => (
            <Card key={u.login} style={{ display: 'flex', alignItems: 'center', gap: tokens.space3 }}>
              {u.avatarUrl && <img src={u.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: '50%' }} />}
              <a href={u.htmlUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: tokens.primary }}>@{u.login}</a>
              <div style={{ flex: 1 }} />
              <Badge color={tokens.textSecondary}>View profile →</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const { tokens } = useTheme();
  return (
    <button onClick={onClick} style={{ padding: `${tokens.space2}px ${tokens.space3}px`, border: 'none', borderBottom: active ? `2px solid ${tokens.primary}` : `2px solid transparent`, background: 'transparent', color: active ? tokens.text : tokens.textSecondary, fontWeight: 600, fontSize: tokens.fontSizeSm, cursor: 'pointer' }}>
      {label}
    </button>
  );
}
