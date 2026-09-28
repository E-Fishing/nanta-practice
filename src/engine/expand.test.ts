import { describe, expect, it } from 'vitest';
import pieceJson from '../../public/pieces/placeholder-hard.json';
import { CRESCENDO_START_DB, crescendoDb, expandPiece, unitsToSeconds } from './expand';
import { loadPiece } from './loadPiece';
import type { CellRef, LineJson, PieceJson, SectionJson, Timeline, TimelinePulse } from './types';

// ---------------------------------------------------------------------------
// Fixtures: raw JSON run through the real loader so tests see the resolved model.
// ---------------------------------------------------------------------------

interface FixtureOptions {
  linePause?: number;
  /** Part ids; every part plays the one drum instrument. Default ["p1"]. */
  parts?: string[];
}

function fixture(sections: SectionJson[], options: FixtureOptions = {}): PieceJson {
  return {
    id: 'fixture',
    title: 'Fixture',
    pulseBpm: 120,
    linePause: options.linePause ?? 0,
    instruments: [
      {
        id: 'drum',
        name: 'Drum',
        defaultSurface: 'head',
        surfaces: {
          head: { sound: 'low', gueum: { B: '덩' } },
          rim: { sound: 'click', gueum: { R: '딱', L: '딱', B: '딱' } },
        },
      },
    ],
    parts: (options.parts ?? ['p1']).map((id) => ({ id, name: `Part ${id}`, instrument: 'drum' })),
    sections,
  };
}

function line(groups: string[][], pauseAfter?: number): LineJson {
  return pauseAfter === undefined ? { groups } : { groups, pauseAfter };
}

/** A section for part "p1" only, unless `lines` is given per part. */
function section(
  id: string,
  lines: LineJson[] | Record<string, LineJson[]>,
  extra: Partial<Omit<SectionJson, 'id' | 'lines'>> = {},
): SectionJson {
  return { id, name: id.toUpperCase(), lines: Array.isArray(lines) ? { p1: lines } : lines, ...extra };
}

function expand(sections: SectionJson[], options: FixtureOptions = {}): Timeline {
  return expandPiece(loadPiece(fixture(sections, options)));
}

function cellSlot(pulse: TimelinePulse, partId: string): CellRef {
  const slot = pulse.parts[partId];
  if (slot.kind !== 'cell') throw new Error(`pulse ${pulse.index} part ${partId}: expected a cell, got ${slot.kind}`);
  return slot;
}

function pulsesOf(timeline: Timeline, sectionId: string): TimelinePulse[] {
  return timeline.pulses.filter((pulse) => pulse.sectionId === sectionId);
}

const FOUR_CELLS = [line([['L^', 'R', 'R', '~']], 0)];

// ---------------------------------------------------------------------------

