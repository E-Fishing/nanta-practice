/**
 * Pure editing operations for the piece editor (SPEC.md §4.4).
 *
 * The editor works on raw `PieceJson`, the same shape as `public/pieces/*.json`, so that
 * what it saves is exactly what the loader reads. Every operation here returns a new JSON
 * value and never mutates its input, which keeps undo a matter of remembering old values.
 *
 *  - Token helpers: `formatHit()` builds a canonical token from its parts, `cycleToken()`
 *    is the click cycle "- → R → L → B → ~ → -", `withHit()` applies a menu change, and
 *    `resolveEditorCell()` resolves a token for drawing without ever throwing.
 *  - `emptyPiece()` is the template for a piece built from scratch; `pieceToJson()` turns a
 *    loaded `Piece` back into JSON (for editing a piece from the library), `formatPieceJson()`
 *    pretty-prints with one group per line the way the club's files are written, and
 *    `parsePieceFile()` validates a dropped file.
 *  - Structural operations add, remove, move and update sections, lines, groups, cells,
 *    instruments, surfaces and parts. Removing the last cell of a group removes the group,
 *    the last group removes the line, and the last line of a part in a section removes the
 *    part's key (the part is then silent for that section, as the loader defines it).
 */
import { loadPiece } from './loadPiece';
import { MODIFIER_CHARS, parseCell, TokenError } from './tokens';
import type {
  Cell,
  CellModifiers,
  Dynamic,
  Hand,
  HitCell,
  InstrumentJson,
  LineJson,
  PartJson,
  Piece,
  PieceJson,
  ResolvedCell,
  SectionJson,
  SurfaceJson,
} from './types';

export const REST_TOKEN = '-';
export const EXTENDER_TOKEN = '~';
/** Cells in a freshly added group or line. */
export const NEW_GROUP_CELLS = 4;
/** The click cycle of SPEC §4.4. */
export const HAND_CYCLE: readonly Hand[] = ['R', 'L', 'B'];

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

/** Everything a hit token is made of; `formatHit()` and `parseToken()` convert both ways. */
export interface HitSpec {
  hand: Hand;
  grace: Hand | null;
  surface: string | null;
  modifiers: CellModifiers;
  unknownMarks: string[];
  gueumOverride: string | null;
}

export const NO_MODIFIERS: Readonly<CellModifiers> = { soft: false, accent: false, strong: false, lift: false, cross: false };

/** Modifier characters in the order `formatHit()` writes them. */
const MODIFIER_ORDER: ReadonlyArray<readonly [string, keyof CellModifiers]> = [...MODIFIER_CHARS.entries()];

/** Parse a token, or null when it is not a valid cell (instead of throwing). */
export function parseToken(token: string, surfaces: Iterable<string> = []): Cell | null {
  try {
    return parseCell(token, { surfaces });
  } catch (err) {
    if (err instanceof TokenError) return null;
    throw err;
  }
}

export function hitSpec(cell: HitCell): HitSpec {
  return {
    hand: cell.hand,
    grace: cell.grace,
    surface: cell.surface,
    modifiers: { ...cell.modifiers },
    unknownMarks: [...cell.unknownMarks],
    gueumOverride: cell.gueumOverride,
  };
}

/** The canonical token for a hit: `[grace/]hand[:surface][modifiers][marks][{gueum}]`. */
export function formatHit(spec: HitSpec): string {
  const grace = spec.grace === null ? '' : `${spec.grace}/`;
  const surface = spec.surface === null || spec.surface === '' ? '' : `:${spec.surface}`;
  const modifiers = MODIFIER_ORDER.filter(([, flag]) => spec.modifiers[flag])
    .map(([char]) => char)
    .join('');
  const gueum = spec.gueumOverride === null ? '' : `{${spec.gueumOverride}}`;
  return `${grace}${spec.hand}${surface}${modifiers}${spec.unknownMarks.join('')}${gueum}`;
}

/** SPEC §4.4: a click cycles "- → R → L → B → ~ → -". A hit keeps its marks while its hand changes. */
export function cycleToken(token: string): string {
  const cell = parseToken(token);
  if (cell === null || cell.kind === 'rest') return 'R';
  if (cell.kind === 'extender') return REST_TOKEN;
  const next = HAND_CYCLE[HAND_CYCLE.indexOf(cell.hand) + 1];
  return next === undefined ? EXTENDER_TOKEN : formatHit({ ...hitSpec(cell), hand: next });
}

