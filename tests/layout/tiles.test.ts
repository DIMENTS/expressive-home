import { expect, test } from 'vitest';
import { tilesFor } from '../../src/dashboard/classify';
import type { DeviceTileSpec } from '../../src/dashboard/types';
import type { Device } from '../../src/homey/types';
import { adaptTile, currentSpec, tileChoices, tileForValue } from '../../src/layout/tiles';
import { iconForCapability } from '../../src/ui/model/icon-for';
import { climate, dimLamp, dish, motion, plug, remote, tank } from '../dashboard/samples';
import { cap, device } from '../helpers/build';
import { camperSnapshot } from '../helpers/fake-hub';
import { sensorTile, tileLayout } from '../helpers/layout';

/** An RGBW lamp of the camper: two dim levels and two switches. */
const rgbw = (): Device => Object.values(camperSnapshot().devices).find((d) => d.deviceClass === 'light' && d.capabilities['dim.white'])!;
/** The same device without some of its capabilities. */
function without(from: Device, ...ids: string[]): Device {
  return {
    ...from, capabilityOrder: from.capabilityOrder.filter((id) => !ids.includes(id)),
    capabilities: Object.fromEntries(Object.entries(from.capabilities).filter(([id]) => !ids.includes(id))),
  };
}
const first = (d: Device) => tilesFor(d)[0] as DeviceTileSpec;

test('a settable on/off value becomes a switch tile that toggles that value', () => {
  expect(tileForValue(rgbw(), 'onoff.whitemode', 't-1')).toEqual({ kind: 'switch', id: 't-1', deviceId: rgbw().id, size: 'single', onoffCapabilityId: 'onoff.whitemode', detailCapabilityId: null });
});

test('a button value becomes a button tile', () => {
  expect(tileForValue(rgbw(), 'button.enable_ble_script', 't-1')).toEqual({ kind: 'button', id: 't-1', deviceId: rgbw().id, size: 'single', capabilityId: 'button.enable_ble_script' });
});

test('a number becomes a sensor tile that shows the value name', () => {
  expect(tileForValue(dish, 'measure_download', 't-1')).toEqual({ kind: 'sensor', id: 't-1', deviceId: 'o1', size: 'single', capabilityId: 'measure_download', showCapabilityTitle: true });
  expect(tileForValue(rgbw(), 'dim.white', 't-1')).toMatchObject({ kind: 'sensor', capabilityId: 'dim.white' });
});

test('a list, text or read-only yes/no becomes a generic tile', () => {
  const d = device({ id: 'd', caps: [cap('state', { type: 'enum', value: 'a' }), cap('text', { type: 'string', value: 'x' }), cap('alarm_contact', { type: 'boolean', value: true })] });
  for (const id of ['state', 'text', 'alarm_contact']) {
    expect(tileForValue(d, id, 't-1')).toEqual({ kind: 'generic', id: 't-1', deviceId: 'd', size: 'single', capabilityId: id });
  }
});

test('a value the device does not have gives null', () => {
  expect(tileForValue(dish, 'measure_nothing', 't-1')).toBeNull();
  expect(tileForValue(dish, '__proto__', 't-1')).toBeNull();
});

test('the RGBW lamp offers both dim levels for the slider and both switches for a tap', () => {
  const choices = tileChoices(first(rgbw()), rgbw());
  expect(choices.slider.map((c) => c.id)).toEqual(['dim', 'dim.white']);
  expect(choices.tap.map((c) => c.id)).toEqual(['onoff', 'onoff.whitemode']);
  expect([choices.main, choices.detail, choices.cells]).toEqual([[], [], []]);
});

test('a plain lamp offers no slider choice', () => {
  expect(tileChoices(first(dimLamp), dimLamp)).toEqual({ slider: [], tap: [], main: [], detail: [], cells: [] });
});

test('a sensor, a switch and a multi-value tile offer their main values', () => {
  expect(tileChoices(first(climate), climate).main.map((c) => c.id)).toEqual(['measure_temperature', 'measure_humidity']);
  const one = device({ caps: [cap('measure_temperature', { value: 20 })] });
  expect(tileChoices(first(one), one).main).toEqual([]);
  expect(tileChoices(first(plug), plug).detail.map((c) => c.id)).toEqual(['measure_power']);
  expect(tileChoices(first(dish), dish).cells.map((c) => c.id)).toEqual(['measure_download', 'measure_upload', 'measure_latency', 'measure_obstruction']);
  expect(tileChoices(first(tank), tank)).toEqual({ slider: [], tap: [], main: [], detail: [], cells: [] });
});

test('a tile whose choices are all still there stays the same object', () => {
  for (const d of [rgbw(), dimLamp, plug, climate, motion, tank, dish, remote]) for (const spec of tilesFor(d)) expect(adaptTile(spec as DeviceTileSpec, d)).toBe(spec);
});

