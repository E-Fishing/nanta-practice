/**
 * Piece loader (SPEC.md §3.1, §3.3).
 *
 * `loadPiece()` turns the raw JSON of `public/pieces/*.json` into a resolved `Piece`:
 *  - validates every field and fills defaults (linePause, repeat, crescendo, tempoScale,
 *    cueIn, lead, note, pauseAfter);
 *  - parses every cell token with `parseCell()` from tokens.ts;
 *  - resolves each hit's surface, sound and displayed gu-eum syllable against the part's
 *    instrument (§3.3: override, else surface gueum[hand], else the hand letter);
 *  - checks that every part present in a section has the same total pulse count.
 *
 * It is pure and synchronous: it never mutates its input and throws `PieceValidationError`
 * (never a raw TypeError) on any problem. Every error carries the JSON path of the offending
 * value plus the section id and part id when they are known, and its message names them.
 * Unknown extra keys are ignored everywhere.
 *
 * `pieceUrl()`, `fetchPieceIndex()` and `fetchPiece()` locate and fetch piece files under
 * `<base>/pieces/`.
 */
import { SURFACE_ID_PATTERN, isHand, parseCell, TokenError } from './tokens';
import type {
  Cell,
  Hand,
  HitCell,
  Instrument,
  Line,
  Part,
  Piece,
  PieceIndexEntry,
  ResolvedCell,
  Section,
  SurfaceJson,
} from './types';

export class PieceValidationError extends Error {
  /** Section the problem is in, when known. */
  readonly sectionId: string | null;
  /** Part the problem is in (or the unknown part id that was referenced), when known. */
  readonly partId: string | null;
  /** JSON path of the offending value, e.g. 'sections[2].lines.hard[1].groups[0][3]'. */
  readonly path: string;

  constructor(message: string, path: string, sectionId: string | null = null, partId: string | null = null) {
    super(message);
    this.name = 'PieceValidationError';
    this.path = path;
    this.sectionId = sectionId;
    this.partId = partId;
  }
}

// ---------------------------------------------------------------------------
// Location tracking and small type checks
// ---------------------------------------------------------------------------

/** Where a validator currently is in the JSON. Every error is built from one of these. */
interface Where {
  path: string;
  sectionId: string | null;
  partId: string | null;
}

type Ids = Partial<Pick<Where, 'sectionId' | 'partId'>>;
type JsonObject = Record<string, unknown>;

const ROOT: Where = { path: '', sectionId: null, partId: null };

/** Descend into a key (`.key`) or an index (`[i]`), optionally learning a section/part id. */
function at(where: Where, key: string | number, ids: Ids = {}): Where {
  const suffix = typeof key === 'number' ? `[${key}]` : where.path === '' ? key : `.${key}`;
  return { ...where, ...ids, path: where.path + suffix };
}

/** Same path, with a section/part id learned. */
function withIds(where: Where, ids: Ids): Where {
  return { ...where, ...ids };
}

/** `section "a", part "hard": ` prefix for messages, from whatever ids are known. */
function locate(where: Where): string {
  const bits: string[] = [];
  if (where.sectionId !== null) bits.push(`section ${JSON.stringify(where.sectionId)}`);
  if (where.partId !== null) bits.push(`part ${JSON.stringify(where.partId)}`);
  return bits.length === 0 ? '' : `${bits.join(', ')}: `;
}

function fail(where: Where, message: string): never {
  throw new PieceValidationError(`${locate(where)}${message}`, where.path, where.sectionId, where.partId);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Short description of a wrong value for messages. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object') return 'an object';
  return String(value);
}

function requireRecord(value: unknown, where: Where): JsonObject {
  if (!isRecord(value)) fail(where, `${where.path || 'piece'} must be an object, got ${describe(value)}`);
  return value;
}

function requireArray(value: unknown, where: Where): unknown[] {
  if (!Array.isArray(value)) fail(where, `${where.path} must be an array, got ${describe(value)}`);
  if (value.length === 0) fail(where, `${where.path} must not be empty`);
  return value;
}

