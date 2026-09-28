import { LOOP_OFF, type LoopSpec } from '../engine/controls';
import type { Part, Piece } from '../engine/types';
import './LoopControl.css';

export interface LoopControlProps {
  piece: Piece;
  /** The part on screen: line ranges are its lines. */
  part: Part;
  loop: LoopSpec;
  onChange: (spec: LoopSpec) => void;
}

/**
 * Loop picker (SPEC §4.2): off, the whole piece, one section, or a line range of the current
 * part inside a section. Narrowing a section to some of its lines makes a `lines` loop; widening
 * back to all of them makes it a plain `section` loop again.
 */
export default function LoopControl({ piece, part, loop, onChange }: LoopControlProps) {
  const sectionId = loop.kind === 'section' || loop.kind === 'lines' ? loop.sectionId : null;
  const section = sectionId === null ? null : (piece.sections.find((s) => s.id === sectionId) ?? null);
  const lines = section?.lines[part.id];
  const lineCount = lines?.length ?? 0;
  const from = loop.kind === 'lines' ? loop.from : 0;
  const to = loop.kind === 'lines' ? loop.to : lineCount - 1;

  function selectSection(value: string) {
    if (value === 'off') onChange(LOOP_OFF);
    else if (value === 'piece') onChange({ kind: 'piece' });
    else onChange({ kind: 'section', sectionId: value });
  }

  function selectLines(nextFrom: number, nextTo: number) {
    if (sectionId === null) return;
    if (nextFrom === 0 && nextTo === lineCount - 1) onChange({ kind: 'section', sectionId });
    else onChange({ kind: 'lines', sectionId, partId: part.id, from: nextFrom, to: nextTo });
  }

  return (
    <div className="loop-control" role="group" aria-label="Loop">
      <label className="loop-control-label" htmlFor="loop-section">
        Loop
      </label>
      <select id="loop-section" className="loop-control-select" value={sectionId ?? loop.kind} onChange={(e) => selectSection(e.target.value)}>
        <option value="off">Off</option>
        <option value="piece">Whole piece</option>
        {piece.sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {section !== null && lines !== undefined && lineCount > 1 ? (
        <span className="loop-control-lines">
          <label className="loop-control-sublabel" htmlFor="loop-from">
            lines
          </label>
          <select
            id="loop-from"
            className="loop-control-select"
            value={from}
            onChange={(e) => {
              const value = Number(e.target.value);
              selectLines(value, Math.max(to, value));
            }}
          >
            {lines.map((_line, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
          <label className="loop-control-sublabel" htmlFor="loop-to">
            to
          </label>
          <select
            id="loop-to"
            className="loop-control-select"
            value={to}
            onChange={(e) => {
              const value = Number(e.target.value);
              selectLines(Math.min(from, value), value);
            }}
          >
            {lines.map((_line, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {section !== null && lines === undefined ? <span className="loop-control-hint">{part.name} is silent in this section.</span> : null}
    </div>
  );
}
