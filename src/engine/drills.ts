/**
 * Pure helpers behind the drill modes (SPEC.md §4.3): which cells a drill hides, asks about,
 * sounds or scores. Chart cells are addressed by the keys of components/cellState.ts
 * ("section:line:group:cell", or "section:line:pause" for a breath).
 */
import { chartCellKey } from '../components/cellState';
import type { PulseRange } from './controls';
import { seededRandom, seededShuffle } from './fade';
import { accuracyOf, type CellHeat } from './scorer';
import type { Hand, Piece, PulseSlot, ResolvedCell, Timeline, TimelinePulse } from './types';

export type DrillMode = 'fade' | 'tap' | 'gueum' | 'gap' | 'cue' | 'blind';

/** Every chart cell key of `partId` inside the pulse range, once each, in chart order. */
export function chartKeysInRange(timeline: Timeline, partId: string, range: PulseRange | null): string[] {
  if (range === null) return [];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let i = range.start; i < Math.min(range.end, timeline.totalPulses); i += 1) {
    const pulse = timeline.pulses[i];
    const slot = pulse.parts[partId];
    if (slot === undefined || slot.kind !== 'cell') continue;
    const key = chartCellKey(pulse.sectionIndex, slot.lineIndex, slot.groupIndex, slot.cellIndex);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Fill the gap
// ---------------------------------------------------------------------------

export const GAP_MIN = 3;
export const GAP_MAX = 6;

/** What the member answers for a blanked cell: a hand, or rest for `-` and `~`. */
export type GapAnswer = Hand | 'rest';

export function answerFor(cell: ResolvedCell): GapAnswer {
  return cell.kind === 'hit' ? cell.hand : 'rest';
}

/** The resolved cell a chart key points at in `partId`'s chart, or null (pause key, out of range). */
export function cellAtKey(piece: Piece, partId: string, key: string): ResolvedCell | null {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  const [s, l, g, c] = parts.map(Number);
  if ([s, l, g, c].some((n) => !Number.isInteger(n) || n < 0)) return null;
  return piece.sections[s]?.lines[partId]?.[l]?.groups[g]?.[c] ?? null;
}

/**
 * The cells to blank for one pass: between GAP_MIN and GAP_MAX of `cellKeys` (fewer when the
 * section is that small), chosen by `seed`, returned in chart order.
 */
export function pickGaps(cellKeys: readonly string[], seed: number): string[] {
  if (cellKeys.length === 0) return [];
  const random = seededRandom(seed);
  const count = Math.min(cellKeys.length, GAP_MIN + Math.floor(random() * (GAP_MAX - GAP_MIN + 1)));
  const chosen = new Set(seededShuffle(cellKeys, seed).slice(0, count));
  return cellKeys.filter((key) => chosen.has(key));
}

// ---------------------------------------------------------------------------
// Cue drill
// ---------------------------------------------------------------------------

/** The lead part: the one marked `lead`, else the part being drilled. */
export function leadPartId(piece: Piece, fallback: string): string {
  return piece.parts.find((part) => part.lead)?.id ?? fallback;
}

/**
 * The cue cells of a part: the last group of its last line in every section, the figure the
 * lead plays going into the next section. Only these sound during the Cue drill.
 */
export function cueCellKeys(piece: Piece, partId: string): Set<string> {
  const keys = new Set<string>();
  piece.sections.forEach((section, sectionIndex) => {
    const lines = section.lines[partId];
    if (lines === undefined || lines.length === 0) return;
    const lineIndex = lines.length - 1;
    const groups = lines[lineIndex].groups;
    if (groups.length === 0) return;
    const groupIndex = groups.length - 1;
    groups[groupIndex].forEach((_cell, cellIndex) => keys.add(chartCellKey(sectionIndex, lineIndex, groupIndex, cellIndex)));
  });
  return keys;
}

/**
 * Timeline indices of every section entry for `partId`: the first hit cell of the first pass
 * of each section, what the member must tap on time in the Cue drill.
 */
export function entryIndices(timeline: Timeline, partId: string): Set<number> {
  const entries = new Set<number>();
  for (const span of timeline.sections) {
    for (let i = span.start; i < Math.min(span.end, span.start + span.pulsesPerRep); i += 1) {
      const slot = timeline.pulses[i].parts[partId];
      if (slot !== undefined && slot.kind === 'cell' && slot.cell.kind === 'hit') {
        entries.add(i);
        break;
      }
    }
  }
  return entries;
}

/** True when the pulse is one of the part's section entries. */
export function isEntry(pulse: TimelinePulse, slot: PulseSlot | undefined, entries: ReadonlySet<number>): boolean {
  return slot !== undefined && slot.kind === 'cell' && entries.has(pulse.index);
}

// ---------------------------------------------------------------------------
// Blind run report
// ---------------------------------------------------------------------------

export interface LineScore {
  sectionIndex: number;
  lineIndex: number;
  /** Hit-cell instances scored on the line. */
  due: number;
  accuracy: number;
}

/** "section:line" of a chart cell or pause key. */
export function lineKeyOfChartKey(key: string): string {
  const [section, line] = key.split(':');
  return `${section}:${line}`;
}

/**
 * The `count` lines with the lowest accuracy (ties: more cells due first), from the heat of a
 * run. Lines nothing was due on are left out.
 */
export function worstLines(heat: ReadonlyMap<string, CellHeat>, count: number): LineScore[] {
  const byLine = new Map<string, { due: number; onTime: number; early: number; late: number; extra: number }>();
  for (const [key, cell] of heat) {
    const lineKey = lineKeyOfChartKey(key);
    const entry = byLine.get(lineKey) ?? { due: 0, onTime: 0, early: 0, late: 0, extra: 0 };
    entry.due += cell.due;
    entry.onTime += cell.onTime;
    entry.early += cell.early;
    entry.late += cell.late;
    entry.extra += cell.extra;
    byLine.set(lineKey, entry);
  }
  const scores: LineScore[] = [];
  for (const [lineKey, entry] of byLine) {
    if (entry.due === 0) continue;
    const [sectionIndex, lineIndex] = lineKey.split(':').map(Number);
    scores.push({ sectionIndex, lineIndex, due: entry.due, accuracy: accuracyOf(entry) });
  }
  scores.sort((a, b) => a.accuracy - b.accuracy || b.due - a.due || a.sectionIndex - b.sectionIndex || a.lineIndex - b.lineIndex);
  return scores.slice(0, Math.max(0, count));
}
