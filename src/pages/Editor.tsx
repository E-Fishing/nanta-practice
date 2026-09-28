import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CellMenu from '../components/CellMenu';
import EditorToolbar, { type EditorNotice } from '../components/EditorToolbar';
import ErrorCard from '../components/ErrorCard';
import InstrumentEditor from '../components/InstrumentEditor';
import PartSelector from '../components/PartSelector';
import PartsEditor from '../components/PartsEditor';
import PieceMetaEditor from '../components/PieceMetaEditor';
import SectionEditor from '../components/SectionEditor';
import {
  addSection,
  cellAt,
  cycleToken,
  emptyPiece,
  formatPieceJson,
  insertCell,
  mergeWithPreviousGroup,
  parsePieceFile,
  pieceToJson,
  removeCell,
  setCell,
  splitGroup,
  type CellLoc,
} from '../engine/editPiece';
import type { PieceJson } from '../engine/types';
import { downloadText } from '../storage/download';
import { removeLocalPiece, saveLocalPiece } from '../storage/localPieces';
import { confirmLeave, useUnsavedChanges } from './unsavedChanges';
import { useEditablePiece } from './useEditablePiece';
import { usePiece } from './usePiece';
import './Editor.css';

/** Editor page (SPEC §4.4): `/edit` starts a new piece, `/edit/:pieceId` edits an existing one. */
export default function Editor() {
  const { pieceId } = useParams();
  const state = usePiece(pieceId);

  if (pieceId === undefined) return <LoadedEditor key="new" initial={emptyPiece()} local={false} routeId={null} />;
  return (
    <>
      {state.status === 'loading' ? <p className="editor-status">Loading {pieceId}...</p> : null}
      {state.status === 'error' ? (
        <section className="editor">
          <EditorNav pieceId={null} />
          <ErrorCard pieceId={pieceId} message={state.message} path={state.path} />
          <p className="editor-status">
            <Link to="/edit">Start a new piece instead</Link>
          </p>
        </section>
      ) : null}
      {state.status === 'loaded' ? <LoadedEditor key={pieceId} initial={pieceToJson(state.piece)} local={state.local} routeId={pieceId} /> : null}
    </>
  );
}

function guardLeave(event: MouseEvent<HTMLAnchorElement>) {
  if (!confirmLeave()) event.preventDefault();
}

function EditorNav({ pieceId }: { pieceId: string | null }) {
  return (
    <nav className="editor-nav">
      <Link to="/" onClick={guardLeave}>
        ← Library
      </Link>
      {pieceId !== null ? (
        <Link to={`/play/${pieceId}`} onClick={guardLeave}>
          Player
        </Link>
      ) : null}
    </nav>
  );
}

