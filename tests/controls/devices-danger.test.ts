import { expect, test } from 'vitest';
import { isDangerous, isGuarded } from '../../src/controls/danger';
import type { Device } from '../../src/homey/types';
import { dangerAlarms, hasLowBattery } from '../../src/recognition/recognize';
import { cap, device } from '../helpers/build';
import { appliances, cars, chargers, fans, vacuums } from '../helpers/devices';

const withValue = (d: Device, id: string, value: unknown): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never } } });
/** [guarded, dangerous to turn on or go, dangerous to turn off or stop]. */
const both = (d: Device, id: string) => [isGuarded(d, id), isDangerous(d, id, true), isDangerous(d, id, false)];

test('a charge point: stopping charging is never one tap, starting is', () => {
  expect(both(chargers.full, 'evcharger_charging')).toEqual([true, false, true]);
  expect(both(chargers.onoff, 'onoff')).toEqual([true, false, true]);
  expect(isGuarded(chargers.full, 'target_power')).toBe(false);
});

test('white goods and fridges: switching off and every button are never one tap; switching on is', () => {
  for (const d of [appliances.plug, appliances.washer, appliances.fridge]) expect([d.id, ...both(d, 'onoff')]).toEqual([d.id, true, false, true]);
  expect(both(appliances.dryer, 'button.start')).toEqual([true, true, true]);
  expect(both(appliances.dryer, 'button.cancel')).toEqual([true, true, true]);
  // what it washes with is no danger
  const choosing = device({ deviceClass: 'washer', caps: [cap('laundry_washer_speed', { type: 'enum', setable: true, value: 'low' })] });
  expect(isGuarded(choosing, 'laundry_washer_speed')).toBe(false);
});

test('a car: locking is one tap; unlocking, windows, trunk, buttons and a speaker are not; a temperature is no danger', () => {
  expect([isDangerous(cars.tesla, 'locked', true), isDangerous(cars.tesla, 'locked', false)]).toEqual([false, true]);
  for (const id of ['windowcoverings_closed', 'onoff.trunk', 'onoff.charge_port', 'button.homelink', 'speaker_playing']) expect([id, ...both(cars.tesla, id)]).toEqual([id, true, true, true]);
  expect(isGuarded(cars.tesla, 'target_temperature')).toBe(false);
  // starting charging from the car is one tap, stopping is not
  expect(both(cars.kia, 'evcharger_charging')).toEqual([true, false, true]);
});

test('a fan and a vacuum cleaner have no danger', () => {
  for (const [d, id] of [[fans.standing, 'onoff'], [fans.standing, 'fan_speed'], [vacuums.full, 'vacuumcleaner_state'], [vacuums.onoff, 'onoff']] as const) expect(isGuarded(d, id)).toBe(false);
});

test('a generic alarm with a name of its own is no danger on a charge point or a car; a plain one stays danger everywhere', () => {
  expect(dangerAlarms(chargers.full)).toEqual([]);
  expect(dangerAlarms(cars.tesla)).toEqual([]);
  const inverter = device({ deviceClass: 'other', caps: [cap('alarm_generic', { type: 'boolean', value: true }), cap('alarm_generic.grid', { type: 'boolean', value: true })] });
  expect(dangerAlarms(inverter).map((c) => c.id)).toEqual(['alarm_generic', 'alarm_generic.grid']);
  const charger = device({ deviceClass: 'evcharger', caps: [cap('alarm_generic', { type: 'boolean', value: true })] });
  expect(dangerAlarms(charger).map((c) => c.id)).toEqual(['alarm_generic']);
});

test('a car is never nearly empty; a vacuum cleaner only while it is away from its dock', () => {
  expect(hasLowBattery(withValue(cars.tesla, 'measure_battery', 8))).toBe(false);
  expect(hasLowBattery(vacuums.onoff)).toBe(true);
  expect(hasLowBattery(withValue(vacuums.full, 'measure_battery', 8))).toBe(false);
  expect(hasLowBattery(withValue(withValue(vacuums.full, 'measure_battery', 8), 'vacuumcleaner_state', 'charging'))).toBe(false);
  expect(hasLowBattery(withValue(withValue(withValue(vacuums.full, 'measure_battery', 8), 'vacuumcleaner_state', 'cleaning'), 'docked', false))).toBe(true);
});

test('a state of white goods that can be set stops it: never one tap', () => {
  const settable = device({ deviceClass: 'washer', caps: [cap('operational_state', { type: 'enum', setable: true, value: 'running' })] });
  expect(both(settable, 'operational_state')).toEqual([true, true, true]);
});

test('a car with a state of charge of its own is no home battery', async () => {
  const { isHomeBattery } = await import('../../src/recognition/recognize');
  expect(isHomeBattery(device({ deviceClass: 'car', caps: [cap('battery_soc', { value: 60 })] }))).toBe(false);
});

test('the charge point and car states that are no danger are not red anywhere: on a tile of the value, nor in the window', async () => {
  const { isDangerAlarm } = await import('../../src/recognition/recognize');
  expect(isDangerAlarm(chargers.full, chargers.full.capabilities['alarm_generic.car_connected']!)).toBe(false);
  const { tileView } = await import('../../src/ui/model/tile-view');
  const { deviceView } = await import('../../src/ui/model/device-view');
  const { createTranslate } = await import('../../src/i18n');
  const t = createTranslate('nl');
  expect(tileView({ kind: 'generic', id: 'g', deviceId: 'zaptec', size: 'single', capabilityId: 'alarm_generic.car_connected' }, chargers.full, t).state).not.toBe('danger');
  expect(deviceView(chargers.full, {}, t).values.filter((value) => value.danger)).toEqual([]);
});

test('nothing of the camper changes: nothing is held, and the alarms that were red stay red', async () => {
  const { camperSnapshot } = await import('../helpers/fake-hub');
  const { alarmKind, isDangerAlarm } = await import('../../src/recognition/recognize');
  for (const d of Object.values(camperSnapshot().devices)) {
    for (const c of Object.values(d.capabilities)) {
      expect([d.name, c.id, isGuarded(d, c.id)]).toEqual([d.name, c.id, false]);
      expect([d.name, c.id, isDangerAlarm(d, c)]).toEqual([d.name, c.id, alarmKind(c.baseId) === 'danger']);
    }
  }
});
