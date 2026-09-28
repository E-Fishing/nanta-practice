import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPiece } from '../engine/editPiece';
import { getLocalPiece, listLocalPieces, LOCAL_PIECES_KEY, readLocalPieces, removeLocalPiece, saveLocalPiece } from './localPieces';

/** Minimal in-memory `Storage`. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local pieces', () => {
  it('starts empty and survives corrupt storage', () => {
    expect(readLocalPieces()).toEqual({ pieces: {} });
    localStorage.setItem(LOCAL_PIECES_KEY, '{ nope');
    expect(readLocalPieces()).toEqual({ pieces: {} });
    localStorage.setItem(LOCAL_PIECES_KEY, JSON.stringify({ pieces: { a: 1, b: { json: 'x' }, c: { json: { id: 'c' } } } }));
    expect(Object.keys(readLocalPieces().pieces)).toEqual(['c']);
    expect(readLocalPieces().pieces.c.savedAt).toBe('');
  });

  it('saves, lists newest first, gets and removes', () => {
    const a = { ...emptyPiece(), id: 'a' };
    const b = { ...emptyPiece(), id: 'b' };
    expect(saveLocalPiece(a, new Date('2026-09-28T10:00:00Z'))).toBe(true);
    expect(saveLocalPiece(b, new Date('2026-09-28T11:00:00Z'))).toBe(true);
    expect(listLocalPieces().map((entry) => entry.id)).toEqual(['b', 'a']);
    expect(getLocalPiece('a')).toEqual(a);
    expect(getLocalPiece('zzz')).toBeNull();
    expect(removeLocalPiece('a')).toBe(true);
    expect(getLocalPiece('a')).toBeNull();
    expect(removeLocalPiece('a')).toBe(true);
    expect(listLocalPieces().map((entry) => entry.id)).toEqual(['b']);
  });

  it('overwrites a piece saved again under the same id', () => {
    saveLocalPiece({ ...emptyPiece(), id: 'a', title: 'one' });
    saveLocalPiece({ ...emptyPiece(), id: 'a', title: 'two' });
    expect(getLocalPiece('a')?.title).toBe('two');
    expect(listLocalPieces()).toHaveLength(1);
  });

  it('degrades when storage is missing', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(saveLocalPiece(emptyPiece())).toBe(false);
    expect(getLocalPiece('new-piece')).toBeNull();
    // Nothing is stored, so there is nothing to remove: that is a success.
    expect(removeLocalPiece('new-piece')).toBe(true);
  });
});
