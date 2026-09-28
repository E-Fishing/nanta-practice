/**
 * Tap timing evaluation for the drills (SPEC.md §4.3 Tap-along, Blind run, Cue drill).
 *
 * Pure: the drill page records when each pulse of the loop sounds (audio-clock seconds from
 * the player) and when the member taps (same clock), and asks `scoreTaps()` for verdicts.
 * Everything is recomputed from the full lists each time, so a tap that lands before its
 * pulse has even been scheduled is simply scored on the next call.
 *
 * Windows (§4.3): on time within ±ON_TIME_MS, early/late within ±NEAR_MS, else a miss. Taps
 * on a rest, an extender or a line pause are misses. Windows scale with tempo
 * (`scaledWindows`): slow practice is not artificially easy. The §6 reality check applies:
 * at 325 pulses/min a pulse is 185 ms, so ±110 ms is already most of a pulse; tighten the
 * constants here when the club is ready.
 */
import type { Hand } from './types';

export interface ScoreWindows {
  /** |offset| at or under this is on time. */
  onTimeMs: number;
  /** |offset| at or under this is early or late; beyond it the tap misses. */
  nearMs: number;
  /** Two taps of different hands this close together are one both-hands tap. Not tempo-scaled. */
  chordMs: number;
}

export const DEFAULT_WINDOWS: ScoreWindows = { onTimeMs: 45, nearMs: 110, chordMs: 40 };

/** Weight of an early or late hit in the accuracy figure (on time = 1, miss = 0). */
export const NEAR_CREDIT = 0.5;

/** Windows for the current tempo: multiplied by `pulseBpm / currentBpm` (§4.3). */
export function scaledWindows(windows: ScoreWindows, pulseBpm: number, currentBpm: number): ScoreWindows {
  if (!(pulseBpm > 0) || !(currentBpm > 0)) throw new RangeError(`tempos must be positive, got ${pulseBpm} and ${currentBpm}`);
  const factor = pulseBpm / currentBpm;
  return { onTimeMs: windows.onTimeMs * factor, nearMs: windows.nearMs * factor, chordMs: windows.chordMs };
}

/** One member tap. `time` is in audio-clock seconds, like the cell times. */
export interface Tap {
  time: number;
  hand: Hand;
}

/** One sounding (or silent) pulse of the run, in time order. */
export interface ScorableCell {
  /** Unique per pulse instance, e.g. "loop:index". */
  id: string;
  /** Chart position, shared by every repeat of the same cell (for the heatmap). */
  chartKey: string;
  time: number;
  /** Hand of the hit, or null for a rest, extender or line pause. */
  hand: Hand | null;
}

export type Verdict = 'on-time' | 'early' | 'late' | 'wrong-hand' | 'miss';

export interface CellResult {
  id: string;
  chartKey: string;
  time: number;
  hand: Hand | null;
  /**
   * Hit cells: a verdict once tapped or once their window has passed, 'pending' before that.
   * Silent cells: 'miss' when tapped on, 'untapped' otherwise.
   */
  verdict: Verdict | 'pending' | 'untapped';
  /** Tap time minus cell time in ms (negative = rushing), or null without a tap. */
  offsetMs: number | null;
  tapHand: Hand | null;
}

/** A tap that matched no hit cell: on a silent cell (`chartKey` set) or nowhere near one. */
export interface ExtraTap extends Tap {
  chartKey: string | null;
}

export interface ScoreSummary {
  /** Hit cells whose window has passed (tapped or not). */
  due: number;
  onTime: number;
  early: number;
  late: number;
  wrongHand: number;
  /** Due hit cells never tapped. */
  missed: number;
  /** Taps that matched no hit cell. */
  extra: number;
  /** (onTime + NEAR_CREDIT × (early + late)) / (due + extra); 0 with nothing to score. */
  accuracy: number;
}

export interface ScoreResult {
  cells: CellResult[];
  extraTaps: ExtraTap[];
  summary: ScoreSummary;
}

