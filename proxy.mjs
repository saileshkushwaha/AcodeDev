/**
 * AcodeDev gateway relay proxy.
 *
 * Some OpenAI-compatible gateway hosts (notably opencode.ai and api.kilo.ai)
 * do NOT send the `Access-Control-Allow-Origin` response header, so the
 * browser blocks direct calls to them (CORS). This tiny zero-dependency
 * relay forwards your requests to the real gateway and injects the missing
 * CORS header so the browser app can actually use those models.
 *
 * The browser app sends the real upstream base URL in the `x-proxy-upstream`
 * request header; we strip it, forward to `{upstream}{path}`, and add CORS
 * headers to the response. Only HTTPS/HTTP(S) hosts on the allowlist are
 * proxied (SSRF-safe by default).
 *
 * Run it locally alongside the app:
 *
 *   node proxy.mjs            # listens on http://127.0.0.1:8787
 *   PORT=9000 node proxy.mjs  # custom port
 *
 * Then set the app's Gateway proxy URL to e.g. http://localhost:8787
 * (Connections → Gateways → Proxy URL).
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

// Working directory used for git / filesystem endpoints. Defaults to the repo
// root where this script is launched (override with ACODE_CWD).
const WORKSPACE = path.resolve(process.env.ACODE_CWD || process.cwd());

// Hosts that are safe to relay to. Override with UPSTREAM_ALLOW (comma list).
const DEFAULT_ALLOW = [
  'opencode.ai',
  'api.kilo.ai',
  'openrouter.ai',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.mistral.ai',
  'api.groq.com',
  'api.deepseek.com',
  'api.together.xyz',
  'api.deepinfra.com',
  'api.fireworks.ai',
  'api.cerebras.ai',
  'api.novita.ai',
  'localhost',
  '127.0.0.1',
].join(',');

const allowHosts = new Set(
  (process.env.UPSTREAM_ALLOW || DEFAULT_ALLOW)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': [
    'Content-Type',
    'Authorization',
    'Accept',
    'x-proxy-upstream',
    'x-api-key',
    'anthropic-version',
    'OpenAI-Organization',
    'OpenAI-Project',
  ].join(','),
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function runGit(args, cwd = WORKSPACE) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
}

/** Resolve a user-supplied path for the filesystem endpoint. */
function resolveFsPath(input) {
  const p = String(input ?? '').trim() || WORKSPACE;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2));
  if (!path.isAbsolute(p)) return path.join(WORKSPACE, p);
  return path.resolve(p);
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(body);
}

/** Serve the local git / filesystem helpers (called before proxy validation). */
async function serveLocalApi(req, res) {
  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    return false;
  }
  const p = url.pathname;
  const q = url.searchParams;

  if (req.method === 'OPTIONS' && (p.startsWith('/git') || p.startsWith('/fs'))) {
    res.writeHead(204, CORS);
    res.end();
    return true;
  }

  if (p === '/git/status') {
    const r = await runGit(['status', '--porcelain=v1', '-z']);
    if (!r.ok) {
      json(res, 200, { cwd: WORKSPACE, git: false, files: [], error: (r.stderr || r.stdout || 'not a git repository').split('\n')[0] });
      return true;
    }
    // With -z each record is "XY <path>\0"; parse the two-char status + path.
    const files = [];
    for (const entry of r.stdout.split('\u0000')) {
      if (!entry.trim()) continue;
      const xy = entry.slice(0, 2);
      const filePath = entry.slice(3);
      const x = xy[0];
      const y = xy[1];
      let status = 'modified';
      if (x === 'A' || y === 'A' || x === '?') status = 'added';
      else if (x === 'D' || y === 'D') status = 'deleted';
      else if (x === 'R') status = 'renamed';
      files.push({ path: filePath, status });
    }
    json(res, 200, { cwd: WORKSPACE, git: true, files });
    return true;
  }

  if (p === '/git/diff') {
    const filePath = q.get('path');
    if (!filePath) {
      json(res, 400, { error: 'missing path' });
      return true;
    }
    // Working tree + staged changes relative to HEAD.
    let r = await runGit(['diff', 'HEAD', '--', filePath]);
    if (!r.ok) r = await runGit(['diff', '--', filePath]);
    if (!r.ok) {
      json(res, 200, { path: filePath, diff: '', error: (r.stderr || r.stdout || 'no diff').split('\n')[0] });
    } else {
      json(res, 200, { path: filePath, diff: r.stdout });
    }
    return true;
  }

  if (p === '/fs/list') {
    const target = resolveFsPath(q.get('path'));
    try {
      const entries = await readdir(target, { withFileTypes: true });
      const out = [];
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        let type = 'file';
        if (e.isDirectory()) type = 'dir';
        else if (e.isSymbolicLink()) type = 'link';
        else {
          try {
            const s = await stat(path.join(target, e.name));
            type = s.isDirectory() ? 'dir' : 'file';
          } catch {
            /* keep file */
          }
        }
        out.push({ name: e.name, type });
      }
      out.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
      json(res, 200, { path: target, entries: out });
    } catch (err) {
      json(res, 200, { path: target, entries: [], error: err?.message ?? 'unreadable' });
    }
    return true;
  }

  return false;
}

