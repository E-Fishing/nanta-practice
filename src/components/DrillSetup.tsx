import type { Piece } from '../engine/types';
import type { DrillMode } from '../pages/useDrillRun';
import { DRILL_MODES } from './drillModes';
import './DrillSetup.css';

export interface DrillSetupProps {
  piece: Piece;
  /** Section id, or "piece" for the whole piece. */
  target: string;
  mode: DrillMode;
  /** Fade only: score taps too (a miss reveals cells). */
  tapping: boolean;
  /** Locked while a run is going. */
  disabled: boolean;
  onTarget: (target: string) => void;
  onMode: (mode: DrillMode) => void;
  onTapping: (on: boolean) => void;
}

/** Pick a section (or the whole piece) and a drill mode (SPEC §4.3). */
export default function DrillSetup({ piece, target, mode, tapping, disabled, onTarget, onMode, onTapping }: DrillSetupProps) {
  return (
    <div className="drill-setup">
      <label className="drill-setup-field">
        <span className="drill-setup-label">Section</span>
        <select className="drill-setup-select" value={target} onChange={(e) => onTarget(e.target.value)} disabled={disabled}>
          {piece.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
          <option value="piece">Whole piece</option>
        </select>
      </label>
      <div className="drill-setup-modes" role="radiogroup" aria-label="Drill mode">
        {DRILL_MODES.map((info) => (
          <button
            key={info.id}
            type="button"
            role="radio"
            aria-checked={mode === info.id}
            className={mode === info.id ? 'drill-setup-mode drill-setup-mode--selected' : 'drill-setup-mode'}
            onClick={() => onMode(info.id)}
            disabled={disabled}
            title={info.blurb}
          >
            {info.name}
          </button>
        ))}
      </div>
      {mode === 'fade' ? (
        <label className="drill-setup-check">
          <input type="checkbox" checked={tapping} onChange={(e) => onTapping(e.target.checked)} disabled={disabled} />
          Tap along too (a miss shows cells again)
        </label>
      ) : null}
      <p className="drill-setup-blurb">{DRILL_MODES.find((info) => info.id === mode)?.blurb}</p>
    </div>
  );
}
