import type { PageName } from './pageNames';
import './Plaque.css';

export interface PlaqueProps extends PageName {
  /** Hanging from a beam (Library, Progress), compact at the top of a practice page, or lines only (Editor). */
  variant?: 'hanging' | 'compact' | 'lines';
  /** The page's h1 when the plaque is the page title; a plain label next to a piece title. */
  as?: 'h1' | 'div';
}

/** Page-title name board (현판, DESIGN.md §4.2 O4): Korean display text over its English label. */
export default function Plaque({ ko, en, variant = 'compact', as: Tag = 'div' }: PlaqueProps) {
  return (
    <Tag className={`plaque plaque--${variant}`}>
      <span className="plaque-ko" lang="ko">
        {ko}
      </span>
      <span className="plaque-en">{en}</span>
    </Tag>
  );
}
