// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HOLD_DIM_MS, HOLD_MOVE_PX, observeHoldDim, SCROLL_QUIET_MS, SWIPE_PX } from '../../../src/ui/parts/hold-dim';

// the moment of the last scroll is shared by all tiles: every test is later than the one before
let clock = 1_000_000;
beforeEach(() => { vi.useFakeTimers({ now: (clock += 60_000) }); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const pointer = (target: EventTarget, type: string, x = 0, y = 0, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, composed: true, cancelable: true, ...init }));
const cancelable = (type: string) => new Event(type, { bubbles: true, cancelable: true });

function setup({ enabled = true, canDim = true } = {}) {
  const target = document.createElement('div');
  document.body.append(target);
  const calls: unknown[][] = [];
  const state = { enabled, canDim };
  const stop = observeHoldDim(target, {
    enabled: () => state.enabled, canDim: () => state.canDim,
    start: (y) => calls.push(['start', y]), move: (y) => calls.push(['move', y]), end: (swiped, lifted) => calls.push(['end', swiped, lifted]), open: () => calls.push(['open']),
  });
  const clicks = vi.fn();
  target.addEventListener('click', clicks);
  return { target, calls, clicks, state, stop };
}
const hold = (target: Element, y = 100) => { pointer(target, 'pointerdown', 10, y); vi.advanceTimersByTime(HOLD_DIM_MS); };

test('a short tap is a tap', () => {
  expect([HOLD_DIM_MS, HOLD_MOVE_PX, SWIPE_PX, SCROLL_QUIET_MS]).toEqual([350, 10, 6, 200]);
  const s = setup();
  pointer(s.target, 'pointerdown');
  vi.advanceTimersByTime(HOLD_DIM_MS - 1);
  pointer(s.target, 'pointerup');
  s.target.click();
  vi.advanceTimersByTime(2000);
  expect([s.calls, s.clicks.mock.calls.length]).toEqual([[], 1]);
});

test('holding still and swiping moves until the finger is lifted; the click that follows is swallowed', () => {
  const s = setup();
  hold(s.target);
  pointer(s.target, 'pointermove', 10, 80);
  pointer(s.target, 'pointermove', 40, 60);
  pointer(s.target, 'pointerup', 40, 60);
  s.target.click();
  pointer(s.target, 'pointermove', 40, 10);
  expect(s.calls).toEqual([['start', 100], ['move', 80], ['move', 60], ['end', true, true]]);
  expect(s.clicks).not.toHaveBeenCalled();
  // the next tap is a tap again
  pointer(s.target, 'pointerdown');
  pointer(s.target, 'pointerup');
  s.target.click();
  expect(s.clicks).toHaveBeenCalledTimes(1);
});

test('it begins where the finger is by then, which can have wobbled', () => {
  const s = setup();
  pointer(s.target, 'pointerdown', 10, 100);
  pointer(s.target, 'pointermove', 12, 105);
  vi.advanceTimersByTime(HOLD_DIM_MS);
  pointer(s.target, 'pointerup', 12, 105);
  expect(s.calls).toEqual([['start', 105], ['end', false, true]]);
});

test('holding and lifting without swiping is no swipe, and there and back is one', () => {
  const s = setup();
  hold(s.target);
  pointer(s.target, 'pointermove', 10, 100 + SWIPE_PX);
  pointer(s.target, 'pointerup', 10, 100);
  expect(s.calls).toEqual([['start', 100], ['end', false, true]]);
  hold(s.target);
  pointer(s.target, 'pointermove', 10, 60);
  pointer(s.target, 'pointermove', 10, 100);
  pointer(s.target, 'pointerup', 10, 100);
  expect(s.calls.at(-1)).toEqual(['end', true, true]);
});

test('moving first is scrolling', () => {
  const s = setup();
  pointer(s.target, 'pointerdown', 0, 0);
  vi.advanceTimersByTime(100);
  pointer(s.target, 'pointermove', 0, HOLD_MOVE_PX + 1);
  vi.advanceTimersByTime(2000);
  expect(s.calls).toEqual([]);
});

test('a finger that stops the scrolling of the page starts nothing, however long it lies there', () => {
  const s = setup();
  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(100);
  hold(s.target);
  vi.advanceTimersByTime(2000);
  pointer(s.target, 'pointerup');
  expect(s.calls).toEqual([]);
  vi.advanceTimersByTime(SCROLL_QUIET_MS);
  hold(s.target);
  expect(s.calls).toEqual([['start', 100]]);
});

