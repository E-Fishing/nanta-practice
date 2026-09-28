import type { DrillMode } from '../pages/useDrillRun';

export interface DrillModeInfo {
  id: DrillMode;
  name: string;
  blurb: string;
}

/** The drill modes on offer (SPEC §4.3), in menu order. */
export const DRILL_MODES: readonly DrillModeInfo[] = [
  { id: 'fade', name: 'Fade', blurb: 'Every loop hides 15% more of the cells. Show me brings 10% back.' },
  { id: 'tap', name: 'Tap-along', blurb: 'Tap your part: F = left, J = right, both = both hands. Scored per hit.' },
];
