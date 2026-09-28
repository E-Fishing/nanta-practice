/**
 * Unit tests for the cell token parser (SPEC.md §3.2 grammar, §3.3 gu-eum override,
 * Appendix A handwriting → token table).
 *
 * Milestone 1 acceptance: "Unit tests for tokens.ts cover every modifier, ~, -,
 * surfaces and overrides."
 */
import { describe, expect, it } from 'vitest';
import {
  DYNAMIC_DB,
  GRACE_DB,
  GRACE_LEAD_SECONDS,
  MODIFIER_CHARS,
  SURFACE_ID_PATTERN,
  TokenError,
  dynamicDb,
  isHand,
  parseCell,
} from './tokens';
import type { ParseCellOptions } from './tokens';
import type { Cell, CellModifiers, Dynamic, Hand, HitCell } from './types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const NO_MODIFIERS: CellModifiers = { soft: false, accent: false, strong: false, lift: false, cross: false };

function mods(on: Partial<CellModifiers> = {}): CellModifiers {
  return { ...NO_MODIFIERS, ...on };
}

/** Parse and assert the result is a hit, narrowing the type for the caller. */
function hit(input: string, options?: ParseCellOptions): HitCell {
  const cell = parseCell(input, options);
  expect(cell.kind).toBe('hit');
  if (cell.kind !== 'hit') throw new Error(`expected a hit for ${JSON.stringify(input)}`);
  return cell;
}

/** Build a full expected HitCell from a plain hit plus overrides, so toStrictEqual catches stray fields. */
function expectedHit(over: Partial<HitCell> & { hand: Hand; token: string }): HitCell {
  return {
    kind: 'hit',
    grace: null,
    surface: null,
    modifiers: mods(),
    unknownMarks: [],
    gueumOverride: null,
    dynamic: 'normal',
    ...over,
  };
}

