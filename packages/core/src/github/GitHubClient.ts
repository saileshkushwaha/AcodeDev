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
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: string;
  user: string;
  updatedAt: string;
  merged: boolean;
  additions: number;
  deletions: number;
  htmlUrl: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  user: string;
  comments: number;
  createdAt: string;
  htmlUrl: string;
}

export interface GitHubWorkflowRun {
  id: string;
  name: string;
  headBranch: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
}

export interface GitHubUserInfo {
  login: string;
  name: string | null;
  avatarUrl: string;
  followers: number;
  publicRepos: number;
}

export interface GitHubClientOpts {
  token: string;
}

/** Minimal GitHub REST client used for the project dashboard. */
export class GitHubClient {
  private token: string;
  private apiBase = 'https://api.github.com';

  constructor(opts: GitHubClientOpts) {
    this.token = opts.token;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) throw new Error(`GitHub error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async user(): Promise<GitHubUserInfo> {
    const u = await this.request<{
      login: string; name: string | null; avatar_url: string; followers: number; public_repos: number;
    }>('/user');
    return { login: u.login, name: u.name, avatarUrl: u.avatar_url, followers: u.followers, publicRepos: u.public_repos };
  }

  async repos(): Promise<GitHubRepo[]> {
    const r = await this.request<
      {
        name: string; full_name: string; description: string | null; language: string | null;
        stargazers_count: number; forks_count: number; open_issues_count: number; default_branch: string;
        updated_at: string; private: boolean; html_url: string;
      }[]
    >('/user/repos?per_page=100&sort=updated');
    return r.map((x) => ({
      name: x.name,
      fullName: x.full_name,
      description: x.description,
      language: x.language,
      stars: x.stargazers_count,
      forks: x.forks_count,
      openIssues: x.open_issues_count,
      defaultBranch: x.default_branch,
      updatedAt: x.updated_at,
      private: x.private,
      htmlUrl: x.html_url,
    }));
  }

  async pullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    const r = await this.request<
      {
        number: number; title: string; state: string; user: { login: string };
        updated_at: string; merged: boolean; additions: number; deletions: number; html_url: string;
      }[]
    >(`/repos/${owner}/${repo}/pulls?state=all&per_page=50`);
    return r.map((x) => ({
      number: x.number,
      title: x.title,
      state: x.state,
      user: x.user?.login ?? 'unknown',
      updatedAt: x.updated_at,
      merged: x.merged,
      additions: x.additions,
      deletions: x.deletions,
      htmlUrl: x.html_url,
    }));
  }

  async issues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const r = await this.request<
      {
        number: number; title: string; state: string; labels: { name: string }[];
        user: { login: string }; comments: number; created_at: string; html_url: string;
      }[]
    >(`/repos/${owner}/${repo}/issues?state=open&per_page=50`);
    return r.map((x) => ({
      number: x.number,
      title: x.title,
      state: x.state,
      labels: (x.labels ?? []).map((l) => l.name),
      user: x.user?.login ?? 'unknown',
      comments: x.comments,
      createdAt: x.created_at,
      htmlUrl: x.html_url,
    }));
  }

  async workflowRuns(owner: string, repo: string): Promise<GitHubWorkflowRun[]> {
    try {
      const r = await this.request<{
        workflow_runs: {
          id: number; name: string; head_branch: string; status: string; conclusion: string | null; created_at: string;
        }[];
      }>(`/repos/${owner}/${repo}/actions/runs?per_page=20`);
      return r.workflow_runs.map((x) => ({
        id: String(x.id),
        name: x.name,
        headBranch: x.head_branch,
        status: x.status,
        conclusion: x.conclusion,
        createdAt: x.created_at,
      }));
    } catch {
      return [];
    }
  }
}
