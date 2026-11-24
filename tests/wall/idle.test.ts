import { beforeEach, expect, test, vi } from 'vitest';
import { createIdle } from '../../src/wall/idle';

beforeEach(() => { vi.useFakeTimers(); return () => { vi.useRealTimers(); }; });

const MINUTE = 60_000;

function setup() {
  const state = { delay: 2 * MINUTE, takes: true, shift: 0 };
  const due = vi.fn(() => state.takes);
  const idle = createIdle({
    now: () => Date.now() + state.shift, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    delay: () => state.delay, due,
  });
  return { state, due, idle };
}

test('it is due after the delay, not before, and once', () => {
  const { due } = setup();
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(due).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(due).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(60 * MINUTE);
  expect(due).toHaveBeenCalledTimes(1);
});

test('a touch begins the waiting anew, and after being due too', () => {
  const { due, idle } = setup();
  vi.advanceTimersByTime(MINUTE);
  idle.touched();
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(due).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(due).toHaveBeenCalledTimes(1);
  idle.touched();
  vi.advanceTimersByTime(2 * MINUTE);
  expect(due).toHaveBeenCalledTimes(2);
});

test('many touches cost no timers', () => {
  const { idle } = setup();
  for (let i = 0; i < 500; i += 1) idle.touched();
  expect(vi.getTimerCount()).toBe(1);
});

test('a shorter delay counts from the last touch: it can be due at once', () => {
  const { due, idle, state } = setup();
  vi.advanceTimersByTime(40_000);
  state.delay = 30_000;
  idle.changed();
  expect(due).toHaveBeenCalledTimes(1);
});

test('a longer delay counts from the last touch', () => {
  const { due, idle, state } = setup();
  vi.advanceTimersByTime(MINUTE);
  state.delay = 5 * MINUTE;
  idle.changed();
  vi.advanceTimersByTime(4 * MINUTE - 1);
  expect(due).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(due).toHaveBeenCalledTimes(1);
});

test('what could not be now is asked again after a change, not by itself', () => {
  const { due, idle, state } = setup();
  state.takes = false;
  vi.advanceTimersByTime(10 * MINUTE);
  expect(due).toHaveBeenCalledTimes(1);
  idle.changed();
  expect(due).toHaveBeenCalledTimes(2);
  state.takes = true;
  idle.changed();
  expect(due).toHaveBeenCalledTimes(3);
  idle.changed();
  expect(due).toHaveBeenCalledTimes(3);
});

test('a clock that is set back begins the waiting anew', () => {
  const { due, state } = setup();
  vi.advanceTimersByTime(MINUTE);
  state.shift = -60 * MINUTE;
  vi.advanceTimersByTime(MINUTE);
  expect(due).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2 * MINUTE - 1);
  expect(due).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(due).toHaveBeenCalledTimes(1);
});

test('a clock that is set back just after a touch does not make it wait for hours', () => {
  const { due, idle, state } = setup();
  state.shift = -60 * MINUTE;
  idle.touched();
  vi.advanceTimersByTime(2 * MINUTE);
  expect(due).toHaveBeenCalledTimes(1);
});

test('a tablet that slept is due once, when its timers run again', () => {
  const { due, state } = setup();
  state.shift = 8 * 60 * MINUTE;
  vi.advanceTimersByTime(2 * MINUTE);
  expect(due).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(10 * MINUTE);
  expect(due).toHaveBeenCalledTimes(1);
});

test('stopping leaves nothing behind', () => {
  const { due, idle } = setup();
  idle.stop();
  expect(vi.getTimerCount()).toBe(0);
  idle.touched();
  idle.changed();
  vi.advanceTimersByTime(10 * MINUTE);
  expect([vi.getTimerCount(), due.mock.calls.length]).toEqual([0, 0]);
});
