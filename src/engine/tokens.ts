/**
 * Cell token parser. Grammar (SPEC.md §3.2):
 *
 *   cell     := "-" | "~" | hit
 *   hit      := [ grace ] hand [ ":" surface ] { modifier | mark } [ "{" gueum "}" ]
 *   grace    := hand "/"
 *   hand     := "R" | "L" | "B"
 *   surface  := run of [A-Za-z0-9-]   (see SURFACE_ID_PATTERN)
 *   modifier := "_" soft | "'" small accent | ">" strong accent | "^" lift | "x" cross-arm
 *   mark     := any other single character (code point), kept verbatim and drawn as-is
 *   gueum    := any text up to the closing "}", may be empty
 *
 * Modifiers may stack in any order and repeat. Two things are errors rather than marks,
 * because each is almost certainly a separate cell written into this one: a second hand
 * letter without "/" ("RL"), and the reserved cell tokens "~" and "-" after a hit
 * ("R~" means the two cells "R", "~"; writing it as one cell would lose a pulse).
 */
import type { Cell, CellModifiers, Dynamic, Hand, HitCell } from './types';

/** Playback gain per dynamic in dB (SPEC §3.2 loudness ladder). */
export const DYNAMIC_DB: Readonly<Record<Dynamic, number>> = {
  soft: -8,
  normal: 0,
  accent: 3,
  strong: 7,
};

/** Grace (flam pickup) hand plays this many dB below the main hand. */
export const GRACE_DB = -10;
/** Grace hand plays this many seconds before the main hand, within the same pulse. */
export const GRACE_LEAD_SECONDS = 0.04;

export const MODIFIER_CHARS: ReadonlyMap<string, keyof CellModifiers> = new Map([
  ['_', 'soft'],
  ["'", 'accent'],
  ['>', 'strong'],
  ['^', 'lift'],
  ['x', 'cross'],
]);

/**
 * Characters a surface id may use so that it can be written after ":" in a cell token.
 * "_" is excluded because it is the soft modifier. The loader rejects other ids.
 */
export const SURFACE_ID_PATTERN = /^[A-Za-z0-9-]+$/;

const HANDS: ReadonlySet<string> = new Set(['R', 'L', 'B']);
const SURFACE_CHAR = /[A-Za-z0-9-]/;
/** Cell tokens that can never appear inside a hit. */
const RESERVED_CELLS: ReadonlySet<string> = new Set(['-', '~']);

export class TokenError extends Error {
  readonly token: string;

  constructor(token: string, message: string) {
    super(`invalid cell token ${JSON.stringify(token)}: ${message}`);
    this.name = 'TokenError';
    this.token = token;
  }
}

export interface ParseCellOptions {
  /**
   * Surface ids of the instrument the cell is played on. When given, a ":surface" run that is
   * not a known surface backs off to its longest known prefix, provided everything after that
   * prefix is modifier characters: "R:rimx" is rim + cross-arm when "rim" exists and "rimx"
   * does not. A remainder that is not all modifiers ("R:rimm") is left as the surface id so
   * the loader can report the typo. Without this option the whole run is the surface id.
   */
  surfaces?: Iterable<string>;
}

/** True for the hand letters R, L and B. */
export function isHand(c: unknown): c is Hand {
  return typeof c === 'string' && HANDS.has(c);
}

function isAllModifiers(text: string): boolean {
  return [...text].every((c) => MODIFIER_CHARS.has(c));
}

/** The surface id for a ":run", backing off to a known prefix when the rest is modifiers. */
function resolveSurfaceRun(run: string, known: ReadonlySet<string>): string {
  if (known.size === 0 || known.has(run)) return run;
  for (let k = run.length - 1; k > 0; k -= 1) {
    if (known.has(run.slice(0, k)) && isAllModifiers(run.slice(k))) return run.slice(0, k);
  }
  return run;
}

/** Parse one cell token. Throws `TokenError` on malformed input. */
export function parseCell(input: string, options: ParseCellOptions = {}): Cell {
  if (typeof input !== 'string') throw new TokenError(String(input), 'token must be a string');
  const token = input.trim();
  if (token === '') throw new TokenError(input, 'empty token');
  if (/\s/.test(token)) throw new TokenError(input, 'contains whitespace; write one cell per array entry');
  if (token === '-') return { kind: 'rest', token: '-' };
  if (token === '~') return { kind: 'extender', token: '~' };

  let i = 0;

  // grace := hand "/"
  let grace: Hand | null = null;
  if (isHand(token[0]) && token[1] === '/') {
    grace = token[0];
    i = 2;
  }

  const hand = token[i];
  if (!isHand(hand)) {
    throw new TokenError(
      input,
      grace ? `expected main hand R, L or B after "${grace}/"` : 'must start with R, L, B, "-" or "~"',
    );
  }
  i += 1;

  // [ ":" surface ]
  let surface: string | null = null;
  if (token[i] === ':') {
    i += 1;
    let j = i;
    while (j < token.length && SURFACE_CHAR.test(token[j])) j += 1;
    const run = token.slice(i, j);
    if (run === '') throw new TokenError(input, 'expected a surface id after ":"');
    surface = resolveSurfaceRun(run, new Set(options.surfaces ?? []));
    i += surface.length;
  }

  // { modifier | mark }, one code point at a time so astral characters stay whole
  const modifiers: CellModifiers = { soft: false, accent: false, strong: false, lift: false, cross: false };
  const unknownMarks: string[] = [];
  while (i < token.length && token[i] !== '{') {
    const c = String.fromCodePoint(token.codePointAt(i) as number);
    const mod = MODIFIER_CHARS.get(c);
    if (mod) {
      modifiers[mod] = true;
    } else if (HANDS.has(c)) {
      throw new TokenError(input, `unexpected second hand "${c}"; write one cell per hit or "${c}/" for a grace note`);
    } else if (RESERVED_CELLS.has(c)) {
      throw new TokenError(input, `"${c}" is a cell of its own; write "${token.slice(0, i)}" and "${c}" as two cells`);
    } else if (c === '/' || c === ':' || c === '}') {
      throw new TokenError(input, `unexpected "${c}"`);
    } else {
      unknownMarks.push(c);
    }
    i += c.length;
  }

  // [ "{" gueum "}" ]
  let gueumOverride: string | null = null;
  if (token[i] === '{') {
    const close = token.indexOf('}', i + 1);
    if (close === -1) throw new TokenError(input, 'missing "}" after gu-eum override');
    gueumOverride = token.slice(i + 1, close);
    if (gueumOverride.includes('{')) throw new TokenError(input, 'nested "{" inside gu-eum override');
    i = close + 1;
    if (i < token.length) throw new TokenError(input, `unexpected "${token.slice(i)}" after gu-eum override`);
  }

  const dynamic: Dynamic = modifiers.strong ? 'strong' : modifiers.accent ? 'accent' : modifiers.soft ? 'soft' : 'normal';
  return { kind: 'hit', token, hand, grace, surface, modifiers, unknownMarks, gueumOverride, dynamic };
}

/** Playback gain of a hit in dB from its dynamic. */
export function dynamicDb(cell: HitCell): number {
  return DYNAMIC_DB[cell.dynamic];
}
