/**
 * Pure helpers behind the player controls (SPEC.md §4.2: tempo slider, loops, count-in,
 * mute/solo, line jumps). player.ts applies these to Tone.Transport; everything that can be
 * decided from the timeline alone lives here so it can be unit tested.
 *
 * Positions are timeline pulse indices (`Timeline.pulses[i]`), never seconds: the Transport
 * runs at a variable tempo and `tempoScale` sections have longer pulses, so a pulse index is
 * the only stable coordinate.
 */
import type { Timeline } from './types';

/** Pulses of metronome before playback starts (SPEC §4.2 count-in). */
export const COUNT_IN_PULSES = 4;
/** Tempo slider range as a fraction of the piece's `pulseBpm` (SPEC §4.2: 40% to 120%). */
export const TEMPO_MIN_RATIO = 0.4;
export const TEMPO_MAX_RATIO = 1.2;
/** Step of the `[` / `]` keys and of the "+5 BPM every loop" toggle. */
export const TEMPO_STEP_BPM = 5;

export interface BpmRange {
  min: number;
  max: number;
}

/** Slider limits for a piece, in whole BPM. */
export function tempoRange(pulseBpm: number): BpmRange {
  if (!Number.isFinite(pulseBpm) || pulseBpm <= 0) throw new RangeError(`pulseBpm must be a positive number, got ${pulseBpm}`);
  return { min: Math.round(pulseBpm * TEMPO_MIN_RATIO), max: Math.round(pulseBpm * TEMPO_MAX_RATIO) };
}

export function clampBpm(bpm: number, range: BpmRange): number {
  if (!Number.isFinite(bpm)) throw new RangeError(`bpm must be a finite number, got ${bpm}`);
  return Math.min(range.max, Math.max(range.min, bpm));
}

// ---------------------------------------------------------------------------
// Loops
// ---------------------------------------------------------------------------

/**
 * What to loop. A `lines` loop is a range of chart lines of one part inside one section,
 * 0-based and inclusive; it always covers the first pass of a repeated section.
 */
export type LoopSpec =
  | { kind: 'off' }
  | { kind: 'piece' }
  | { kind: 'section'; sectionId: string }
  | { kind: 'lines'; sectionId: string; partId: string; from: number; to: number };

export const LOOP_OFF: LoopSpec = { kind: 'off' };

/** Structural equality of two loop specs. */
export function sameLoop(a: LoopSpec, b: LoopSpec): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'off':
    case 'piece':
      return true;
    case 'section':
      return b.kind === 'section' && a.sectionId === b.sectionId;
    case 'lines':
      return b.kind === 'lines' && a.sectionId === b.sectionId && a.partId === b.partId && a.from === b.from && a.to === b.to;
  }
}

/** A range of timeline pulse indices, `end` exclusive. */
export interface PulseRange {
  start: number;
  end: number;
}

function spanOf(timeline: Timeline, sectionId: string) {
  const span = timeline.sections.find((s) => s.sectionId === sectionId);
  if (span === undefined) throw new RangeError(`unknown section id "${sectionId}" in piece "${timeline.pieceId}"`);
  return span;
}

/**
 * The pulse range a loop covers, or null for no loop.
 *
 * @throws RangeError for an unknown section or part, or a line range the part does not have
 *   in that section (a part that is silent there has no lines to loop).
 */
export function loopRange(timeline: Timeline, spec: LoopSpec): PulseRange | null {
  switch (spec.kind) {
    case 'off':
      return null;
    case 'piece':
      return timeline.totalPulses === 0 ? null : { start: 0, end: timeline.totalPulses };
    case 'section': {
      const span = spanOf(timeline, spec.sectionId);
      return { start: span.start, end: span.end };
    }
    case 'lines': {
      const span = spanOf(timeline, spec.sectionId);
      if (!Number.isInteger(spec.from) || !Number.isInteger(spec.to) || spec.from < 0 || spec.from > spec.to) {
        throw new RangeError(`bad line range ${spec.from}..${spec.to} in section "${spec.sectionId}"`);
      }
      let start = -1;
      let end = -1;
      // First pass of the section only: repeats replay the same lines.
      for (let i = span.start; i < span.start + span.pulsesPerRep; i += 1) {
        const slot = timeline.pulses[i].parts[spec.partId];
        if (slot === undefined) throw new RangeError(`unknown part id "${spec.partId}" in piece "${timeline.pieceId}"`);
        if (slot.kind === 'silent') break;
        if (slot.lineIndex < spec.from || slot.lineIndex > spec.to) continue;
        if (start === -1) start = i;
        end = i + 1;
      }
      if (start === -1) {
        throw new RangeError(
          `part "${spec.partId}" has no lines ${spec.from + 1}-${spec.to + 1} in section "${spec.sectionId}"`,
        );
      }
      return { start, end };
    }
  }
}

