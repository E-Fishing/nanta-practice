/**
 * Playback engine on Tone.Transport (SPEC.md §4.2 playback and controls, §6 audio gotchas).
 *
 * `load()` schedules one Transport event per timeline pulse, at a fixed tick position:
 * the Transport runs at the piece's pulse BPM with one quarter note per base pulse unit, so
 * `tempoScale` sections are just longer gaps between ticks and a later tempo change
 * (`setBpm`, which ramps `Transport.bpm`) stretches playback without touching the schedule.
 * Each event sounds its strokes and the metronome at the audio time it is handed, then asks
 * `Tone.Draw` to move the highlight on the animation frame nearest that time, so the visual
 * playhead follows the audio clock and cannot drift. Never `setTimeout`/`setInterval`.
 *
 * The whole schedule sits `preRollUnits()` after the Transport origin. That gap is where the
 * count-in goes: `play()` from stopped schedules four metronome clicks just before the start
 * pulse (which may be anywhere, so pulses of earlier material that fall under the count-in are
 * skipped) and starts the Transport at the first click. Loops are Transport loop points at the
 * range's tick positions; the Transport wraps itself, and the 'loop' event drives "+5 BPM
 * every loop". Seeks (← / →, a loop change) set `Transport.ticks` directly.
 *
 * Tick positions handed to Tone as strings ("384i") are converted through seconds, which is
 * exact only while the Transport is at `SCHEDULING_BPM`; every such conversion happens inside
 * `atSchedulingTempo()`. `Transport.ticks` takes raw ticks and needs no such care.
 *
 * Only the highlight rides on `Tone.Draw` (animation frames, which browsers pause in a hidden
 * tab). State changes come from the Transport's own clock: the end of the piece stops the
 * Transport and the 'stop' event it emits moves the UI to "stopped", so a phone that was
 * switched away from still comes back consistent.
 *
 * The Transport is a singleton, so the engine is one too: `getPlayer()`. Pages `load()` a
 * timeline on mount and `unload()` on unmount. React reads it through `subscribe()` +
 * `getSnapshot()` (`useSyncExternalStore`).
 *
 * Audio unlock: browsers keep the AudioContext suspended until a user gesture. `enableAudio()`
 * must be called from a click/tap handler; `audioState()` and `subscribeAudioState()` let the
 * UI show the "tap to enable sound" gate until it succeeds. `play()` also calls `Tone.start()`
 * so a first tap on Play works too.
 */
import * as Tone from 'tone';
import {
  audibleParts,
  clampBpm,
  COUNT_IN_PULSES,
  countInStarts,
  jumpLine as jumpLineIndex,
  LOOP_OFF,
  loopRange,
  preRollUnits,
  TEMPO_STEP_BPM,
  tempoRange,
  type BpmRange,
  type LoopSpec,
  type PulseRange,
} from './controls';
import { metronomeAccent, pulseTicks, SCHEDULING_BPM, soundIdsOf, strokesAt, tickTime, TRANSPORT_PPQ } from './schedule';
import { createSoundBank, type SoundBank } from './sounds';
import type { Piece, Timeline, TimelinePulse } from './types';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

/** What the count-in is showing (SPEC §4.2: four pulses of metronome, plus the section's `cueIn`). */
export interface CountInStatus {
  /** Clicks left including the current one: 4, 3, 2, 1. */
  beat: number;
  /** `cueIn` text of the section about to start; "" when it has none. */
  cueIn: string;
  sectionId: string;
}

export interface PlayerSnapshot {
  /** False until a timeline is loaded; controls do nothing meanwhile. */
  readonly loaded: boolean;
  readonly state: PlaybackState;
  /**
   * Pulse under the playhead. While playing, the one sounding now; while paused, the one to
   * resume at; while stopped, null unless a line was cued with a jump (then `cued` is true).
   */
  readonly pulse: TimelinePulse | null;
  /** True when `pulse` marks where playback will start rather than what is sounding. */
  readonly cued: boolean;
  /** Non-null during the count-in. */
  readonly countIn: CountInStatus | null;
  /** Current pulses per minute, always inside `bpmRange` (the piece's `pulseBpm` after load). */
  readonly bpm: number;
  /** Slider limits for the loaded piece (SPEC §4.2: 40% to 120% of `pulseBpm`). */
  readonly bpmRange: BpmRange;
  readonly metronome: boolean;
  readonly loop: LoopSpec;
  /** Pulse indices the loop covers, or null when not looping. */
  readonly loopRange: PulseRange | null;
  /** "+5 BPM every loop". */
  readonly stepPerLoop: boolean;
  /** Loops completed since playback started. */
  readonly loopCount: number;
  /** Muted part ids. Muted parts still highlight. */
  readonly muted: readonly string[];
  /** Soloed part id: only it sounds. Solo wins over mute. */
  readonly solo: string | null;
}

