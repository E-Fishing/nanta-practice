import { describe, expect, it } from 'vitest';
import {
  accuracyOf,
  DEFAULT_WINDOWS,
  heatAccuracy,
  heatByChartCell,
  mergeChords,
  NEAR_CREDIT,
  scaledWindows,
  scoreTaps,
  verdictOfTap,
  type ScorableCell,
  type Tap,
} from './scorer';
import type { Hand } from './types';

/** A pulse grid at 200 ms per pulse: hands or null for silent cells, one loop. */
function grid(hands: (Hand | null)[], pulseSeconds = 0.2, loop = 0): ScorableCell[] {
  return hands.map((hand, i) => ({ id: `${loop}:${i}`, chartKey: `c${i}`, time: 10 + i * pulseSeconds, hand }));
}

const W = DEFAULT_WINDOWS;
/** A time after every window has closed. */
const LATER = 100;

function tap(time: number, hand: Hand = 'R'): Tap {
  return { time, hand };
}

describe('scaledWindows', () => {
  it('widens the timing windows in proportion to how much slower than performance tempo we are', () => {
    expect(scaledWindows(W, 325, 325)).toEqual(W);
    const half = scaledWindows(W, 320, 160);
    expect(half.onTimeMs).toBeCloseTo(90);
    expect(half.nearMs).toBeCloseTo(220);
    expect(half.chordMs).toBe(W.chordMs);
  });

  it('narrows them above performance tempo and rejects bad tempos', () => {
    expect(scaledWindows(W, 300, 360).onTimeMs).toBeCloseTo(37.5);
    expect(() => scaledWindows(W, 0, 100)).toThrow(RangeError);
    expect(() => scaledWindows(W, 100, -1)).toThrow(RangeError);
  });
});

describe('mergeChords', () => {
  it('folds a left and a right tap within the chord window into one both-hands tap at the first time', () => {
    expect(mergeChords([tap(1, 'L'), tap(1.02, 'R')], 40)).toEqual([{ time: 1, hand: 'B' }]);
    expect(mergeChords([tap(1.02, 'R'), tap(1, 'L')], 40)).toEqual([{ time: 1, hand: 'B' }]);
  });

  it('keeps taps apart when they are the same hand, too far apart, or already both hands', () => {
    expect(mergeChords([tap(1, 'R'), tap(1.02, 'R')], 40)).toHaveLength(2);
    expect(mergeChords([tap(1, 'L'), tap(1.05, 'R')], 40)).toHaveLength(2);
    expect(mergeChords([tap(1, 'B'), tap(1.01, 'R')], 40)).toHaveLength(2);
    expect(mergeChords([tap(1, 'L'), tap(1.02, 'R'), tap(1.03, 'L')], 40)).toEqual([
      { time: 1, hand: 'B' },
      { time: 1.03, hand: 'L' },
    ]);
  });
});

