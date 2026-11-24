// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createWall, type Wall } from '../../../src/ui/app/wall';
import { defaultWall, type WallSettings } from '../../../src/wall/settings';

const MINUTE = 60_000;
const at = (time: string): Date => new Date(`2026-11-23T${time}:00`);

const running: Wall[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at('12:00')); });
afterEach(() => {
  for (const wall of running.splice(0)) wall.stop();
  document.body.replaceChildren();
  vi.useRealTimers();
});

function setup(settings: Partial<WallSettings> = {}) {
  const state = { settings: { ...defaultWall(), on: true, ...settings } as WallSettings, allowed: true, shift: 0 };
  const began = vi.fn();
  const ended = vi.fn();
  const update = vi.fn();
  const wall = createWall({
    target: window, now: () => Date.now() + state.shift, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    settings: () => state.settings, allowed: () => state.allowed, began, ended, update,
  });
  running.push(wall);
  wall.start();
  return { wall, state, began, ended, update };
}

/** An event as the browser sends one to what lies there; says whether it got there and whether the browser may act on it. */
function send(type: string, init: Record<string, unknown> = {}, target: EventTarget = document.body) {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  for (const [key, value] of Object.entries(init)) Object.defineProperty(event, key, { value });
  let arrived = false;
  const see = (): void => { arrived = true; };
  target.addEventListener(type, see);
  target.dispatchEvent(event);
  target.removeEventListener(type, see);
  return { arrived, prevented: event.defaultPrevented };
}
const swallowed = { arrived: false, prevented: true };
const passed = { arrived: true, prevented: false };
const touches = (n: number) => ({ touches: Array.from({ length: n }, () => ({})) });
const mouse = (x: number, y = 0) => send('pointermove', { pointerType: 'mouse', clientX: x, clientY: y });

// ----- coming -----

test('it comes after two minutes of silence, not before', () => {
  const s = setup();
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect([s.wall.shown, s.began.mock.calls.length]).toEqual(['none', 0]);
  vi.advanceTimersByTime(1);
  expect([s.wall.shown, s.wall.look, s.began.mock.calls.length, s.wall.leaving]).toEqual(['rest', 'day', 1, false]);
  expect(s.update).toHaveBeenCalled();
});

test.each(['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove', 'input'])('%s is a sign of life', (type) => {
  const s = setup();
  vi.advanceTimersByTime(MINUTE);
  expect(send(type)).toEqual(passed);
  if (type === 'pointerdown') send('pointerup');
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(s.wall.shown).toBe('none');
  vi.advanceTimersByTime(1);
  expect(s.wall.shown).toBe('rest');
});

test('a sign of life counts too when somebody else keeps it to themselves', () => {
  const s = setup();
  vi.advanceTimersByTime(MINUTE);
  document.body.addEventListener('pointerdown', (event) => event.stopPropagation(), { once: true });
  send('pointerdown');
  vi.advanceTimersByTime(MINUTE);
  expect(s.wall.shown).toBe('none');
});

test('the minutes are those of the settings', () => {
  const s = setup({ after: 10 });
  vi.advanceTimersByTime(9 * MINUTE);
  expect(s.wall.shown).toBe('none');
  s.state.settings = { ...s.state.settings, after: 5 };
  s.wall.changed();
  expect(s.wall.shown).toBe('rest');
});

test('at night half a minute is enough', () => {
  vi.setSystemTime(at('23:00'));
  const s = setup();
  expect(s.wall.night).toBe(true);
  vi.advanceTimersByTime(29_999);
  expect(s.wall.shown).toBe('none');
  vi.advanceTimersByTime(1);
  expect([s.wall.shown, s.wall.look]).toEqual(['rest', 'night']);
});

test('a flow makes it night: who was gone for forty seconds sees it at once', () => {
  const s = setup();
  vi.advanceTimersByTime(40_000);
  s.wall.setFlow({ night: true, at: Date.now() });
  expect([s.wall.night, s.wall.shown, s.wall.look]).toEqual([true, 'rest', 'night']);
  s.wall.setFlow({ night: false, at: Date.now() });
  expect([s.wall.night, s.wall.shown, s.wall.look]).toEqual([false, 'rest', 'day']);
  s.wall.setFlow(null);
  expect(s.wall.night).toBe(false);
});

