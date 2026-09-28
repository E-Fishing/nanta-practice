/**
 * localStorage layer for per-member progress (SPEC.md §4.5).
 *
 * Two keys:
 *  - `nanta.progress.v1`: the `ProgressStore` JSON from §4.5 (members → pieces → sections),
 *    plus an optional per-section `history` of attempts for the accuracy-over-time charts.
 *  - `nanta.member.v1`:   the name typed into "Who's practicing?" on the Library page.
 *
 * Every storage access is wrapped so private mode, blocked storage, quota errors or a
 * missing `localStorage` (tests, SSR) degrade to "no progress" instead of throwing.
 * Drills write through `recordAttempt()`; the Progress page exports, imports and merges.
 */
import type { DrillMode } from '../engine/drills';

export const PROGRESS_KEY = 'nanta.progress.v1';
export const MEMBER_KEY = 'nanta.member.v1';

/** Section id under which a whole-piece run is recorded. */
export const PIECE_WIDE_SECTION = '*';
/** Tap-along accuracy needed for a tempo to count as "passed" (SPEC §4.5). */
export const BEST_BPM_MIN_ACCURACY = 0.85;
/** Attempts kept per section for the chart; the oldest fall off. */
export const HISTORY_LIMIT = 200;

/** One recorded run. */
export interface AttemptRecord {
  /** YYYY-MM-DD. */
  date: string;
  /** 0..1, or null for a run that was not scored (Fade without tapping). */
  accuracy: number | null;
  bpm: number;
  mode: DrillMode;
}

/** One member's progress on one section of one piece (SPEC §4.5). */
export interface SectionProgress {
  /** Best BPM passed in Tap-along at >= BEST_BPM_MIN_ACCURACY. 0 when none yet. */
  bestBpm: number;
  /** Accuracy of the last scored attempt, 0..1. */
  lastAccuracy: number;
  attempts: number;
  /** Date of the last attempt as YYYY-MM-DD (sorts chronologically as a string). */
  lastPracticed: string;
  history?: AttemptRecord[];
}

/** Section progress keyed by section id. */
export type PieceProgress = Record<string, SectionProgress>;
/** Piece progress keyed by piece id. */
export type MemberProgress = Record<string, PieceProgress>;

export interface ProgressStore {
  /** Keyed by member name exactly as typed. */
  members: Record<string, MemberProgress>;
}

