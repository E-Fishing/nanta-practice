import './Rosette.css';

/** Outer ring petal pointing up from the heart, and the lighter petal set inside it. */
const OUTER = 'M0 -46C13 -37 15 -20 0 -11C-15 -20 -13 -37 0 -46Z';
const OUTER_INNER = 'M0 -40C8 -33 9 -21 0 -15C-9 -21 -8 -33 0 -40Z';
/** Inner ring petal (vermilion), and its light center. */
const RING = 'M0 -32C10 -26 11 -15 0 -9C-11 -15 -10 -26 0 -32Z';
const RING_INNER = 'M0 -28C6 -24 6.5 -17 0 -13C-6.5 -17 -6 -24 0 -28Z';
const EIGHT = [0, 1, 2, 3, 4, 5, 6, 7];
/** Lotus seeds (연밥) on a circle of radius 8 around the center. */
const SEEDS = EIGHT.map((i) => [Number((8 * Math.cos((i * Math.PI) / 4)).toFixed(2)), Number((8 * Math.sin((i * Math.PI) / 4)).toFixed(2))]);

export interface RosetteProps {
  /** Width and height in px; CSS may override. Below 20 px use a plain vermilion dot instead. */
  size?: number;
  className?: string;
}

/**
 * Meoricho lotus rosette (DESIGN.md §4.2 O3), the painted head at each end of a dancheong beam:
 * 8 jade/blue petals, 8 vermilion petals between them, a gold heart with lotus seeds.
 */
export default function Rosette({ size = 48, className = '' }: RosetteProps) {
  return (
    <svg className={`rosette ${className}`.trim()} width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
      <g transform="translate(48 48)">
        {EIGHT.map((i) => (
          <g key={`outer-${i}`} transform={`rotate(${i * 45})`} className={i % 2 === 0 ? 'rosette-petal rosette-petal--jade' : 'rosette-petal rosette-petal--blue'}>
            <path className="rosette-outer" d={OUTER} />
            <path className="rosette-inner" d={OUTER_INNER} />
          </g>
        ))}
        {EIGHT.map((i) => (
          <g key={`ring-${i}`} transform={`rotate(${i * 45 + 22.5})`} className="rosette-petal rosette-petal--red">
            <path className="rosette-outer" d={RING} />
            <path className="rosette-inner" d={RING_INNER} />
          </g>
        ))}
        <circle className="rosette-heart" r="13" />
        {SEEDS.map(([cx, cy], i) => (
          <circle key={`seed-${i}`} className="rosette-seed" r="1.6" cx={cx} cy={cy} />
        ))}
        <circle className="rosette-center" r="3" />
      </g>
    </svg>
  );
}
