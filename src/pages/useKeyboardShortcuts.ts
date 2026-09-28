/**
 * Player keyboard shortcuts (SPEC §4.2): space = play/pause, ← / → = jump one line,
 * [ and ] = tempo −/+ 5 BPM. Attached to the window so they work wherever focus is, except
 * inside text fields and selects (which need their own keys) and with a modifier held (browser
 * shortcuts stay theirs).
 */
import { useEffect, useRef } from 'react';

export interface PlayerShortcuts {
  /** Space. */
  playPause: () => void;
  /** ← (-1) / → (+1). */
  jumpLine: (delta: -1 | 1) => void;
  /** [ (-1) / ] (+1), in steps of `TEMPO_STEP_BPM`. */
  stepTempo: (steps: -1 | 1) => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useKeyboardShortcuts(shortcuts: PlayerShortcuts, enabled = true): void {
  // Handlers change every render; the listener reads the latest through a ref.
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      // The bracket keys by character, or by physical key when the layout puts something else there.
      const key = event.code === 'BracketLeft' ? '[' : event.code === 'BracketRight' ? ']' : event.key;
      switch (key) {
        case ' ':
          // Also swallows the browser's page scroll and a focused button's own activation.
          event.preventDefault();
          if (!event.repeat) latest.current.playPause();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          latest.current.jumpLine(-1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          latest.current.jumpLine(1);
          break;
        case '[':
          event.preventDefault();
          latest.current.stepTempo(-1);
          break;
        case ']':
          event.preventDefault();
          latest.current.stepTempo(1);
          break;
        default:
          break;
      }
    };
    // Buttons activate on the space key's release; keep a focused button from firing too.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && event.target instanceof HTMLButtonElement) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [enabled]);
}
