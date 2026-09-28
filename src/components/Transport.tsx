import type { AudioState, PlaybackState } from '../engine/player';
import SoundGate from './SoundGate';
import './Transport.css';

export interface TransportStatus {
  /** Name of the section under the playhead, or null when stopped. */
  sectionName: string | null;
  /** 1-based repeat of that section; shown as "rep 3 / 8" when the section repeats. */
  rep: number;
  repeatCount: number;
  bpm: number;
}

export interface TransportProps {
  state: PlaybackState;
  audio: AudioState;
  metronome: boolean;
  status: TransportStatus;
  onToggle: () => void;
  onStop: () => void;
  onMetronome: (on: boolean) => void;
  onEnableAudio: () => Promise<AudioState>;
}

function PlayIcon() {
  return (
    <svg className="transport-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 3 L17 10 L5 17 Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="transport-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="3" width="4.5" height="14" fill="currentColor" />
      <rect x="11.5" y="3" width="4.5" height="14" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg className="transport-icon" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="4" y="4" width="12" height="12" fill="currentColor" />
    </svg>
  );
}

/** Play/pause, stop and metronome controls in a bar that sticks to the bottom of the screen (SPEC §4.2). */
export default function Transport({ state, audio, metronome, status, onToggle, onStop, onMetronome, onEnableAudio }: TransportProps) {
  const playing = state === 'playing';
  const locked = audio === 'locked';
  const showRep = status.sectionName !== null && status.repeatCount > 1;

  return (
    <div className="transport" role="group" aria-label="Playback">
      {locked ? <SoundGate onEnable={onEnableAudio} /> : null}
      <div className="transport-controls" aria-hidden={locked} inert={locked}>
        <button
          type="button"
          className="transport-button transport-button--primary"
          onClick={onToggle}
          aria-label={playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Play'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          <span className="transport-button-text">{playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Play'}</span>
        </button>
        <button type="button" className="transport-button" onClick={onStop} disabled={state === 'stopped'} aria-label="Stop">
          <StopIcon />
          <span className="transport-button-text">Stop</span>
        </button>
        <button
          type="button"
          className="transport-button transport-button--toggle"
          onClick={() => onMetronome(!metronome)}
          aria-pressed={metronome}
        >
          <span className="transport-button-text">Metronome</span>
          <span className="transport-toggle-state" aria-hidden="true">
            {metronome ? 'on' : 'off'}
          </span>
        </button>
        <p className="transport-status" aria-live="off">
          {status.sectionName === null ? (
            <span className="transport-status-section">{state === 'stopped' ? 'Ready' : '…'}</span>
          ) : (
            <span className="transport-status-section">{status.sectionName}</span>
          )}
          {showRep ? (
            <span className="transport-status-rep">
              rep {status.rep} / {status.repeatCount}
            </span>
          ) : null}
          <span className="transport-status-bpm">{Math.round(status.bpm)} BPM</span>
        </p>
      </div>
    </div>
  );
}
