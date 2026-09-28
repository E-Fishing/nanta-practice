import { memo } from 'react';
import type { Line } from '../engine/types';
import Cell from './Cell';
import { cellView, type CellView } from './cellView';
import './ChartLine.css';

/** Where the playhead is inside a line: on a cell, in the breath after it, or elsewhere. */
export type LineCursor = { kind: 'cell'; groupIndex: number; cellIndex: number } | { kind: 'pause' } | null;

export interface ChartLineProps {
  line: Line;
  /** 1-based line number within the section, drawn small at the left. */
  number: number;
  /** The part's instrument default surface; hits on other surfaces are boxed. */
  defaultSurface: string;
  /** Stable key the chart uses to find this row's element for auto-scroll. */
  lineKey: string;
  /** Playhead position when it is on this line; null otherwise (the common case). */
  cursor?: LineCursor;
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
function Breath({ pulses, current }: { pulses: number; current: boolean }) {
  const label = `Breath: ${pulses} pulse${pulses === 1 ? '' : 's'} of silence`;
  return (
    <span className={current ? 'chart-breath chart-breath--current' : 'chart-breath'} role="img" aria-label={label} title={label}>
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
function ChartLine({ line, number, defaultSurface, lineKey, cursor = null }: ChartLineProps) {
  const groups = line.groups.map((group) => group.map((cell) => cellView(cell, defaultSurface)));
  const breath = line.pauseAfter > 0;
  const className = [
    'chart-line',
    breath ? 'chart-line--breath' : '',
    cursor !== null ? 'chart-line--current' : '',
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
            {group.map((view, c) => (
              <Cell key={c} view={view} current={cursor?.kind === 'cell' && cursor.groupIndex === g && cursor.cellIndex === c} />
            ))}
            {breath && g === groups.length - 1 ? <Breath pulses={line.pauseAfter} current={cursor?.kind === 'pause'} /> : null}
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
  return a.kind === 'pause' || (b.kind === 'cell' && a.groupIndex === b.groupIndex && a.cellIndex === b.cellIndex);
}

export default memo(ChartLine, (prev, next) => {
  return (
    prev.line === next.line &&
    prev.number === next.number &&
    prev.defaultSurface === next.defaultSurface &&
    prev.lineKey === next.lineKey &&
    sameCursor(prev.cursor ?? null, next.cursor ?? null)
  );
});
