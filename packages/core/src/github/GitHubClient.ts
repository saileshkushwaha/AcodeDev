/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GitHubRepo {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  defaultBranch: string;
  updatedAt: string;
  private: boolean;
  htmlUrl: string;
  fork: boolean;
  topics: string[];
  watchers: number;
  archived: boolean;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  user: string;
  userAvatar: string;
  updatedAt: string;
  createdAt: string;
  merged: boolean;
  additions: number;
  deletions: number;
  htmlUrl: string;
  body: string | null;
  baseRef: string;
  headRef: string;
  comments: number;
  reviewComments: number;
  draft: boolean;
  labels: { name: string; color: string }[];
  headSha: string;
  mergedAt: string | null;
  mergedBy: string | null;
  authorAssociation: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: { name: string; color: string }[];
  user: string;
  userAvatar: string;
  comments: number;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  body: string | null;
  assignees: string[];
  pullRequest: boolean;
  authorAssociation: string;
}

export interface GitHubWorkflowRun {
  id: string;
  name: string;
  event: string;
  headBranch: string;
  actor: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  headSha: string;
  runNumber: number;
}

export interface GitHubUserInfo {
  login: string;
  name: string | null;
  avatarUrl: string;
  followers: number;
  following: number;
  publicRepos: number;
  blog: string | null;
  location: string | null;
  bio: string | null;
  company: string | null;
  twitter: string | null;
  createdAt: string;
}

export interface GitHubRelease {
  id: string;
  tag: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  author: string;
  createdAt: string;
  publishedAt: string | null;
  body: string | null;
  htmlUrl: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  sha: string;
  commitMessage: string;
  commitDate: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  authorAvatar: string;
  date: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'submodule' | 'symlink';
  size: number;
  sha: string;
  downloadUrl: string | null;
  htmlUrl: string;
}

export interface GitHubComment {
  id: string;
  user: string;
  userAvatar: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubNotification {
  id: string;
  reason: string;
  unread: boolean;
  updatedAt: string;
  subject: { title: string; type: string; url: string; state?: string };
  repository: string;
  repositoryFullName: string;
}

export interface GitHubActivityEvent {
  id: string;
  type: string;
  actor: string;
  actorAvatar: string;
  repo: string;
  createdAt: string;
  payloadType: string;
  action: string | null;
  ref: string | null;
  refType: string | null;
}

export interface GitHubOrg {
  login: string;
  avatarUrl: string;
  description: string | null;
}

export interface GitHubSearchResult<T> {
  total: number;
  items: T[];
}

export interface GitHubClientOpts {
  token: string;
}

type AnyJson = Record<string, any>;

/** Full-featured GitHub REST client for the project dashboard. */
export class GitHubClient {
  private token: string;
  private apiBase = 'https://api.github.com';

  constructor(opts: GitHubClientOpts) {
    this.token = opts.token;
  }

