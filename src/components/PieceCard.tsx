import { Link } from 'react-router-dom';
import { unitsToSeconds } from '../engine/expand';
import type { Piece, Timeline } from '../engine/types';
import './PieceCard.css';

export interface PieceCardProps {
  piece: Piece;
  timeline: Timeline;
  /** Latest practice date (YYYY-MM-DD) for the current member, or null for never. */
  lastPracticed: string | null;
}

/** Seconds as m:ss, rounded to the nearest second. */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** One Library card. Pure display: everything comes in through props, nothing is fetched here. */
export default function PieceCard({ piece, timeline, lastPracticed }: PieceCardProps) {
  const duration = formatDuration(unitsToSeconds(timeline.totalUnits, piece.pulseBpm));
  return (
    <article className="piece-card">
      <h2 className="piece-card-title">{piece.title}</h2>
      <ul className="piece-card-meta">
        <li>{plural(piece.sections.length, 'section')}</li>
        <li>{piece.pulseBpm} pulses/min</li>
        <li>
          {plural(timeline.totalPulses, 'pulse')} · ~{duration}
        </li>
      </ul>
      <p className="piece-card-practiced">
        Last practiced: <strong>{lastPracticed ?? 'never'}</strong>
      </p>
      <nav className="piece-card-actions" aria-label={`${piece.title} actions`}>
        <Link className="piece-card-button piece-card-button--primary" to={`/play/${piece.id}`}>
          Practice
        </Link>
        <Link className="piece-card-button" to={`/drill/${piece.id}`}>
          Drills
        </Link>
        <Link className="piece-card-button" to={`/edit/${piece.id}`}>
          Edit
        </Link>
      </nav>
    </article>
  );
}
