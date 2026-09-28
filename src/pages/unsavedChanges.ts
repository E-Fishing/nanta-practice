/**
 * Unsaved-changes warning for the editor (SPEC §4.4).
 *
 * The editor reports whether it holds unsaved work through `useUnsavedChanges()`. While it
 * does, closing or reloading the tab triggers the browser's own prompt, and in-app links
 * (the editor's own and the app header's) ask with `confirmLeave()` before navigating,
 * because the hash router has no data-router blocker to hook into.
 */
import { useEffect } from 'react';

export const UNSAVED_MESSAGE = 'You have unsaved changes in the editor. Leave without saving?';

let unsaved = false;

export function hasUnsavedChanges(): boolean {
  return unsaved;
}

/** True when it is fine to navigate away: nothing unsaved, or the user confirmed. */
export function confirmLeave(): boolean {
  return !unsaved || window.confirm(UNSAVED_MESSAGE);
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older browsers need a non-empty returnValue to show their prompt.
  event.returnValue = UNSAVED_MESSAGE;
}

/** Register (and on unmount clear) the unsaved state of the editor. */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    unsaved = dirty;
    if (!dirty) return undefined;
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsaved = false;
    };
  }, [dirty]);
}
