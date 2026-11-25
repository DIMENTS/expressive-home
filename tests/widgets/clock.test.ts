import { expect, test } from 'vitest';
import { clockView, nextTick } from '../../src/widgets/clock';

const at = new Date(2026, 10, 24, 9, 8, 7);

test('the time in 24 hours in Dutch, with the date short and long', () => {
  expect(clockView(at, 'nl-NL', { seconds: false, date: true })).toEqual({
    time: '09:08', short: 'di 24 nov', weekday: 'dinsdag', long: '24 november', label: '09:08, dinsdag 24 november',
  });
});

test('seconds when they are asked for, and no date when it is not', () => {
  const view = clockView(at, 'nl-NL', { seconds: true, date: false });
  expect(view.time).toBe('09:08:07');
  expect(view.short).toBe('');
  expect(view.label).toBe('09:08:07');
});

test('English follows the habit of the language', () => {
  expect(clockView(at, 'en-GB', { seconds: false, date: true }).time).toBe('09:08');
  expect(clockView(at, 'en-GB', { seconds: false, date: true }).weekday).toBe('Tuesday');
});

test('the next tick falls on the next minute, or the next second', () => {
  expect(nextTick(at, false)).toBe(53_000);
  expect(nextTick(new Date(2026, 10, 24, 9, 8, 7, 250), true)).toBe(750);
});
