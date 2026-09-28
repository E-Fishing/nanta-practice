import { useState } from 'react';
import { addInstrument, addSurface, removeInstrument, removeSurface, updateInstrument, updateSurface } from '../engine/editPiece';
import { BUILT_IN_SOUNDS } from '../engine/sounds';
import { SURFACE_ID_PATTERN } from '../engine/tokens';
import type { Hand, InstrumentJson, PieceJson } from '../engine/types';
import './InstrumentEditor.css';

export interface InstrumentEditorProps {
  json: PieceJson;
  apply: (edit: (json: PieceJson) => PieceJson) => void;
}

const HANDS: readonly Hand[] = ['R', 'L', 'B'];

function SoundSelect({ value, onChange, label }: { value: string; onChange: (sound: string) => void; label: string }) {
  const known = (BUILT_IN_SOUNDS as readonly string[]).includes(value);
  return (
    <select className="editor-select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
      {BUILT_IN_SOUNDS.map((sound) => (
        <option key={sound} value={sound}>
          {sound}
        </option>
      ))}
      {known ? null : <option value={value}>{value}</option>}
    </select>
  );
}

/** "Add surface" row with its own draft id (SPEC §4.4: instrument editor adds surfaces). */
function AddSurface({ instrument, onAdd }: { instrument: InstrumentJson; onAdd: (id: string, sound: string) => void }) {
  const [id, setId] = useState('');
  const [sound, setSound] = useState('mid');
  const trimmed = id.trim();
  const problem =
    trimmed === '' ? null : !SURFACE_ID_PATTERN.test(trimmed) ? 'letters, digits and hyphens only' : Object.hasOwn(instrument.surfaces, trimmed) ? 'already exists' : null;
  return (
    <form
      className="instrument-editor-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed === '' || problem !== null) return;
        onAdd(trimmed, sound);
        setId('');
      }}
    >
      <input className="editor-input editor-input--id" type="text" value={id} placeholder="new surface id" aria-label="New surface id" onChange={(e) => setId(e.target.value)} />
      <SoundSelect value={sound} onChange={setSound} label="New surface sound" />
      <button type="submit" className="editor-button editor-button--small" disabled={trimmed === '' || problem !== null}>
        + surface
      </button>
      {problem !== null ? <span className="instrument-editor-problem">{problem}</span> : null}
    </form>
  );
}

function OneInstrument({ json, index, apply }: { json: PieceJson; index: number; apply: InstrumentEditorProps['apply'] }) {
  const instrument = json.instruments[index];
  const surfaceIds = Object.keys(instrument.surfaces);
  const inUse = json.parts.some((part) => part.instrument === instrument.id);
  return (
    <div className="instrument-editor">
      <div className="instrument-editor-head">
        <label className="instrument-editor-field">
          <span className="editor-label">Instrument</span>
          <input className="editor-input" type="text" value={instrument.name} aria-label="Instrument name" onChange={(e) => apply((c) => updateInstrument(c, index, { name: e.target.value }))} />
        </label>
        <label className="instrument-editor-field">
          <span className="editor-label">id</span>
          <input className="editor-input editor-input--id" type="text" value={instrument.id} onChange={(e) => apply((c) => updateInstrument(c, index, { id: e.target.value }))} />
        </label>
        <label className="instrument-editor-field">
          <span className="editor-label">default surface</span>
          <select className="editor-select" value={instrument.defaultSurface} onChange={(e) => apply((c) => updateInstrument(c, index, { defaultSurface: e.target.value }))}>
            {surfaceIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
            {surfaceIds.includes(instrument.defaultSurface) ? null : <option value={instrument.defaultSurface}>{instrument.defaultSurface} (missing)</option>}
          </select>
        </label>
        <button
          type="button"
          className="editor-button editor-button--small editor-button--danger instrument-editor-remove"
          disabled={inUse || json.instruments.length === 1}
          title={inUse ? 'A part still plays this instrument' : 'Remove instrument'}
          onClick={() => apply((c) => removeInstrument(c, index))}
        >
          Remove instrument
        </button>
      </div>
      <table className="instrument-editor-surfaces">
        <thead>
          <tr>
            <th scope="col">Surface</th>
            <th scope="col">Sound</th>
            {HANDS.map((hand) => (
              <th key={hand} scope="col">
                gu-eum {hand}
              </th>
            ))}
            <th scope="col">
              <span className="visually-hidden">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {surfaceIds.map((id) => {
            const surface = instrument.surfaces[id];
            return (
              <tr key={id}>
                <th scope="row">
                  <code>{id}</code>
                  {id === instrument.defaultSurface ? <span className="instrument-editor-default">default</span> : null}
                </th>
                <td>
                  <SoundSelect value={surface.sound} label={`Sound of ${id}`} onChange={(sound) => apply((c) => updateSurface(c, index, id, { sound }))} />
                </td>
                {HANDS.map((hand) => (
                  <td key={hand}>
                    <input
                      className="editor-input editor-input--syllable"
                      type="text"
                      value={surface.gueum?.[hand] ?? ''}
                      placeholder={hand}
                      aria-label={`${id} gu-eum for ${hand}`}
                      onChange={(e) => apply((c) => updateSurface(c, index, id, { gueum: { [hand]: e.target.value } }))}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="editor-button editor-button--icon editor-button--danger"
                    title={id === instrument.defaultSurface ? 'Pick another default surface first' : 'Remove surface'}
                    aria-label={`Remove surface ${id}`}
                    disabled={id === instrument.defaultSurface}
                    onClick={() => apply((c) => removeSurface(c, index, id))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <AddSurface instrument={instrument} onAdd={(id, sound) => apply((c) => addSurface(c, index, id, sound))} />
    </div>
  );
}

/** Instruments with their surfaces, sounds and syllables (SPEC §4.4). */
export default function InstrumentEditor({ json, apply }: InstrumentEditorProps) {
  return (
    <div className="instrument-editor-list">
      {json.instruments.map((instrument, index) => (
        <OneInstrument key={`${index}:${instrument.id}`} json={json} index={index} apply={apply} />
      ))}
      <button type="button" className="editor-button editor-button--small" onClick={() => apply((c) => addInstrument(c))}>
        + instrument
      </button>
    </div>
  );
}
