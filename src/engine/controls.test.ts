import { describe, expect, it } from 'vitest';
import pieceJson from '../../public/pieces/placeholder-hard.json';
import {
  audibleParts,
  clampBpm,
  COUNT_IN_PULSES,
  countInStarts,
  jumpLine,
  linesInRange,
  lineStarts,
  loopRange,
  preRollUnits,
  sameLoop,
  tempoRange,
} from './controls';
import { expandPiece } from './expand';
import { loadPiece } from './loadPiece';
import type { PieceJson, SectionJson } from './types';

function fixture(sections: SectionJson[], parts: string[] = ['p1']): PieceJson {
  return {
    id: 'fixture',
    title: 'Fixture',
    pulseBpm: 120,
    linePause: 1,
    instruments: [
      { id: 'drum', name: 'Drum', defaultSurface: 'head', surfaces: { head: { sound: 'low' } } },
    ],
    parts: parts.map((id) => ({ id, name: id, instrument: 'drum' })),
    sections,
  };
}

function section(id: string, lines: Record<string, string[][][]>, extra: Partial<SectionJson> = {}): SectionJson {
  const byPart = Object.fromEntries(Object.entries(lines).map(([partId, ls]) => [partId, ls.map((groups) => ({ groups }))]));
  return { id, name: id, lines: byPart, ...extra };
}

/**
 * Two parts. Section "a": p1 has 3 lines of 2 cells (+1 pause each = 9 pulses), p2 one line of
 * 8 cells (+1 pause). Section "b": p1 only, 2 cells + pause, repeated 3 times. Section "c":
 * both parts, one line, 4 cells + pause, tempoScale 0.5.
 */
const timeline = expandPiece(
  loadPiece(
    fixture(
      [
        section('a', { p1: [[['R', 'L']], [['R', 'R']], [['L', 'L']]], p2: [[['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B']]] }),
        section('b', { p1: [[['R', 'L']]] }, { repeat: 3 }),
        section('c', { p1: [[['R', 'L', 'R', 'L']]], p2: [[['B', '-', 'B', '-']]] }, { tempoScale: 0.5 }),
      ],
      ['p1', 'p2'],
    ),
  ),
);
// Pulse layout: a = 0..8, b = 9..17 (3 reps of 3), c = 18..22.

describe('tempoRange / clampBpm', () => {
  it('spans 40% to 120% of the pulse BPM in whole BPM', () => {
    expect(tempoRange(325)).toEqual({ min: 130, max: 390 });
    expect(tempoRange(100)).toEqual({ min: 40, max: 120 });
  });

  it('clamps into the range', () => {
    const range = tempoRange(100);
    expect(clampBpm(80, range)).toBe(80);
    expect(clampBpm(10, range)).toBe(40);
    expect(clampBpm(500, range)).toBe(120);
  });

  it('rejects bad input', () => {
    expect(() => tempoRange(0)).toThrow(RangeError);
    expect(() => tempoRange(Number.NaN)).toThrow(RangeError);
    expect(() => clampBpm(Number.NaN, tempoRange(100))).toThrow(RangeError);
  });
});

