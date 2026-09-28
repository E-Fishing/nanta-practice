/**
 * Loads every piece listed in `public/pieces/index.json` for the Library page.
 *
 * Pieces are fetched with `Promise.allSettled`, so one piece that fails validation shows up
 * as an error entry (with the loader's message naming the section and part) without hiding
 * the others. Each loaded piece is expanded once so cards can show pulse count and duration.
 */
import { useEffect, useState } from 'react';
import { expandPiece } from '../engine/expand';
import { PieceValidationError, fetchPiece, fetchPieceIndex } from '../engine/loadPiece';
import type { Piece, PieceIndexEntry, Timeline } from '../engine/types';

export type PieceEntryState =
  | { status: 'loading'; id: string }
  | { status: 'loaded'; id: string; piece: Piece; timeline: Timeline }
  | { status: 'error'; id: string; message: string; path: string | null };

export interface PieceLibrary {
  /** True until the index and every piece in it have settled. */
  loading: boolean;
  /** Message when `index.json` itself could not be loaded; the entry list is then empty. */
  indexError: string | null;
  /** One entry per index row, in index order. */
  entries: PieceEntryState[];
}

const INITIAL: PieceLibrary = { loading: true, indexError: null, entries: [] };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadEntry(entry: PieceIndexEntry): Promise<{ piece: Piece; timeline: Timeline }> {
  const piece = await fetchPiece(entry);
  return { piece, timeline: expandPiece(piece) };
}

function settle(id: string, result: PromiseSettledResult<{ piece: Piece; timeline: Timeline }>): PieceEntryState {
  if (result.status === 'fulfilled') return { status: 'loaded', id, ...result.value };
  const path = result.reason instanceof PieceValidationError && result.reason.path !== '' ? result.reason.path : null;
  return { status: 'error', id, message: errorMessage(result.reason), path };
}

export function usePieceLibrary(): PieceLibrary {
  const [library, setLibrary] = useState<PieceLibrary>(INITIAL);

  useEffect(() => {
    let ignore = false;

    async function load(): Promise<void> {
      let index: PieceIndexEntry[];
      try {
        index = await fetchPieceIndex();
      } catch (err) {
        if (!ignore) setLibrary({ loading: false, indexError: errorMessage(err), entries: [] });
        return;
      }
      if (ignore) return;
      setLibrary({ loading: true, indexError: null, entries: index.map((entry) => ({ status: 'loading', id: entry.id })) });

      const results = await Promise.allSettled(index.map(loadEntry));
      if (ignore) return;
      setLibrary({ loading: false, indexError: null, entries: results.map((result, i) => settle(index[i].id, result)) });
    }

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  return library;
}
