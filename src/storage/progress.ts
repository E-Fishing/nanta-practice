/**
 * localStorage layer for per-member progress (SPEC.md §4.5).
 *
 * Two keys:
 *  - `nanta.progress.v1`: the `ProgressStore` JSON from §4.5 (members → pieces → sections).
 *  - `nanta.member.v1`:   the name typed into "Who's practicing?" on the Library page.
 *
 * Every storage access is wrapped so private mode, blocked storage, quota errors or a
 * missing `localStorage` (tests, SSR) degrade to "no progress" instead of throwing.
 * Milestone 1 only reads progress and writes the member name; drills write progress in M6.
 */

export const PROGRESS_KEY = 'nanta.progress.v1';
export const MEMBER_KEY = 'nanta.member.v1';

/** One member's progress on one section of one piece (SPEC §4.5). */
export interface SectionProgress {
  /** Best BPM passed in Tap-along at >= 85% accuracy. */
  bestBpm: number;
  /** Accuracy of the last attempt, 0..1. */
  lastAccuracy: number;
  attempts: number;
  /** Date of the last attempt as YYYY-MM-DD (sorts chronologically as a string). */
  lastPracticed: string;
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

function writeItem(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Private mode or quota exceeded: progress is best-effort, never fatal.
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
  if (!isRecord(parsed) || !isRecord(parsed.members)) return emptyProgress();
  return { members: sanitizeMembers(parsed.members) };
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
// Current member
// ---------------------------------------------------------------------------

/** Name from "Who's practicing?", or "" when none is stored. */
export function getCurrentMember(): string {
  return readItem(MEMBER_KEY) ?? '';
}

export function setCurrentMember(name: string): void {
  writeItem(MEMBER_KEY, name);
}
