/**
 * One drill run on top of the player (SPEC §4.3): collects the pulses the engine schedules
 * and the member's taps, scores them with `scorer.ts`, and drives the Fade progression from
 * the loop events. Starts over every time playback starts from stopped.
 *
 * The raw run (cells, taps, fade state) lives in a ref and is only touched from engine
 * callbacks and handlers; what React renders is a `RunResults` snapshot published from those.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chartCellKey, slotKey } from '../components/cellState';
import type { PulseRange } from '../engine/controls';
import { createFade, fadeStep, hiddenFraction, hiddenKeys, isFullBlank, reveal, type FadeState } from '../engine/fade';
import type { PlayerSnapshot } from '../engine/player';
import {
  DEFAULT_WINDOWS,
  heatByChartCell,
  scaledWindows,
  scoreTaps,
  verdictOfTap,
  type CellHeat,
  type ScorableCell,
  type ScoreResult,
  type ScoreWindows,
  type Tap,
  type Verdict,
} from '../engine/scorer';
import type { Hand, Piece, Timeline } from '../engine/types';
import type { PlayerControls } from './usePlayer';

export type DrillMode = 'fade' | 'tap';

export interface DrillOptions {
  mode: DrillMode;
  /** Taps are scored: always in Tap-along, optional in Fade (where a miss reveals cells). */
  tapping: boolean;
}

export interface LastTap {
  verdict: Verdict;
  offsetMs: number | null;
  /** performance.now() of the tap, so the pad can restart its flash. */
  at: number;
}

export interface RunResults {
  score: ScoreResult;
  heat: ReadonlyMap<string, CellHeat>;
  /** Chart cell keys currently hidden (Fade). */
  hidden: ReadonlySet<string>;
  hiddenFraction: number;
  /** Loops played start to end with every cell hidden (Fade score). */
  blankLoops: number;
  /** Loops completed in this run (kept after Stop, unlike the player's own count). */
  loops: number;
}

export interface DrillRun extends RunResults {
  lastTap: LastTap | null;
  /** True once a run has started; results describe the current or last run. */
  started: boolean;
  tap: (hand: Hand) => void;
  /** Fade: show 10% of the hidden cells again. */
  showMe: () => void;
}

/** The mutable run, touched only from callbacks. */
interface RawRun {
  cells: ScorableCell[];
  taps: Tap[];
  fade: FadeState;
  blankLoops: number;
  loops: number;
  revealedThisLoop: boolean;
}

function newRun(fadeKeys: readonly string[], seed: number): RawRun {
  return { cells: [], taps: [], fade: createFade(fadeKeys, seed), blankLoops: 0, loops: 0, revealedThisLoop: false };
}

function resultsOf(run: RawRun, windows: ScoreWindows, now: number): RunResults {
  const score = scoreTaps(run.cells, run.taps, windows, now);
  return {
    score,
    heat: heatByChartCell(score),
    hidden: hiddenKeys(run.fade),
    hiddenFraction: hiddenFraction(run.fade),
    blankLoops: run.blankLoops,
    loops: run.loops,
  };
}