/** Fold two taps of different hands within `chordMs` into one both-hands tap at the first time. */
export function mergeChords(taps: readonly Tap[], chordMs: number): Tap[] {
  const sorted = [...taps].sort((a, b) => a.time - b.time);
  const merged: Tap[] = [];
  for (const tap of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.hand !== 'B' && tap.hand !== 'B' && last.hand !== tap.hand && (tap.time - last.time) * 1000 <= chordMs) {
      merged[merged.length - 1] = { time: last.time, hand: 'B' };
    } else {
      merged.push({ time: tap.time, hand: tap.hand });
    }
  }
  return merged;
}

/** Index of the first cell whose time is >= `time` (cells sorted by time). */
function lowerBound(cells: readonly ScorableCell[], time: number): number {
  let lo = 0;
  let hi = cells.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cells[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Score `taps` against `cells`. Each tap (chords merged) claims the nearest unclaimed hit cell
 * of its own hand within ±nearMs, or failing that the nearest unclaimed hit cell of any hand
 * (a wrong-hand verdict); with none it is an extra tap, attributed to the nearest silent cell
 * within that window when there is one. Hit cells still unclaimed are missed once `now` is
 * past their window, pending until then.
 */
export function scoreTaps(cells: readonly ScorableCell[], taps: readonly Tap[], windows: ScoreWindows, now: number): ScoreResult {
  const sorted = [...cells].sort((a, b) => a.time - b.time);
  const near = windows.nearMs / 1000;
  const results = new Map<string, CellResult>();
  for (const cell of sorted) {
    results.set(cell.id, {
      id: cell.id,
      chartKey: cell.chartKey,
      time: cell.time,
      hand: cell.hand,
      verdict: cell.hand === null ? 'untapped' : 'pending',
      offsetMs: null,
      tapHand: null,
    });
  }
  const claimed = new Set<string>();
  const extraTaps: ExtraTap[] = [];

  for (const tap of mergeChords(taps, windows.chordMs)) {
    let bestSame: ScorableCell | null = null;
    let bestAny: ScorableCell | null = null;
    let bestSilent: ScorableCell | null = null;
    const nearer = (cell: ScorableCell, than: ScorableCell | null) => than === null || Math.abs(cell.time - tap.time) < Math.abs(than.time - tap.time);
    // Only cells within the window can matter; they sit around the tap in the sorted list.
    // Ascending order plus strict "<" means the earlier cell wins an exact tie.
    for (let i = lowerBound(sorted, tap.time - near); i < sorted.length && sorted[i].time <= tap.time + near; i += 1) {
      const cell = sorted[i];
      if (cell.hand === null) {
        if (nearer(cell, bestSilent)) bestSilent = cell;
      } else if (!claimed.has(cell.id)) {
        if (nearer(cell, bestAny)) bestAny = cell;
        if (cell.hand === tap.hand && nearer(cell, bestSame)) bestSame = cell;
      }
    }
    const bestHit = bestSame ?? bestAny;

    if (bestHit === null) {
      extraTaps.push({ ...tap, chartKey: bestSilent?.chartKey ?? null });
      if (bestSilent !== null) {
        const result = results.get(bestSilent.id)!;
        result.verdict = 'miss';
        result.tapHand = tap.hand;
        result.offsetMs = (tap.time - bestSilent.time) * 1000;
      }
      continue;
    }

    claimed.add(bestHit.id);
    const offsetMs = (tap.time - bestHit.time) * 1000;
    const result = results.get(bestHit.id)!;
    result.offsetMs = offsetMs;
    result.tapHand = tap.hand;
    if (tap.hand !== bestHit.hand) result.verdict = 'wrong-hand';
    else if (Math.abs(offsetMs) <= windows.onTimeMs) result.verdict = 'on-time';
    else result.verdict = offsetMs < 0 ? 'early' : 'late';
  }

  const summary: ScoreSummary = { due: 0, onTime: 0, early: 0, late: 0, wrongHand: 0, missed: 0, extra: extraTaps.length, accuracy: 0 };
  for (const cell of sorted) {
    const result = results.get(cell.id)!;
    if (cell.hand === null) continue;
    if (result.verdict === 'pending') {
      if (now - cell.time > near) result.verdict = 'miss';
      else continue;
    }
    summary.due += 1;
    switch (result.verdict) {
      case 'on-time':
        summary.onTime += 1;
        break;
      case 'early':
        summary.early += 1;
        break;
      case 'late':
        summary.late += 1;
        break;
      case 'wrong-hand':
        summary.wrongHand += 1;
        break;
      default:
        summary.missed += 1;
    }
  }
  summary.accuracy = accuracyOf(summary);
  return { cells: sorted.map((cell) => results.get(cell.id)!), extraTaps, summary };
}

/**
 * What became of the tap made at `tapTime` (for the pad's flash): its verdict and offset, or
 * null when the tap was folded into a chord with an earlier tap (that one carries the verdict).
 */
export function verdictOfTap(result: ScoreResult, tapTime: number): { verdict: Verdict; offsetMs: number | null } | null {
  const epsilon = 0.0005;
  for (const cell of result.cells) {
    if (cell.offsetMs === null || cell.verdict === 'pending' || cell.verdict === 'untapped') continue;
    if (Math.abs(cell.time + cell.offsetMs / 1000 - tapTime) < epsilon) return { verdict: cell.verdict, offsetMs: cell.hand === null ? null : cell.offsetMs };
  }
  for (const extra of result.extraTaps) {
    if (Math.abs(extra.time - tapTime) < epsilon) return { verdict: 'miss', offsetMs: null };
  }
  return null;
}

export function accuracyOf(summary: Pick<ScoreSummary, 'due' | 'onTime' | 'early' | 'late' | 'extra'>): number {
  const scored = summary.due + summary.extra;
  if (scored === 0) return 0;
  return (summary.onTime + NEAR_CREDIT * (summary.early + summary.late)) / scored;
}

/** Heatmap figures for one chart cell across every repeat and loop it was played. */
export interface CellHeat {
  /** Hit-cell instances with a verdict (not pending). */
  due: number;
  onTime: number;
  early: number;
  late: number;
  wrongHand: number;
  missed: number;
  /** Taps that landed on this silent cell. */
  extra: number;
  /** Mean offset over matched taps in ms, or null with none. Negative = rushing. */
  meanOffsetMs: number | null;
}

/** Fold a result down to the chart: one entry per chart cell that was due or tapped. */
export function heatByChartCell(result: ScoreResult): Map<string, CellHeat> {
  const heat = new Map<string, CellHeat>();
  const entry = (key: string): CellHeat => {
    let value = heat.get(key);
    if (value === undefined) {
      value = { due: 0, onTime: 0, early: 0, late: 0, wrongHand: 0, missed: 0, extra: 0, meanOffsetMs: null };
      heat.set(key, value);
    }
    return value;
  };
  const offsets = new Map<string, number[]>();
  for (const cell of result.cells) {
    if (cell.hand === null) {
      if (cell.verdict === 'miss') entry(cell.chartKey).extra += 1;
      continue;
    }
    if (cell.verdict === 'pending') continue;
    const value = entry(cell.chartKey);
    value.due += 1;
    if (cell.verdict === 'on-time') value.onTime += 1;
    else if (cell.verdict === 'early') value.early += 1;
    else if (cell.verdict === 'late') value.late += 1;
    else if (cell.verdict === 'wrong-hand') value.wrongHand += 1;
    else value.missed += 1;
    if (cell.offsetMs !== null && cell.verdict !== 'wrong-hand') {
      const list = offsets.get(cell.chartKey) ?? [];
      list.push(cell.offsetMs);
      offsets.set(cell.chartKey, list);
    }
  }
  for (const [key, list] of offsets) {
    entry(key).meanOffsetMs = list.reduce((sum, v) => sum + v, 0) / list.length;
  }
  return heat;
}

/** Accuracy of one chart cell's heat, on the same scale as the summary. */
export function heatAccuracy(heat: CellHeat): number {
  return accuracyOf({ due: heat.due, onTime: heat.onTime, early: heat.early, late: heat.late, extra: heat.extra });
}
