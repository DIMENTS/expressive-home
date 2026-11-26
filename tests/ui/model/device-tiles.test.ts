import { expect, test } from 'vitest';
import type { DeviceTileSpec, HouseKind } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import { createTranslate } from '../../../src/i18n';
import { tileView } from '../../../src/ui/model/tile-view';
import { appliances, cars, chargers, fans, vacuums } from '../../helpers/devices';

// What the tiles of a fan, a vacuum cleaner, white goods, a charge point and a car say, and when they are in colour.

const [nl, en] = [createTranslate('nl'), createTranslate('en')];
const spec = (kind: HouseKind, d: Device): DeviceTileSpec => ({ kind, id: 't', deviceId: d.id, size: 'single' });
const says = (kind: HouseKind, d: Device, busy: Parameters<typeof tileView>[3] = null) => [nl, en].map((t) => tileView(spec(kind, d), d, t, busy).stateText);
const seen = (kind: HouseKind, d: Device) => { const { icon, state, tap } = tileView(spec(kind, d), d, nl); return { icon, state, tap }; };
const withValue = (d: Device, id: string, value: unknown): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never } } });

test.each<[Device, string, string, string]>([
  [fans.standing, 'Aan · 60%', 'On · 60%', 'on'], [fans.dimmed, 'Uit', 'Off', 'off'], [fans.purifier, 'Aan · 30%', 'On · 30%', 'on'],
  [withValue(fans.standing, 'fan_mode', 'auto'), 'Aan · auto', 'On · auto', 'on'],
])('%# a fan says whether it is on and how fast', (d, dutch, english, state) => {
  expect([says('fan', d), seen('fan', d).state]).toEqual([[dutch, english], state]);
});

test.each<[Device, string, string, string]>([
  [vacuums.full, 'In het dock · 100%', 'Docked · 100%', 'off'], [vacuums.other, 'Zuigt · 64%', 'Cleaning · 64%', 'on'],
  [vacuums.onoff, 'Gestopt · 12%', 'Stopped · 12%', 'off'], [vacuums.stuck, 'Zit vast · 40%', 'Stuck · 40%', 'off'],
  [withValue(vacuums.full, 'vacuumcleaner_state', 'charging'), 'Laadt op · 100%', 'Charging · 100%', 'off'],
])('%# a vacuum cleaner says what it does, what is wrong first, and its battery', (d, dutch, english, state) => {
  expect([says('vacuum', d), seen('vacuum', d).state]).toEqual([[dutch, english], state]);
});

test.each<[Device, string, string, string]>([
  [appliances.washer, 'Bezig · nog 42 min', 'Running · 42 min left', 'on'], [appliances.dryer, 'Gepauzeerd · nog 25 min', 'Paused · 25 min left', 'off'],
  [withValue(appliances.washer, 'remaining_time', null), 'Bezig · 60%', 'Running · 60%', 'on'],
  [withValue(appliances.washer, 'remaining_time', 125), 'Bezig · nog 2 u 5 min', 'Running · 2 h 5 min left', 'on'],
  [appliances.running, 'Niet bezig', 'Not running', 'off'], [appliances.other, 'Storing', 'Fault', 'off'],
  [appliances.plug, 'Aan · 1,9 kW', 'On · 1.9 kW', 'on'], [withValue(appliances.plug, 'onoff', false), 'Uit', 'Off', 'off'],
])('%# white goods say whether they run and how long still; a plug says only on and its power', (d, dutch, english, state) => {
  expect([says('appliance', d), seen('appliance', d).state]).toEqual([[dutch, english], state]);
});

test.each<[Device, string, string, string]>([
  [chargers.full, 'Laadt · 11 kW', 'Charging · 11 kW', 'on'], [chargers.onoff, 'Laadt niet', 'Not charging', 'off'],
  [chargers.other, 'Auto aangesloten', 'Car plugged in', 'off'], [withValue(chargers.other, 'evcharger_charging_state', 'plugged_out'), 'Geen auto', 'No car', 'off'],
  [withValue(withValue(chargers.full, 'evcharger_charging_state', 'plugged_in_discharging'), 'measure_power', 3240), 'Levert terug · 3,2 kW', 'Discharging · 3.2 kW', 'on'],
  [withValue(chargers.full, 'evcharger_charging_state', 'plugged_in_paused'), 'Gepauzeerd', 'Paused', 'off'],
  [withValue(chargers.plug, 'measure_power', 850), 'Laadt · 850 W', 'Charging · 850 W', 'on'],
])('%# a charge point says whether it charges and how hard; its own alarms are no danger', (d, dutch, english, state) => {
  expect([says('charger', d), seen('charger', d).state]).toEqual([[dutch, english], state]);
});

