import type { Section } from '../engine/types';
import './SectionHeader.css';

export interface SectionHeaderProps {
  section: Section;
  /** 1-based repeat under the playhead when this section is playing, else null. */
  rep?: number | null;
  /** The loop covers this section or some of its lines. */
  looped?: boolean;
}

/** Crescendo hairpin: opens to the right, the way it is drawn on the chart. */
function Hairpin() {
  return (
    <svg className="section-header-hairpin" viewBox="0 0 40 12" aria-hidden="true">
      <path d="M39 1 L1 6 L39 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** Section name, repeat count ("rep 3 / 8" while playing), crescendo marker and tempo scale (SPEC §4.2). */
export default function SectionHeader({ section, rep = null, looped = false }: SectionHeaderProps) {
  const active = rep !== null;
  return (
    <header className={active ? 'section-header section-header--active' : 'section-header'}>
      <h2 className="section-header-name">{section.name}</h2>
      {section.repeat > 1 ? (
        active ? (
          <span className="section-header-badge section-header-badge--rep" aria-live="off">
            rep {rep} / {section.repeat}
          </span>
        ) : (
          <span className="section-header-badge" title={`Play ${section.repeat} times`}>
            ×{section.repeat}
          </span>
        )
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
      {looped ? (
        <span className="section-header-badge section-header-badge--loop" title="Inside the loop">
          loop
        </span>
      ) : null}
      <span className="section-header-pulses">
        {section.pulses} pulse{section.pulses === 1 ? '' : 's'}
      </span>
    </header>
  );
}