describe('scoreTaps verdicts', () => {
  const cells = grid(['R', 'L', 'R', 'B']);

  it('scores on time within ±45 ms', () => {
    const { cells: out, summary } = scoreTaps(cells, [tap(10.0, 'R'), tap(10.244, 'L'), tap(10.4, 'R'), tap(10.6, 'B')], W, LATER);
    expect(out.map((c) => c.verdict)).toEqual(['on-time', 'on-time', 'on-time', 'on-time']);
    expect(out[1].offsetMs).toBeCloseTo(44);
    expect(summary).toMatchObject({ due: 4, onTime: 4, early: 0, late: 0, missed: 0, extra: 0, accuracy: 1 });
  });

  it('scores early and late within ±110 ms with the signed offset', () => {
    const { cells: out } = scoreTaps(cells, [tap(9.92, 'R'), tap(10.3, 'L')], W, LATER);
    expect(out[0]).toMatchObject({ verdict: 'early' });
    expect(out[0].offsetMs).toBeCloseTo(-80);
    expect(out[1]).toMatchObject({ verdict: 'late' });
    expect(out[1].offsetMs).toBeCloseTo(100);
  });

  it('misses a hit cell that was never tapped once its window has passed, pending before', () => {
    const { cells: out, summary } = scoreTaps(cells, [tap(10, 'R')], W, LATER);
    expect(out.slice(1).map((c) => c.verdict)).toEqual(['miss', 'miss', 'miss']);
    expect(summary).toMatchObject({ due: 4, onTime: 1, missed: 3, accuracy: 0.25 });

    const live = scoreTaps(cells, [tap(10, 'R')], W, 10.25);
    expect(live.cells.map((c) => c.verdict)).toEqual(['on-time', 'pending', 'pending', 'pending']);
    expect(live.summary).toMatchObject({ due: 1, onTime: 1, missed: 0, accuracy: 1 });
    // 10.2 + 0.110 has just passed at 10.311: line two is now missed, line three still open.
    expect(scoreTaps(cells, [], W, 10.311).cells.map((c) => c.verdict)).toEqual(['miss', 'miss', 'pending', 'pending']);
  });

  it('counts a tap far from any hit as an extra tap that lowers accuracy', () => {
    const { cells: out, extraTaps, summary } = scoreTaps(cells, [tap(10, 'R'), tap(10.2, 'L'), tap(10.4, 'R'), tap(10.6, 'B'), tap(11.5, 'R')], W, LATER);
    expect(out.map((c) => c.verdict)).toEqual(['on-time', 'on-time', 'on-time', 'on-time']);
    expect(extraTaps).toEqual([{ time: 11.5, hand: 'R', chartKey: null }]);
    expect(summary).toMatchObject({ due: 4, onTime: 4, extra: 1, accuracy: 0.8 });
  });

  it('gives a second tap on the same cell to nobody: it becomes an extra tap', () => {
    const { cells: out, extraTaps } = scoreTaps(grid(['R', null, null, null]), [tap(10, 'R'), tap(10.03, 'R')], W, LATER);
    expect(out[0].verdict).toBe('on-time');
    expect(extraTaps).toHaveLength(1);
  });

  it('counts a tap during a rest, extender or pause as a miss on that cell', () => {
    const silent = grid(['R', null, null, 'L']);
    const { cells: out, extraTaps, summary } = scoreTaps(silent, [tap(10, 'R'), tap(10.2, 'R'), tap(10.6, 'L')], W, LATER);
    expect(out[1]).toMatchObject({ verdict: 'miss', tapHand: 'R', hand: null });
    expect(out[2]).toMatchObject({ verdict: 'untapped', hand: null });
    expect(extraTaps).toEqual([{ time: 10.2, hand: 'R', chartKey: 'c1' }]);
    expect(summary).toMatchObject({ due: 2, onTime: 2, extra: 1 });
    expect(summary.accuracy).toBeCloseTo(2 / 3);
  });

  it('still gives a late tap to the hit cell before a rest when it is inside the window', () => {
    const { cells: out } = scoreTaps(grid(['R', null]), [tap(10.1, 'R')], W, LATER);
    expect(out[0]).toMatchObject({ verdict: 'late' });
    expect(out[1].verdict).toBe('untapped');
  });

  it('marks the wrong hand and does not credit it', () => {
    const { cells: out, summary } = scoreTaps(cells, [tap(10, 'L'), tap(10.2, 'L'), tap(10.4, 'R'), tap(10.6, 'R')], W, LATER);
    expect(out.map((c) => c.verdict)).toEqual(['wrong-hand', 'on-time', 'on-time', 'wrong-hand']);
    expect(out[0].tapHand).toBe('L');
    expect(summary).toMatchObject({ due: 4, onTime: 2, wrongHand: 2, accuracy: 0.5 });
  });

  it('accepts a both-hands chord (two keys inside the chord window) on a B cell', () => {
    const { cells: out } = scoreTaps(cells, [tap(10.59, 'L'), tap(10.61, 'R')], W, LATER);
    expect(out[3]).toMatchObject({ verdict: 'on-time', tapHand: 'B' });
    expect(out[3].offsetMs).toBeCloseTo(-10);
  });

  it('claims the nearest hit when a tap sits between two cells, and leaves the other for its own tap', () => {
    const { cells: out } = scoreTaps(grid(['R', 'R']), [tap(10.09, 'R'), tap(10.21, 'R')], W, LATER);
    expect(out[0]).toMatchObject({ verdict: 'late' });
    expect(out[0].offsetMs).toBeCloseTo(90);
    expect(out[1]).toMatchObject({ verdict: 'on-time' });
    expect(out[1].offsetMs).toBeCloseTo(10);
  });

  it('prefers a cell of the tapped hand over a nearer cell of the other hand', () => {
    // L tap 100 ms after an L cell and 60 ms before an R cell: it was the L, played late.
    const { cells: out } = scoreTaps(grid(['L', 'R'], 0.16), [tap(10.1, 'L')], W, LATER);
    expect(out[0]).toMatchObject({ verdict: 'late', tapHand: 'L' });
    expect(out[1]).toMatchObject({ verdict: 'miss' });
  });

  it('scores a tap that arrived before its pulse was known once the pulse is added', () => {
    const early = scoreTaps(grid(['R']), [tap(10.0, 'R'), tap(10.15, 'R')], W, 10.2);
    expect(early.extraTaps).toHaveLength(1);
    const later = scoreTaps(grid(['R', 'R']), [tap(10.0, 'R'), tap(10.15, 'R')], W, 10.4);
    expect(later.cells.map((c) => c.verdict)).toEqual(['on-time', 'early']);
    expect(later.extraTaps).toHaveLength(0);
  });

  it('uses the scaled windows it is given', () => {
    const slow = scaledWindows(W, 320, 160);
    const { cells: out } = scoreTaps(grid(['R', 'R'], 0.4), [tap(10.08, 'R'), tap(10.6, 'R')], slow, LATER);
    expect(out[0].verdict).toBe('on-time'); // 80 ms is inside the doubled 90 ms window
    expect(out[1].verdict).toBe('late'); // 200 ms is inside the doubled 220 ms window
  });
});