test('when it may not, it does not; when it may, it comes', () => {
  const s = setup();
  s.state.allowed = false;
  vi.advanceTimersByTime(10 * MINUTE);
  expect(s.wall.shown).toBe('none');
  s.state.allowed = true;
  s.wall.changed();
  expect([s.wall.shown, s.began.mock.calls.length]).toEqual(['rest', 1]);
});

test('a device that is no wall tablet has nothing of it: no rest screen, no night, no listeners, no timers', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const s = setup({ on: false });
  expect([add.mock.calls.length, vi.getTimerCount()]).toEqual([0, 0]);
  vi.setSystemTime(at('23:30'));
  s.wall.changed();
  vi.advanceTimersByTime(60 * MINUTE);
  expect([s.wall.shown, s.wall.night, s.began.mock.calls.length]).toEqual(['none', false, 0]);
  add.mockRestore();
});

test('it can be turned on and off while it runs', () => {
  const s = setup({ on: false });
  s.state.settings = { ...s.state.settings, on: true };
  s.wall.changed();
  vi.advanceTimersByTime(2 * MINUTE);
  expect(s.wall.shown).toBe('rest');
  // another tab turns it off
  s.state.settings = { ...s.state.settings, on: false };
  s.wall.changed();
  expect([s.wall.shown, s.ended.mock.calls, vi.getTimerCount()]).toEqual(['none', [['rest']], 0]);
  expect(send('click')).toEqual(passed);
});

test('what is not allowed any more ends it, once', () => {
  const s = setup();
  vi.advanceTimersByTime(2 * MINUTE);
  s.state.allowed = false;
  s.wall.changed();
  s.wall.changed();
  expect([s.wall.shown, s.ended.mock.calls]).toEqual(['none', [['rest']]]);
});

test('it can be there at once', () => {
  const s = setup();
  s.wall.restNow();
  expect([s.wall.shown, s.began.mock.calls.length]).toEqual(['rest', 1]);
  const off = setup({ on: false });
  off.wall.restNow();
  expect(off.wall.shown).toBe('none');
});

test('stopping leaves nothing behind', () => {
  const s = setup();
  vi.advanceTimersByTime(2 * MINUTE);
  s.wall.stop();
  expect(vi.getTimerCount()).toBe(0);
  expect([send('pointerdown', { pointerType: 'touch' }), send('click'), send('keydown', { key: 'a' })]).toEqual([passed, passed, passed]);
});

// ----- the clock -----

test('every whole minute it draws the time again while it is there', () => {
  vi.setSystemTime(new Date('2026-11-23T12:00:20'));
  const s = setup();
  s.wall.restNow();
  vi.advanceTimersByTime(1000);
  s.update.mockClear();
  vi.advanceTimersByTime(38_999);
  expect(s.update).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect([s.update.mock.calls.length, s.wall.now.getMinutes()]).toEqual([1, 1]);
  vi.advanceTimersByTime(5 * MINUTE);
  expect([s.update.mock.calls.length, s.wall.now.getMinutes()]).toEqual([6, 6]);
});

test('while somebody uses the dashboard the minutes draw nothing', () => {
  const s = setup({ after: 10 });
  s.update.mockClear();
  vi.advanceTimersByTime(5 * MINUTE);
  expect(s.update).not.toHaveBeenCalled();
});

test('the night comes and goes by itself, without waking', () => {
  vi.setSystemTime(at('22:25'));
  const s = setup();
  vi.advanceTimersByTime(4 * MINUTE);
  expect([s.wall.shown, s.wall.look]).toEqual(['rest', 'day']);
  vi.advanceTimersByTime(MINUTE);
  expect([s.wall.shown, s.wall.look, s.wall.night]).toEqual(['rest', 'night', true]);
  vi.advanceTimersByTime(9 * 60 * MINUTE - 1);
  expect(s.wall.look).toBe('night');
  vi.advanceTimersByTime(1);
  expect([s.wall.shown, s.wall.look]).toEqual(['rest', 'day']);
  expect([s.began.mock.calls.length, s.ended.mock.calls.length]).toEqual([1, 0]);
});

