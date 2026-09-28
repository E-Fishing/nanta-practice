import { TEMPO_STEP_BPM, type BpmRange } from '../engine/controls';
import type { DrillMode } from '../engine/drills';
import type { PlaybackState } from '../engine/player';
import type { GueumStage } from '../pages/useDrillRun';
import './DrillControls.css';

export interface DrillControlsProps {
  state: PlaybackState;
  mode: DrillMode;
  metronome: boolean;
  bpm: number;
  range: BpmRange;
  pulseBpm: number;
  stage: GueumStage;
  onToggle: () => void;
  onStop: () => void;
  onMetronome: (on: boolean) => void;
  onStep: (steps: number) => void;
  onShowMe: () => void;
  onStage: (stage: GueumStage) => void;
}

/** The compact control row of the drill pad: start/pause, stop, metronome, tempo, mode extras. */
export default function DrillControls({ state, mode, metronome, bpm, range, pulseBpm, stage, onToggle, onStop, onMetronome, onStep, onShowMe, onStage }: DrillControlsProps) {
  const playing = state === 'playing';
  const label = playing ? 'Pause' : state === 'paused' ? 'Resume' : 'Start';
  const rounded = Math.round(bpm);
  // The blind run is always at performance tempo.
  const tempoLocked = mode === 'blind';
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
      {mode === 'gueum' ? (
        <button type="button" className="drill-controls-button drill-controls-button--stage" onClick={() => onStage(stage === 1 ? 2 : 1)} title="Stage 1 keeps the syllables; stage 2 keeps only the grid">
          Stage {stage} → {stage === 1 ? 2 : 1}
        </button>
      ) : null}
      <span className="drill-controls-tempo" role="group" aria-label="Tempo">
        <button type="button" className="drill-controls-button" onClick={() => onStep(-1)} disabled={tempoLocked || rounded <= range.min} aria-label={`Slower by ${TEMPO_STEP_BPM} BPM`}>
          −
        </button>
        <span className="drill-controls-bpm">
          {rounded} <span className="drill-controls-percent">{Math.round((bpm / pulseBpm) * 100)}%</span>
        </span>
        <button type="button" className="drill-controls-button" onClick={() => onStep(1)} disabled={tempoLocked || rounded >= range.max} aria-label={`Faster by ${TEMPO_STEP_BPM} BPM`}>
          +
        </button>
      </span>
      {mode === 'fade' ? (
        <button type="button" className="drill-controls-button drill-controls-button--reveal" onClick={onShowMe} disabled={state === 'stopped'}>
          Show me
        </button>
      ) : null}
    </div>
  );
}