describe('repeat', () => {
  const timeline = expand([section('build', FOUR_CELLS, { repeat: 8 })]);

  it('yields cells x repeat pulses', () => {
    expect(timeline.totalPulses).toBe(32);
    expect(timeline.pulses).toHaveLength(32);
  });

  it('numbers reps 1..8, each covering one pass, with pulseInSection cycling 0..3', () => {
    timeline.pulses.forEach((pulse, i) => {
      expect(pulse.rep).toBe(Math.floor(i / 4) + 1);
      expect(pulse.repeatCount).toBe(8);
      expect(pulse.pulseInSection).toBe(i % 4);
    });
    expect(new Set(timeline.pulses.map((pulse) => pulse.rep))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('records one span covering all repeats', () => {
    expect(timeline.sections).toEqual([
      { sectionIndex: 0, sectionId: 'build', start: 0, end: 32, pulsesPerRep: 4, repeatCount: 8 },
    ]);
  });

  it('plays a section without repeat exactly once', () => {
    const once = expand([section('s', FOUR_CELLS)]);
    expect(once.totalPulses).toBe(4);
    expect(once.pulses.every((pulse) => pulse.rep === 1 && pulse.repeatCount === 1)).toBe(true);
  });
});

describe('linePause and pauseAfter', () => {
  const three = [['R', 'L', 'R']];
  const five = [['R', 'L', 'R', 'L', 'R']];

  it('appends the piece linePause after every line', () => {
    const timeline = expand([section('s', [line(three), line(five)])], { linePause: 2 });
    expect(timeline.totalPulses).toBe(12);
    expect(timeline.pulses.map((pulse) => pulse.parts.p1.kind)).toEqual([
      'cell', 'cell', 'cell', 'pause', 'pause',
      'cell', 'cell', 'cell', 'cell', 'cell', 'pause', 'pause',
    ]);
    expect(timeline.pulses[3].parts.p1).toEqual({ kind: 'pause', lineIndex: 0 });
    expect(timeline.pulses[4].parts.p1).toEqual({ kind: 'pause', lineIndex: 0 });
    expect(timeline.pulses[10].parts.p1).toEqual({ kind: 'pause', lineIndex: 1 });
    expect(timeline.pulses[11].parts.p1).toEqual({ kind: 'pause', lineIndex: 1 });
  });

  it('pauseAfter 0 removes the pause for that line', () => {
    const timeline = expand([section('s', [line(three), line(five, 0)])], { linePause: 2 });
    expect(timeline.totalPulses).toBe(10);
    expect(timeline.pulses.slice(5).every((pulse) => pulse.parts.p1.kind === 'cell')).toBe(true);
  });

  it('pauseAfter overrides the piece linePause with its own count', () => {
    const timeline = expand([section('s', [line(three, 5), line(five)])], { linePause: 2 });
    expect(timeline.totalPulses).toBe(15);
    const pauses = timeline.pulses.filter((pulse) => pulse.parts.p1.kind === 'pause').map((pulse) => pulse.index);
    expect(pauses).toEqual([3, 4, 5, 6, 7, 13, 14]);
  });

  it('adds no pause when the piece has no linePause', () => {
    const timeline = expand([section('s', [line(three), line(five)])]);
    expect(timeline.totalPulses).toBe(8);
  });
});

describe('tempoScale', () => {
  it('stretches every pulse of the section and accumulates start across the boundary', () => {
    const timeline = expand([
      section('normal', [line([['R', 'L', 'R']], 0)]),
      section('slow', [line([['R', 'L', 'R']], 0)], { tempoScale: 0.5 }),
    ]);
    expect(timeline.pulses.map((pulse) => pulse.duration)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(timeline.pulses.map((pulse) => pulse.start)).toEqual([0, 1, 2, 3, 5, 7]);
    expect(timeline.totalUnits).toBe(9);
    expect(timeline.totalPulses).toBe(6);
  });

  it('shortens pulses for tempoScale above 1', () => {
    const timeline = expand([section('fast', FOUR_CELLS, { tempoScale: 2 })]);
    expect(timeline.pulses.every((pulse) => pulse.duration === 0.5)).toBe(true);
    expect(timeline.totalUnits).toBe(2);
  });
});

describe('crescendo', () => {
  function gainPerRep(timeline: Timeline): number[] {
    const byRep = new Map<number, Set<number>>();
    for (const pulse of timeline.pulses) {
      const gains = byRep.get(pulse.rep) ?? new Set<number>();
      gains.add(pulse.gainDb);
      byRep.set(pulse.rep, gains);
    }
    return [...byRep.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, gains]) => {
        expect(gains.size).toBe(1); // identical within a rep
        return [...gains][0];
      });
  }

  it('ramps from CRESCENDO_START_DB to 0 across the repeats, constant within a rep', () => {
    const gains = gainPerRep(expand([section('build', FOUR_CELLS, { repeat: 8, crescendo: true })]));
    expect(gains).toHaveLength(8);
    expect(gains[0]).toBe(CRESCENDO_START_DB);
    expect(gains[7]).toBe(0);
    for (let i = 1; i < gains.length; i += 1) expect(gains[i]).toBeGreaterThan(gains[i - 1]);
  });

  it('is 0 everywhere without crescendo', () => {
    const timeline = expand([section('build', FOUR_CELLS, { repeat: 8 })]);
    expect(timeline.pulses.every((pulse) => pulse.gainDb === 0)).toBe(true);
  });

  it('plays a single-repeat crescendo section at full volume', () => {
    const timeline = expand([
      section('implicit', FOUR_CELLS, { crescendo: true }),
      section('explicit', FOUR_CELLS, { repeat: 1, crescendo: true }),
    ]);
    expect(timeline.pulses).toHaveLength(8);
    for (const pulse of timeline.pulses) {
      expect(pulse.gainDb).toBe(0);
      expect(pulse.rep).toBe(1);
      expect(pulse.repeatCount).toBe(1);
    }
  });

  it('crescendoDb', () => {
    expect(crescendoDb(1, 1)).toBe(0);
    expect(crescendoDb(1, 8)).toBe(CRESCENDO_START_DB);
    expect(crescendoDb(8, 8)).toBe(0);
    expect(crescendoDb(3, 8)).toBeGreaterThan(CRESCENDO_START_DB);
    expect(crescendoDb(3, 8)).toBeLessThan(0);
    expect(crescendoDb(3, 8)).toBeCloseTo(CRESCENDO_START_DB * (5 / 7), 10);
    expect(() => crescendoDb(0, 8)).toThrow(RangeError);
    expect(() => crescendoDb(9, 8)).toThrow(RangeError);
    expect(() => crescendoDb(1.5, 8)).toThrow(RangeError);
  });
});

describe('cell slots', () => {
  it('sets groupStart and lineStart flags and cell coordinates', () => {
    const timeline = expand([section('s', [line([['R', 'L'], ['B']], 0)])]);
    const slots = timeline.pulses.map((pulse) => cellSlot(pulse, 'p1'));
    expect(slots.map((slot) => [slot.groupStart, slot.lineStart])).toEqual([
      [true, true],
      [false, false],
      [true, false],
    ]);
    expect(slots.map((slot) => [slot.lineIndex, slot.groupIndex, slot.cellIndex])).toEqual([
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ]);
    expect(slots.map((slot) => slot.cell.token)).toEqual(['R', 'L', 'B']);
  });

  it('lineStart is set on the first cell of every line', () => {
    const timeline = expand([section('s', [line([['R', 'L']]), line([['B'], ['R']])])], { linePause: 1 });
    const starts = timeline.pulses
      .filter((pulse) => pulse.parts.p1.kind === 'cell' && cellSlot(pulse, 'p1').lineStart)
      .map((pulse) => pulse.index);
    expect(starts).toEqual([0, 3]);
  });

  it('carries the resolved cell from the loader', () => {
    const timeline = expand([section('s', [line([['B:rim{딱}', '~', '-']], 0)])]);
    const [hit, extender, rest] = timeline.pulses.map((pulse) => cellSlot(pulse, 'p1').cell);
    expect(hit.kind).toBe('hit');
    if (hit.kind === 'hit') {
      expect(hit.hand).toBe('B');
      expect(hit.surfaceId).toBe('rim');
      expect(hit.sound).toBe('click');
      expect(hit.gueum).toBe('딱');
    }
    expect(extender.kind).toBe('extender');
    expect(rest.kind).toBe('rest');
  });
});

describe('parts', () => {
  const twoParts = { parts: ['p1', 'p2'], linePause: 1 };

  it('makes a part absent from a section silent at every pulse', () => {
    const timeline = expand([section('s', { p1: [line([['R', 'L', 'R']])] })], twoParts);
    expect(timeline.totalPulses).toBe(4);
    for (const pulse of timeline.pulses) {
      expect(pulse.parts.p2).toEqual({ kind: 'silent' });
      expect(Object.keys(pulse.parts).sort()).toEqual(['p1', 'p2']);
    }
    expect(timeline.pulses.map((pulse) => pulse.parts.p1.kind)).toEqual(['cell', 'cell', 'cell', 'pause']);
  });

  it('maps parts with different layouts but equal totals pulse by pulse', () => {
    const timeline = expand(
      [section('s', { p1: [line([['R', 'L', 'R']])], p2: [line([['B']]), line([['B']])] })],
      twoParts,
    );
    expect(timeline.totalPulses).toBe(4);
    expect(timeline.pulses.map((pulse) => pulse.parts.p1.kind)).toEqual(['cell', 'cell', 'cell', 'pause']);
    expect(timeline.pulses.map((pulse) => pulse.parts.p2.kind)).toEqual(['cell', 'pause', 'cell', 'pause']);
    expect(cellSlot(timeline.pulses[0], 'p2').lineIndex).toBe(0);
    expect(timeline.pulses[1].parts.p2).toEqual({ kind: 'pause', lineIndex: 0 });
    expect(cellSlot(timeline.pulses[2], 'p2')).toMatchObject({ lineIndex: 1, groupIndex: 0, cellIndex: 0, lineStart: true });
    expect(timeline.pulses[3].parts.p2).toEqual({ kind: 'pause', lineIndex: 1 });
  });

  it('shares slot objects across repeats', () => {
    const timeline = expand([section('s', FOUR_CELLS, { repeat: 3 })]);
    expect(timeline.pulses[4].parts.p1).toBe(timeline.pulses[0].parts.p1);
    expect(timeline.pulses[8].parts.p1).toBe(timeline.pulses[0].parts.p1);
  });
});

describe('sectionIds option', () => {
  const piece = loadPiece(pieceJson);

  it('expands only the named section', () => {
    const timeline = expandPiece(piece, { sectionIds: ['build'] });
    expect(timeline.totalPulses).toBe(32);
    expect(timeline.sections).toEqual([
      { sectionIndex: 4, sectionId: 'build', start: 0, end: 32, pulsesPerRep: 4, repeatCount: 8 },
    ]);
    expect(timeline.pulses.every((pulse) => pulse.sectionIndex === 4 && pulse.sectionId === 'build')).toBe(true);
    expect(timeline.pulses[0].start).toBe(0);
  });

  it('keeps piece order regardless of the order given', () => {
    const timeline = expandPiece(piece, { sectionIds: ['ending', 'open'] });
    expect(timeline.sections.map((span) => span.sectionId)).toEqual(['open', 'ending']);
    expect(timeline.totalPulses).toBe(36);
  });

  it('throws a RangeError naming an unknown id', () => {
    expect(() => expandPiece(piece, { sectionIds: ['nope'] })).toThrow(RangeError);
    expect(() => expandPiece(piece, { sectionIds: ['nope'] })).toThrow('nope');
  });
});

describe('placeholder-hard', () => {
  const piece = loadPiece(pieceJson);
  const timeline = expandPiece(piece);

  it('has 218 pulses over 228 units', () => {
    expect(timeline.pieceId).toBe('placeholder-hard');
    expect(timeline.pulseBpm).toBe(325);
    expect(timeline.totalPulses).toBe(218);
    expect(timeline.pulses).toHaveLength(218);
    expect(timeline.totalUnits).toBe(228);
  });

  it('spans every section in order with the expected sizes', () => {
    expect(timeline.sections.map((span) => span.sectionId)).toEqual([
      'open', 'a', 'cross', 'lift', 'build', 'exit', 'cross2', 'ending',
    ]);
    expect(timeline.sections.map((span) => span.sectionIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(timeline.sections.map((span) => span.end - span.start)).toEqual([26, 56, 38, 18, 32, 16, 22, 10]);
    expect(timeline.sections.map((span) => span.pulsesPerRep)).toEqual([26, 56, 38, 18, 4, 16, 22, 10]);
    timeline.sections.forEach((span, i) => {
      expect(span.start).toBe(i === 0 ? 0 : timeline.sections[i - 1].end);
    });
    expect(timeline.sections[7].end).toBe(218);
  });

  it('counts 190 cells and 28 line pauses', () => {
    const kinds = timeline.pulses.map((pulse) => pulse.parts.hard.kind);
    expect(kinds.filter((kind) => kind === 'cell')).toHaveLength(190);
    expect(kinds.filter((kind) => kind === 'pause')).toHaveLength(28);
    expect(kinds.filter((kind) => kind === 'silent')).toHaveLength(0);
  });

  it('gives the ending double-length pulses and everything else single', () => {
    expect(pulsesOf(timeline, 'ending').every((pulse) => pulse.duration === 2)).toBe(true);
    expect(timeline.pulses.filter((pulse) => pulse.sectionId !== 'ending').every((pulse) => pulse.duration === 1)).toBe(true);
  });

  it('builds a rising crescendo over 32 pulses', () => {
    const build = pulsesOf(timeline, 'build');
    expect(build).toHaveLength(32);
    const gains = [1, 2, 3, 4, 5, 6, 7, 8].map((rep) => build.find((pulse) => pulse.rep === rep)?.gainDb);
    expect(gains[0]).toBe(CRESCENDO_START_DB);
    expect(gains[7]).toBe(0);
    for (let i = 1; i < gains.length; i += 1) expect(gains[i]).toBeGreaterThan(gains[i - 1] as number);
    expect(timeline.pulses.filter((pulse) => pulse.sectionId !== 'build').every((pulse) => pulse.gainDb === 0)).toBe(true);
  });

  it('indexes pulses by position with non-decreasing starts ending at totalUnits', () => {
    timeline.pulses.forEach((pulse, i) => {
      expect(pulse.index).toBe(i);
      if (i > 0) expect(pulse.start).toBeGreaterThanOrEqual(timeline.pulses[i - 1].start);
    });
    const last = timeline.pulses[timeline.pulses.length - 1];
    expect(last.start + last.duration).toBe(timeline.totalUnits);
  });

  it('converts units to seconds at the pulse BPM', () => {
    expect(unitsToSeconds(228, 325)).toBeCloseTo(42.09, 2);
    expect(unitsToSeconds(timeline.totalUnits, timeline.pulseBpm)).toBeCloseTo(42.09, 2);
    expect(unitsToSeconds(1, 60)).toBe(1);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(piece);
    expandPiece(piece);
    expandPiece(piece, { sectionIds: ['build'] });
    expect(piece).toEqual(before);
    expect(JSON.stringify(piece)).toBe(JSON.stringify(before));
  });
});