export type PlayerListener = () => void;

/** Seconds a tempo change ramps over, so it never restarts or jolts playback (SPEC §6). */
export const TEMPO_RAMP_SECONDS = 0.1;
/** How long a queued highlight update stays valid when animation frames stall. */
export const DRAW_EXPIRATION_SECONDS = 1;
/**
 * A pulse handed to the scheduler more than this late (after a main-thread stall longer than
 * the Transport lookahead) is shown but not sounded: Tone clamps past times to "now", so a
 * run of late strokes would land on one instant, mislead the player, and trip a Tone
 * assertion on any monophonic synth.
 */
export const MAX_LATE_SECONDS = 0.03;

// ---------------------------------------------------------------------------
// Audio unlock
// ---------------------------------------------------------------------------

export type AudioState = 'locked' | 'ready';

export function audioState(): AudioState {
  return Tone.getContext().state === 'running' ? 'ready' : 'locked';
}

/** How long to wait for the context to resume before reporting it still locked. */
const ENABLE_TIMEOUT_MS = 1500;

/**
 * Resume the AudioContext. Call from inside a click/tap handler. Resolves with the resulting
 * state; a browser that ignores the gesture leaves it 'locked' so the UI can ask again.
 */
export async function enableAudio(): Promise<AudioState> {
  try {
    await Promise.race([
      Tone.start(),
      // UI timeout only, not audio timing: a resume() that never settles must not hang the page.
      new Promise<void>((resolve) => setTimeout(resolve, ENABLE_TIMEOUT_MS)),
    ]);
  } catch {
    // Report the real state below.
  }
  return audioState();
}

