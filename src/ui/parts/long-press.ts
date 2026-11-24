/** A press this long opens the device window. */
export const LONG_PRESS_MS = 500;
/** Moving the finger further than this cancels the long press. */
export const LONG_PRESS_MOVE_PX = 10;

/**
 * Calls `onLongPress` after a press of LONG_PRESS_MS without moving more than LONG_PRESS_MOVE_PX, and
 * on a right click (without the browser's own menu). The click that ends a long press is swallowed,
 * so the tile does not also toggle. While `enabled` says no, a press is an ordinary press and a right click does
 * nothing. Returns a function that removes every listener.
 */
export function observeLongPress(target: HTMLElement, onLongPress: () => void, enabled: () => boolean = () => true): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  let swallowClick = false;
  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    start = null;
  };
  const onDown = (event: PointerEvent): void => {
    if (event.button !== undefined && event.button > 0) return;
    cancel();
    swallowClick = false;
    if (!enabled()) return;
    start = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      timer = null;
      start = null;
      swallowClick = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const onMove = (event: PointerEvent): void => {
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > LONG_PRESS_MOVE_PX) cancel();
  };
  const onClick = (event: Event): void => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onMenu = (event: Event): void => {
    event.preventDefault();
    cancel();
    if (enabled()) onLongPress();
  };
  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) target.addEventListener(type, cancel);
  target.addEventListener('click', onClick, { capture: true });
  target.addEventListener('contextmenu', onMenu);
  return () => {
    cancel();
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    for (const type of ['pointerup', 'pointercancel', 'pointerleave'] as const) target.removeEventListener(type, cancel);
    target.removeEventListener('click', onClick, { capture: true });
    target.removeEventListener('contextmenu', onMenu);
  };
}
