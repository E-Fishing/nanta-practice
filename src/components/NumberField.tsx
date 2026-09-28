import { useId, useState, type ChangeEvent } from 'react';

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  /** Whole numbers only (repeat, pulses). */
  integer?: boolean;
  step?: number;
  /** Called with every valid value as it is typed. */
  onCommit: (value: number) => void;
  className?: string;
  /** Text after the input, e.g. "pulses". */
  unit?: string;
}

/**
 * A numeric input that stays editable while the text is not yet a valid number: the field
 * keeps what was typed (so a value can be cleared and retyped) and commits only valid values.
 * An outside change to `value` (undo, load) replaces the text.
 */
export default function NumberField({ label, value, min, integer = false, step, onCommit, className = '', unit }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setText(next);
    const parsed = Number(next);
    if (next.trim() === '' || !Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) return;
    if (parsed !== value) onCommit(parsed);
  }

  const valid = text.trim() !== '' && Number(text) === value;

  return (
    <label className={`number-field ${className}`.trim()} htmlFor={id}>
      <span className="editor-label">{label}</span>
      <input
        id={id}
        className={valid ? 'editor-input editor-input--number' : 'editor-input editor-input--number editor-input--invalid'}
        type="number"
        inputMode={integer ? 'numeric' : 'decimal'}
        min={min}
        step={step ?? (integer ? 1 : 'any')}
        value={text}
        onChange={handleChange}
        onBlur={() => setText(String(value))}
      />
      {unit !== undefined ? <span className="editor-unit">{unit}</span> : null}
    </label>
  );
}
