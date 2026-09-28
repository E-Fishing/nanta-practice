import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAttempt,
  exportProgress,
  getCurrentMember,
  getLastPracticed,
  HISTORY_LIMIT,
  importProgress,
  listMembers,
  MEMBER_KEY,
  mergeProgress,
  normalizeSection,
  parseProgressExport,
  PIECE_WIDE_SECTION,
  PROGRESS_KEY,
  readProgress,
  recordAttempt,
  setCurrentMember,
  todayIso,
  type ProgressStore,
  type SectionProgress,
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
    expect(() => recordAttempt('Jaden', 'p', 's', { date: '2026-09-28', accuracy: 1, bpm: 100, mode: 'tap' })).not.toThrow();
  });

  it('degrades to defaults when localStorage does not exist', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(getCurrentMember()).toBe('');
    expect(readProgress()).toEqual({ members: {} });
    expect(() => setCurrentMember('Jaden')).not.toThrow();
  });
});

describe('recording attempts', () => {
  const tap = (date: string, accuracy: number | null, bpm: number, mode: 'tap' | 'blind' | 'fade' = 'tap') => ({ date, accuracy, bpm, mode });

  it('counts attempts, keeps the last accuracy and date, and grows the history', () => {
    const first = applyAttempt(undefined, tap('2026-09-28', 0.6, 200));
    expect(first).toEqual({ bestBpm: 0, lastAccuracy: 0.6, attempts: 1, lastPracticed: '2026-09-28', history: [tap('2026-09-28', 0.6, 200)] });
    const second = applyAttempt(first, tap('2026-09-29', 0.9, 220));
    expect(second).toMatchObject({ bestBpm: 220, lastAccuracy: 0.9, attempts: 2, lastPracticed: '2026-09-29' });
    expect(second.history).toHaveLength(2);
  });

  it('only raises bestBpm for a Tap-along run at 85% or better', () => {
    const base = applyAttempt(undefined, tap('2026-09-28', 0.9, 200));
    expect(base.bestBpm).toBe(200);
    expect(applyAttempt(base, tap('2026-09-28', 0.84, 300)).bestBpm).toBe(200);
    expect(applyAttempt(base, tap('2026-09-28', 0.95, 300, 'blind')).bestBpm).toBe(200);
    expect(applyAttempt(base, tap('2026-09-28', 0.85, 250.4)).bestBpm).toBe(250);
    expect(applyAttempt(base, tap('2026-09-28', 0.95, 150)).bestBpm).toBe(200);
  });

  it('keeps the previous accuracy for an unscored run and never moves lastPracticed backwards', () => {
    const base = applyAttempt(undefined, tap('2026-09-28', 0.7, 200));
    const next = applyAttempt(base, tap('2026-09-01', null, 180, 'fade'));
    expect(next).toMatchObject({ lastAccuracy: 0.7, attempts: 2, lastPracticed: '2026-09-28' });
  });

  it('caps the history', () => {
    let section: SectionProgress | undefined;
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) section = applyAttempt(section, tap('2026-09-28', 0.5, 100 + i));
    expect(section!.history).toHaveLength(HISTORY_LIMIT);
    expect(section!.history![0].bpm).toBe(105);
    expect(section!.attempts).toBe(HISTORY_LIMIT + 5);
  });

  it('persists under the member, piece and section, and refuses an empty member', () => {
    expect(recordAttempt('', 'p', 's', tap('2026-09-28', 1, 100))).toBeNull();
    expect(readProgress()).toEqual({ members: {} });
    const store = recordAttempt('Jaden', 'p', 's', tap('2026-09-28', 1, 100));
    expect(store?.members.Jaden.p.s).toMatchObject({ bestBpm: 100, attempts: 1 });
    expect(readProgress().members.Jaden.p.s.attempts).toBe(1);
    recordAttempt('Jaden', 'p', PIECE_WIDE_SECTION, tap('2026-09-28', 0.5, 100, 'blind'));
    expect(Object.keys(readProgress().members.Jaden.p).sort()).toEqual(['*', 's']);
    expect(getLastPracticed('Jaden', 'p')).toBe('2026-09-28');
  });

  it('normalizes junk records', () => {
    const junk = { bestBpm: 'x', attempts: 'many', history: [{ date: 1 }, { date: '2026-01-01', accuracy: null, bpm: 90, mode: 'fade' }, 'no'] };
    expect(normalizeSection(junk as unknown as SectionProgress)).toEqual({
      bestBpm: 0,
      lastAccuracy: 0,
      attempts: 0,
      lastPracticed: '',
      history: [{ date: '2026-01-01', accuracy: null, bpm: 90, mode: 'fade' }],
    });
    expect(todayIso(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('export and import', () => {
  it('round-trips through JSON', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORE));
    const text = exportProgress();
    expect(parseProgressExport(text)).toEqual(STORE);
    expect(listMembers(parseProgressExport(text))).toEqual(['Jaden']);
  });

  it('rejects files that are not a progress export with a readable message', () => {
    expect(() => parseProgressExport('nope')).toThrow(/not JSON/);
    expect(() => parseProgressExport('{"x":1}')).toThrow(/not a Nanta progress export/);
    expect(() => parseProgressExport('[]')).toThrow(/not a Nanta progress export/);
  });

  it('merges another device: union of members, best figures, both histories without duplicates', () => {
    const shared = { date: '2026-09-20', accuracy: 0.6, bpm: 200, mode: 'tap' as const };
    const newer = { date: '2026-09-25', accuracy: 0.9, bpm: 180, mode: 'tap' as const };
    const here: ProgressStore = {
      members: { Jaden: { p: { s: { bestBpm: 200, lastAccuracy: 0.6, attempts: 3, lastPracticed: '2026-09-20', history: [shared] } } } },
    };
    const there: ProgressStore = {
      members: {
        Jaden: {
          p: {
            s: { bestBpm: 180, lastAccuracy: 0.9, attempts: 2, lastPracticed: '2026-09-25', history: [shared, newer] },
            t: { bestBpm: 0, lastAccuracy: 0.3, attempts: 1, lastPracticed: '2026-09-21' },
          },
        },
        Mina: { p: { s: { bestBpm: 90, lastAccuracy: 0.5, attempts: 1, lastPracticed: '2026-09-22' } } },
      },
    };
    const merged = mergeProgress(here, there);
    expect(listMembers(merged)).toEqual(['Jaden', 'Mina']);
    expect(merged.members.Jaden.p.s).toEqual({ bestBpm: 200, lastAccuracy: 0.9, attempts: 3, lastPracticed: '2026-09-25', history: [shared, newer] });
    expect(merged.members.Jaden.p.t).toMatchObject({ attempts: 1, lastAccuracy: 0.3, history: [] });
    expect(merged.members.Mina.p.s.bestBpm).toBe(90);
    // Pure: inputs untouched.
    expect(here.members.Jaden.p.s.attempts).toBe(3);
  });

  it('importProgress merges into storage and persists', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORE));
    const incoming = { members: { Mina: { q: { a: { bestBpm: 70, lastAccuracy: 0.2, attempts: 1, lastPracticed: '2026-09-01' } } } } };
    const merged = importProgress(JSON.stringify(incoming));
    expect(listMembers(merged)).toEqual(['Jaden', 'Mina']);
    expect(readProgress().members.Mina.q.a.bestBpm).toBe(70);
    expect(readProgress().members.Jaden['placeholder-hard'].build.attempts).toBe(14);
  });
});
