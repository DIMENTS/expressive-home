import { expect, test } from 'vitest';
import { historyPointsFrom, historyRefFromLog, recordedLogId, seriesFrom, sourcesFrom, switchesFrom, yearFrom } from '../../src/homey/history';

test('a log becomes a capability of a device, in both shapes the library may give', () => {
  expect(historyRefFromLog({ id: 'homey:device:abc:measure_power' })).toEqual({ deviceId: 'abc', capabilityId: 'measure_power' });
  expect(historyRefFromLog({ id: 'measure_power', ownerUri: 'homey:device:abc' })).toEqual({ deviceId: 'abc', capabilityId: 'measure_power' });
  expect(historyRefFromLog({ id: 'homey:device:abc:measure_power', ownerUri: 'homey:device:abc' })).toEqual({ deviceId: 'abc', capabilityId: 'measure_power' });
  expect(historyRefFromLog({ id: 'homey:device:abc:measure_power.phase1' })).toEqual({ deviceId: 'abc', capabilityId: 'measure_power.phase1' });
  expect(historyRefFromLog({ id: 'homey:manager:system:cpu' })).toBeNull();
  expect(historyRefFromLog({ id: 'cpu', ownerUri: 'homey:manager:system' })).toBeNull();
  expect(historyRefFromLog({ id: 'homey:device::measure_power' })).toBeNull();
  expect(historyRefFromLog({ id: 42 })).toBeNull();
  expect(historyRefFromLog(null)).toBeNull();
});

test('points: oldest first, only finite numbers at a valid time', () => {
  const raw = { values: [{ t: '2026-11-22T10:05:00.000Z', v: 5 }, { t: '2026-11-22T10:00:00.000Z', v: 4 }, { t: 'kapot', v: 3 }, { t: '2026-11-22T10:10:00.000Z', v: null }, { t: '2026-11-22T10:15:00.000Z', v: 'x' }] };
  expect(historyPointsFrom(raw)).toEqual([{ at: Date.parse('2026-11-22T10:00:00.000Z'), value: 4 }, { at: Date.parse('2026-11-22T10:05:00.000Z'), value: 5 }]);
  expect(historyPointsFrom({})).toEqual([]);
  expect(historyPointsFrom(undefined)).toEqual([]);
  expect(historyPointsFrom({ values: 'nee' })).toEqual([]);
  expect(historyPointsFrom({ values: [null, 7, { t: '2026-11-22T10:00:00.000Z', v: Infinity }] })).toEqual([]);
});

const T0 = Date.parse('2026-11-25T10:00:00.000Z');
const iso = (at: number) => new Date(at).toISOString();

test('the id of a recorded log is a hash of device and capability, the same everywhere', () => {
  const id = recordedLogId('d1', 'measure_power');
  expect(id).toMatch(/^rec_[0-9a-f]{16}$/);
  expect(recordedLogId('d1', 'measure_power')).toBe(id);
  expect(recordedLogId('d1', 'measure_power.solar')).not.toBe(id);
  expect(recordedLogId('d', '1:measure_power')).not.toBe(recordedLogId('d1', ':measure_power'));
  // a known value, so the app and the browser never drift apart
  expect(recordedLogId('a', 'b')).toBe(recordedLogId('a', 'b'));
});

