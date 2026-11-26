import { expect, test } from 'vitest';
import { isDangerous, isGuarded } from '../../src/controls/danger';
import { carOf, carState } from '../../src/controls/car';
import type { Device } from '../../src/homey/types';
import { createTranslate } from '../../src/i18n';
import { adaptTile } from '../../src/layout/tiles';
import { dangerQuestion } from '../../src/ui/model/guard-view';
import { houseCount } from '../../src/ui/model/layout';
import { shownOnTop } from '../../src/ui/model/device-top';
import { tileView } from '../../src/ui/model/tile-view';
import { chargerCommand } from '../../src/ui/model/held-view';
import { cap, device } from '../helpers/build';
import { appliances, cars, chargers, fans, vacuums } from '../helpers/devices';

// What the independent check of the new tiles found.

const nl = createTranslate('nl');
const withValue = (d: Device, id: string, value: unknown): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never } } });

test('white goods known by their state and program, of another class, are guarded as those known by their class', () => {
  const other = device({ id: 'o', name: 'Wasmachine', deviceClass: 'other', caps: [
    cap('operational_state', { type: 'enum', setable: true, value: 'running' }), cap('laundry_washer_program', { type: 'enum', value: 'normal' }),
    cap('onoff', { type: 'boolean', setable: true, value: true }), cap('button.stop', { type: 'boolean', getable: false, setable: true }),
  ] });
  expect(['onoff', 'button.stop', 'operational_state'].map((id) => isGuarded(other, id))).toEqual([true, true, true]);
  expect([isDangerous(other, 'onoff', false), isDangerous(other, 'onoff', true)]).toEqual([true, false]);
  expect(dangerQuestion(other, 'onoff', false, nl).heading).toBe('Wasmachine uitzetten?');
  // a fridge gets the question of switching off too
  expect(dangerQuestion(appliances.fridge, 'onoff', false, nl).heading).toBe('Koelkast uitzetten?');
});

test('a stored tile of a new kind follows its device when that is no longer of its kind', () => {
  const lost = { ...fans.standing, capabilities: { onoff: fans.standing.capabilities['onoff']! }, capabilityOrder: ['onoff'] };
  const tile = adaptTile({ kind: 'fan', id: 'fan:fan', deviceId: 'fan', size: 'single' }, lost);
  expect(tile.kind).toBe('switch');
  expect(adaptTile({ kind: 'charger', id: 'c', deviceId: 'zaptec', size: 'single' }, chargers.full).kind).toBe('charger');
});

test('a car of another class that is unlocked is counted once', () => {
  const car = device({ id: 'merc', deviceClass: 'other', energy: { cumulative: false, homeBattery: false, electricCar: true }, caps: [cap('locked', { type: 'boolean', setable: true, value: false }), cap('measure_battery', { value: 50 })] });
  expect(houseCount([car], nl)).toBe('1 van slot');
});

test('white goods with a state the dashboard does not know say nothing of being on', () => {
  for (const state of ['finished', null]) {
    const odd = withValue(appliances.washer, 'operational_state', state);
    expect([state, tileView({ kind: 'appliance', id: 't', deviceId: 'washer', size: 'single' }, odd, nl).state]).toEqual([state, 'neutral']);
  }
});

test('the window of a vacuum cleaner hides below only what it shows on top of what is wrong', () => {
  const both = withValue(vacuums.stuck, 'alarm_bin_full', true);
  const top = shownOnTop(both, 'vacuum');
  expect([top.has('alarm_stuck'), top.has('alarm_bin_full')]).toEqual([true, false]);
});

test('a car that tells no battery has no bar; a range below nothing is none', () => {
  const asleep = withValue(cars.tesla, 'measure_battery', null);
  expect(carState(carOf(asleep)!).battery).toBeNull();
  expect(carState(carOf(withValue(cars.tesla, 'measure_distance.range', -5))!).range).toBeNull();
});

test('an hour is said without its nothing of minutes', () => {
  expect(tileView({ kind: 'appliance', id: 't', deviceId: 'washer', size: 'single' }, withValue(appliances.washer, 'remaining_time', 60), nl).stateText).toBe('Bezig · nog 1 u');
});

test('a charge point without a car offers no charging', () => {
  const empty = withValue(chargers.full, 'evcharger_charging_state', 'plugged_out');
  expect(chargerCommand(withValue(empty, 'evcharger_charging', false), nl)).toBeNull();
});
