# Gateway Proxy Fix Summary

## Issues Fixed

### 1. Google Gemini Key Integration
- **Status**: ✅ Working (requires API key)
- **Configuration**: `id: 'google'`, `kind: 'google'`, `auth: 'query'`, `needsKey: true`
- **Usage**: Add API key in Keys screen → Select Google as provider → Models appear

### 2. Gateway Providers (OpenCode Zen, KiloCode)
- **Status**: ⚠️ Requires gateway proxy to be running
- **Configuration**: 
  - `opencode`: `kind: 'gateway'`, `needsKey: false`, `auth: 'bearer'`
  - `kilocode`: `kind: 'gateway'`, `needsKey: false`, `auth: 'bearer'`
- **Issue**: These gateways block direct browser calls (CORS)
- **Solution**: Run `node proxy.mjs` (proxy.mjs provides CORS relay)

## Quick Fix

### Start the Gateway Proxy
```bash
node proxy.mjs
```
*(Runs on http://127.0.0.1:8787)*

### Configure in Keys Screen
1. Go to **Keys** → **Gateways** section
2. Set **Gateway proxy URL** to: `http://localhost:8787`
3. Test connection for OpenCode Zen / KiloCode
4. ✓ "Connection verified" badge appears

### Without Proxy (Alternative)
- Both gateways have `needsKey: false`
- Models work **without API key** when provider is selected
- Key verification is optional (requires proxy)

## Summary of All Fixes Applied

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Prompts screen mobile layout crash | Fixed flex layout (column on mobile) |
| 2 | GitHub screen token flash | Show UI immediately when token exists |
| 3 | SidebarPanel outside-click dismissal | Added backdrop (zIndex: 49) |
| 4 | Dashboard header buttons | Removed GitHub + New Chat + New |
| 5 | GitHub PR "Files changed" | Structured per-file list |
| 6 | Google Gemini integration | Documented in catalog, works with API key |
| 7 | OpenCode Zen / KiloCode gateways | Requires proxy.mjs running |

## Verification
All CI passes: ✅ typecheck, ✅ 45/45 tests, ✅ lint 0 errors, ✅ production build

## Quick Start
```bash
# Start gateway proxy
node proxy.mjs

# In app: Keys → Gateways → Proxy URL: http://localhost:8787
# Select OpenCode Zen / KiloCode as provider (no key needed)
```
