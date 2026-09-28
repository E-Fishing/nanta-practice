/**
 * One drill run on top of the player (SPEC §4.3): collects the pulses the engine schedules
 * and the member's taps or answers, scores them, and drives each mode's progression from the
 * loop events. Starts over every time playback starts from stopped.
 *
 * The raw run (cells, taps, fade state, gaps...) lives in a ref and is only touched from engine
 * callbacks and handlers; what React renders is a `RunResults` snapshot published from those.
 *
 * Modes:
 *  - fade:  cells hide 15% per loop (fade.ts); optional tapping, a miss reveals 10%.
 *  - gueum: hand letters hidden (stage 1), syllables too (stage 2); loops counted per stage.
 *  - gap:   3–6 cells blanked per loop; the member answers L/R/B/rest before each lands.
 *  - tap:   every hit of the part is scored (scorer.ts) with a heatmap.
 *  - cue:   only section entries are scored; the engine sounds only the lead's cue cells.
 *  - blind: everything hidden, one pass at performance tempo; then heatmap + worst lines.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { slotKey } from '../components/cellState';
import {
  answerFor,
  cellAtKey,
  chartKeysInRange,
  entryIndices,
  isEntry,
  pickGaps,
  worstLines,
  type DrillMode,
  type GapAnswer,
  type LineScore,
} from '../engine/drills';
import { createFade, fadeStep, hiddenFraction, hiddenKeys, isFullBlank, reveal, type FadeState } from '../engine/fade';
import type { PlayerSnapshot } from '../engine/player';
import {
  DEFAULT_WINDOWS,
  heatByChartCell,
  scaledWindows,
  scoreTaps,
  verdictOfTap,
  type CellHeat,
  type CellResult,
  type ScorableCell,
  type ScoreResult,
  type ScoreWindows,
  type Tap,
  type Verdict,
} from '../engine/scorer';
import type { Hand, Piece } from '../engine/types';
import type { PlayerControls } from './usePlayer';

export interface DrillOptions {
  mode: DrillMode;
  /** Taps are scored: always in tap, cue and blind; optional in fade and gueum. */
  tapping: boolean;
}

export interface LastTap {
  verdict: Verdict;
  offsetMs: number | null;
  /** performance.now() of the tap, so the pad can restart its flash. */
  at: number;
}

export interface LastAnswer {
  correct: boolean;
  expected: GapAnswer;
  given: GapAnswer;
  at: number;
}

export interface GapResult {
  loop: number;
  key: string;
  /** null = never answered before the pulse landed. */
  answer: GapAnswer | null;
  correct: boolean;
}

export interface Transition {
  loop: number;
  sectionIndex: number;
  verdict: CellResult['verdict'];
  offsetMs: number | null;
}

export type GueumStage = 1 | 2;

export interface RunResults {
  score: ScoreResult;
  heat: ReadonlyMap<string, CellHeat>;
  /** Chart cell keys currently hidden (fade, gap, blind). */
  hidden: ReadonlySet<string>;
  hiddenFraction: number;
  /** Loops played start to end with every cell hidden (fade score). */
  blankLoops: number;
  /** Loops completed in this run (kept after Stop, unlike the player's own count). */
  loops: number;
  /** Gu-eum only: loops completed in stage 1 and stage 2. */
  stageLoops: readonly [number, number];
  /** Fill the gap: every gap so far, and the ones revealed wrong this loop. */
  gapResults: readonly GapResult[];
  gapWrong: ReadonlySet<string>;
  /** Cue drill: one entry per section entry played. */
  transitions: readonly Transition[];
  /** Blind run, after the pass: the three worst lines. */
  worst: readonly LineScore[];
  /** True once the run has stopped. */
  finished: boolean;
}

