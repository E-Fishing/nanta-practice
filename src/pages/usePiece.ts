/**
 * Loads one piece by id for the Player, Drills and Editor pages.
 *
 * A copy saved from the editor in this browser (storage/localPieces.ts) wins over the bundled
 * file of the same id, so a piece built in the editor plays right after a reload. Either way
 * the JSON goes through the loader: a validation failure becomes an error state carrying the
 * loader's message (which names the section and part) and the JSON path.
 */
import { useEffect, useMemo, useState } from 'react';
import { PieceValidationError, fetchPiece, loadPiece } from '../engine/loadPiece';
import type { Piece } from '../engine/types';
import { getLocalPiece } from '../storage/localPieces';

export type PieceState =
  | { status: 'loading' }
  | { status: 'loaded'; piece: Piece; local: boolean }
  | { status: 'error'; message: string; path: string | null; local: boolean };

/** The settled result for one piece id. Kept together so a stale result never shows for a new id. */
interface Settled {
  id: string;
  state: PieceState;
}

const LOADING: PieceState = { status: 'loading' };
const NO_ID: PieceState = { status: 'error', message: 'No piece id in the address.', path: null, local: false };

function errorState(err: unknown, local: boolean): PieceState {
  const message = err instanceof Error ? err.message : String(err);
  const path = err instanceof PieceValidationError && err.path !== '' ? err.path : null;
  return { status: 'error', message, path, local };
}

/** Validate the browser copy of `id`, or null when there is none. */
function loadLocal(id: string): PieceState | null {
  const json = getLocalPiece(id);
  if (json === null) return null;
  try {
    const piece = loadPiece(json);
    if (piece.id !== id) throw new Error(`The copy saved in this browser as ${JSON.stringify(id)} has id ${JSON.stringify(piece.id)}.`);
    return { status: 'loaded', piece, local: true };
  } catch (err) {
    return errorState(err, true);
  }
}

export function usePiece(pieceId: string | undefined): PieceState {
  const [settled, setSettled] = useState<Settled | null>(null);
  // Storage is synchronous, so the browser copy is derived during render (and re-read per id).
  const local = useMemo(() => (pieceId === undefined || pieceId === '' ? null : loadLocal(pieceId)), [pieceId]);

  useEffect(() => {
    if (pieceId === undefined || pieceId === '' || local !== null) return undefined;
    let ignore = false;
    const id = pieceId;

    fetchPiece(id).then(
      (piece) => {
        if (!ignore) setSettled({ id, state: { status: 'loaded', piece, local: false } });
      },
      (err: unknown) => {
        if (!ignore) setSettled({ id, state: errorState(err, false) });
      },
    );

    return () => {
      ignore = true;
    };
  }, [pieceId, local]);

  if (pieceId === undefined || pieceId === '') return NO_ID;
  if (local !== null) return local;
  return settled !== null && settled.id === pieceId ? settled.state : LOADING;
}
