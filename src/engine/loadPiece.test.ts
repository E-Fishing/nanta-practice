import { afterEach, describe, expect, it, vi } from 'vitest';
import pieceJson from '../../public/pieces/placeholder-hard.json';
import { PieceValidationError, fetchPiece, fetchPieceIndex, loadPiece, pieceUrl } from './loadPiece';
import type { Piece, PieceJson, ResolvedHit, SectionJson } from './types';

// ---------------------------------------------------------------------------
// Helpers and fixtures
// ---------------------------------------------------------------------------

/** Ground truth for placeholder-hard.json, counted by hand: [id, pulses incl. line pauses, cells]. */
const GROUND_TRUTH: ReadonlyArray<readonly [string, number, number]> = [
  ['open', 26, 22],
  ['a', 56, 48],
  ['cross', 38, 32],
  ['lift', 18, 16],
  ['build', 4, 4],
  ['exit', 16, 14],
  ['cross2', 22, 18],
  ['ending', 10, 8],
];

function section(piece: Piece, id: string) {
  const found = piece.sections.find((s) => s.id === id);
  if (!found) throw new Error(`no section ${id}`);
  return found;
}

function hit(piece: Piece, sectionId: string, partId: string, line: number, group: number, cell: number): ResolvedHit {
  const found = section(piece, sectionId).lines[partId][line].groups[group][cell];
  if (found.kind !== 'hit') throw new Error(`expected a hit at ${sectionId}/${partId} ${line}/${group}/${cell}`);
  return found;
}

type PieceOverrides = Partial<Record<keyof PieceJson, unknown>>;
type SectionOverrides = Partial<Record<keyof SectionJson, unknown>>;

const drum = () => ({
  id: 'drum',
  name: 'Drum',
  defaultSurface: 'head',
  surfaces: {
    head: { sound: 'low', gueum: { B: '덩' } },
    rim: { sound: 'click', gueum: { R: '딱', L: '딱', B: '딱' } },
  },
});

/** A section where both parts total 12 pulses (8 cells + 2 lines x 2 pause) with different layouts. */
function makeSection(overrides: SectionOverrides = {}): Record<string, unknown> {
  return {
    id: 'a',
    name: 'A',
    lines: {
      hard: [{ groups: [['R', 'L', 'R', 'L'], ['B', '~']] }, { groups: [['R', 'L']] }],
      easy: [{ groups: [['R', 'L', 'R'], ['L']] }, { groups: [['B', 'B', 'B', 'B']] }],
    },
    ...overrides,
  };
}

/** Minimal valid piece: one drum, parts "hard" and "easy", one section. Fresh objects every call. */
function makePiece(overrides: PieceOverrides = {}): Record<string, unknown> {
  return {
    id: 'fixture',
    title: 'Fixture',
    pulseBpm: 120,
    linePause: 2,
    instruments: [drum()],
    parts: [
      { id: 'hard', name: 'Hard part', instrument: 'drum' },
      { id: 'easy', name: 'Easy part', instrument: 'drum' },
    ],
    sections: [makeSection()],
    ...overrides,
  };
}

/** A piece with only the "hard" part and one line of the given groups. */
function onePartPiece(groups: string[][], sectionOverrides: SectionOverrides = {}): Record<string, unknown> {
  return makePiece({
    parts: [{ id: 'hard', name: 'Hard part', instrument: 'drum' }],
    sections: [makeSection({ lines: { hard: [{ groups }] }, ...sectionOverrides })],
  });
}