/** Notify on AudioContext state changes (unlock, or an interruption on a phone). */
export function subscribeAudioState(listener: PlayerListener): () => void {
  const context = Tone.getContext();
  const handler = () => listener();
  context.on('statechange', handler);
  return () => {
    context.off('statechange', handler);
  };
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const NO_RANGE: BpmRange = { min: 0, max: 0 };

const IDLE: PlayerSnapshot = {
  loaded: false,
  state: 'stopped',
  pulse: null,
  cued: false,
  countIn: null,
  bpm: 0,
  bpmRange: NO_RANGE,
  metronome: true,
  loop: LOOP_OFF,
  loopRange: null,
  stepPerLoop: false,
  loopCount: 0,
  muted: [],
  solo: null,
};

/** Snapshot fields that reset when a piece is unloaded (preferences like `metronome` stay). */
const UNLOADED: Partial<PlayerSnapshot> = {
  loaded: false,
  state: 'stopped',
  pulse: null,
  cued: false,
  countIn: null,
  bpm: 0,
  bpmRange: NO_RANGE,
  loop: LOOP_OFF,
  loopRange: null,
  loopCount: 0,
  muted: [],
  solo: null,
};

export class Player {
  private readonly transport = Tone.getTransport();
  private readonly draw = Tone.getDraw();
  private bankInstance: SoundBank | null = null;
  private readonly listeners = new Set<PlayerListener>();
  private snapshot: PlayerSnapshot = IDLE;

  private piece: Piece | null = null;
  private timeline: Timeline | null = null;
  private partIds: string[] = [];
  /** Parts that sound: everything not muted, or the soloed part. */
  private audible: string[] = [];
  /** Part whose group starts get the loud metronome click and whose lines ← / → jump between. */
  private focusPartId = '';
  private eventIds: number[] = [];
  private countInIds: number[] = [];
  /** Base pulse units between the Transport origin and the first pulse (room for a count-in). */
  private preRoll = 0;
  /** Pulse range of the current loop, or null. */
  private range: PulseRange | null = null;
  /** Index of the last pulse handed to the scheduler, or the target of the last seek. */
  private position = 0;
  /** Where `play()` from stopped begins after a jump; null means the loop start or the top. */
  private cueIndex: number | null = null;
  /** Set during a count-in: pulses before `startIndex` are under the count-in and stay silent. */
  private countIn: { startIndex: number } | null = null;
  /** Bumped on every load/unload so late Draw callbacks from an old timeline are ignored. */
  private generation = 0;
  /** Audio time of the end-of-piece event once it has fired; null while playing or idle. */
  private endAt: number | null = null;
  /** Last pulse event handled, to drop the duplicate Tone occasionally fires for one tick. */
  private lastFired: { index: number; time: number } | null = null;
  /** First synth error is reported once; a throw inside a tick callback must never abort the clock. */
  private warnedSynth = false;

  constructor() {
    this.transport.PPQ = TRANSPORT_PPQ;
    this.transport.on('stop', this.onTransportStop);
    this.transport.on('loop', this.onTransportLoop);
    // Draw drops callbacks older than this when animation frames stall (a janky scroll, a tab
    // briefly hidden). A late highlight that catches up beats one stuck on the previous cell.
    this.draw.expiration = DRAW_EXPIRATION_SECONDS;
  }

  /** Voices are built on first load, never at import time. */
  private bank(): SoundBank {
    this.bankInstance ??= createSoundBank();
    return this.bankInstance;
  }

  // -- React store ----------------------------------------------------------

  readonly subscribe = (listener: PlayerListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): PlayerSnapshot => this.snapshot;

  private set(patch: Partial<PlayerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  // -- Loading --------------------------------------------------------------

  /** Schedule `timeline` on the Transport. Stops and clears anything loaded before. */
  load(piece: Piece, timeline: Timeline): void {
    this.unload();
    this.piece = piece;
    this.timeline = timeline;
    this.partIds = piece.parts.map((part) => part.id);
    this.audible = audibleParts(this.partIds, [], null);
    if (!this.partIds.includes(this.focusPartId)) this.focusPartId = this.partIds[0] ?? '';
    this.preRoll = preRollUnits(timeline);
    this.bank().prepare(soundIdsOf(piece));

    const transport = this.transport;
    // Events are stored in ticks, so schedule at the tempo where tick positions convert exactly
    // (see TRANSPORT_PPQ) and switch to the piece's tempo afterwards.
    transport.bpm.value = SCHEDULING_BPM;
    const generation = this.generation;
    for (const pulse of timeline.pulses) {
      const at = tickTime(this.tickOf(pulse.start));
      this.eventIds.push(transport.schedule((time) => this.onPulse(pulse, time, generation), at));
    }
    const end = tickTime(this.tickOf(timeline.totalUnits));
    this.eventIds.push(transport.schedule((time) => this.onEnd(time, generation), end));
    transport.bpm.value = timeline.pulseBpm;

    this.set({
      loaded: true,
      state: 'stopped',
      pulse: null,
      cued: false,
      countIn: null,
      bpm: timeline.pulseBpm,
      bpmRange: tempoRange(timeline.pulseBpm),
      loop: LOOP_OFF,
      loopRange: null,
      loopCount: 0,
      muted: [],
      solo: null,
    });
  }

  /** Stop and remove every scheduled event. Voices stay built for the next piece. */
  unload(): void {
    this.stop();
    this.generation += 1;
    for (const id of this.eventIds) this.transport.clear(id);
    this.eventIds = [];
    this.transport.loop = false;
    this.piece = null;
    this.timeline = null;
    this.partIds = [];
    this.audible = [];
    this.range = null;
    this.position = 0;
    if (this.snapshot.loaded) this.set(UNLOADED);
  }

  /** Transport tick of a timeline position in base pulse units (after the pre-roll). */
  private tickOf(units: number): number {
    return pulseTicks(this.preRoll + units, this.transport.PPQ);
  }

  /**
   * Run `fn` with the Transport at `SCHEDULING_BPM`, where "Ni" strings convert to ticks exactly,
   * then restore the current tempo. While playing this cancels an in-flight tempo ramp (a jump of
   * at most a slider step); the clock itself is not disturbed.
   */
  private atSchedulingTempo(fn: () => void): void {
    const bpm = this.transport.bpm;
    bpm.value = SCHEDULING_BPM;
    try {
      fn();
    } finally {
      bpm.value = this.snapshot.bpm > 0 ? this.snapshot.bpm : (this.timeline?.pulseBpm ?? SCHEDULING_BPM);
    }
  }

  // -- Transport callbacks (called ahead of `time`; everything is scheduled at `time`) ----

  private onPulse(pulse: TimelinePulse, time: number, generation: number): void {
    if (generation !== this.generation || this.piece === null || this.endAt !== null) return;
    if (this.countIn !== null) {
      // Earlier material under the count-in stays silent; the start pulse ends the count-in.
      if (pulse.index < this.countIn.startIndex) return;
      this.countIn = null;
    }
    // Tone's clock can hand the tick at a window boundary to both windows; play each pulse once.
    if (this.lastFired !== null && this.lastFired.index === pulse.index && Math.abs(time - this.lastFired.time) < 0.001) return;
    this.lastFired = { index: pulse.index, time };
    this.position = pulse.index;
    if (Tone.immediate() - time <= MAX_LATE_SECONDS) this.sound(pulse, time);
    this.draw.schedule(() => {
      if (generation === this.generation && this.snapshot.state === 'playing') this.set({ pulse, cued: false, countIn: null });
    }, time);
  }

  private sound(pulse: TimelinePulse, time: number): void {
    const bank = this.bank();
    try {
      for (const stroke of strokesAt(pulse, this.audible)) {
        // A flam pickup sits before the pulse; never earlier than the context can still play.
        const at = stroke.offsetSeconds < 0 ? Math.max(time + stroke.offsetSeconds, Tone.immediate()) : time + stroke.offsetSeconds;
        bank.voice(stroke.sound).trigger(at, stroke.hand, stroke.gainDb);
      }
      if (this.snapshot.metronome) bank.metronome(time, metronomeAccent(pulse, this.focusPartId));
    } catch (err) {
      this.warnSynth(pulse.index, err);
    }
  }

  private warnSynth(index: number, err: unknown): void {
    if (this.warnedSynth) return;
    this.warnedSynth = true;
    console.warn(`Could not sound pulse ${index}; later errors of this kind are not reported.`, err);
  }

  /** One count-in click. Always sounds, whatever the metronome toggle says: it is the count. */
  private onCountIn(beat: number, status: Omit<CountInStatus, 'beat'>, time: number, generation: number): void {
    if (generation !== this.generation || this.countIn === null || this.endAt !== null) return;
    if (Tone.immediate() - time <= MAX_LATE_SECONDS) {
      try {
        this.bank().metronome(time, beat === COUNT_IN_PULSES);
      } catch (err) {
        this.warnSynth(-beat, err);
      }
    }
    this.draw.schedule(() => {
      if (generation === this.generation && this.snapshot.state === 'playing' && this.snapshot.countIn !== null) {
        this.set({ countIn: { ...status, beat } });
      }
    }, time);
  }

  private onEnd(time: number, generation: number): void {
    if (generation !== this.generation || this.endAt !== null) return;
    this.endAt = time;
    // Stop at the clock's next update rather than at `time`: a stop inside the tick being
    // processed resets the tick counter mid-window and Tone then fires tick 0 again. Nothing
    // is scheduled after the end tick, so the few extra milliseconds are silent.
    this.transport.stop(this.transport.now());
  }

  /** From the Transport clock, so it also fires in a hidden tab where Draw callbacks expire. */
  private readonly onTransportStop = (): void => {
    if (this.endAt === null) return;
    this.endAt = null;
    this.countIn = null;
    this.cueIndex = null;
    this.clearCountIn();
    if (this.snapshot.state !== 'stopped') this.set({ state: 'stopped', pulse: null, cued: false, countIn: null, loopCount: 0 });
  };

  /** The Transport wrapped to the loop start at audio time `time`. */
  private readonly onTransportLoop = (time: number): void => {
    if (this.timeline === null || this.snapshot.state !== 'playing') return;
    let bpm = this.snapshot.bpm;
    if (this.snapshot.stepPerLoop) {
      const next = clampBpm(bpm + TEMPO_STEP_BPM, this.snapshot.bpmRange);
      if (next !== bpm) {
        this.transport.bpm.rampTo(next, TEMPO_RAMP_SECONDS, time);
        bpm = next;
      }
    }
    this.set({ loopCount: this.snapshot.loopCount + 1, bpm });
  };

  // -- Controls -------------------------------------------------------------

  /**
   * Resume after `pause()`, or start from stopped: four count-in clicks, then the cued line,
   * the loop start, or the top of the piece. Also asks the browser to unlock audio.
   */
  play(): void {
    if (this.timeline === null || this.snapshot.state === 'playing') return;
    if (audioState() === 'locked') void Tone.start();
    this.endAt = null;
    this.lastFired = null;
    if (this.snapshot.state === 'paused') {
      this.transport.start();
      this.set({ state: 'playing' });
      return;
    }
    const startIndex = this.startIndex();
    const status = this.countInStatus(startIndex);
    this.beginCountIn(startIndex, status);
    this.transport.start();
    this.set({
      state: 'playing',
      pulse: this.timeline.pulses[startIndex],
      cued: true,
      countIn: { ...status, beat: COUNT_IN_PULSES },
      loopCount: 0,
    });
  }

  /** Where `play()` from stopped begins. */
  private startIndex(): number {
    return this.cueIndex ?? this.range?.start ?? 0;
  }

  private countInStatus(startIndex: number): Omit<CountInStatus, 'beat'> {
    const pulse = this.timeline!.pulses[startIndex];
    const section = this.piece!.sections[pulse.sectionIndex];
    return { cueIn: section.cueIn, sectionId: section.id };
  }

  /** Schedule the count-in clicks before `startIndex` and park the Transport on the first one. */
  private beginCountIn(startIndex: number, status: Omit<CountInStatus, 'beat'>): void {
    const timeline = this.timeline!;
    this.countIn = { startIndex };
    this.position = startIndex;
    const generation = this.generation;
    const starts = countInStarts(timeline, startIndex);
    this.atSchedulingTempo(() => {
      starts.forEach((units, i) => {
        const beat = COUNT_IN_PULSES - i;
        const at = tickTime(this.tickOf(units));
        this.countInIds.push(this.transport.scheduleOnce((time) => this.onCountIn(beat, status, time, generation), at));
      });
    });
    // Raw ticks: no unit conversion, so this is exact at any tempo.
    this.transport.ticks = this.tickOf(starts[0]);
  }

  private clearCountIn(): void {
    for (const id of this.countInIds) this.transport.clear(id);
    this.countInIds = [];
  }

  /** Hold the position; the highlight stays on the current cell. */
  pause(): void {
    if (this.snapshot.state !== 'playing') return;
    this.transport.pause();
    this.set({ state: 'paused' });
  }

  /** Back to the start (of the loop, if any) with no highlight. Clears a cued line. */
  stop(): void {
    if (this.timeline === null) return;
    this.endAt = null;
    this.countIn = null;
    this.cueIndex = null;
    this.clearCountIn();
    // Always stop the Transport itself, even if the snapshot already says stopped.
    if (this.transport.state !== 'stopped') this.transport.stop();
    this.draw.cancel();
    this.position = this.range?.start ?? 0;
    if (this.snapshot.state !== 'stopped' || this.snapshot.pulse !== null || this.snapshot.countIn !== null) {
      this.set({ state: 'stopped', pulse: null, cued: false, countIn: null, loopCount: 0 });
    }
  }

  /** Play/pause from one button. */
  toggle(): void {
    if (this.snapshot.state === 'playing') this.pause();
    else this.play();
  }

  /**
   * Change pulses per minute, clamped to the slider range. Ramps while playing so playback
   * never restarts (SPEC §6).
   */
  setBpm(bpm: number): void {
    if (this.timeline === null) return;
    const next = clampBpm(bpm, this.snapshot.bpmRange);
    if (next === this.snapshot.bpm) return;
    if (this.snapshot.state === 'playing') this.transport.bpm.rampTo(next, TEMPO_RAMP_SECONDS);
    else this.transport.bpm.value = next;
    this.set({ bpm: next });
  }

  /** `[` / `]`: tempo down or up by `TEMPO_STEP_BPM` times `steps`. */
  stepBpm(steps: number): void {
    this.setBpm(this.snapshot.bpm + steps * TEMPO_STEP_BPM);
  }

  /** "+5 BPM every loop". */
  setStepPerLoop(on: boolean): void {
    if (on !== this.snapshot.stepPerLoop) this.set({ stepPerLoop: on });
  }

  setMetronome(on: boolean): void {
    if (on !== this.snapshot.metronome) this.set({ metronome: on });
  }

  /**
   * Loop a section, a line range of a part, the whole piece, or nothing. While playing outside
   * the new range the playhead moves to its start; a count-in aimed outside it starts over.
   *
   * @throws RangeError for a spec the loaded piece cannot satisfy (see `loopRange`).
   */
  setLoop(spec: LoopSpec): void {
    if (this.timeline === null) return;
    const range = loopRange(this.timeline, spec);
    this.range = range;
    this.applyLoopPoints(range);
    if (range !== null && this.cueIndex !== null && !inRange(this.cueIndex, range)) this.cueIndex = null;

    if (this.snapshot.state === 'stopped') {
      this.position = this.startIndex();
      const pulse = this.cueIndex === null ? null : this.timeline.pulses[this.cueIndex];
      this.set({ loop: spec, loopRange: range, pulse, cued: pulse !== null });
    } else if (range !== null && this.countIn !== null && !inRange(this.countIn.startIndex, range)) {
      this.set({ loop: spec, loopRange: range });
      this.stop();
      this.play();
    } else {
      this.set({ loop: spec, loopRange: range });
      if (range !== null && !inRange(this.position, range)) this.seek(range.start);
    }
  }

  private applyLoopPoints(range: PulseRange | null): void {
    const transport = this.transport;
    if (range === null || this.timeline === null) {
      transport.loop = false;
      return;
    }
    const timeline = this.timeline;
    const startUnits = timeline.pulses[range.start].start;
    const endUnits = range.end >= timeline.totalPulses ? timeline.totalUnits : timeline.pulses[range.end].start;
    this.atSchedulingTempo(() => {
      transport.loopStart = tickTime(this.tickOf(startUnits));
      transport.loopEnd = tickTime(this.tickOf(endUnits));
    });
    transport.loop = true;
  }

  /**
   * ← / →: to the start of the previous or next chart line of the part being followed, inside
   * the loop if one is set. While stopped this cues the line for the next `play()`.
   */
  jumpLine(delta: number): void {
    if (this.timeline === null || this.countIn !== null) return;
    const range = this.range ?? { start: 0, end: this.timeline.totalPulses };
    const from = this.snapshot.state === 'stopped' ? this.startIndex() : this.position;
    this.seek(jumpLineIndex(this.timeline, this.focusPartId, from, delta, range));
  }

  /** Move the playhead to pulse `index` without a count-in. */
  private seek(index: number): void {
    const timeline = this.timeline!;
    const pulse = timeline.pulses[index];
    this.position = index;
    this.lastFired = null;
    switch (this.snapshot.state) {
      case 'playing':
        // The highlight follows when the pulse's event fires at its new time.
        this.transport.ticks = this.tickOf(pulse.start);
        break;
      case 'paused':
        this.transport.ticks = this.tickOf(pulse.start);
        this.set({ pulse, cued: true });
        break;
      case 'stopped':
        this.cueIndex = index;
        this.set({ pulse, cued: true });
        break;
    }
  }

  /** Mute or unmute a part. Muted parts still highlight (SPEC §4.2). */
  setMuted(partId: string, on: boolean): void {
    const muted = on ? Array.from(new Set([...this.snapshot.muted, partId])) : this.snapshot.muted.filter((id) => id !== partId);
    this.audible = audibleParts(this.partIds, muted, this.snapshot.solo);
    this.set({ muted });
  }

  /** Solo a part (only it sounds; solo wins over mute), or null to clear. */
  setSolo(partId: string | null): void {
    this.audible = audibleParts(this.partIds, this.snapshot.muted, partId);
    this.set({ solo: partId });
  }

  /**
   * The part on screen: its group starts get the loud metronome click and ← / → move between
   * its lines.
   */
  setFocusPart(partId: string): void {
    this.focusPartId = partId;
  }
}

function inRange(index: number, range: PulseRange): boolean {
  return index >= range.start && index < range.end;
}

let shared: Player | null = null;

/** The one player for the one Transport. Created on first use, never at import time. */
export function getPlayer(): Player {
  shared ??= new Player();
  return shared;
}