describe('accuracy and heat', () => {
  it('gives half credit for early and late hits', () => {
    expect(NEAR_CREDIT).toBe(0.5);
    expect(accuracyOf({ due: 4, onTime: 2, early: 1, late: 1, extra: 0 })).toBe(0.75);
    expect(accuracyOf({ due: 0, onTime: 0, early: 0, late: 0, extra: 0 })).toBe(0);
  });

  it('folds several loops of the same chart cell into one heat entry with the mean offset', () => {
    const cells = [...grid(['R', null], 0.2, 0), ...grid(['R', null], 0.2, 1).map((c) => ({ ...c, time: c.time + 1 }))];
    const result = scoreTaps(cells, [tap(10.04, 'R'), tap(10.95, 'R'), tap(11.2, 'R')], W, LATER);
    const heat = heatByChartCell(result);
    expect(heat.get('c0')).toMatchObject({ due: 2, onTime: 1, early: 1, late: 0, wrongHand: 0, missed: 0, extra: 0 });
    expect(heat.get('c0')!.meanOffsetMs).toBeCloseTo(-5);
    expect(heat.get('c1')).toMatchObject({ extra: 1, due: 0 });
    expect(heatAccuracy(heat.get('c0')!)).toBe(0.75);
    expect(heat.has('c2')).toBe(false);
  });

  it('reports what became of one tap, for the pad flash', () => {
    const cells = grid(['R', null, 'L']);
    const taps = [tap(10.03, 'R'), tap(10.2, 'R'), tap(10.39, 'L'), tap(10.41, 'R')];
    const result = scoreTaps(cells, taps, W, LATER);
    expect(verdictOfTap(result, 10.03)).toEqual({ verdict: 'on-time', offsetMs: expect.closeTo(30, 5) });
    expect(verdictOfTap(result, 10.2)).toEqual({ verdict: 'miss', offsetMs: null });
    // The L at 10.39 and the R at 10.41 became one both-hands tap: wrong hand for an L cell.
    expect(verdictOfTap(result, 10.39)).toMatchObject({ verdict: 'wrong-hand' });
    expect(verdictOfTap(result, 10.41)).toBeNull();
    expect(verdictOfTap(result, 50)).toBeNull();
  });

  it('ignores pending cells and leaves wrong-hand taps out of the mean offset', () => {
    const result = scoreTaps(grid(['R', 'R', 'R']), [tap(10.0, 'L'), tap(10.22, 'R')], W, 10.3);
    const heat = heatByChartCell(result);
    expect(heat.get('c0')).toMatchObject({ due: 1, wrongHand: 1, meanOffsetMs: null });
    expect(heat.get('c1')!.meanOffsetMs).toBeCloseTo(20);
    expect(heat.has('c2')).toBe(false);
  });
});