test('the night that begins while somebody uses it draws once, and takes nothing away', () => {
  vi.setSystemTime(at('22:29'));
  const s = setup();
  send('pointerdown', { pointerType: 'touch' });
  s.update.mockClear();
  vi.advanceTimersByTime(MINUTE - 1);
  send('pointerdown', { pointerType: 'touch' });
  vi.advanceTimersByTime(1);
  expect([s.wall.night, s.wall.shown, s.update.mock.calls.length]).toEqual([true, 'none', 1]);
});

test('a tablet that slept knows the time when it wakes', () => {
  const s = setup();
  s.wall.restNow();
  s.state.shift = 11 * 60 * MINUTE;
  document.dispatchEvent(new Event('visibilitychange'));
  expect([s.wall.look, s.wall.now.getHours(), s.ended.mock.calls.length]).toEqual(['night', 23, 0]);
});

test.each([-60, 60])('a clock that jumps %s minutes makes no flicker', (minutes) => {
  const s = setup();
  s.wall.restNow();
  s.state.shift = minutes * MINUTE;
  vi.advanceTimersByTime(30 * MINUTE);
  expect([s.wall.shown, s.began.mock.calls.length, s.ended.mock.calls.length]).toEqual(['rest', 1, 0]);
});

// ----- waking -----

test('a touch wakes, and does nothing else from the first moment to the last', () => {
  const s = setup();
  s.wall.restNow();
  expect(send('pointerdown', { pointerType: 'touch' })).toEqual(swallowed);
  expect(send('touchstart', touches(1))).toEqual(swallowed);
  expect([s.wall.shown, s.wall.leaving, s.ended.mock.calls.length]).toEqual(['rest', true, 0]);
  // however long it stays, and wherever it goes
  vi.advanceTimersByTime(10_000);
  expect(send('contextmenu')).toEqual(swallowed);
  expect(send('pointermove', { pointerType: 'touch', clientX: 400 })).toEqual(swallowed);
  expect(send('touchmove', touches(1))).toEqual(swallowed);
  expect(s.wall.shown).toBe('rest');
  expect(send('pointerup', { pointerType: 'touch' })).toEqual(swallowed);
  expect(send('touchend', touches(0))).toEqual(swallowed);
  vi.advanceTimersByTime(300);
  expect([s.wall.shown, s.wall.leaving, s.ended.mock.calls]).toEqual(['none', false, [['rest']]]);
  // the next one is an ordinary touch
  expect([send('pointerdown', { pointerType: 'touch' }), send('touchstart', touches(1)), send('touchend', touches(0)), send('click')]).toEqual([passed, passed, passed, passed]);
});

test('two fingers: the last one that is lifted counts', () => {
  const s = setup();
  s.wall.restNow();
  send('touchstart', touches(1));
  send('touchstart', touches(2));
  send('touchend', touches(1));
  expect(s.wall.shown).toBe('rest');
  send('touchend', touches(0));
  vi.advanceTimersByTime(300);
  expect(s.wall.shown).toBe('none');
});

test('a touch that the system takes over wakes too', () => {
  const s = setup();
  s.wall.restNow();
  send('touchstart', touches(1));
  send('touchcancel', touches(0));
  vi.advanceTimersByTime(300);
  expect(s.wall.shown).toBe('none');
});

test('a mouse wakes with the whole click, and does nothing else', () => {
  const s = setup();
  s.wall.restNow();
  expect(send('pointerdown', { pointerType: 'mouse' })).toEqual(swallowed);
  expect(send('mousedown')).toEqual(swallowed);
  expect(send('pointerup', { pointerType: 'mouse' })).toEqual(swallowed);
  expect(send('mouseup')).toEqual(swallowed);
  expect(s.wall.shown).toBe('rest');
  expect(send('click')).toEqual(swallowed);
  vi.advanceTimersByTime(300);
  expect(s.wall.shown).toBe('none');
  expect(send('click')).toEqual(passed);
});

test('a mouse button without a click is over a little later', () => {
  const s = setup();
  s.wall.restNow();
  send('pointerdown', { pointerType: 'mouse' });
  send('pointerup', { pointerType: 'mouse' });
  vi.advanceTimersByTime(399);
  expect(s.wall.shown).toBe('rest');
  vi.advanceTimersByTime(1);
  expect(s.wall.shown).toBe('none');
});

test('a click by itself, as a screen reader makes one, wakes', () => {
  const s = setup();
  s.wall.restNow();
  expect(send('click')).toEqual(swallowed);
  vi.advanceTimersByTime(300);
  expect(s.wall.shown).toBe('none');
});