/** Run loadPiece and return the PieceValidationError it throws (fails the test otherwise). */
function loadError(json: unknown): PieceValidationError {
  try {
    loadPiece(json);
  } catch (err) {
    if (err instanceof PieceValidationError) return err;
    throw new Error(`expected a PieceValidationError, got ${String(err)}`);
  }
  throw new Error('expected loadPiece to throw');
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ---------------------------------------------------------------------------
// placeholder-hard.json
// ---------------------------------------------------------------------------

describe('loadPiece(placeholder-hard.json)', () => {
  const piece = loadPiece(pieceJson);

  it('loads the piece header', () => {
    expect(piece.id).toBe('placeholder-hard');
    expect(piece.title).toBe('Placeholder (Hard)');
    expect(piece.pulseBpm).toBe(325);
    expect(piece.linePause).toBe(2);
  });

  it('keeps the eight sections in file order', () => {
    expect(piece.sections.map((s) => s.id)).toEqual(['open', 'a', 'cross', 'lift', 'build', 'exit', 'cross2', 'ending']);
  });

  it('has one instrument and one non-lead part', () => {
    expect(piece.instruments.map((i) => i.id)).toEqual(['drum']);
    expect(piece.parts).toEqual([{ id: 'hard', name: 'Hard part', instrument: 'drum', lead: false }]);
  });

  it('fills section defaults and keeps explicit values', () => {
    const build = section(piece, 'build');
    expect(build.repeat).toBe(8);
    expect(build.crescendo).toBe(true);
    expect(build.tempoScale).toBe(1);

    const ending = section(piece, 'ending');
    expect(ending.tempoScale).toBe(0.5);
    expect(ending.repeat).toBe(1);
    expect(ending.crescendo).toBe(false);

    const open = section(piece, 'open');
    expect(open.repeat).toBe(1);
    expect(open.crescendo).toBe(false);
    expect(open.tempoScale).toBe(1);

    for (const s of piece.sections) expect(s.cueIn).toBe('');
  });

  it.each(GROUND_TRUTH)('section %s has %i pulses and %i cells', (id, pulses, cellPulses) => {
    const s = section(piece, id);
    expect(s.pulses).toBe(pulses);
    expect(s.cellPulses).toBe(cellPulses);
    expect(s.lines.hard.reduce((sum, line) => sum + line.cellPulses, 0)).toBe(cellPulses);
  });

  it('adds up to 218 pulses over one full expansion', () => {
    const total = piece.sections.reduce((sum, s) => sum + s.pulses * s.repeat, 0);
    expect(total).toBe(218);
  });

  it('applies linePause to every line except the ones with pauseAfter 0', () => {
    for (const s of piece.sections) {
      s.lines.hard.forEach((line, i) => {
        const explicitZero = (s.id === 'build' && i === 0) || (s.id === 'ending' && i === 1);
        expect(line.pauseAfter, `${s.id} line ${i}`).toBe(explicitZero ? 0 : 2);
      });
    }
    const ending = section(piece, 'ending');
    expect(ending.lines.hard.at(-1)?.pauseAfter).toBe(0);
  });

  it('carries notes and uses null when a line has none', () => {
    expect(section(piece, 'open').lines.hard[0].note).toBe('underlined pairs are soft');
    expect(section(piece, 'open').lines.hard[1].note).toBe('1-2-3-4 ×3, small accent on each 1');
    expect(section(piece, 'a').lines.hard[0].note).toBeNull();
  });

  it('keeps the group layout of each line', () => {
    const open = section(piece, 'open');
    expect(open.lines.hard[0].groups.map((g) => g.length)).toEqual([2, 8]);
    expect(open.lines.hard[1].groups.map((g) => g.length)).toEqual([4, 4, 4]);
  });
});

// ---------------------------------------------------------------------------
// Gu-eum and surface resolution (SPEC 3.3)
// ---------------------------------------------------------------------------

describe('gu-eum resolution', () => {
  const piece = loadPiece(pieceJson);

  it('uses the {override} when present', () => {
    const cell = hit(piece, 'open', 'hard', 0, 0, 0);
    expect(cell.token).toBe('B{덩}');
    expect(cell.gueum).toBe('덩');
    expect(cell.surfaceId).toBe('head');
    expect(cell.sound).toBe('low');
  });

  it('falls back to the hand letter when the surface has no syllable for it', () => {
    const cell = hit(piece, 'a', 'hard', 0, 0, 0);
    expect(cell.token).toBe('R');
    expect(cell.gueum).toBe('R');
    expect(cell.surfaceId).toBe('head');
  });

  it('resolves explicit rim hits to the rim surface and its click sound', () => {
    for (const cell of [hit(piece, 'ending', 'hard', 0, 2, 1), hit(piece, 'ending', 'hard', 1, 0, 2)]) {
      expect(cell.token).toBe('B:rim{딱}');
      expect(cell.gueum).toBe('딱');
      expect(cell.surfaceId).toBe('rim');
      expect(cell.sound).toBe('click');
    }
    const right = hit(piece, 'cross2', 'hard', 1, 2, 1);
    expect(right.token).toBe('R:rim{딱}');
    expect(right.hand).toBe('R');
    expect(right.gueum).toBe('딱');
    expect(right.surfaceId).toBe('rim');
    expect(right.sound).toBe('click');
  });

  it('uses the surface table when there is no override, and "" when the override is empty', () => {
    const fixture = loadPiece(onePartPiece([['L:rim', 'R{}', 'L/R{그덩}', 'B']]));
    const [rim, empty, flam, both] = fixture.sections[0].lines.hard[0].groups[0] as ResolvedHit[];
    expect(rim.gueum).toBe('딱');
    expect(rim.surfaceId).toBe('rim');
    expect(rim.sound).toBe('click');
    expect(empty.gueum).toBe('');
    expect(flam.grace).toBe('L');
    expect(flam.hand).toBe('R');
    expect(flam.gueum).toBe('그덩');
    expect(both.gueum).toBe('덩');
  });

  it('passes rests and extenders through unchanged', () => {
    const ending = section(piece, 'ending');
    expect(ending.lines.hard[1].groups[0][1]).toEqual({ kind: 'extender', token: '~' });
    const fixture = loadPiece(onePartPiece([['-', '~']]));
    expect(fixture.sections[0].lines.hard[0].groups[0]).toEqual([
      { kind: 'rest', token: '-' },
      { kind: 'extender', token: '~' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe('loadPiece purity', () => {
  it('never mutates its input', () => {
    const before = structuredClone(pieceJson);
    loadPiece(pieceJson);
    expect(pieceJson).toEqual(before);
  });

  it('accepts a deeply frozen input', () => {
    const frozen = deepFreeze(structuredClone(pieceJson));
    expect(() => loadPiece(frozen)).not.toThrow();
  });

  it('returns fresh objects rather than the input', () => {
    const input = makePiece();
    const piece = loadPiece(input);
    expect(piece.instruments[0]).not.toBe((input.instruments as unknown[])[0]);
    expect(piece.parts[0]).not.toBe((input.parts as unknown[])[0]);
  });
});

// ---------------------------------------------------------------------------
// Pulse-count check
// ---------------------------------------------------------------------------

describe('pulse-count check', () => {
  it('accepts parts with different layouts but equal totals', () => {
    const piece = loadPiece(makePiece());
    expect(piece.sections[0].pulses).toBe(12);
    expect(piece.sections[0].cellPulses).toBe(8);
    expect(piece.sections[0].lines.hard).toHaveLength(2);
    expect(piece.sections[0].lines.easy).toHaveLength(2);
  });

  it('accepts a part that trades a line for a longer pauseAfter', () => {
    const piece = loadPiece(
      makePiece({
        sections: [
          makeSection({
            lines: {
              hard: [{ groups: [['R', 'L', 'R', 'L'], ['B', '~']] }, { groups: [['R', 'L']] }],
              easy: [{ groups: [['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L']], pauseAfter: 4 }],
            },
          }),
        ],
      }),
    );
    expect(piece.sections[0].pulses).toBe(12);
    expect(piece.sections[0].lines.easy[0].pauseAfter).toBe(4);
  });

  it('rejects unequal cell counts, naming the section and the offending part', () => {
    const err = loadError(
      makePiece({
        sections: [
          makeSection({
            lines: {
              hard: [{ groups: [['R', 'L', 'R', 'L']] }],
              easy: [{ groups: [['R', 'L', 'R']] }],
            },
          }),
        ],
      }),
    );
    expect(err.name).toBe('PieceValidationError');
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('easy');
    expect(err.path).toBe('sections[0].lines.easy');
    expect(err.message).toContain('section "a"');
    expect(err.message).toContain('part "easy"');
    expect(err.message).toContain('5 pulses (3 cells + 2 line pause)');
    expect(err.message).toContain('part "hard" has 6 pulses (4 cells + 2 line pause)');
  });

  it('rejects equal cells with different line pauses and points at pauseAfter', () => {
    const err = loadError(
      makePiece({
        sections: [
          makeSection({
            lines: {
              hard: [{ groups: [['R', 'L', 'R', 'L']] }, { groups: [['B']] }],
              easy: [{ groups: [['R', 'L', 'R', 'L', 'B']] }],
            },
          }),
        ],
      }),
    );
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('easy');
    expect(err.message).toContain('7 pulses (5 cells + 2 line pause)');
    expect(err.message).toContain('part "hard" has 9 pulses (5 cells + 4 line pause)');
    expect(err.message).toContain('line pauses differ');
    expect(err.message).toContain('pauseAfter');
  });

  it('takes the pulse count from the first present part in piece.parts order', () => {
    const piece = loadPiece(
      makePiece({
        sections: [
          makeSection({ lines: { easy: [{ groups: [['R', 'L', 'R']] }] } }),
          makeSection({ id: 'b', lines: { hard: [{ groups: [['B']] }] } }),
        ],
      }),
    );
    expect(piece.sections[0].pulses).toBe(5);
    expect(piece.sections[0].cellPulses).toBe(3);
    expect(Object.keys(piece.sections[0].lines)).toEqual(['easy']);
    expect(piece.sections[1].pulses).toBe(3);
    expect(Object.keys(piece.sections[1].lines)).toEqual(['hard']);
  });

  it('compares against the first present part even when a later part is absent', () => {
    const err = loadError(
      makePiece({
        parts: [
          { id: 'hard', name: 'Hard', instrument: 'drum' },
          { id: 'mid', name: 'Mid', instrument: 'drum' },
          { id: 'easy', name: 'Easy', instrument: 'drum' },
        ],
        sections: [
          makeSection({
            lines: {
              hard: [{ groups: [['R', 'L']] }],
              easy: [{ groups: [['R']] }],
            },
          }),
        ],
      }),
    );
    expect(err.partId).toBe('easy');
    expect(err.message).toContain('part "hard" has 4 pulses');
  });
});

// ---------------------------------------------------------------------------
// Error naming
// ---------------------------------------------------------------------------

describe('validation errors', () => {
  it('names the section and the unknown part id in lines', () => {
    const err = loadError(makePiece({ sections: [makeSection({ lines: { hard: [{ groups: [['R']] }], ghost: [] } })] }));
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('ghost');
    expect(err.path).toBe('sections[0].lines.ghost');
    expect(err.message).toContain('section "a"');
    expect(err.message).toContain('"ghost"');
  });

  it('names section, part and surface for an unknown surface', () => {
    const err = loadError(onePartPiece([['R', 'R:cowbell']]));
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('hard');
    expect(err.path).toBe('sections[0].lines.hard[0].groups[0][1]');
    expect(err.message).toContain('section "a"');
    expect(err.message).toContain('part "hard"');
    expect(err.message).toContain('"cowbell"');
    expect(err.message).toContain('line 1, group 1, cell 2');
  });

  it('reports a mistyped surface id instead of guessing a known prefix', () => {
    const err = loadError(onePartPiece([['R', 'R:rimm']]));
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('hard');
    expect(err.message).toContain('"rimm"');
    // ...while a known surface followed only by modifiers is fine.
    const cell = loadPiece(onePartPiece([['R:rimx']])).sections[0].lines.hard[0].groups[0][0];
    expect(cell.kind === 'hit' && cell.surfaceId).toBe('rim');
    expect(cell.kind === 'hit' && cell.modifiers.cross).toBe(true);
  });

  it('rejects a surface id that cannot be written in a cell token', () => {
    const surfaces = { head: { sound: 'low' }, rim_low: { sound: 'mid' } };
    const err = loadError(makePiece({ instruments: [{ ...drum(), surfaces }] }));
    expect(err.path).toBe('instruments[0].surfaces.rim_low');
    expect(err.message).toContain('"rim_low"');
    expect(err.message).toContain('letters, digits and hyphens');
  });

  it('names section, part, position and token for a bad token', () => {
    const err = loadError(
      makePiece({
        sections: [
          makeSection({
            lines: {
              hard: [{ groups: [['R', 'L']] }, { groups: [['R'], ['L', 'RL']] }],
              easy: [{ groups: [['R', 'L', 'R', 'L', 'R']] }],
            },
          }),
        ],
      }),
    );
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('hard');
    expect(err.path).toBe('sections[0].lines.hard[1].groups[1][1]');
    expect(err.message).toContain('section "a"');
    expect(err.message).toContain('part "hard"');
    expect(err.message).toContain('"RL"');
    expect(err.message).toContain('line 2, group 2, cell 2');
  });

  it('rejects a non-string cell', () => {
    const err = loadError(onePartPiece([['R', 7 as unknown as string]]));
    expect(err.path).toBe('sections[0].lines.hard[0].groups[0][1]');
    expect(err.message).toContain('part "hard"');
  });

  it('names the part and instrument for an unknown instrument', () => {
    const err = loadError(
      makePiece({ parts: [{ id: 'hard', name: 'Hard', instrument: 'gong' }], sections: [makeSection({ lines: { hard: [{ groups: [['R']] }] } })] }),
    );
    expect(err.partId).toBe('hard');
    expect(err.sectionId).toBeNull();
    expect(err.path).toBe('parts[0].instrument');
    expect(err.message).toContain('"gong"');
    expect(err.message).toContain('part "hard"');
  });

  it('rejects a defaultSurface that is not in surfaces', () => {
    const err = loadError(makePiece({ instruments: [{ ...drum(), defaultSurface: 'side' }] }));
    expect(err.path).toBe('instruments[0].defaultSurface');
    expect(err.message).toContain('"side"');
    expect(err.message).toContain('"drum"');
  });

  it('rejects an instrument with no surfaces', () => {
    const err = loadError(makePiece({ instruments: [{ ...drum(), surfaces: {} }] }));
    expect(err.path).toBe('instruments[0].surfaces');
  });

  it('rejects a surface without a sound and a gu-eum table with a bad key', () => {
    expect(loadError(makePiece({ instruments: [{ ...drum(), surfaces: { head: {} } }] })).path).toBe(
      'instruments[0].surfaces.head.sound',
    );
    const err = loadError(makePiece({ instruments: [{ ...drum(), surfaces: { head: { sound: 'low', gueum: { r: '쿵' } } } }] }));
    expect(err.path).toBe('instruments[0].surfaces.head.gueum.r');
    expect(err.message).toContain('R, L or B');
  });

  it('rejects duplicate section ids', () => {
    const err = loadError(makePiece({ sections: [makeSection(), makeSection()] }));
    expect(err.sectionId).toBe('a');
    expect(err.path).toBe('sections[1].id');
    expect(err.message).toContain('duplicate');
  });

  it('rejects duplicate part and instrument ids', () => {
    const parts = loadError(
      makePiece({ parts: [{ id: 'hard', name: 'A', instrument: 'drum' }, { id: 'hard', name: 'B', instrument: 'drum' }] }),
    );
    expect(parts.partId).toBe('hard');
    expect(parts.path).toBe('parts[1].id');
    expect(loadError(makePiece({ instruments: [drum(), drum()] })).path).toBe('instruments[1].id');
  });

  it('rejects two lead parts', () => {
    const err = loadError(
      makePiece({
        parts: [
          { id: 'hard', name: 'Hard', instrument: 'drum', lead: true },
          { id: 'easy', name: 'Easy', instrument: 'drum', lead: true },
        ],
      }),
    );
    expect(err.partId).toBe('easy');
    expect(err.path).toBe('parts[1].lead');
    expect(err.message).toContain('"hard"');
  });

  it('accepts one lead part and defaults lead to false', () => {
    const piece = loadPiece(
      makePiece({
        parts: [
          { id: 'hard', name: 'Hard', instrument: 'drum', lead: true },
          { id: 'easy', name: 'Easy', instrument: 'drum' },
        ],
      }),
    );
    expect(piece.parts.map((p) => p.lead)).toEqual([true, false]);
  });

  it('rejects repeat 0 and non-integer repeat', () => {
    const err = loadError(makePiece({ sections: [makeSection({ repeat: 0 })] }));
    expect(err.sectionId).toBe('a');
    expect(err.path).toBe('sections[0].repeat');
    expect(loadError(makePiece({ sections: [makeSection({ repeat: 1.5 })] })).path).toBe('sections[0].repeat');
  });

  it('rejects tempoScale 0, negative and non-finite', () => {
    for (const tempoScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '0.5']) {
      const err = loadError(makePiece({ sections: [makeSection({ tempoScale })] }));
      expect(err.sectionId).toBe('a');
      expect(err.path).toBe('sections[0].tempoScale');
    }
  });

  it('rejects a missing or non-positive pulseBpm', () => {
    const err = loadError(makePiece({ pulseBpm: undefined }));
    expect(err.path).toBe('pulseBpm');
    expect(err.sectionId).toBeNull();
    expect(err.partId).toBeNull();
    expect(err.message).toContain('pulseBpm');
    expect(loadError(makePiece({ pulseBpm: 0 })).path).toBe('pulseBpm');
    expect(loadError(makePiece({ pulseBpm: '325' })).path).toBe('pulseBpm');
  });

  it('rejects an empty group', () => {
    const err = loadError(onePartPiece([['R'], []]));
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('hard');
    expect(err.path).toBe('sections[0].lines.hard[0].groups[1]');
  });

  it('rejects an empty groups array', () => {
    const err = loadError(onePartPiece([]));
    expect(err.sectionId).toBe('a');
    expect(err.partId).toBe('hard');
    expect(err.path).toBe('sections[0].lines.hard[0].groups');
  });

  it('rejects an empty lines array for a present part', () => {
    const err = loadError(makePiece({ sections: [makeSection({ lines: { hard: [] } })] }));
    expect(err.partId).toBe('hard');
    expect(err.path).toBe('sections[0].lines.hard');
  });

  it('rejects a section with no parts at all', () => {
    const err = loadError(makePiece({ sections: [makeSection({ lines: {} })] }));
    expect(err.sectionId).toBe('a');
    expect(err.path).toBe('sections[0].lines');
  });

  it('rejects a negative or non-integer linePause and pauseAfter', () => {
    expect(loadError(makePiece({ linePause: -1 })).path).toBe('linePause');
    expect(loadError(makePiece({ linePause: 1.5 })).path).toBe('linePause');
    const err = loadError(onePartPiece([['R']], { lines: { hard: [{ groups: [['R']], pauseAfter: -2 }] } }));
    expect(err.path).toBe('sections[0].lines.hard[0].pauseAfter');
    expect(err.partId).toBe('hard');
  });

  it('defaults linePause to 0 when absent', () => {
    const piece = loadPiece(makePiece({ linePause: undefined }));
    expect(piece.linePause).toBe(0);
    expect(piece.sections[0].pulses).toBe(8);
  });

  it('rejects non-object input without throwing a raw TypeError', () => {
    for (const input of [null, undefined, 'x', 7, [], true]) {
      const err = loadError(input);
      expect(err).toBeInstanceOf(PieceValidationError);
      expect(err.path).toBe('');
      expect(err.message).toContain('must be an object');
    }
  });

  it('rejects missing or empty id, non-string title and non-array collections', () => {
    expect(loadError(makePiece({ id: '' })).path).toBe('id');
    expect(loadError(makePiece({ title: 3 })).path).toBe('title');
    expect(loadError(makePiece({ instruments: [] })).path).toBe('instruments');
    expect(loadError(makePiece({ parts: {} })).path).toBe('parts');
    expect(loadError(makePiece({ sections: [] })).path).toBe('sections');
    expect(loadError(makePiece({ sections: [makeSection({ lines: [] })] })).path).toBe('sections[0].lines');
  });

  it('ignores unknown extra keys', () => {
    const withExtras = makeSection({ lines: { hard: [{ groups: [['R']], foo: 1 }] } });
    withExtras.colour = 'red';
    const input = makePiece({ sections: [withExtras] });
    input.$comment = 'hi';
    const piece = loadPiece(input);
    expect(piece.sections[0].pulses).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// URLs and fetching
// ---------------------------------------------------------------------------

describe('pieceUrl', () => {
  it('builds <base>/pieces/<id>.json from an id', () => {
    expect(pieceUrl('placeholder-hard', '/base/')).toBe('/base/pieces/placeholder-hard.json');
  });

  it('uses entry.file for an index entry', () => {
    expect(pieceUrl({ id: 'x', file: 'x-v2.json' }, '/base/')).toBe('/base/pieces/x-v2.json');
  });

  it('normalises the base so exactly one slash separates', () => {
    expect(pieceUrl('x', '/base')).toBe('/base/pieces/x.json');
    expect(pieceUrl('x', '/base//')).toBe('/base/pieces/x.json');
    expect(pieceUrl('x', '/')).toBe('/pieces/x.json');
    expect(pieceUrl('x', './')).toBe('./pieces/x.json');
    expect(pieceUrl('x', '')).toBe('pieces/x.json');
  });

  it('defaults to import.meta.env.BASE_URL', () => {
    expect(pieceUrl('x')).toBe(pieceUrl('x', import.meta.env.BASE_URL));
  });
});

describe('fetchPieceIndex / fetchPiece', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    const like = {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 404 ? 'Not Found' : status === 200 ? 'OK' : '',
      json: async () => body,
    };
    return like as unknown as Response;
  }

  function stubFetch(handler: (url: string) => Response) {
    const mock = vi.fn(async (url: string) => handler(url));
    vi.stubGlobal('fetch', mock);
    return mock;
  }

  it('fetchPieceIndex returns the validated entries', async () => {
    const entries = [{ id: 'placeholder-hard', file: 'placeholder-hard.json' }];
    const mock = stubFetch(() => jsonResponse({ pieces: entries }));
    await expect(fetchPieceIndex('/base/')).resolves.toEqual(entries);
    expect(mock).toHaveBeenCalledWith('/base/pieces/index.json');
  });

  it('fetchPieceIndex rejects a malformed index', async () => {
    stubFetch(() => jsonResponse({ pieces: [{ id: 'x' }] }));
    await expect(fetchPieceIndex('/base/')).rejects.toThrow(/malformed.*pieces\[0\]\.file/);
    stubFetch(() => jsonResponse({ items: [] }));
    await expect(fetchPieceIndex('/base/')).rejects.toThrow(/malformed/);
    stubFetch(() => jsonResponse(null));
    await expect(fetchPieceIndex('/base/')).rejects.toThrow(/\/base\/pieces\/index\.json/);
  });

  it('fetchPieceIndex rejects on HTTP failure naming the URL', async () => {
    stubFetch(() => jsonResponse({}, 404));
    await expect(fetchPieceIndex('/base/')).rejects.toThrow(/\/base\/pieces\/index\.json.*404/);
  });

  it('fetchPiece returns a loaded Piece', async () => {
    const mock = stubFetch(() => jsonResponse(structuredClone(pieceJson)));
    const piece = await fetchPiece('placeholder-hard', '/base/');
    expect(piece.id).toBe('placeholder-hard');
    expect(piece.sections).toHaveLength(8);
    expect(mock).toHaveBeenCalledWith('/base/pieces/placeholder-hard.json');
  });

  it('fetchPiece accepts an index entry', async () => {
    const mock = stubFetch(() => jsonResponse(structuredClone(pieceJson)));
    await fetchPiece({ id: 'placeholder-hard', file: 'custom.json' }, '/base');
    expect(mock).toHaveBeenCalledWith('/base/pieces/custom.json');
  });

  it('fetchPiece(id) uses the file listed for that id in index.json', async () => {
    const mock = stubFetch((url) =>
      url.endsWith('index.json')
        ? jsonResponse({ pieces: [{ id: 'placeholder-hard', file: 'custom.json' }] })
        : jsonResponse(structuredClone(pieceJson)),
    );
    const piece = await fetchPiece('placeholder-hard', '/base/');
    expect(piece.id).toBe('placeholder-hard');
    expect(mock).toHaveBeenCalledWith('/base/pieces/index.json');
    expect(mock).toHaveBeenCalledWith('/base/pieces/custom.json');
    expect(mock).not.toHaveBeenCalledWith('/base/pieces/placeholder-hard.json');
  });

  it('fetchPiece(id) falls back to <id>.json when the index is missing or does not list the id', async () => {
    const missing = stubFetch((url) => (url.endsWith('index.json') ? jsonResponse({}, 404) : jsonResponse(structuredClone(pieceJson))));
    await fetchPiece('placeholder-hard', '/base/');
    expect(missing).toHaveBeenCalledWith('/base/pieces/placeholder-hard.json');

    const unlisted = stubFetch((url) =>
      url.endsWith('index.json') ? jsonResponse({ pieces: [{ id: 'other', file: 'other.json' }] }) : jsonResponse(structuredClone(pieceJson)),
    );
    await fetchPiece('placeholder-hard', '/base/');
    expect(unlisted).toHaveBeenCalledWith('/base/pieces/placeholder-hard.json');
  });

  it('fetchPiece rejects a file whose id differs from the id it was requested under', async () => {
    stubFetch(() => jsonResponse(structuredClone(pieceJson)));
    await expect(fetchPiece({ id: 'other', file: 'other.json' }, '/base/')).rejects.toThrow(
      /other\.json.*"placeholder-hard".*"other"/,
    );
  });

  it('fetchPiece rejects a 404 with an Error naming the URL', async () => {
    stubFetch(() => jsonResponse({}, 404));
    await expect(fetchPiece('missing', '/base/')).rejects.toThrow(/\/base\/pieces\/missing\.json.*404/);
  });

  it('fetchPiece rejects when fetch itself fails, naming the URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    await expect(fetchPiece('missing', '/base/')).rejects.toThrow(/\/base\/pieces\/missing\.json.*network down/);
  });

  it('fetchPiece surfaces validation problems as PieceValidationError', async () => {
    stubFetch(() => jsonResponse(makePiece({ sections: [makeSection({ repeat: 0 })] })));
    await expect(fetchPiece('bad', '/base/')).rejects.toBeInstanceOf(PieceValidationError);
  });

  it('fetchPiece rejects a body that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => { throw new SyntaxError('bad json'); } }) as unknown as Response),
    );
    await expect(fetchPiece('x', '/base/')).rejects.toThrow(/\/base\/pieces\/x\.json.*not valid JSON/);
  });
});
