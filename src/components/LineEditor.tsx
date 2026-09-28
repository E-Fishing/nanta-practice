import { addGroup, appendCell, moveLine, removeLine, updateLine, type CellLoc } from '../engine/editPiece';
import type { InstrumentJson, LineJson, PieceJson } from '../engine/types';
import EditCell from './EditCell';
import './LineEditor.css';

export interface LineEditorProps {
  line: LineJson;
  sectionIndex: number;
  partId: string;
  lineIndex: number;
  lineCount: number;
  /** The piece's `linePause`, shown as the default breath. */
  linePause: number;
  instrument: InstrumentJson | undefined;
  /** The cell whose menu is open, if any. */
  menuLoc: CellLoc | null;
  apply: (edit: (json: PieceJson) => PieceJson) => void;
  onCycle: (loc: CellLoc) => void;
  onOpenMenu: (loc: CellLoc, anchor: DOMRect) => void;
}

const PAUSE_CHOICES = [0, 1, 2, 3, 4, 6, 8];

function sameLoc(a: CellLoc | null, b: CellLoc): boolean {
  return a !== null && a.sectionIndex === b.sectionIndex && a.partId === b.partId && a.lineIndex === b.lineIndex && a.groupIndex === b.groupIndex && a.cellIndex === b.cellIndex;
}

/** One editable chart row: its groups of cells, then note, breath, move and delete controls. */
export default function LineEditor({ line, sectionIndex, partId, lineIndex, lineCount, linePause, instrument, menuLoc, apply, onCycle, onOpenMenu }: LineEditorProps) {
  const pauseValue = line.pauseAfter === undefined ? 'default' : String(line.pauseAfter);
  const pauseChoices = PAUSE_CHOICES.includes(line.pauseAfter ?? 0) || line.pauseAfter === undefined ? PAUSE_CHOICES : [...PAUSE_CHOICES, line.pauseAfter].sort((a, b) => a - b);

  return (
    <div className="line-editor">
      <span className="line-editor-number" aria-hidden="true">
        {lineIndex + 1}
      </span>
      <div className="line-editor-groups">
        {line.groups.map((group, groupIndex) => (
          <span key={groupIndex} className="line-editor-group">
            {group.map((token, cellIndex) => {
              const loc: CellLoc = { sectionIndex, partId, lineIndex, groupIndex, cellIndex };
              return (
                <EditCell key={cellIndex} token={token} instrument={instrument} loc={loc} active={sameLoc(menuLoc, loc)} onCycle={onCycle} onOpenMenu={onOpenMenu} />
              );
            })}
            <button
              type="button"
              className="line-editor-add-cell"
              title="Add a cell to this group"
              aria-label={`Add a cell to group ${groupIndex + 1}`}
              onClick={() => apply((json) => appendCell(json, sectionIndex, partId, lineIndex, groupIndex))}
            >
              +
            </button>
          </span>
        ))}
        <button type="button" className="editor-button editor-button--small" onClick={() => apply((json) => addGroup(json, sectionIndex, partId, lineIndex))}>
          + group
        </button>
      </div>
      <div className="line-editor-controls">
        <label className="line-editor-field line-editor-field--note">
          <span className="editor-label">Note</span>
          <input
            className="editor-input"
            type="text"
            value={line.note ?? ''}
            placeholder="free text under the line"
            onChange={(e) => apply((json) => updateLine(json, sectionIndex, partId, lineIndex, { note: e.target.value }))}
          />
        </label>
        <label className="line-editor-field">
          <span className="editor-label">Breath after</span>
          <select
            className="editor-select"
            value={pauseValue}
            onChange={(e) =>
              apply((json) => updateLine(json, sectionIndex, partId, lineIndex, { pauseAfter: e.target.value === 'default' ? undefined : Number(e.target.value) }))
            }
          >
            <option value="default">piece default ({linePause})</option>
            {pauseChoices.map((pulses) => (
              <option key={pulses} value={String(pulses)}>
                {pulses} pulse{pulses === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <span className="line-editor-actions">
          <button type="button" className="editor-button editor-button--icon" title="Move line up" aria-label="Move line up" disabled={lineIndex === 0} onClick={() => apply((json) => moveLine(json, sectionIndex, partId, lineIndex, -1))}>
            ↑
          </button>
          <button type="button" className="editor-button editor-button--icon" title="Move line down" aria-label="Move line down" disabled={lineIndex === lineCount - 1} onClick={() => apply((json) => moveLine(json, sectionIndex, partId, lineIndex, 1))}>
            ↓
          </button>
          <button type="button" className="editor-button editor-button--icon editor-button--danger" title="Delete line" aria-label="Delete line" onClick={() => apply((json) => removeLine(json, sectionIndex, partId, lineIndex))}>
            ✕
          </button>
        </span>
      </div>
    </div>
  );
}
