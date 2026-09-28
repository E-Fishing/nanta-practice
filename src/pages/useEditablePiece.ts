/**
 * Editor state: the piece JSON being edited, undo/redo history, the saved point for the
 * unsaved-changes warning, and the loader's verdict on the current JSON.
 *
 * Every edit goes through `apply(fn)` with a pure function from editPiece.ts, so history is
 * just the previous JSON values (they are immutable). `dirty` compares the present value with
 * the last saved one by identity: undoing back to the saved state makes the editor clean again.
 */
import { useCallback, useMemo, useState } from 'react';
import { PieceValidationError, loadPiece } from '../engine/loadPiece';
import type { Piece, PieceJson } from '../engine/types';

/** Undo steps kept. */
export const HISTORY_LIMIT = 200;

export interface PieceProblem {
  message: string;
  path: string | null;
}

export interface EditablePiece {
  json: PieceJson;
  /** The validated piece, or null while the JSON has a problem. */
  piece: Piece | null;
  /** What the loader rejects, or null when the piece is valid. */
  problem: PieceProblem | null;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Apply a pure edit; a function returning the same object records nothing. */
  apply: (edit: (json: PieceJson) => PieceJson) => void;
  /** Start over from `json` (a loaded file, a new piece): clears history. `saved: false` marks it unsaved. */
  replace: (json: PieceJson, options?: { saved?: boolean }) => void;
  /** The current JSON is now on disk. */
  markSaved: () => void;
  undo: () => void;
  redo: () => void;
}

interface History {
  present: PieceJson;
  past: PieceJson[];
  future: PieceJson[];
  /** The last saved value, or null when the present value was never saved from here. */
  saved: PieceJson | null;
}

function validate(json: PieceJson): { piece: Piece | null; problem: PieceProblem | null } {
  try {
    return { piece: loadPiece(json), problem: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const path = err instanceof PieceValidationError && err.path !== '' ? err.path : null;
    return { piece: null, problem: { message, path } };
  }
}

export function useEditablePiece(initial: PieceJson): EditablePiece {
  const [history, setHistory] = useState<History>(() => ({ present: initial, past: [], future: [], saved: initial }));

  const apply = useCallback((edit: (json: PieceJson) => PieceJson) => {
    setHistory((h) => {
      const next = edit(h.present);
      if (next === h.present) return h;
      return { ...h, present: next, past: [...h.past, h.present].slice(-HISTORY_LIMIT), future: [] };
    });
  }, []);

  const replace = useCallback((json: PieceJson, options: { saved?: boolean } = {}) => {
    setHistory({ present: json, past: [], future: [], saved: options.saved === false ? null : json });
  }, []);

  const markSaved = useCallback(() => {
    setHistory((h) => ({ ...h, saved: h.present }));
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const previous = h.past[h.past.length - 1];
      if (previous === undefined) return h;
      return { ...h, present: previous, past: h.past.slice(0, -1), future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      const [next, ...rest] = h.future;
      if (next === undefined) return h;
      return { ...h, present: next, past: [...h.past, h.present], future: rest };
    });
  }, []);

  const { piece, problem } = useMemo(() => validate(history.present), [history.present]);

  return {
    json: history.present,
    piece,
    problem,
    dirty: history.present !== history.saved,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    apply,
    replace,
    markSaved,
    undo,
    redo,
  };
}