test('a tile whose chosen dim level is gone falls back to the first dim level', () => {
  const spec = { ...first(rgbw()), dimCapabilityId: 'dim.white', onoffCapabilityId: 'onoff.whitemode' } as DeviceTileSpec;
  expect(adaptTile(spec, rgbw())).toBe(spec);
  expect(adaptTile(spec, without(rgbw(), 'dim.white'))).toEqual({ ...spec, dimCapabilityId: 'dim' });
  expect(adaptTile(spec, without(rgbw(), 'onoff.whitemode'))).toEqual({ ...spec, onoffCapabilityId: 'onoff' });
});

test('a light that lost its dim level becomes the tile the app would choose now', () => {
  expect(adaptTile(first(dimLamp), without(dimLamp, 'dim'))).toMatchObject({ kind: 'switch', id: 'l1:light', onoffCapabilityId: 'onoff' });
});

test('a switch keeps its side value, or takes the one the app would choose', () => {
  expect(adaptTile({ ...first(plug), detailCapabilityId: null } as DeviceTileSpec, plug)).toMatchObject({ detailCapabilityId: null });
  expect(adaptTile(first(plug), without(plug, 'measure_power'))).toMatchObject({ kind: 'switch', detailCapabilityId: null });
  expect(adaptTile(first(plug), without(plug, 'onoff'))).toMatchObject({ kind: 'sensor', id: 'p1:switch', capabilityId: 'measure_power' });
});

test('a sensor, a tank and a generic tile fall back to what the app would choose', () => {
  const spec = first(climate);
  expect(adaptTile(spec, without(climate, 'measure_temperature'))).toMatchObject({ kind: 'sensor', capabilityId: 'measure_humidity' });
  expect(adaptTile(first(tank), without(tank, 'tank_level'))).toMatchObject({ kind: 'tank', levelCapabilityId: null, volumeCapabilityId: 'measure_content_volume', capacityCapabilityId: 'tank_capacity' });
  expect(adaptTile(first(motion), without(motion, 'alarm_motion'))).toMatchObject({ kind: 'sensor', capabilityId: 'measure_temperature' });
});

test('a multi-value tile fills the place of a gone value, in order', () => {
  const spec = { ...first(dish), capabilityIds: ['measure_latency', 'measure_upload', 'measure_download'] } as DeviceTileSpec;
  expect(adaptTile(spec, dish)).toBe(spec);
  expect(adaptTile(spec, without(dish, 'measure_upload'))).toMatchObject({ kind: 'multi', capabilityIds: ['measure_latency', 'measure_download', 'measure_obstruction'] });
  expect(adaptTile(spec, without(dish, 'measure_upload', 'measure_latency'))).toMatchObject({ kind: 'sensor', id: 'o1:multi' });
});

test('adapting keeps the id, the size and the own look', () => {
  const spec = { ...first(dimLamp), id: 't-abc', size: 'wide', label: 'Boven', icon: 'park' } as DeviceTileSpec;
  expect(adaptTile(spec, without(dimLamp, 'dim'))).toMatchObject({ kind: 'switch', id: 't-abc', size: 'wide', label: 'Boven', icon: 'park' });
  // three values never fit in a narrow tile
  const single = { kind: 'sensor', id: 't-1', deviceId: 'o1', size: 'single', capabilityId: 'gone', showCapabilityTitle: false } as DeviceTileSpec;
  expect(adaptTile(single, dish)).toMatchObject({ kind: 'multi', id: 't-1', size: 'wide' });
});

test('the spec of a stored tile now: adapted, remade for one value, or null when it is gone', () => {
  const lamp = tileLayout(first(dimLamp), { size: 'single', label: 'Boven', icon: 'park', id: 't-l' });
  expect(currentSpec(lamp, dimLamp)).toEqual({ ...first(dimLamp), id: 't-l', size: 'single', label: 'Boven', icon: 'park' });
  expect(currentSpec(lamp, undefined)).toBeNull();
  const value = sensorTile('t-v', 'o1', 'measure_download', { source: 'value' });
  expect(currentSpec(value, dish)).toMatchObject({ kind: 'sensor', id: 't-v', capabilityId: 'measure_download' });
  expect(currentSpec(value, without(dish, 'measure_download'))).toBeNull();
  // the value is there but became something else: the tile of 6.3 for what it is now
  const text = { ...dish, capabilities: { ...dish.capabilities, measure_download: { ...dish.capabilities['measure_download']!, type: 'string' as const } } };
  expect(currentSpec(value, text)).toMatchObject({ kind: 'generic', id: 't-v', capabilityId: 'measure_download' });
});

test('the icon of a capability is that of its sensor tile', () => {
  expect(iconForCapability(tank.capabilities['tank_level']!, tank)).toBe('water_drop');
  expect(iconForCapability(cap('measure_power.ac_in'), undefined)).toBe('bolt');
  expect(iconForCapability(cap('viewers'), device({ deviceClass: 'socket' }))).toBe('power');
  expect(iconForCapability(cap('viewers'), undefined)).toBe('category');
});
