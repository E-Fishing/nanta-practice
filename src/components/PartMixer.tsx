import type { Part } from '../engine/types';
import './PartMixer.css';

export interface PartMixerProps {
  parts: Part[];
  muted: readonly string[];
  solo: string | null;
  onMute: (partId: string, on: boolean) => void;
  /** null clears the solo. */
  onSolo: (partId: string | null) => void;
}

/** Mute and solo per part (SPEC §4.2). Muted parts still highlight; solo wins over mute. */
export default function PartMixer({ parts, muted, solo, onMute, onSolo }: PartMixerProps) {
  return (
    <div className="mixer" role="group" aria-label="Mute and solo">
      {parts.map((part) => {
        const isMuted = muted.includes(part.id);
        const isSolo = solo === part.id;
        const silenced = solo !== null ? !isSolo : isMuted;
        return (
          <div key={part.id} className={silenced ? 'mixer-part mixer-part--silent' : 'mixer-part'}>
            <span className="mixer-name">{part.name}</span>
            <button
              type="button"
              className="mixer-button mixer-button--mute"
              aria-pressed={isMuted}
              aria-label={`Mute ${part.name}`}
              onClick={() => onMute(part.id, !isMuted)}
            >
              M
            </button>
            <button
              type="button"
              className="mixer-button mixer-button--solo"
              aria-pressed={isSolo}
              aria-label={`Solo ${part.name}`}
              onClick={() => onSolo(isSolo ? null : part.id)}
            >
              S
            </button>
          </div>
        );
      })}
    </div>
  );
}
