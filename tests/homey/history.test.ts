import { expect, test } from 'vitest';
import { historyPointsFrom, historyRefFromLog } from '../../src/homey/history';

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
