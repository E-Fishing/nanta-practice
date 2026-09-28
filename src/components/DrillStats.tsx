import type { ScoreSummary } from '../engine/scorer';
import type { DrillMode } from '../pages/useDrillRun';
import './DrillStats.css';

export interface DrillStatsProps {
  mode: DrillMode;
  tapping: boolean;
  started: boolean;
  summary: ScoreSummary;
  loops: number;
  hiddenFraction: number;
  blankLoops: number;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'early' | 'late' }) {
  return (
    <span className={tone ? `drill-stat drill-stat--${tone}` : 'drill-stat'}>
      <span className="drill-stat-value">{value}</span>
      <span className="drill-stat-label">{label}</span>
    </span>
  );
}

/** Live figures for the run (SPEC §4.3 scoring column) and the heatmap legend. */
export default function DrillStats({ mode, tapping, started, summary, loops, hiddenFraction, blankLoops }: DrillStatsProps) {
  if (!started) {
    return (
      <p className="drill-stats-empty">
        Press Start. {mode === 'tap' || tapping ? 'Tap along with F and J (or the pad) once the count-in ends.' : 'Cells start hiding after the first loop.'}
      </p>
    );
  }
  const accuracy = `${Math.round(summary.accuracy * 100)}%`;
  return (
    <div className="drill-stats" aria-live="off">
      {mode === 'fade' ? (
        <>
          <Stat label="hidden" value={`${Math.round(hiddenFraction * 100)}%`} />
          <Stat label="loops" value={String(loops)} />
          <Stat label="full-blank loops" value={String(blankLoops)} tone="good" />
        </>
      ) : (
        <Stat label="loops" value={String(loops)} />
      )}
      {mode === 'tap' || tapping ? (
        <>
          <Stat label="accuracy" value={accuracy} tone={summary.accuracy >= 0.85 ? 'good' : undefined} />
          <Stat label="on time" value={String(summary.onTime)} tone="good" />
          <Stat label="early" value={String(summary.early)} tone="early" />
          <Stat label="late" value={String(summary.late)} tone="late" />
          <Stat label="wrong hand" value={String(summary.wrongHand)} tone="bad" />
          <Stat label="missed" value={String(summary.missed)} tone="bad" />
          <Stat label="extra taps" value={String(summary.extra)} tone="bad" />
          <p className="drill-stats-legend">
            Heat bar under each cell: <span className="drill-stats-swatch drill-stats-swatch--early" /> rushing ·{' '}
            <span className="drill-stats-swatch drill-stats-swatch--late" /> dragging · <span className="drill-stats-swatch drill-stats-swatch--on" /> on time ·{' '}
            <span className="drill-stats-swatch drill-stats-swatch--miss" /> missed
          </p>
        </>
      ) : null}
    </div>
  );
}
