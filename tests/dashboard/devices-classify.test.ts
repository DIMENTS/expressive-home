import { expect, test } from 'vitest';
import { houseKind, sectionFor, tilesFor } from '../../src/dashboard/classify';
import type { Device } from '../../src/homey/types';
import { appliances, cars, chargers, fans, guards, vacuums } from '../helpers/devices';

const kinds = (d: Device) => tilesFor(d).map((tile) => tile.kind);

test.each<[Device, string, string]>([
  [fans.standing, 'fan', 'climate'], [fans.dimmed, 'fan', 'climate'], [fans.purifier, 'fan', 'climate'],
  [vacuums.full, 'vacuum', 'household'], [vacuums.onoff, 'vacuum', 'household'], [vacuums.other, 'vacuum', 'household'], [vacuums.stuck, 'vacuum', 'household'],
  [appliances.washer, 'appliance', 'household'], [appliances.plug, 'appliance', 'household'], [appliances.dryer, 'appliance', 'household'], [appliances.running, 'appliance', 'household'],
  [appliances.other, 'appliance', 'household'],
  [chargers.full, 'charger', 'vehicles'], [chargers.onoff, 'charger', 'vehicles'], [chargers.other, 'charger', 'vehicles'], [chargers.plug, 'charger', 'vehicles'],
  [cars.tesla, 'car', 'vehicles'], [cars.kia, 'car', 'vehicles'], [cars.other, 'car', 'vehicles'], [guards.car, 'car', 'vehicles'],
])('%# each of these gets one tile of its kind, in its section', (d, kind, section) => {
  expect([d.name, tilesFor(d), sectionFor(d)]).toEqual([d.name, [{ kind, id: `${d.id}:${kind}`, deviceId: d.id, size: 'single' }], section]);
});

test('a fan that can only go on and off stays a switch; a fan heater stays climate; a heat pump with a state is no washing machine', () => {
  expect([kinds(fans.plain), sectionFor(fans.plain)]).toEqual([['switch'], 'climate']);
  expect(houseKind(fans.heater)).toBe('climate');
  expect(houseKind(appliances.heatPump)).not.toBe('appliance');
});

test('a car with a target temperature, windows, a lock and a speaker is a car first', () => {
  expect(houseKind(cars.tesla)).toBe('car');
  // a vacuum cleaner with a volume and one that sees motion stay vacuum cleaners
  expect([houseKind(vacuums.full), houseKind(vacuums.other)]).toEqual(['vacuum', 'vacuum']);
});

test('a plug its owner told Homey Energy is a charge point is one; a fridge on a plug stays among the plugs, without one-tap off', async () => {
  const { device, cap } = await import('../helpers/build');
  const flagged = device({ id: 'pc', deviceClass: 'socket', energy: { cumulative: false, homeBattery: false, evCharger: true }, caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_power', { value: 2300, units: 'W' })] });
  expect([houseKind(flagged), sectionFor(flagged)]).toEqual(['charger', 'vehicles']);
  expect([kinds(appliances.fridge), sectionFor(appliances.fridge)]).toEqual([['sensor'], 'switches']);
});
