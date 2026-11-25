import { expect, test } from 'vitest';
import { daysUntil, gaugeShare, groupIds } from '../../src/widgets/more';

test('days until a date count whole days of the clock of the device', () => {
  const now = new Date(2026, 10, 25, 23, 50);
  expect(daysUntil('2026-11-26', now)).toBe(1);
  expect(daysUntil('2026-11-25', now)).toBe(0);
  expect(daysUntil('2026-11-22', now)).toBe(-3);
  expect(daysUntil('2027-01-01', now)).toBe(37);
  for (const bad of ['', 'morgen', '2026-13-01', '2026-02-30', null]) expect(daysUntil(bad, now)).toBeNull();
});

test('a gauge shows where a value is between lowest and highest, never outside', () => {
  expect(gaugeShare(20, 0, 40)).toBe(0.5);
  expect(gaugeShare(-5, 0, 40)).toBe(0);
  expect(gaugeShare(99, 0, 40)).toBe(1);
  expect(gaugeShare(5, 10, 10)).toBe(0);
  expect(gaugeShare(null, 0, 40)).toBeNull();
});

test('the devices of a group are kept as a list in one setting', () => {
  expect(groupIds('a,b,,c')).toEqual(['a', 'b', 'c']);
  expect(groupIds(null)).toEqual([]);
  expect(groupIds('a,a')).toEqual(['a']);
});
