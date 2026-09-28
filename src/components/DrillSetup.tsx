import type { DrillMode } from '../engine/drills';
import type { Piece } from '../engine/types';
import { DRILL_MODES, drillModeInfo } from './drillModes';
import './DrillSetup.css';

export interface DrillSetupProps {
  piece: Piece;
  /** Section id, or "piece" for the whole piece. */
  target: string;
  mode: DrillMode;
  /** Fade and Gu-eum only: score taps too (a miss reveals cells in Fade). */
  tapping: boolean;
  /** Locked while a run is going. */
  disabled: boolean;
  onTarget: (target: string) => void;
  onMode: (mode: DrillMode) => void;
  onTapping: (on: boolean) => void;
}

/** Pick a section (or the whole piece) and a drill mode (SPEC §4.3). */
export default function DrillSetup({ piece, target, mode, tapping, disabled, onTarget, onMode, onTapping }: DrillSetupProps) {
  const info = drillModeInfo(mode);
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
        {DRILL_MODES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={mode === entry.id}
            className={mode === entry.id ? 'drill-setup-mode drill-setup-mode--selected' : 'drill-setup-mode'}
            onClick={() => onMode(entry.id)}
            disabled={disabled}
          >
            {entry.name}
          </button>
        ))}
      </div>
      {info.optionalTaps ? (
        <label className="drill-setup-check">
          <input type="checkbox" checked={tapping} onChange={(e) => onTapping(e.target.checked)} disabled={disabled} />
          Tap along too{mode === 'fade' ? ' (a miss shows cells again)' : ''}
        </label>
      ) : null}
      <p className="drill-setup-blurb">{info.blurb}</p>
    </div>
  );
}
