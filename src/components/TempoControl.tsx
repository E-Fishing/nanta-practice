import { TEMPO_STEP_BPM, type BpmRange } from '../engine/controls';
import './TempoControl.css';

export interface TempoControlProps {
  bpm: number;
  range: BpmRange;
  /** The piece's performance tempo, for the percent readout. */
  pulseBpm: number;
  /** "+5 BPM every loop". */
  stepPerLoop: boolean;
  onBpm: (bpm: number) => void;
  /** Whole steps of `TEMPO_STEP_BPM`. */
  onStep: (steps: number) => void;
  onStepPerLoop: (on: boolean) => void;
}

/** Tempo slider from 40% to 120% of the pulse BPM, −/+ 5 buttons and the per-loop step toggle (SPEC §4.2). */
export default function TempoControl({ bpm, range, pulseBpm, stepPerLoop, onBpm, onStep, onStepPerLoop }: TempoControlProps) {
  const rounded = Math.round(bpm);
  const percent = Math.round((bpm / pulseBpm) * 100);
  const valueText = `${rounded} BPM, ${percent}% of performance tempo`;

  return (
    <div className="tempo" role="group" aria-label="Tempo">
      <label className="tempo-label" htmlFor="tempo-slider">
        Tempo
      </label>
      <button
        type="button"
        className="tempo-step"
        onClick={() => onStep(-1)}
        disabled={rounded <= range.min}
        aria-label={`Slower by ${TEMPO_STEP_BPM} BPM`}
      >
        −{TEMPO_STEP_BPM}
      </button>
      <input
        id="tempo-slider"
        className="tempo-slider"
        type="range"
        min={range.min}
        max={range.max}
        step={1}
        value={rounded}
        onChange={(event) => onBpm(Number(event.target.value))}
        aria-valuetext={valueText}
      />
      <button
        type="button"
        className="tempo-step"
        onClick={() => onStep(1)}
        disabled={rounded >= range.max}
        aria-label={`Faster by ${TEMPO_STEP_BPM} BPM`}
      >
        +{TEMPO_STEP_BPM}
      </button>
      <output className="tempo-readout" htmlFor="tempo-slider" aria-live="off">
        <span className="tempo-readout-bpm">{rounded} BPM</span>
        <span className="tempo-readout-percent">{percent}%</span>
      </output>
      <button
        type="button"
        className="tempo-toggle"
        onClick={() => onStepPerLoop(!stepPerLoop)}
        aria-pressed={stepPerLoop}
        title="Each time the loop wraps, play it a little faster"
      >
        +{TEMPO_STEP_BPM} BPM every loop
        <span className="tempo-toggle-state" aria-hidden="true">
          {stepPerLoop ? 'on' : 'off'}
        </span>
      </button>
    </div>
  );
}
