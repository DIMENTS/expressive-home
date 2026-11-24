import { expect, test } from 'vitest';
import { iconFor } from '../../../src/ui/model/icon-for';
import type { TileSpec } from '../../../src/dashboard/types';
import type { Capability, Device } from '../../../src/homey/types';
import { cap, device } from '../../helpers/build';

const sensor = (capabilityId: string): TileSpec => ({ kind: 'sensor', id: 'd:x', deviceId: 'd', size: 'single', capabilityId, showCapabilityTitle: false });
const generic = (capabilityId: string | null): TileSpec => ({ kind: 'generic', id: 'd:g', deviceId: 'd', size: 'single', capabilityId });
const switchSpec: TileSpec = { kind: 'switch', id: 'd:s', deviceId: 'd', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: null };
const multi: TileSpec = { kind: 'multi', id: 'd:m', deviceId: 'd', size: 'wide', capabilityIds: ['a', 'b', 'c'] };
const of = (deviceClass: string, caps: Capability[] = [cap('x')]): Device => device({ id: 'd', deviceClass, caps });

const cases: [string, TileSpec, Device | undefined, string][] = [
  ['a light', { kind: 'light', id: 'd:l', deviceId: 'd', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' }, of('light'), 'lightbulb'],
  ['a socket switch', switchSpec, of('socket'), 'power'],
  ['another switch', switchSpec, of('other'), 'toggle_on'],
  ['a heater switch', switchSpec, of('heater'), 'mode_heat'],
  ['a temperature sensor', sensor('measure_temperature'), of('sensor'), 'thermostat'],
  ['a humidity sensor', sensor('measure_humidity.inside'), of('sensor'), 'humidity_percentage'],
  ['a CO2 sensor', sensor('measure_co2'), of('sensor'), 'co2'],
  ['a tank', { kind: 'tank', id: 'd:t', deviceId: 'd', size: 'single', levelCapabilityId: null, volumeCapabilityId: null, capacityCapabilityId: null }, of('other'), 'water_drop'],
  ['a button tile', { kind: 'button', id: 'd:b', deviceId: 'd', size: 'single', capabilityId: 'button' }, of('other'), 'touch_app'],
  ['a multi-value tile', multi, of('other', [cap('a'), cap('b'), cap('c')]), 'devices_other'],
  ['a multi-value tile led by power', { ...multi, capabilityIds: ['measure_power', 'b', 'c'] } as TileSpec, of('other', [cap('measure_power', { units: 'W' }), cap('b'), cap('c')]), 'bolt'],
  ['presence', generic('presence'), of('sensor'), 'person'],
  ['motion', generic('alarm_motion'), of('sensor'), 'sensors'],
  ['a door', generic('alarm_contact'), of('sensor'), 'door_front'],
  ['smoke', generic('alarm_smoke'), of('sensor'), 'detector_smoke'],
  ['water', generic('alarm_water'), of('sensor'), 'water_damage'],
  ['a lock', generic(null), of('lock'), 'lock'],
  ['a heater', generic(null), of('heater'), 'mode_heat'],
  ['a fan', generic(null), of('fan'), 'mode_fan'],
  ['a remote', generic(null), of('remote'), 'settings_remote'],
  ['a button class', generic(null), of('button'), 'settings_remote'],
  ['a flow', { kind: 'flow', id: 'f', flowId: 'f', flowKind: 'flow', size: 'single' }, undefined, 'play_arrow'],
  ['anything else', generic(null), of('kettle'), 'category'],
  ['a missing device', generic('alarm_contact'), undefined, 'door_front'],
];

test.each(cases)('icons follow the kind of device and capability: %s', (_name, spec, dev, icon) => {
  expect(iconFor(spec, dev)).toBe(icon);
});
