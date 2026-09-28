/**
 * Guarded localStorage access shared by the storage modules. Private mode, blocked storage,
 * quota errors or a missing `localStorage` (tests, SSR) degrade to "nothing stored" instead
 * of throwing, so every feature built on storage is best-effort and never fatal.
 */

function storage(): Storage | null {
  try {
    // Reading the property itself can throw (SecurityError) in sandboxed frames.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readItem(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** False when storage is unavailable or full. */
export function writeItem(key: string, value: string): boolean {
  try {
    const store = storage();
    if (store === null) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(key: string): boolean {
  try {
    const store = storage();
    if (store === null) return false;
    store.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
