import type { PageName } from './pageNames';
import './BiLabel.css';

/** A nav label: Korean display text with the English label beneath in smaller type. */
export default function BiLabel({ ko, en }: PageName) {
  return (
    <span className="bi-label">
      <span className="bi-label-ko" lang="ko">
        {ko}
      </span>
      <span className="bi-label-en">{en}</span>
    </span>
  );
}
