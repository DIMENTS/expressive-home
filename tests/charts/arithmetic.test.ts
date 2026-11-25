import { expect, test } from 'vitest';
import type { HistorySeries } from '../../src/homey/client';
import { createTranslate } from '../../src/i18n';
import { areaPath, linePath } from '../../src/charts/path';
import { reduce } from '../../src/charts/reduce';
import { scaleFor } from '../../src/charts/scale';
import { readAt, timesFor } from '../../src/charts/times';

const H = 3_600_000;
const series = (values: (number | null)[], step = 300_000, start = 0): HistorySeries => ({
  start, end: start + (values.length - 1) * step, step, updatesIn: null, points: values.map((value, i) => ({ at: start + i * step, value })),
});

test('power, energy and the charge of a battery start at zero; the charge goes to 100; a negative value counts as zero', () => {
  expect(scaleFor({ baseId: 'measure_power', units: 'W' }, [120, 480])).toMatchObject({ min: 0 });
  expect(scaleFor({ baseId: 'measure_power', units: 'W' }, [-50, 480]).min).toBe(0);
  expect(scaleFor({ baseId: 'measure_battery', units: '%' }, [52, 81])).toEqual({ min: 0, max: 100, fromZero: true });
  expect(scaleFor({ baseId: 'meter_power', units: 'kWh' }, [3, 4]).min).toBe(0);
});

test('the rest follows its range, with room, and noise never becomes a mountain', () => {
  const warm = scaleFor({ baseId: 'measure_temperature', units: '°C' }, [17.6, 23.1]);
  expect(warm.fromZero).toBe(false);
  expect(warm.min).toBeLessThan(17.6);
  expect(warm.max).toBeGreaterThan(23.1);
  const still = scaleFor({ baseId: 'measure_temperature', units: '°C' }, [21.2, 21.3]);
  expect(still.max - still.min).toBeGreaterThanOrEqual(2);
  expect(scaleFor({ baseId: 'measure_humidity', units: '%' }, [55, 56]).max - scaleFor({ baseId: 'measure_humidity', units: '%' }, [55, 56]).min).toBeGreaterThanOrEqual(10);
  expect(scaleFor({ baseId: 'measure_co2', units: 'ppm' }, [600, 610]).max - scaleFor({ baseId: 'measure_co2', units: 'ppm' }, [600, 610]).min).toBeGreaterThanOrEqual(200);
  const flat = scaleFor({ baseId: 'measure_luminance', units: 'lx' }, [0, 0]);
  expect(flat.max).toBeGreaterThan(flat.min);
  expect(scaleFor({ baseId: 'x', units: null }, [])).toMatchObject({ min: 0, max: 1 });
});

test('at most two points per pixel, keeping the lowest and the highest, and the gaps', () => {
  const many = series(Array.from({ length: 1000 }, (_, i) => (i === 500 ? 99 : i === 200 ? null : i % 7)), 1000);
  const fewer = reduce(many.points, 50);
  expect(fewer.length).toBeLessThanOrEqual(100);
  expect(fewer.some((p) => p.value === 99)).toBe(true);
  expect(fewer.some((p) => p.value === 0)).toBe(true);
  expect(fewer.every((p, i) => i === 0 || p.at >= fewer[i - 1]!.at)).toBe(true);
  expect(reduce(series([1, 2, 3]).points, 50)).toEqual(series([1, 2, 3]).points);
  // a stretch that is empty everywhere stays a gap
  const holed = series([...Array.from({ length: 300 }, () => 1), ...Array.from({ length: 300 }, () => null), ...Array.from({ length: 300 }, () => 2)], 1000);
  expect(reduce(holed.points, 30).some((p) => p.value === null)).toBe(true);
});

test('a line breaks at an empty point and at a jump of more than one and a half steps; one point is a dot', () => {
  const box = { width: 100, height: 50 };
  const scale = { min: 0, max: 10, fromZero: true };
  expect(linePath(series([0, 10, 5]), scale, box)).toBe('M0 50L50 0L100 25');
  expect(linePath(series([0, null, 5, 5]), scale, box)).toBe('M0 50L0 50M66.67 25L100 25');
  const jumped = { ...series([1, 1]), points: [{ at: 0, value: 1 }, { at: 300_000, value: 1 }, { at: 1_200_000, value: 1 }], end: 1_200_000 };
  expect(linePath(jumped, scale, box)).toBe('M0 45L25 45M100 45L100 45');
  expect(linePath(series([4]), scale, box)).toBe('M0 30L0 30');
  // a value below the scale is drawn on its floor, above it on its top
  expect(linePath(series([-5, 20]), scale, box)).toBe('M0 50L100 0');
  expect(areaPath(series([0, 10, null, 5, 5]), scale, box)).toBe('M0 50L25 0L25 50L0 50ZM75 25L100 25L100 50L75 50Z');
  expect(linePath({ ...series([]), points: [] }, scale, box)).toBe('');
});

test('the times under a day: whole six hours and "nu", in the time zone given, also when the clock is set', () => {
  const t = createTranslate('nl');
  const now = Date.parse('2026-11-25T14:20:00Z');
  const day = timesFor('last24Hours', now - 24 * H, now, 'Europe/Amsterdam', t);
  expect(day.map((tick) => tick.label)).toEqual(['18:00', '00:00', '06:00', '12:00', 'nu']);
  expect(day.at(-1)!.at).toBe(now);
  // 29 March: the night has 23 hours, still every whole six hours
  const spring = Date.parse('2026-03-29T12:00:00Z');
  expect(timesFor('last24Hours', spring - 24 * H, spring, 'Europe/Amsterdam', t).map((tick) => tick.label)).toEqual(['18:00', '00:00', '06:00', '12:00', 'nu']);
  // a label too close to "nu" goes
  const close = Date.parse('2026-11-25T11:20:00Z');
  expect(timesFor('last24Hours', close - 24 * H, close, 'Europe/Amsterdam', t).map((tick) => tick.label)).toEqual(['18:00', '00:00', '06:00', 'nu']);
});

test('the times under a week, a month and a year', () => {
  const now = Date.parse('2026-11-25T14:20:00Z');
  const nl = createTranslate('nl');
  const en = createTranslate('en');
  expect(timesFor('last7Days', now - 7 * 24 * H, now, 'Europe/Amsterdam', nl).map((tick) => tick.label)).toEqual(['do', 'vr', 'za', 'zo', 'ma', 'di', 'wo', 'nu']);
  expect(timesFor('last7Days', now - 7 * 24 * H, now, 'Europe/Amsterdam', en).map((tick) => tick.label).at(0)).toBe('Thu');
  expect(timesFor('last31Days', now - 31 * 24 * H, now, 'Europe/Amsterdam', nl).map((tick) => tick.label)).toEqual(['26 okt', '2 nov', '9 nov', '16 nov', '23 nov', 'nu']);
  expect(timesFor('year', now - 365 * 24 * H, now, 'Europe/Amsterdam', nl).map((tick) => tick.label)).toEqual(['jan', 'apr', 'jul', 'okt', 'nu']);
});

test('reading: the nearest point, and nothing where there was no measurement', () => {
  const s = series([1, null, 3]);
  expect(readAt(s, 0)).toEqual({ at: 0, value: 1 });
  expect(readAt(s, 290_000)).toEqual({ at: 300_000, value: null });
  expect(readAt(s, 10_000_000)).toEqual({ at: 600_000, value: 3 });
  expect(readAt({ ...s, points: [] }, 0)).toBeNull();
});
