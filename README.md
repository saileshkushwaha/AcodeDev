# AcodeDev

**AcodeDev** — an all-in-one AI studio and project management platform.

A single place to build, test, version, and deploy AI applications, plus manage your GitHub projects — across web and mobile.

## Monorepo layout

```
packages/
  core/     @acode/core      Shared TypeScript engine (LLM providers, agents, workflows, evals, GitHub)
  ui/       @acode/ui        Enterprise design system (shared React components)
  web/      @acode/web       React + Vite web application
  mobile/   @acode/mobile    React Native + Expo mobile app (Android / iOS)
```

## Getting started

```bash
npm install
npm run web          # start the web app (http://localhost:5173)
npm run mobile       # start the mobile app (Expo)
npm run web:build    # production build
```

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
3. **Local** — offline models via a local HTTP endpoint (e.g. llama.cpp)

## License

MIT
