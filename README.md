# AcodeDev

**AcodeDev** — an all-in-one AI studio and project management platform.

A single place to build, test, version, and deploy AI applications, plus manage your GitHub projects.

## Monorepo layout

```
packages/
  core/     @acode/core      Shared TypeScript engine (LLM providers, agents, workflows, evals, GitHub)
  ui/       @acode/ui        Enterprise design system (shared React components)
  web/      @acode/web       React + Vite web application
```

> A React Native / Expo app (`packages/mobile`) is planned; it will reuse `@acode/core` with a pluggable storage/secure-store backend.

## Getting started

```bash
npm install
npm run web          # start the web app (http://localhost:5173)
npm run web:build    # production build
npm run ci           # typecheck + unit tests + production build (same gates as CI)
```

## Using OpenCode Zen / Kilo gateways (local proxy)

Some OpenAI-compatible gateways — **OpenCode Zen** (`opencode.ai`) and **Kilo** (`api.kilo.ai`) — don't send the `Access-Control-Allow-Origin` header, so a browser running the app can't call them directly (CORS blocks the request even with a correct API key). To use their models from the web app, run the bundled relay proxy and point the app at it:

```bash
npm run proxy        # or: node proxy.mjs   (listens on http://127.0.0.1:8787)
```

Then, in the app, open **Connections → Gateways** and set **Gateway proxy URL** to `http://localhost:8787`. Gateway requests (model sync, connection tests, and live chat) are relayed through it, which injects the missing CORS header. Your API keys only travel from your machine to the gateway — never through a third party.

The proxy only forwards to an allowlist of known hosts (see `proxy.mjs`; override with `UPSTREAM_ALLOW`), includes CORS preflight handling, and a 30s upstream timeout.

## Features

- **Chat + Prompt Playground** — multi-model chat with streaming, parameter tuning, prompt templates
- **Workflows / Pipelines** — visual chaining of LLM calls, transformations, branching
- **Prompt versioning + Eval** — version prompts, run evals, compare outputs side by side
- **API key manager** — securely store and switch provider keys in-app
- **AI agent builder** — agents with tools, memory, and RAG over your documents
- **GitHub dashboard** — repos, PRs, issues, and CI status (GitHub mobile, plus more)

## LLM providers

Three modes, switchable per conversation/project:

1. **OpenRouter** — one key, 300+ free models across providers
2. **Direct providers** — OpenAI, Google Gemini, Anthropic, Mistral, Groq, DeepSeek, Together
3. **OpenCode Zen / Kilo** — free model gateways (require the local proxy, see above)
4. **Local** — offline models via a local HTTP endpoint (e.g. llama.cpp)

## License

MIT