  private async request<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `GitHub error ${res.status}`;
      try {
        const err = (await res.json()) as { message?: string };
        if (err.message) msg += `: ${err.message}`;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  // ---------- Auth ----------
  async user(): Promise<GitHubUserInfo> {
    const u = await this.request<AnyJson>('/user');
    return {
      login: u.login,
      name: u.name ?? null,
      avatarUrl: u.avatar_url,
      followers: u.followers ?? 0,
      following: u.following ?? 0,
      publicRepos: u.public_repos ?? 0,
      blog: u.blog ?? null,
      location: u.location ?? null,
      bio: u.bio ?? null,
      company: u.company ?? null,
      twitter: u.twitter_username ?? null,
      createdAt: u.created_at,
    };
  }

  // ---------- Repositories ----------
  async repos(opt?: { type?: string; perPage?: number; sort?: string }): Promise<GitHubRepo[]> {
    const r = await this.request<AnyJson[]>(`/user/repos?per_page=${opt?.perPage ?? 100}&sort=${opt?.sort ?? 'updated'}${opt?.type ? `&type=${opt.type}` : ''}`);
    return r.map((x) => ({
      name: x.name,
      fullName: x.full_name,
      description: x.description ?? null,
      language: x.language ?? null,
      stars: x.stargazers_count ?? 0,
      forks: x.forks_count ?? 0,
      openIssues: x.open_issues_count ?? 0,
      defaultBranch: x.default_branch,
      updatedAt: x.updated_at,
      private: x.private,
      htmlUrl: x.html_url,
      fork: x.fork,
      topics: x.topics ?? [],
      watchers: x.subscribers_count ?? 0,
      archived: x.archived,
    }));
  }

  async repo(owner: string, repo: string): Promise<GitHubRepo> {
    const x = await this.request<AnyJson>(`/repos/${owner}/${repo}`);
    return {
      name: x.name,
      fullName: x.full_name,
      description: x.description ?? null,
      language: x.language ?? null,
      stars: x.stargazers_count ?? 0,
      forks: x.forks_count ?? 0,
      openIssues: x.open_issues_count ?? 0,
      defaultBranch: x.default_branch,
      updatedAt: x.updated_at,
      private: x.private,
      htmlUrl: x.html_url,
      fork: x.fork,
      topics: x.topics ?? [],
      watchers: x.subscribers_count ?? 0,
      archived: x.archived,
    };
  }

  async createRepo(input: { name: string; description?: string; private?: boolean; autoInit?: boolean; initializeReadme?: boolean }): Promise<GitHubRepo> {
    const body = { name: input.name, description: input.description ?? '', private: input.private ?? false, auto_init: input.autoInit ?? false };
    const x = await this.request<AnyJson>('/user/repos', 'POST', body);
    return {
      name: x.name, fullName: x.full_name, description: x.description ?? null, language: x.language ?? null,
      stars: x.stargazers_count ?? 0, forks: x.forks_count ?? 0, openIssues: x.open_issues_count ?? 0,
      defaultBranch: x.default_branch, updatedAt: x.updated_at, private: x.private, htmlUrl: x.html_url, fork: x.fork,
      topics: x.topics ?? [], watchers: x.subscribers_count ?? 0, archived: x.archived,
    };
  }

  async deleteRepo(owner: string, repo: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}`, 'DELETE');
  }

  async starRepo(owner: string, repo: string): Promise<void> {
    await this.request(`/user/starred/${owner}/${repo}`, 'PUT');
  }
  async unstarRepo(owner: string, repo: string): Promise<void> {
    await this.request(`/user/starred/${owner}/${repo}`, 'DELETE');
  }
  async isStarred(owner: string, repo: string): Promise<boolean> {
    try {
      await this.request(`/user/starred/${owner}/${repo}`);
      return true;
    } catch {
      return false;
    }
  }
  async watchRepo(owner: string, repo: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/subscription`, 'PUT', { subscribed: true });
  }

