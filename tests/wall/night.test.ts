import { afterAll, beforeAll, expect, test } from 'vitest';
import { isNight, type FlowNight } from '../../src/wall/night';
import type { NightTimes } from '../../src/wall/settings';

const before = process.env['TZ'];
beforeAll(() => { process.env['TZ'] = 'Europe/Amsterdam'; });
afterAll(() => {
  if (before === undefined) delete process.env['TZ'];
  else process.env['TZ'] = before;
});

const times = (from = '22:30', to = '07:30', on = true): NightTimes => ({ on, from, to });
const at = (text: string): Date => new Date(text);
/** 23 November 2026, unless another day is named. */
const clock = (time: string, day = '2026-11-23'): Date => at(`${day}T${time}`);
const flow = (night: boolean, time: string, day = '2026-11-23'): FlowNight => ({ night, at: clock(time, day).getTime() });

test.each([
  ['22:29:59', false], ['22:30:00', true], ['23:59:59', true], ['00:00:00', true], ['07:29:59', true], ['07:30:00', false], ['12:00:00', false],
])('a night over midnight: %s is %s', (time, expected) => {
  expect(isNight(clock(time), times(), null)).toBe(expected);
});

test.each([['00:59', false], ['01:00', true], ['05:59', true], ['06:00', false], ['23:00', false]])('a night within a day: %s is %s', (time, expected) => {
  expect(isNight(clock(time), times('01:00', '06:00'), null)).toBe(expected);
});

test('without a night there is none, whatever a flow said', () => {
  expect(isNight(clock('23:00'), times('22:30', '07:30', false), null)).toBe(false);
  expect(isNight(clock('23:00'), times('22:30', '07:30', false), flow(true, '22:50'))).toBe(false);
});

test('times that are the same make no night; a flow does, until that time', () => {
  expect(isNight(clock('09:00'), times('08:00', '08:00'), null)).toBe(false);
  expect(isNight(clock('07:00'), times('08:00', '08:00'), null)).toBe(false);
  expect(isNight(clock('09:00'), times('08:00', '08:00'), flow(true, '08:30'))).toBe(true);
  expect(isNight(clock('08:00', '2026-11-24'), times('08:00', '08:00'), flow(true, '08:30'))).toBe(false);
});

test('a flow makes it night early, until the morning', () => {
  const early = flow(true, '21:50');
  expect(isNight(clock('21:50'), times(), early)).toBe(true);
  expect(isNight(clock('22:00'), times(), early)).toBe(true);
  expect(isNight(clock('23:00'), times(), early)).toBe(true);
  expect(isNight(clock('07:29', '2026-11-24'), times(), early)).toBe(true);
  expect(isNight(clock('07:30', '2026-11-24'), times(), early)).toBe(false);
});

test('a flow ends the night, until the next evening', () => {
  const awake = flow(false, '23:00');
  expect(isNight(clock('23:30'), times(), awake)).toBe(false);
  expect(isNight(clock('06:00', '2026-11-24'), times(), awake)).toBe(false);
  expect(isNight(clock('22:29', '2026-11-24'), times(), awake)).toBe(false);
  expect(isNight(clock('22:30', '2026-11-24'), times(), awake)).toBe(true);
  // in the morning, before the fixed time
  expect(isNight(clock('06:50'), times(), flow(false, '06:45'))).toBe(false);
});

test('a nap in the afternoon ends at the next fixed time too, or by a flow', () => {
  expect(isNight(clock('15:00'), times(), flow(true, '14:00'))).toBe(true);
  expect(isNight(clock('15:00'), times(), flow(false, '14:30'))).toBe(false);
});

test('what a flow said days ago counts no more', () => {
  expect(isNight(clock('12:00'), times(), flow(true, '23:00', '2026-11-20'))).toBe(false);
  expect(isNight(clock('23:30'), times(), flow(false, '23:00', '2026-11-20'))).toBe(true);
});

test('a flow at the very time of a fixed time counts', () => {
  expect(isNight(clock('22:30'), times(), flow(false, '22:30'))).toBe(false);
  expect(isNight(clock('07:30'), times(), flow(true, '07:30'))).toBe(true);
});

test('a clock that was set back does not make a flow wait', () => {
  expect(isNight(clock('21:49'), times(), flow(true, '21:50'))).toBe(true);
  expect(isNight(clock('12:00'), times(), flow(true, '23:00', '2026-11-25'))).toBe(true);
});

test('the night that loses an hour, and the one that gains one', () => {
  // 29 March 2026: 02:00 becomes 03:00
  expect(isNight(at('2026-03-29T01:30:00'), times(), null)).toBe(true);
  expect(isNight(at('2026-03-29T03:30:00'), times(), null)).toBe(true);
  expect(isNight(at('2026-03-29T07:29:00'), times(), null)).toBe(true);
  expect(isNight(at('2026-03-29T07:30:00'), times(), null)).toBe(false);
  // 25 October 2026: 03:00 becomes 02:00
  expect(isNight(at('2026-10-25T00:30:00Z'), times(), null)).toBe(true);
  expect(isNight(at('2026-10-25T01:30:00Z'), times(), null)).toBe(true);
  expect(isNight(at('2026-10-25T07:29:00'), times(), null)).toBe(true);
  expect(isNight(at('2026-10-25T07:30:00'), times(), null)).toBe(false);
});

test('a fixed time that does not exist that day comes a little later', () => {
  expect(isNight(at('2026-03-29T01:59:00'), times('02:30', '07:30'), null)).toBe(false);
  expect(isNight(at('2026-03-29T04:00:00'), times('02:30', '07:30'), null)).toBe(true);
  expect(isNight(at('2026-03-29T08:00:00'), times('02:30', '07:30'), null)).toBe(false);
});
