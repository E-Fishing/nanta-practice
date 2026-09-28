import { addPart, removePart, updatePart } from '../engine/editPiece';
import type { PieceJson } from '../engine/types';
import './PartsEditor.css';

export interface PartsEditorProps {
  json: PieceJson;
  apply: (edit: (json: PieceJson) => PieceJson) => void;
}

/** Parts: name, id, instrument and the lead flag (SPEC §3.1). */
export default function PartsEditor({ json, apply }: PartsEditorProps) {
  return (
    <div className="parts-editor">
      {json.parts.map((part, index) => (
        <div key={index} className="parts-editor-row">
          <label className="parts-editor-field">
            <span className="editor-label">Part</span>
            <input className="editor-input" type="text" value={part.name} aria-label="Part name" onChange={(e) => apply((c) => updatePart(c, index, { name: e.target.value }))} />
          </label>
          <label className="parts-editor-field">
            <span className="editor-label">id</span>
            <input className="editor-input editor-input--id" type="text" value={part.id} onChange={(e) => apply((c) => updatePart(c, index, { id: e.target.value }))} />
          </label>
          <label className="parts-editor-field">
            <span className="editor-label">instrument</span>
            <select className="editor-select" value={part.instrument} onChange={(e) => apply((c) => updatePart(c, index, { instrument: e.target.value }))}>
              {json.instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.name}
                </option>
              ))}
              {json.instruments.some((instrument) => instrument.id === part.instrument) ? null : <option value={part.instrument}>{part.instrument} (missing)</option>}
            </select>
          </label>
          <label className="parts-editor-field parts-editor-check" title="The part whose cues drive section changes (Cue drill)">
            <input type="checkbox" checked={part.lead ?? false} onChange={(e) => apply((c) => updatePart(c, index, { lead: e.target.checked }))} />
            lead
          </label>
          <button
            type="button"
            className="editor-button editor-button--icon editor-button--danger parts-editor-remove"
            title="Remove part and its lines"
            aria-label={`Remove part ${part.name}`}
            disabled={json.parts.length === 1}
            onClick={() => apply((c) => removePart(c, index))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="editor-button editor-button--small" onClick={() => apply((c) => addPart(c))}>
        + part
      </button>
    </div>
  );
}
