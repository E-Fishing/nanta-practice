import type { Section } from '../engine/types';
import './SectionHeader.css';

export interface SectionHeaderProps {
  section: Section;
}

/** Crescendo hairpin: opens to the right, the way it is drawn on the chart. */
function Hairpin() {
  return (
    <svg className="section-header-hairpin" viewBox="0 0 40 12" aria-hidden="true">
      <path d="M39 1 L1 6 L39 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Section name, repeat count, crescendo marker and tempo scale (SPEC §4.2). */
export default function SectionHeader({ section }: SectionHeaderProps) {
  return (
    <header className="section-header">
      <h2 className="section-header-name">{section.name}</h2>
      {section.repeat > 1 ? (
        <span className="section-header-badge" title={`Play ${section.repeat} times`}>
          ×{section.repeat}
        </span>
      ) : null}
      {section.crescendo ? (
        <span className="section-header-badge section-header-badge--cresc" title="Crescendo: start soft, get louder every repeat">
          <Hairpin />
          cresc.
        </span>
      ) : null}
      {section.tempoScale !== 1 ? (
        <span className="section-header-badge" title={`Each pulse lasts ${1 / section.tempoScale}× as long`}>
          tempo ×{section.tempoScale}
        </span>
      ) : null}
      <span className="section-header-pulses">
        {section.pulses} pulse{section.pulses === 1 ? '' : 's'}
      </span>
    </header>
  );
}
