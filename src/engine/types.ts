/**
 * Data model for the Nanta practice site (see SPEC.md §3).
 *
 * Three layers:
 *  1. `*Json` types describe the raw shape of `public/pieces/*.json` exactly as authored.
 *  2. Resolved types (`Piece`, `Section`, `Line`, `ResolvedCell`) are produced by
 *     `loadPiece()` after parsing cell tokens, filling defaults, resolving surfaces and
 *     gu-eum syllables, and validating pulse counts.
 *  3. `Timeline` is produced by `expandPiece()` in expand.ts: sections, repeats and line
 *     pauses flattened into one pulse per entry with a duration and a gain.
 *
 * Time model: every cell is exactly one pulse. Lines and groups are layout only, except
 * that a line pause (piece `linePause`, overridable per line with `pauseAfter`) appends
 * that many pulses of silence after a line. `tempoScale` stretches every pulse of a section.
 */

// ---------------------------------------------------------------------------
// 1. Raw JSON (public/pieces/*.json and public/pieces/index.json)
// ---------------------------------------------------------------------------

/** Which hand(s) strike: right, left, both. */
export type Hand = 'R' | 'L' | 'B';

/** One strikeable surface of an instrument (SPEC §3.1). */
export interface SurfaceJson {
  /** Sound generator id: "low" | "mid" | "high" | "click" (or a sample path later). */
  sound: string;
  /** Default gu-eum syllable per hand. Missing hands fall back to the hand letter. */
  gueum?: Partial<Record<Hand, string>>;
}

export interface InstrumentJson {
  id: string;
  name: string;
  /** Surface used when a hit token has no ":surface". Must be a key of `surfaces`. */
  defaultSurface: string;
  surfaces: Record<string, SurfaceJson>;
}

export interface PartJson {
  id: string;
  name: string;
  /** Instrument id. */
  instrument: string;
  /** The part whose cues drive section changes. At most one part may be lead. */
  lead?: boolean;
}

export interface LineJson {
  /** Groups of cell tokens (grammar in SPEC §3.2). Every token is one pulse. */
  groups: string[][];
  /** Free text drawn under the line. */
  note?: string;
  /** Pulses of silence after this line; overrides the piece `linePause`. */
  pauseAfter?: number;
}

export interface SectionJson {
  id: string;
  name: string;
  /** Times the section is played. Default 1. */
  repeat?: number;
  /** Ramp volume from soft to full across the repeats. Default false. */
  crescendo?: boolean;
  /** Multiplies the pulse length for this section (0.5 = twice as long). Default 1. */
  tempoScale?: number;
  /** Free text shown during the count-in. */
  cueIn?: string;
  /** Lines keyed by part id. A part missing here is silent for the section. */
  lines: Record<string, LineJson[]>;
}

export interface PieceJson {
  id: string;
  title: string;
  /** Pulses per minute at performance speed. */
  pulseBpm: number;
  /** Pulses of silence appended after every line. Default 0. */
  linePause?: number;
  instruments: InstrumentJson[];
  parts: PartJson[];
  sections: SectionJson[];
}

/** Shape of public/pieces/index.json. `file` is relative to public/pieces/. */
export interface PieceIndexJson {
  pieces: PieceIndexEntry[];
}

export interface PieceIndexEntry {
  id: string;
  file: string;
}

// ---------------------------------------------------------------------------
// 2a. Parsed cell tokens (tokens.ts)
// ---------------------------------------------------------------------------

/**
 * Loudness of a hit, the loudest modifier present wins:
 * strong (`>`) > accent (`'`) > soft (`_`) > normal (no loudness modifier).
 */
export type Dynamic = 'soft' | 'normal' | 'accent' | 'strong';

/** Known modifier flags. Unknown marks are kept verbatim in `HitCell.unknownMarks`. */
export interface CellModifiers {
  /** `_` play softer */
  soft: boolean;
  /** `'` small accent */
  accent: boolean;
  /** `>` strong accent */
  strong: boolean;
  /** `^` lift the striking arm high after the hit (visual only) */
  lift: boolean;
  /** `x` cross-arm: this hand crosses to the other side for this hit (visual only) */
  cross: boolean;
}

/** `-`: one pulse of plain rest, drawn empty. */
export interface RestCell {
  kind: 'rest';
  token: '-';
}

/** `~`: one pulse of silence after a big arm motion, drawn as a tilde. */
export interface ExtenderCell {
  kind: 'extender';
  token: '~';
}

