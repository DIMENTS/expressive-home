import { expect, test } from 'vitest';
import { applianceOf, applianceState } from '../../src/controls/appliance';
import { carOf, carState, isCar } from '../../src/controls/car';
import { chargerCommands, chargerOf, chargerState } from '../../src/controls/charger';
import { fanOf, fanState } from '../../src/controls/fan';
import { vacuumCommands, vacuumOf, vacuumState } from '../../src/controls/vacuum';
import type { Device } from '../../src/homey/types';
import { cap, device } from '../helpers/build';
import { appliances, cars, chargers, fans, vacuums } from '../helpers/devices';
import { camperSnapshot } from '../helpers/fake-hub';

const withValue = (d: Device, id: string, value: unknown): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never } } });

// ----- fans -----

test('a fan with a speed, swinging or a mode is a fan; on and off alone is not', () => {
  expect(fanOf(fans.standing)).toMatchObject({ onoff: { id: 'onoff' }, speed: { id: 'fan_speed' }, oscillating: { id: 'oscillating' }, mode: { id: 'fan_mode' } });
  expect(fanOf(fans.dimmed)?.speed?.id).toBe('dim');
  expect(fanOf(fans.purifier)?.speed?.id).toBe('fan_speed');
  expect(fanOf(fans.plain)).toBeNull();
  // a light that dims is no fan
  expect(fanOf(device({ deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true }), cap('dim', { setable: true })] }))).toBeNull();
});

test('a fan says whether it is on, how fast in its own range, whether it swings and its mode', () => {
  expect(fanState(fanOf(fans.standing)!)).toEqual({ on: true, speed: 0.6, oscillating: true, mode: 'on' });
  expect(fanState(fanOf(fans.dimmed)!)).toEqual({ on: false, speed: 0.4, oscillating: null, mode: null });
  // without onoff: on while it turns; the mode off is off
  const noSwitch = device({ deviceClass: 'fan', caps: [cap('fan_speed', { setable: true, value: 0.2 }), cap('fan_mode', { type: 'enum', setable: true, value: 'off', options: [{ id: 'off', title: 'off' }] })] });
  expect(fanState(fanOf(noSwitch)!).on).toBe(false);
  expect(fanState(fanOf(withValue(noSwitch, 'fan_mode', 'auto'))!).on).toBe(true);
});

// ----- robot vacuum cleaners -----

test('a vacuum cleaner by its class or by its state, with its battery and what is wrong', () => {
  expect(vacuumState(vacuumOf(vacuums.full)!)).toEqual({ stand: 'docked', battery: 100, problem: null });
  expect(vacuumState(vacuumOf(vacuums.other)!)).toEqual({ stand: 'cleaning', battery: 64, problem: null });
  expect(vacuumState(vacuumOf(vacuums.onoff)!)).toEqual({ stand: 'stopped', battery: 12, problem: null });
  expect(vacuumState(vacuumOf(withValue(vacuums.onoff, 'onoff', true))!).stand).toBe('cleaning');
  // stuck goes before a full bin
  expect(vacuumState(vacuumOf(vacuums.stuck)!).problem?.id).toBe('alarm_stuck');
  expect(vacuumOf(device({ deviceClass: 'sensor', caps: [cap('measure_battery', { value: 50 })] }))).toBeNull();
});

test('start, pause and to the dock by its state; with only onoff start and stop; no dock it does not know', () => {
  expect(vacuumCommands(vacuumOf(vacuums.full)!)).toEqual({ go: { capabilityId: 'vacuumcleaner_state', value: 'cleaning' }, pause: { capabilityId: 'vacuumcleaner_state', value: 'stopped' }, dock: { capabilityId: 'vacuumcleaner_state', value: 'docked' } });
  expect(vacuumCommands(vacuumOf(vacuums.onoff)!)).toEqual({ go: { capabilityId: 'onoff', value: true }, pause: { capabilityId: 'onoff', value: false }, dock: null });
  const readOnly = device({ deviceClass: 'vacuumcleaner', caps: [cap('vacuumcleaner_state', { type: 'enum', value: 'docked' })] });
  expect(vacuumCommands(vacuumOf(readOnly)!)).toEqual({ go: null, pause: null, dock: null });
});

// ----- washing machines, dryers, dishwashers -----

test('white goods by their class, or by a state with a program; a heat pump with a state is none', () => {
  for (const d of [appliances.washer, appliances.plug, appliances.dryer, appliances.running, appliances.other]) expect([d.id, applianceOf(d) !== null]).toEqual([d.id, true]);
  expect(applianceOf(appliances.heatPump)).toBeNull();
});

