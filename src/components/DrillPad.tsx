import type { ReactNode, Ref } from 'react';
import type { Hand } from '../engine/types';
import type { LastTap } from '../pages/useDrillRun';
import './DrillPad.css';

export interface DrillPadProps {
  /** The bar's element, so the page can measure how much of the viewport it covers. */
  ref?: Ref<HTMLDivElement>;
  /** Show the two tap halves. */
  tapping: boolean;
  /** Taps count (playing, past the count-in). */
  enabled: boolean;
  onTap: (hand: Hand) => void;
  lastTap: LastTap | null;
  /** The compact control row above the halves. */
  controls: ReactNode;
  /** Something drawn over the pad: the count-in, or the sound gate. */
  overlay?: ReactNode;
}

function flashText(tap: LastTap): string {
  switch (tap.verdict) {
    case 'on-time':
      return 'on time';
    case 'early':
      return `early ${Math.round(tap.offsetMs ?? 0)} ms`;
    case 'late':
      return `late +${Math.round(tap.offsetMs ?? 0)} ms`;
    case 'wrong-hand':
      return 'wrong hand';
    default:
      return 'miss';
  }
}

/**
 * Big tap targets that fill the bottom third of the screen (SPEC §4.3, §5): left half = L
 * (key F), right half = R (key J), both together = B. Pointer events, so a phone tap counts
 * the moment the finger lands.
 */
export default function DrillPad({ ref, tapping, enabled, onTap, lastTap, controls, overlay }: DrillPadProps) {
  return (
    <div className={tapping ? 'drill-pad drill-pad--tapping' : 'drill-pad'} ref={ref}>
      {overlay !== undefined && overlay !== null ? <div className="drill-pad-overlay">{overlay}</div> : null}
      <div className="drill-pad-controls">{controls}</div>
      {tapping ? (
        <div className="drill-pad-halves">
          <button
            type="button"
            className="drill-pad-half drill-pad-half--left"
            disabled={!enabled}
            aria-label="Left hand (F)"
            onPointerDown={(event) => {
              event.preventDefault();
              onTap('L');
            }}
          >
            <span className="drill-pad-hand">L</span>
            <span className="drill-pad-key">F</span>
          </button>
          <div className="drill-pad-flash" aria-live="off">
            {lastTap !== null ? (
              <span key={lastTap.at} className={`drill-pad-verdict drill-pad-verdict--${lastTap.verdict}`}>
                {flashText(lastTap)}
              </span>
            ) : (
              <span className="drill-pad-hint">F + J = both</span>
            )}
          </div>
          <button
            type="button"
            className="drill-pad-half drill-pad-half--right"
            disabled={!enabled}
            aria-label="Right hand (J)"
            onPointerDown={(event) => {
              event.preventDefault();
              onTap('R');
            }}
          >
            <span className="drill-pad-hand">R</span>
            <span className="drill-pad-key">J</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
