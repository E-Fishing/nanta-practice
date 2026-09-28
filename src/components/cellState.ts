/**
 * Per-cell drill decorations the Chart draws on top of the notation (SPEC §4.3): a hidden
 * cell (Fade, Gu-eum only) and the tap heat of a cell (Tap-along, Blind run).
 *
 * Cells are addressed by `chartCellKey()`: section index, line index, group index, cell
 * index of one part's chart. A line pause has its own key so a tap in the breath can be shown.
 */
import type { CellHeat } from '../engine/scorer';
import type { PulseSlot } from '../engine/types';

export interface CellState {
  /** Notation hidden, only the square remains. */
  hidden?: boolean;
  /** Hand letter hidden, syllable kept (Gu-eum only). */
  hideHand?: boolean;
  /** Syllable hidden (Gu-eum only, stage 2). */
  hideGueum?: boolean;
  /** Fill the gap: answered wrong or not at all (red outline). */
  wrong?: boolean;
  heat?: CellHeat | null;
}

export function chartCellKey(sectionIndex: number, lineIndex: number, groupIndex: number, cellIndex: number): string {
  return `${sectionIndex}:${lineIndex}:${groupIndex}:${cellIndex}`;
}

export function chartPauseKey(sectionIndex: number, lineIndex: number): string {
  return `${sectionIndex}:${lineIndex}:pause`;
}

/** Key of the chart position a part plays at a pulse, or null when the part is silent there. */
export function slotKey(sectionIndex: number, slot: PulseSlot | undefined): string | null {
  if (slot === undefined || slot.kind === 'silent') return null;
  if (slot.kind === 'pause') return chartPauseKey(sectionIndex, slot.lineIndex);
  return chartCellKey(sectionIndex, slot.lineIndex, slot.groupIndex, slot.cellIndex);
}
