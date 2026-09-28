/**
 * Loads one piece by id for the Player (and later the Drills and Editor pages).
 * Mirrors `usePieceLibrary`: a validation failure becomes an error state carrying the
 * loader's message (which names the section and part) and the JSON path.
 */
import { useEffect, useState } from 'react';
import { PieceValidationError, fetchPiece } from '../engine/loadPiece';
import type { Piece } from '../engine/types';

export type PieceState =
  | { status: 'loading' }
  | { status: 'loaded'; piece: Piece }
  | { status: 'error'; message: string; path: string | null };

/** The settled result for one piece id. Kept together so a stale result never shows for a new id. */
interface Settled {
  id: string;
  state: PieceState;
}

const LOADING: PieceState = { status: 'loading' };
const NO_ID: PieceState = { status: 'error', message: 'No piece id in the address.', path: null };

function errorState(err: unknown): PieceState {
  const message = err instanceof Error ? err.message : String(err);
  const path = err instanceof PieceValidationError && err.path !== '' ? err.path : null;
  return { status: 'error', message, path };
}

export function usePiece(pieceId: string | undefined): PieceState {
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (pieceId === undefined || pieceId === '') return undefined;
    let ignore = false;
    const id = pieceId;

    fetchPiece(id).then(
      (piece) => {
        if (!ignore) setSettled({ id, state: { status: 'loaded', piece } });
      },
      (err: unknown) => {
        if (!ignore) setSettled({ id, state: errorState(err) });
      },
    );

    return () => {
      ignore = true;
    };
  }, [pieceId]);

  if (pieceId === undefined || pieceId === '') return NO_ID;
  return settled !== null && settled.id === pieceId ? settled.state : LOADING;
}