test('what a washing machine does: its state, how far, how long still, in minutes whatever the app counts in', () => {
  expect(applianceState(applianceOf(appliances.washer)!)).toEqual({ stand: 'running', on: true, progress: 60, minutesLeft: 42, power: 450 });
  expect(applianceState(applianceOf(appliances.dryer)!)).toMatchObject({ stand: 'paused', minutesLeft: 25 });
  expect(applianceState(applianceOf(appliances.running)!).stand).toBe('stopped');
  expect(applianceState(applianceOf(withValue(appliances.running, 'alarm_running', true))!).stand).toBe('running');
  expect(applianceState(applianceOf(appliances.other)!).stand).toBe('error');
  // a plug does not say whether it runs: only on and its power
  expect(applianceState(applianceOf(appliances.plug)!)).toEqual({ stand: null, on: true, progress: null, minutesLeft: null, power: 1850 });
  // when it is not running, nothing is left
  expect(applianceState(applianceOf(withValue(appliances.washer, 'operational_state', 'stopped'))!).minutesLeft).toBeNull();
});

// ----- charge points -----

test('a charge point by its class, its flag or its state; a car that can charge is no charge point', () => {
  expect(chargerOf(chargers.full)).toMatchObject({ charging: { id: 'evcharger_charging' }, state: { id: 'evcharger_charging_state' }, session: { id: 'meter_power.session' }, target: { id: 'target_power' } });
  expect(chargerOf(chargers.onoff)).toMatchObject({ charging: null, onoff: { id: 'onoff' } });
  expect(chargerOf(chargers.other)?.state?.id).toBe('evcharger_charging_state');
  expect(chargerOf(cars.kia)).toBeNull();
});

test('a charge point says whether it charges and how much; start and stop by its own switch, else by onoff', () => {
  expect(chargerState(chargerOf(chargers.full)!)).toEqual({ stand: 'plugged_in_charging', charging: true, power: 11040, session: 12.4 });
  expect(chargerState(chargerOf(chargers.onoff)!)).toEqual({ stand: null, charging: false, power: 0, session: null });
  expect(chargerState(chargerOf(chargers.other)!)).toMatchObject({ stand: 'plugged_in', charging: false });
  expect(chargerCommands(chargerOf(chargers.full)!)).toEqual({ start: { capabilityId: 'evcharger_charging', value: true }, stop: { capabilityId: 'evcharger_charging', value: false } });
  expect(chargerCommands(chargerOf(chargers.onoff)!)).toEqual({ start: { capabilityId: 'onoff', value: true }, stop: { capabilityId: 'onoff', value: false } });
  expect(chargerCommands(chargerOf(chargers.other)!)).toEqual({ start: null, stop: null });
});

// ----- cars -----

test('a car by its class, its flag or the charging state of a car', () => {
  expect([cars.tesla, cars.kia, cars.other].map(isCar)).toEqual([true, true, true]);
  expect(isCar(chargers.full)).toBe(false);
  expect(isCar(device({ deviceClass: 'other', energy: { cumulative: false, homeBattery: false, electricCar: true } }))).toBe(true);
});

test('a car says its battery, its range in its own unit, whether it charges and whether it is locked', () => {
  expect(carState(carOf(cars.tesla)!)).toEqual({ battery: 64, range: { value: 240, units: 'km' }, charging: false, plugged: true, locked: true });
  expect(carState(carOf(cars.kia)!)).toEqual({ battery: 81, range: { value: 312, units: 'km' }, charging: null, plugged: null, locked: false });
  expect(carState(carOf(cars.other)!)).toMatchObject({ battery: 23, range: { value: 98, units: 'km' }, charging: true, plugged: true });
});

// ----- the camper -----

test('nothing of the camper is one of these', () => {
  for (const d of Object.values(camperSnapshot().devices)) {
    expect([d.name, fanOf(d), vacuumOf(d), applianceOf(d), chargerOf(d), isCar(d)]).toEqual([d.name, null, null, null, null, false]);
  }
});

// ----- after the fresh reading -----

test('a fridge is no white goods tile: only switching it off is held', () => {
  expect(applianceOf(appliances.fridge)).toBeNull();
});

test('only a meter named for this session is the session: a meter of what was charged in all is not', () => {
  const total = device({ deviceClass: 'evcharger', caps: [cap('evcharger_charging', { type: 'boolean', setable: true, value: true }), cap('meter_power.charged', { value: 913, units: 'kWh' })] });
  expect(chargerState(chargerOf(total)!).session).toBeNull();
});

test('what is left is a time only in a unit of time, or without one', () => {
  const soap = device({ deviceClass: 'washer', caps: [cap('operational_state', { type: 'enum', value: 'running' }), cap('remaining_detergent', { value: 300, units: 'ml' })] });
  expect(applianceState(applianceOf(soap)!).minutesLeft).toBeNull();
  const bare = device({ deviceClass: 'washer', caps: [cap('operational_state', { type: 'enum', value: 'running' }), cap('remaining_time', { value: 30 })] });
  expect(applianceState(applianceOf(bare)!).minutesLeft).toBe(30);
});
