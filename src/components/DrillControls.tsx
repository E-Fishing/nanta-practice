import { TEMPO_STEP_BPM, type BpmRange } from '../engine/controls';
import type { PlaybackState } from '../engine/player';
import './DrillControls.css';

export interface DrillControlsProps {
  state: PlaybackState;
  metronome: boolean;
  bpm: number;
  range: BpmRange;
  pulseBpm: number;
  /** Show the Fade "Show me" button. */
  fade: boolean;
  onToggle: () => void;
  onStop: () => void;
  onMetronome: (on: boolean) => void;
  onStep: (steps: number) => void;
  onShowMe: () => void;
}

/** The compact control row of the drill pad: start/pause, stop, metronome, tempo, Show me. */
export default function DrillControls({ state, metronome, bpm, range, pulseBpm, fade, onToggle, onStop, onMetronome, onStep, onShowMe }: DrillControlsProps) {
  const playing = state === 'playing';
  const label = playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Start';
  const rounded = Math.round(bpm);
  return (
    <div className="drill-controls" role="group" aria-label="Drill controls">
      <button type="button" className="drill-controls-button drill-controls-button--primary" onClick={onToggle}>
        {label}
      </button>
      <button type="button" className="drill-controls-button" onClick={onStop} disabled={state === 'stopped'}>
        Stop
      </button>
      <button type="button" className="drill-controls-button drill-controls-button--toggle" onClick={() => onMetronome(!metronome)} aria-pressed={metronome}>
        Click
      </button>
      <span className="drill-controls-tempo" role="group" aria-label="Tempo">
        <button type="button" className="drill-controls-button" onClick={() => onStep(-1)} disabled={rounded <= range.min} aria-label={`Slower by ${TEMPO_STEP_BPM} BPM`}>
          −
        </button>
        <span className="drill-controls-bpm">
          {rounded} <span className="drill-controls-percent">{Math.round((bpm / pulseBpm) * 100)}%</span>
        </span>
        <button type="button" className="drill-controls-button" onClick={() => onStep(1)} disabled={rounded >= range.max} aria-label={`Faster by ${TEMPO_STEP_BPM} BPM`}>
          +
        </button>
      </span>
      {fade ? (
        <button type="button" className="drill-controls-button drill-controls-button--reveal" onClick={onShowMe} disabled={state === 'stopped'}>
          Show me
        </button>
      ) : null}
    </div>
  );
}