describe('loopRange', () => {
  it('is null when off and the whole timeline for the piece', () => {
    expect(loopRange(timeline, { kind: 'off' })).toBeNull();
    expect(loopRange(timeline, { kind: 'piece' })).toEqual({ start: 0, end: 23 });
  });

  it('covers every repeat of a section', () => {
    expect(loopRange(timeline, { kind: 'section', sectionId: 'a' })).toEqual({ start: 0, end: 9 });
    expect(loopRange(timeline, { kind: 'section', sectionId: 'b' })).toEqual({ start: 9, end: 18 });
    expect(loopRange(timeline, { kind: 'section', sectionId: 'c' })).toEqual({ start: 18, end: 23 });
  });

  it('covers a line range of one part, including the line pauses, first pass only', () => {
    expect(loopRange(timeline, { kind: 'lines', sectionId: 'a', partId: 'p1', from: 1, to: 2 })).toEqual({ start: 3, end: 9 });
    expect(loopRange(timeline, { kind: 'lines', sectionId: 'a', partId: 'p1', from: 0, to: 0 })).toEqual({ start: 0, end: 3 });
    expect(loopRange(timeline, { kind: 'lines', sectionId: 'a', partId: 'p2', from: 0, to: 0 })).toEqual({ start: 0, end: 9 });
    expect(loopRange(timeline, { kind: 'lines', sectionId: 'b', partId: 'p1', from: 0, to: 0 })).toEqual({ start: 9, end: 12 });
  });

  it('names unknown sections, parts and empty line ranges', () => {
    expect(() => loopRange(timeline, { kind: 'section', sectionId: 'zz' })).toThrow(/unknown section id "zz"/);
    expect(() => loopRange(timeline, { kind: 'lines', sectionId: 'a', partId: 'nope', from: 0, to: 0 })).toThrow(/unknown part id "nope"/);
    // p2 is silent in "b".
    expect(() => loopRange(timeline, { kind: 'lines', sectionId: 'b', partId: 'p2', from: 0, to: 0 })).toThrow(/no lines 1-1 in section "b"/);
    expect(() => loopRange(timeline, { kind: 'lines', sectionId: 'a', partId: 'p1', from: 5, to: 5 })).toThrow(/no lines 6-6/);
    expect(() => loopRange(timeline, { kind: 'lines', sectionId: 'a', partId: 'p1', from: 2, to: 1 })).toThrow(/bad line range/);
  });

  it('places the placeholder piece’s build section on its own', () => {
    const real = expandPiece(loadPiece(pieceJson));
    const build = real.sections.find((s) => s.sectionId === 'build')!;
    expect(loopRange(real, { kind: 'section', sectionId: 'build' })).toEqual({ start: build.start, end: build.end });
    expect(build.end - build.start).toBe(32);
  });
});

describe('sameLoop', () => {
  it('compares specs structurally', () => {
    expect(sameLoop({ kind: 'off' }, { kind: 'off' })).toBe(true);
    expect(sameLoop({ kind: 'piece' }, { kind: 'off' })).toBe(false);
    expect(sameLoop({ kind: 'section', sectionId: 'a' }, { kind: 'section', sectionId: 'a' })).toBe(true);
    expect(sameLoop({ kind: 'section', sectionId: 'a' }, { kind: 'section', sectionId: 'b' })).toBe(false);
    const lines = { kind: 'lines', sectionId: 'a', partId: 'p1', from: 1, to: 2 } as const;
    expect(sameLoop(lines, { ...lines })).toBe(true);
    expect(sameLoop(lines, { ...lines, to: 3 })).toBe(false);
    expect(sameLoop(lines, { kind: 'section', sectionId: 'a' })).toBe(false);
  });
});

describe('linesInRange', () => {
  it('lists each touched line of the part once, in order', () => {
    expect(linesInRange(timeline, 'p1', { start: 0, end: 23 })).toEqual([
      { sectionIndex: 0, lineIndex: 0 },
      { sectionIndex: 0, lineIndex: 1 },
      { sectionIndex: 0, lineIndex: 2 },
      { sectionIndex: 1, lineIndex: 0 },
      { sectionIndex: 2, lineIndex: 0 },
    ]);
    expect(linesInRange(timeline, 'p1', { start: 4, end: 10 })).toEqual([
      { sectionIndex: 0, lineIndex: 1 },
      { sectionIndex: 0, lineIndex: 2 },
      { sectionIndex: 1, lineIndex: 0 },
    ]);
  });

  it('skips sections where the part is silent', () => {
    expect(linesInRange(timeline, 'p2', { start: 9, end: 18 })).toEqual([]);
    expect(linesInRange(timeline, 'p2', { start: 0, end: 23 })).toEqual([
      { sectionIndex: 0, lineIndex: 0 },
      { sectionIndex: 2, lineIndex: 0 },
    ]);
  });
});

