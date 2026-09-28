import type { DrillMode, LineScore } from '../engine/drills';
import type { ScoreSummary } from '../engine/scorer';
import type { Piece } from '../engine/types';
import type { GapResult, GueumStage, Transition } from '../pages/useDrillRun';
import './DrillStats.css';

export interface DrillStatsProps {
  piece: Piece;
  partId: string;
  mode: DrillMode;
  tapping: boolean;
  started: boolean;
  finished: boolean;
  summary: ScoreSummary;
  loops: number;
  hiddenFraction: number;
  blankLoops: number;
  stage: GueumStage;
  stageLoops: readonly [number, number];
  gapResults: readonly GapResult[];
  transitions: readonly Transition[];
  worst: readonly LineScore[];
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' | 'early' | 'late' }) {
  return (
    <span className={tone ? `drill-stat drill-stat--${tone}` : 'drill-stat'}>
      <span className="drill-stat-value">{value}</span>
      <span className="drill-stat-label">{label}</span>
    </span>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function TapStats({ summary }: { summary: ScoreSummary }) {
  return (
    <>
      <Stat label="accuracy" value={percent(summary.accuracy)} tone={summary.accuracy >= 0.85 ? 'good' : undefined} />
      <Stat label="on time" value={String(summary.onTime)} tone="good" />
      <Stat label="early" value={String(summary.early)} tone="early" />
      <Stat label="late" value={String(summary.late)} tone="late" />
      <Stat label="wrong hand" value={String(summary.wrongHand)} tone="bad" />
      <Stat label="missed" value={String(summary.missed)} tone="bad" />
      <Stat label="extra taps" value={String(summary.extra)} tone="bad" />
    </>
  );
}

function HeatLegend() {
  return (
    <p className="drill-stats-legend">
      Heat bar under each cell: <span className="drill-stats-swatch drill-stats-swatch--early" /> rushing ·{' '}
      <span className="drill-stats-swatch drill-stats-swatch--late" /> dragging · <span className="drill-stats-swatch drill-stats-swatch--on" /> on time ·{' '}
      <span className="drill-stats-swatch drill-stats-swatch--miss" /> missed
    </p>
  );
}

const INTRO: Record<DrillMode, string> = {
  fade: 'Cells start hiding after the first loop.',
  gueum: 'Hand letters are hidden; stage 2 hides the syllables too.',
  gap: 'Answer each blank before it lands: F, J, F+J or space, or the pad.',
  tap: 'Tap along with F and J (or the pad) once the count-in ends.',
  cue: 'Only the cue figures sound. Tap the first hit of each section on time.',
  blind: 'The chart goes blank at performance tempo. Tap the whole section from memory.',
};

/** Live figures for the run (SPEC §4.3 scoring column) and the heatmap legend. */
export default function DrillStats(props: DrillStatsProps) {
  const { piece, partId, mode, tapping, started, finished, summary, loops, hiddenFraction, blankLoops, stage, stageLoops, gapResults, transitions, worst } = props;
  if (!started) return <p className="drill-stats-empty">Press Start. {INTRO[mode]}</p>;

  const scored = mode === 'tap' || mode === 'cue' || mode === 'blind' || tapping;
  const correct = gapResults.filter((result) => result.correct).length;
  const hits = transitions.filter((transition) => transition.verdict === 'on-time').length;
  const judged = transitions.filter((transition) => transition.verdict !== 'pending').length;

  return (
    <div className="drill-stats" aria-live="off">
      <Stat label="loops" value={String(loops)} />
      {mode === 'fade' ? (
        <>
          <Stat label="hidden" value={percent(hiddenFraction)} />
          <Stat label="full-blank loops" value={String(blankLoops)} tone="good" />
        </>
      ) : null}
      {mode === 'gueum' ? (
        <>
          <Stat label="stage" value={String(stage)} />
          <Stat label="stage 1 loops" value={String(stageLoops[0])} tone="good" />
          <Stat label="stage 2 loops" value={String(stageLoops[1])} tone="good" />
        </>
      ) : null}
      {mode === 'gap' ? (
        <>
          <Stat label="correct" value={gapResults.length === 0 ? '–' : percent(correct / gapResults.length)} tone={gapResults.length > 0 && correct === gapResults.length ? 'good' : undefined} />
          <Stat label="answered" value={`${correct} / ${gapResults.length}`} />
        </>
      ) : null}
      {mode === 'cue' ? (
        <>
          <Stat label="entries on time" value={`${hits} / ${judged}`} tone={judged > 0 && hits === judged ? 'good' : undefined} />
          <ol className="drill-stats-transitions">
            {transitions.map((transition, i) => (
              <li key={i} className={`drill-stats-transition drill-stats-transition--${transition.verdict}`}>
                {piece.sections[transition.sectionIndex]?.name ?? '?'}: {transition.verdict === 'pending' ? '…' : transition.verdict}
                {transition.offsetMs !== null && transition.verdict !== 'wrong-hand' ? ` (${transition.offsetMs < 0 ? '' : '+'}${Math.round(transition.offsetMs)} ms)` : ''}
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {scored && mode !== 'cue' ? <TapStats summary={summary} /> : null}
      {mode === 'blind' && finished ? (
        <div className="drill-stats-worst">
          <p className="drill-stats-worst-title">Worst lines</p>
          {worst.length === 0 ? (
            <p className="drill-stats-empty">Nothing was scored.</p>
          ) : (
            <ol className="drill-stats-worst-list">
              {worst.map((line) => (
                <li key={`${line.sectionIndex}:${line.lineIndex}`}>
                  {piece.sections[line.sectionIndex]?.name ?? '?'}, line {line.lineIndex + 1}: {percent(line.accuracy)} over {line.due} hit{line.due === 1 ? '' : 's'}
                  {piece.sections[line.sectionIndex]?.lines[partId]?.[line.lineIndex]?.note ? ` — ${piece.sections[line.sectionIndex].lines[partId][line.lineIndex].note}` : ''}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
      {scored && (mode !== 'blind' || finished) ? <HeatLegend /> : null}
    </div>
  );
}
