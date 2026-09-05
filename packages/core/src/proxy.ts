/**
 * Gateway proxy configuration.
 *
 * Some OpenAI-compatible gateway hosts (e.g. opencode.ai, api.kilo.ai) don't
 * send the `Access-Control-Allow-Origin` response header, so the browser
 * blocks direct calls to them (CORS). The app can't reach those gateways
 * client-side on its own; to use them you run a tiny local relay server
 * (`proxy.mjs` in the repo root) that forwards the request and injects the
 * missing CORS header.
 *
 * Set the proxy base URL here (e.g. `http://localhost:8787`) and gateway
 * requests are routed through it, passing the real upstream host via the
 * `x-proxy-upstream` request header so the relay knows where to forward.
 */

import { readRaw, removeKey, writeRaw } from './storage';

const PROXY_KEY = 'acode.gatewayProxy';

/** Normalize a configured proxy base URL, or '' when none is set. */
export function getProxyBase(): string {
  const raw = readRaw(PROXY_KEY);
  if (!raw) return '';
  try {
    const t = raw.trim().replace(/\/+$/, '');
    if (!t) return '';
    const u = new URL(t, 'http://localhost');
    return ['http:', 'https:'].includes(u.protocol) ? t : '';
  } catch {
    return '';
  }
}

/** Persist the proxy base URL ('' clears it). */
export function setProxyBase(url: string): void {
  const t = url.trim().replace(/\/+$/, '');
  if (t) writeRaw(PROXY_KEY, t);
  else removeKey(PROXY_KEY);
}

/** Derive the upstream base (the real gateway base URL) for a given models URL. */
export function upstreamFromModelsUrl(modelsUrl: string): string {
  return modelsUrl.replace(/\/models$/i, '');
}

/**
 * If a proxy is configured, rewrite a direct target URL to go through the
 * proxy and attach the `x-proxy-upstream` header so the relay can forward.
 * Returns the (possibly unchanged) URL and header map to merge.
 */
export function routeThroughProxy(
  realUrl: string,
  headers: Record<string, string>,
  upstreamBase: string,
): { url: string; headers: Record<string, string> } {
  const proxy = getProxyBase();
  if (!proxy || !upstreamBase) return { url: realUrl, headers };
  const path = realUrl.startsWith(upstreamBase) ? realUrl.slice(upstreamBase.length) : new URL(realUrl).pathname;
  return {
    url: `${proxy}${path}`,
    headers: { ...headers, 'x-proxy-upstream': upstreamBase.replace(/\/+$/, '') },
  };
}
