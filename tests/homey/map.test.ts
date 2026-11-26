import { expect, test } from 'vitest';
import { toDevice, toFlow, toSnapshot } from '../../src/homey/map';

const rawLamp = {
  id: 'd1', name: 'Plafond', zone: 'z1', class: 'socket', virtualClass: 'light', driverId: 'homey:app:x:lamp',
  available: true, unavailableMessage: null,
  capabilities: ['onoff', 'dim', 'measure_power.l1', 'ghost'],
  capabilitiesObj: {
    onoff: { id: 'onoff', title: 'Aan', type: 'boolean', getable: true, setable: true, value: true, lastUpdated: '2026-11-21T13:00:00.000Z' },
    dim: { id: 'dim', title: 'Dimniveau', type: 'number', getable: true, setable: true, min: 0, max: 1, step: 0.01, decimals: 2, units: '%', value: 0.8 },
    'measure_power.l1': { id: 'measure_power.l1', title: 'Vermogen L1', type: 'number', getable: true, setable: false, units: 'W', value: null },
  },
  energyObj: { cumulative: false }, settings: { secret: 'x' },
};

test('maps class, order, ranges and sub-capabilities', () => {
  const d = toDevice(rawLamp);
  expect(d.deviceClass).toBe('light');
  expect(d.zoneId).toBe('z1');
  expect(d.capabilityOrder).toEqual(['onoff', 'dim', 'measure_power.l1']); // 'ghost' has no metadata
  expect(d.capabilities['measure_power.l1']).toMatchObject({ baseId: 'measure_power', value: null, setable: false, units: 'W' });
  expect(d.capabilities['dim']).toMatchObject({ min: 0, max: 1, step: 0.01, decimals: 2, value: 0.8, lastUpdated: null });
  expect(JSON.stringify(d)).not.toContain('secret');
});

test('survives a bare device', () => {
  expect(toDevice({ id: 'd2', name: 'Kaal' })).toMatchObject({
    deviceClass: 'other', zoneId: null, available: true, capabilityOrder: [], capabilities: {},
    energy: { cumulative: false, homeBattery: false },
  });
});

test('maps enum options', () => {
  const d = toDevice({ id: 'd3', name: 'E', capabilities: ['mode'], capabilitiesObj: { mode: { id: 'mode', title: 'Stand', type: 'enum', getable: true, setable: true, values: [{ id: 'a', title: 'A' }], value: 'a' } } });
  expect(d.capabilities['mode']?.options).toEqual([{ id: 'a', title: 'A' }]);
});

test('a flow is startable unless disabled or not triggerable', () => {
  expect(toFlow({ id: 'f1', name: 'Alles uit', enabled: true, triggerable: true }, 'flow')).toEqual({ id: 'f1', name: 'Alles uit', kind: 'flow', startable: true });
  expect(toFlow({ id: 'f2', name: 'X', enabled: false, triggerable: true }, 'flow').startable).toBe(false);
  expect(toFlow({ id: 'f3', name: 'Y', enabled: true, triggerable: false }, 'advanced').startable).toBe(false);
  expect(toFlow({ id: 'f4', name: 'Z' }, 'advanced').startable).toBe(true);
});

test('toSnapshot keys devices and zones by id and merges both flow kinds', () => {
  const s = toSnapshot({ homeyId: 'h', softwareVersion: '13.5.5', scopes: ['homey'], devices: { d1: rawLamp }, zones: { z1: { id: 'z1', name: 'Woonruimte', parent: null } }, flows: { f1: { id: 'f1', name: 'A' } }, advancedFlows: { f2: { id: 'f2', name: 'B' } } });
  expect(Object.keys(s.devices)).toEqual(['d1']);
  expect(s.zones['z1']).toEqual({ id: 'z1', name: 'Woonruimte', parentId: null });
  expect(s.flows.map((f) => f.kind)).toEqual(['flow', 'advanced']);
});

test('the mapper keeps the yes and no texts of a capability', () => {
  const d = toDevice({ id: 'd4', name: 'Deur', capabilities: ['alarm_contact', 'onoff'], capabilitiesObj: {
    alarm_contact: { id: 'alarm_contact', title: 'Contact', type: 'boolean', getable: true, setable: false, titleTrue: 'Open', titleFalse: 'Dicht', value: false },
    onoff: { id: 'onoff', title: 'Aan', type: 'boolean', getable: true, setable: true, titleTrue: { en: 'On' }, value: true },
  } });
  expect(d.capabilities['alarm_contact']).toMatchObject({ titleTrue: 'Open', titleFalse: 'Dicht' });
  expect(d.capabilities['onoff']).toMatchObject({ titleTrue: null, titleFalse: null });
});

test('the flags of Homey Energy for a charge point and an electric car are kept; a camper that has none stays as it was', () => {
  const flagged = toDevice({ id: 'c', name: 'Laadpaal', class: 'evcharger', energyObj: { evCharger: true, meterPowerImportedCapability: 'meter_power' } });
  expect(flagged.energy).toEqual({ cumulative: false, homeBattery: false, evCharger: true });
  expect(toDevice({ id: 'a', name: 'Auto', class: 'car', energyObj: { electricCar: true } }).energy).toEqual({ cumulative: false, homeBattery: false, electricCar: true });
  expect(toDevice({ id: 'x', name: 'Iets', class: 'other', energyObj: { evCharger: null, electricCar: null } }).energy).toEqual({ cumulative: false, homeBattery: false });
});
