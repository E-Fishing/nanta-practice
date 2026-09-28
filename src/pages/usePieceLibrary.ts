/**
 * Loads every piece listed in `public/pieces/index.json`, plus the pieces saved from the
 * editor in this browser, for the Library and Progress pages.
 *
 * Pieces are fetched with `Promise.allSettled`, so one piece that fails validation shows up
 * as an error entry (with the loader's message naming the section and part) without hiding
 * the others. A browser copy with the same id as a bundled piece takes its place (marked
 * `local`); browser-only pieces come after the index. Each loaded piece is expanded once so
 * cards can show pulse count and duration.
 */
import { useEffect, useState } from 'react';
import { expandPiece } from '../engine/expand';
import { PieceValidationError, fetchPiece, fetchPieceIndex, loadPiece } from '../engine/loadPiece';
import type { Piece, PieceIndexEntry, PieceJson, Timeline } from '../engine/types';
import { readLocalPieces } from '../storage/localPieces';

export type PieceEntryState =
  | { status: 'loading'; id: string; local: boolean }
  | { status: 'loaded'; id: string; piece: Piece; timeline: Timeline; local: boolean }
  | { status: 'error'; id: string; message: string; path: string | null; local: boolean };

export interface PieceLibrary {
  /** True until the index and every piece in it have settled. */
  loading: boolean;
  /** Message when `index.json` itself could not be loaded; browser copies are still listed. */
  indexError: string | null;
  /** One entry per piece: index order, then browser-only pieces. */
  entries: PieceEntryState[];
}

const INITIAL: PieceLibrary = { loading: true, indexError: null, entries: [] };

/** Where one library row comes from. */
type Source = { id: string; local: true; json: PieceJson } | { id: string; local: false; entry: PieceIndexEntry };

interface Loaded {
  piece: Piece;
  timeline: Timeline;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadSource(source: Source): Promise<Loaded> {
  const piece = source.local ? loadPiece(source.json) : await fetchPiece(source.entry);
  if (source.local && piece.id !== source.id) {
    throw new Error(`The copy saved in this browser as ${JSON.stringify(source.id)} has id ${JSON.stringify(piece.id)}.`);
  }
  return { piece, timeline: expandPiece(piece) };
}

function settle(source: Source, result: PromiseSettledResult<Loaded>): PieceEntryState {
  if (result.status === 'fulfilled') return { status: 'loaded', id: source.id, local: source.local, ...result.value };
  const path = result.reason instanceof PieceValidationError && result.reason.path !== '' ? result.reason.path : null;
  return { status: 'error', id: source.id, local: source.local, message: errorMessage(result.reason), path };
}

/** Index rows (replaced by a browser copy of the same id) followed by browser-only pieces. */
function collectSources(index: PieceIndexEntry[]): Source[] {
  const local = readLocalPieces().pieces;
  const sources: Source[] = index.map((entry) =>
    Object.hasOwn(local, entry.id) ? { id: entry.id, local: true, json: local[entry.id].json } : { id: entry.id, local: false, entry },
  );
  for (const [id, entry] of Object.entries(local)) {
    if (!index.some((row) => row.id === id)) sources.push({ id, local: true, json: entry.json });
  }
  return sources;
}

export function usePieceLibrary(): PieceLibrary {
  const [library, setLibrary] = useState<PieceLibrary>(INITIAL);

  useEffect(() => {
    let ignore = false;

    async function load(): Promise<void> {
      let index: PieceIndexEntry[] = [];
      let indexError: string | null = null;
      try {
        index = await fetchPieceIndex();
      } catch (err) {
        indexError = errorMessage(err);
      }
      if (ignore) return;
      const sources = collectSources(index);
      setLibrary({ loading: true, indexError, entries: sources.map((source) => ({ status: 'loading', id: source.id, local: source.local })) });

      const results = await Promise.allSettled(sources.map(loadSource));
      if (ignore) return;
      setLibrary({ loading: false, indexError, entries: results.map((result, i) => settle(sources[i], result)) });
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  return library;
}