const server = createServer(async (req, res) => {
  try {
    // ── CORS preflight ──────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    // ── Local helpers first (no upstream header required) ───────────
    if (await serveLocalApi(req, res)) return;

    // ── Validate upstream header ────────────────────────────────────
    const upstream = req.headers['x-proxy-upstream'];
    if (typeof upstream !== 'string' || !upstream.trim()) {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing x-proxy-upstream header' }));
      return;
    }

    let u;
    try {
      u = new URL(upstream);
    } catch {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid x-proxy-upstream URL' }));
      return;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream must be http(s)' }));
      return;
    }
    if (!allowHosts.has(u.hostname.toLowerCase())) {
      res.writeHead(403, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `host not allowed: ${u.hostname}` }));
      return;
    }

    // ── Build target URL and forward ────────────────────────────────
    // Upstream base already contains the path prefix (e.g. /zen/v1).
    // Client sends req.url as /models or /chat/completions.
    const target = upstream.replace(/\/+$/, '') + (req.url || '/');
    const headers = {};
    for (const h of [
      'authorization',
      'content-type',
      'accept',
      'anthropic-version',
      'x-api-key',
      'openai-organization',
      'openai-project',
    ]) {
      const v = req.headers[h];
      if (v !== undefined) headers[h] = String(v);
    }
    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : await readBody(req);

    const controller = new AbortController();
    // Long model responses (esp. reasoning/long-output) can take a while for the
    // first byte; allow a generous header timeout. The body then streams through.
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let r;
    try {
      r = await fetch(target, {
        method: req.method,
        headers,
        ...(body && body.length ? { body } : {}),
        redirect: 'follow',
        signal: controller.signal,
      });
    } catch (upErr) {
      clearTimeout(timeout);
      const msg = upErr.name === 'AbortError' ? 'upstream timed out' : upErr.message;
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `upstream request failed: ${msg}` }));
      return;
    }

    clearTimeout(timeout);
    const ctype = r.headers.get('content-type');
    res.writeHead(r.status, {
      ...CORS,
      ...(ctype ? { 'Content-Type': ctype } : {}),
    });

    // Stream the upstream body through so SSE (chat streaming) works in real time.
    if (r.body) {
      const reader = r.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length) res.write(value);
        }
      } catch {
        /* connection may have closed early */
      }
    }
    res.end();
  } catch (err) {
    // Failsafe: always close the response
    try {
      if (!res.headersSent) {
        res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err?.message ?? 'internal proxy error' }));
    } catch {
      /* already closed */
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`AcodeDev gateway proxy listening on http://${HOST}:${PORT}`);
  console.log(`Allowed upstream hosts: ${[...allowHosts].join(', ')}`);
});
