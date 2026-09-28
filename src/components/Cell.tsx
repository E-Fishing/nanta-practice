import type { CellView, HitView } from './cellView';
import './Cell.css';

export interface CellProps {
  view: CellView;
  /** Under the playhead right now. */
  current?: boolean;
}

/** Small accent: a filled triangle above the letter. */
function Triangle() {
  return (
    <svg className="cell-mark" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 1 L9.5 9 H0.5 Z" fill="currentColor" />
    </svg>
  );
}

/** Lift: an up-arrow above the letter. */
function Arrow() {
  return (
    <svg className="cell-mark cell-mark--arrow" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M5 11 V2 M1.5 5.5 L5 1.5 L8.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Cross-arm: an X below the letter. */
function Cross() {
  return (
    <svg className="cell-mark" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HitBody({ view }: { view: HitView }) {
  const letterClass = ['cell-letter', view.circled ? 'cell-letter--circled' : '', view.underlined ? 'cell-letter--underlined' : '']
    .filter(Boolean)
    .join(' ');
  const boxed = view.surface !== null;
  const under = view.syllable ?? (boxed ? view.surface : null);
  return (
    <>
      <span className="cell-above">
        {view.triangle ? <Triangle /> : null}
        {view.arrow ? <Arrow /> : null}
        {view.extraMarks.length > 0 ? <span className="cell-extra">{view.extraMarks.join('')}</span> : null}
      </span>
      <span className={letterClass}>
        {view.grace !== null ? <span className="cell-grace">{view.grace}</span> : null}
        {view.hand}
      </span>
      <span className="cell-below">{view.cross ? <Cross /> : null}</span>
      <span className={boxed ? 'cell-gueum cell-gueum--boxed' : 'cell-gueum'}>{under}</span>
    </>
  );
}

/**
 * One grid square = one pulse (SPEC §4.2). Every cell has the same four slots (marks above,
 * letter, marks below, syllable) so cells line up across a line whatever they contain.
 */
export default function Cell({ view, current = false }: CellProps) {
  const className = ['cell', `cell--${view.kind}`, current ? 'cell--current' : ''].filter(Boolean).join(' ');
  return (
    <span className={className} role="img" aria-label={view.label} title={view.label} aria-current={current ? 'step' : undefined}>
      {view.kind === 'hit' ? (
        <HitBody view={view} />
      ) : (
        <>
          <span className="cell-above" />
          <span className="cell-letter">{view.kind === 'extender' ? '~' : ''}</span>
          <span className="cell-below" />
          <span className="cell-gueum" />
        </>
      )}
    </span>
  );
}
