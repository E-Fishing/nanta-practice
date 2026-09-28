import type { DrillMode } from '../engine/drills';

export interface DrillModeInfo {
  id: DrillMode;
  name: string;
  blurb: string;
  /** Taps are always scored. */
  taps: boolean;
  /** Tapping can be switched on as an extra. */
  optionalTaps: boolean;
}

/** The drill modes on offer (SPEC §4.3), in menu order. */
export const DRILL_MODES: readonly DrillModeInfo[] = [
  { id: 'fade', name: 'Fade', blurb: 'Every loop hides 15% more of the cells. Show me brings 10% back.', taps: false, optionalTaps: true },
  { id: 'gueum', name: 'Gu-eum only', blurb: 'Stage 1 hides the hand letters and keeps the syllables. Stage 2 keeps only the pulse grid.', taps: false, optionalTaps: true },
  { id: 'gap', name: 'Fill the gap', blurb: 'A few cells are blanked. Before each one lands, answer L, R, both or rest (F, J, F+J, space).', taps: false, optionalTaps: false },
  { id: 'tap', name: 'Tap-along', blurb: 'Tap your part: F = left, J = right, both = both hands. Scored per hit.', taps: true, optionalTaps: false },
  { id: 'cue', name: 'Cue drill', blurb: 'Only the lead’s cue figures and the click sound. Tap the first hit of each section on time.', taps: true, optionalTaps: false },
  { id: 'blind', name: 'Blind run', blurb: 'Blank chart, performance tempo, one pass. Then the heatmap and your three worst lines.', taps: true, optionalTaps: false },
];

export function drillModeInfo(mode: DrillMode): DrillModeInfo {
  return DRILL_MODES.find((info) => info.id === mode) ?? DRILL_MODES[0];
}