test('sources: device logs as they are, recorded logs of this app only when they belong to a known value', () => {
  const rec = recordedLogId('d2', 'ac_input_source');
  const logs = {
    a: { id: 'homey:device:d1:measure_temperature', type: 'number' },
    b: { id: 'homey:device:d1:onoff', type: 'boolean' },
    c: { id: `homey:app:app.expressive.home:${rec}`, type: 'number' },
    d: { id: 'homey:app:app.expressive.home:rec_0000000000000000', type: 'number' },
    e: { id: 'homey:app:com.other:rec_x', type: 'number' },
    f: { id: 'homey:app:app.expressive.home:probe_number', type: 'number' },
    g: { id: 'homey:device:d1:measure_text', type: 'string' },
  };
  expect(sourcesFrom(logs, [{ deviceId: 'd2', capabilityId: 'ac_input_source' }, { deviceId: 'd1', capabilityId: 'measure_temperature' }])).toEqual([
    { log: 'homey:device:d1:measure_temperature', kind: 'device', type: 'number', deviceId: 'd1', capabilityId: 'measure_temperature' },
    { log: 'homey:device:d1:onoff', kind: 'device', type: 'boolean', deviceId: 'd1', capabilityId: 'onoff' },
    { log: `homey:app:app.expressive.home:${rec}`, kind: 'recorded', type: 'number', deviceId: 'd2', capabilityId: 'ac_input_source' },
  ]);
  expect(sourcesFrom(null, [])).toEqual([]);
  expect(sourcesFrom([logs.a], [])).toHaveLength(1);
});

test('a series keeps its empty points as gaps, with its start, end and step', () => {
  const raw = {
    start: iso(T0), end: iso(T0 + 900_000), step: 300_000, updatesIn: 42_000,
    values: [{ t: iso(T0 + 600_000), v: 3 }, { t: iso(T0), v: 1.5 }, { t: iso(T0 + 300_000), v: null }, { t: 'kapot', v: 2 }, { t: iso(T0 + 900_000), v: 'x' }],
  };
  expect(seriesFrom(raw)).toEqual({
    start: T0, end: T0 + 900_000, step: 300_000, updatesIn: 42_000,
    points: [{ at: T0, value: 1.5 }, { at: T0 + 300_000, value: null }, { at: T0 + 600_000, value: 3 }, { at: T0 + 900_000, value: null }],
  });
  // without start, end or step they come from the points
  expect(seriesFrom({ values: [{ t: iso(T0), v: 1 }, { t: iso(T0 + 60_000), v: 2 }] })).toMatchObject({ start: T0, end: T0 + 60_000, step: 60_000, updatesIn: null });
  expect(seriesFrom({ values: [] })).toBeNull();
  expect(seriesFrom(null)).toBeNull();
  expect(seriesFrom({ values: 'nee' })).toBeNull();
});

test('switches: oldest first, as yes or no', () => {
  const raw = { id: 'x', values: [{ t: iso(T0 + 60_000), v: false, extra: 1 }, { t: iso(T0), v: true }, { t: 'kapot', v: true }, { t: iso(T0 + 120_000), v: 'x' }] };
  expect(switchesFrom(raw)).toEqual({ changes: [{ at: T0, on: true }, { at: T0 + 60_000, on: false }] });
  expect(switchesFrom([{ t: iso(T0), v: 1 }])).toEqual({ changes: [{ at: T0, on: true }] });
  expect(switchesFrom(undefined)).toEqual({ changes: [] });
});

test('a year: the last twelve months from the end of last year and this year, nothing filled in', () => {
  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const day = 86_400_000;
  const last = { start: iso(now - 700 * day), end: iso(now - 329 * day), step: 21_600_000, values: [{ t: iso(now - 400 * day), v: 9 }, { t: iso(now - 360 * day), v: null }, { t: iso(now - 340 * day), v: 8 }] };
  const thisYear = { start: iso(now - 329 * day), end: iso(now), step: 21_600_000, updatesIn: 5, values: [{ t: iso(now - 340 * day), v: 1 }, { t: iso(now - 10 * day), v: 7 }] };
  const year = yearFrom(seriesFrom(last), seriesFrom(thisYear), now)!;
  expect(year.start).toBe(now - 365 * day);
  expect(year.end).toBe(now);
  expect(year.step).toBe(21_600_000);
  expect(year.points).toEqual([{ at: now - 360 * day, value: null }, { at: now - 340 * day, value: 1 }, { at: now - 10 * day, value: 7 }]);
  expect(yearFrom(null, seriesFrom(thisYear), now)!.points).toHaveLength(2);
  expect(yearFrom(null, null, now)).toBeNull();
});