/** A stroke. Produced by `parseCell()`; surface and gu-eum are not yet resolved. */
export interface HitCell {
  kind: 'hit';
  /** The token text as written (trimmed). */
  token: string;
  /** Main striking hand. */
  hand: Hand;
  /** Flam pickup hand (`L/R` = grace L, hand R), or null. */
  grace: Hand | null;
  /** Explicit surface id from `:surface`, or null to use the instrument default. */
  surface: string | null;
  modifiers: CellModifiers;
  /** Unrecognised single-character marks, in the order written. Rendered as-is. */
  unknownMarks: string[];
  /** `{syllable}` override, or null. May be "" to show no syllable. */
  gueumOverride: string | null;
  dynamic: Dynamic;
}

export type Cell = RestCell | ExtenderCell | HitCell;

// ---------------------------------------------------------------------------
// 2b. Resolved piece (loadPiece.ts)
// ---------------------------------------------------------------------------

/** A hit with its surface, sound and displayed syllable resolved against the instrument. */
export interface ResolvedHit extends HitCell {
  /** Surface actually struck: explicit `surface` or the instrument's default. */
  surfaceId: string;
  /** Sound generator id from `instrument.surfaces[surfaceId].sound`. */
  sound: string;
  /** Displayed syllable per SPEC §3.3 (override, else surface gueum[hand], else hand letter). */
  gueum: string;
}

export type ResolvedCell = RestCell | ExtenderCell | ResolvedHit;

export interface Line {
  groups: ResolvedCell[][];
  note: string | null;
  /** Resolved pause after this line in pulses (`pauseAfter` ?? piece `linePause`). */
  pauseAfter: number;
  /** Number of cells in the line (sum of group lengths), excluding the pause. */
  cellPulses: number;
}

export type Instrument = InstrumentJson;

export interface Part {
  id: string;
  name: string;
  instrument: string;
  lead: boolean;
}

export interface Section {
  id: string;
  name: string;
  /** At least 1. */
  repeat: number;
  crescendo: boolean;
  /** Greater than 0. */
  tempoScale: number;
  cueIn: string;
  /** Lines keyed by part id. Only parts present in the JSON appear here. */
  lines: Record<string, Line[]>;
  /** Pulses in one pass of the section including line pauses (equal for every part present). */
  pulses: number;
  /** Cells in one pass of the section, excluding line pauses (taken from the first part present). */
  cellPulses: number;
}

export interface Piece {
  id: string;
  title: string;
  pulseBpm: number;
  linePause: number;
  instruments: Instrument[];
  parts: Part[];
  sections: Section[];
}

// ---------------------------------------------------------------------------
// 3. Expanded timeline (expand.ts)
// ---------------------------------------------------------------------------

/** Where a pulse lands inside one part's chart. */
export interface CellRef {
  lineIndex: number;
  groupIndex: number;
  cellIndex: number;
  cell: ResolvedCell;
  /** First cell of its group (metronome plays louder here). */
  groupStart: boolean;
  /** First cell of its line. */
  lineStart: boolean;
}

/** What one part does at one timeline pulse. */
export type PulseSlot =
  | ({ kind: 'cell' } & CellRef)
  /** Inside a line pause of this part: silent, taps count as misses. */
  | { kind: 'pause'; lineIndex: number }
  /** The part has no lines in this section. */
  | { kind: 'silent' };

export interface TimelinePulse {
  /** Position in `Timeline.pulses`. */
  index: number;
  sectionIndex: number;
  sectionId: string;
  /** 1-based repeat number ("rep 3 / 8"). */
  rep: number;
  repeatCount: number;
  /** 0-based position within one pass of the section (0 .. section.pulses - 1). */
  pulseInSection: number;
  /**
   * Length of this pulse in base pulse units: 1 / section.tempoScale.
   * Seconds = duration * 60 / bpm, where bpm is the current (slider-scaled) pulse BPM.
   */
  duration: number;
  /** Cumulative start in base pulse units (sum of previous durations). */
  start: number;
  /** Crescendo gain for this repeat in dB (0 = full; computed once per repeat). */
  gainDb: number;
  /** One slot per part of the piece, keyed by part id. */
  parts: Record<string, PulseSlot>;
}

/** Pulse range of one section (all repeats), `end` exclusive. */
export interface SectionSpan {
  sectionIndex: number;
  sectionId: string;
  start: number;
  end: number;
  pulsesPerRep: number;
  repeatCount: number;
}

export interface Timeline {
  pieceId: string;
  pulseBpm: number;
  pulses: TimelinePulse[];
  sections: SectionSpan[];
  totalPulses: number;
  /** Sum of all durations in base pulse units. */
  totalUnits: number;
}
