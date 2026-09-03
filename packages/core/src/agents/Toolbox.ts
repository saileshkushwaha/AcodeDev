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
}
