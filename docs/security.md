# Security

## Key storage

API keys and connector secrets are stored in `KeyVault`
(`packages/core/src/keys/KeyVault.ts`), encrypted at rest with
**AES-GCM-256** via WebCrypto (`packages/core/src/crypto/web.ts`).

Key management:

- a non-extractable `CryptoKey` is persisted in **IndexedDB** (the standard home
  for browser key material), so it can never be exported and reused elsewhere;
- where IndexedDB is unavailable, we fall back to an exported key in localStorage
  so the app still works (weaker guarantee — flagged in the code);
- every ciphertext carries a **random 12-byte IV**, so identical secrets never
  produce identical ciphertext;
- a legacy decoder transparently decrypts data written by the old XOR
  obfuscation scheme, so existing keys survive upgrades without re-entry.

### Threat model — be explicit about the limits

These guarantees protect against:

- casual inspection of localStorage/IndexedDB dumps,
- inadvertent leakage (screenshots, logs, exports of the raw key store),
- broken/mis-encrypted state corrupting the vault.

They do **not** protect against:

- an XSS/tampered-code attacker executing in the same origin — the browser
  cannot keep a secret from the code that legitimately runs with it,
- an attacker with physical access to an unlocked session of your device.

For hard security boundaries (webhooks, CI secrets, sharing), prefer real
server-side vaults/key rotations. The key itself is app-local and is not derived
from a user password, so treat browser storage as *crypto at rest against
casual access*, not as a hardware security module.

## API key hygiene

- Keys are masked in the UI (`key.slice(0,4) + '*' + key.slice(-4)`).
- **Never** log a key, its full ciphertext, or `allKeys()` output to console,
  issue bodies, or run traces.
- Workflow outputs can legitimately echo prompt content that embeds secrets
  (e.g. LLM echo). Before exporting a run or filing a GitHub issue, review the
  output; a redaction pass is a planned enhancement.

## Storage failure handling

The shared layer (`packages/core/src/storage.ts`) never throws on corruption and
routes failures to `setStorageErrorHandler`. In the web app that handler logs a
`[storage]` warning so silent data loss is visible. Watch the console after
large imports/saves — the browser quota (~5 MB) can be reached.

## Relay proxy

`proxy.mjs` only forwards to allowlisted upstream hosts (`UPSTREAM_ALLOW`), adds
CORS preflight handling, and a 30s upstream timeout. It is designed to run on
`127.0.0.1` only; do not expose it publicly.

## Reporting

Report vulnerabilities privately (e.g. via private issues/local contact) rather
than filing public issues with reproduction details.