test.each([' ', 'Enter', 'Escape', 'Tab', 'a', 'ArrowDown'])('the key %j wakes, and neither pressing nor letting go does anything', (key) => {
  const s = setup();
  s.wall.restNow();
  expect(send('keydown', { key })).toEqual(swallowed);
  expect([s.wall.shown, s.wall.leaving]).toEqual(['rest', true]);
  // a key that is held repeats itself
  vi.advanceTimersByTime(900);
  expect(send('keydown', { key, repeat: true })).toEqual(swallowed);
  vi.advanceTimersByTime(900);
  expect(send('keyup', { key })).toEqual(swallowed);
  expect(s.wall.shown).toBe('none');
  expect(send('keydown', { key })).toEqual(passed);
});

test('a key whose letting go is never heard of is over after a second and a half', () => {
  const s = setup();
  s.wall.restNow();
  send('keydown', { key: ' ' });
  vi.advanceTimersByTime(1499);
  expect(s.wall.shown).toBe('rest');
  vi.advanceTimersByTime(1);
  expect(s.wall.shown).toBe('none');
});

test.each([{ key: 'r', ctrlKey: true }, { key: 'l', metaKey: true }, { key: 'Tab', altKey: true }, { key: 'F5' }, { key: 'F11' }])('a key of the browser wakes and still does what it does: %j', (init) => {
  const s = setup();
  s.wall.restNow();
  expect(send('keydown', init)).toEqual(passed);
  expect(s.wall.shown).toBe('none');
});

test('a wheel wakes', () => {
  const s = setup();
  s.wall.restNow();
  expect(send('wheel')).toEqual(swallowed);
  expect([s.wall.shown, s.wall.leaving]).toEqual(['rest', true]);
  // the rest of the same scroll
  vi.advanceTimersByTime(300);
  expect(send('wheel')).toEqual(swallowed);
  vi.advanceTimersByTime(399);
  expect(s.wall.shown).toBe('rest');
  vi.advanceTimersByTime(1);
  expect(s.wall.shown).toBe('none');
});

test('a mouse that the browser reports without it moving, or that trembles, keeps it there', () => {
  const s = setup();
  s.wall.restNow();
  mouse(200, 100);
  mouse(200, 100);
  mouse(203, 104);
  expect(s.wall.shown).toBe('rest');
  mouse(206, 100);
  expect([s.wall.shown, s.wall.leaving]).toEqual(['rest', true]);
  vi.advanceTimersByTime(400);
  expect([s.wall.shown, s.ended.mock.calls]).toEqual(['none', [['rest']]]);
});

test('a finger or pen that hovers wakes nothing', () => {
  const s = setup();
  s.wall.restNow();
  for (const pointerType of ['touch', 'pen']) {
    send('pointermove', { pointerType, clientX: 0, clientY: 0 });
    send('pointermove', { pointerType, clientX: 500, clientY: 0 });
  }
  expect(s.wall.shown).toBe('rest');
});

test('where the mouse was the last time does not count', () => {
  const s = setup();
  s.wall.restNow();
  mouse(0);
  mouse(100);
  vi.advanceTimersByTime(400);
  expect(s.wall.shown).toBe('none');
  s.wall.restNow();
  mouse(400);
  expect(s.wall.shown).toBe('rest');
});

test('after waking the silence begins anew', () => {
  const s = setup();
  vi.advanceTimersByTime(2 * MINUTE);
  send('click');
  vi.advanceTimersByTime(300);
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(s.wall.shown).toBe('none');
  vi.advanceTimersByTime(1);
  expect([s.wall.shown, s.began.mock.calls.length]).toEqual(['rest', 2]);
});

// ----- covering the dashboard -----

test('the dashboard can rest as soon as it is covered, not while it comes or goes', () => {
  const s = setup();
  s.wall.restNow();
  expect(s.wall.covered).toBe(false);
  vi.advanceTimersByTime(999);
  expect(s.wall.covered).toBe(false);
  vi.advanceTimersByTime(1);
  expect(s.wall.covered).toBe(true);
  send('touchstart', touches(1));
  expect(s.wall.covered).toBe(false);
  send('touchend', touches(0));
  vi.advanceTimersByTime(5000);
  expect(s.wall.covered).toBe(false);
});

