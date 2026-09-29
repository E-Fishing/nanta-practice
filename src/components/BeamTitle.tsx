import BeamBand from './BeamBand';
import type { PageName } from './pageNames';
import Plaque from './Plaque';
import Rosette from './Rosette';
import './BeamTitle.css';

export interface BeamTitleProps extends PageName {
  /** A rosette on the band each side of the plaque (Library only). */
  rosettes?: boolean;
}

/** Band L with the page's hanging plaque (DESIGN.md §5.2, §5.5). The plaque is the page's h1. */
export default function BeamTitle({ ko, en, rosettes = false }: BeamTitleProps) {
  return (
    <div className="beam-title">
      <BeamBand size="l" />
      <div className="beam-title-row">
        {rosettes ? <Rosette className="beam-title-rosette" /> : null}
        <Plaque ko={ko} en={en} variant="hanging" as="h1" />
        {rosettes ? <Rosette className="beam-title-rosette" /> : null}
      </div>
    </div>
  );
}
