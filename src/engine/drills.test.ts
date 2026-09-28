import { describe, expect, it } from 'vitest';
import pieceJson from '../../public/pieces/placeholder-hard.json';
import {
  answerFor,
  cellAtKey,
  chartKeysInRange,
  cueCellKeys,
  entryIndices,
  GAP_MAX,
  GAP_MIN,
  isEntry,
  leadPartId,
  lineKeyOfChartKey,
  pickGaps,
  worstLines,
} from './drills';
import { expandPiece } from './expand';
import { loadPiece } from './loadPiece';
import type { CellHeat } from './scorer';
import type { PieceJson, SectionJson } from './types';

function fixture(sections: SectionJson[], parts: { id: string; lead?: boolean }[] = [{ id: 'p1' }]): PieceJson {
  return {
    id: 'fixture',
    title: 'Fixture',
    pulseBpm: 120,
    linePause: 1,
    instruments: [{ id: 'drum', name: 'Drum', defaultSurface: 'head', surfaces: { head: { sound: 'low' } } }],
    parts: parts.map((part) => ({ id: part.id, name: part.id, instrument: 'drum', lead: part.lead })),
    sections,
  };
}

function section(id: string, lines: Record<string, string[][][]>, extra: Partial<SectionJson> = {}): SectionJson {
  const byPart = Object.fromEntries(Object.entries(lines).map(([partId, ls]) => [partId, ls.map((groups) => ({ groups }))]));
  return { id, name: id, lines: byPart, ...extra };
}

// p1: section a = two lines (R L | - ~) (B B); section b = one line (R R R) repeated twice; p2 only in a.
const piece = loadPiece(
  fixture(
    [
      section('a', { p1: [[['R', 'L'], ['-', '~']], [['B', 'B']]], p2: [[['-', 'L', 'L', 'L', 'L', 'L', 'L']]] }),
      section('b', { p1: [[['R', 'R', 'R']]] }, { repeat: 2 }),
    ],
    [{ id: 'p1' }, { id: 'p2', lead: true }],
  ),
);
const timeline = expandPiece(piece);
// Pulses: a = 0..6 (line 1: 0-3, pause 4; line 2: 5-6, pause 7) → a is 8 pulses (0..7); b = 8..15 (two reps of 3 + pause).

describe('chartKeysInRange', () => {
  it('lists each chart cell once, in order, ignoring pauses and repeats', () => {
    expect(chartKeysInRange(timeline, 'p1', { start: 0, end: 16 })).toEqual(['0:0:0:0', '0:0:0:1', '0:0:1:0', '0:0:1:1', '0:1:0:0', '0:1:0:1', '1:0:0:0', '1:0:0:1', '1:0:0:2']);
    expect(chartKeysInRange(timeline, 'p1', { start: 8, end: 16 })).toEqual(['1:0:0:0', '1:0:0:1', '1:0:0:2']);
    expect(chartKeysInRange(timeline, 'p2', { start: 8, end: 16 })).toEqual([]);
    expect(chartKeysInRange(timeline, 'p1', null)).toEqual([]);
  });
});

describe('fill the gap', () => {
  const keys = chartKeysInRange(timeline, 'p1', { start: 0, end: 16 });

  it('answers a hand for hits and rest for rests and extenders', () => {
    const cells = piece.sections[0].lines.p1[0].groups.flat();
    expect(cells.map(answerFor)).toEqual(['R', 'L', 'rest', 'rest']);
    expect(answerFor(piece.sections[0].lines.p1[1].groups[0][0])).toBe('B');
  });

  it('picks 3 to 6 cells in chart order, the same for the same seed', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const gaps = pickGaps(keys, seed);
      expect(gaps.length).toBeGreaterThanOrEqual(GAP_MIN);
      expect(gaps.length).toBeLessThanOrEqual(GAP_MAX);
      expect(gaps).toEqual(keys.filter((key) => gaps.includes(key)));
      expect(new Set(gaps).size).toBe(gaps.length);
    }
    expect(pickGaps(keys, 7)).toEqual(pickGaps(keys, 7));
    expect(pickGaps(keys, 7)).not.toEqual(pickGaps(keys, 8));
  });

  it('never picks more cells than the section has', () => {
    expect(pickGaps(['a', 'b'], 3)).toHaveLength(2);
    expect(pickGaps([], 3)).toEqual([]);
  });
});

