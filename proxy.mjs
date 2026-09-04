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

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

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

const server = createServer(async (req, res) => {
  try {
    // ── CORS preflight ──────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

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
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const r = await fetch(target, {
        method: req.method,
        headers,
        ...(body && body.length ? { body } : {}),
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const ctype = r.headers.get('content-type');
      const buf = Buffer.from(await r.arrayBuffer());

      res.writeHead(r.status, {
        ...CORS,
        ...(ctype ? { 'Content-Type': ctype } : {}),
      });
      res.end(buf);
    } catch (upErr) {
      clearTimeout(timeout);
      const msg = upErr.name === 'AbortError' ? 'upstream timed out' : upErr.message;
      res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `upstream request failed: ${msg}` }));
    }
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
