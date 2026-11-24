import { pixels } from '../pixels';

/** Swept this far down, a panel closes. */
export const CLOSE_DRAG_PX = 96;
/** Or this fast, in pixels per millisecond, over a short way. */
export const CLOSE_SPEED = 0.6;
const FLICK_PX = 16;
/** A movement smaller than this is the wobble of a tap. */
const BEGIN_PX = 4;
/** The speed is that of the last moment. */
const SPEED_MS = 100;

const isButton = (node: EventTarget): boolean => node instanceof HTMLElement && (node.localName === 'button' || node.localName === 'mh-button');

/**
 * Sweeping a panel down by its top. The panel follows the finger through `--_drag`, with `data-dragging`
 * meanwhile; far enough or fast enough it closes, otherwise it comes back. Returns how to stop, which puts it back.
 */
export function observeSheetDrag(handle: HTMLElement, panel: HTMLElement, close: () => void, enabled: () => boolean): () => void {
  let press: { id: number; y: number } | null = null;
  let dragging = false;
  let trail: { at: number; y: number }[] = [];

  function reset(): void {
    press = null;
    dragging = false;
    trail = [];
    panel.removeAttribute('data-dragging');
    panel.style.removeProperty('--_drag');
  }

  function capture(id: number): void {
    try {
      handle.setPointerCapture?.(id);
    } catch {
      // the finger was lifted just now; its pointerup ends it
    }
  }

  function onDown(event: PointerEvent): void {
    if (press || event.button > 0 || event.isPrimary === false || !enabled()) return;
    if (event.composedPath().slice(0, event.composedPath().indexOf(handle)).some(isButton)) return;
    press = { id: event.pointerId, y: event.clientY };
    capture(event.pointerId);
    trail = [{ at: Date.now(), y: event.clientY }];
  }

  function onMove(event: PointerEvent): void {
    if (!press || event.pointerId !== press.id) return;
    // the window became wide, or the button of the mouse was lifted where nobody heard it
    if (!enabled() || (event.pointerType === 'mouse' && event.buttons === 0)) { reset(); return; }
    const offset = event.clientY - press.y;
    if (!dragging && Math.abs(offset) <= BEGIN_PX) return;
    if (!dragging) {
      dragging = true;
      panel.setAttribute('data-dragging', '');
    }
    trail.push({ at: Date.now(), y: event.clientY });
    panel.style.setProperty('--_drag', pixels(Math.max(0, offset)));
  }

  function onUp(event: PointerEvent): void {
    if (!press || event.pointerId !== press.id) return;
    const offset = event.clientY - press.y;
    const now = Date.now();
    const recent = trail.find((point) => now - point.at <= SPEED_MS);
    const speed = recent && now > recent.at ? (event.clientY - recent.y) / (now - recent.at) : 0;
    const leaves = dragging && event.type === 'pointerup' && (offset >= CLOSE_DRAG_PX || (offset >= FLICK_PX && speed >= CLOSE_SPEED));
    reset();
    if (leaves) close();
  }

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
  return () => {
    reset();
    handle.removeEventListener('pointerdown', onDown);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
}
