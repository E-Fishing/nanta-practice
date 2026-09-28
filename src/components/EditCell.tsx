import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { resolveEditorCell, type CellLoc } from '../engine/editPiece';
import type { InstrumentJson } from '../engine/types';
import Cell from './Cell';
import { cellView } from './cellView';
import './EditCell.css';

/** Holding a cell this long opens its menu (SPEC §4.4: long-press or right-click). */
export const LONG_PRESS_MS = 500;

export interface EditCellProps {
  token: string;
  instrument: InstrumentJson | undefined;
  loc: CellLoc;
  /** This cell's menu is open. */
  active: boolean;
  /** A click: cycle "- → R → L → B → ~ → -". */
  onCycle: (loc: CellLoc) => void;
  /** Right-click or long-press: open the options menu anchored to the cell's rectangle. */
  onOpenMenu: (loc: CellLoc, anchor: DOMRect) => void;
}

/** One editable pulse: the real `Cell` drawing inside a button. */
export default function EditCell({ token, instrument, loc, active, onCycle, onOpenMenu }: EditCellProps) {
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | null>(null);
  /** Set when a long-press opened the menu, so the click that follows the release is ignored. */
  const longPressed = useRef(false);
  const resolved = resolveEditorCell(token, instrument);
  const view = resolved === null ? null : cellView(resolved, instrument?.defaultSurface ?? '');

  function clearTimer() {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => clearTimer, []);

  function openMenu() {
    if (button.current !== null) onOpenMenu(loc, button.current.getBoundingClientRect());
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    longPressed.current = false;
    clearTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      longPressed.current = true;
      openMenu();
    }, LONG_PRESS_MS);
  }

  function handleClick() {
    clearTimer();
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onCycle(loc);
  }

  function handleContextMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    clearTimer();
    openMenu();
  }

  const label = view === null ? `invalid token ${token}` : view.label;
  const className = ['edit-cell', active ? 'edit-cell--active' : '', view === null ? 'edit-cell--invalid' : ''].filter(Boolean).join(' ');
  return (
    <button
      ref={button}
      type="button"
      className={className}
      aria-label={`${label}. Click to change, right-click or hold for options`}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={active}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      onPointerCancel={clearTimer}
    >
      {view === null ? <span className="edit-cell-raw">{token}</span> : <Cell view={view} />}
    </button>
  );
}
