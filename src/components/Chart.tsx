import { useEffect, useRef } from 'react';
import type { Part, Piece, PulseSlot, TimelinePulse } from '../engine/types';
import ChartLine, { type LineCursor } from './ChartLine';
import SectionHeader from './SectionHeader';
import './Chart.css';

export interface ChartProps {
  piece: Piece;
  /** The part to draw. v1 shows one part at a time (SPEC §4.2). */
  part: Part;
  /** Pulse under the playhead, or null when nothing is highlighted. */
  pulse?: TimelinePulse | null;
  /** Keep the active line on screen (on while playing). */
  autoScroll?: boolean;
}

/** Room the sticky transport bar takes at the bottom of the viewport. */
const BOTTOM_BAR_PX = 120;

function lineKeyOf(sectionIndex: number, lineIndex: number): string {
  return `${sectionIndex}:${lineIndex}`;
}

/** Which line of `part` the playhead is on, or null (stopped, silent part). */
function activeLineKey(pulse: TimelinePulse | null, slot: PulseSlot | undefined): string | null {
  if (pulse === null || slot === undefined || slot.kind === 'silent') return null;
  return lineKeyOf(pulse.sectionIndex, slot.lineIndex);
}

function cursorFor(slot: PulseSlot | undefined, lineIndex: number): LineCursor {
  if (slot === undefined || slot.kind === 'silent' || slot.lineIndex !== lineIndex) return null;
  if (slot.kind === 'pause') return { kind: 'pause' };
  return { kind: 'cell', groupIndex: slot.groupIndex, cellIndex: slot.cellIndex };
}

/**
 * The whole chart of one part: every section, each as a header followed by its lines.
 * Pure display: the piece JSON (already loaded and validated) is the only source of truth;
 * the playhead comes from the timeline pulse the player reports.
 */
export default function Chart({ piece, part, pulse = null, autoScroll = false }: ChartProps) {
  const instrument = piece.instruments.find((i) => i.id === part.instrument);
  // The loader guarantees the instrument exists; this only guards the type.
  const defaultSurface = instrument?.defaultSurface ?? '';
  const slot = pulse?.parts[part.id];
  const activeKey = activeLineKey(pulse, slot);
  const rootRef = useRef<HTMLDivElement>(null);

  // Auto-scroll (SPEC §4.2): when the playhead enters a line that is off screen (or under the
  // transport bar), bring that line to the middle of the viewport.
  useEffect(() => {
    if (!autoScroll || activeKey === null || rootRef.current === null) return;
    const row = rootRef.current.querySelector<HTMLElement>(`[data-line-key="${activeKey}"]`);
    if (row === null) return;
    const rect = row.getBoundingClientRect();
    const visibleBottom = window.innerHeight - BOTTOM_BAR_PX;
    if (rect.top < 0 || rect.bottom > visibleBottom) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeKey, autoScroll]);

  return (
    <div className="chart" aria-label={`${piece.title}, ${part.name}`} ref={rootRef}>
      {piece.sections.map((section, sectionIndex) => {
        const lines = section.lines[part.id];
        const active = pulse !== null && pulse.sectionIndex === sectionIndex;
        return (
          <section key={section.id} className="chart-section" data-section-id={section.id}>
            <SectionHeader section={section} rep={active ? pulse.rep : null} />
            {lines === undefined ? (
              <p className="chart-silent">{part.name} is silent here.</p>
            ) : (
              <div className="chart-lines">
                {lines.map((line, lineIndex) => (
                  <ChartLine
                    key={lineIndex}
                    line={line}
                    number={lineIndex + 1}
                    defaultSurface={defaultSurface}
                    lineKey={lineKeyOf(sectionIndex, lineIndex)}
                    cursor={active ? cursorFor(slot, lineIndex) : null}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
