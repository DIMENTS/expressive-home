import { expect, test } from 'vitest';
import { cap, device, snapshot } from '../helpers/build';
import { heroDeviceIds, pickHero } from '../../src/dashboard/hero';
import type { HeroSpec } from '../../src/dashboard/types';
import { battery, climate, meter, solar } from './samples';

test('battery hero with every stat that exists', () => {
  expect(pickHero(snapshot([battery, solar, meter]))).toEqual({
    kind: 'battery', deviceIds: ['bat', 'sol'], primary: { deviceId: 'bat', capabilityId: 'battery_soc' },
    timeToGo: { deviceId: 'bat', capabilityId: 'time_to_go' },
    stats: [
      { role: 'solar', ref: { deviceId: 'sol', capabilityId: 'measure_power' } },
      { role: 'consumption', ref: { deviceId: 'met', capabilityId: 'measure_power' } },
      { role: 'shore', ref: { deviceId: 'bat', capabilityId: 'ac_input_source' } },
      { role: 'net' },
    ],
  });
});
test('falls back to solar, then consumption, then nothing', () => {
  expect(pickHero(snapshot([solar, meter]))).toEqual({ kind: 'solar', deviceIds: ['sol'], primary: { deviceId: 'sol', capabilityId: 'measure_power' }, timeToGo: null, stats: [] });
  expect(pickHero(snapshot([meter]))).toEqual({ kind: 'consumption', deviceIds: [], primary: { deviceId: 'met', capabilityId: 'measure_power' }, timeToGo: null, stats: [] });
  expect(pickHero(snapshot([climate]))).toBeNull();
});
test('a battery-powered sensor never becomes the hero', () => {
  expect(pickHero(snapshot([device({ deviceClass: 'sensor', caps: [cap('measure_battery', { value: 50 })] })]))).toBeNull();
});

const shorePower = () => device({ id: 'zz', name: 'Zz', caps: [cap('ac_input_source', { type: 'enum', value: 'shore' }), cap('measure_power', { value: 90 }), cap('measure_power.in', { value: 5 })] });
const bareBattery = () => device({ id: 'bat', deviceClass: 'battery', caps: [cap('battery_soc', { value: 70 })] });
test('shore comes from another device and then supplies consumption', () => {
  const other = device({ id: 'aa', name: 'Aa', caps: [cap('measure_temperature', { value: 20 })] });
  const hero = pickHero(snapshot([bareBattery(), solar, other, shorePower()]));
  expect(hero?.stats).toEqual([
    { role: 'solar', ref: { deviceId: 'sol', capabilityId: 'measure_power' } },
    { role: 'consumption', ref: { deviceId: 'zz', capabilityId: 'measure_power' } },
    { role: 'shore', ref: { deviceId: 'zz', capabilityId: 'ac_input_source' } },
    { role: 'net' },
  ]);
  expect(hero?.deviceIds).toEqual(['bat', 'sol']);
});
test('a cumulative meter wins over the shore device for consumption', () => {
  const hero = pickHero(snapshot([bareBattery(), solar, meter, shorePower()]));
  expect(hero?.stats).toContainEqual({ role: 'consumption', ref: { deviceId: 'met', capabilityId: 'measure_power' } });
  expect(hero?.stats).toContainEqual({ role: 'shore', ref: { deviceId: 'zz', capabilityId: 'ac_input_source' } });
});
test('shore on the battery itself applies no consumption fallback', () => {
  const hero = pickHero(snapshot([battery, solar]));
  expect(hero?.stats.map((s) => s.role)).toEqual(['solar', 'shore']);
});
test('heroDeviceIds lists every device the hero reads from, once', () => {
  const hero: HeroSpec = { kind: 'battery', deviceIds: ['bat', 'pv'], primary: { deviceId: 'bat', capabilityId: 'measure_battery' }, timeToGo: { deviceId: 'bat', capabilityId: 'time_to_go' },
    stats: [{ role: 'solar', ref: { deviceId: 'pv', capabilityId: 'measure_power' } }, { role: 'consumption', ref: { deviceId: 'sys', capabilityId: 'measure_power' } }, { role: 'shore', ref: { deviceId: 'sys', capabilityId: 'ac_input_source' } }, { role: 'net' }] };
  expect(heroDeviceIds(hero).sort()).toEqual(['bat', 'pv', 'sys']);
});
test('heroDeviceIds also covers a hero that takes no device off the dashboard', () => {
  const hero: HeroSpec = { kind: 'consumption', deviceIds: [], primary: { deviceId: 'met', capabilityId: 'measure_power' }, timeToGo: null, stats: [] };
  expect(heroDeviceIds(hero)).toEqual(['met']);
});
