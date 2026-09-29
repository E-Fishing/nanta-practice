import './BeamBand.css';

/**
 * A mirrored hwi band (DESIGN.md §4.2 O1) for the header and the Library hero: the stripes bow
 * toward the center from both painted ends, with a vermilion mark where the halves meet.
 */
export default function BeamBand({ size }: { size: 'm' | 'l' }) {
  return (
    <div className={`beam-band beam-band--${size}`} aria-hidden="true">
      <span className="beam-band-half" />
      <span className="beam-band-half beam-band-half--mirror" />
    </div>
  );
}
