/**
 * Pieces saved from the editor, kept in this browser (SPEC.md §4.4, M7).
 *
 * v1 has no backend: "Save" downloads the piece file, and this module keeps a copy under
 * `nanta.pieces.v1` so the piece can be played (and edited again) after a reload on the same
 * device. A local piece with the same id as a bundled one shadows it in the Library and the
 * player until the local copy is removed. To share a piece with the club, the downloaded file
 * goes into `public/pieces/` and `index.json`.
 *
 * Storage is best-effort (see browserStorage.ts): pieces are validated again by the loader
 * when they are read, so a corrupt entry shows up as an error, never as a crash.
 */
import type { PieceJson } from '../engine/types';
import { isRecord, readItem, writeItem } from './browserStorage';

export const LOCAL_PIECES_KEY = 'nanta.pieces.v1';

export interface LocalPieceEntry {
  json: PieceJson;
  /** ISO timestamp of the save. */
  savedAt: string;
}

export interface LocalPiecesStore {
  pieces: Record<string, LocalPieceEntry>;
}

/** The store, or an empty one when storage is missing, blocked or corrupt. */
export function readLocalPieces(): LocalPiecesStore {
  const raw = readItem(LOCAL_PIECES_KEY);
  if (raw === null) return { pieces: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { pieces: {} };
  }
  if (!isRecord(parsed) || !isRecord(parsed.pieces)) return { pieces: {} };
  const pieces: Record<string, LocalPieceEntry> = {};
  for (const [id, entry] of Object.entries(parsed.pieces)) {
    if (!isRecord(entry) || !isRecord(entry.json)) continue;
    pieces[id] = { json: entry.json as unknown as PieceJson, savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : '' };
  }
  return { pieces };
}

function writeLocalPieces(store: LocalPiecesStore): boolean {
  return writeItem(LOCAL_PIECES_KEY, JSON.stringify(store));
}

/** Every saved piece, most recently saved first. */
export function listLocalPieces(): (LocalPieceEntry & { id: string })[] {
  return Object.entries(readLocalPieces().pieces)
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** The saved JSON for `id`, or null. Not validated: run it through `loadPiece()`. */
export function getLocalPiece(id: string): PieceJson | null {
  return readLocalPieces().pieces[id]?.json ?? null;
}

/** Keep a copy of `json` under its own id. False when storage is unavailable. */
export function saveLocalPiece(json: PieceJson, now: Date = new Date()): boolean {
  const store = readLocalPieces();
  store.pieces[json.id] = { json, savedAt: now.toISOString() };
  return writeLocalPieces(store);
}

/** Forget the local copy of `id`; the bundled file (if any) shows again. */
export function removeLocalPiece(id: string): boolean {
  const store = readLocalPieces();
  if (!Object.hasOwn(store.pieces, id)) return true;
  delete store.pieces[id];
  return writeLocalPieces(store);
}
