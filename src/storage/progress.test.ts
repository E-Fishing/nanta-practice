import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEMBER_KEY,
  PROGRESS_KEY,
  getCurrentMember,
  getLastPracticed,
  readProgress,
  setCurrentMember,
} from './progress';

/** Minimal in-memory `Storage`. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

/** A `Storage` whose every method throws, like Safari private mode with storage disabled. */
function brokenStorage(): Storage {
  const boom = () => {
    throw new Error('QuotaExceededError');
  };
  return { length: 0, key: boom, getItem: boom, setItem: boom, removeItem: boom, clear: boom };
}

const STORE = {
  members: {
    Jaden: {
      'placeholder-hard': {
        open: { bestBpm: 120, lastAccuracy: 0.9, attempts: 3, lastPracticed: '2026-09-20' },
        build: { bestBpm: 96, lastAccuracy: 0.82, attempts: 14, lastPracticed: '2026-09-27' },
        a: { bestBpm: 100, lastAccuracy: 0.7, attempts: 1, lastPracticed: '2026-09-25' },
      },
      'other-piece': {
        x: { bestBpm: 80, lastAccuracy: 0.5, attempts: 1, lastPracticed: '2026-10-01' },
      },
    },
  },
};

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('current member', () => {
  it('defaults to "" when nothing is stored', () => {
    expect(getCurrentMember()).toBe('');
  });

  it('round-trips through setCurrentMember under MEMBER_KEY', () => {
    setCurrentMember('Jaden');
    expect(getCurrentMember()).toBe('Jaden');
    expect(localStorage.getItem(MEMBER_KEY)).toBe('Jaden');
  });

  it('keeps the name exactly as typed, including an empty string', () => {
    setCurrentMember('Jaden');
    setCurrentMember('');
    expect(getCurrentMember()).toBe('');
  });
});

describe('readProgress', () => {
  it('returns an empty store when nothing is stored', () => {
    expect(readProgress()).toEqual({ members: {} });
  });

  it('returns an empty store on corrupt JSON', () => {
    localStorage.setItem(PROGRESS_KEY, '{ not json');
    expect(readProgress()).toEqual({ members: {} });
  });

  it('returns an empty store when the JSON is not a members object', () => {
    for (const bad of ['null', '42', '[]', '{}', '{"members":[]}', '{"members":"x"}']) {
      localStorage.setItem(PROGRESS_KEY, bad);
      expect(readProgress(), bad).toEqual({ members: {} });
    }
  });

  it('reads the §4.5 shape back and drops non-object entries', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ members: { ...STORE.members, Broken: 'nope', Half: { p: 7, q: { s: 1 } } } }),
    );
    const store = readProgress();
    expect(store.members.Jaden).toEqual(STORE.members.Jaden);
    expect(store.members.Broken).toBeUndefined();
    expect(store.members.Half).toEqual({ q: {} });
  });
});

describe('getLastPracticed', () => {
  it('picks the latest date across the sections of that piece only', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORE));
    expect(getLastPracticed('Jaden', 'placeholder-hard')).toBe('2026-09-27');
    expect(getLastPracticed('Jaden', 'other-piece')).toBe('2026-10-01');
  });

  it('returns null for an unknown member, piece or empty store', () => {
    expect(getLastPracticed('Jaden', 'placeholder-hard')).toBeNull();
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORE));
    expect(getLastPracticed('Nobody', 'placeholder-hard')).toBeNull();
    expect(getLastPracticed('Jaden', 'missing')).toBeNull();
    expect(getLastPracticed('', 'placeholder-hard')).toBeNull();
  });

  it('ignores sections without a usable lastPracticed date', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        members: { J: { p: { a: { attempts: 1 }, b: { lastPracticed: '' }, c: { lastPracticed: 5 }, d: null } } },
      }),
    );
    expect(getLastPracticed('J', 'p')).toBeNull();
  });
});

describe('without working storage', () => {
  it('degrades to defaults when every storage call throws', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(getCurrentMember()).toBe('');
    expect(readProgress()).toEqual({ members: {} });
    expect(getLastPracticed('Jaden', 'placeholder-hard')).toBeNull();
    expect(() => setCurrentMember('Jaden')).not.toThrow();
  });

  it('degrades to defaults when localStorage does not exist', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getCurrentMember()).toBe('');
    expect(readProgress()).toEqual({ members: {} });
    expect(() => setCurrentMember('Jaden')).not.toThrow();
  });
});
