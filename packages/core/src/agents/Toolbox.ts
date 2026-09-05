import type { AgentTool } from './AgentEngine';

/**
 * Built-in tools an agent can use. Each returns a string payload
 * that is fed back into the model conversation.
 */
export class Toolbox {
  static webSearch(): AgentTool {
    return {
      name: 'web_search',
      description: 'Search the web for up-to-date information.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query' } },
        required: ['query'],
      },
      execute: async (args: Record<string, unknown>) => {
        const q = String(args.query ?? '');
        try {
          const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json`);
          if (!res.ok) return `Search failed: ${res.status}`;
          const data = await res.json();
          const results = (data.RelatedTopics ?? [])
            .filter((t: { Text?: string; FirstURL?: string }) => t.Text)
            .slice(0, 5)
            .map((t: { Text?: string; FirstURL?: string }) => `- ${t.Text} (${t.FirstURL})`);
          return results.length ? results.join('\n') : 'No results.';
        } catch {
          return 'Search unavailable.';
        }
      },
    };
  }

  static calculator(): AgentTool {
    return {
      name: 'calculator',
      description: 'Evaluate a math expression safely.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'The math expression to evaluate' } },
        required: ['expression'],
      },
      execute: async (args: Record<string, unknown>) => {
        const expr = String(args.expression ?? '');
        try {
          const fn = new Function(`"use strict"; return (${expr});`);
          return String(fn());
        } catch {
          return 'Invalid expression.';
        }
      },
    };
  }

  static codeInterpreter(): AgentTool {
    return {
      name: 'code_interpreter',
      description: 'Run a short JavaScript snippet and return the result (for quick calculations/logic).',
      parameters: {
        type: 'object',
        properties: { code: { type: 'string', description: 'The JavaScript code to execute' } },
        required: ['code'],
      },
      execute: async (args: Record<string, unknown>) => {
        const code = String(args.code ?? '');
        try {
          const fn = new Function(`"use strict"; return (async () => { ${code} })();`);
          const out = await fn();
          return typeof out === 'object' ? JSON.stringify(out) : String(out);
        } catch (e) {
          return `Error: ${e instanceof Error ? e.message : String(e)}`;
        }
      },
    };
  }

  static fetchUrl(): AgentTool {
    return {
      name: 'fetch_url',
      description: 'Fetch and return the text content of a URL.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'The URL to fetch' } },
        required: ['url'],
      },
      execute: async (args: Record<string, unknown>) => {
        const url = String(args.url ?? '');
        try {
          const res = await fetch(url);
          if (!res.ok) return `Fetch failed: ${res.status}`;
          const text = await res.text();
          return text.slice(0, 8000);
        } catch {
          return 'Fetch unavailable.';
        }
      },
    };
  }

  static all(): AgentTool[] {
    return [this.webSearch(), this.calculator(), this.codeInterpreter(), this.fetchUrl()];
  }

  /** All tools including proxy-based filesystem/shell/git tools. */
  static allWithProxy(proxyBase: string): AgentTool[] {
    return [...this.all(), ...this.proxyTools(proxyBase)];
  }

  /** Tools that require a local relay proxy for filesystem/shell/git access. */
  static proxyTools(proxyBase: string): AgentTool[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file. Returns the full text content.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File path relative to workspace root or absolute' } },
          required: ['path'],
        },
        execute: async (args) => {
          const filePath = String(args.path ?? '');
          try {
            const res = await fetch(`${proxyBase}/fs/read?path=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            if (data.error) return `Error: ${data.error}`;
            return data.content || '(empty file)';
          } catch (e) {
            return `Error reading file: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace root or absolute' },
            content: { type: 'string', description: 'The content to write to the file' },
          },
          required: ['path', 'content'],
        },
        execute: async (args) => {
          const filePath = String(args.path ?? '');
          const content = String(args.content ?? '');
          try {
            const res = await fetch(`${proxyBase}/fs/write`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: filePath, content }),
            });
            const data = await res.json();
            if (!data.ok) return `Error: ${data.error}`;
            return `File written: ${filePath}`;
          } catch (e) {
            return `Error writing file: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: 'list_directory',
        description: 'List files and subdirectories in a directory.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Directory path (defaults to workspace root)' } },
        },
        execute: async (args) => {
          const dirPath = String(args.path ?? '.');
          try {
            const res = await fetch(`${proxyBase}/fs/list?path=${encodeURIComponent(dirPath)}`);
            const data = await res.json();
            if (data.error) return `Error: ${data.error}`;
            const entries = (data.entries ?? []).map((e: { name: string; type: string }) => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`);
            return entries.length ? entries.join('\n') : '(empty directory)';
          } catch (e) {
            return `Error listing directory: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: 'run_command',
        description: 'Execute a shell command (git, ls, cat, node, npm, python, etc.) and return its output.',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'The shell command to execute' } },
          required: ['command'],
        },
        execute: async (args) => {
          const command = String(args.command ?? '');
          try {
            const res = await fetch(`${proxyBase}/exec`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command }),
            });
            const data = await res.json();
            const parts: string[] = [];
            if (data.stdout) parts.push(data.stdout);
            if (data.stderr) parts.push(`stderr: ${data.stderr}`);
            if (data.exitCode !== 0) parts.push(`exit code: ${data.exitCode}`);
            return parts.join('\n') || '(no output)';
          } catch (e) {
            return `Error executing command: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: 'git_status',
        description: 'Get the git status of the working directory (modified, added, deleted files).',
        parameters: { type: 'object', properties: {} },
        execute: async () => {
          try {
            const res = await fetch(`${proxyBase}/git/status`);
            const data = await res.json();
            if (!data.git) return `Not a git repo: ${data.error ?? ''}`;
            if (!data.files?.length) return 'No changes.';
            return data.files.map((f: { path: string; status: string }) => `${f.status}: ${f.path}`).join('\n');
          } catch (e) {
            return `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
      {
        name: 'git_diff',
        description: 'Get the diff for a specific file in the git repository.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'File path to diff' } },
          required: ['path'],
        },
        execute: async (args) => {
          const filePath = String(args.path ?? '');
          try {
            const res = await fetch(`${proxyBase}/git/diff?path=${encodeURIComponent(filePath)}`);
            const data = await res.json();
            return data.diff || data.error || '(no diff)';
          } catch (e) {
            return `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
    ];
  }
}