test('a clock that is set back does not keep the dimmer away', () => {
  const s = setup();
  window.dispatchEvent(new Event('scroll'));
  vi.setSystemTime(Date.now() - 3_600_000);
  hold(s.target);
  expect(s.calls).toEqual([['start', 100]]);
});

test('the page does not scroll along, and the menu of the browser does not come', () => {
  const s = setup();
  const before = cancelable('touchmove');
  s.target.dispatchEvent(before);
  hold(s.target);
  const during = cancelable('touchmove');
  s.target.dispatchEvent(during);
  const menu = cancelable('contextmenu');
  s.target.dispatchEvent(menu);
  pointer(s.target, 'pointerup');
  const after = cancelable('touchmove');
  s.target.dispatchEvent(after);
  expect([before.defaultPrevented, during.defaultPrevented, menu.defaultPrevented, after.defaultPrevented]).toEqual([false, true, true, false]);
  expect(s.calls).toEqual([['start', 100], ['end', false, true]]);
});

test('a finger that was held gives no tap when it is lifted, on whatever opened under it by then', () => {
  const s = setup();
  const tap = cancelable('touchend');
  pointer(s.target, 'pointerdown');
  pointer(s.target, 'pointerup');
  s.target.dispatchEvent(tap);
  hold(s.target);
  pointer(s.target, 'pointerup');
  const lift = cancelable('touchend');
  s.target.dispatchEvent(lift);
  pointer(s.target, 'pointerdown');
  pointer(s.target, 'pointerup');
  const next = cancelable('touchend');
  s.target.dispatchEvent(next);
  expect([tap.defaultPrevented, lift.defaultPrevented, next.defaultPrevented]).toEqual([false, true, false]);
});

test('a second finger, a cancelled touch, and the end of the tile end it once', () => {
  const s = setup();
  hold(s.target);
  pointer(s.target, 'pointermove', 10, 50);
  pointer(window, 'pointerdown', 300, 300, { pointerId: 2, isPrimary: false });
  pointer(s.target, 'pointermove', 10, 20);
  pointer(s.target, 'pointerup', 10, 20);
  expect(s.calls).toEqual([['start', 100], ['move', 50], ['end', true, false]]);
  s.calls.length = 0;
  hold(s.target);
  pointer(s.target, 'pointercancel');
  pointer(s.target, 'pointermove', 10, 20);
  expect(s.calls).toEqual([['start', 100], ['end', false, false]]);
  s.calls.length = 0;
  hold(s.target);
  s.stop();
  pointer(s.target, 'pointermove', 10, 20);
  hold(s.target);
  expect(s.calls).toEqual([['start', 100], ['end', false, false]]);
});

test('a second finger before that is no hold', () => {
  const s = setup();
  pointer(s.target, 'pointerdown', 10, 100);
  pointer(s.target, 'pointerdown', 60, 100, { pointerId: 2, isPrimary: false });
  vi.advanceTimersByTime(2000);
  expect(s.calls).toEqual([]);
});

test('what cannot be dimmed now opens, as holding does everywhere; so does a right click', () => {
  const s = setup({ canDim: false });
  hold(s.target);
  pointer(s.target, 'pointermove', 10, 20);
  pointer(s.target, 'pointerup', 10, 20);
  s.target.click();
  expect([s.calls, s.clicks.mock.calls.length]).toEqual([[['open']], 0]);
  s.calls.length = 0;
  s.state.canDim = true;
  pointer(s.target, 'pointerdown', 0, 0, { button: 2 });
  const menu = cancelable('contextmenu');
  s.target.dispatchEvent(menu);
  expect([s.calls, menu.defaultPrevented]).toEqual([[['open']], true]);
});

test('while it is not enabled a press is an ordinary press, and a right click does nothing', () => {
  const s = setup({ enabled: false });
  hold(s.target);
  pointer(s.target, 'pointerup');
  s.target.click();
  s.target.dispatchEvent(cancelable('contextmenu'));
  expect([s.calls, s.clicks.mock.calls.length]).toEqual([[], 1]);
});

// ----- what the review found -----

