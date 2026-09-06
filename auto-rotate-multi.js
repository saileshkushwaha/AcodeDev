/**
 * Multi-Account OpenRouter API Key Manager
 *
 * Manages API keys across multiple OpenRouter accounts using OAuth PKCE.
 * Each account stores its own API key, and auto-rotation checks each
 * account independently and rotates when usage exceeds the threshold.
 *
 * Usage:
 *   node auto-rotate-multi.js add "My Project A"      # Start OAuth flow for a new account
 *   node auto-rotate-multi.js list                    # List all managed accounts
 *   node auto-rotate-multi.js rotate                  # Rotate keys for all accounts
 *   node auto-rotate-multi.js rotate account_123      # Rotate a specific account
 *   node auto-rotate-multi.js watch                   # Run continuously (every hour)
 *   node auto-rotate-multi.js status                  # Show key usage status
 */

import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, createHmac, webcrypto } from 'node:crypto';
import readline from 'node:readline';
import { URL, URLSearchParams } from 'node:url';

// --- Configuration ---

const ACCOUNTS_DIR = path.join(process.cwd(), 'accounts');
const CONFIG_PATH = path.join(ACCOUNTS_DIR, 'config.json');
const OPENROUTER_OAUTH_BASE = 'https://openrouter.ai/oauth';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const ROTATION_INTERVAL = 60 * 60 * 1000; // 1 hour
const USAGE_THRESHOLD = 50; // Rotate if usage is >= 50% of any limit
const HTTP_TIMEOUT = 15000;

// --- Utilities ---

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function httpFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/** Generate a PKCE code verifier (high-entropy random string) */
function generateCodeVerifier() {
  return base64URLEncode(randomBytes(32));
}

