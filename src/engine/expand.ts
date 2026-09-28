/**
 * Section expander (SPEC.md §3.1 and the audio gotchas in §6).
 *
 * Flattens a resolved `Piece` into a `Timeline`: one entry per pulse across every section and
 * every repeat, in piece order. Each pulse carries
 *  - its `duration` in base pulse units (`1 / section.tempoScale`), so the player schedules
 *    from the timeline and never assumes a constant pulse length;
 *  - its `start`, the running sum of previous durations;
 *  - its crescendo `gainDb`, computed once per repeat rather than per note;
 *  - one `PulseSlot` per part: the cell it plays, a line pause, or silence when the part has
 *    no lines in the section.
 *
 * Line pauses are the only thing besides cells that takes time: after each line's cells come
 * `line.pauseAfter` pulses of silence. Lines and groups are otherwise layout only.
 */
import type { Line, Part, Piece, PulseSlot, Section, SectionSpan, Timeline, TimelinePulse } from './types';

/** Gain of the first repeat of a crescendo section, in dB. The last repeat plays at 0 dB. */
export const CRESCENDO_START_DB = -18;

/**
 * Gain in dB of repeat `rep` (1-based) of a crescendo section played `repeatCount` times:
 * linear in dB from `CRESCENDO_START_DB` at rep 1 to 0 at the last repeat. A section played
 * only once has nothing to ramp and plays at full volume.
 *
 * @throws RangeError when `rep` is outside 1..repeatCount.
 */
export function crescendoDb(rep: number, repeatCount: number): number {
  if (!Number.isInteger(rep) || rep < 1 || rep > repeatCount) {
    throw new RangeError(`crescendo rep ${rep} is outside 1..${repeatCount}`);
  }
  if (repeatCount <= 1) return 0;
  const progress = (rep - 1) / (repeatCount - 1); // 0 at the first repeat, 1 at the last
  return CRESCENDO_START_DB + (0 - CRESCENDO_START_DB) * progress;
}

/** Seconds taken by `units` base pulse units at `bpm` pulses per minute. */
export function unitsToSeconds(units: number, bpm: number): number {
  return (units * 60) / bpm;
}

export interface ExpandOptions {
  /**
   * Expand only these sections, kept in piece order (used for section loops).
   * An id that is not in the piece throws a RangeError naming it.
   */
  sectionIds?: string[];
}

/** Expand a piece (or a subset of its sections) into a flat pulse timeline. Never mutates `piece`. */
export function expandPiece(piece: Piece, options: ExpandOptions = {}): Timeline {
  const pulses: TimelinePulse[] = [];
  const spans: SectionSpan[] = [];
  let start = 0;

  for (const sectionIndex of selectSectionIndices(piece, options.sectionIds)) {
    const section = piece.sections[sectionIndex];
    const passParts = buildPassParts(piece, section);
    const duration = 1 / section.tempoScale;
    const spanStart = pulses.length;

    for (let rep = 1; rep <= section.repeat; rep += 1) {
      // Once per repeat, not per note (SPEC §6).
      const gainDb = section.crescendo ? crescendoDb(rep, section.repeat) : 0;
      for (let pulseInSection = 0; pulseInSection < section.pulses; pulseInSection += 1) {
        pulses.push({
          index: pulses.length,
          sectionIndex,
          sectionId: section.id,
          rep,
          repeatCount: section.repeat,
          pulseInSection,
          duration,
          start,
          gainDb,
          parts: passParts[pulseInSection],
        });
        start += duration;
      }
    }

    spans.push(buildSpan(section, sectionIndex, spanStart, pulses.length));
  }

  return {
    pieceId: piece.id,
    pulseBpm: piece.pulseBpm,
    pulses,
    sections: spans,
    totalPulses: pulses.length,
    totalUnits: start,
  };
}

/** Indices into `piece.sections` to expand, in piece order. */
function selectSectionIndices(piece: Piece, sectionIds: string[] | undefined): number[] {
  const all = piece.sections.map((_section, index) => index);
  if (sectionIds === undefined) return all;

  const wanted = new Set(sectionIds);
  for (const id of wanted) {
    if (!piece.sections.some((section) => section.id === id)) {
      throw new RangeError(`unknown section id "${id}" in piece "${piece.id}"`);
    }
  }
  return all.filter((index) => wanted.has(piece.sections[index].id));
}

/**
 * One pass of `section` for every part of the piece: element `p` holds, per part id, what that
 * part does at pulse `p`. The same records are reused for every repeat of the section.
 */
function buildPassParts(piece: Piece, section: Section): Record<string, PulseSlot>[] {
  const slotsByPart = piece.parts.map((part) => [part.id, buildPartSlots(section, part)] as const);
  return Array.from({ length: section.pulses }, (_unused, p) =>
    Object.fromEntries(slotsByPart.map(([partId, slots]) => [partId, slots[p]])),
  );
}

/**
 * One pass of `section` for a single part as a flat slot list: for each line, its cells in
 * group order followed by `line.pauseAfter` pause slots. A part with no lines in the section is
 * silent at every pulse.
 */
function buildPartSlots(section: Section, part: Part): PulseSlot[] {
  const lines: Line[] | undefined = section.lines[part.id];
  if (lines === undefined) {
    const silent: PulseSlot = { kind: 'silent' };
    return Array.from({ length: section.pulses }, () => silent);
  }

  const slots: PulseSlot[] = [];
  lines.forEach((line, lineIndex) => {
    line.groups.forEach((group, groupIndex) => {
      group.forEach((cell, cellIndex) => {
        slots.push({
          kind: 'cell',
          lineIndex,
          groupIndex,
          cellIndex,
          cell,
          groupStart: cellIndex === 0,
          lineStart: groupIndex === 0 && cellIndex === 0,
        });
      });
    });
    for (let i = 0; i < line.pauseAfter; i += 1) slots.push({ kind: 'pause', lineIndex });
  });

  if (slots.length !== section.pulses) {
    throw new Error(
      `section "${section.id}" part "${part.id}": expected ${section.pulses} pulses per pass, built ${slots.length}`,
    );
  }
  return slots;
}

function buildSpan(section: Section, sectionIndex: number, start: number, end: number): SectionSpan {
  return {
    sectionIndex,
    sectionId: section.id,
    start,
    end,
    pulsesPerRep: section.pulses,
    repeatCount: section.repeat,
  };
}