export interface DrillRun extends RunResults {
  lastTap: LastTap | null;
  lastAnswer: LastAnswer | null;
  /** True once a run has started; results describe the current or last run. */
  started: boolean;
  /** Counts finished runs, so the page can save each one once. */
  finishedCount: number;
  stage: GueumStage;
  setStage: (stage: GueumStage) => void;
  tap: (hand: Hand) => void;
  /** Fill the gap: answer the next open gap. */
  answer: (answer: GapAnswer) => void;
  /** Fade: show 10% of the hidden cells again. */
  showMe: () => void;
}

/** Answers must land this long (ms, unscaled) after the gap's pulse at the latest. */
export const GAP_GRACE_MS = 45;
export const WORST_LINES = 3;

/** The mutable run, touched only from callbacks. */
interface RawRun {
  mode: DrillMode;
  cells: ScorableCell[];
  taps: Tap[];
  fade: FadeState;
  blankLoops: number;
  loops: number;
  revealedThisLoop: boolean;
  stageLoops: [number, number];
  /** Keys of every cell in the range, in chart order. */
  keys: string[];
  seed: number;
  gaps: string[];
  gapTimes: Map<string, number>;
  gapState: Map<string, { answer: GapAnswer; correct: boolean; time: number }>;
  gapResults: GapResult[];
  lastGapAnswer: { key: string; answer: GapAnswer; time: number } | null;
  finished: boolean;
}

function newRun(mode: DrillMode, keys: readonly string[], seed: number): RawRun {
  return {
    mode,
    cells: [],
    taps: [],
    fade: createFade(keys, seed),
    blankLoops: 0,
    loops: 0,
    revealedThisLoop: false,
    stageLoops: [0, 0],
    keys: [...keys],
    seed,
    gaps: mode === 'gap' ? pickGaps(keys, seed) : [],
    gapTimes: new Map(),
    gapState: new Map(),
    gapResults: [],
    lastGapAnswer: null,
    finished: false,
  };
}

/** Gaps of the current loop whose pulse has gone by unanswered. */
function missedGaps(run: RawRun, now: number, grace: number): string[] {
  return run.gaps.filter((key) => {
    if (run.gapState.has(key)) return false;
    const time = run.gapTimes.get(key);
    return time !== undefined && now > time + grace;
  });
}

function resultsOf(run: RawRun, windows: ScoreWindows, now: number): RunResults {
  const score = scoreTaps(run.cells, run.taps, windows, now);
  const heat = heatByChartCell(score);
  let hidden: ReadonlySet<string>;
  let gapWrong = new Set<string>();
  switch (run.mode) {
    case 'fade':
      hidden = hiddenKeys(run.fade);
      break;
    case 'gap': {
      const missed = new Set(missedGaps(run, now, GAP_GRACE_MS / 1000));
      hidden = new Set(run.gaps.filter((key) => !run.gapState.has(key) && !missed.has(key)));
      gapWrong = new Set([...missed, ...run.gaps.filter((key) => run.gapState.get(key)?.correct === false)]);
      break;
    }
    case 'blind':
      hidden = run.finished ? new Set() : new Set(run.keys);
      break;
    default:
      hidden = new Set();
  }
  const gapResults: GapResult[] = [...run.gapResults];
  for (const key of run.gaps) {
    const state = run.gapState.get(key);
    if (state !== undefined) gapResults.push({ loop: run.loops, key, answer: state.answer, correct: state.correct });
    else if (gapWrong.has(key)) gapResults.push({ loop: run.loops, key, answer: null, correct: false });
  }
  const transitions: Transition[] =
    run.mode === 'cue'
      ? score.cells
          .filter((cell) => cell.hand !== null)
          .map((cell) => ({
            loop: Number(cell.id.split(':')[0]),
            sectionIndex: Number(cell.chartKey.split(':')[0]),
            verdict: cell.verdict,
            offsetMs: cell.offsetMs,
          }))
      : [];
  return {
    score,
    heat,
    hidden,
    hiddenFraction: run.mode === 'fade' ? hiddenFraction(run.fade) : run.keys.length === 0 ? 0 : hidden.size / run.keys.length,
    blankLoops: run.blankLoops,
    loops: run.loops,
    stageLoops: [run.stageLoops[0], run.stageLoops[1]],
    gapResults,
    gapWrong,
    transitions,
    worst: run.mode === 'blind' && run.finished ? worstLines(heat, WORST_LINES) : [],
    finished: run.finished,
  };
}