interface OpenMenu {
  loc: CellLoc;
  anchor: DOMRect;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

interface LoadedEditorProps {
  initial: PieceJson;
  /** The initial JSON came from the browser copy. */
  local: boolean;
  /** The id in the address, or null for a new piece. */
  routeId: string | null;
}

function LoadedEditor({ initial, local, routeId }: LoadedEditorProps) {
  const editor = useEditablePiece(initial);
  const { json, apply, undo, redo } = editor;
  const navigate = useNavigate();
  const [partId, setPartId] = useState(initial.parts[0]?.id ?? '');
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [notice, setNotice] = useState<EditorNotice>(null);
  const [hasLocal, setHasLocal] = useState(local);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  useUnsavedChanges(editor.dirty);

  const part = json.parts.find((p) => p.id === partId) ?? json.parts[0];
  const instrument = json.instruments.find((i) => i.id === part?.instrument);
  const menuToken = menu === null ? null : cellAt(json, menu.loc);

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) outside text fields.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) undo();
      else if (key === 'y' || (key === 'z' && event.shiftKey)) redo();
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const save = useCallback(() => {
    if (editor.piece === null) return;
    // Round-trip through the loader so the file has canonical key order and no default values.
    const canonical = pieceToJson(editor.piece);
    downloadText(`${json.id}.json`, formatPieceJson(canonical));
    const kept = saveLocalPiece(canonical);
    editor.markSaved();
    setHasLocal(kept);
    setNotice({
      kind: 'ok',
      text: kept
        ? `Downloaded ${json.id}.json and kept a copy in this browser. To share it with the club, put the file in public/pieces/ and list it in index.json.`
        : `Downloaded ${json.id}.json. This browser could not keep a copy, so put the file in public/pieces/ to play it.`,
    });
    if (json.id !== routeId) navigate(`/edit/${json.id}`, { replace: true });
  }, [editor, json, routeId, navigate]);

  const loadFile = useCallback(
    async (file: File) => {
      if (editor.dirty && !window.confirm(`Replace the piece you are editing with ${file.name}? Unsaved changes will be lost.`)) return;
      try {
        const loaded = parsePieceFile(await file.text());
        editor.replace(loaded, { saved: false });
        setPartId(loaded.parts[0]?.id ?? '');
        setMenu(null);
        setNotice({ kind: 'ok', text: `Loaded ${file.name}. Save to keep it.` });
      } catch (err) {
        setNotice({ kind: 'error', text: `Could not load ${file.name}: ${err instanceof Error ? err.message : String(err)}` });
      }
    },
    [editor],
  );

  const newPiece = useCallback(() => {
    if (!confirmLeave()) return;
    if (routeId !== null) {
      navigate('/edit');
      return;
    }
    const fresh = emptyPiece();
    editor.replace(fresh);
    setPartId(fresh.parts[0].id);
    setMenu(null);
    setNotice(null);
  }, [editor, routeId, navigate]);

  const removeLocal = useCallback(() => {
    if (!window.confirm(`Forget the copy of "${json.title}" saved in this browser?`)) return;
    removeLocalPiece(json.id);
    setHasLocal(false);
    setNotice({ kind: 'ok', text: 'Browser copy removed. The piece stays open here until you leave.' });
  }, [json.id, json.title]);

  const cycle = useCallback(
    (loc: CellLoc) => {
      apply((current) => {
        const token = cellAt(current, loc);
        return token === null ? current : setCell(current, loc, cycleToken(token));
      });
    },
    [apply],
  );

  const openMenu = useCallback((loc: CellLoc, anchor: DOMRect) => setMenu({ loc, anchor }), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  function onDragEnter(event: DragEvent) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) void loadFile(file);
  }

  return (
    <section className={dragging ? 'editor editor--dragging' : 'editor'} onDragEnter={onDragEnter} onDragOver={(e) => e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
      <EditorNav pieceId={routeId} />
      <EditorToolbar
        dirty={editor.dirty}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        problem={editor.problem}
        hasLocal={hasLocal}
        notice={notice}
        onSave={save}
        onLoadFile={(file) => void loadFile(file)}
        onNew={newPiece}
        onUndo={undo}
        onRedo={redo}
        onRemoveLocal={removeLocal}
      />
      <header className="editor-header">
        <h1 className="editor-title">{json.title || 'Untitled piece'}</h1>
        <p className="editor-help">Click a cell to cycle rest → R → L → B → hold. Right-click or hold a cell for surface, marks and gu-eum. Drop a piece JSON file anywhere here to open it.</p>
      </header>
      <PieceMetaEditor json={json} apply={apply} />
      <details className="editor-setup">
        <summary className="editor-setup-summary">Instruments and parts</summary>
        <div className="editor-setup-body">
          <InstrumentEditor json={json} apply={apply} />
          <PartsEditor json={json} apply={apply} />
        </div>
      </details>
      {json.parts.length > 1 && part !== undefined ? (
        <PartSelector parts={json.parts.map((p) => ({ id: p.id, name: p.name, instrument: p.instrument, lead: p.lead ?? false }))} selectedId={part.id} onSelect={setPartId} />
      ) : null}
      {part === undefined ? <p className="editor-status">Add a part under "Instruments and parts" to start writing lines.</p> : null}
      <div className="editor-sections">
        {json.sections.map((section, sectionIndex) => (
          <SectionEditor
            key={`${sectionIndex}:${section.id}`}
            json={json}
            sectionIndex={sectionIndex}
            partId={part?.id ?? ''}
            menuLoc={menu?.loc ?? null}
            apply={apply}
            onCycle={cycle}
            onOpenMenu={openMenu}
          />
        ))}
        <button type="button" className="editor-button editor-add-section" onClick={() => apply((current) => addSection(current, undefined, part?.id))}>
          + Add section
        </button>
      </div>
      {menu !== null && menuToken !== null ? (
        <CellMenu
          token={menuToken}
          instrument={instrument}
          anchor={menu.anchor}
          canSplit={menu.loc.cellIndex > 0}
          canMerge={menu.loc.groupIndex > 0}
          onChange={(token) => apply((current) => setCell(current, menu.loc, token))}
          onInsert={(offset) => {
            apply((current) => insertCell(current, menu.loc, offset));
            closeMenu();
          }}
          onDelete={() => {
            apply((current) => removeCell(current, menu.loc));
            closeMenu();
          }}
          onSplit={() => {
            apply((current) => splitGroup(current, menu.loc));
            closeMenu();
          }}
          onMerge={() => {
            apply((current) => mergeWithPreviousGroup(current, menu.loc.sectionIndex, menu.loc.partId, menu.loc.lineIndex, menu.loc.groupIndex));
            closeMenu();
          }}
          onClose={closeMenu}
        />
      ) : null}
      {dragging ? (
        <div className="editor-drop" aria-hidden="true">
          Drop the piece JSON file to open it
        </div>
      ) : null}
    </section>
  );
}
