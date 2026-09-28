/**
 * React binding for the playback engine (SPEC §6: "React state + a usePlayer hook wrapping Tone").
 * Loads the piece's timeline into the shared player for the life of the component and exposes
 * the engine's snapshot through `useSyncExternalStore`, plus the audio-unlock state.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
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
}

/**
 * Drive playback of `piece`. `focusPartId` is the part on screen: its group starts get the
 * loud metronome click. Reloading happens only when `piece` changes.
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

  const play = useCallback(() => player.play(), [player]);
  const pause = useCallback(() => player.pause(), [player]);
  const stop = useCallback(() => player.stop(), [player]);
  const toggle = useCallback(() => player.toggle(), [player]);
  const setMetronome = useCallback((on: boolean) => player.setMetronome(on), [player]);

  return { snapshot, timeline, audio, enableAudio, play, pause, stop, toggle, setMetronome };
}