const EMPTY_RESULTS: RunResults = resultsOf(newRun('tap', [], 0), DEFAULT_WINDOWS, 0);

export function useDrillRun(player: PlayerControls, piece: Piece, partId: string, options: DrillOptions): DrillRun {
  // The controls object is rebuilt every render; its functions are stable, so effects depend on those.
  const { snapshot, timeline, subscribePulses, subscribeLoops, now } = player;
  const runRef = useRef<RawRun>(newRun(options.mode, [], 0));
  const [results, setResults] = useState<RunResults>(EMPTY_RESULTS);
  const [lastTap, setLastTap] = useState<LastTap | null>(null);
  const [lastAnswer, setLastAnswer] = useState<LastAnswer | null>(null);
  const [started, setStarted] = useState(false);
  const [finishedCount, setFinishedCount] = useState(0);
  const [stage, setStage] = useState<GueumStage>(1);

  const windows = useMemo(
    () => scaledWindows(DEFAULT_WINDOWS, piece.pulseBpm, snapshot.bpm > 0 ? snapshot.bpm : piece.pulseBpm),
    [piece.pulseBpm, snapshot.bpm],
  );
  const entries = useMemo(() => entryIndices(timeline, partId), [timeline, partId]);

  // Callbacks from the engine read the latest props, snapshot and windows through refs.
  const optionsRef = useRef(options);
  const partRef = useRef(partId);
  const pieceRef = useRef(piece);
  const snapshotRef = useRef<PlayerSnapshot>(snapshot);
  const windowsRef = useRef(windows);
  const entriesRef = useRef(entries);
  const stageRef = useRef(stage);
  useEffect(() => {
    optionsRef.current = options;
    partRef.current = partId;
    pieceRef.current = piece;
    snapshotRef.current = snapshot;
    windowsRef.current = windows;
    entriesRef.current = entries;
    stageRef.current = stage;
  });

  const publish = useCallback((at: number) => {
    setResults(resultsOf(runRef.current, windowsRef.current, at));
  }, []);

  const rangeKeys = useMemo(() => chartKeysInRange(timeline, partId, snapshot.loopRange), [timeline, partId, snapshot.loopRange]);

  // A new run every time playback starts from stopped; a final rescore when it stops.
  const previousState = useRef(snapshot.state);
  useEffect(() => {
    if (previousState.current === 'stopped' && snapshot.state === 'playing') {
      runRef.current = newRun(optionsRef.current.mode, rangeKeys, Date.now() >>> 0);
      setLastTap(null);
      setLastAnswer(null);
      setStarted(true);
      publish(now());
    } else if (previousState.current !== 'stopped' && snapshot.state === 'stopped') {
      const run = runRef.current;
      // Gaps whose pulse had landed unanswered when the run stopped count as missed; ones
      // never reached are dropped.
      for (const key of run.gaps) {
        if (!run.gapState.has(key) && run.gapTimes.has(key)) run.gapResults.push({ loop: run.loops, key, answer: null, correct: false });
      }
      run.gaps = [];
      run.finished = true;
      publish(Number.POSITIVE_INFINITY);
      setFinishedCount((count) => count + 1);
    }
    previousState.current = snapshot.state;
  }, [snapshot.state, rangeKeys, publish, now]);

  // Every scheduled pulse of the drilled part becomes a cell to tap (or to leave alone).
  useEffect(
    () =>
      subscribePulses(({ pulse, time, loop }) => {
        const run = runRef.current;
        const slot = pulse.parts[partRef.current];
        const key = slotKey(pulse.sectionIndex, slot);
        if (key === null || slot === undefined) return;
        const hand = slot.kind === 'cell' && slot.cell.kind === 'hit' ? slot.cell.hand : null;
        // The Cue drill scores section entries only; every other pulse is just time passing.
        if (run.mode !== 'cue' || isEntry(pulse, slot, entriesRef.current)) {
          run.cells.push({ id: `${loop}:${pulse.index}`, chartKey: key, time, hand });
        }
        if (run.mode === 'gap' && run.gaps.includes(key) && !run.gapTimes.has(key)) run.gapTimes.set(key, time);
        // Windows close as pulses go by; while tapping or answering, keep the misses on screen current.
        if (optionsRef.current.tapping || run.mode === 'gap') publish(now());
      }),
    [subscribePulses, publish, now],
  );

  // Every loop hides more (fade), counts (gueum), or deals new gaps (gap).
  useEffect(
    () =>
      subscribeLoops((loopCount) => {
        const run = runRef.current;
        if (run.mode === 'fade') {
          if (isFullBlank(run.fade) && !run.revealedThisLoop) run.blankLoops += 1;
          run.fade = fadeStep(run.fade);
          run.revealedThisLoop = false;
        } else if (run.mode === 'gueum') {
          run.stageLoops[stageRef.current - 1] += 1;
        } else if (run.mode === 'gap') {
          for (const key of run.gaps) {
            const state = run.gapState.get(key);
            run.gapResults.push(state === undefined ? { loop: run.loops, key, answer: null, correct: false } : { loop: run.loops, key, answer: state.answer, correct: state.correct });
          }
          run.gaps = pickGaps(run.keys, run.seed + loopCount);
          run.gapTimes = new Map();
          run.gapState = new Map();
          run.lastGapAnswer = null;
        }
        run.loops = loopCount;
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
        if (run.mode === 'fade' && (mine.verdict === 'miss' || mine.verdict === 'wrong-hand')) {
          run.fade = reveal(run.fade);
          run.revealedThisLoop = true;
        }
      }
      publish(time);
    },
    [now, publish],
  );

  const answer = useCallback(
    (given: GapAnswer) => {
      const current = snapshotRef.current;
      const run = runRef.current;
      // Answers are allowed during the count-in: a blank on the first cell must be answered before it lands.
      if (run.mode !== 'gap' || current.state !== 'playing') return;
      const time = now();
      const expectedOf = (key: string): GapAnswer => {
        const cell = cellAtKey(pieceRef.current, partRef.current, key);
        return cell === null ? 'rest' : answerFor(cell);
      };
      // F and J inside the chord window: the previous single-hand answer becomes both hands.
      const last = run.lastGapAnswer;
      if (
        last !== null &&
        given !== 'rest' &&
        given !== 'B' &&
        last.answer !== 'rest' &&
        last.answer !== 'B' &&
        last.answer !== given &&
        (time - last.time) * 1000 <= windowsRef.current.chordMs &&
        run.gapState.has(last.key)
      ) {
        const expected = expectedOf(last.key);
        run.gapState.set(last.key, { answer: 'B', correct: expected === 'B', time: last.time });
        run.lastGapAnswer = { key: last.key, answer: 'B', time: last.time };
        setLastAnswer({ correct: expected === 'B', expected, given: 'B', at: performance.now() });
        publish(time);
        return;
      }
      const grace = GAP_GRACE_MS / 1000;
      const key = run.gaps.find((candidate) => {
        if (run.gapState.has(candidate)) return false;
        const landed = run.gapTimes.get(candidate);
        return landed === undefined || time <= landed + grace;
      });
      if (key === undefined) return;
      const expected = expectedOf(key);
      const correct = expected === given;
      run.gapState.set(key, { answer: given, correct, time });
      run.lastGapAnswer = { key, answer: given, time };
      setLastAnswer({ correct, expected, given, at: performance.now() });
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

  return { ...results, lastTap, lastAnswer, started, finishedCount, stage, setStage, tap, answer, showMe };
}
