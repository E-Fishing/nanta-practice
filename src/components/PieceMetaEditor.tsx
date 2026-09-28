import { updatePieceMeta } from '../engine/editPiece';
import type { PieceJson } from '../engine/types';
import NumberField from './NumberField';
import './PieceMetaEditor.css';

export interface PieceMetaEditorProps {
  json: PieceJson;
  apply: (edit: (json: PieceJson) => PieceJson) => void;
}

/** Piece-level fields: title, id (also the file name), pulse BPM and the breath after each line. */
export default function PieceMetaEditor({ json, apply }: PieceMetaEditorProps) {
  return (
    <div className="piece-meta">
      <label className="piece-meta-field piece-meta-field--title">
        <span className="editor-label">Title</span>
        <input className="editor-input" type="text" value={json.title} onChange={(e) => apply((c) => updatePieceMeta(c, { title: e.target.value }))} />
      </label>
      <label className="piece-meta-field" title="Also the file name: <id>.json">
        <span className="editor-label">Id</span>
        <input className="editor-input editor-input--id" type="text" value={json.id} onChange={(e) => apply((c) => updatePieceMeta(c, { id: e.target.value }))} />
      </label>
      <NumberField label="Pulses per minute" value={json.pulseBpm} min={1} onCommit={(pulseBpm) => apply((c) => updatePieceMeta(c, { pulseBpm }))} className="piece-meta-field" />
      <NumberField
        label="Breath after each line"
        value={json.linePause ?? 0}
        min={0}
        integer
        unit="pulses"
        onCommit={(linePause) => apply((c) => updatePieceMeta(c, { linePause }))}
        className="piece-meta-field"
      />
    </div>
  );
}
