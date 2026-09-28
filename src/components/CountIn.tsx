import type { CountInStatus } from '../engine/player';
import './CountIn.css';

export interface CountInProps {
  countIn: CountInStatus;
  /** Name of the section about to start. */
  sectionName: string;
}

/** The count-in: beats left, big, plus the section's `cueIn` text when it has one (SPEC §4.2). */
export default function CountIn({ countIn, sectionName }: CountInProps) {
  return (
    <div className="count-in" role="status" aria-live="off">
      <span className="count-in-label">Count-in</span>
      <span className="count-in-beat">{countIn.beat}</span>
      <span className="count-in-text">
        <span className="count-in-section">{sectionName}</span>
        {countIn.cueIn !== '' ? <span className="count-in-cue">{countIn.cueIn}</span> : null}
      </span>
    </div>
  );
}
