import { addLine, moveSection, partPulses, removeSection, updateSection, type CellLoc } from '../engine/editPiece';
import type { PieceJson } from '../engine/types';
import LineEditor from './LineEditor';
import NumberField from './NumberField';
import './SectionEditor.css';

export interface SectionEditorProps {
  json: PieceJson;
  sectionIndex: number;
  /** The part whose lines are shown. */
  partId: string;
  menuLoc: CellLoc | null;
  apply: (edit: (json: PieceJson) => PieceJson) => void;
  onCycle: (loc: CellLoc) => void;
  onOpenMenu: (loc: CellLoc, anchor: DOMRect) => void;
}

/** Pulse totals per part present in the section, and whether they disagree (the loader would reject that). */
function pulseSummary(json: PieceJson, sectionIndex: number): { text: string; mismatch: boolean } {
  const totals = json.parts
    .map((part) => ({ part, totals: partPulses(json, sectionIndex, part.id) }))
    .filter((entry): entry is { part: (typeof json.parts)[number]; totals: { cells: number; pulses: number } } => entry.totals !== null);
  if (totals.length === 0) return { text: 'no lines yet', mismatch: false };
  const mismatch = totals.some((entry) => entry.totals.pulses !== totals[0].totals.pulses);
  const text =
    totals.length === 1
      ? `${totals[0].totals.pulses} pulses`
      : totals.map((entry) => `${entry.part.name}: ${entry.totals.pulses}`).join(' · ');
  return { text, mismatch };
}

/**
 * One section (SPEC §4.4): name, id, repeat, crescendo, tempo scale and cue-in text in the
 * header; below it the shown part's lines, each a `LineEditor`, and an "add line" button.
 */
export default function SectionEditor({ json, sectionIndex, partId, menuLoc, apply, onCycle, onOpenMenu }: SectionEditorProps) {
  const section = json.sections[sectionIndex];
  const part = json.parts.find((p) => p.id === partId);
  const instrument = json.instruments.find((i) => i.id === part?.instrument);
  const lines = section.lines[partId];
  const summary = pulseSummary(json, sectionIndex);
  const update = (patch: Parameters<typeof updateSection>[2]) => apply((current) => updateSection(current, sectionIndex, patch));

  return (
    <section className="section-editor" aria-label={`Section ${section.name}`}>
      <header className="section-editor-head">
        <input
          className="editor-input section-editor-name"
          type="text"
          value={section.name}
          aria-label="Section name"
          placeholder="Section name"
          onChange={(e) => update({ name: e.target.value })}
        />
        <label className="section-editor-field">
          <span className="editor-label">id</span>
          <input className="editor-input editor-input--id" type="text" value={section.id} onChange={(e) => update({ id: e.target.value })} />
        </label>
        <NumberField label="repeat ×" value={section.repeat ?? 1} min={1} integer onCommit={(repeat) => update({ repeat })} className="section-editor-field" />
        <label className="section-editor-field section-editor-check">
          <input type="checkbox" checked={section.crescendo ?? false} onChange={(e) => update({ crescendo: e.target.checked })} />
          crescendo
        </label>
        <NumberField label="tempo ×" value={section.tempoScale ?? 1} min={0.05} step={0.05} onCommit={(tempoScale) => update({ tempoScale })} className="section-editor-field" />
        <label className="section-editor-field section-editor-field--cue">
          <span className="editor-label">cue-in</span>
          <input
            className="editor-input"
            type="text"
            value={section.cueIn ?? ''}
            placeholder="shown during the count-in"
            onChange={(e) => update({ cueIn: e.target.value })}
          />
        </label>
        <span className={summary.mismatch ? 'section-editor-pulses section-editor-pulses--mismatch' : 'section-editor-pulses'} title={summary.mismatch ? 'Every part must have the same pulse count in a section' : undefined}>
          {summary.text}
        </span>
        <span className="section-editor-actions">
          <button type="button" className="editor-button editor-button--icon" title="Move section up" aria-label="Move section up" disabled={sectionIndex === 0} onClick={() => apply((current) => moveSection(current, sectionIndex, -1))}>
            ↑
          </button>
          <button
            type="button"
            className="editor-button editor-button--icon"
            title="Move section down"
            aria-label="Move section down"
            disabled={sectionIndex === json.sections.length - 1}
            onClick={() => apply((current) => moveSection(current, sectionIndex, 1))}
          >
            ↓
          </button>
          <button type="button" className="editor-button editor-button--icon editor-button--danger" title="Delete section" aria-label="Delete section" onClick={() => apply((current) => removeSection(current, sectionIndex))}>
            ✕
          </button>
        </span>
      </header>
      <div className="section-editor-lines">
        {lines === undefined ? <p className="section-editor-silent">{part?.name ?? partId} is silent in this section.</p> : null}
        {lines?.map((line, lineIndex) => (
          <LineEditor
            key={lineIndex}
            line={line}
            sectionIndex={sectionIndex}
            partId={partId}
            lineIndex={lineIndex}
            lineCount={lines.length}
            linePause={json.linePause ?? 0}
            instrument={instrument}
            menuLoc={menuLoc}
            apply={apply}
            onCycle={onCycle}
            onOpenMenu={onOpenMenu}
          />
        ))}
        <button type="button" className="editor-button editor-button--small section-editor-add-line" onClick={() => apply((current) => addLine(current, sectionIndex, partId))}>
          + line
        </button>
      </div>
    </section>
  );
}
