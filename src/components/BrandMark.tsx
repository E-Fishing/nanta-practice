import './BrandMark.css';

/**
 * The brand: a buk drum head with a samtaegeuk (DESIGN.md §4.2 O5). Three colors always fill the
 * whole disc; never one color and never three separate commas in a ring.
 */
export default function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`brand-mark ${className}`.trim()} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle className="brand-mark-rim" cx="50" cy="50" r="49" />
      <circle className="brand-mark-ring" cx="50" cy="50" r="45.5" />
      <path className="brand-mark-red" d="M50 50A25 25 0 0 1 50 7A43 43 0 0 1 87.24 71.5A25 25 0 0 0 50 50Z" />
      <path className="brand-mark-blue" d="M50 50A25 25 0 0 1 87.24 71.5A43 43 0 0 1 12.76 71.5A25 25 0 0 0 50 50Z" />
      <path className="brand-mark-yellow" d="M50 50A25 25 0 0 1 12.76 71.5A43 43 0 0 1 50 7A25 25 0 0 0 50 50Z" />
      <circle className="brand-mark-edge" cx="50" cy="50" r="43" />
    </svg>
  );
}