// ----- having a look -----

test.each(['day', 'night'] as const)('having a look at the %s: only a click, a touch or a key ends it', (look) => {
  const s = setup({ on: false });
  s.wall.preview(look);
  expect([s.wall.shown, s.wall.look, s.began.mock.calls.length]).toEqual(['preview', look, 1]);
  mouse(0);
  mouse(500);
  vi.advanceTimersByTime(60 * MINUTE);
  expect([s.wall.shown, s.wall.look, s.wall.night]).toEqual(['preview', look, false]);
  expect(send('wheel')).toEqual(swallowed);
  expect([s.wall.shown, s.wall.leaving]).toEqual(['preview', false]);
  expect(send('pointerdown', { pointerType: 'mouse' })).toEqual(swallowed);
  expect(send('click')).toEqual(swallowed);
  vi.advanceTimersByTime(300);
  expect([s.wall.shown, s.ended.mock.calls]).toEqual(['none', [['preview']]]);
  expect(send('click')).toEqual(passed);
});

test('the key that asked for a look does not end it when it is let go', () => {
  const s = setup();
  s.wall.preview('day');
  send('keyup', { key: 'Enter' });
  expect(s.wall.shown).toBe('preview');
  send('keydown', { key: 'Enter' });
  send('keyup', { key: 'Enter' });
  expect(s.wall.shown).toBe('none');
});

test('a look that is not allowed any more ends', () => {
  const s = setup();
  s.wall.preview('day');
  s.state.allowed = false;
  s.wall.changed();
  expect(s.ended.mock.calls).toEqual([['preview']]);
});

// ----- found by the review -----

test('a look that is left alone becomes the rest screen, so the night comes there too', () => {
  vi.setSystemTime(at('22:20'));
  const s = setup();
  send('pointerdown', { pointerType: 'mouse', pointerId: 1 });
  send('pointerup', { pointerType: 'mouse', pointerId: 1 });
  s.wall.preview('day');
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(s.wall.shown).toBe('preview');
  vi.advanceTimersByTime(1);
  expect([s.wall.shown, s.wall.look, s.began.mock.calls.length, s.ended.mock.calls.length]).toEqual(['rest', 'day', 1, 0]);
  vi.advanceTimersByTime(8 * MINUTE);
  expect([s.wall.shown, s.wall.look]).toEqual(['rest', 'night']);
  send('click');
  vi.advanceTimersByTime(300);
  expect(s.ended.mock.calls).toEqual([['rest']]);
});

test('the look of the night that is left alone by day becomes day', () => {
  const s = setup();
  s.wall.preview('night');
  vi.advanceTimersByTime(2 * MINUTE);
  expect([s.wall.shown, s.wall.look]).toEqual(['rest', 'day']);
});

test('not while a finger or a mouse button is down', () => {
  const s = setup();
  send('pointerdown', { pointerType: 'touch', pointerId: 7 });
  vi.advanceTimersByTime(2 * MINUTE + 1000);
  expect(s.wall.shown).toBe('none');
  send('pointerup', { pointerType: 'touch', pointerId: 7 });
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(s.wall.shown).toBe('none');
  vi.advanceTimersByTime(1);
  expect(s.wall.shown).toBe('rest');
});

test('a finger whose lifting is never heard of does not keep it away for good', () => {
  const s = setup();
  send('pointerdown', { pointerType: 'mouse', pointerId: 7 });
  vi.advanceTimersByTime(4 * MINUTE);
  expect(s.wall.shown).toBe('rest');
});

test('the end of a touch that began before it goes to where that touch was', () => {
  const s = setup();
  send('pointerdown', { pointerType: 'touch', pointerId: 7 });
  s.wall.restNow();
  expect([send('pointerup', { pointerType: 'touch', pointerId: 7 }), send('touchend', touches(0)), send('mouseup')]).toEqual([passed, passed, passed]);
  expect([s.wall.shown, s.wall.leaving]).toEqual(['rest', false]);
});

test('a touch that began before it and moves is a sign of life', () => {
  const s = setup();
  s.wall.restNow();
  expect(send('pointermove', { pointerType: 'touch', pointerId: 7, buttons: 1, clientX: 5 })).toEqual(passed);
  expect(s.wall.shown).toBe('none');
});

