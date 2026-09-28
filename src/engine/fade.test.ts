import { describe, expect, it } from 'vitest';
import { createFade, fadeStep, hiddenFraction, hiddenKeys, isFullBlank, reveal, seededRandom, seededShuffle } from './fade';

const KEYS = Array.from({ length: 20 }, (_unused, i) => `k${i}`);

describe('seeded shuffle', () => {
  it('is deterministic for a seed and different across seeds', () => {
    expect(seededShuffle(KEYS, 7)).toEqual(seededShuffle(KEYS, 7));
    expect(seededShuffle(KEYS, 7)).not.toEqual(seededShuffle(KEYS, 8));
    expect([...seededShuffle(KEYS, 7)].sort()).toEqual([...KEYS].sort());
  });

  it('never mutates its input and stays in [0, 1)', () => {
    const copy = [...KEYS];
    seededShuffle(KEYS, 1);
    expect(KEYS).toEqual(copy);
    const random = seededRandom(3);
    for (let i = 0; i < 1000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('fade progression', () => {
  it('hides 15% more per loop, keeping earlier hidden cells hidden', () => {
    let state = createFade(KEYS, 42);
    expect(state.hidden).toBe(0);
    state = fadeStep(state);
    expect(state.hidden).toBe(3);
    const first = hiddenKeys(state);
    state = fadeStep(state);
    expect(state.hidden).toBe(6);
    for (const key of first) expect(hiddenKeys(state).has(key)).toBe(true);
    expect(hiddenFraction(state)).toBeCloseTo(0.3);
  });

  it('reaches full blank after seven loops and stays there', () => {
    let state = createFade(KEYS, 1);
    for (let i = 0; i < 7; i += 1) {
      expect(isFullBlank(state)).toBe(false);
      state = fadeStep(state);
    }
    expect(state.hidden).toBe(20);
    expect(isFullBlank(state)).toBe(true);
    expect(fadeStep(state).hidden).toBe(20);
  });

  it('reveals 10% again, most recently hidden first, never below zero', () => {
    let state = createFade(KEYS, 5);
    state = fadeStep(fadeStep(state)); // 6 hidden
    const before = hiddenKeys(state);
    state = reveal(state);
    expect(state.hidden).toBe(4);
    const after = hiddenKeys(state);
    for (const key of after) expect(before.has(key)).toBe(true);
    expect(reveal(reveal(reveal(state))).hidden).toBe(0);
  });

  it('always hides at least one cell per step on a tiny section, and handles an empty one', () => {
    const tiny = fadeStep(createFade(['a', 'b'], 9));
    expect(tiny.hidden).toBe(1);
    const empty = fadeStep(createFade([], 9));
    expect(empty.hidden).toBe(0);
    expect(isFullBlank(empty)).toBe(false);
    expect(hiddenFraction(empty)).toBe(0);
  });
});
