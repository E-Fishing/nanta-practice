import { DEFAULT_WINDOWS, heatAccuracy, type CellHeat } from '../engine/scorer';
import type { CellState } from './cellState';
import type { CellView, HitView } from './cellView';
import './Cell.css';

export interface CellProps {
  view: CellView;
  /** Under the playhead right now (filled). */
  current?: boolean;
  /** Where playback will start: a jumped-to line, or the first cell during the count-in (outlined). */
  cued?: boolean;
  /** Drill decoration: hidden notation and/or tap heat. */
  state?: CellState;
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

function HitBody({ view, hideHand, hideGueum }: { view: HitView; hideHand: boolean; hideGueum: boolean }) {
  const letterClass = ['cell-letter', view.circled ? 'cell-letter--circled' : '', view.underlined ? 'cell-letter--underlined' : '']
    .filter(Boolean)
    .join(' ');
  const boxed = view.surface !== null;
  const under = view.syllable ?? (boxed ? view.surface : null);
  return (
    <>
      <span className={hideHand ? 'cell-above cell-slot--hidden' : 'cell-above'}>
        {view.triangle ? <Triangle /> : null}
        {view.arrow ? <Arrow /> : null}
        {view.extraMarks.length > 0 ? <span className="cell-extra">{view.extraMarks.join('')}</span> : null}
      </span>
      <span className={hideHand ? `${letterClass} cell-slot--hidden` : letterClass}>
        {view.grace !== null ? <span className="cell-grace">{view.grace}</span> : null}
        {view.hand}
      </span>
      <span className={hideHand ? 'cell-below cell-slot--hidden' : 'cell-below'}>{view.cross ? <Cross /> : null}</span>
      <span className={[boxed ? 'cell-gueum cell-gueum--boxed' : 'cell-gueum', hideGueum ? 'cell-slot--hidden' : ''].filter(Boolean).join(' ')}>
        {under}
      </span>
    </>
  );
}

/** Heat classes and intensity for a cell: rushing (early), dragging (late), on time, or missed. */
function heatStyle(heat: CellHeat): { className: string; alpha: number; title: string } {
  const played = heat.onTime + heat.early + heat.late;
  const bad = heat.missed + heat.wrongHand + heat.extra;
  const offset = heat.meanOffsetMs;
  let className: string;
  if (played === 0 && bad > 0) className = 'cell--heat-miss';
  else if (offset !== null && offset < -DEFAULT_WINDOWS.onTimeMs) className = 'cell--heat-early';
  else if (offset !== null && offset > DEFAULT_WINDOWS.onTimeMs) className = 'cell--heat-late';
  else className = 'cell--heat-on-time';
  const alpha = className === 'cell--heat-miss' ? 1 : Math.min(1, 0.35 + (Math.abs(offset ?? 0) / DEFAULT_WINDOWS.nearMs) * 0.65);
  const parts: string[] = [];
  if (heat.due > 0) parts.push(`${Math.round(heatAccuracy(heat) * 100)}% over ${heat.due}`);
  if (offset !== null) parts.push(`${offset < 0 ? '' : '+'}${Math.round(offset)} ms`);
  if (heat.missed > 0) parts.push(`${heat.missed} missed`);
  if (heat.wrongHand > 0) parts.push(`${heat.wrongHand} wrong hand`);
  if (heat.extra > 0) parts.push(`${heat.extra} tapped on silence`);
  return { className, alpha, title: parts.join(', ') };
}

/**
 * One grid square = one pulse (SPEC §4.2). Every cell has the same four slots (marks above,
 * letter, marks below, syllable) so cells line up across a line whatever they contain.
 */
export default function Cell({ view, current = false, cued = false, state }: CellProps) {
  const hidden = state?.hidden ?? false;
  const heat = state?.heat ?? null;
  const heatInfo = heat === null ? null : heatStyle(heat);
  const className = [
    'cell',
    `cell--${view.kind}`,
    current ? 'cell--current' : '',
    cued ? 'cell--cued' : '',
    hidden ? 'cell--hidden' : '',
    heatInfo?.className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const label = hidden ? 'hidden cell' : view.label;
  const title = heatInfo === null ? label : `${label}: ${heatInfo.title}`;
  return (
    <span
      className={className}
      role="img"
      aria-label={title}
      title={title}
      aria-current={current ? 'step' : undefined}
      style={heatInfo === null ? undefined : { '--heat-alpha': heatInfo.alpha } as React.CSSProperties}
    >
      {view.kind === 'hit' ? (
        <HitBody view={view} hideHand={hidden || (state?.hideHand ?? false)} hideGueum={hidden || (state?.hideGueum ?? false)} />
      ) : (
        <>
          <span className="cell-above" />
          <span className={hidden ? 'cell-letter cell-slot--hidden' : 'cell-letter'}>{view.kind === 'extender' ? '~' : ''}</span>
          <span className="cell-below" />
          <span className="cell-gueum" />
        </>
      )}
      {heatInfo !== null ? <span className="cell-heat" aria-hidden="true" /> : null}
    </span>
  );
}
