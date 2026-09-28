/**
 * Unit tests for the cell display model (SPEC.md §4.2 marks, §3.2 grace notes, §3.3 syllables).
 * Cells go through the real parser and loader so the model is tested on resolved cells.
 */
import { describe, expect, it } from 'vitest';
import { loadPiece } from '../engine/loadPiece';
import type { PieceJson, ResolvedCell, ResolvedHit } from '../engine/types';
import { EXTENDER_LABEL, REST_LABEL, cellView, visibleSyllable, type HitView } from './cellView';

// ---------------------------------------------------------------------------
// Fixture: one drum with a head (default, only B has a syllable) and a rim (all hands 딱).
// ---------------------------------------------------------------------------

function fixture(tokens: string[]): PieceJson {
  return {
    id: 'fixture',
    title: 'Fixture',
    pulseBpm: 300,
    instruments: [
      {
        id: 'drum',
        name: 'Drum',
        defaultSurface: 'head',
        surfaces: {
          head: { sound: 'low', gueum: { B: '덩' } },
          rim: { sound: 'click', gueum: { R: '딱', L: '딱', B: '딱' } },
          side: { sound: 'mid' },
        },
      },
    ],
    parts: [{ id: 'p', name: 'Part', instrument: 'drum' }],
    sections: [{ id: 's', name: 'S', lines: { p: [{ groups: [tokens] }] } }],
  };
}

function resolve(token: string): ResolvedCell {
  const piece = loadPiece(fixture([token]));
  return piece.sections[0].lines.p[0].groups[0][0];
}

function hit(token: string): HitView {
  const view = cellView(resolve(token), 'head');
  if (view.kind !== 'hit') throw new Error(`expected a hit view for ${token}, got ${view.kind}`);
  return view;
}

const PLAIN: Omit<HitView, 'hand' | 'label'> = {
  kind: 'hit',
  grace: null,
  circled: false,
  underlined: false,
  triangle: false,
  arrow: false,
  cross: false,
  extraMarks: [],
  syllable: null,
  surface: null,
};

// ---------------------------------------------------------------------------

describe('cellView: rests and extenders', () => {
  it('maps "-" to a rest with a label', () => {
    expect(cellView(resolve('-'), 'head')).toEqual({ kind: 'rest', label: REST_LABEL });
  });

  it('maps "~" to an extender with a label', () => {
    expect(cellView(resolve('~'), 'head')).toEqual({ kind: 'extender', label: EXTENDER_LABEL });
  });
});

describe('cellView: hand letters and syllables', () => {
  it('draws a plain R with no marks and no syllable (the loader fallback letter is not repeated)', () => {
    expect(hit('R')).toEqual({ ...PLAIN, hand: 'R', label: 'Right hand' });
  });

  it('writes the surface syllable under B on the head', () => {
    expect(hit('B')).toMatchObject({ hand: 'B', syllable: '덩', label: 'Both hands, 덩' });
  });

  it('prefers a {override} syllable', () => {
    expect(hit('R{덩}')).toMatchObject({ hand: 'R', syllable: '덩' });
  });

  it('shows no syllable for an empty {} override', () => {
    expect(hit('B{}')).toMatchObject({ hand: 'B', syllable: null, label: 'Both hands' });
  });

  it('draws the grace hand small before the main hand for a flam', () => {
    expect(hit('L/R{그덩}')).toMatchObject({
      hand: 'R',
      grace: 'L',
      syllable: '그덩',
      label: 'Left hand pickup then right hand (flam), 그덩',
    });
  });
});

describe('cellView: modifier marks (SPEC §4.2)', () => {
  it("'  small accent → triangle above", () => {
    expect(hit("R'")).toMatchObject({ triangle: true, circled: false, label: 'Right hand, small accent' });
  });

  it('>  strong accent → circle around the letter', () => {
    expect(hit('L>')).toMatchObject({ circled: true, triangle: false, label: 'Left hand, strong accent' });
  });

  it('_  soft → underline', () => {
    expect(hit('L_')).toMatchObject({ underlined: true, label: 'Left hand, soft' });
  });

  it('^  lift → up-arrow above', () => {
    expect(hit('L^')).toMatchObject({ arrow: true, label: 'Left hand, lift' });
  });

  it('x  cross-arm → X below', () => {
    expect(hit('Rx')).toMatchObject({ cross: true, label: 'Right hand, cross-arm' });
  });

  it('stacks marks in any order', () => {
    expect(hit('R>^')).toMatchObject({ circled: true, arrow: true, label: 'Right hand, strong accent, lift' });
    expect(hit('L>x')).toMatchObject({ circled: true, cross: true, label: 'Left hand, strong accent, cross-arm' });
    expect(hit("R^'")).toMatchObject({ triangle: true, arrow: true, label: 'Right hand, small accent, lift' });
  });

  it('names only the loudest dynamic when several are written', () => {
    expect(hit("R_'>")).toMatchObject({ circled: true, triangle: true, underlined: true, label: 'Right hand, strong accent' });
  });

  it('keeps unknown marks verbatim so new handwriting shows up instead of crashing', () => {
    expect(hit('R!?')).toMatchObject({ extraMarks: ['!', '?'], label: 'Right hand, mark !, mark ?' });
  });
});

describe('cellView: surfaces', () => {
  it('boxes a non-default surface and writes its syllable', () => {
    expect(hit('R:rim{딱}')).toMatchObject({ surface: 'rim', syllable: '딱', label: 'Right hand, on rim, 딱' });
    expect(hit('B:rim')).toMatchObject({ surface: 'rim', syllable: '딱' });
  });

  it('treats an explicit default surface as unboxed', () => {
    expect(hit('R:head')).toMatchObject({ surface: null });
  });

  it('boxes a surface that has no syllable of its own without repeating the letter', () => {
    expect(hit('L:side')).toMatchObject({ surface: 'side', syllable: null, label: 'Left hand, on side' });
  });
});

describe('visibleSyllable', () => {
  it('drops the hand-letter fallback and blank overrides, keeps real syllables', () => {
    const asHit = (token: string) => resolve(token) as ResolvedHit;
    expect(visibleSyllable(asHit('R'))).toBeNull();
    expect(visibleSyllable(asHit('L{}'))).toBeNull();
    expect(visibleSyllable(asHit('L{L}'))).toBeNull();
    expect(visibleSyllable(asHit('B'))).toBe('덩');
  });
});