/** Every chart cell key of `partId` inside the pulse range, once each, in chart order. */
export function chartKeysInRange(timeline: Timeline, partId: string, range: PulseRange | null): string[] {
  if (range === null) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let i = range.start; i < Math.min(range.end, timeline.totalPulses); i += 1) {
    const pulse = timeline.pulses[i];
    const slot = pulse.parts[partId];
    if (slot === undefined || slot.kind !== 'cell') continue;
    const key = chartCellKey(pulse.sectionIndex, slot.lineIndex, slot.groupIndex, slot.cellIndex);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

const EMPTY_RESULTS: RunResults = resultsOf(newRun([], 0), DEFAULT_WINDOWS, 0);

export function useDrillRun(player: PlayerControls, piece: Piece, partId: string, options: DrillOptions): DrillRun {
  // The controls object is rebuilt every render; its functions are stable, so effects depend on those.
  const { snapshot, timeline, subscribePulses, subscribeLoops, now } = player;
  const runRef = useRef<RawRun>(newRun([], 0));
  const [results, setResults] = useState<RunResults>(EMPTY_RESULTS);
  const [lastTap, setLastTap] = useState<LastTap | null>(null);
  const [started, setStarted] = useState(false);

  const windows = useMemo(
    () => scaledWindows(DEFAULT_WINDOWS, piece.pulseBpm, snapshot.bpm > 0 ? snapshot.bpm : piece.pulseBpm),
    [piece.pulseBpm, snapshot.bpm],
  );

  // Callbacks from the engine read the latest props, snapshot and windows through refs.
  const optionsRef = useRef(options);
  const partRef = useRef(partId);
  const snapshotRef = useRef<PlayerSnapshot>(snapshot);
  const windowsRef = useRef(windows);
  useEffect(() => {
    optionsRef.current = options;
    partRef.current = partId;
    snapshotRef.current = snapshot;
    windowsRef.current = windows;
  });

  const publish = useCallback((now: number) => {
    setResults(resultsOf(runRef.current, windowsRef.current, now));
  }, []);

  const fadeKeys = useMemo(() => chartKeysInRange(timeline, partId, snapshot.loopRange), [timeline, partId, snapshot.loopRange]);

  // A new run every time playback starts from stopped; a final rescore when it stops.
  const previousState = useRef(snapshot.state);
  useEffect(() => {
    if (previousState.current === 'stopped' && snapshot.state === 'playing') {
      runRef.current = newRun(fadeKeys, Date.now() >>> 0);
      setLastTap(null);
      setStarted(true);
      publish(now());
    } else if (previousState.current !== 'stopped' && snapshot.state === 'stopped') {
      publish(Number.POSITIVE_INFINITY);
    }
    previousState.current = snapshot.state;
  }, [snapshot.state, fadeKeys, publish, now]);

  // Every scheduled pulse of the drilled part becomes a cell to tap (or to leave alone).
  useEffect(
    () =>
      subscribePulses(({ pulse, time, loop }) => {
        const slot = pulse.parts[partRef.current];
        const key = slotKey(pulse.sectionIndex, slot);
        if (key === null || slot === undefined) return;
        const hand = slot.kind === 'cell' && slot.cell.kind === 'hit' ? slot.cell.hand : null;
        runRef.current.cells.push({ id: `${loop}:${pulse.index}`, chartKey: key, time, hand });
        // Windows close as pulses go by; while tapping, keep the misses on screen current.
        if (optionsRef.current.tapping) publish(now());
      }),
    [subscribePulses, publish, now],
  );

  // Every loop hides more (Fade) and counts.
  useEffect(
    () =>
      subscribeLoops((loopCount) => {
        const run = runRef.current;
        run.loops = loopCount;
        if (optionsRef.current.mode === 'fade') {
          if (isFullBlank(run.fade) && !run.revealedThisLoop) run.blankLoops += 1;
          run.fade = fadeStep(run.fade);
          run.revealedThisLoop = false;
        }
        publish(now());
      }),
    [subscribeLoops, publish, now],
  );

  const tap = useCallback(
    (hand: Hand) => {
      const current = snapshotRef.current;
      if (!optionsRef.current.tapping || current.state !== 'playing' || current.countIn !== null) return;
      const run = runRef.current;
      const time = now();
      run.taps.push({ time, hand });
      const mine = verdictOfTap(scoreTaps(run.cells, run.taps, windowsRef.current, time), time);
      if (mine !== null) {
        setLastTap({ ...mine, at: performance.now() });
        if (optionsRef.current.mode === 'fade' && (mine.verdict === 'miss' || mine.verdict === 'wrong-hand')) {
          run.fade = reveal(run.fade);
          run.revealedThisLoop = true;
        }
      }
      publish(time);
    },
    [now, publish],
  );

  const showMe = useCallback(() => {
    const run = runRef.current;
    run.fade = reveal(run.fade);
    run.revealedThisLoop = true;
    publish(now());
  }, [now, publish]);

  return { ...results, lastTap, started, tap, showMe };
}