describe('cue drill', () => {
  it('uses the lead part, or the drilled part when none is marked', () => {
    expect(leadPartId(piece, 'p1')).toBe('p2');
    expect(leadPartId(loadPiece(pieceJson), 'hard')).toBe('hard');
  });

  it('takes the last group of the last line of each section as the cue', () => {
    expect([...cueCellKeys(piece, 'p1')].sort()).toEqual(['0:1:0:0', '0:1:0:1', '1:0:0:0', '1:0:0:1', '1:0:0:2']);
    expect([...cueCellKeys(piece, 'p2')]).toEqual(['0:0:0:0', '0:0:0:1', '0:0:0:2', '0:0:0:3', '0:0:0:4', '0:0:0:5', '0:0:0:6']);
  });

  it('finds the first hit of each section, first pass only, skipping leading rests', () => {
    expect([...entryIndices(timeline, 'p1')]).toEqual([0, 8]);
    expect([...entryIndices(timeline, 'p2')]).toEqual([1]);
    const entries = entryIndices(timeline, 'p1');
    expect(isEntry(timeline.pulses[8], timeline.pulses[8].parts.p1, entries)).toBe(true);
    expect(isEntry(timeline.pulses[11], timeline.pulses[11].parts.p1, entries)).toBe(false);
    expect(isEntry(timeline.pulses[8], undefined, entries)).toBe(false);
  });
});

describe('cellAtKey', () => {
  it('finds the resolved cell behind a chart key, or null', () => {
    expect(cellAtKey(piece, 'p1', '0:0:1:1')?.kind).toBe('extender');
    expect(cellAtKey(piece, 'p1', '1:0:0:2')).toMatchObject({ kind: 'hit', hand: 'R' });
    expect(cellAtKey(piece, 'p2', '1:0:0:0')).toBeNull();
    expect(cellAtKey(piece, 'p1', '0:1:pause')).toBeNull();
    expect(cellAtKey(piece, 'p1', '9:0:0:0')).toBeNull();
  });
});

describe('worst lines', () => {
  const heat = (partial: Partial<CellHeat>): CellHeat => ({ due: 0, onTime: 0, early: 0, late: 0, wrongHand: 0, missed: 0, extra: 0, meanOffsetMs: null, ...partial });

  it('splits a chart key into its line', () => {
    expect(lineKeyOfChartKey('2:3:1:0')).toBe('2:3');
    expect(lineKeyOfChartKey('2:3:pause')).toBe('2:3');
  });

  it('ranks lines by accuracy, counting taps in the breath against the line', () => {
    const map = new Map<string, CellHeat>([
      ['0:0:0:0', heat({ due: 2, onTime: 2 })],
      ['0:0:0:1', heat({ due: 2, onTime: 1, late: 1 })],
      ['0:1:0:0', heat({ due: 2, missed: 2 })],
      ['0:1:pause', heat({ extra: 1 })],
      ['1:0:0:0', heat({ due: 1, early: 1 })],
      ['1:0:0:1', heat({ due: 1, onTime: 1 })],
      ['2:0:0:0', heat({ extra: 3 })], // tapped a silent line: nothing due, left out
    ]);
    const worst = worstLines(map, 3);
    expect(worst.map((l) => [l.sectionIndex, l.lineIndex, l.due, +l.accuracy.toFixed(3)])).toEqual([
      [0, 1, 2, 0],
      [1, 0, 2, 0.75],
      [0, 0, 4, 0.875],
    ]);
    expect(worstLines(map, 1)).toHaveLength(1);
    expect(worstLines(new Map(), 3)).toEqual([]);
  });
});