describe('lineStarts / jumpLine', () => {
  it('finds the first cell of every line of the part, per repeat', () => {
    expect(lineStarts(timeline, 'p1')).toEqual([0, 3, 6, 9, 12, 15, 18]);
    expect(lineStarts(timeline, 'p2')).toEqual([0, 18]);
    expect(lineStarts(timeline, 'p1', { start: 9, end: 18 })).toEqual([9, 12, 15]);
  });

  it('moves to the start of the next or previous line', () => {
    expect(jumpLine(timeline, 'p1', 0, 1)).toBe(3);
    expect(jumpLine(timeline, 'p1', 4, 1)).toBe(6); // mid-line 2 → line 3
    expect(jumpLine(timeline, 'p1', 4, -1)).toBe(0); // mid-line 2 → line 1
    expect(jumpLine(timeline, 'p1', 8, 1)).toBe(9); // in the pause after line 3 → section b
    expect(jumpLine(timeline, 'p1', 12, -1)).toBe(9); // rep 2 → rep 1 of b
  });

  it('clamps at the first and last line of the range', () => {
    expect(jumpLine(timeline, 'p1', 0, -1)).toBe(0);
    expect(jumpLine(timeline, 'p1', 20, 1)).toBe(18);
    expect(jumpLine(timeline, 'p1', 15, 1, { start: 9, end: 18 })).toBe(15);
    expect(jumpLine(timeline, 'p1', 9, -1, { start: 9, end: 18 })).toBe(9);
    expect(jumpLine(timeline, 'p1', 0, 5)).toBe(15);
    expect(jumpLine(timeline, 'p1', 0, 10)).toBe(18);
  });

  it('only clamps into the range when the part has no lines there', () => {
    expect(jumpLine(timeline, 'p2', 9, 1, { start: 9, end: 18 })).toBe(9);
    expect(jumpLine(timeline, 'p2', 30, 1, { start: 9, end: 18 })).toBe(17);
  });

  it('rejects a fractional delta', () => {
    expect(() => jumpLine(timeline, 'p1', 0, 0.5)).toThrow(RangeError);
  });
});

describe('count-in', () => {
  it('reserves room for four of the longest pulses', () => {
    expect(preRollUnits(timeline)).toBe(COUNT_IN_PULSES * 2); // section c pulses last 2 units
    const plain = expandPiece(loadPiece(fixture([section('a', { p1: [[['R']]] })])));
    expect(preRollUnits(plain)).toBe(COUNT_IN_PULSES);
  });

  it('clicks four times at the start pulse’s own length, ending one pulse before it', () => {
    expect(countInStarts(timeline, 0)).toEqual([-4, -3, -2, -1]);
    expect(countInStarts(timeline, 9)).toEqual([5, 6, 7, 8]);
    // Section c: pulses last 2 units, so the count-in is at half speed too.
    const c = timeline.pulses[18];
    expect(countInStarts(timeline, 18)).toEqual([c.start - 8, c.start - 6, c.start - 4, c.start - 2]);
    expect(countInStarts(timeline, 18).map((u) => u + preRollUnits(timeline)).every((u) => u >= 0)).toBe(true);
  });

  it('rejects an index with no pulse', () => {
    expect(() => countInStarts(timeline, 99)).toThrow(RangeError);
  });
});

describe('audibleParts', () => {
  const parts = ['p1', 'p2', 'p3'];

  it('drops muted parts and keeps the order', () => {
    expect(audibleParts(parts, [], null)).toEqual(parts);
    expect(audibleParts(parts, ['p2'], null)).toEqual(['p1', 'p3']);
    expect(audibleParts(parts, new Set(['p1', 'p3']), null)).toEqual(['p2']);
  });

  it('lets a solo win over every mute', () => {
    expect(audibleParts(parts, ['p2'], 'p2')).toEqual(['p2']);
    expect(audibleParts(parts, [], 'p3')).toEqual(['p3']);
  });

  it('ignores a solo on a part the piece does not have', () => {
    expect(audibleParts(parts, ['p1'], 'nope')).toEqual(['p2', 'p3']);
  });
});