test('the mouse that woke it by moving does not click at once on what is underneath', () => {
  const s = setup();
  s.wall.restNow();
  mouse(0);
  mouse(50);
  vi.advanceTimersByTime(100);
  expect(send('pointerdown', { pointerType: 'mouse', pointerId: 1 })).toEqual(swallowed);
  vi.advanceTimersByTime(1000);
  expect(send('pointerup', { pointerType: 'mouse', pointerId: 1 })).toEqual(swallowed);
  expect(send('click')).toEqual(swallowed);
  vi.advanceTimersByTime(300);
  expect(s.wall.shown).toBe('none');
});

test('a double tap wakes and switches nothing; a tap after it is an ordinary one', () => {
  const s = setup();
  s.wall.restNow();
  const tap = () => [send('pointerdown', { pointerType: 'touch', pointerId: 3 }), send('touchstart', touches(1)), send('pointerup', { pointerType: 'touch', pointerId: 3 }), send('touchend', touches(0))];
  expect(tap()).toEqual([swallowed, swallowed, swallowed, swallowed]);
  vi.advanceTimersByTime(250);
  expect(tap()).toEqual([swallowed, swallowed, swallowed, swallowed]);
  vi.advanceTimersByTime(300);
  expect([s.wall.shown, s.ended.mock.calls.length]).toEqual(['none', 1]);
  expect(tap()).toEqual([passed, passed, passed, passed]);
});

test('the layer is there as long as one finger is', () => {
  const s = setup();
  s.wall.restNow();
  send('pointerdown', { pointerType: 'touch', pointerId: 1 });
  send('touchstart', touches(1));
  send('pointerdown', { pointerType: 'touch', pointerId: 2 });
  send('touchstart', touches(2));
  send('pointerup', { pointerType: 'touch', pointerId: 1 });
  send('touchend', touches(1));
  vi.advanceTimersByTime(5000);
  expect(s.wall.shown).toBe('rest');
  expect(send('pointermove', { pointerType: 'touch', pointerId: 2, buttons: 1 })).toEqual(swallowed);
  send('pointerup', { pointerType: 'touch', pointerId: 2 });
  send('touchend', touches(0));
  vi.advanceTimersByTime(300);
  expect(s.wall.shown).toBe('none');
});

test('two fingers of a browser without touch events: the last one that is lifted counts', () => {
  const s = setup();
  s.wall.restNow();
  send('pointerdown', { pointerType: 'touch', pointerId: 1 });
  send('pointerdown', { pointerType: 'touch', pointerId: 2 });
  send('pointerup', { pointerType: 'touch', pointerId: 1 });
  vi.advanceTimersByTime(5000);
  expect(s.wall.shown).toBe('rest');
  send('pointerup', { pointerType: 'touch', pointerId: 2 });
  vi.advanceTimersByTime(400);
  expect(s.wall.shown).toBe('none');
});

test('two keys: the last one that is let go counts', () => {
  const s = setup();
  s.wall.restNow();
  send('keydown', { key: 'Shift', code: 'ShiftLeft' });
  send('keydown', { key: 'Enter', code: 'Enter' });
  expect(send('keyup', { key: 'Shift', code: 'ShiftLeft' })).toEqual(swallowed);
  expect(s.wall.shown).toBe('rest');
  expect(send('keydown', { key: 'Enter', code: 'Enter', repeat: true })).toEqual(swallowed);
  expect(send('keyup', { key: 'Enter', code: 'Enter' })).toEqual(swallowed);
  expect(s.wall.shown).toBe('none');
});

test('a key that repeats itself only after a second does nothing either', () => {
  const s = setup();
  s.wall.restNow();
  send('keydown', { key: 'Enter', code: 'Enter' });
  vi.advanceTimersByTime(1001);
  expect(send('keydown', { key: 'Enter', code: 'Enter', repeat: true })).toEqual(swallowed);
  vi.advanceTimersByTime(1499);
  expect(s.wall.shown).toBe('rest');
});

test('a key that is held while the window loses the focus is over', () => {
  const s = setup();
  s.wall.restNow();
  send('keydown', { key: ' ' });
  window.dispatchEvent(new Event('blur'));
  expect(s.wall.shown).toBe('none');
  // without a key it changes nothing
  s.wall.restNow();
  window.dispatchEvent(new Event('blur'));
  expect(s.wall.shown).toBe('rest');
});
