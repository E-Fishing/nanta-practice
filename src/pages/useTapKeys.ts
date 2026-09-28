/**
 * Keyboard taps for the drills (SPEC §4.3): F = left hand, J = right hand, both together =
 * both hands (the scorer folds two taps inside the chord window into one).
 */
import { useEffect, useRef } from 'react';
import type { Hand } from '../engine/types';

const KEY_HANDS: Record<string, Hand> = { f: 'L', j: 'R' };

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useTapKeys(onTap: (hand: Hand) => void, enabled = true): void {
  const latest = useRef(onTap);
  useEffect(() => {
    latest.current = onTap;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      const hand = KEY_HANDS[event.key.toLowerCase()];
      if (hand === undefined) return;
      event.preventDefault();
      latest.current(hand);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