/** Chart position of a line: which section and which of the part's lines in it. */
export interface LineRef {
  sectionIndex: number;
  lineIndex: number;
}

/** The lines of `partId` that a pulse range touches (a line pause counts), each once, in order. */
export function linesInRange(timeline: Timeline, partId: string, range: PulseRange): LineRef[] {
  const refs: LineRef[] = [];
  let last: LineRef | null = null;
  for (let i = Math.max(0, range.start); i < Math.min(range.end, timeline.totalPulses); i += 1) {
    const pulse = timeline.pulses[i];
    const slot = pulse.parts[partId];
    if (slot === undefined || slot.kind === 'silent') continue;
    if (last !== null && last.sectionIndex === pulse.sectionIndex && last.lineIndex === slot.lineIndex) continue;
    last = { sectionIndex: pulse.sectionIndex, lineIndex: slot.lineIndex };
    refs.push(last);
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Line jumps (← / →)
// ---------------------------------------------------------------------------

/** Pulse indices inside `range` where `partId` starts a chart line, ascending. */
export function lineStarts(timeline: Timeline, partId: string, range: PulseRange = { start: 0, end: timeline.totalPulses }): number[] {
  const starts: number[] = [];
  for (let i = Math.max(0, range.start); i < Math.min(range.end, timeline.totalPulses); i += 1) {
    const slot = timeline.pulses[i].parts[partId];
    if (slot !== undefined && slot.kind === 'cell' && slot.lineStart) starts.push(i);
  }
  return starts;
}

/**
 * Where a jump of `delta` lines from pulse `from` lands, for the lines of `partId` within
 * `range`: the start of the line `delta` lines away from the one `from` is on, clamped to the
 * first and last line of the range. With no lines in the range (a silent part) the position
 * is only clamped into the range.
 */
export function jumpLine(
  timeline: Timeline,
  partId: string,
  from: number,
  delta: number,
  range: PulseRange = { start: 0, end: timeline.totalPulses },
): number {
  if (!Number.isInteger(delta)) throw new RangeError(`delta must be an integer, got ${delta}`);
  const starts = lineStarts(timeline, partId, range);
  if (starts.length === 0) return Math.min(Math.max(from, range.start), range.end - 1);
  // The line `from` is on: the last start at or before it (the first line when `from` precedes it).
  let current = 0;
  while (current + 1 < starts.length && starts[current + 1] <= from) current += 1;
  const target = Math.min(starts.length - 1, Math.max(0, current + delta));
  return starts[target];
}

// ---------------------------------------------------------------------------
// Count-in
// ---------------------------------------------------------------------------

/**
 * Base pulse units the scheduled timeline is shifted right by, so the count-in for a start
 * anywhere in the piece (even its first pulse, even in a slow `tempoScale` section) fits
 * before it at a non-negative Transport position.
 */
export function preRollUnits(timeline: Timeline): number {
  let longest = 0;
  for (const pulse of timeline.pulses) longest = Math.max(longest, pulse.duration);
  return COUNT_IN_PULSES * longest;
}

/**
 * Start positions (base pulse units, relative to the timeline origin) of the count-in clicks
 * before pulse `startIndex`: `COUNT_IN_PULSES` clicks at that pulse's own length, the last
 * one landing one pulse before it. Negative for the first pulse; add `preRollUnits()`.
 */
export function countInStarts(timeline: Timeline, startIndex: number): number[] {
  const pulse = timeline.pulses[startIndex];
  if (pulse === undefined) throw new RangeError(`no pulse at index ${startIndex}`);
  const starts: number[] = [];
  for (let k = COUNT_IN_PULSES; k >= 1; k -= 1) starts.push(pulse.start - k * pulse.duration);
  return starts;
}

// ---------------------------------------------------------------------------
// Mute / solo
// ---------------------------------------------------------------------------

/**
 * The parts that sound: the soloed part alone if one is set (solo wins over mute), else every
 * part not muted. Order follows `partIds`. Muting never affects the highlight (SPEC §4.2).
 */
export function audibleParts(partIds: readonly string[], muted: Iterable<string>, solo: string | null): string[] {
  if (solo !== null && partIds.includes(solo)) return [solo];
  const mutedSet = new Set(muted);
  return partIds.filter((id) => !mutedSet.has(id));
}
