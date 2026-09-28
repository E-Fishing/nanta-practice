/**
 * Playback engine on Tone.Transport (SPEC.md §4.2 playback, §6 audio gotchas).
 *
 * `load()` schedules one Transport event per timeline pulse, at a fixed tick position:
 * the Transport runs at the piece's pulse BPM with one quarter note per base pulse unit, so
 * `tempoScale` sections are just longer gaps between ticks and a later tempo change
 * (`setBpm`, which ramps `Transport.bpm`) stretches playback without touching the schedule.
 * Each event sounds its strokes and the metronome at the audio time it is handed, then asks
 * `Tone.Draw` to move the highlight on the animation frame nearest that time, so the visual
 * playhead follows the audio clock and cannot drift. Never `setTimeout`/`setInterval`.
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
import { metronomeAccent, pulseTicks, SCHEDULING_BPM, soundIdsOf, strokesAt, tickTime, TRANSPORT_PPQ } from './schedule';
import { createSoundBank, type SoundBank } from './sounds';
import type { Piece, Timeline, TimelinePulse } from './types';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface PlayerSnapshot {
  /** False until a timeline is loaded; play/pause/stop do nothing meanwhile. */
  readonly loaded: boolean;
  readonly state: PlaybackState;
  /** Pulse under the playhead: null when stopped, the last one reached when paused. */
  readonly pulse: TimelinePulse | null;
  /** Current pulses per minute (the piece's `pulseBpm` until `setBpm` is called). */
  readonly bpm: number;
  readonly metronome: boolean;
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

const IDLE: PlayerSnapshot = { loaded: false, state: 'stopped', pulse: null, bpm: 0, metronome: true };

export class Player {
  private readonly transport = Tone.getTransport();
  private readonly draw = Tone.getDraw();
  private bankInstance: SoundBank | null = null;
  private readonly listeners = new Set<PlayerListener>();
  private snapshot: PlayerSnapshot = IDLE;

  private piece: Piece | null = null;
  private timeline: Timeline | null = null;
  private partIds: string[] = [];
  /** Part whose group starts get the loud metronome click. */
  private focusPartId = '';
  private eventIds: number[] = [];
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
    if (!this.partIds.includes(this.focusPartId)) this.focusPartId = this.partIds[0] ?? '';
    this.bank().prepare(soundIdsOf(piece));

    const transport = this.transport;
    // Events are stored in ticks, so schedule at the tempo where tick positions convert exactly
    // (see TRANSPORT_PPQ) and switch to the piece's tempo afterwards.
    transport.bpm.value = SCHEDULING_BPM;
    const generation = this.generation;
    for (const pulse of timeline.pulses) {
      const at = tickTime(pulseTicks(pulse.start, transport.PPQ));
      this.eventIds.push(transport.schedule((time) => this.onPulse(pulse, time, generation), at));
    }
    const end = tickTime(pulseTicks(timeline.totalUnits, transport.PPQ));
    this.eventIds.push(transport.schedule((time) => this.onEnd(time, generation), end));
    transport.bpm.value = timeline.pulseBpm;

    this.set({ loaded: true, state: 'stopped', pulse: null, bpm: timeline.pulseBpm });
  }

  /** Stop and remove every scheduled event. Voices stay built for the next piece. */
  unload(): void {
    this.stop();
    this.generation += 1;
    for (const id of this.eventIds) this.transport.clear(id);
    this.eventIds = [];
    this.piece = null;
    this.timeline = null;
    this.partIds = [];
    if (this.snapshot.loaded) this.set({ loaded: false, pulse: null, bpm: 0 });
  }

  // -- Transport callbacks (called ahead of `time`; everything is scheduled at `time`) ----

  private onPulse(pulse: TimelinePulse, time: number, generation: number): void {
    if (generation !== this.generation || this.piece === null || this.endAt !== null) return;
    // Tone's clock can hand the tick at a window boundary to both windows; play each pulse once.
    if (this.lastFired !== null && this.lastFired.index === pulse.index && Math.abs(time - this.lastFired.time) < 0.001) return;
    this.lastFired = { index: pulse.index, time };
    if (Tone.immediate() - time <= MAX_LATE_SECONDS) this.sound(pulse, time);
    this.draw.schedule(() => {
      if (generation === this.generation && this.snapshot.state === 'playing') this.set({ pulse });
    }, time);
  }

  private sound(pulse: TimelinePulse, time: number): void {
    const bank = this.bank();
    try {
      for (const stroke of strokesAt(pulse, this.partIds)) {
        // A flam pickup sits before the pulse; never earlier than the context can still play.
        const at = stroke.offsetSeconds < 0 ? Math.max(time + stroke.offsetSeconds, Tone.immediate()) : time + stroke.offsetSeconds;
        bank.voice(stroke.sound).trigger(at, stroke.hand, stroke.gainDb);
      }
      if (this.snapshot.metronome) bank.metronome(time, metronomeAccent(pulse, this.focusPartId));
    } catch (err) {
      if (!this.warnedSynth) {
        this.warnedSynth = true;
        console.warn(`Could not sound pulse ${pulse.index}; later errors of this kind are not reported.`, err);
      }
    }
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
    if (this.snapshot.state !== 'stopped') this.set({ state: 'stopped', pulse: null });
  };

  // -- Controls -------------------------------------------------------------

  /** Start from the beginning, or resume after `pause()`. Also asks the browser to unlock audio. */
  play(): void {
    if (this.timeline === null || this.snapshot.state === 'playing') return;
    if (audioState() === 'locked') void Tone.start();
    this.endAt = null;
    this.lastFired = null;
    this.transport.start();
    this.set({ state: 'playing' });
  }

  /** Hold the position; the highlight stays on the current cell. */
  pause(): void {
    if (this.snapshot.state !== 'playing') return;
    this.transport.pause();
    this.set({ state: 'paused' });
  }

  /** Back to the start with no highlight. */
  stop(): void {
    if (this.timeline === null) return;
    this.endAt = null;
    // Always stop the Transport itself, even if the snapshot already says stopped.
    if (this.transport.state !== 'stopped') this.transport.stop();
    this.draw.cancel();
    if (this.snapshot.state !== 'stopped' || this.snapshot.pulse !== null) this.set({ state: 'stopped', pulse: null });
  }

  /** Play/pause from one button. */
  toggle(): void {
    if (this.snapshot.state === 'playing') this.pause();
    else this.play();
  }

  /** Change pulses per minute. Ramps while playing so playback never restarts (SPEC §6). */
  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError(`bpm must be a positive number, got ${bpm}`);
    if (this.snapshot.state === 'playing') this.transport.bpm.rampTo(bpm, TEMPO_RAMP_SECONDS);
    else this.transport.bpm.value = bpm;
    this.set({ bpm });
  }

  setMetronome(on: boolean): void {
    if (on !== this.snapshot.metronome) this.set({ metronome: on });
  }

  /** The part whose group starts get the loud metronome click (the part on screen). */
  setFocusPart(partId: string): void {
    this.focusPartId = partId;
  }
}

let shared: Player | null = null;

/** The one player for the one Transport. Created on first use, never at import time. */
export function getPlayer(): Player {
  shared ??= new Player();
  return shared;
}
