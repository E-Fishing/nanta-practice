import type { AttemptRecord } from '../storage/progress';
import './AccuracyChart.css';

export interface AccuracyChartProps {
  history: readonly AttemptRecord[];
  /** Accessible title, e.g. "Build ×8 accuracy over time". */
  title: string;
}

const WIDTH = 240;
const HEIGHT = 72;
const PAD_X = 6;
const PAD_Y = 6;

/**
 * One small line chart per section (SPEC §4.5): scored attempts in order, accuracy 0..100%
 * on the y axis, with the 85% pass line. Inline SVG, no library.
 */
export default function AccuracyChart({ history, title }: AccuracyChartProps) {
  const points = history.filter((entry): entry is AttemptRecord & { accuracy: number } => entry.accuracy !== null);
  if (points.length === 0) {
    return <p className="accuracy-chart-empty">No scored attempts yet.</p>;
  }
  const innerW = WIDTH - 2 * PAD_X;
  const innerH = HEIGHT - 2 * PAD_Y;
  const x = (i: number) => PAD_X + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (accuracy: number) => PAD_Y + (1 - Math.min(1, Math.max(0, accuracy))) * innerH;
  const path = points.map((entry, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(entry.accuracy).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const summary = `${points.length} scored attempt${points.length === 1 ? '' : 's'} from ${first.date} to ${last.date}, latest ${Math.round(last.accuracy * 100)}%`;

  return (
    <figure className="accuracy-chart">
      <svg className="accuracy-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title}: ${summary}`}>
        <line className="accuracy-chart-pass" x1={PAD_X} x2={WIDTH - PAD_X} y1={y(0.85)} y2={y(0.85)} />
        <line className="accuracy-chart-axis" x1={PAD_X} x2={WIDTH - PAD_X} y1={y(0)} y2={y(0)} />
        <path className="accuracy-chart-line" d={path} />
        {points.map((entry, i) => (
          <circle key={i} className={entry.accuracy >= 0.85 ? 'accuracy-chart-dot accuracy-chart-dot--pass' : 'accuracy-chart-dot'} cx={x(i)} cy={y(entry.accuracy)} r={3}>
            <title>{`${entry.date}: ${Math.round(entry.accuracy * 100)}% at ${Math.round(entry.bpm)} BPM (${entry.mode})`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="accuracy-chart-caption">{summary}</figcaption>
    </figure>
  );
}
