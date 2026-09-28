import { describe, expect, it } from 'vitest';
import pieceJson from '../../public/pieces/placeholder-hard.json';
import { CRESCENDO_START_DB, expandPiece } from './expand';
import { loadPiece } from './loadPiece';
import { metronomeAccent, pulseTicks, soundIdsOf, strokesAt, tickTime } from './schedule';
import { DYNAMIC_DB, GRACE_DB, GRACE_LEAD_SECONDS } from './tokens';
import type { PieceJson, SectionJson } from './types';

const PPQ = 192;

function fixture(sections: SectionJson[], parts: string[] = ['p1']): PieceJson {
  return {
    id: 'fixture',
    title: 'Fixture',
    pulseBpm: 120,
    linePause: 1,
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
    parts: parts.map((id) => ({ id, name: id, instrument: 'drum' })),
    sections,
  };
}

function section(id: string, lines: Record<string, string[][][]>, extra: Partial<SectionJson> = {}): SectionJson {
  const byPart = Object.fromEntries(Object.entries(lines).map(([partId, ls]) => [partId, ls.map((groups) => ({ groups }))]));
  return { id, name: id, lines: byPart, ...extra };
}

describe('pulseTicks / tickTime', () => {
  it('places whole units on quarter-note ticks', () => {
    expect(pulseTicks(0, PPQ)).toBe(0);
    expect(pulseTicks(1, PPQ)).toBe(192);
    expect(pulseTicks(227, PPQ)).toBe(227 * 192);
  });

  it('rounds fractional units (tempoScale) to the nearest tick', () => {
    expect(pulseTicks(0.5, PPQ)).toBe(96);
    expect(pulseTicks(1 / 3, PPQ)).toBe(64);
    expect(pulseTicks(1 / 0.7, PPQ)).toBe(274); // 274.29
  });

  it('rejects bad input', () => {
    expect(() => pulseTicks(-1, PPQ)).toThrow(RangeError);
    expect(() => pulseTicks(Number.NaN, PPQ)).toThrow(RangeError);
    expect(() => pulseTicks(1, 0)).toThrow(RangeError);
    expect(() => pulseTicks(1, 1.5)).toThrow(RangeError);
  });

  it('formats ticks in Tone notation', () => {
    expect(tickTime(384)).toBe('384i');
  });
});

describe('strokesAt', () => {
  const piece = loadPiece(
    fixture([section('s', { p1: [[['R', 'L_', "B'", 'R>', '-', '~', 'R:rim', 'L/R{그덩}']]] })]),
  );
  const timeline = expandPiece(piece);
  const at = (i: number) => strokesAt(timeline.pulses[i], ['p1']);

  it('sounds one stroke per hit with the dynamic gain on the surface sound', () => {
    expect(at(0)).toEqual([{ partId: 'p1', sound: 'low', hand: 'R', gainDb: 0, offsetSeconds: 0, grace: false }]);
    expect(at(1)[0]).toMatchObject({ hand: 'L', gainDb: DYNAMIC_DB.soft });
    expect(at(2)[0]).toMatchObject({ hand: 'B', gainDb: DYNAMIC_DB.accent });
    expect(at(3)[0]).toMatchObject({ hand: 'R', gainDb: DYNAMIC_DB.strong });
    expect(at(6)[0]).toMatchObject({ sound: 'click', hand: 'R', gainDb: 0 });
  });

  it('is silent on rests, extenders and line pauses', () => {
    expect(at(4)).toEqual([]);
    expect(at(5)).toEqual([]);
    expect(timeline.pulses[8].parts.p1.kind).toBe('pause');
    expect(at(8)).toEqual([]);
  });

  it('adds a softer grace stroke ahead of the main hand for a flam', () => {
    expect(at(7)).toEqual([
      { partId: 'p1', sound: 'low', hand: 'L', gainDb: GRACE_DB, offsetSeconds: -GRACE_LEAD_SECONDS, grace: true },
      { partId: 'p1', sound: 'low', hand: 'R', gainDb: 0, offsetSeconds: 0, grace: false },
    ]);
  });

  it('adds the crescendo gain of the repeat to every stroke', () => {
    const cresc = expandPiece(loadPiece(fixture([section('b', { p1: [[['R>', 'L_']]] }, { repeat: 4, crescendo: true })])));
    const first = strokesAt(cresc.pulses[0], ['p1'])[0];
    const last = strokesAt(cresc.pulses[cresc.totalPulses - 3], ['p1'])[0];
    expect(first.gainDb).toBe(CRESCENDO_START_DB + DYNAMIC_DB.strong);
    expect(last.gainDb).toBe(DYNAMIC_DB.strong);
    expect(strokesAt(cresc.pulses[1], ['p1'])[0].gainDb).toBe(CRESCENDO_START_DB + DYNAMIC_DB.soft);
  });

  it('collects strokes of several parts in the order given and skips silent parts', () => {
    const two = expandPiece(loadPiece(fixture([section('s', { p1: [[['R', 'L']]], p2: [[['B', '-']]] })], ['p1', 'p2'])));
    expect(strokesAt(two.pulses[0], ['p1', 'p2']).map((s) => [s.partId, s.hand])).toEqual([
      ['p1', 'R'],
      ['p2', 'B'],
    ]);
    expect(strokesAt(two.pulses[0], ['p2', 'p1']).map((s) => s.partId)).toEqual(['p2', 'p1']);
    expect(strokesAt(two.pulses[1], ['p1', 'p2']).map((s) => s.partId)).toEqual(['p1']);
    expect(strokesAt(two.pulses[0], ['nope'])).toEqual([]);
  });
});

describe('metronomeAccent', () => {
  const timeline = expandPiece(
    loadPiece(fixture([section('s', { p1: [[['R', 'L'], ['-', 'B']], [['R']]], p2: [[['B', 'B', 'B', 'B', 'B', 'B']]] })], ['p1', 'p2'])),
  );

  it('is true on the first cell of every group of the followed part, even a rest', () => {
    expect(timeline.pulses.map((pulse) => metronomeAccent(pulse, 'p1'))).toEqual([
      true, false, true, false, false, // line 1: R L | - B, pause
      true, false, // line 2: R, pause
    ]);
  });

  it('follows the part asked for', () => {
    expect(timeline.pulses.map((pulse) => metronomeAccent(pulse, 'p2'))).toEqual([
      true, false, false, false, false, false, false,
    ]);
    expect(timeline.pulses.map((pulse) => metronomeAccent(pulse, 'nope'))).toEqual([
      false, false, false, false, false, false, false,
    ]);
  });
});

describe('soundIdsOf', () => {
  it('lists each sound once in first-seen order', () => {
    expect(soundIdsOf(loadPiece(pieceJson))).toEqual(['low', 'click']);
  });
});