test('a finger that stopped the scrolling opens nothing either when the browser tells that it lay there for long', () => {
  const s = setup();
  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(100);
  pointer(s.target, 'pointerdown', 10, 100);
  vi.advanceTimersByTime(500);
  const menu = cancelable('contextmenu');
  s.target.dispatchEvent(menu);
  expect([s.calls, menu.defaultPrevented]).toEqual([[], true]);
  pointer(s.target, 'pointerup', 10, 100);
  // moved first, and then lying still
  vi.advanceTimersByTime(1000);
  pointer(s.target, 'pointerdown', 10, 100);
  pointer(s.target, 'pointermove', 10, 100 + HOLD_MOVE_PX + 1);
  s.target.dispatchEvent(cancelable('contextmenu'));
  expect(s.calls).toEqual([]);
  pointer(s.target, 'pointerup', 10, 100);
  // a right click afterwards is one
  pointer(s.target, 'pointerdown', 0, 0, { button: 2 });
  s.target.dispatchEvent(cancelable('contextmenu'));
  expect(s.calls).toEqual([['open']]);
});

test('after holding, a click of a screen reader and a right click count again', () => {
  const s = setup();
  hold(s.target);
  pointer(s.target, 'pointerup');
  s.calls.length = 0;
  vi.advanceTimersByTime(1000);
  s.target.click();
  expect(s.clicks).toHaveBeenCalledTimes(1);
  hold(s.target);
  pointer(s.target, 'pointerup');
  s.calls.length = 0;
  pointer(s.target, 'pointerdown', 0, 0, { button: 2 });
  s.target.dispatchEvent(cancelable('contextmenu'));
  expect(s.calls).toEqual([['open']]);
});

test('a mouse whose button was lifted elsewhere, and a pointer that is taken away, end it', () => {
  const s = setup();
  const mouse = { pointerType: 'mouse' };
  pointer(s.target, 'pointerdown', 10, 100, { ...mouse, buttons: 1 });
  vi.advanceTimersByTime(HOLD_DIM_MS);
  pointer(s.target, 'pointermove', 10, 60, { ...mouse, buttons: 1 });
  pointer(s.target, 'pointermove', 10, 20, { ...mouse, buttons: 0 });
  pointer(s.target, 'pointermove', 10, 10, { ...mouse, buttons: 0 });
  expect(s.calls).toEqual([['start', 100], ['move', 60], ['end', true, false]]);
  s.calls.length = 0;
  hold(s.target);
  pointer(s.target, 'lostpointercapture', 10, 100);
  expect(s.calls).toEqual([['start', 100], ['end', false, false]]);
});

test('it can go sideways, and only for what it is asked for', () => {
  const target = document.createElement('div');
  document.body.append(target);
  const calls: unknown[][] = [];
  const stop = observeHoldDim(target, {
    enabled: () => true, canDim: () => true, accepts: (event) => event.pointerType === 'touch', missed: () => calls.push(['missed']),
    start: (x) => calls.push(['start', x]), move: (x) => calls.push(['move', x]), end: (swiped, lifted) => calls.push(['end', swiped, lifted]), open: () => calls.push(['open']),
  }, 'x');
  const touch = { pointerType: 'touch' };
  pointer(target, 'pointerdown', 50, 100, touch);
  vi.advanceTimersByTime(HOLD_DIM_MS);
  pointer(target, 'pointermove', 50 + SWIPE_PX + 1, 103, touch);
  // up and down afterwards does not matter
  pointer(target, 'pointermove', 57, 160, touch);
  pointer(target, 'pointerup', 90, 160, touch);
  expect(calls).toEqual([['start', 50], ['move', 57], ['move', 57], ['end', true, true]]);
  calls.length = 0;
  pointer(target, 'pointerdown', 50, 100, { pointerType: 'mouse' });
  vi.advanceTimersByTime(HOLD_DIM_MS * 3);
  pointer(target, 'pointerup', 50, 100, { pointerType: 'mouse' });
  expect(calls).toEqual([]);
  stop();
});

