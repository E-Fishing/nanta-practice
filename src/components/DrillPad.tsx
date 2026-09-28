import type { ReactNode, Ref } from 'react';
import type { GapAnswer } from '../engine/drills';
import type { Hand } from '../engine/types';
import type { LastAnswer, LastTap } from '../pages/useDrillRun';
import './DrillPad.css';

export interface DrillPadProps {
  /** The bar's element, so the page can measure how much of the viewport it covers. */
  ref?: Ref<HTMLDivElement>;
  /** What the big buttons do: tap a hand, answer a gap (L / both / R / rest), or nothing. */
  input: 'taps' | 'answers' | 'none';
  /** Taps and answers count (playing, past the count-in). */
  enabled: boolean;
  onTap: (hand: Hand) => void;
  onAnswer: (answer: GapAnswer) => void;
  lastTap: LastTap | null;
  lastAnswer: LastAnswer | null;
  /** The compact control row above the buttons. */
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

const ANSWER_NAMES: Record<GapAnswer, string> = { L: 'left', R: 'right', B: 'both', rest: 'rest' };

function answerText(answer: LastAnswer): string {
  return answer.correct ? `${ANSWER_NAMES[answer.given]} ✓` : `${ANSWER_NAMES[answer.given]} ✗ (it was ${ANSWER_NAMES[answer.expected]})`;
}

interface BigButtonProps {
  className: string;
  label: string;
  hand: string;
  keyName: string;
  enabled: boolean;
  onPress: () => void;
}

function BigButton({ className, label, hand, keyName, enabled, onPress }: BigButtonProps) {
  return (
    <button
      type="button"
      className={className}
      disabled={!enabled}
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        onPress();
      }}
    >
      <span className="drill-pad-hand">{hand}</span>
      <span className="drill-pad-key">{keyName}</span>
    </button>
  );
}

/**
 * Big tap targets that fill the bottom third of the screen (SPEC §4.3, §5): left half = L
 * (key F), right half = R (key J), both together = B. Fill the gap shows four answers instead.
 * Pointer events, so a phone tap counts the moment the finger lands.
 */
export default function DrillPad({ ref, input, enabled, onTap, onAnswer, lastTap, lastAnswer, controls, overlay }: DrillPadProps) {
  const flash =
    input === 'answers' ? (
      lastAnswer !== null ? (
        <span key={lastAnswer.at} className={lastAnswer.correct ? 'drill-pad-verdict drill-pad-verdict--on-time' : 'drill-pad-verdict drill-pad-verdict--miss'}>
          {answerText(lastAnswer)}
        </span>
      ) : (
        <span className="drill-pad-hint">answer before the cell lands</span>
      )
    ) : lastTap !== null ? (
      <span key={lastTap.at} className={`drill-pad-verdict drill-pad-verdict--${lastTap.verdict}`}>
        {flashText(lastTap)}
      </span>
    ) : (
      <span className="drill-pad-hint">F + J = both</span>
    );

  return (
    <div className={input === 'none' ? 'drill-pad' : 'drill-pad drill-pad--tapping'} ref={ref}>
      {overlay !== undefined && overlay !== null ? <div className="drill-pad-overlay">{overlay}</div> : null}
      <div className="drill-pad-controls">{controls}</div>
      {input === 'taps' ? (
        <div className="drill-pad-halves">
          <BigButton className="drill-pad-half" label="Left hand (F)" hand="L" keyName="F" enabled={enabled} onPress={() => onTap('L')} />
          <div className="drill-pad-flash" aria-live="off">
            {flash}
          </div>
          <BigButton className="drill-pad-half" label="Right hand (J)" hand="R" keyName="J" enabled={enabled} onPress={() => onTap('R')} />
        </div>
      ) : null}
      {input === 'answers' ? (
        <div className="drill-pad-answers">
          <div className="drill-pad-flash drill-pad-flash--wide" aria-live="off">
            {flash}
          </div>
          <BigButton className="drill-pad-half" label="Left hand (F)" hand="L" keyName="F" enabled={enabled} onPress={() => onAnswer('L')} />
          <BigButton className="drill-pad-half" label="Both hands (F and J)" hand="B" keyName="F+J" enabled={enabled} onPress={() => onAnswer('B')} />
          <BigButton className="drill-pad-half" label="Right hand (J)" hand="R" keyName="J" enabled={enabled} onPress={() => onAnswer('R')} />
          <BigButton className="drill-pad-half drill-pad-half--rest" label="Rest (space)" hand="–" keyName="space" enabled={enabled} onPress={() => onAnswer('rest')} />
        </div>
      ) : null}
    </div>
  );
}
