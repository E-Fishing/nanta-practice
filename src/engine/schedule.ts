/**
 * Pure scheduling helpers for the player (SPEC.md §3.2, §3.4, §4.2, §6).
 *
 * player.ts drives Tone.Transport; everything that can be decided without an audio context
 * lives here so it can be unit tested:
 *  - `pulseTicks()`: where a timeline pulse sits on the Transport, in ticks. The Transport runs
 *    at the piece's pulse BPM with one quarter note per base pulse unit, so every pulse has a
 *    fixed tick position and a tempo change stretches playback without rescheduling anything.
 *  - `strokesAt()`: the strokes to sound at one pulse: one per hit, plus a soft grace stroke
 *    just before the main hand for a flam. Gain = crescendo gain of the repeat + the hit's
 *    dynamic (+ the grace offset).
 *  - `metronomeAccent()`: whether the metronome click on a pulse is the loud one (first pulse
 *    of a group of the part being followed).
 *  - `soundIdsOf()`: every sound id a piece uses, so voices can be built before playback.
 */
import { dynamicDb, GRACE_DB, GRACE_LEAD_SECONDS } from './tokens';
import type { Hand, Piece, TimelinePulse } from './types';

/** One synthesized stroke at a pulse. */
export interface Stroke {
  partId: string;
  /** Sound generator id of the surface struck. */
  sound: string;
  hand: Hand;
  /** Total gain in dB: crescendo gain of the repeat + dynamic (+ grace offset). */
  gainDb: number;
  /** Seconds relative to the pulse start; negative for a flam pickup. */
  offsetSeconds: number;
  /** True for the soft pickup of a flam. */
  grace: boolean;
}

/**
 * Ticks per base pulse unit on the Transport. A power of two, and the player schedules at
 * `SCHEDULING_BPM`, because Tone keys every event at `Math.floor(ticks)` after converting the
 * requested position ticks → seconds → ticks: that round trip is exact only when a quarter
 * note is a power-of-two number of seconds and the PPQ is a power of two. Otherwise an event
 * meant for tick n can land on tick n-1 with a 0.999-tick remainder: it still sounds at the
 * right time, but it sits on the wrong side of a loop point.
 */
export const TRANSPORT_PPQ = 256;
/** 120 BPM: a quarter note is exactly 0.5 s. Only used while scheduling, never heard. */
export const SCHEDULING_BPM = 120;

/** Transport tick of a position given in base pulse units, at `ppq` ticks per unit. */
export function pulseTicks(units: number, ppq: number): number {
  if (!Number.isFinite(units) || units < 0) throw new RangeError(`pulse position ${units} must be a finite number >= 0`);
  if (!Number.isInteger(ppq) || ppq <= 0) throw new RangeError(`PPQ ${ppq} must be a positive integer`);
  return Math.round(units * ppq);
}

/** Tone TransportTime string for a tick count ("384i"). */
export function tickTime(ticks: number): string {
  return `${ticks}i`;
}

/**
 * The strokes to sound at `pulse` for the given parts, in part order. Parts that are silent,
 * in a line pause, or on a rest or extender contribute nothing. A flam adds the grace stroke
 * before the main one.
 */
export function strokesAt(pulse: TimelinePulse, partIds: readonly string[]): Stroke[] {
  const strokes: Stroke[] = [];
  for (const partId of partIds) {
    const slot = pulse.parts[partId];
    if (slot === undefined || slot.kind !== 'cell' || slot.cell.kind !== 'hit') continue;
    const hit = slot.cell;
    const gainDb = pulse.gainDb + dynamicDb(hit);
    if (hit.grace !== null) {
      strokes.push({
        partId,
        sound: hit.sound,
        hand: hit.grace,
        gainDb: gainDb + GRACE_DB,
        offsetSeconds: -GRACE_LEAD_SECONDS,
        grace: true,
      });
    }
    strokes.push({ partId, sound: hit.sound, hand: hit.hand, gainDb, offsetSeconds: 0, grace: false });
  }
  return strokes;
}

/**
 * True when the metronome should click louder at `pulse`: the first cell of a group in the
 * part being followed (SPEC §4.2). Pauses, rests inside a group and silent parts are quiet
 * clicks; a rest that starts a group is still a group start.
 */
export function metronomeAccent(pulse: TimelinePulse, partId: string): boolean {
  const slot = pulse.parts[partId];
  return slot !== undefined && slot.kind === 'cell' && slot.groupStart;
}

/** Every sound id used by any hit of the piece, in first-seen order. */
export function soundIdsOf(piece: Piece): string[] {
  const ids: string[] = [];
  for (const instrument of piece.instruments) {
    for (const surface of Object.values(instrument.surfaces)) {
      if (!ids.includes(surface.sound)) ids.push(surface.sound);
    }
  }
  return ids;
}
