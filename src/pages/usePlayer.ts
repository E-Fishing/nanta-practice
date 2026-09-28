/**
 * React binding for the playback engine (SPEC §6: "React state + a usePlayer hook wrapping Tone").
 * Loads the piece's timeline into the shared player for the life of the component and exposes
 * the engine's snapshot through `useSyncExternalStore`, plus the audio-unlock state and every
 * control of SPEC §4.2.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { LoopSpec } from '../engine/controls';
import { expandPiece } from '../engine/expand';
import {
  audioState,
  enableAudio,
  getPlayer,
  subscribeAudioState,
  type AudioState,
  type PlayerSnapshot,
} from '../engine/player';
import type { Piece, Timeline } from '../engine/types';

export interface PlayerControls {
  snapshot: PlayerSnapshot;
  timeline: Timeline;
  audio: AudioState;
  /** Call from a click/tap handler; resolves with the resulting audio state. */
  enableAudio: () => Promise<AudioState>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
  setMetronome: (on: boolean) => void;
  /** Pulses per minute; clamped to `snapshot.bpmRange`. */
  setBpm: (bpm: number) => void;
  /** Tempo by whole steps of `TEMPO_STEP_BPM` (`[` / `]`). */
  stepBpm: (steps: number) => void;
  setStepPerLoop: (on: boolean) => void;
  setLoop: (spec: LoopSpec) => void;
  setMuted: (partId: string, on: boolean) => void;
  setSolo: (partId: string | null) => void;
  /** ← / →: one chart line back or forward. */
  jumpLine: (delta: number) => void;
}

/**
 * Drive playback of `piece`. `focusPartId` is the part on screen: its group starts get the
 * loud metronome click and line jumps follow its lines. Reloading happens only when `piece` changes.
 */
export function usePlayer(piece: Piece, focusPartId: string): PlayerControls {
  const player = getPlayer();
  const timeline = useMemo(() => expandPiece(piece), [piece]);

  useEffect(() => {
    player.load(piece, timeline);
    return () => {
      player.unload();
    };
  }, [player, piece, timeline]);

  useEffect(() => {
    player.setFocusPart(focusPartId);
  }, [player, focusPartId]);

  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  const audio = useSyncExternalStore(subscribeAudioState, audioState);

  const controls = useMemo(
    () => ({
      enableAudio,
      play: () => player.play(),
      pause: () => player.pause(),
      stop: () => player.stop(),
      toggle: () => player.toggle(),
      setMetronome: (on: boolean) => player.setMetronome(on),
      setBpm: (bpm: number) => player.setBpm(bpm),
      stepBpm: (steps: number) => player.stepBpm(steps),
      setStepPerLoop: (on: boolean) => player.setStepPerLoop(on),
      setLoop: (spec: LoopSpec) => player.setLoop(spec),
      setMuted: (partId: string, on: boolean) => player.setMuted(partId, on),
      setSolo: (partId: string | null) => player.setSolo(partId),
      jumpLine: (delta: number) => player.jumpLine(delta),
    }),
    [player],
  );

  return { snapshot, timeline, audio, ...controls };
}