function requireString(value: unknown, where: Where): string {
  if (typeof value !== 'string') fail(where, `${where.path} must be a string, got ${describe(value)}`);
  return value;
}

function requireId(value: unknown, where: Where): string {
  if (typeof value !== 'string' || value === '') {
    fail(where, `${where.path} must be a non-empty string, got ${describe(value)}`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, where: Where): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail(where, `${where.path} must be a number greater than 0, got ${describe(value)}`);
  }
  return value;
}

function optionalString(value: unknown, where: Where, fallback: string): string {
  return value === undefined ? fallback : requireString(value, where);
}

function optionalBoolean(value: unknown, where: Where, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') fail(where, `${where.path} must be true or false, got ${describe(value)}`);
  return value;
}

function optionalInteger(value: unknown, where: Where, min: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    fail(where, `${where.path} must be an integer >= ${min}, got ${describe(value)}`);
  }
  return value;
}

function optionalPositiveNumber(value: unknown, where: Where, fallback: number): number {
  return value === undefined ? fallback : requirePositiveNumber(value, where);
}

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

function validateInstruments(raw: unknown, where: Where): Instrument[] {
  const seen = new Set<string>();
  return requireArray(raw, where).map((item, i) => {
    const instrument = validateInstrument(item, at(where, i));
    if (seen.has(instrument.id)) fail(at(at(where, i), 'id'), `duplicate instrument id ${JSON.stringify(instrument.id)}`);
    seen.add(instrument.id);
    return instrument;
  });
}

function validateInstrument(raw: unknown, where: Where): Instrument {
  const obj = requireRecord(raw, where);
  const id = requireId(obj.id, at(where, 'id'));
  const name = requireString(obj.name, at(where, 'name'));
  const surfaces = validateSurfaces(obj.surfaces, at(where, 'surfaces'));
  const defaultSurface = requireId(obj.defaultSurface, at(where, 'defaultSurface'));
  if (!Object.hasOwn(surfaces, defaultSurface)) {
    fail(
      at(where, 'defaultSurface'),
      `instrument ${JSON.stringify(id)}: defaultSurface ${JSON.stringify(defaultSurface)} is not one of its surfaces ` +
        `(${Object.keys(surfaces).join(', ')})`,
    );
  }
  return { id, name, defaultSurface, surfaces };
}

function validateSurfaces(raw: unknown, where: Where): Record<string, SurfaceJson> {
  const obj = requireRecord(raw, where);
  const ids = Object.keys(obj);
  if (ids.length === 0) fail(where, `${where.path} must have at least one surface`);
  return Object.fromEntries(
    ids.map((surfaceId) => {
      if (surfaceId === '') fail(at(where, surfaceId), `${where.path} has an empty surface id`);
      if (!SURFACE_ID_PATTERN.test(surfaceId)) {
        fail(
          at(where, surfaceId),
          `surface id ${JSON.stringify(surfaceId)} must use only letters, digits and hyphens ` +
            `so it can be written as ":${surfaceId}" in a cell token`,
        );
      }
      return [surfaceId, validateSurface(obj[surfaceId], at(where, surfaceId))];
    }),
  );
}

function validateSurface(raw: unknown, where: Where): SurfaceJson {
  const obj = requireRecord(raw, where);
  const sound = requireId(obj.sound, at(where, 'sound'));
  if (obj.gueum === undefined) return { sound };
  return { sound, gueum: validateGueum(obj.gueum, at(where, 'gueum')) };
}

