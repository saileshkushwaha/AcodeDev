/**
 * Shared persistence layer.
 *
 * Every store/screen in the app goes through these helpers instead of calling
 * localStorage directly, so that:
 *   - reads tolerate missing/corrupted data without throwing,
 *   - write failures (e.g. QuotaExceededError) are surfaced through a single
 *     configurable handler instead of being silently swallowed,
 *   - the mobile package can later inject a different backend (AsyncStorage)
 *     behind the same small API.
 */

export const GITHUB_TOKEN_KEY = 'acode.github.token';

export type StorageErrorHandler = (key: string, error: unknown) => void;

let errorHandler: StorageErrorHandler | null = null;

/** Register a callback invoked whenever a storage read/write fails. */
export function setStorageErrorHandler(handler: StorageErrorHandler | null): void {
  errorHandler = handler;
}

function backend(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function report(key: string, error: unknown) {
  try {
    errorHandler?.(key, error);
  } catch {
    /* the handler must never break the persistence layer */
  }
}

/** Read a raw string value, or null when missing/unavailable. */
export function readRaw(key: string): string | null {
  try {
    return backend()?.getItem(key) ?? null;
  } catch (e) {
    report(key, e);
    return null;
  }
}

/** Write a raw string value. Returns false when the write failed (e.g. quota). */
export function writeRaw(key: string, value: string): boolean {
  try {
    backend()?.setItem(key, value);
    return true;
  } catch (e) {
    report(key, e);
    return false;
  }
}

/** Parse a previously stored JSON value, or null when missing/corrupted. */
export function readJSON<T>(key: string): T | null {
  try {
    const raw = backend()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    report(key, e);
    return null;
  }
}

/** Serialize and store a JSON value. Returns false when the write failed. */
export function writeJSON(key: string, value: unknown): boolean {
  try {
    backend()?.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    report(key, e);
    return false;
  }
}

/** Remove a key if present. */
export function removeKey(key: string): void {
  try {
    backend()?.removeItem(key);
  } catch (e) {
    report(key, e);
  }
}

/* ---------------------------------------------------------------------------
 * Shared app keys (github token) + convenience accessors so screens don't
 * hard-code keys or touch localStorage.
 * ------------------------------------------------------------------------- */

export function readGithubToken(): string {
  return readRaw(GITHUB_TOKEN_KEY) ?? '';
}

/** Persist the GitHub token ('' clears it). */
export function writeGithubToken(token: string): void {
  if (token) writeRaw(GITHUB_TOKEN_KEY, token);
  else removeKey(GITHUB_TOKEN_KEY);
}