// ---------------------------------------------------------------------------
// Guarded storage access
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    // Reading the property itself can throw (SecurityError) in sandboxed frames.
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readItem(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): boolean {
  try {
    const store = storage();
    if (store === null) return false;
    store.setItem(key, value);
    return true;
  } catch {
    // Private mode or quota exceeded: progress is best-effort, never fatal.
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Progress store
// ---------------------------------------------------------------------------

export function emptyProgress(): ProgressStore {
  return { members: {} };
}

/** Keep only member/piece/section entries that are objects; drop anything else silently. */
function sanitizeMembers(raw: Record<string, unknown>): Record<string, MemberProgress> {
  const members: Record<string, MemberProgress> = {};
  for (const [member, pieces] of Object.entries(raw)) {
    if (!isRecord(pieces)) continue;
    const memberProgress: MemberProgress = {};
    for (const [pieceId, sections] of Object.entries(pieces)) {
      if (!isRecord(sections)) continue;
      const pieceProgress: PieceProgress = {};
      for (const [sectionId, section] of Object.entries(sections)) {
        if (isRecord(section)) pieceProgress[sectionId] = section as unknown as SectionProgress;
      }
      memberProgress[pieceId] = pieceProgress;
    }
    members[member] = memberProgress;
  }
  return members;
}

/** A store from parsed JSON, or null when the shape is not a `{ members: {...} }` object. */
export function progressFromJson(parsed: unknown): ProgressStore | null {
  if (!isRecord(parsed) || !isRecord(parsed.members)) return null;
  return { members: sanitizeMembers(parsed.members) };
}

/** The stored progress, or an empty store when storage is missing, blocked or corrupt. */
export function readProgress(): ProgressStore {
  const raw = readItem(PROGRESS_KEY);
  if (raw === null) return emptyProgress();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProgress();
  }
  return progressFromJson(parsed) ?? emptyProgress();
}

/** Persist the whole store. False when storage is unavailable. */
export function writeProgress(store: ProgressStore): boolean {
  return writeItem(PROGRESS_KEY, JSON.stringify(store));
}

/** Members with any progress, sorted. */
export function listMembers(store: ProgressStore): string[] {
  return Object.keys(store.members).sort((a, b) => a.localeCompare(b));
}

/** Today as YYYY-MM-DD in local time. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A section record with every field usable, whatever was stored. */
export function normalizeSection(raw: SectionProgress | undefined): SectionProgress {
  const section: Partial<SectionProgress> = isRecord(raw) ? raw : {};
  const history = Array.isArray(section.history)
    ? section.history.filter(
        (entry): entry is AttemptRecord =>
          isRecord(entry) && typeof entry.date === 'string' && typeof entry.bpm === 'number' && (entry.accuracy === null || typeof entry.accuracy === 'number'),
      )
    : [];
  return {
    bestBpm: numberOr(section.bestBpm, 0),
    lastAccuracy: numberOr(section.lastAccuracy, 0),
    attempts: numberOr(section.attempts, 0),
    lastPracticed: typeof section.lastPracticed === 'string' ? section.lastPracticed : '',
    history,
  };
}

/** The section record after one more attempt. Pure. */
export function applyAttempt(section: SectionProgress | undefined, attempt: AttemptRecord): SectionProgress {
  const current = normalizeSection(section);
  const history = [...(current.history ?? []), attempt].slice(-HISTORY_LIMIT);
  const passed = attempt.mode === 'tap' && attempt.accuracy !== null && attempt.accuracy >= BEST_BPM_MIN_ACCURACY;
  return {
    bestBpm: passed ? Math.max(current.bestBpm, Math.round(attempt.bpm)) : current.bestBpm,
    lastAccuracy: attempt.accuracy ?? current.lastAccuracy,
    attempts: current.attempts + 1,
    lastPracticed: attempt.date > current.lastPracticed ? attempt.date : current.lastPracticed,
    history,
  };
}

/**
 * Record a finished run for `member` on `sectionId` of `pieceId` (use `PIECE_WIDE_SECTION`
 * for a whole-piece run) and persist. Returns the updated store, or null when there is no
 * member name to file it under.
 */
export function recordAttempt(member: string, pieceId: string, sectionId: string, attempt: AttemptRecord): ProgressStore | null {
  if (member === '') return null;
  const store = readProgress();
  const pieces = (store.members[member] ??= {});
  const sections = (pieces[pieceId] ??= {});
  sections[sectionId] = applyAttempt(sections[sectionId], attempt);
  writeProgress(store);
  return store;
}

/**
 * Latest `lastPracticed` date across every section of `pieceId` for `member`, or null when
 * that member has no progress on the piece. Dates are YYYY-MM-DD, so string order is date order.
 */
export function getLastPracticed(member: string, pieceId: string): string | null {
  const piece: unknown = readProgress().members[member]?.[pieceId];
  if (!isRecord(piece)) return null;
  let latest: string | null = null;
  for (const section of Object.values(piece)) {
    const date = isRecord(section) ? section.lastPracticed : undefined;
    if (typeof date !== 'string' || date === '') continue;
    if (latest === null || date > latest) latest = date;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/** The store as pretty JSON for a download. */
export function exportProgress(store: ProgressStore = readProgress()): string {
  return JSON.stringify(store, null, 2);
}

/**
 * Parse an exported file. Throws an Error with a readable message for anything that is not a
 * progress store.
 */
export function parseProgressExport(text: string): ProgressStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not JSON.');
  }
  const store = progressFromJson(parsed);
  if (store === null) throw new Error('That file is not a Nanta progress export (no "members" object).');
  return store;
}

function sameAttempt(a: AttemptRecord, b: AttemptRecord): boolean {
  return a.date === b.date && a.accuracy === b.accuracy && a.bpm === b.bpm && a.mode === b.mode;
}

/** Two section records folded into one: the best of each figure, both histories. Pure. */
export function mergeSection(a: SectionProgress | undefined, b: SectionProgress | undefined): SectionProgress {
  const x = normalizeSection(a);
  const y = normalizeSection(b);
  const history = [...(x.history ?? [])];
  for (const entry of y.history ?? []) {
    if (!history.some((existing) => sameAttempt(existing, entry))) history.push(entry);
  }
  history.sort((p, q) => p.date.localeCompare(q.date));
  const latest = y.lastPracticed > x.lastPracticed ? y : x;
  return {
    bestBpm: Math.max(x.bestBpm, y.bestBpm),
    lastAccuracy: latest.lastAccuracy,
    attempts: Math.max(x.attempts, y.attempts, history.length),
    lastPracticed: latest.lastPracticed,
    history: history.slice(-HISTORY_LIMIT),
  };
}

/** `base` with everything in `incoming` folded in (union of members, pieces and sections). Pure. */
export function mergeProgress(base: ProgressStore, incoming: ProgressStore): ProgressStore {
  const members: Record<string, MemberProgress> = {};
  for (const member of new Set([...Object.keys(base.members), ...Object.keys(incoming.members)])) {
    const a = base.members[member] ?? {};
    const b = incoming.members[member] ?? {};
    const pieces: MemberProgress = {};
    for (const pieceId of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const sectionsA = a[pieceId] ?? {};
      const sectionsB = b[pieceId] ?? {};
      const sections: PieceProgress = {};
      for (const sectionId of new Set([...Object.keys(sectionsA), ...Object.keys(sectionsB)])) {
        sections[sectionId] = mergeSection(sectionsA[sectionId], sectionsB[sectionId]);
      }
      pieces[pieceId] = sections;
    }
    members[member] = pieces;
  }
  return { members };
}

/** Merge an export into the stored progress and persist. Returns the merged store. */
export function importProgress(text: string): ProgressStore {
  const merged = mergeProgress(readProgress(), parseProgressExport(text));
  writeProgress(merged);
  return merged;
}

// ---------------------------------------------------------------------------
// Current member
// ---------------------------------------------------------------------------

/** Name from "Who's practicing?", or "" when none is stored. */
export function getCurrentMember(): string {
  return readItem(MEMBER_KEY) ?? '';
}

export function setCurrentMember(name: string): void {
  writeItem(MEMBER_KEY, name);
}
