import { useEffect, useMemo, useRef } from 'react';
import type { LineRef } from '../engine/controls';
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
  /** `pulse` marks where playback will start (outlined) rather than what is sounding (filled). */
  cued?: boolean;
  /** Keep the active line on screen (on while playing). */
  autoScroll?: boolean;
  /** Lines of this part inside the loop, and sections the loop touches (marked in the margin). */
  loopedLines?: readonly LineRef[];
  loopedSections?: readonly number[];
  /** Height of the bar covering the bottom of the viewport, for the auto-scroll check. */
  bottomInset?: number;
}

/** Fallback for the sticky transport bar before it has been measured. */
const DEFAULT_BOTTOM_INSET_PX = 120;

const NO_LINES: readonly LineRef[] = [];
const NO_SECTIONS: readonly number[] = [];

function lineKeyOf(sectionIndex: number, lineIndex: number): string {
  return `${sectionIndex}:${lineIndex}`;
}

/** Which line of `part` the playhead is on, or null (stopped, silent part). */
function activeLineKey(pulse: TimelinePulse | null, slot: PulseSlot | undefined): string | null {
  if (pulse === null || slot === undefined || slot.kind === 'silent') return null;
  return lineKeyOf(pulse.sectionIndex, slot.lineIndex);
}

function cursorFor(slot: PulseSlot | undefined, lineIndex: number, cued: boolean): LineCursor {
  if (slot === undefined || slot.kind === 'silent' || slot.lineIndex !== lineIndex) return null;
  if (slot.kind === 'pause') return { kind: 'pause' };
  return { kind: 'cell', groupIndex: slot.groupIndex, cellIndex: slot.cellIndex, cued };
}

/**
 * The whole chart of one part: every section, each as a header followed by its lines.
 * Pure display: the piece JSON (already loaded and validated) is the only source of truth;
 * the playhead comes from the timeline pulse the player reports.
 */
export default function Chart({
  piece,
  part,
  pulse = null,
  cued = false,
  autoScroll = false,
  loopedLines = NO_LINES,
  loopedSections = NO_SECTIONS,
  bottomInset = 0,
}: ChartProps) {
  const instrument = piece.instruments.find((i) => i.id === part.instrument);
  // The loader guarantees the instrument exists; this only guards the type.
  const defaultSurface = instrument?.defaultSurface ?? '';
  const slot = pulse?.parts[part.id];
  const activeKey = activeLineKey(pulse, slot);
  const rootRef = useRef<HTMLDivElement>(null);
  const loopedKeys = useMemo(() => new Set(loopedLines.map((ref) => lineKeyOf(ref.sectionIndex, ref.lineIndex))), [loopedLines]);

  // Auto-scroll (SPEC §4.2): when the playhead enters a line that is off screen (or under the
  // transport bar), bring that line to the middle of the viewport.
  useEffect(() => {
    if (!autoScroll || activeKey === null || rootRef.current === null) return;
    const row = rootRef.current.querySelector<HTMLElement>(`[data-line-key="${activeKey}"]`);
    if (row === null) return;
    const rect = row.getBoundingClientRect();
    const visibleBottom = window.innerHeight - (bottomInset > 0 ? bottomInset : DEFAULT_BOTTOM_INSET_PX);
    if (rect.top < 0 || rect.bottom > visibleBottom) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeKey, autoScroll, bottomInset]);

  return (
    <div className="chart" aria-label={`${piece.title}, ${part.name}`} ref={rootRef}>
      {piece.sections.map((section, sectionIndex) => {
        const lines = section.lines[part.id];
        const active = pulse !== null && pulse.sectionIndex === sectionIndex;
        return (
          <section key={section.id} className="chart-section" data-section-id={section.id}>
            <SectionHeader section={section} rep={active ? pulse.rep : null} looped={loopedSections.includes(sectionIndex)} />
            {lines === undefined ? (
              <p className="chart-silent">{part.name} is silent here.</p>
            ) : (
              <div className="chart-lines">
                {lines.map((line, lineIndex) => {
                  const key = lineKeyOf(sectionIndex, lineIndex);
                  return (
                    <ChartLine
                      key={lineIndex}
                      line={line}
                      number={lineIndex + 1}
                      defaultSurface={defaultSurface}
                      lineKey={key}
                      cursor={active ? cursorFor(slot, lineIndex, cued) : null}
                      looped={loopedKeys.has(key)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
