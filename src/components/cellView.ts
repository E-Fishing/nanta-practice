/**
 * Display model for one chart cell (SPEC.md §4.2, §3.2, §3.3).
 *
 * `cellView()` turns a resolved cell into exactly what `Cell.tsx` draws, so the drawing
 * rules live in one pure, unit-tested place:
 *  - which letter is large (main hand) and which is small (flam grace hand);
 *  - which marks to draw and where: circle around the letter for `>`, triangle above for `'`,
 *    underline for `_`, up-arrow above for `^`, X below for `x`, unknown marks verbatim;
 *  - which syllable to write under the cell. The loader falls back to the hand letter when the
 *    instrument defines no syllable (§3.3 rule 3); the chart does not repeat that letter
 *    under itself, so only syllables actually written show up, as on the club's charts;
 *  - a non-default surface (a rim hit, the club's "boxed 딱") is boxed;
 *  - a spoken description for tooltips and screen readers.
 */
import type { Hand, ResolvedCell, ResolvedHit } from '../engine/types';

export interface HitView {
  kind: 'hit';
  /** Main hand, drawn large. */
  hand: Hand;
  /** Flam pickup hand, drawn small before the main hand, or null. */
  grace: Hand | null;
  /** `>`: circle around the letter. */
  circled: boolean;
  /** `_`: small underline under the letter. */
  underlined: boolean;
  /** `'`: small triangle above the letter. */
  triangle: boolean;
  /** `^`: up-arrow above the letter. */
  arrow: boolean;
  /** `x`: X below the letter. */
  cross: boolean;
  /** Unknown marks, drawn verbatim next to the above-marks. */
  extraMarks: string[];
  /** Syllable written under the cell, or null when nothing is written. */
  syllable: string | null;
  /** Surface id when it is not the instrument's default (the syllable is boxed), else null. */
  surface: string | null;
  /** Spoken description, e.g. "Right hand, strong accent, 덩". */
  label: string;
}

export interface RestView {
  kind: 'rest';
  label: string;
}

export interface ExtenderView {
  kind: 'extender';
  label: string;
}

export type CellView = HitView | RestView | ExtenderView;

export const HAND_NAMES: Readonly<Record<Hand, string>> = {
  R: 'Right hand',
  L: 'Left hand',
  B: 'Both hands',
};

export const REST_LABEL = 'Rest';
export const EXTENDER_LABEL = 'Extender (~): big arm motion, no hit';

function hitLabel(hit: ResolvedHit, syllable: string | null, surface: string | null): string {
  const words: string[] = [];
  words.push(hit.grace ? `${HAND_NAMES[hit.grace]} pickup then ${HAND_NAMES[hit.hand].toLowerCase()} (flam)` : HAND_NAMES[hit.hand]);
  if (surface !== null) words.push(`on ${surface}`);
  const m = hit.modifiers;
  if (m.strong) words.push('strong accent');
  else if (m.accent) words.push('small accent');
  else if (m.soft) words.push('soft');
  if (m.lift) words.push('lift');
  if (m.cross) words.push('cross-arm');
  for (const mark of hit.unknownMarks) words.push(`mark ${mark}`);
  if (syllable !== null) words.push(syllable);
  return words.join(', ');
}

/** The syllable to write under a hit: what the chart has, not the loader's letter fallback. */
export function visibleSyllable(hit: ResolvedHit): string | null {
  const text = hit.gueum.trim();
  if (text === '' || text === hit.hand) return null;
  return text;
}

/** Build the display model of `cell` on an instrument whose default surface is `defaultSurface`. */
export function cellView(cell: ResolvedCell, defaultSurface: string): CellView {
  if (cell.kind === 'rest') return { kind: 'rest', label: REST_LABEL };
  if (cell.kind === 'extender') return { kind: 'extender', label: EXTENDER_LABEL };

  const syllable = visibleSyllable(cell);
  const surface = cell.surfaceId === defaultSurface ? null : cell.surfaceId;
  return {
    kind: 'hit',
    hand: cell.hand,
    grace: cell.grace,
    circled: cell.modifiers.strong,
    underlined: cell.modifiers.soft,
    triangle: cell.modifiers.accent,
    arrow: cell.modifiers.lift,
    cross: cell.modifiers.cross,
    extraMarks: [...cell.unknownMarks],
    syllable,
    surface,
    label: hitLabel(cell, syllable, surface),
  };
}
