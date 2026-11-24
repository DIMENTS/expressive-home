// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CLOSE_DRAG_PX, CLOSE_SPEED, observeSheetDrag } from '../../../src/ui/parts/sheet-drag';

beforeEach(() => { vi.useFakeTimers({ now: 1_000_000 }); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

function setup() {
  const panel = document.createElement('div');
  const handle = document.createElement('div');
  const button = document.createElement('button');
  handle.append(button);
  panel.append(handle);
  document.body.append(panel);
  const close = vi.fn();
  const state = { enabled: true };
  const stop = observeSheetDrag(handle, panel, close, () => state.enabled);
  const point = (type: string, y: number, target: Element = handle) =>
    target.dispatchEvent(new PointerEvent(type, { clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, composed: true, cancelable: true }));
  /** Moves from 100 to a place in some steps. */
  const drag = (to: number, ms: number) => {
    point('pointerdown', 100);
    for (let i = 1; i <= 4; i += 1) {
      vi.advanceTimersByTime(ms / 4);
      point('pointermove', 100 + ((to - 100) * i) / 4);
    }
  };
  return { panel, button, close, state, stop, point, drag, at: () => panel.style.getPropertyValue('--_drag'), dragging: () => panel.hasAttribute('data-dragging') };
}

test('far enough down and lifted closes it', () => {
  const s = setup();
  s.drag(100 + CLOSE_DRAG_PX + 4, 2000);
  expect([s.at(), s.dragging(), s.close.mock.calls.length]).toEqual([`${CLOSE_DRAG_PX + 4}px`, true, 0]);
  vi.advanceTimersByTime(500);
  s.point('pointerup', 100 + CLOSE_DRAG_PX + 4);
  expect([s.at(), s.dragging(), s.close.mock.calls.length]).toEqual(['', false, 1]);
});

test('a little, slowly, comes back; a flick closes it', () => {
  expect(CLOSE_SPEED).toBe(0.6);
  const s = setup();
  s.drag(140, 1000);
  s.point('pointerup', 140);
  expect([s.at(), s.close.mock.calls.length]).toEqual(['', 0]);
  s.drag(140, 40);
  s.point('pointerup', 140);
  expect(s.close).toHaveBeenCalledTimes(1);
  // fast, but held still before it is lifted
  s.drag(140, 40);
  vi.advanceTimersByTime(400);
  s.point('pointerup', 140);
  expect(s.close).toHaveBeenCalledTimes(1);
});

test('upwards it stays where it is', () => {
  const s = setup();
  s.drag(20, 200);
  expect(s.at()).toBe('0px');
  s.point('pointerup', 20);
  expect(s.close).not.toHaveBeenCalled();
});

test('a tap on a button in it is a tap', () => {
  const s = setup();
  s.point('pointerdown', 100, s.button);
  s.point('pointermove', 300, s.button);
  s.point('pointerup', 300, s.button);
  expect([s.at(), s.close.mock.calls.length]).toEqual(['', 0]);
});

test('a cancelled touch, a window that becomes wide, and stopping put it back', () => {
  const s = setup();
  s.drag(200, 200);
  s.point('pointercancel', 200);
  expect([s.at(), s.dragging(), s.close.mock.calls.length]).toEqual(['', false, 0]);
  s.drag(200, 200);
  s.state.enabled = false;
  s.point('pointermove', 260);
  expect([s.at(), s.dragging()]).toEqual(['', false]);
  s.point('pointerup', 260);
  s.drag(300, 200);
  expect([s.at(), s.close.mock.calls.length]).toEqual(['', 0]);
  s.point('pointerup', 300);
  s.state.enabled = true;
  s.drag(200, 200);
  s.stop();
  expect([s.at(), s.dragging()]).toEqual(['', false]);
  s.point('pointerup', 400);
  expect(s.close).not.toHaveBeenCalled();
});

test('a mouse that was let go elsewhere does not go on dragging', () => {
  const s = setup();
  const mouse = (type: string, y: number, buttons: number) =>
    s.button.parentElement!.dispatchEvent(new PointerEvent(type, { clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons, bubbles: true, composed: true }));
  mouse('pointerdown', 100, 1);
  mouse('pointermove', 180, 0);
  expect([s.at(), s.dragging()]).toEqual(['', false]);
  mouse('pointermove', 300, 0);
  mouse('pointerup', 300, 0);
  expect([s.at(), s.close.mock.calls.length]).toEqual(['', 0]);
});