function validateGueum(raw: unknown, where: Where): Partial<Record<Hand, string>> {
  const obj = requireRecord(raw, where);
  const gueum: Partial<Record<Hand, string>> = {};
  for (const key of Object.keys(obj)) {
    if (!isHand(key)) fail(at(where, key), `${where.path} keys must be R, L or B, got ${JSON.stringify(key)}`);
    gueum[key] = requireString(obj[key], at(where, key));
  }
  return gueum;
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

function validateParts(raw: unknown, where: Where, instruments: Instrument[]): Part[] {
  const instrumentIds = instruments.map((instrument) => instrument.id);
  const seen = new Set<string>();
  let leadId: string | null = null;
  const parts: Part[] = [];
  for (const [i, item] of requireArray(raw, where).entries()) {
    const part = validatePart(item, at(where, i), instrumentIds);
    const here = at(where, i, { partId: part.id });
    if (seen.has(part.id)) fail(at(here, 'id'), `duplicate part id ${JSON.stringify(part.id)}`);
    seen.add(part.id);
    if (part.lead) {
      if (leadId !== null) fail(at(here, 'lead'), `only one part may be lead, but ${JSON.stringify(leadId)} already is`);
      leadId = part.id;
    }
    parts.push(part);
  }
  return parts;
}

function validatePart(raw: unknown, where: Where, instrumentIds: readonly string[]): Part {
  const obj = requireRecord(raw, where);
  const id = requireId(obj.id, at(where, 'id'));
  const here = withIds(where, { partId: id });
  const name = requireString(obj.name, at(here, 'name'));
  const instrument = requireId(obj.instrument, at(here, 'instrument'));
  if (!instrumentIds.includes(instrument)) {
    fail(at(here, 'instrument'), `unknown instrument ${JSON.stringify(instrument)} (instruments: ${instrumentIds.join(', ')})`);
  }
  const lead = optionalBoolean(obj.lead, at(here, 'lead'), false);
  return { id, name, instrument, lead };
}

// ---------------------------------------------------------------------------
// Sections, lines and cells
// ---------------------------------------------------------------------------

/** Piece-level facts every section needs. */
interface PieceContext {
  parts: Part[];
  instruments: ReadonlyMap<string, Instrument>;
  linePause: number;
}

/** Facts needed to resolve one part's lines. */
interface PartContext {
  instrument: Instrument;
  surfaceIds: string[];
  linePause: number;
}

/** 0-based position of a cell inside a part's chart; messages show it 1-based. */
interface CellPos {
  line: number;
  group: number;
  cell: number;
}

function validateSections(raw: unknown, where: Where, ctx: PieceContext): Section[] {
  const seen = new Set<string>();
  return requireArray(raw, where).map((item, i) => {
    const section = validateSection(item, at(where, i), ctx);
    if (seen.has(section.id)) {
      fail(at(at(where, i, { sectionId: section.id }), 'id'), `duplicate section id ${JSON.stringify(section.id)}`);
    }
    seen.add(section.id);
    return section;
  });
}

function validateSection(raw: unknown, where: Where, ctx: PieceContext): Section {
  const obj = requireRecord(raw, where);
  const id = requireId(obj.id, at(where, 'id'));
  const here = withIds(where, { sectionId: id });
  const name = requireString(obj.name, at(here, 'name'));
  const repeat = optionalInteger(obj.repeat, at(here, 'repeat'), 1, 1);
  const crescendo = optionalBoolean(obj.crescendo, at(here, 'crescendo'), false);
  const tempoScale = optionalPositiveNumber(obj.tempoScale, at(here, 'tempoScale'), 1);
  const cueIn = optionalString(obj.cueIn, at(here, 'cueIn'), '');
  const lines = validateSectionLines(obj.lines, at(here, 'lines'), ctx);
  const { pulses, cellPulses } = checkPulseCounts(lines, ctx.parts, at(here, 'lines'));
  return { id, name, repeat, crescendo, tempoScale, cueIn, lines, pulses, cellPulses };
}

/** `lines` keyed by part id: every key must be a part, at least one part must be present. */
function validateSectionLines(raw: unknown, where: Where, ctx: PieceContext): Record<string, Line[]> {
  const obj = requireRecord(raw, where);
  const partIds = ctx.parts.map((part) => part.id);
  for (const key of Object.keys(obj)) {
    if (!partIds.includes(key)) {
      fail(at(where, key, { partId: key }), `lines refer to unknown part ${JSON.stringify(key)} (parts: ${partIds.join(', ')})`);
    }
  }
  const present = ctx.parts.filter((part) => Object.hasOwn(obj, part.id));
  if (present.length === 0) fail(where, `section has no lines for any part (parts: ${partIds.join(', ')})`);
  return Object.fromEntries(
    present.map((part) => {
      const here = at(where, part.id, { partId: part.id });
      const instrument = ctx.instruments.get(part.instrument) ?? fail(here, `unknown instrument ${part.instrument}`);
      const partCtx: PartContext = { instrument, surfaceIds: Object.keys(instrument.surfaces), linePause: ctx.linePause };
      return [part.id, validatePartLines(obj[part.id], here, partCtx)];
    }),
  );
}

function validatePartLines(raw: unknown, where: Where, ctx: PartContext): Line[] {
  if (Array.isArray(raw) && raw.length === 0) {
    fail(where, `${where.path} is empty; remove the key to make the part silent in this section`);
  }
  return requireArray(raw, where).map((item, line) => resolveLine(item, at(where, line), line, ctx));
}

/** One chart line: parse and resolve its groups, fill `note`/`pauseAfter`, count its cells. */
function resolveLine(raw: unknown, where: Where, line: number, ctx: PartContext): Line {
  const obj = requireRecord(raw, where);
  const groupsWhere = at(where, 'groups');
  const groups = requireArray(obj.groups, groupsWhere).map((item, group) =>
    resolveGroup(item, at(groupsWhere, group), { line, group, cell: 0 }, ctx),
  );
  const note = obj.note === undefined ? null : requireString(obj.note, at(where, 'note'));
  const pauseAfter = optionalInteger(obj.pauseAfter, at(where, 'pauseAfter'), 0, ctx.linePause);
  const cellPulses = groups.reduce((sum, group) => sum + group.length, 0);
  return { groups, note, pauseAfter, cellPulses };
}

function resolveGroup(raw: unknown, where: Where, pos: CellPos, ctx: PartContext): ResolvedCell[] {
  return requireArray(raw, where).map((token, cell) => resolveCell(token, at(where, cell), { ...pos, cell }, ctx));
}

function cellLabel(pos: CellPos): string {
  return `line ${pos.line + 1}, group ${pos.group + 1}, cell ${pos.cell + 1}`;
}

/** Parse one token and, for a hit, resolve its surface, sound and gu-eum (SPEC §3.3). */
function resolveCell(raw: unknown, where: Where, pos: CellPos, ctx: PartContext): ResolvedCell {
  if (typeof raw !== 'string') fail(where, `${cellLabel(pos)}: cell must be a token string, got ${describe(raw)}`);
  const cell = parseToken(raw, where, pos, ctx);
  if (cell.kind !== 'hit') return cell;
  const { instrument } = ctx;
  const surfaceId = cell.surface ?? instrument.defaultSurface;
  if (!Object.hasOwn(instrument.surfaces, surfaceId)) {
    fail(
      where,
      `${cellLabel(pos)}: token ${JSON.stringify(raw)} uses surface ${JSON.stringify(surfaceId)}, ` +
        `which instrument ${JSON.stringify(instrument.id)} does not have (surfaces: ${ctx.surfaceIds.join(', ')})`,
    );
  }
  const surface = instrument.surfaces[surfaceId];
  return { ...cell, surfaceId, sound: surface.sound, gueum: resolveGueum(cell, surface) };
}

function parseToken(token: string, where: Where, pos: CellPos, ctx: PartContext): Cell {
  try {
    return parseCell(token, { surfaces: ctx.surfaceIds });
  } catch (err) {
    if (err instanceof TokenError) fail(where, `${cellLabel(pos)}: ${err.message}`);
    throw err;
  }
}

/** SPEC §3.3: the `{override}` if present (may be ""), else the surface's syllable for the hand, else the hand letter. */
function resolveGueum(cell: HitCell, surface: SurfaceJson): string {
  if (cell.gueumOverride !== null) return cell.gueumOverride;
  return surface.gueum?.[cell.hand] ?? cell.hand;
}

// ---------------------------------------------------------------------------
// Pulse-count check
// ---------------------------------------------------------------------------

interface PulseTotals {
  pulses: number;
  cellPulses: number;
  pausePulses: number;
}

function totalsOf(lines: Line[]): PulseTotals {
  let cellPulses = 0;
  let pausePulses = 0;
  for (const line of lines) {
    cellPulses += line.cellPulses;
    pausePulses += line.pauseAfter;
  }
  return { pulses: cellPulses + pausePulses, cellPulses, pausePulses };
}

function describeTotals(totals: PulseTotals): string {
  return `${totals.pulses} pulses (${totals.cellPulses} cells + ${totals.pausePulses} line pause)`;
}

/**
 * The Milestone 1 pulse-count check (SPEC §3.1): within a section every part present must
 * have the same total pulse count, where "total" is cells PLUS line pauses. Line pauses are
 * real time during playback, so two parts whose cell counts match but whose pauses differ
 * would drift apart and the section would end at different moments for each part. A
 * cells-equal-but-pauses-differ mismatch is fixed by setting `pauseAfter` on a line of the
 * part that is off (0 removes the pause, a larger value adds one).
 *
 * Parts are visited in `piece.parts` order. The first part present defines the section's
 * `pulses` and `cellPulses`; every other present part is compared to it. Parts absent from
 * the section are skipped (they are silent for it).
 */
function checkPulseCounts(
  lines: Record<string, Line[]>,
  parts: Part[],
  where: Where,
): { pulses: number; cellPulses: number } {
  let reference: { partId: string; totals: PulseTotals } | null = null;
  for (const part of parts) {
    if (!Object.hasOwn(lines, part.id)) continue;
    const totals = totalsOf(lines[part.id]);
    if (reference === null) {
      reference = { partId: part.id, totals };
      continue;
    }
    if (totals.pulses !== reference.totals.pulses) {
      const hint =
        totals.cellPulses === reference.totals.cellPulses
          ? 'The cell counts match but the line pauses differ; set "pauseAfter" on a line to fix the total.'
          : 'Every part present in a section must have the same total pulse count (cells + line pauses).';
      fail(
        at(where, part.id, { partId: part.id }),
        `${describeTotals(totals)} but part ${JSON.stringify(reference.partId)} has ${describeTotals(reference.totals)}. ${hint}`,
      );
    }
  }
  if (reference === null) fail(where, 'section has no lines for any part');
  return { pulses: reference.totals.pulses, cellPulses: reference.totals.cellPulses };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate raw piece JSON and resolve it into a `Piece` with every default filled.
 * Pure and synchronous; never mutates `json`; throws `PieceValidationError` on any problem.
 */
export function loadPiece(json: unknown): Piece {
  const obj = requireRecord(json, ROOT);
  const id = requireId(obj.id, at(ROOT, 'id'));
  const title = requireString(obj.title, at(ROOT, 'title'));
  const pulseBpm = requirePositiveNumber(obj.pulseBpm, at(ROOT, 'pulseBpm'));
  const linePause = optionalInteger(obj.linePause, at(ROOT, 'linePause'), 0, 0);
  const instruments = validateInstruments(obj.instruments, at(ROOT, 'instruments'));
  const parts = validateParts(obj.parts, at(ROOT, 'parts'), instruments);
  const ctx: PieceContext = {
    parts,
    instruments: new Map(instruments.map((instrument) => [instrument.id, instrument])),
    linePause,
  };
  const sections = validateSections(obj.sections, at(ROOT, 'sections'), ctx);
  return { id, title, pulseBpm, linePause, instruments, parts, sections };
}

/** `baseUrl` with exactly one trailing slash; "" stays "" (relative to the document). */
function normalizeBase(baseUrl: string): string {
  if (baseUrl === '') return '';
  return `${baseUrl.replace(/\/+$/, '')}/`;
}

/** URL of a piece file: `<base>/pieces/<entry.file>` or `<base>/pieces/<id>.json`. */
export function pieceUrl(idOrEntry: string | PieceIndexEntry, baseUrl: string = import.meta.env.BASE_URL): string {
  const file = typeof idOrEntry === 'string' ? `${idOrEntry}.json` : idOrEntry.file;
  return `${normalizeBase(baseUrl)}pieces/${file.replace(/^\/+/, '')}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** GET a JSON document; every failure becomes an Error naming the URL. */
async function fetchJson(url: string, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Could not load ${what} from ${url}: ${errorMessage(err)}`);
  }
  if (!response.ok) {
    throw new Error(`Could not load ${what} from ${url}: HTTP ${response.status} ${response.statusText}`.trimEnd());
  }
  try {
    return await response.json();
  } catch (err) {
    throw new Error(`Could not load ${what} from ${url}: response is not valid JSON (${errorMessage(err)})`);
  }
}

