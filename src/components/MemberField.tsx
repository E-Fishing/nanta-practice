import { useId, type ChangeEvent } from 'react';
import './MemberField.css';

export interface MemberFieldProps {
  /** Current member name, "" when nobody is set. */
  value: string;
  /** Called with the new name on every change; the caller stores it. */
  onChange: (name: string) => void;
}

/** "Who's practicing?" text field (SPEC §4.1). Controlled: the Library page owns the name. */
export default function MemberField({ value, onChange }: MemberFieldProps) {
  const id = useId();

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div className="member-field">
      <label className="member-field-label" htmlFor={id}>
        Who&rsquo;s practicing?
      </label>
      <input
        id={id}
        className="member-field-input"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Your name"
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="done"
      />
    </div>
  );
}
