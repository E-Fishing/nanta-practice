import { useRef, type ChangeEvent } from 'react';
import type { PieceProblem } from '../pages/useEditablePiece';
import './EditorToolbar.css';

export type EditorNotice = { kind: 'ok' | 'error'; text: string } | null;

export interface EditorToolbarProps {
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The loader's objection to the current piece; saving is disabled while there is one. */
  problem: PieceProblem | null;
  /** A copy of this piece is saved in the browser. */
  hasLocal: boolean;
  notice: EditorNotice;
  onSave: () => void;
  onLoadFile: (file: File) => void;
  onNew: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRemoveLocal: () => void;
}

/** Save / load / new / undo / redo and the status line (SPEC §4.4). */
export default function EditorToolbar({ dirty, canUndo, canRedo, problem, hasLocal, notice, onSave, onLoadFile, onNew, onUndo, onRedo, onRemoveLocal }: EditorToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file !== undefined) onLoadFile(file);
    event.target.value = '';
  }

  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar-buttons">
        <button type="button" className="editor-button editor-button--primary" onClick={onSave} disabled={problem !== null} title="Download the JSON file and keep a copy in this browser">
          Save
        </button>
        <button type="button" className="editor-button" onClick={() => fileInput.current?.click()} title="Open a piece JSON file (or drop one on the page)">
          Load JSON…
        </button>
        <input ref={fileInput} className="editor-toolbar-file" type="file" accept="application/json,.json" onChange={handleFile} aria-label="Piece JSON file" />
        <button type="button" className="editor-button" onClick={onNew}>
          New piece
        </button>
        <span className="editor-toolbar-gap" />
        <button type="button" className="editor-button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" className="editor-button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
          Redo
        </button>
        {hasLocal ? (
          <button type="button" className="editor-button editor-button--danger" onClick={onRemoveLocal} title="Forget the copy saved in this browser">
            Remove browser copy
          </button>
        ) : null}
      </div>
      {problem !== null ? (
        <p className="editor-toolbar-status editor-toolbar-status--problem" role="alert">
          Fix before saving: {problem.message}
          {problem.path !== null ? (
            <>
              {' '}
              <code>{problem.path}</code>
            </>
          ) : null}
        </p>
      ) : notice !== null ? (
        <p className={notice.kind === 'error' ? 'editor-toolbar-status editor-toolbar-status--problem' : 'editor-toolbar-status editor-toolbar-status--ok'} role="status">
          {notice.text}
        </p>
      ) : (
        <p className="editor-toolbar-status" role="status">
          {dirty ? 'Unsaved changes.' : 'No unsaved changes.'}
        </p>
      )}
    </div>
  );
}
