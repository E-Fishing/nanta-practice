import type { ReactNode, Ref } from 'react';
import type { AudioState, CountInStatus, PlaybackState } from '../engine/player';
import CountIn from './CountIn';
import SoundGate from './SoundGate';
import './Transport.css';

export interface TransportStatus {
  /** Name of the section under the playhead, or null when stopped. */
  sectionName: string | null;
  /** 1-based repeat of that section; shown as "rep 3 / 8" when the section repeats. */
  rep: number;
  repeatCount: number;
  /** True when a loop is set; `loopCount` loops have wrapped since play. */
  looping: boolean;
  loopCount: number;
}

export interface TransportProps {
  /** The bar's element, so the page can measure how much of the viewport it covers. */
  ref?: Ref<HTMLDivElement>;
  state: PlaybackState;
  audio: AudioState;
  metronome: boolean;
  status: TransportStatus;
  /** Shown in place of the status during the count-in. */
  countIn?: { status: CountInStatus; sectionName: string } | null;
  onToggle: () => void;
  onStop: () => void;
  onMetronome: (on: boolean) => void;
  onEnableAudio: () => Promise<AudioState>;
  /** A second row of controls (the tempo control). */
  children?: ReactNode;
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

/** Play/pause, stop, metronome and status in a bar that sticks to the bottom of the screen (SPEC §4.2). */
export default function Transport({
  ref,
  state,
  audio,
  metronome,
  status,
  countIn = null,
  onToggle,
  onStop,
  onMetronome,
  onEnableAudio,
  children,
}: TransportProps) {
  const playing = state === 'playing';
  const locked = audio === 'locked';
  const showRep = status.sectionName !== null && status.repeatCount > 1;
  const playLabel = playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Play';

  return (
    <div className="transport" role="group" aria-label="Playback" ref={ref}>
      {locked ? <SoundGate onEnable={onEnableAudio} /> : null}
      <div className="transport-controls" aria-hidden={locked} inert={locked}>
        <button type="button" className="transport-button transport-button--primary" onClick={onToggle} aria-label={playLabel}>
          {playing ? <PauseIcon /> : <PlayIcon />}
          <span className="transport-button-text">{playLabel}</span>
        </button>
        <button type="button" className="transport-button transport-button--stop" onClick={onStop} disabled={state === 'stopped'} aria-label="Stop">
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
        {countIn !== null ? (
          <CountIn countIn={countIn.status} sectionName={countIn.sectionName} />
        ) : (
          <p className="transport-status" aria-live="off">
            <span className="transport-status-section">{status.sectionName ?? (state === 'stopped' ? 'Ready' : '…')}</span>
            {showRep ? (
              <span className="transport-status-rep">
                rep {status.rep} / {status.repeatCount}
              </span>
            ) : null}
            {status.looping ? (
              <span className="transport-status-loop">{status.loopCount > 0 ? `loop ${status.loopCount + 1}` : 'looping'}</span>
            ) : null}
          </p>
        )}
      </div>
      {children !== undefined ? (
        <div className="transport-row" aria-hidden={locked} inert={locked}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
