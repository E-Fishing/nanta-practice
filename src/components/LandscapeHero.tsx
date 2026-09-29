import { useState } from 'react';
import Rosette from './Rosette';
import './LandscapeHero.css';

/**
 * The club's painting (DESIGN.md §6): 1920 × 800 WebP, relative to the page so it works from any
 * base path. The club supplies the file; nothing is fetched or drawn in its place.
 */
const ART_SRC = 'art/landscape.webp';

/**
 * Library hero (DESIGN.md §5.2): the painting set into a jade beam like a 별지화 panel, with a
 * rosette in each end zone when there is room. Until the file exists, the same box shows a
 * labeled placeholder.
 */
export default function LandscapeHero() {
  const [missing, setMissing] = useState(false);

  return (
    <div className="hero">
      <div className="hero-end" aria-hidden="true">
        <Rosette className="hero-rosette" size={128} />
      </div>
      <div className="hero-panel">
        {missing ? (
          <div className="hero-placeholder" role="note">
            <p className="hero-placeholder-title">Landscape art placeholder</p>
            <p className="hero-placeholder-spec">add public/art/landscape.webp · 1920 × 800 px WebP · ≤ 300 KB</p>
          </div>
        ) : (
          <img className="hero-image" src={ART_SRC} width={1920} height={800} loading="lazy" decoding="async" alt="" onError={() => setMissing(true)} />
        )}
      </div>
      <div className="hero-end" aria-hidden="true">
        <Rosette className="hero-rosette" size={128} />
      </div>
    </div>
  );
}
