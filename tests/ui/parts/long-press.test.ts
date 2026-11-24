// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { LONG_PRESS_MOVE_PX, LONG_PRESS_MS, observeLongPress } from '../../../src/ui/parts/long-press';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const pointer = (target: Element, type: string, x = 0, y = 0) =>
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, composed: true, cancelable: true }));

function setup() {
  const target = document.createElement('div');
  document.body.append(target);
  const onLongPress = vi.fn();
  const clicks = vi.fn();
  const stop = observeLongPress(target, onLongPress);
  target.addEventListener('click', clicks);
  return { target, onLongPress, clicks, stop };
}

test('a long press fires after 500 ms and swallows the click that follows', () => {
  expect([LONG_PRESS_MS, LONG_PRESS_MOVE_PX]).toEqual([500, 10]);
  const { target, onLongPress, clicks } = setup();
  pointer(target, 'pointerdown');
  vi.advanceTimersByTime(499);
  expect(onLongPress).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(onLongPress).toHaveBeenCalledTimes(1);
  pointer(target, 'pointerup');
  target.click();
  expect(clicks).not.toHaveBeenCalled();
  target.click();
  expect(clicks).toHaveBeenCalledTimes(1);
});

test('moving more than 10 px or releasing early cancels the long press', () => {
  const { target, onLongPress, clicks } = setup();
  pointer(target, 'pointerdown', 0, 0);
  pointer(target, 'pointermove', 8, 6);
  pointer(target, 'pointermove', 11, 0);
  vi.advanceTimersByTime(600);
  pointer(target, 'pointerdown');
  vi.advanceTimersByTime(300);
  pointer(target, 'pointerup');
  vi.advanceTimersByTime(600);
  expect(onLongPress).not.toHaveBeenCalled();
  target.click();
  expect(clicks).toHaveBeenCalledTimes(1);
});

test('a small wobble keeps the long press', () => {
  const { target, onLongPress } = setup();
  pointer(target, 'pointerdown', 0, 0);
  pointer(target, 'pointermove', 6, 6);
  vi.advanceTimersByTime(500);
  expect(onLongPress).toHaveBeenCalledTimes(1);
});

test('a right click counts as a long press and shows no browser menu', () => {
  const { target, onLongPress } = setup();
  const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  target.dispatchEvent(menu);
  expect(onLongPress).toHaveBeenCalledTimes(1);
  expect(menu.defaultPrevented).toBe(true);
});

test('stopping the observer removes every listener', () => {
  const { target, onLongPress, stop } = setup();
  stop();
  pointer(target, 'pointerdown');
  vi.advanceTimersByTime(600);
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(onLongPress).not.toHaveBeenCalled();
});
