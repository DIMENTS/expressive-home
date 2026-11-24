import { expect, test } from 'vitest';
import { cap, device } from '../helpers/build';
import { sectionFor, tilesFor } from '../../src/dashboard/classify';
import { bare, climate, dimLamp, dish, motion, plainLamp, plug, remote, tank } from './samples';

test.each([[dimLamp, 'lights'], [plainLamp, 'lights'], [plug, 'switches'], [climate, 'climate'], [motion, 'security'], [tank, 'water'], [dish, 'other'], [remote, 'other'], [bare, 'other']])('section', (d, section) => {
  expect(sectionFor(d)).toBe(section);
});
test('a plug that reports its own temperature stays a switch', () => {
  const warmPlug = device({ id: 'p2', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_temperature', { value: 41 })] });
  expect(sectionFor(warmPlug)).toBe('switches');
});
test('tiles per device', () => {
  expect(tilesFor(dimLamp)).toEqual([{ kind: 'light', id: 'l1:light', deviceId: 'l1', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' }]);
  expect(tilesFor(plainLamp)).toEqual([{ kind: 'switch', id: 'l2:switch', deviceId: 'l2', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: null }]);
  expect(tilesFor(plug)[0]).toMatchObject({ kind: 'switch', onoffCapabilityId: 'onoff', detailCapabilityId: 'measure_power' });
  expect(tilesFor(climate)).toEqual([
    { kind: 'sensor', id: 's1:measure_temperature', deviceId: 's1', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: true },
    { kind: 'sensor', id: 's1:measure_humidity', deviceId: 's1', size: 'single', capabilityId: 'measure_humidity', showCapabilityTitle: true },
  ]);
  expect(tilesFor(tank)[0]).toMatchObject({ kind: 'tank', levelCapabilityId: 'tank_level', volumeCapabilityId: 'measure_content_volume', capacityCapabilityId: 'tank_capacity' });
  expect(tilesFor(dish)).toEqual([{ kind: 'multi', id: 'o1:multi', deviceId: 'o1', size: 'wide', capabilityIds: ['measure_download', 'measure_upload', 'measure_latency'] }]);
  expect(tilesFor(remote)[0]).toMatchObject({ kind: 'button', capabilityId: 'button' });
  expect(tilesFor(motion)).toEqual([{ kind: 'generic', id: 's2:generic', deviceId: 's2', size: 'single', capabilityId: 'alarm_motion' }]);
  expect(tilesFor(bare)).toEqual([{ kind: 'generic', id: 'x1:generic', deviceId: 'x1', size: 'single', capabilityId: null }]);
});

const numbers = (n: number) => Array.from({ length: n }, (_, i) => cap(`measure_value${i}`, { value: i }));
const relay = cap('onoff', { type: 'boolean', setable: true, value: true });
test('a settable onoff only makes a switch when the device is a light, a socket or has few readings', () => {
  const busy = device({ id: 'a1', deviceClass: 'other', caps: [relay, ...numbers(4)] });
  expect(sectionFor(busy)).toBe('other');
  expect(tilesFor(busy)).toEqual([{ kind: 'multi', id: 'a1:multi', deviceId: 'a1', size: 'wide', capabilityIds: ['measure_value0', 'measure_value1', 'measure_value2'] }]);
  const simple = device({ id: 'a2', deviceClass: 'other', caps: [relay, ...numbers(1)] });
  expect(sectionFor(simple)).toBe('switches');
  expect(tilesFor(simple)[0]).toMatchObject({ kind: 'switch' });
  const busyPlug = device({ id: 'a3', deviceClass: 'socket', caps: [relay, ...numbers(4)] });
  expect(sectionFor(busyPlug)).toBe('switches');
  expect(tilesFor(busyPlug)[0]).toMatchObject({ kind: 'switch' });
});
test('a presence device is a security device', () => {
  const presence = device({ id: 'pr1', deviceClass: 'sensor', caps: [cap('presence', { type: 'boolean', value: true })] });
  expect(sectionFor(presence)).toBe('security');
  expect(tilesFor(presence)).toEqual([{ kind: 'generic', id: 'pr1:generic', deviceId: 'pr1', size: 'single', capabilityId: 'presence' }]);
});
test('a tile names the capability it toggles, preferring the exact onoff', () => {
  const both = device({ deviceClass: 'socket', caps: [cap('onoff.1', { type: 'boolean', setable: true }), cap('onoff', { type: 'boolean', setable: true })] });
  expect(tilesFor(both)[0]).toMatchObject({ kind: 'switch', onoffCapabilityId: 'onoff' });
  const derived = device({ deviceClass: 'socket', caps: [cap('onoff.1', { type: 'boolean', setable: true })] });
  expect(tilesFor(derived)[0]).toMatchObject({ kind: 'switch', onoffCapabilityId: 'onoff.1' });
  const dimOnly = device({ deviceClass: 'light', caps: [cap('onoff', { type: 'boolean' }), cap('dim', { setable: true, min: 0, max: 1 })] });
  expect(tilesFor(dimOnly)[0]).toMatchObject({ kind: 'light', onoffCapabilityId: null });
});
test('a switch tile shows power, otherwise its first main value', () => {
  const heater = device({ deviceClass: 'heater', caps: [cap('onoff', { type: 'boolean', setable: true }), cap('measure_temperature', { value: 21.5 })] });
  expect(tilesFor(heater)[0]).toMatchObject({ kind: 'switch', detailCapabilityId: 'measure_temperature' });
  const plug = device({ deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true }), cap('measure_temperature'), cap('measure_power')] });
  expect(tilesFor(plug)[0]).toMatchObject({ detailCapabilityId: 'measure_power' });
  const bare = device({ deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true })] });
  expect(tilesFor(bare)[0]).toMatchObject({ detailCapabilityId: null });
});
