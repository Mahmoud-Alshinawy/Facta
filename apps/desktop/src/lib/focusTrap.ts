// Focus-trap arithmetic, kept apart from the DOM so it can be tested.

/**
 * Where Tab should go inside a dialog. Returns the index to focus, or null
 * to let the browser move focus normally (it stays inside the dialog).
 * `current` is -1 when focus is outside the focusable list (e.g. on the
 * dialog itself).
 */
export function trapTab(current: number, count: number, shift: boolean): number | null {
  if (count === 0) return -1;
  if (current === -1) return shift ? count - 1 : 0;
  if (shift && current === 0) return count - 1;
  if (!shift && current === count - 1) return 0;
  return null;
}

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
