/**
 * Fade drill state (SPEC.md §4.3): every loop hides another `FADE_STEP` of the cells, in a
 * random order fixed by a seed so a hidden cell stays hidden; "Show me" (or a miss while
 * tapping) shows `REVEAL_STEP` of them again, most recently hidden first.
 *
 * The hidden set is always a prefix of one seeded shuffle of the cell keys, so the whole state
 * is the shuffle plus a count.
 */

export const FADE_STEP = 0.15;
export const REVEAL_STEP = 0.1;

/** mulberry32: a small seeded PRNG, plenty for shuffling a chart. Returns [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded generator. Never mutates `items`. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface FadeState {
  /** Every cell key of the section, in the order they hide. */
  readonly order: readonly string[];
  /** How many of `order` are hidden (a prefix). */
  readonly hidden: number;
}

export function createFade(cellKeys: readonly string[], seed: number): FadeState {
  return { order: seededShuffle(cellKeys, seed), hidden: 0 };
}

/** Cells hidden by one step: at least one, so a tiny section still fades. */
function stepSize(state: FadeState, fraction: number): number {
  return state.order.length === 0 ? 0 : Math.max(1, Math.round(state.order.length * fraction));
}

/** After a loop: hide `FADE_STEP` more of the cells. */
export function fadeStep(state: FadeState): FadeState {
  return { order: state.order, hidden: Math.min(state.order.length, state.hidden + stepSize(state, FADE_STEP)) };
}

/** "Show me" or a miss: show `REVEAL_STEP` of the cells again. */
export function reveal(state: FadeState): FadeState {
  return { order: state.order, hidden: Math.max(0, state.hidden - stepSize(state, REVEAL_STEP)) };
}

export function isFullBlank(state: FadeState): boolean {
  return state.order.length > 0 && state.hidden >= state.order.length;
}

export function hiddenFraction(state: FadeState): number {
  return state.order.length === 0 ? 0 : state.hidden / state.order.length;
}

export function hiddenKeys(state: FadeState): Set<string> {
  return new Set(state.order.slice(0, state.hidden));
}
