import { memo } from 'react';
import type { Line } from '../engine/types';
import Cell from './Cell';
import type { CellState } from './cellState';
import { cellView, type CellView } from './cellView';
import './ChartLine.css';

/**
 * Where the playhead is inside a line: on a cell (sounding, or `cued` = where playback will
 * start), in the breath after the line, or elsewhere.
 */
export type LineCursor = { kind: 'cell'; groupIndex: number; cellIndex: number; cued: boolean } | { kind: 'pause' } | null;

export interface ChartLineProps {
  line: Line;
  /** 1-based line number within the section, drawn small at the left. */
  number: number;
  /** The part's instrument default surface; hits on other surfaces are boxed. */
  defaultSurface: string;
  /** "sectionIndex:lineIndex": the chart uses it to find this row for auto-scroll; cell keys extend it. */
  lineKey: string;
  /** Playhead position when it is on this line; null otherwise (the common case). */
  cursor?: LineCursor;
  /** Inside the current loop. */
  looped?: boolean;
  /** Drill decorations for the whole chart; this line looks up its own cells. */
  states?: ReadonlyMap<string, CellState>;
}

/** Which of the cell slots this line actually uses, so unused rows collapse line-wide. */
function slotClasses(groups: CellView[][]): string {
  let above = false;
  let below = false;
  let gueum = false;
  for (const group of groups) {
    for (const view of group) {
      if (view.kind !== 'hit') continue;
      above ||= view.triangle || view.arrow || view.extraMarks.length > 0;
      below ||= view.cross;
      gueum ||= view.syllable !== null || view.surface !== null;
    }
  }
  return [above ? '' : 'chart-line--no-above', below ? '' : 'chart-line--no-below', gueum ? '' : 'chart-line--no-gueum']
    .filter(Boolean)
    .join(' ');
}

/** The period the club writes after a line: a short breath before the next one. */
function Breath({ pulses, current, tapped }: { pulses: number; current: boolean; tapped: boolean }) {
  const label = `Breath: ${pulses} pulse${pulses === 1 ? '' : 's'} of silence${tapped ? ', tapped by mistake' : ''}`;
  const className = ['chart-breath', current ? 'chart-breath--current' : '', tapped ? 'chart-breath--tapped' : ''].filter(Boolean).join(' ');
  return (
    <span className={className} role="img" aria-label={label} title={label}>
      .
    </span>
  );
}

/**
 * One chart row (SPEC §4.2): groups drawn as clusters with a visible gap between them.
 * On a narrow screen groups wrap onto extra rows; a group itself never breaks. A line pause
 * is drawn as the club writes it, a period right after the last hit, plus extra space below.
 *
 * Memoized: during playback only the row the playhead enters or leaves re-renders.
 */
function ChartLine({ line, number, defaultSurface, lineKey, cursor = null, looped = false, states }: ChartLineProps) {
  const groups = line.groups.map((group) => group.map((cell) => cellView(cell, defaultSurface)));
  const breath = line.pauseAfter > 0;
  const pauseState = states?.get(`${lineKey}:pause`);
  const className = [
    'chart-line',
    breath ? 'chart-line--breath' : '',
    cursor !== null ? 'chart-line--current' : '',
    looped ? 'chart-line--looped' : '',
    slotClasses(groups),
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} data-line-key={lineKey}>
      <span className="chart-line-number" aria-hidden="true">
        {number}
      </span>
      <div className="chart-line-groups">
        {groups.map((group, g) => (
          <span key={g} className="chart-group">
            {group.map((view, c) => {
              const on = cursor?.kind === 'cell' && cursor.groupIndex === g && cursor.cellIndex === c;
              return <Cell key={c} view={view} current={on && !cursor.cued} cued={on && cursor.cued} state={states?.get(`${lineKey}:${g}:${c}`)} />;
            })}
            {breath && g === groups.length - 1 ? (
              <Breath pulses={line.pauseAfter} current={cursor?.kind === 'pause'} tapped={(pauseState?.heat?.extra ?? 0) > 0} />
            ) : null}
          </span>
        ))}
      </div>
      {line.note !== null ? <p className="chart-line-note">{line.note}</p> : null}
    </div>
  );
}

function sameCursor(a: LineCursor, b: LineCursor): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.kind !== b.kind) return false;
  if (a.kind === 'pause' || b.kind === 'pause') return true;
  return a.groupIndex === b.groupIndex && a.cellIndex === b.cellIndex && a.cued === b.cued;
}

export default memo(ChartLine, (prev, next) => {
  return (
    prev.line === next.line &&
    prev.number === next.number &&
    prev.defaultSurface === next.defaultSurface &&
    prev.lineKey === next.lineKey &&
    (prev.looped ?? false) === (next.looped ?? false) &&
    prev.states === next.states &&
    sameCursor(prev.cursor ?? null, next.cursor ?? null)
  );
});
