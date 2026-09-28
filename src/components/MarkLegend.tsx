import Cell from './Cell';
import type { CellView, HitView } from './cellView';
import './MarkLegend.css';

const PLAIN: HitView = {
  kind: 'hit',
  hand: 'R',
  grace: null,
  circled: false,
  underlined: false,
  triangle: false,
  arrow: false,
  cross: false,
  extraMarks: [],
  syllable: null,
  surface: null,
  label: '',
};

/** Sample cells, one per mark, drawn with the real Cell component so the legend can't drift. */
const ENTRIES: { view: CellView; text: string }[] = [
  { view: { ...PLAIN, circled: true, label: 'strong accent' }, text: 'strong accent' },
  { view: { ...PLAIN, triangle: true, label: 'small accent' }, text: 'small accent' },
  { view: { ...PLAIN, hand: 'L', underlined: true, label: 'soft' }, text: 'soft' },
  { view: { ...PLAIN, hand: 'L', arrow: true, label: 'lift' }, text: 'lift arm after' },
  { view: { ...PLAIN, cross: true, label: 'cross-arm' }, text: 'cross-arm' },
  { view: { ...PLAIN, hand: 'B', syllable: '덩', label: 'both hands, 덩' }, text: 'both hands + syllable' },
  { view: { ...PLAIN, hand: 'R', surface: 'rim', syllable: '딱', label: 'rim' }, text: 'rim (boxed)' },
  { view: { ...PLAIN, hand: 'R', grace: 'L', syllable: '그덩', label: 'flam' }, text: 'flam: small L first' },
  { view: { kind: 'extender', label: 'extender' }, text: '~ hold, no hit' },
  { view: { kind: 'rest', label: 'rest' }, text: 'rest' },
];

/** Collapsed by default: a reminder of the club's marks for newer members. */
export default function MarkLegend() {
  return (
    <details className="mark-legend">
      <summary className="mark-legend-summary">Marks</summary>
      <ul className="mark-legend-list">
        {ENTRIES.map((entry) => (
          <li key={entry.text} className="mark-legend-item">
            <Cell view={entry.view} />
            <span className="mark-legend-text">{entry.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
