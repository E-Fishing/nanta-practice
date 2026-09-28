/**
 * Keyboard taps for the drills (SPEC §4.3): F = left hand, J = right hand, both together =
 * both hands (the scorer folds two taps inside the chord window into one). Fill the gap also
 * takes space = rest.
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

export interface TapKeyHandlers {
  onTap: (hand: Hand) => void;
  /** Space, when given. Fires even if another listener already handled the key. */
  onRest?: () => void;
}

export function useTapKeys(handlers: TapKeyHandlers, enabled = true): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      if (event.key === ' ') {
        const rest = latest.current.onRest;
        if (rest === undefined) return;
        event.preventDefault();
        rest();
        return;
      }
      const hand = KEY_HANDS[event.key.toLowerCase()];
      if (hand === undefined) return;
      event.preventDefault();
      latest.current.onTap(hand);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