test('who taps it or swipes along it without holding is told that it was missed; who scrolls is not', () => {
  const target = document.createElement('div');
  document.body.append(target);
  const missed = vi.fn();
  const stop = observeHoldDim(target, { enabled: () => true, canDim: () => true, missed, start() {}, move() {}, end() {}, open() {} }, 'x');
  const gesture = (to: [number, number], ms = 50) => {
    pointer(target, 'pointerdown', 50, 100);
    vi.advanceTimersByTime(ms);
    if (to[0] !== 50 || to[1] !== 100) pointer(target, 'pointermove', ...to);
    pointer(target, 'pointerup', ...to);
    const times = missed.mock.calls.length;
    missed.mockClear();
    vi.advanceTimersByTime(1000);
    return times;
  };
  expect([gesture([50, 100]), gesture([120, 104]), gesture([54, 40]), gesture([50, 100], HOLD_DIM_MS + 50)]).toEqual([1, 1, 0, 0]);
  // a finger that stops the scrolling taps nothing
  window.dispatchEvent(new Event('scroll'));
  expect(gesture([50, 100])).toBe(0);
  // and what the browser takes for scrolling was no tap
  pointer(target, 'pointerdown', 50, 100);
  pointer(target, 'pointercancel', 50, 100);
  expect(missed).not.toHaveBeenCalled();
  stop();
});

test('a part inside that loses the pointer, because the whole took it, is no reason to let go', () => {
  const s = setup();
  const inside = s.target.appendChild(document.createElement('span'));
  hold(s.target);
  pointer(inside, 'lostpointercapture', 10, 100);
  pointer(s.target, 'pointermove', 10, 60);
  pointer(s.target, 'pointerup', 10, 60);
  expect(s.calls).toEqual([['start', 100], ['move', 60], ['end', true, true]]);
});

test('a second finger anywhere before that is no hold', () => {
  const s = setup();
  pointer(s.target, 'pointerdown', 10, 100);
  pointer(document.body, 'pointerdown', 300, 300, { pointerId: 2, isPrimary: false });
  vi.advanceTimersByTime(HOLD_DIM_MS * 2);
  pointer(s.target, 'pointermove', 10, 40);
  pointer(s.target, 'pointerup', 10, 40);
  expect(s.calls).toEqual([]);
  // and a finger that comes after that counts again
  hold(s.target);
  expect(s.calls).toEqual([['start', 100]]);
});

test('what yields lets go when a held finger goes across first: it scrolls after all', () => {
  const target = document.createElement('div');
  document.body.append(target);
  const calls: unknown[][] = [];
  const stop = observeHoldDim(target, {
    enabled: () => true, canDim: () => true, yields: true,
    start: (x) => calls.push(['start', x]), move: (x) => calls.push(['move', x]), end: (swiped, lifted) => calls.push(['end', swiped, lifted]), open() {},
  }, 'x');
  const prevented = (): boolean => { const event = cancelable('touchmove'); target.dispatchEvent(event); return event.defaultPrevented; };
  pointer(target, 'pointerdown', 50, 100);
  vi.advanceTimersByTime(HOLD_DIM_MS);
  pointer(target, 'pointermove', 52, 103);
  expect(prevented()).toBe(true);
  // twenty sideways on the way up, as a thumb does
  pointer(target, 'pointermove', 58, 80);
  expect(prevented()).toBe(false);
  pointer(target, 'pointermove', 120, 20);
  pointer(target, 'pointerup', 120, 20);
  expect(calls).toEqual([['start', 50], ['end', false, false]]);
  calls.length = 0;
  vi.advanceTimersByTime(1000);
  // once it goes along, it stays
  pointer(target, 'pointerdown', 50, 100);
  vi.advanceTimersByTime(HOLD_DIM_MS);
  pointer(target, 'pointermove', 60, 103);
  pointer(target, 'pointermove', 62, 160);
  pointer(target, 'pointerup', 62, 160);
  expect(calls).toEqual([['start', 50], ['move', 60], ['move', 62], ['end', true, true]]);
  stop();
});

test('swiping along it is told when the finger is lifted, not when the browser takes it for scrolling', () => {
  const target = document.createElement('div');
  document.body.append(target);
  const missed = vi.fn();
  const stop = observeHoldDim(target, { enabled: () => true, canDim: () => true, missed, start() {}, move() {}, end() {}, open() {} }, 'x');
  pointer(target, 'pointerdown', 50, 100);
  pointer(target, 'pointermove', 80, 104);
  expect(missed).not.toHaveBeenCalled();
  pointer(target, 'pointercancel', 80, 104);
  pointer(target, 'pointerup', 80, 104);
  expect(missed).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  pointer(target, 'pointerdown', 50, 100);
  pointer(target, 'pointermove', 80, 104);
  pointer(target, 'pointerup', 90, 104);
  expect(missed).toHaveBeenCalledOnce();
  stop();
});
