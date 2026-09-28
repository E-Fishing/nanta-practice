import type { Part } from '../engine/types';
import './PartSelector.css';

export interface PartSelectorProps {
  parts: Part[];
  selectedId: string;
  onSelect: (partId: string) => void;
}

/** Part selector at the top of the Player (SPEC §4.2). One big tap target per part. */
export default function PartSelector({ parts, selectedId, onSelect }: PartSelectorProps) {
  return (
    <div className="part-selector" role="radiogroup" aria-label="Part">
      {parts.map((part) => {
        const selected = part.id === selectedId;
        return (
          <button
            key={part.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'part-selector-button part-selector-button--selected' : 'part-selector-button'}
            onClick={() => onSelect(part.id)}
          >
            {part.name}
            {part.lead ? <span className="part-selector-lead">lead</span> : null}
          </button>
        );
      })}
    </div>
  );
}