test.each<[Device, string, string, string]>([
  [cars.tesla, '64% · 240 km', '64% · 240 km', 'off'], [cars.kia, 'Van slot · 81% · 312 km', 'Unlocked · 81% · 312 km', 'on'],
  [cars.other, 'Laadt · 23% · 98 km', 'Charging · 23% · 98 km', 'on'],
  // unlocked goes before charging
  [{ ...cars.tesla, capabilities: { ...cars.tesla.capabilities, locked: { ...cars.tesla.capabilities['locked']!, value: false }, ev_charging_state: { ...cars.tesla.capabilities['ev_charging_state']!, value: 'plugged_in_charging' } } }, 'Van slot · 64% · 240 km', 'Unlocked · 64% · 240 km', 'on'],
])('%# a car says its battery and range, and first that it charges or is unlocked', (d, dutch, english, state) => {
  expect([says('car', d), seen('car', d).state]).toEqual([[dutch, english], state]);
});

test('while a car is told to unlock it says so, as a lock does', () => {
  expect(says('car', cars.tesla, { capabilityId: 'locked', value: false })).toEqual(['Ontgrendelt… · 64% · 240 km', 'Unlocking… · 64% · 240 km']);
});

test('each has its own icon, and a tap opens its window', () => {
  expect([seen('fan', fans.standing), seen('fan', fans.purifier).icon, seen('vacuum', vacuums.full).icon, seen('appliance', appliances.washer).icon,
    seen('appliance', appliances.plug).icon, seen('charger', chargers.full).icon, seen('car', cars.tesla).icon])
    .toEqual([{ icon: 'mode_fan', state: 'on', tap: 'open' }, 'air', 'cleaning_services', 'local_laundry_service', 'dishwasher', 'ev_station', 'electric_car']);
});

test('the head of Huishouden counts what runs, that of Auto en laden what charges; an unlocked car counts as unlocked', async () => {
  const { sectionCount } = await import('../../../src/ui/model/layout');
  const all = [appliances.washer, vacuums.other, vacuums.full, appliances.plug, chargers.full, cars.other, cars.kia];
  const count = (kind: 'household' | 'vehicles', ds: Device[], t = nl) => sectionCount({ id: 's', kind, titleKey: 'section.other', tiles: ds.map((d) => ({ kind: tileKind(d), id: d.id, deviceId: d.id, size: 'single' }) as DeviceTileSpec) }, (id) => all.find((d) => d.id === id), t);
  // a plug that says it is a dishwasher does not say whether it runs
  expect(count('household', [appliances.washer, vacuums.other, vacuums.full, appliances.plug])).toBe('2 bezig');
  // a charge point and the car it charges are one charging: it says that something charges, not how many
  expect(count('vehicles', [chargers.full, cars.other, cars.kia], en)).toBe('1 unlocked · Charging');
  expect(count('household', [vacuums.full])).toBe('');
});

test('a room card says what runs and what charges', async () => {
  const { roomCard } = await import('../../../src/rooms/rooms');
  const { snapshot } = await import('../../helpers/build');
  const s = snapshot([appliances.washer, chargers.full]);
  expect(roomCard({ id: 'r', name: 'Garage', icon: 'garage', deviceIds: ['washer', 'zaptec'] } as never, s, nl).facts.map((fact) => fact.text)).toEqual(['1 bezig', 'Laadt']);
});

function tileKind(d: Device): HouseKind {
  return ({ washer: 'appliance', neato: 'vacuum', robot: 'vacuum', plugdish: 'appliance', zaptec: 'charger', xpeng: 'car', kia: 'car' } as Record<string, HouseKind>)[d.id]!;
}