export interface HitPatch {
  hand?: Hand;
  grace?: Hand | null;
  surface?: string | null;
  modifiers?: Partial<CellModifiers>;
  gueumOverride?: string | null;
}

/** `token` as a hit with `patch` applied; a rest or extender becomes a plain right-hand hit first. */
export function withHit(token: string, patch: HitPatch): string {
  const cell = parseToken(token);
  const base: HitSpec =
    cell !== null && cell.kind === 'hit'
      ? hitSpec(cell)
      : { hand: 'R', grace: null, surface: null, modifiers: { ...NO_MODIFIERS }, unknownMarks: [], gueumOverride: null };
  return formatHit({ ...base, ...patch, modifiers: { ...base.modifiers, ...patch.modifiers } });
}

/** Loudness as one choice: exactly one of soft / accent / strong, or none. */
export function withDynamic(token: string, dynamic: Dynamic): string {
  return withHit(token, { modifiers: { soft: dynamic === 'soft', accent: dynamic === 'accent', strong: dynamic === 'strong' } });
}

/**
 * Resolve a token for drawing with the real `Cell` component. Unlike the loader this never
 * throws: an unknown surface keeps its id (with no sound) so the chart still shows the hit,
 * and a malformed token returns null so the editor can flag it.
 */
export function resolveEditorCell(token: string, instrument: InstrumentJson | undefined): ResolvedCell | null {
  const cell = parseToken(token, instrument ? Object.keys(instrument.surfaces) : []);
  if (cell === null) return null;
  if (cell.kind !== 'hit') return cell;
  const surfaceId = cell.surface ?? instrument?.defaultSurface ?? '';
  const surface: SurfaceJson | undefined = instrument?.surfaces[surfaceId];
  const gueum = cell.gueumOverride ?? surface?.gueum?.[cell.hand] ?? cell.hand;
  return { ...cell, surfaceId, sound: surface?.sound ?? '', gueum };
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

/** A lowercase ASCII id from free text ("Build ×8" → "build-8"); `fallback` when nothing is left. */
export function slugId(text: string, fallback: string): string {
  const slug = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? fallback : slug;
}

/** `base`, or `base-2`, `base-3`, ... until it is not in `taken`. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Whole pieces
// ---------------------------------------------------------------------------

function restGroup(): string[] {
  return Array.from({ length: NEW_GROUP_CELLS }, () => REST_TOKEN);
}

function newLine(): LineJson {
  return { groups: [restGroup()] };
}

/** The starting point for a piece built from scratch: a drum with head and rim, one part, one section. */
export function emptyPiece(): PieceJson {
  return {
    id: 'new-piece',
    title: 'New piece',
    pulseBpm: 300,
    linePause: 2,
    instruments: [
      {
        id: 'drum',
        name: 'Drum',
        defaultSurface: 'head',
        surfaces: {
          head: { sound: 'low', gueum: { B: '덩' } },
          rim: { sound: 'click', gueum: { R: '딱', L: '딱', B: '딱' } },
        },
      },
    ],
    parts: [{ id: 'main', name: 'Main part', instrument: 'drum' }],
    sections: [{ id: 'a', name: 'A', lines: { main: [newLine()] } }],
  };
}

function cloneInstrument(instrument: InstrumentJson): InstrumentJson {
  return {
    id: instrument.id,
    name: instrument.name,
    defaultSurface: instrument.defaultSurface,
    surfaces: Object.fromEntries(
      Object.entries(instrument.surfaces).map(([id, surface]) => [
        id,
        surface.gueum === undefined ? { sound: surface.sound } : { sound: surface.sound, gueum: { ...surface.gueum } },
      ]),
    ),
  };
}

/**
 * A loaded piece back as JSON, with defaults left out (`repeat: 1`, `lead: false`, a line
 * pause equal to the piece's...). Cell tokens are kept exactly as written.
 */
export function pieceToJson(piece: Piece): PieceJson {
  return {
    id: piece.id,
    title: piece.title,
    pulseBpm: piece.pulseBpm,
    ...(piece.linePause !== 0 ? { linePause: piece.linePause } : {}),
    instruments: piece.instruments.map(cloneInstrument),
    parts: piece.parts.map((part) => ({
      id: part.id,
      name: part.name,
      instrument: part.instrument,
      ...(part.lead ? { lead: true } : {}),
    })),
    sections: piece.sections.map((section) => ({
      id: section.id,
      name: section.name,
      ...(section.repeat !== 1 ? { repeat: section.repeat } : {}),
      ...(section.crescendo ? { crescendo: true } : {}),
      ...(section.tempoScale !== 1 ? { tempoScale: section.tempoScale } : {}),
      ...(section.cueIn !== '' ? { cueIn: section.cueIn } : {}),
      lines: Object.fromEntries(
        Object.entries(section.lines).map(([partId, lines]) => [
          partId,
          lines.map((line) => ({
            groups: line.groups.map((group) => group.map((cell) => cell.token)),
            ...(line.note !== null ? { note: line.note } : {}),
            ...(line.pauseAfter !== piece.linePause ? { pauseAfter: line.pauseAfter } : {}),
          })),
        ]),
      ),
    })),
  };
}

const STRING_ARRAY = /\[\s*("(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*)\s*\]/g;

/** Pretty JSON with every innermost string array (a group of tokens) on one line. */
export function formatPieceJson(json: PieceJson): string {
  return `${JSON.stringify(json, null, 2).replace(STRING_ARRAY, (_, items: string) => `[${items.replace(/\s*,\s*/g, ', ')}]`)}\n`;
}

/**
 * Parse the text of a dropped or opened piece file: JSON, then the loader's validation, then
 * back to normalized JSON. Throws an Error with a readable message.
 */
export function parsePieceFile(text: string): PieceJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  return pieceToJson(loadPiece(parsed));
}

/** Pulses of one part in one section: cells, and cells plus line pauses. */
export function partPulses(json: PieceJson, sectionIndex: number, partId: string): { cells: number; pulses: number } | null {
  const lines = json.sections[sectionIndex]?.lines[partId];
  if (lines === undefined) return null;
  let cells = 0;
  let pauses = 0;
  for (const line of lines) {
    for (const group of line.groups) cells += group.length;
    pauses += line.pauseAfter ?? json.linePause ?? 0;
  }
  return { cells, pulses: cells + pauses };
}

// ---------------------------------------------------------------------------
// Immutable update helpers
// ---------------------------------------------------------------------------

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}

/** Swap `index` with `index + delta` when both exist; otherwise unchanged. */
function moveAt<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const moved = [...items];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

function mapSection(json: PieceJson, index: number, fn: (section: SectionJson) => SectionJson): PieceJson {
  const section = json.sections[index];
  if (section === undefined) return json;
  return { ...json, sections: replaceAt(json.sections, index, fn(section)) };
}

/** Replace one part's lines in a section; an empty result removes the part's key (silent part). */
function mapPartLines(json: PieceJson, sectionIndex: number, partId: string, fn: (lines: LineJson[]) => LineJson[]): PieceJson {
  return mapSection(json, sectionIndex, (section) => {
    const next = fn(section.lines[partId] ?? []);
    const lines = { ...section.lines };
    if (next.length === 0) delete lines[partId];
    else lines[partId] = next;
    return { ...section, lines };
  });
}

function mapLine(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, fn: (line: LineJson) => LineJson): PieceJson {
  return mapPartLines(json, sectionIndex, partId, (lines) => {
    const line = lines[lineIndex];
    return line === undefined ? lines : replaceAt(lines, lineIndex, fn(line));
  });
}

/** Replace one line's groups; empty groups are dropped, and a line left without groups is removed. */
function mapGroups(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, fn: (groups: string[][]) => string[][]): PieceJson {
  return mapPartLines(json, sectionIndex, partId, (lines) => {
    const line = lines[lineIndex];
    if (line === undefined) return lines;
    const groups = fn(line.groups).filter((group) => group.length > 0);
    return groups.length === 0 ? removeAt(lines, lineIndex) : replaceAt(lines, lineIndex, { ...line, groups });
  });
}

// ---------------------------------------------------------------------------
// Piece, sections, lines, groups, cells
// ---------------------------------------------------------------------------

export type PieceMetaPatch = Partial<Pick<PieceJson, 'id' | 'title' | 'pulseBpm' | 'linePause'>>;

export function updatePieceMeta(json: PieceJson, patch: PieceMetaPatch): PieceJson {
  const next = { ...json, ...patch };
  if (patch.linePause === 0) delete next.linePause;
  return next;
}

/** A new section named `name` (id from the name) with one line for `partId` (the first part by default). */
export function addSection(json: PieceJson, name: string = `Section ${json.sections.length + 1}`, partId: string = json.parts[0]?.id ?? ''): PieceJson {
  const id = uniqueId(
    slugId(name, 'section'),
    json.sections.map((section) => section.id),
  );
  const lines: Record<string, LineJson[]> = partId === '' ? {} : { [partId]: [newLine()] };
  return { ...json, sections: [...json.sections, { id, name, lines }] };
}

export function removeSection(json: PieceJson, index: number): PieceJson {
  return { ...json, sections: removeAt(json.sections, index) };
}

export function moveSection(json: PieceJson, index: number, delta: number): PieceJson {
  return { ...json, sections: moveAt(json.sections, index, delta) };
}

export type SectionPatch = Partial<Pick<SectionJson, 'id' | 'name' | 'repeat' | 'crescendo' | 'tempoScale' | 'cueIn'>>;

/** Update section fields; a default value (repeat 1, crescendo false, tempoScale 1, empty cueIn) removes the key. */
export function updateSection(json: PieceJson, index: number, patch: SectionPatch): PieceJson {
  return mapSection(json, index, (section) => {
    const next: SectionJson = { ...section, ...patch };
    if (next.repeat === 1) delete next.repeat;
    if (next.crescendo === false) delete next.crescendo;
    if (next.tempoScale === 1) delete next.tempoScale;
    if (next.cueIn === '') delete next.cueIn;
    return next;
  });
}

export function addLine(json: PieceJson, sectionIndex: number, partId: string): PieceJson {
  return mapPartLines(json, sectionIndex, partId, (lines) => [...lines, newLine()]);
}

export function removeLine(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number): PieceJson {
  return mapPartLines(json, sectionIndex, partId, (lines) => removeAt(lines, lineIndex));
}

export function moveLine(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, delta: number): PieceJson {
  return mapPartLines(json, sectionIndex, partId, (lines) => moveAt(lines, lineIndex, delta));
}

export interface LinePatch {
  /** "" or undefined removes the note. */
  note?: string;
  /** undefined restores the piece's `linePause`. */
  pauseAfter?: number;
}

export function updateLine(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, patch: LinePatch): PieceJson {
  return mapLine(json, sectionIndex, partId, lineIndex, (line) => {
    const next: LineJson = { ...line };
    if ('note' in patch) {
      if (patch.note === undefined || patch.note === '') delete next.note;
      else next.note = patch.note;
    }
    if ('pauseAfter' in patch) {
      if (patch.pauseAfter === undefined) delete next.pauseAfter;
      else next.pauseAfter = patch.pauseAfter;
    }
    return next;
  });
}

/** Where a cell sits in the JSON: section index, part id, line, group and cell indices. */
export interface CellLoc {
  sectionIndex: number;
  partId: string;
  lineIndex: number;
  groupIndex: number;
  cellIndex: number;
}

/** The token at `loc`, or null when nothing is there (any more). */
export function cellAt(json: PieceJson, loc: CellLoc): string | null {
  return json.sections[loc.sectionIndex]?.lines[loc.partId]?.[loc.lineIndex]?.groups[loc.groupIndex]?.[loc.cellIndex] ?? null;
}

export function addGroup(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number): PieceJson {
  return mapGroups(json, sectionIndex, partId, lineIndex, (groups) => [...groups, restGroup()]);
}

export function removeGroup(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, groupIndex: number): PieceJson {
  return mapGroups(json, sectionIndex, partId, lineIndex, (groups) => removeAt(groups, groupIndex));
}

/** Append a cell to the end of a group. */
export function appendCell(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, groupIndex: number, token: string = REST_TOKEN): PieceJson {
  return mapGroups(json, sectionIndex, partId, lineIndex, (groups) => {
    const group = groups[groupIndex];
    return group === undefined ? groups : replaceAt(groups, groupIndex, [...group, token]);
  });
}

/** Insert a cell before (`offset` 0) or after (`offset` 1) the cell at `loc`. */
export function insertCell(json: PieceJson, loc: CellLoc, offset: 0 | 1, token: string = REST_TOKEN): PieceJson {
  return mapGroups(json, loc.sectionIndex, loc.partId, loc.lineIndex, (groups) => {
    const group = groups[loc.groupIndex];
    return group === undefined ? groups : replaceAt(groups, loc.groupIndex, insertAt(group, loc.cellIndex + offset, token));
  });
}

export function setCell(json: PieceJson, loc: CellLoc, token: string): PieceJson {
  return mapGroups(json, loc.sectionIndex, loc.partId, loc.lineIndex, (groups) => {
    const group = groups[loc.groupIndex];
    return group === undefined ? groups : replaceAt(groups, loc.groupIndex, replaceAt(group, loc.cellIndex, token));
  });
}

/** Remove one cell. An emptied group, line or part key disappears with it. */
export function removeCell(json: PieceJson, loc: CellLoc): PieceJson {
  return mapGroups(json, loc.sectionIndex, loc.partId, loc.lineIndex, (groups) => {
    const group = groups[loc.groupIndex];
    return group === undefined ? groups : replaceAt(groups, loc.groupIndex, removeAt(group, loc.cellIndex));
  });
}

/** The cell at `loc` starts a new group; the first cell of a group cannot split. */
export function splitGroup(json: PieceJson, loc: CellLoc): PieceJson {
  if (loc.cellIndex === 0) return json;
  return mapGroups(json, loc.sectionIndex, loc.partId, loc.lineIndex, (groups) => {
    const group = groups[loc.groupIndex];
    if (group === undefined || loc.cellIndex >= group.length) return groups;
    return [...groups.slice(0, loc.groupIndex), group.slice(0, loc.cellIndex), group.slice(loc.cellIndex), ...groups.slice(loc.groupIndex + 1)];
  });
}

/** Join a group onto the one before it; the first group has nothing to merge with. */
export function mergeWithPreviousGroup(json: PieceJson, sectionIndex: number, partId: string, lineIndex: number, groupIndex: number): PieceJson {
  if (groupIndex === 0) return json;
  return mapGroups(json, sectionIndex, partId, lineIndex, (groups) => {
    const previous = groups[groupIndex - 1];
    const group = groups[groupIndex];
    if (previous === undefined || group === undefined) return groups;
    return [...groups.slice(0, groupIndex - 1), [...previous, ...group], ...groups.slice(groupIndex + 1)];
  });
}

// ---------------------------------------------------------------------------
// Instruments, surfaces and parts
// ---------------------------------------------------------------------------

function mapInstrument(json: PieceJson, index: number, fn: (instrument: InstrumentJson) => InstrumentJson): PieceJson {
  const instrument = json.instruments[index];
  if (instrument === undefined) return json;
  return { ...json, instruments: replaceAt(json.instruments, index, fn(instrument)) };
}

/** A new instrument with one "head" surface. */
export function addInstrument(json: PieceJson, name: string = `Instrument ${json.instruments.length + 1}`): PieceJson {
  const id = uniqueId(
    slugId(name, 'instrument'),
    json.instruments.map((instrument) => instrument.id),
  );
  const instrument: InstrumentJson = { id, name, defaultSurface: 'head', surfaces: { head: { sound: 'low' } } };
  return { ...json, instruments: [...json.instruments, instrument] };
}

export function removeInstrument(json: PieceJson, index: number): PieceJson {
  return { ...json, instruments: removeAt(json.instruments, index) };
}

export type InstrumentPatch = Partial<Pick<InstrumentJson, 'id' | 'name' | 'defaultSurface'>>;

/** Update instrument fields. Renaming the id follows through to the parts that use it. */
export function updateInstrument(json: PieceJson, index: number, patch: InstrumentPatch): PieceJson {
  const oldId = json.instruments[index]?.id;
  const next = mapInstrument(json, index, (instrument) => ({ ...instrument, ...patch }));
  if (patch.id === undefined || oldId === undefined || patch.id === oldId) return next;
  return { ...next, parts: next.parts.map((part) => (part.instrument === oldId ? { ...part, instrument: patch.id as string } : part)) };
}

/** Add a surface (id must be usable after ":" in a token); a duplicate id leaves the piece unchanged. */
export function addSurface(json: PieceJson, instrumentIndex: number, surfaceId: string, sound: string = 'mid'): PieceJson {
  return mapInstrument(json, instrumentIndex, (instrument) => {
    if (surfaceId === '' || Object.hasOwn(instrument.surfaces, surfaceId)) return instrument;
    return { ...instrument, surfaces: { ...instrument.surfaces, [surfaceId]: { sound } } };
  });
}

export function removeSurface(json: PieceJson, instrumentIndex: number, surfaceId: string): PieceJson {
  return mapInstrument(json, instrumentIndex, (instrument) => {
    const surfaces = { ...instrument.surfaces };
    delete surfaces[surfaceId];
    return { ...instrument, surfaces };
  });
}

export interface SurfacePatch {
  sound?: string;
  /** A syllable per hand; "" removes that hand's syllable. */
  gueum?: Partial<Record<Hand, string>>;
}

export function updateSurface(json: PieceJson, instrumentIndex: number, surfaceId: string, patch: SurfacePatch): PieceJson {
  return mapInstrument(json, instrumentIndex, (instrument) => {
    const surface = instrument.surfaces[surfaceId];
    if (surface === undefined) return instrument;
    const gueum: Partial<Record<Hand, string>> = { ...surface.gueum };
    for (const [hand, syllable] of Object.entries(patch.gueum ?? {}) as [Hand, string | undefined][]) {
      if (syllable === undefined || syllable === '') delete gueum[hand];
      else gueum[hand] = syllable;
    }
    const next: SurfaceJson = { sound: patch.sound ?? surface.sound };
    if (Object.keys(gueum).length > 0) next.gueum = gueum;
    return { ...instrument, surfaces: { ...instrument.surfaces, [surfaceId]: next } };
  });
}

/** A new part on `instrumentId` (the first instrument by default), silent in every section until lines are added. */
export function addPart(json: PieceJson, name: string = `Part ${json.parts.length + 1}`, instrumentId: string = json.instruments[0]?.id ?? ''): PieceJson {
  const id = uniqueId(
    slugId(name, 'part'),
    json.parts.map((part) => part.id),
  );
  return { ...json, parts: [...json.parts, { id, name, instrument: instrumentId }] };
}

/** Remove a part and its lines from every section. */
export function removePart(json: PieceJson, index: number): PieceJson {
  const part = json.parts[index];
  if (part === undefined) return json;
  return {
    ...json,
    parts: removeAt(json.parts, index),
    sections: json.sections.map((section) => {
      if (!Object.hasOwn(section.lines, part.id)) return section;
      const lines = { ...section.lines };
      delete lines[part.id];
      return { ...section, lines };
    }),
  };
}

export type PartPatch = Partial<Pick<PartJson, 'id' | 'name' | 'instrument' | 'lead'>>;

/** Update part fields. `lead: false` removes the key; `lead: true` clears it on every other part. Renaming the id follows through to every section. */
export function updatePart(json: PieceJson, index: number, patch: PartPatch): PieceJson {
  const part = json.parts[index];
  if (part === undefined) return json;
  const parts = json.parts.map((existing, i) => {
    const next: PartJson = i === index ? { ...existing, ...patch } : { ...existing };
    if (i !== index && patch.lead === true) delete next.lead;
    if (next.lead === false) delete next.lead;
    return next;
  });
  const newId = patch.id;
  if (newId === undefined || newId === part.id) return { ...json, parts };
  return {
    ...json,
    parts,
    sections: json.sections.map((section) => {
      if (!Object.hasOwn(section.lines, part.id)) return section;
      const lines: Record<string, LineJson[]> = {};
      for (const [partId, partLines] of Object.entries(section.lines)) lines[partId === part.id ? newId : partId] = partLines;
      return { ...section, lines };
    }),
  };
}
