import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SLIDER_SEND_MS, createThrottle, fractionOf, stepOf, valueAt } from '../../../src/ui/model/slider-math';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('the step is the one of the hub or a hundredth of the range', () => {
  expect(stepOf({ min: 0, max: 1, step: null })).toBe(0.01);
  expect(stepOf({ min: 10, max: 30, step: 0.5 })).toBe(0.5);
  expect(stepOf({ min: null, max: null, step: null })).toBe(0.01);
});

test('valueAt clamps, snaps and avoids float noise', () => {
  expect(valueAt(0.333, { min: 0, max: 1, step: null })).toBe(0.33);
  expect(valueAt(1.4, { min: 0, max: 1, step: null })).toBe(1);
  expect(valueAt(-1, { min: 10, max: 30, step: 0.5 })).toBe(10);
  expect(valueAt(0.26, { min: 10, max: 30, step: 0.5 })).toBe(15);
  expect(valueAt(0.07, { min: 0, max: 1, step: null })).toBe(0.07);
  expect(valueAt(Number.NaN, { min: 0, max: 1, step: null })).toBe(0);
});

test('fractionOf is the inverse and never leaves 0..1', () => {
  expect(fractionOf(15, { min: 10, max: 30, step: null })).toBe(0.25);
  expect(fractionOf(99, { min: 10, max: 30, step: null })).toBe(1);
  expect(fractionOf(-3, { min: 0, max: 1, step: null })).toBe(0);
  expect(fractionOf(5, { min: 5, max: 5, step: null })).toBe(0);
});

test('the throttle sends the first value at once, then at most every 200 ms, and always the last', () => {
  expect(SLIDER_SEND_MS).toBe(200);
  const sent: number[] = [];
  const throttle = createThrottle((v) => sent.push(v), SLIDER_SEND_MS, { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
  throttle.push(1);
  expect(sent).toEqual([1]);
  vi.advanceTimersByTime(50);
  throttle.push(2);
  throttle.push(3);
  expect(sent).toEqual([1]);
  vi.advanceTimersByTime(150);
  expect(sent).toEqual([1, 3]);
  vi.advanceTimersByTime(10);
  throttle.push(5);
  throttle.finish(4);
  expect(sent).toEqual([1, 3, 4]);
  vi.advanceTimersByTime(1000);
  expect(sent).toEqual([1, 3, 4]);
});

test('a cancelled throttle sends nothing more', () => {
  const sent: number[] = [];
  const throttle = createThrottle((v) => sent.push(v), 200, { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) });
  throttle.push(1);
  throttle.push(2);
  throttle.cancel();
  vi.advanceTimersByTime(1000);
  expect(sent).toEqual([1]);
});
