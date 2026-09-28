import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { EXTENDER_TOKEN, REST_TOKEN, parseToken, withDynamic, withHit } from '../engine/editPiece';
import type { Dynamic, Hand, HitCell, InstrumentJson } from '../engine/types';
import { HAND_NAMES } from './cellView';
import './CellMenu.css';

export interface CellMenuProps {
  token: string;
  instrument: InstrumentJson | undefined;
  /** Viewport rectangle of the cell the menu belongs to. */
  anchor: DOMRect;
  /** The cell is not the first of its group. */
  canSplit: boolean;
  /** The group is not the first of its line. */
  canMerge: boolean;
  onChange: (token: string) => void;
  onInsert: (offset: 0 | 1) => void;
  onDelete: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onClose: () => void;
}

const HANDS: readonly Hand[] = ['R', 'L', 'B'];
const DYNAMICS: ReadonlyArray<readonly [Dynamic, string]> = [
  ['soft', 'soft _'],
  ['normal', 'normal'],
  ['accent', "small accent '"],
  ['strong', 'strong >'],
];
const MARGIN_PX = 8;

/** A row of mutually exclusive choices drawn as pressed buttons. */
function Choice<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="cell-menu-row" role="group" aria-label={label}>
      <span className="cell-menu-label">{label}</span>
      <div className="cell-menu-choices">
        {options.map(([option, text]) => (
          <button key={option} type="button" className="cell-menu-choice" aria-pressed={option === value} onClick={() => onPick(option)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The cell options menu (SPEC §4.4): kind, hand, flam pickup, surface, loudness, lift and
 * cross-arm, gu-eum override, plus insert / delete / split / merge. Every change is applied
 * at once (the token preview at the bottom shows the result); Escape or a click outside closes.
 */
export default function CellMenu({ token, instrument, anchor, canSplit, canMerge, onChange, onInsert, onDelete, onSplit, onMerge, onClose }: CellMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({ left: anchor.left, top: anchor.bottom + 4 });
  const cell = parseToken(token, instrument ? Object.keys(instrument.surfaces) : []);
  const hit: HitCell | null = cell !== null && cell.kind === 'hit' ? cell : null;
  const kind = cell === null ? 'invalid' : cell.kind;

  // Keep the menu inside the viewport, below the cell when there is room, else above it.
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) return;
    const { width, height } = element.getBoundingClientRect();
    const left = Math.max(MARGIN_PX, Math.min(anchor.left, window.innerWidth - width - MARGIN_PX));
    let top = anchor.bottom + 4;
    if (top + height > window.innerHeight - MARGIN_PX) top = Math.max(MARGIN_PX, anchor.top - height - 4);
    setPosition({ left, top });
  }, [anchor, kind]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function onPointerDown(event: globalThis.PointerEvent) {
      if (root.current !== null && !root.current.contains(event.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const surfaces = instrument ? Object.keys(instrument.surfaces) : [];
  const surfaceId = hit === null ? '' : (hit.surface ?? instrument?.defaultSurface ?? '');
  const surfaceGueum = hit === null ? undefined : instrument?.surfaces[surfaceId]?.gueum?.[hit.hand];

  return (
    <div ref={root} className="cell-menu" role="dialog" aria-label="Cell options" style={position}>
      <Choice
        label="Cell"
        options={[
          ['rest', 'rest -'],
          ['hit', 'hit'],
          ['extender', 'hold ~'],
        ]}
        value={kind === 'invalid' ? 'rest' : kind}
        onPick={(next) => onChange(next === 'rest' ? REST_TOKEN : next === 'extender' ? EXTENDER_TOKEN : withHit(token, {}))}
      />
      {hit !== null ? (
        <>
          <Choice label="Hand" options={HANDS.map((hand) => [hand, `${hand} ${HAND_NAMES[hand].toLowerCase()}`] as const)} value={hit.hand} onPick={(hand) => onChange(withHit(token, { hand }))} />
          <Choice
            label="Flam pickup"
            options={[['none', 'none'] as const, ...HANDS.map((hand) => [hand, hand] as const)]}
            value={hit.grace ?? 'none'}
            onPick={(grace) => onChange(withHit(token, { grace: grace === 'none' ? null : grace }))}
          />
          {surfaces.length > 1 ? (
            <Choice
              label="Surface"
              options={surfaces.map((id) => [id, id === instrument?.defaultSurface ? `${id} (default)` : id] as const)}
              value={surfaceId}
              onPick={(id) => onChange(withHit(token, { surface: id === instrument?.defaultSurface ? null : id }))}
            />
          ) : null}
          <Choice label="Loudness" options={DYNAMICS} value={hit.dynamic} onPick={(dynamic) => onChange(withDynamic(token, dynamic))} />
          <div className="cell-menu-row">
            <span className="cell-menu-label">Marks</span>
            <div className="cell-menu-choices">
              <label className="cell-menu-check">
                <input type="checkbox" checked={hit.modifiers.lift} onChange={(e) => onChange(withHit(token, { modifiers: { lift: e.target.checked } }))} />
                lift ^
              </label>
              <label className="cell-menu-check">
                <input type="checkbox" checked={hit.modifiers.cross} onChange={(e) => onChange(withHit(token, { modifiers: { cross: e.target.checked } }))} />
                cross-arm x
              </label>
            </div>
          </div>
          <label className="cell-menu-row">
            <span className="cell-menu-label">Gu-eum</span>
            <input
              className="editor-input cell-menu-gueum"
              type="text"
              value={hit.gueumOverride ?? ''}
              placeholder={surfaceGueum ?? 'none'}
              onChange={(e) => onChange(withHit(token, { gueumOverride: e.target.value === '' ? null : e.target.value }))}
            />
          </label>
        </>
      ) : null}
      <div className="cell-menu-row cell-menu-row--actions" role="group" aria-label="Structure">
        <button type="button" className="editor-button editor-button--small" onClick={() => onInsert(0)}>
          Insert before
        </button>
        <button type="button" className="editor-button editor-button--small" onClick={() => onInsert(1)}>
          Insert after
        </button>
        <button type="button" className="editor-button editor-button--small" onClick={onSplit} disabled={!canSplit} title="This cell starts a new group">
          Split group here
        </button>
        <button type="button" className="editor-button editor-button--small" onClick={onMerge} disabled={!canMerge} title="Join this group onto the previous one">
          Merge with previous
        </button>
        <button type="button" className="editor-button editor-button--small editor-button--danger" onClick={onDelete}>
          Delete cell
        </button>
      </div>
      <p className="cell-menu-token">
        token <code>{token}</code>
        <button type="button" className="editor-button editor-button--small cell-menu-close" onClick={onClose}>
          Done
        </button>
      </p>
    </div>
  );
}