function validatePieceIndex(json: unknown, url: string): PieceIndexEntry[] {
  const malformed = (problem: string): never => {
    throw new Error(`Piece index at ${url} is malformed: ${problem}`);
  };
  const pieces: unknown = isRecord(json) ? json.pieces : undefined;
  if (!Array.isArray(pieces)) return malformed('expected an object with a "pieces" array');
  return pieces.map((entry: unknown, i) => {
    if (!isRecord(entry)) return malformed(`pieces[${i}] must be an object`);
    const { id, file } = entry;
    if (typeof id !== 'string' || id === '') return malformed(`pieces[${i}].id must be a non-empty string`);
    if (typeof file !== 'string' || file === '') return malformed(`pieces[${i}].file must be a non-empty string`);
    return { id, file };
  });
}

/** Fetch and validate `<base>/pieces/index.json`. */
export async function fetchPieceIndex(baseUrl: string = import.meta.env.BASE_URL): Promise<PieceIndexEntry[]> {
  const url = `${normalizeBase(baseUrl)}pieces/index.json`;
  return validatePieceIndex(await fetchJson(url, 'the piece index'), url);
}

/** The index entry for `id`: from index.json when it lists the id, else `<id>.json` by convention. */
async function resolveEntry(id: string, baseUrl: string): Promise<PieceIndexEntry> {
  let index: PieceIndexEntry[] = [];
  try {
    index = await fetchPieceIndex(baseUrl);
  } catch {
    // No usable index: fall back to the file-name convention below.
  }
  return index.find((entry) => entry.id === id) ?? { id, file: `${id}.json` };
}

/**
 * Fetch a piece file and run it through `loadPiece()`. A bare id is looked up in index.json
 * first, so the listed file name wins, and falls back to `<id>.json`. The file's own id must
 * match the id it was requested under, otherwise routes built from one would not find the other.
 */
export async function fetchPiece(idOrEntry: string | PieceIndexEntry, baseUrl: string = import.meta.env.BASE_URL): Promise<Piece> {
  const entry = typeof idOrEntry === 'string' ? await resolveEntry(idOrEntry, baseUrl) : idOrEntry;
  const url = pieceUrl(entry, baseUrl);
  const piece = loadPiece(await fetchJson(url, `piece ${JSON.stringify(entry.id)}`));
  if (piece.id !== entry.id) {
    throw new Error(
      `Piece file ${url} has id ${JSON.stringify(piece.id)} but it was requested as ${JSON.stringify(entry.id)}; ` +
        'make the id in the file and in index.json the same',
    );
  }
  return piece;
}