/** Derive the code challenge from the verifier */
function generateCodeChallenge(verifier) {
  const hash = createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

function base64URLEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Generate a random state value to protect against CSRF */
function generateState() {
  return base64URLEncode(randomBytes(16));
}

// --- Config Management ---

async function ensureAccountsDir() {
  if (!existsSync(ACCOUNTS_DIR)) {
    await mkdir(ACCOUNTS_DIR, { recursive: true });
  }
}

async function loadConfig() {
  try {
    const data = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { accounts: [] };
  }
}

async function saveConfig(config) {
  await ensureAccountsDir();
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// --- OAuth Flow ---

async function startOAuthFlow(accountName) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store the state verifier temporarily
  const statePath = path.join(ACCOUNTS_DIR, `.oauth_state_${Date.now()}`);
  await ensureAccountsDir();
  await writeFile(statePath, JSON.stringify({ accountName, codeVerifier, state }));

  const params = new URLSearchParams({
    client_id: 'acode-cli',
    response_type: 'code',
    redirect_uri: 'http://localhost:8787/callback',
    scope: 'user:api_keys',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    provider: 'openrouter',
  });

  const authUrl = `${OPENROUTER_OAUTH_BASE}/auth?${params.toString()}`;

  console.log(`\nOpening browser for OpenRouter OAuth (account: "${accountName}")...`);
  console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

  // Try to open browser (platform-dependent)
  try {
    const { exec } = await import('node:child_process');
    const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${openCmd} "${authUrl}"`, (err) => { if (err) console.error('Could not open browser:', err.message); });
  } catch {
    /* browser open not available, user can use URL manually */
  }

  // Start a one-shot callback server on localhost:8787 (same port as proxy)
  const { createServer } = await import('node:http');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:8787`);
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (!code || returnedState !== state) {
        res.end('<h2>❌ OAuth error — code or state mismatch. Close this tab.</h2>');
        server.close();
        cleanupStateFile(statePath);
        return;
      }

      // Exchange code for tokens
      try {
        const tokenRes = await httpFetch(`${OPENROUTER_OAUTH_BASE}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: 'acode-cli',
            grant_type: 'authorization_code',
            code,
            redirect_uri: 'http://localhost:8787/callback',
            code_verifier: codeVerifier,
          }),
        });

        if (!tokenRes.ok) {
          throw new Error(`Token exchange failed: ${tokenRes.status}`);
        }

        const tokenData = await tokenRes.json();
        res.end('<h2>✅ Authentication complete! You can close this tab.</h2>');
        server.close();
        cleanupStateFile(statePath);
        rl.close();

        // Resolve the promise with token data
        oauthResolve(tokenData);
      } catch (e) {
        res.end(`<h2>❌ Token exchange error: ${e.message}</h2>`);
        server.close();
        cleanupStateFile(statePath);
        rl.close();
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Use a promise to wait for OAuth completion
  const codePromise = new Promise((resolve) => {
    oauthResolve = resolve;
  });

  let oauthResolve;

  server.listen(8787, '127.0.0.1');

  const tokenData = await codePromise;
  await server.close();
  return tokenData;
}

async function cleanupStateFile(statePath) {
  try { await unlink(statePath); } catch { /* ignore */ }
}

// --- API Key Management ---

async function listOpenRouterKeys(apiKey) {
  const res = await httpFetch(`${OPENROUTER_API_BASE}/keys`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to list keys: ${res.status}`);
  }
  const data = await res.json();
  return data.data || [];
}

async function createOpenRouterKey(apiKey, name) {
  const res = await httpFetch(`${OPENROUTER_API_BASE}/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create key: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // OpenRouter returns the key value in `key` field on creation
  return {
    id: data.id,
    hash: data.hash,
    name: data.name,
    created: data.created,
    key: data.key || '', // Plaintext key value — only available at creation
    ...(data.usage !== undefined && { usage: data.usage }),
    ...(data.limit !== undefined && { limit: data.limit }),
    ...(data.disabled !== undefined && { disabled: data.disabled }),
  };
}

async function deleteOpenRouterKey(apiKey, keyId) {
  const res = await httpFetch(`${OPENROUTER_API_BASE}/keys/${keyId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete key: ${res.status}`);
  }
}

// --- Account Management ---

async function addAccount(accountName) {
  console.log(`\nAdding account: ${accountName}`);
  console.log('You will be redirected to OpenRouter to authenticate...\n');

  const tokenData = await startOAuthFlow(accountName);

  const apiKey = tokenData.access_token;
  if (!apiKey) {
    console.error('❌ No API key returned from OAuth flow');
    return;
  }

  // Verify the key works and get existing keys
  const existingKeys = await listOpenRouterKeys(apiKey);
  console.log(`\n✅ Account authenticated! Found ${existingKeys.length} existing key(s).`);

  const config = await loadConfig();
  const accountId = `account_${Date.now()}`;

  config.accounts.push({
    id: accountId,
    name: accountName,
    apiKey,
    refresh_token: tokenData.refresh_token,
    token_expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
    createdAt: Date.now(),
    lastRotated: null,
    keys: existingKeys.map(k => ({
      id: k.id,
      name: k.name,
      created: k.created,
      usage: k.usage,
      limit: k.limit,
      disabled: k.disabled,
    })),
  });

  await saveConfig(config);
  console.log(`\n✅ Account "${accountName}" added with ID: ${accountId}`);
  console.log('   API key stored securely in accounts/config.json');
  console.log('\nYou can now use this account for auto-rotation.');
}

async function listAccounts() {
  const config = await loadConfig();
  if (config.accounts.length === 0) {
    console.log('\nNo accounts configured. Add one with: node auto-rotate-multi.js add "Account Name"\n');
    return;
  }

  console.log('\n=== Managed Accounts ===\n');
  config.accounts.forEach((acc, i) => {
    const status = acc.apiKey ? '✓ Connected' : '✗ Disconnected';
    const keysCount = acc.keys?.length ?? 0;
    const lastRot = acc.lastRotated ? new Date(acc.lastRotated).toLocaleString() : 'Never';
    console.log(`  [${i + 1}] ${acc.name}`);
    console.log(`      ID: ${acc.id}`);
    console.log(`      Status: ${status}`);
    console.log(`      Keys tracked: ${keysCount}`);
    console.log(`      Last rotated: ${lastRot}`);
    console.log('');
  });
}

async function rotateAccount(accountId) {
  const config = await loadConfig();
  const account = config.accounts.find(a => a.id === accountId);
  if (!account) {
    console.error(`❌ Account ${accountId} not found`);
    return false;
  }

  console.log(`\nRotating keys for account: ${account.name}`);
  try {
    // Create a new key
    const newKey = await createOpenRouterKey(account.apiKey, `auto-rotated-${Date.now()}`);
    console.log(`  ✓ Created new API key: ${newKey.id}`);

    // Add to account's known keys
    account.keys = account.keys ?? [];
    account.keys.push({
      id: newKey.id,
      name: newKey.name,
      created: newKey.created,
      usage: newKey.usage,
      limit: newKey.limit,
      disabled: newKey.disabled,
    });

    // Clean up old keys (keep last 5)
    const keys = account.keys;
    if (keys.length > 5) {
      const toDelete = keys.slice(0, keys.length - 5);
      for (const oldKey of toDelete) {
        try {
          await deleteOpenRouterKey(account.apiKey, oldKey.id);
          console.log(`  ✓ Deleted old key: ${oldKey.id}`);
        } catch (e) {
          console.log(`  ⚠ Could not delete old key ${oldKey.id}: ${e.message}`);
        }
      }
      account.keys = keys.slice(-5);
    }

    account.lastRotated = Date.now();
    await saveConfig(config);
    console.log(`✅ Key rotation complete for "${account.name}"\n`);
    return true;
  } catch (e) {
    console.error(`❌ Rotation failed for "${account.name}": ${e.message}`);
    return false;
  }
}

async function rotateAllAccounts() {
  const config = await loadConfig();
  if (config.accounts.length === 0) {
    console.log('\nNo accounts configured. Add one with: node auto-rotate-multi.js add "Account Name"\n');
    return;
  }

  console.log(`\nRotating keys for ${config.accounts.length} account(s)...\n`);
  let success = 0;
  for (const account of config.accounts) {
    if (await rotateAccount(account.id)) {
      success++;
    }
  }
  console.log(`\n=== Rotation Summary ===`);
  console.log(`  Successful: ${success}/${config.accounts.length}`);
  console.log(`  Failed: ${config.accounts.length - success}/${config.accounts.length}\n`);
}

async function checkAccountStatus() {
  const config = await loadConfig();
  if (config.accounts.length === 0) {
    console.log('\nNo accounts configured.\n');
    return;
  }

  console.log('\n=== Account Key Status ===\n');

  for (const account of config.accounts) {
    try {
      const keys = await listOpenRouterKeys(account.apiKey);
      console.log(`  ${account.name} (ID: ${account.id}):`);
      if (keys.length === 0) {
        console.log(`    No API keys found`);
      }
      for (const k of keys) {
        const usage = k.usage ?? 0;
        const limit = k.limit;
        const pct = limit ? Math.round((usage / limit) * 100) : 0;
        const flag = pct >= USAGE_THRESHOLD ? ` ⚠️  (>${USAGE_THRESHOLD}%)` : '';
        console.log(`    • ${k.name} — usage: ${usage}${limit ? `/ ${limit} (${pct}%)` : ''}${flag}`);
      }
      console.log('');
    } catch (e) {
      console.log(`  ${account.name}: ❌ ${e.message}\n`);
    }
  }
}

async function watch() {
  console.log(`\nStarting auto-rotation watcher (interval: ${ROTATION_INTERVAL / 60000} min)`);
  console.log('Press Ctrl+C to stop.\n');

  await rotateAllAccounts();

  setInterval(async () => {
    console.log(`\n[${new Date().toISOString()}] Auto-rotation check...\n`);
    await rotateAllAccounts();
  }, ROTATION_INTERVAL);
}

// --- Main CLI ---

async function main() {
  await ensureAccountsDir();

  const [,, command, ...args] = process.argv;

  switch (command) {
    case 'add': {
      const name = args[0];
      if (!name) {
        console.error('Usage: node auto-rotate-multi.js add "Account Name"');
        process.exit(1);
      }
      await addAccount(name);
      break;
    }

    case 'list': {
      await listAccounts();
      break;
    }

    case 'rotate': {
      if (args[0]) {
        await rotateAccount(args[0]);
      } else {
        await rotateAllAccounts();
      }
      break;
    }

    case 'status': {
      await checkAccountStatus();
      break;
    }

    case 'watch': {
      watch();
      break;
    }

    default: {
      console.log(`
Multi-Account OpenRouter Key Manager

Usage:
  node auto-rotate-multi.js add "Account Name"   Start OAuth to add a new account
  node auto-rotate-multi.js list                 List all managed accounts
  node auto-rotate-multi.js rotate               Rotate keys for all accounts
  node auto-rotate-multi.js rotate <account_id>  Rotate keys for a specific account
  node auto-rotate-multi.js status               Show key usage status
  node auto-rotate-multi.js watch                Run continuously (rotates every hour)

The accounts directory stores config in: ${ACCOUNTS_DIR}/config.json
      `);
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

main().catch((e) => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