/** Assert parseCell throws a TokenError whose message names the offending token. */
function expectTokenError(input: string, options?: ParseCellOptions): TokenError {
  let caught: unknown;
  try {
    parseCell(input, options);
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(TokenError);
  const err = caught as TokenError;
  // The parser quotes the token with JSON.stringify, so control characters (tab, newline)
  // appear escaped; accept either the raw text or its JSON form.
  const named = err.message.includes(input) || err.message.includes(JSON.stringify(input));
  expect(named, `message ${JSON.stringify(err.message)} should name token ${JSON.stringify(input)}`).toBe(true);
  expect(err.token).toBe(input);
  return err;
}

// ---------------------------------------------------------------------------
// "-" and "~"
// ---------------------------------------------------------------------------

describe('rest and extender', () => {
  it('"-" is a plain rest', () => {
    expect(parseCell('-')).toStrictEqual({ kind: 'rest', token: '-' });
  });

  it('"~" is an extender', () => {
    expect(parseCell('~')).toStrictEqual({ kind: 'extender', token: '~' });
  });

  it('rests and extenders carry no hit fields', () => {
    for (const cell of [parseCell('-'), parseCell('~')]) {
      expect(cell).not.toHaveProperty('hand');
      expect(cell).not.toHaveProperty('modifiers');
      expect(cell).not.toHaveProperty('gueumOverride');
    }
  });
});

// ---------------------------------------------------------------------------
// plain hits
// ---------------------------------------------------------------------------

describe('plain hits', () => {
  it.each<Hand>(['R', 'L', 'B'])('"%s" is a plain hit with that hand and nothing else', (hand) => {
    expect(parseCell(hand)).toStrictEqual(expectedHit({ hand, token: hand }));
  });

  it('a plain hit has grace null, surface null, no modifiers, dynamic normal, no override, no marks', () => {
    const cell = hit('R');
    expect(cell.grace).toBeNull();
    expect(cell.surface).toBeNull();
    expect(cell.modifiers).toStrictEqual(mods());
    expect(cell.dynamic).toBe('normal');
    expect(cell.gueumOverride).toBeNull();
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  it('each parse returns fresh modifier / mark objects (no shared state)', () => {
    const a = hit('R');
    a.modifiers.soft = true;
    a.unknownMarks.push('!');
    const b = hit('R');
    expect(b.modifiers.soft).toBe(false);
    expect(b.unknownMarks).toStrictEqual([]);
  });
});

// ---------------------------------------------------------------------------
// single modifiers
// ---------------------------------------------------------------------------

describe('each modifier alone', () => {
  it('"_" sets soft only; dynamic soft', () => {
    expect(parseCell('R_')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'R_', modifiers: mods({ soft: true }), dynamic: 'soft' }),
    );
  });

  it(`"'" sets accent only; dynamic accent`, () => {
    expect(parseCell("R'")).toStrictEqual(
      expectedHit({ hand: 'R', token: "R'", modifiers: mods({ accent: true }), dynamic: 'accent' }),
    );
  });

  it('">" sets strong only; dynamic strong', () => {
    expect(parseCell('R>')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'R>', modifiers: mods({ strong: true }), dynamic: 'strong' }),
    );
  });

  it('"^" sets lift only; dynamic stays normal', () => {
    expect(parseCell('R^')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'R^', modifiers: mods({ lift: true }), dynamic: 'normal' }),
    );
  });

  it('"x" sets cross only; dynamic stays normal', () => {
    expect(parseCell('Rx')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'Rx', modifiers: mods({ cross: true }), dynamic: 'normal' }),
    );
  });

  it('modifiers apply to any hand', () => {
    expect(hit('L_').modifiers.soft).toBe(true);
    expect(hit("B'").modifiers.accent).toBe(true);
    expect(hit('B>').modifiers.strong).toBe(true);
    expect(hit('L^').modifiers.lift).toBe(true);
    expect(hit('Lx').modifiers.cross).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stacking and the loudness ladder
// ---------------------------------------------------------------------------

describe('stacked modifiers', () => {
  it('"R>^" is strong + lift', () => {
    const cell = hit('R>^');
    expect(cell.modifiers).toStrictEqual(mods({ strong: true, lift: true }));
    expect(cell.dynamic).toBe('strong');
  });

  it('"L>x" is strong + cross', () => {
    const cell = hit('L>x');
    expect(cell.hand).toBe('L');
    expect(cell.modifiers).toStrictEqual(mods({ strong: true, cross: true }));
    expect(cell.dynamic).toBe('strong');
  });

  it('"R^>" stacks in any order (same result as "R>^")', () => {
    expect(hit('R^>').modifiers).toStrictEqual(hit('R>^').modifiers);
    expect(hit('R^>').dynamic).toBe('strong');
  });

  it(`"R_'x^>" sets all five flags`, () => {
    const cell = hit("R_'x^>");
    expect(cell.modifiers).toStrictEqual({ soft: true, accent: true, strong: true, lift: true, cross: true });
    expect(cell.dynamic).toBe('strong');
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  it('repeated modifiers "R>>" collapse to one flag and are not unknown marks', () => {
    const cell = hit('R>>');
    expect(cell.modifiers).toStrictEqual(mods({ strong: true }));
    expect(cell.dynamic).toBe('strong');
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  describe('loudness ladder: _ < (none) < \' < >, loudest wins', () => {
    it(`"R_'" is accent`, () => {
      const cell = hit("R_'");
      expect(cell.modifiers).toStrictEqual(mods({ soft: true, accent: true }));
      expect(cell.dynamic).toBe('accent');
    });

    it('"R_>" is strong', () => {
      const cell = hit('R_>');
      expect(cell.modifiers).toStrictEqual(mods({ soft: true, strong: true }));
      expect(cell.dynamic).toBe('strong');
    });

    it(`"R'>" is strong`, () => {
      const cell = hit("R'>");
      expect(cell.modifiers).toStrictEqual(mods({ accent: true, strong: true }));
      expect(cell.dynamic).toBe('strong');
    });

    it('lift and cross never change the dynamic', () => {
      expect(hit('R_^x').dynamic).toBe('soft');
      expect(hit("R'^x").dynamic).toBe('accent');
      expect(hit('R>^x').dynamic).toBe('strong');
      expect(hit('R^x').dynamic).toBe('normal');
    });
  });
});

// ---------------------------------------------------------------------------
// dynamicDb and constants
// ---------------------------------------------------------------------------

describe('dynamicDb', () => {
  it.each<[string, Dynamic, number]>([
    ['R_', 'soft', -8],
    ['R', 'normal', 0],
    ["R'", 'accent', 3],
    ['R>', 'strong', 7],
  ])('%s → %s → %i dB', (token, dynamic, db) => {
    const cell = hit(token);
    expect(cell.dynamic).toBe(dynamic);
    expect(dynamicDb(cell)).toBe(db);
  });

  it('DYNAMIC_DB matches the SPEC §3.2 gains (_ −8, none 0, \' +3, > +7)', () => {
    expect(DYNAMIC_DB).toStrictEqual({ soft: -8, normal: 0, accent: 3, strong: 7 });
  });

  it('dynamicDb reads DYNAMIC_DB', () => {
    for (const dynamic of Object.keys(DYNAMIC_DB) as Dynamic[]) {
      const cell: HitCell = expectedHit({ hand: 'R', token: 'R', dynamic });
      expect(dynamicDb(cell)).toBe(DYNAMIC_DB[dynamic]);
    }
  });
});

describe('constants', () => {
  it('grace hand plays at −10 dB about 40 ms early (SPEC §3.2)', () => {
    expect(GRACE_DB).toBe(-10);
    expect(GRACE_LEAD_SECONDS).toBeCloseTo(0.04, 6);
  });

  it('MODIFIER_CHARS maps exactly the five spec modifiers', () => {
    expect([...MODIFIER_CHARS.entries()].sort()).toStrictEqual(
      [
        ['_', 'soft'],
        ["'", 'accent'],
        ['>', 'strong'],
        ['^', 'lift'],
        ['x', 'cross'],
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// surfaces
// ---------------------------------------------------------------------------

describe('surfaces', () => {
  it('"R:rim" has surface rim', () => {
    expect(parseCell('R:rim')).toStrictEqual(expectedHit({ hand: 'R', token: 'R:rim', surface: 'rim' }));
  });

  it('"B:rim{딱}" (Appendix A: 딱 with no hand = both hands on the rim)', () => {
    expect(parseCell('B:rim{딱}')).toStrictEqual(
      expectedHit({ hand: 'B', token: 'B:rim{딱}', surface: 'rim', gueumOverride: '딱' }),
    );
  });

  it(`"R:rim'" — surface followed by a modifier`, () => {
    const cell = hit("R:rim'");
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods({ accent: true }));
    expect(cell.dynamic).toBe('accent');
  });

  it('"R:rim_" — underscore is the soft modifier, not part of the surface id', () => {
    const cell = hit('R:rim_');
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods({ soft: true }));
    expect(cell.dynamic).toBe('soft');
  });

  it('"R:side-2" — hyphens and digits are allowed in surface ids', () => {
    const cell = hit('R:side-2');
    expect(cell.surface).toBe('side-2');
    expect(cell.modifiers).toStrictEqual(mods());
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  it('surface then modifiers then override all together', () => {
    expect(parseCell('L:rim>x{딱}')).toStrictEqual(
      expectedHit({
        hand: 'L',
        token: 'L:rim>x{딱}',
        surface: 'rim',
        modifiers: mods({ strong: true, cross: true }),
        dynamic: 'strong',
        gueumOverride: '딱',
      }),
    );
  });

  it('a hit without ":" has surface null (instrument default is resolved later)', () => {
    expect(hit('R').surface).toBeNull();
    expect(hit('R>{덩}').surface).toBeNull();
  });
});

describe('known-surface backoff (options.surfaces)', () => {
  const drum: ParseCellOptions = { surfaces: ['head', 'rim'] };

  it('"R:rimx" with surfaces [head, rim] is rim + cross-arm', () => {
    const cell = hit('R:rimx', drum);
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods({ cross: true }));
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  it('"R:rimx" without options keeps the whole run as the surface id', () => {
    const cell = hit('R:rimx');
    expect(cell.surface).toBe('rimx');
    expect(cell.modifiers).toStrictEqual(mods());
  });

  it('"R:rim" with surfaces given stays rim', () => {
    const cell = hit('R:rim', drum);
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods());
  });

  it('an unknown surface with no known prefix stays as written (loader reports it later)', () => {
    const cell = hit('R:side', drum);
    expect(cell.surface).toBe('side');
    expect(cell.modifiers).toStrictEqual(mods());
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  it('backs off to the longest known prefix', () => {
    // "rimx" is unknown; "rim", "ri" and "r" are all known, so the longest one must win.
    const cell = hit('R:rimx', { surfaces: ['r', 'ri', 'rim'] });
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods({ cross: true }));
    expect(cell.unknownMarks).toStrictEqual([]);
  });

  it('backs off only when the remainder is made of modifiers, so typos reach the loader', () => {
    expect(hit('R:rimm', drum).surface).toBe('rimm');
    expect(hit('R:rim2', drum).surface).toBe('rim2');
    expect(hit('R:heads', { surfaces: ['head'] }).surface).toBe('heads');
    expect(hit('R:rimxm', drum).surface).toBe('rimxm');
    const cell = hit('R:rimx>', drum);
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods({ cross: true, strong: true }));
  });

  it('the remainder after backoff is read as modifiers and marks in order', () => {
    const cell = hit("R:rim'x!", drum);
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers).toStrictEqual(mods({ accent: true, cross: true }));
    expect(cell.unknownMarks).toStrictEqual(['!']);
  });

  it('accepts any iterable of surface ids (e.g. a Set)', () => {
    const cell = hit('B:rimx', { surfaces: new Set(['head', 'rim']) });
    expect(cell.surface).toBe('rim');
    expect(cell.modifiers.cross).toBe(true);
  });

  it('an empty surfaces list behaves like no options', () => {
    expect(hit('R:rimx', { surfaces: [] }).surface).toBe('rimx');
  });
});

describe('reserved cell tokens inside a hit', () => {
  it.each<string>(['R~', 'R-', 'B>~', 'R~{덩}', 'R:rim~', 'L/R~', 'R^-'])('rejects %j', (input) => {
    const err = expectTokenError(input, { surfaces: ['head', 'rim'] });
    expect(err.message).toMatch(/cell of its own/);
    expect(err.message).toContain('two cells');
  });

  it('the message shows how to split the token', () => {
    const err = expectTokenError('B>~');
    expect(err.message).toContain('"B>" and "~"');
  });
});

describe('marks are whole code points', () => {
  it('keeps an astral character as one mark', () => {
    expect(hit('R😀').unknownMarks).toStrictEqual(['😀']);
    expect(hit('R\u{1D10D}').unknownMarks).toHaveLength(1);
    expect(hit('R😀{덩}').unknownMarks).toStrictEqual(['😀']);
  });

  it('keeps BMP marks and modifiers around an astral mark intact', () => {
    const cell = hit("R>😀'↑");
    expect(cell.unknownMarks).toStrictEqual(['😀', '↑']);
    expect(cell.modifiers).toStrictEqual(mods({ strong: true, accent: true }));
    // No lone surrogates: every mark is one whole code point.
    for (const mark of cell.unknownMarks) {
      expect([...mark]).toHaveLength(1);
      expect(mark).not.toMatch(/^[\uD800-\uDFFF]$/);
    }
  });
});

describe('exports shared with the loader', () => {
  it('SURFACE_ID_PATTERN accepts letters, digits and hyphens only', () => {
    for (const ok of ['head', 'rim', 'side-2', 'A1']) expect(SURFACE_ID_PATTERN.test(ok)).toBe(true);
    for (const bad of ['', 'rim_low', 'rim low', 'rim.x', '딱', 'rim~']) expect(SURFACE_ID_PATTERN.test(bad)).toBe(false);
  });

  it('isHand recognises exactly R, L and B', () => {
    expect(['R', 'L', 'B'].every(isHand)).toBe(true);
    for (const bad of ['r', 'X', '', 'RL', undefined, null, 1]) expect(isHand(bad)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gu-eum override
// ---------------------------------------------------------------------------

describe('gu-eum override', () => {
  it('"B{덩}" overrides the syllable', () => {
    expect(parseCell('B{덩}')).toStrictEqual(expectedHit({ hand: 'B', token: 'B{덩}', gueumOverride: '덩' }));
  });

  it('"B>{덩}" — modifier before the override', () => {
    expect(parseCell('B>{덩}')).toStrictEqual(
      expectedHit({
        hand: 'B',
        token: 'B>{덩}',
        modifiers: mods({ strong: true }),
        dynamic: 'strong',
        gueumOverride: '덩',
      }),
    );
  });

  it('"R{}" gives an empty-string override (show no syllable), not null', () => {
    const cell = hit('R{}');
    expect(cell.gueumOverride).toBe('');
    expect(cell.gueumOverride).not.toBeNull();
  });

  it('"R{ta-ka}" — ASCII and hyphens inside braces are kept verbatim', () => {
    expect(hit('R{ta-ka}').gueumOverride).toBe('ta-ka');
  });

  it('multi-syllable Korean overrides are kept verbatim', () => {
    expect(hit('R{그덩}').gueumOverride).toBe('그덩');
  });

  it('modifier characters inside braces are text, not modifiers', () => {
    const cell = hit("R{_'>^x}");
    expect(cell.gueumOverride).toBe("_'>^x");
    expect(cell.modifiers).toStrictEqual(mods());
    expect(cell.dynamic).toBe('normal');
  });

  it('whitespace inside braces is rejected like any other whitespace (spec is silent; parser rule)', () => {
    expectTokenError('R{ta ka}');
  });
});

// ---------------------------------------------------------------------------
// grace (flam) notes
// ---------------------------------------------------------------------------

describe('grace notes', () => {
  it('"L/R{그덩}" is grace L, hand R, override 그덩', () => {
    expect(parseCell('L/R{그덩}')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'L/R{그덩}', grace: 'L', gueumOverride: '그덩' }),
    );
  });

  it('"R/L" is grace R, hand L', () => {
    const cell = hit('R/L');
    expect(cell.grace).toBe('R');
    expect(cell.hand).toBe('L');
    expect(cell.gueumOverride).toBeNull();
  });

  it('"B/B" is grace B, hand B', () => {
    const cell = hit('B/B');
    expect(cell.grace).toBe('B');
    expect(cell.hand).toBe('B');
  });

  it('grace combines with surface, modifiers and override', () => {
    expect(parseCell("L/R:rim'{딱}")).toStrictEqual(
      expectedHit({
        hand: 'R',
        token: "L/R:rim'{딱}",
        grace: 'L',
        surface: 'rim',
        modifiers: mods({ accent: true }),
        dynamic: 'accent',
        gueumOverride: '딱',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// unknown marks
// ---------------------------------------------------------------------------

describe('unknown marks are kept verbatim, in order', () => {
  it.each<[string, string[]]>([
    ['R!', ['!']],
    ['R.', ['.']],
    ['R2', ['2']],
    ['R!?', ['!', '?']],
  ])('%s → %j', (token, marks) => {
    const cell = hit(token);
    expect(cell.unknownMarks).toStrictEqual(marks);
    expect(cell.modifiers).toStrictEqual(mods());
    expect(cell.dynamic).toBe('normal');
  });

  it('"R^!" is lift plus an unknown "!"', () => {
    const cell = hit('R^!');
    expect(cell.modifiers).toStrictEqual(mods({ lift: true }));
    expect(cell.unknownMarks).toStrictEqual(['!']);
  });

  it('marks and modifiers interleave freely; marks keep their written order', () => {
    const cell = hit("R!>?'.");
    expect(cell.modifiers).toStrictEqual(mods({ accent: true, strong: true }));
    expect(cell.dynamic).toBe('strong');
    expect(cell.unknownMarks).toStrictEqual(['!', '?', '.']);
  });

  it('a repeated unknown mark appears once per occurrence ("R!!")', () => {
    expect(hit('R!!').unknownMarks).toStrictEqual(['!', '!']);
  });

  it('unknown marks may precede a gu-eum override', () => {
    const cell = hit('R!{덩}');
    expect(cell.unknownMarks).toStrictEqual(['!']);
    expect(cell.gueumOverride).toBe('덩');
  });
});

// ---------------------------------------------------------------------------
// whitespace and the token field
// ---------------------------------------------------------------------------

describe('token field and whitespace', () => {
  it('token is the trimmed text', () => {
    expect(hit(' R ').token).toBe('R');
    expect(hit('\tB>{덩}\n').token).toBe('B>{덩}');
    expect(parseCell(' - ').token).toBe('-');
    expect(parseCell(' ~ ').token).toBe('~');
  });

  it('" R " parses exactly like "R"', () => {
    expect(parseCell(' R ')).toStrictEqual(parseCell('R'));
  });

  it('"R L" (internal whitespace) throws', () => {
    expectTokenError('R L');
  });

  it('other internal whitespace throws too', () => {
    expectTokenError('R\tL');
    expectTokenError('R >');
  });

  it('token keeps the text as written for every hit shape', () => {
    for (const t of ['R', "R'", 'L:rim{딱}', 'L/R{그덩}', 'R!?', "R_'x^>"]) {
      expect(hit(t).token).toBe(t);
    }
  });
});

// ---------------------------------------------------------------------------
// every example token from SPEC §3.2
// ---------------------------------------------------------------------------

describe('SPEC §3.2 example tokens', () => {
  it('B>{덩}', () => {
    expect(parseCell('B>{덩}')).toStrictEqual(
      expectedHit({ hand: 'B', token: 'B>{덩}', modifiers: mods({ strong: true }), dynamic: 'strong', gueumOverride: '덩' }),
    );
  });

  it(`R'`, () => {
    expect(parseCell("R'")).toStrictEqual(
      expectedHit({ hand: 'R', token: "R'", modifiers: mods({ accent: true }), dynamic: 'accent' }),
    );
  });

  it('L_', () => {
    expect(parseCell('L_')).toStrictEqual(
      expectedHit({ hand: 'L', token: 'L_', modifiers: mods({ soft: true }), dynamic: 'soft' }),
    );
  });

  it('R>^', () => {
    expect(parseCell('R>^')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'R>^', modifiers: mods({ strong: true, lift: true }), dynamic: 'strong' }),
    );
  });

  it('Rx', () => {
    expect(parseCell('Rx')).toStrictEqual(expectedHit({ hand: 'R', token: 'Rx', modifiers: mods({ cross: true }) }));
  });

  it('L:rim{딱}', () => {
    expect(parseCell('L:rim{딱}')).toStrictEqual(
      expectedHit({ hand: 'L', token: 'L:rim{딱}', surface: 'rim', gueumOverride: '딱' }),
    );
  });

  it('L/R{그덩}', () => {
    expect(parseCell('L/R{그덩}')).toStrictEqual(
      expectedHit({ hand: 'R', token: 'L/R{그덩}', grace: 'L', gueumOverride: '그덩' }),
    );
  });

  it('~', () => {
    expect(parseCell('~')).toStrictEqual({ kind: 'extender', token: '~' });
  });

  it('every token in the SPEC §3.1 sample piece parses', () => {
    const sample = [
      'B{덩}', 'B>{덩}', 'L_', 'R_', 'L_', 'R_', 'L_', 'R_', 'L', 'L',
      "R'", 'L', 'R', 'L', "R'", 'L', 'R', 'L', "R'", 'L', 'R', 'L',
      'L/R{그덩}', 'R/L{그덩}',
      'L^', 'R', 'R', '~',
      'B{덩}', '~', 'R:rim{딱}', 'R:rim{딱}',
    ];
    for (const t of sample) expect(() => parseCell(t, { surfaces: ['head', 'rim'] })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// errors
// ---------------------------------------------------------------------------

describe('TokenError', () => {
  it('is an Error named TokenError carrying the offending token', () => {
    const err = expectTokenError('RL');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TokenError');
    expect(err.token).toBe('RL');
    expect(err.message).toContain('RL');
  });

  it.each<string>([
    '',
    '   ',
    'r',
    'RL',
    'R/',
    '/R',
    'R:',
    'R{덩',
    'R{덩}x',
    'R{{덩}}',
    '--',
    '~~',
    'R//L',
    'R:rim:head',
    'RB',
    'L/R/B',
  ])('rejects %j with a TokenError naming the token', (input) => {
    const err = expectTokenError(input);
    // None of these contain control characters, so the raw token text must appear verbatim.
    expect(err.message).toContain(input);
  });

  it('the error message contains the token text verbatim (including non-ASCII)', () => {
    const err = expectTokenError('R{덩');
    expect(err.message).toContain('R{덩');
  });

  it('a non-string input throws TokenError, not TypeError', () => {
    const bad = undefined as unknown as string;
    expect(() => parseCell(bad)).toThrow(TokenError);
    expect(() => parseCell(bad)).not.toThrow(TypeError);
    expect(() => parseCell(null as unknown as string)).toThrow(TokenError);
    expect(() => parseCell(42 as unknown as string)).toThrow(TokenError);
  });

  it('a lowercase hand or unknown leading character is rejected', () => {
    expectTokenError('l');
    expectTokenError('b');
    expectTokenError('X');
    expectTokenError('1');
  });

  it('a second hand letter after modifiers is still rejected', () => {
    expectTokenError("R'L");
    expectTokenError('R^L');
  });

  it('a hand letter inside a surface run is part of the id', () => {
    // Surface ids may contain any [A-Za-z0-9-], so "rimL" is the id (spec is silent).
    expect(hit('R:rimL').surface).toBe('rimL');
    // Backoff never peels it off: "L" is not a modifier, so the loader reports "rimL" as unknown.
    expect(hit('R:rimL', { surfaces: ['rim'] }).surface).toBe('rimL');
  });

  it('a stray "}" outside an override is rejected', () => {
    expectTokenError('R}');
  });

  it('errors are thrown with options too', () => {
    expectTokenError('R:', { surfaces: ['head'] });
    expectTokenError('RL', { surfaces: ['head'] });
  });
});

// ---------------------------------------------------------------------------
// plain data
// ---------------------------------------------------------------------------

describe('results are plain data', () => {
  const samples: Cell[] = [
    parseCell('-'),
    parseCell('~'),
    parseCell('R'),
    parseCell("R_'x^>"),
    parseCell('L/R:rim{그덩}'),
    parseCell('R!?{}'),
    parseCell('R:rimx', { surfaces: ['head', 'rim'] }),
  ];

  it.each(samples.map((c) => [c.token, c] as const))('%s survives a JSON round trip', (_token, cell) => {
    expect(JSON.parse(JSON.stringify(cell))).toEqual(cell);
  });

  it('contains no functions or class instances', () => {
    for (const cell of samples) {
      expect(Object.getPrototypeOf(cell)).toBe(Object.prototype);
      for (const value of Object.values(cell)) {
        expect(typeof value).not.toBe('function');
        if (value !== null && typeof value === 'object') {
          expect([Object.prototype, Array.prototype]).toContain(Object.getPrototypeOf(value));
        }
      }
    }
  });
});
