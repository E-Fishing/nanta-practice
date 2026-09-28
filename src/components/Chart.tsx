import type { Part, Piece } from '../engine/types';
import ChartLine from './ChartLine';
import SectionHeader from './SectionHeader';
import './Chart.css';

export interface ChartProps {
  piece: Piece;
  /** The part to draw. v1 shows one part at a time (SPEC §4.2). */
  part: Part;
}

/**
 * The whole chart of one part: every section, each as a header followed by its lines.
 * Pure display: the piece JSON (already loaded and validated) is the only source of truth.
 */
export default function Chart({ piece, part }: ChartProps) {
  const instrument = piece.instruments.find((i) => i.id === part.instrument);
  // The loader guarantees the instrument exists; this only guards the type.
  const defaultSurface = instrument?.defaultSurface ?? '';

  return (
    <div className="chart" aria-label={`${piece.title}, ${part.name}`}>
      {piece.sections.map((section) => {
        const lines = section.lines[part.id];
        return (
          <section key={section.id} className="chart-section" data-section-id={section.id}>
            <SectionHeader section={section} />
            {lines === undefined ? (
              <p className="chart-silent">{part.name} is silent here.</p>
            ) : (
              <div className="chart-lines">
                {lines.map((line, i) => (
                  <ChartLine key={i} line={line} number={i + 1} defaultSurface={defaultSurface} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
