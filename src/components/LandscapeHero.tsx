import { useState, type CSSProperties } from 'react';
import Rosette from './Rosette';
import './LandscapeHero.css';

/**
 * The club's painting (DESIGN.md §6), relative to the page so it works from any base path. Its
 * pixel size sets the panel's aspect ratio, so the painting is always shown whole, never cropped.
 * The club supplies the file; nothing is fetched or drawn in its place.
 */
const ART = {
  src: 'art/landscape.webp',
  width: 598,
  height: 703,
  alt: "Kim Hong-do's Dancing Boy: a boy dances while six seated musicians play a drum, a janggu, two piri, a daegeum and a haegeum.",
};

/**
 * Library hero (DESIGN.md §5.2): the painting framed like a 별지화 panel on the jade beam, with a
 * rosette in each end zone when there is room and the credit underneath. If the file is missing,
 * the same box shows a labeled placeholder.
 */
export default function LandscapeHero() {
  const [missing, setMissing] = useState(false);
  const ratio = { '--art-w': ART.width, '--art-h': ART.height } as CSSProperties;

  return (
    <div className="hero">
      <div className="hero-end" aria-hidden="true">
        <Rosette className="hero-rosette" size={176} />
      </div>
      <figure className="hero-figure" style={ratio}>
        <div className="hero-panel">
          {missing ? (
            <div className="hero-placeholder" role="note">
              <p className="hero-placeholder-title">Painting placeholder</p>
              <p className="hero-placeholder-spec">add public/art/landscape.webp · WebP ≤ 300 KB</p>
            </div>
          ) : (
            <img className="hero-image" src={ART.src} width={ART.width} height={ART.height} loading="lazy" decoding="async" alt={ART.alt} onError={() => setMissing(true)} />
          )}
        </div>
        {missing ? null : (
          <figcaption className="hero-credit">
            <span lang="ko">김홍도 〈무동〉</span> · Kim Hong-do, <cite>Dancing Boy</cite>, late 18th century · National Museum of Korea
          </figcaption>
        )}
      </figure>
      <div className="hero-end" aria-hidden="true">
        <Rosette className="hero-rosette" size={176} />
      </div>
    </div>
  );
}