  // ---------- Content / File tree ----------
  async contents(owner: string, repo: string, path = '', ref?: string): Promise<GitHubContent[]> {
    const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/contents/${path}${refQ}`);
    return r.map((x) => ({
      name: x.name, path: x.path, type: x.type, size: x.size ?? 0, sha: x.sha,
      downloadUrl: x.download_url ?? null, htmlUrl: x.html_url,
    }));
  }

  async fileContent(owner: string, repo: string, path: string, ref?: string): Promise<{ content: string; encoding: string; size: number }> {
    const refQ = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const x = await this.request<AnyJson>(`/repos/${owner}/${repo}/contents/${path}${refQ}`);
    return { content: atob(x.content ?? ''), encoding: x.encoding, size: x.size ?? 0 };
  }

  async branches(owner: string, repo: string): Promise<GitHubBranch[]> {
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/branches?per_page=100`);
    return Promise.all(
      r.slice(0, 20).map(async (b) => {
        const c = await this.request<AnyJson>(`/repos/${owner}/${repo}/commits/${b.name}?per_page=1`).catch(() => null);
        const head = b.commit as { sha: string };
        return {
          name: b.name,
          protected: b.protected,
          sha: head.sha,
          commitMessage: c?.commit?.message ?? '',
          commitDate: c?.commit?.author?.date ?? '',
        };
      }),
    );
  }

  async commits(owner: string, repo: string, branch?: string, perPage = 30): Promise<GitHubCommit[]> {
    const branchQ = branch ? `?sha=${encodeURIComponent(branch)}&` : '?';
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/commits${branchQ}per_page=${perPage}`);
    return r.map((x) => ({
      sha: x.sha,
      message: x.commit?.message ?? '',
      author: x.commit?.author?.name ?? x.author?.login ?? 'unknown',
      authorAvatar: x.author?.avatar_url ?? '',
      date: x.commit?.author?.date ?? x.commit?.committer?.date ?? '',
    }));
  }

  async releases(owner: string, repo: string): Promise<GitHubRelease[]> {
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/releases?per_page=30`);
    return r.map((x) => ({
      id: String(x.id), tag: x.tag_name, name: x.name ?? null, draft: x.draft, prerelease: x.prerelease,
      author: x.author?.login ?? 'unknown', createdAt: x.created_at, publishedAt: x.published_at, body: x.body ?? null, htmlUrl: x.html_url,
    }));
  }

  async readme(owner: string, repo: string): Promise<{ content: string; name: string } | null> {
    try {
      const x = await this.request<AnyJson>(`/repos/${owner}/${repo}/readme`);
      return { content: atob(x.content ?? ''), name: x.name ?? 'README.md' };
    } catch {
      return null;
    }
  }

  // ---------- Pull Requests ----------
  async pullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all', perPage = 50): Promise<GitHubPullRequest[]> {
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=${perPage}`);
    return r.map((x) => ({
      number: x.number, title: x.title, state: x.state, user: x.user?.login ?? 'unknown', userAvatar: x.user?.avatar_url ?? '',
      updatedAt: x.updated_at, createdAt: x.created_at, merged: !!x.merged_at, additions: x.additions ?? 0, deletions: x.deletions ?? 0,
      htmlUrl: x.html_url, body: x.body ?? null, baseRef: x.base?.ref ?? '', headRef: x.head?.ref ?? '',
      comments: x.comments ?? 0, reviewComments: x.review_comments ?? 0, draft: !!x.draft,
      labels: (x.labels ?? []).map((l: AnyJson) => ({ name: l.name, color: l.color })),
      headSha: x.head?.sha ?? '', mergedAt: x.merged_at ?? null, mergedBy: x.merged_by?.login ?? null, authorAssociation: x.author_association,
    }));
  }

  async pullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    const x = await this.request<AnyJson>(`/repos/${owner}/${repo}/pulls/${number}`);
    return {
      number: x.number, title: x.title, state: x.state, user: x.user?.login ?? 'unknown', userAvatar: x.user?.avatar_url ?? '',
      updatedAt: x.updated_at, createdAt: x.created_at, merged: !!x.merged_at, additions: x.additions ?? 0, deletions: x.deletions ?? 0,
      htmlUrl: x.html_url, body: x.body ?? null, baseRef: x.base?.ref ?? '', headRef: x.head?.ref ?? '',
      comments: x.comments ?? 0, reviewComments: x.review_comments ?? 0, draft: !!x.draft,
      labels: (x.labels ?? []).map((l: AnyJson) => ({ name: l.name, color: l.color })),
      headSha: x.head?.sha ?? '', mergedAt: x.merged_at ?? null, mergedBy: x.merged_by?.login ?? null, authorAssociation: x.author_association,
    };
  }

  async mergePullRequest(owner: string, repo: string, number: number, commitMessage?: string, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/pulls/${number}/merge`, 'PUT', { commit_message: commitMessage ?? '', merge_method: mergeMethod });
  }

  async createComment(owner: string, repo: string, number: number, body: string): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${number}/comments`, 'POST', { body });
  }

  async createReview(owner: string, repo: string, number: number, body: string, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, 'POST', { body, event });
  }

  // ---------- Issues ----------
  async issues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', perPage = 50): Promise<GitHubIssue[]> {
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${perPage}`);
    return r.map((x) => ({
      number: x.number, title: x.title, state: x.state,
      labels: (x.labels ?? []).map((l: AnyJson) => ({ name: l.name, color: l.color })),
      user: x.user?.login ?? 'unknown', userAvatar: x.user?.avatar_url ?? '', comments: x.comments ?? 0,
      createdAt: x.created_at, updatedAt: x.updated_at, htmlUrl: x.html_url, body: x.body ?? null,
      assignees: (x.assignees ?? []).map((a: AnyJson) => a.login), pullRequest: !!x.pull_request, authorAssociation: x.author_association,
    }));
  }

  async issue(owner: string, repo: string, number: number): Promise<GitHubIssue> {
    const x = await this.request<AnyJson>(`/repos/${owner}/${repo}/issues/${number}`);
    return {
      number: x.number, title: x.title, state: x.state,
      labels: (x.labels ?? []).map((l: AnyJson) => ({ name: l.name, color: l.color })),
      user: x.user?.login ?? 'unknown', userAvatar: x.user?.avatar_url ?? '', comments: x.comments ?? 0,
      createdAt: x.created_at, updatedAt: x.updated_at, htmlUrl: x.html_url, body: x.body ?? null,
      assignees: (x.assignees ?? []).map((a: AnyJson) => a.login), pullRequest: !!x.pull_request, authorAssociation: x.author_association,
    };
  }

  async createIssue(owner: string, repo: string, input: { title: string; body?: string; labels?: string[] }): Promise<GitHubIssue> {
    const x = await this.request<AnyJson>(`/repos/${owner}/${repo}/issues`, 'POST', { title: input.title, body: input.body ?? '', labels: input.labels ?? [] });
    return this.issue(owner, repo, x.number);
  }

  async updateIssueState(owner: string, repo: string, number: number, state: 'open' | 'closed'): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${number}`, 'PATCH', { state });
  }

  async updateIssue(owner: string, repo: string, number: number, input: { title?: string; body?: string; labels?: string[] }): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/issues/${number}`, 'PATCH', {
      ...(input.title ? { title: input.title } : {}),
      ...(input.body ? { body: input.body } : {}),
      ...(input.labels ? { labels: input.labels } : {}),
    });
  }

  async comments(owner: string, repo: string, number: number): Promise<GitHubComment[]> {
    const r = await this.request<AnyJson[]>(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=50`);
    return r.map((x) => ({
      id: String(x.id), user: x.user?.login ?? 'unknown', userAvatar: x.user?.avatar_url ?? '',
      body: x.body ?? '', createdAt: x.created_at, updatedAt: x.updated_at,
    }));
  }

  // ---------- Actions / CI ----------
  async workflowRuns(owner: string, repo: string, perPage = 30): Promise<GitHubWorkflowRun[]> {
    try {
      const r = await this.request<{ workflow_runs: AnyJson[] }>(`/repos/${owner}/${repo}/actions/runs?per_page=${perPage}`);
      return r.workflow_runs.map((x) => ({
        id: String(x.id), name: x.name, event: x.event, headBranch: x.head_branch, actor: x.actor?.login ?? '',
        status: x.status, conclusion: x.conclusion, createdAt: x.created_at, updatedAt: x.updated_at,
        headSha: x.head_sha, runNumber: x.run_number,
      }));
    } catch {
      return [];
    }
  }

  async workflowRunJobs(owner: string, repo: string, runId: string): Promise<{ id: string; name: string; status: string; conclusion: string | null; steps: { name: string; status: string; conclusion: string | null }[] }[]> {
    try {
      const r = await this.request<{ jobs: AnyJson[] }>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`);
      return r.jobs.map((j) => ({
        id: String(j.id),
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        steps: (j.steps ?? []).map((s: AnyJson) => ({ name: s.name, status: s.status, conclusion: s.conclusion })),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetch the plain-text logs for a workflow run. GitHub's run-level
   * `/logs` endpoint returns a compressed archive, so we pull per-job
   * logs (which return readable text) and concatenate them.
   */
  async workflowRunLogs(owner: string, repo: string, runId: string): Promise<string> {
    try {
      const jobs = await this.workflowRunJobs(owner, repo, runId);
      if (!jobs.length) return 'No jobs found for this run.';
      const parts: string[] = [];
      for (const job of jobs) {
        parts.push(`===== JOB: ${job.name || job.id} (${job.conclusion ?? job.status}) =====`);
        const log = await this.fetchJobLog(owner, repo, job.id);
        parts.push(log.trim());
      }
      return parts.join('\n\n');
    } catch (e) {
      return `Failed to fetch logs: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  private async fetchJobLog(owner: string, repo: string, jobId: string): Promise<string> {
    const res = await fetch(`${this.apiBase}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json' },
      redirect: 'follow',
    });
    if (!res.ok) return `(unable to fetch job log: ${res.status})`;
    const text = await res.text();
    return text || '(no log output)';
  }

  // ---------- Notifications ----------
  async notifications(opt?: { all?: boolean; participating?: boolean }): Promise<GitHubNotification[]> {
    const params = new URLSearchParams();
    if (opt?.all) params.set('all', 'true');
    if (opt?.participating) params.set('participating', 'true');
    const q = params.toString() ? `?${params.toString()}` : '';
    const r = await this.request<AnyJson[]>(`/notifications${q}`);
    return r.map((x) => ({
      id: x.id, reason: x.reason, unread: x.unread, updatedAt: x.updated_at,
      subject: { title: x.subject?.title ?? '', type: x.subject?.type ?? '', url: x.subject?.url ?? '', state: x.subject?.state },
      repository: x.repository?.name ?? '', repositoryFullName: x.repository?.full_name ?? '',
    }));
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.request(`/notifications/threads/${id}`, 'PATCH');
  }
  async markAllNotificationsRead(): Promise<void> {
    await this.request('/notifications', 'PUT', {});
  }
  async unreadNotificationsCount(): Promise<number> {
    const r = await this.request<AnyJson[]>(`/notifications?per_page=100`);
    return r.filter((n) => n.unread).length;
  }

  // ---------- Activity feed ----------
  async activity(opt?: { user?: string; perPage?: number }): Promise<GitHubActivityEvent[]> {
    const user = opt?.user || 'user';
    const path = user === 'user' ? '/user/events' : `/users/${user}/events`;
    const r = await this.request<AnyJson[]>(`${path}?per_page=${opt?.perPage ?? 20}`);
    return r.map((x) => ({
      id: x.id, type: x.type, actor: x.actor?.login ?? '', actorAvatar: x.actor?.avatar_url ?? '',
      repo: x.repo?.name ?? '', createdAt: x.created_at,
      payloadType: x.payload?.action ?? '', action: x.payload?.action ?? null,
      ref: x.payload?.ref ?? null, refType: x.payload?.ref_type ?? null,
    }));
  }

  // ---------- Search ----------
  async searchRepos(query: string, perPage = 30): Promise<GitHubSearchResult<GitHubRepo>> {
    const r = await this.request<{ total_count: number; items: AnyJson[] }>(`/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}`);
    return {
      total: r.total_count,
      items: r.items.map((x) => ({
        name: x.name, fullName: x.full_name, description: x.description ?? null, language: x.language ?? null,
        stars: x.stargazers_count ?? 0, forks: x.forks_count ?? 0, openIssues: x.open_issues_count ?? 0,
        defaultBranch: x.default_branch ?? 'main', updatedAt: x.updated_at, private: x.private ?? false, htmlUrl: x.html_url,
        fork: x.fork ?? false, topics: x.topics ?? [], watchers: x.watchers_count ?? 0, archived: x.archived ?? false,
      })),
    };
  }

  async searchUsers(query: string, perPage = 30): Promise<GitHubSearchResult<{ login: string; avatarUrl: string; htmlUrl: string }>> {
    const r = await this.request<{ total_count: number; items: AnyJson[] }>(`/search/users?q=${encodeURIComponent(query)}&per_page=${perPage}`);
    return {
      total: r.total_count,
      items: r.items.map((x) => ({ login: x.login, avatarUrl: x.avatar_url, htmlUrl: x.html_url })),
    };
  }

  // ---------- Orgs ----------
  async orgs(): Promise<GitHubOrg[]> {
    const r = await this.request<AnyJson[]>(`/user/orgs?per_page=100`);
    return r.map((x) => ({ login: x.login, avatarUrl: x.avatar_url, description: x.description ?? null }));
  }

  async rateLimit(): Promise<{ limit: number; remaining: number; reset: number }> {
    try {
      const r = await this.request<{ rate: { limit: number; remaining: number; reset: number } }>('/rate_limit');
      return r.rate;
    } catch {
      return { limit: 0, remaining: 0, reset: 0 };
    }
  }
}
