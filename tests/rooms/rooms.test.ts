import { expect, test } from 'vitest';
import { toSnapshot, toZone } from '../../src/homey/map';
import type { Device, HomeySnapshot, Zone } from '../../src/homey/types';
import { createTranslate } from '../../src/i18n';
import { houseRaw } from '../../src/mock/house';
import { NO_ROOM, hasRooms, roomCard, roomDashboard, roomsOf, roomTemperature, zoneIcon } from '../../src/rooms/rooms';
import { cap, device, snapshot } from '../helpers/build';
import { covers, guards, heating, media } from '../helpers/devices';
import { camperSnapshot } from '../helpers/fake-hub';

// What a room is, what its card says and what stands in it.

const [nl, en] = [createTranslate('nl'), createTranslate('en')];
const house = () => toSnapshot(houseRaw('nl'));
const zone = (id: string, name: string, partial: Partial<Zone> = {}): Zone => ({ id, name, parentId: null, ...partial });
const inZone = (d: Device, zoneId: string | null, name = d.name): Device => ({ ...d, id: `${zoneId}-${d.id}`, zoneId, name });
const hub = (devices: Device[], zones: Zone[]): HomeySnapshot => ({ ...snapshot(devices), zones: Object.fromEntries(zones.map((z) => [z.id, z])) });
const lamp = (id: string, on: boolean | null, partial: Partial<Device> = {}): Device => device({ id, name: id, deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: on }), cap('dim', { setable: true, min: 0, max: 1, value: 0.5 })], ...partial });
const sensor = (id: string, values: Record<string, number | null>, partial: Partial<Device> = {}): Device => device({ id, name: id, deviceClass: 'sensor', caps: Object.entries(values).map(([c, value]) => cap(c, { value, units: c === 'measure_temperature' ? '°C' : '%', title: c })), ...partial });

// ----- which rooms there are -----

test('a zone keeps its icon and its order, when the hub tells them', () => {
  expect(toZone({ id: 'z', name: 'Keuken', parent: 'p', icon: 'kitchen', order: 3 })).toEqual({ id: 'z', name: 'Keuken', parentId: 'p', icon: 'kitchen', order: 3 });
  expect(toZone({ id: 'z', name: 'Keuken', parent: null })).toEqual({ id: 'z', name: 'Keuken', parentId: null });
  expect(toZone({ id: 'z', name: 'Keuken', parent: null, icon: 7, order: 'x' })).toEqual({ id: 'z', name: 'Keuken', parentId: null });
});

test('the rooms of the example house stand in the order of the hub', () => {
  expect(roomsOf(house(), nl).map((r) => [r.name, r.icon])).toEqual([
    ['Woonkamer', 'weekend'], ['Keuken', 'countertops'], ['Hal', 'door_front'], ['Slaapkamer', 'bed'], ['Werkkamer', 'computer'], ['Badkamer', 'bathtub'], ['Garage', 'garage'], ['Tuin', 'yard'],
  ]);
  expect(roomsOf(house(), nl)[1]!.deviceIds).toEqual(['kitchen-ceiling', 'kitchen-speaker', 'kitchen-fridge', 'kitchen-leak', 'kitchen-smoke', 'kitchen-dishwasher', 'kitchen-counter']);
});

test('without an order they stand by name, floor by floor', () => {
  const zones = [zone('a', 'Zolder'), zone('b', 'Beneden'), zone('c', 'Woonkamer', { parentId: 'b' }), zone('d', 'Hal', { parentId: 'b' }), zone('e', 'Berging', { parentId: 'a' })];
  const s = hub(zones.map((z) => lamp(`l-${z.id}`, true, { zoneId: z.id })), zones);
  // the highest of a floor is a room too when something is in it
  expect(roomsOf(s, nl).map((r) => r.name)).toEqual(['Beneden', 'Hal', 'Woonkamer', 'Zolder', 'Berging']);
  // some with and some without an order: those with one first
  const mixed = [zone('a', 'Zolder', { order: 1 }), zone('b', 'Aanbouw'), zone('c', 'Kelder', { order: 0 })];
  expect(roomsOf(hub(mixed.map((z) => lamp(`l-${z.id}`, true, { zoneId: z.id })), mixed), nl).map((r) => r.name)).toEqual(['Kelder', 'Zolder', 'Aanbouw']);
});

test('a zone without a device of its own is no room', () => {
  const s = hub([lamp('l', true, { zoneId: 'b' })], [zone('a', 'Huis'), zone('b', 'Kamer', { parentId: 'a' }), zone('c', 'Leeg', { parentId: 'a' })]);
  expect(roomsOf(s, nl).map((r) => r.name)).toEqual(['Kamer']);
  expect(hasRooms(s)).toBe(false);
});

test('devices without a zone, or of one that is gone, stand apart at the end', () => {
  const s = hub([lamp('a', true, { zoneId: 'z' }), lamp('b', true, { zoneId: null }), lamp('c', true, { zoneId: 'gone' })], [zone('z', 'Kamer')]);
  expect(roomsOf(s, nl)).toEqual([{ id: 'z', name: 'Kamer', icon: 'meeting_room', deviceIds: ['a'] }, { id: NO_ROOM, name: 'Zonder kamer', icon: 'category', deviceIds: ['b', 'c'] }]);
  expect(roomsOf(s, en)[1]!.name).toBe('Without a room');
  // it does not count for whether there are rooms
  expect(hasRooms(s)).toBe(false);
  expect(hasRooms(hub([lamp('a', true, { zoneId: 'z' }), lamp('b', true, { zoneId: 'y' })], [zone('z', 'Kamer'), zone('y', 'Gang')]))).toBe(true);
});

test('zones that are each other’s parent, or a nameless one, break nothing', () => {
  const s = hub([lamp('a', true, { zoneId: 'x' }), lamp('b', true, { zoneId: 'y' }), lamp('c', true, { zoneId: 'z' })], [zone('x', 'Een', { parentId: 'y' }), zone('y', 'Twee', { parentId: 'x' }), zone('z', '  ', { parentId: 'gone' })]);
  expect(roomsOf(s, nl).map((r) => r.name).sort()).toEqual(['Een', 'Kamer zonder naam', 'Twee']);
  expect(roomsOf(hub([], []), nl)).toEqual([]);
});

test('the camper has rooms too', () => {
  const rooms = roomsOf(camperSnapshot(), nl);
  expect(rooms.length).toBeGreaterThanOrEqual(2);
  expect(rooms.flatMap((r) => r.deviceIds).length).toBe(Object.keys(camperSnapshot().devices).length);
});

test.each([
  ['livingRoom', 'weekend'], ['living-room', 'weekend'], ['kitchen', 'countertops'], ['bedroomKids', 'bed'], ['bathroom', 'bathtub'], ['toilet', 'bathtub'], ['hallway', 'door_front'], ['stairs', 'stairs'], ['office', 'computer'],
  ['garage', 'garage'], ['garden', 'yard'], ['balcony', 'deck'], ['attic', 'roofing'], ['diningRoom', 'table_restaurant'], ['laundryRoom', 'local_laundry_service'], ['home', 'home'], ['default', 'meeting_room'], ['something', 'meeting_room'], [undefined, 'meeting_room'],
] as const)('the icon of a zone %s is %s', (icon, expected) => { expect(zoneIcon(icon)).toBe(expected); });

// ----- the card of a room -----

const card = (devices: Device[], t = nl) => {
  const s = hub(devices.map((d) => ({ ...d, zoneId: 'z' })), [zone('z', 'Kamer')]);
  return roomCard(roomsOf(s, t)[0]!, s, t);
};
const facts = (devices: Device[], t = nl) => card(devices, t).facts.map((f) => [f.icon, f.text, ...(f.danger ? ['danger'] : [])]);

test('a room with everything', () => {
  const everything = [lamp('a', true), lamp('b', true), lamp('c', false), sensor('s', { measure_temperature: 21, measure_humidity: 52 }), media.full, covers.setOnly, covers.both, covers.closedOnly, guards.lock];
  expect(facts(everything)).toEqual([['lightbulb', '2 aan'], ['thermostat', '21°'], ['humidity_percentage', '52%'], ['music_note', 'Speelt'], ['blinds', '2 open'], ['lock', 'Op slot']]);
  expect(facts(everything, en)).toEqual([['lightbulb', '2 on'], ['thermostat', '21°'], ['humidity_percentage', '52%'], ['music_note', 'Playing'], ['blinds', '2 open'], ['lock', 'Locked']]);
  expect(card(everything)).toMatchObject({ lit: true, lamps: { on: 2, ids: ['a', 'b', 'c'] } });
});

test('a room with only lamps that are off says nothing, and has a switch', () => {
  expect(card([lamp('a', false), lamp('b', null)])).toEqual({ lit: false, lamps: { on: 0, ids: ['a', 'b'] }, facts: [] });
});

test('only lamps that can be switched count, and only those that can be reached are on', () => {
  const readOnly = device({ id: 'r', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', value: true })] });
  const dimOnly = device({ id: 'd', deviceClass: 'light', caps: [cap('dim', { setable: true, min: 0, max: 1, value: 0.4 })] });
  const away = lamp('w', true, { available: false });
  const plug = device({ id: 'p', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true })] });
  expect(card([readOnly, dimOnly, away, plug])).toMatchObject({ lit: true, lamps: { on: 1, ids: ['d', 'w'] } });
  expect(card([plug]).lamps).toBeNull();
});

test('the temperature is that of a sensor, otherwise of heating, and of nothing else', () => {
  const fridge = heating.fridge;
  const plug = device({ id: 'p', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_temperature', { value: 41 })] });
  const hot = lamp('l', false, { id: 'hot', capabilityOrder: ['onoff', 'measure_temperature'], capabilities: { onoff: cap('onoff', { type: 'boolean', setable: true, value: false }), measure_temperature: cap('measure_temperature', { value: 60 }) } });
  expect(roomTemperature([fridge, plug, hot])).toBeNull();
  expect(roomTemperature([heating.ownMode, sensor('b', { measure_temperature: 18 }, { name: 'B' }), sensor('a', { measure_temperature: 19.5 }, { name: 'A' })])).toMatchObject({ value: 19.5, deviceId: 'a' });
  expect(roomTemperature([heating.valveBlind, heating.ownMode, fridge])).toMatchObject({ value: 20.5, deviceId: 'own' });
  // a sensor that says nothing now, or cannot be reached, is passed over
  expect(roomTemperature([sensor('a', { measure_temperature: null }), sensor('c', { measure_temperature: 5 }, { available: false }), heating.zone])).toMatchObject({ value: 18.2 });
  expect(facts([heating.airco])).toEqual([['thermostat', '24,1°'], ['humidity_percentage', '47%']]);
});

test('one cover says where it is, more how many are open; an awning is no curtain', () => {
  expect(facts([covers.setOnly])).toEqual([['blinds', '60%']]);
  expect(facts([covers.closedOnly])).toEqual([['blinds', 'Dicht']]);
  expect(facts([covers.withSwitch])).toEqual([['blinds', 'Open']]);
  expect(facts([covers.closedOnly, { ...covers.closedOnly, id: 'c2' }])).toEqual([['blinds', 'Dicht']]);
  expect(facts([covers.stateOnly])).toEqual([]);
  expect(facts([covers.awning])).toEqual([['roller_shades', 'Ingerold']]);
});

test('locks, doors and an alarm', () => {
  expect(facts([guards.lock, guards.custom])).toEqual([['lock_open', '1 van slot']]);
  expect(facts([guards.garage])).toEqual([['garage_home', 'Dicht']]);
  expect(facts([{ ...guards.garage, capabilities: { ...guards.garage.capabilities, garagedoor_closed: { ...guards.garage.capabilities['garagedoor_closed']!, value: false } } }])).toEqual([['garage_home', '1 open']]);
  expect(facts([guards.alarm])).toEqual([]);
  expect(facts([guards.alarmAsSensor])).toEqual([['shield_lock', 'Ingeschakeld']]);
});

test('danger comes first, in red, with its own name; an empty battery is none', () => {
  const smoke = device({ id: 'smoke', deviceClass: 'sensor', caps: [cap('alarm_smoke', { type: 'boolean', title: 'Rookalarm', value: true }), cap('alarm_battery', { type: 'boolean', title: 'Batterij', value: true })] });
  expect(facts([lamp('a', true), smoke])).toEqual([['detector_smoke', 'Rookalarm', 'danger'], ['lightbulb', '1 aan']]);
  expect(facts([{ ...smoke, available: false }])).toEqual([]);
});

// ----- inside a room -----

test('a room has all its devices, also those of the hero, per kind and wide to operate', () => {
  const s = house();
  const garage = roomsOf(s, nl).find((r) => r.id === 'garage')!;
  const board = roomDashboard(garage, s, 'nl');
  expect(board.hero).toBeNull();
  expect(new Set(board.sections.flatMap((x) => x.tiles.map((tile) => (tile.kind === 'flow' || tile.kind === 'widget' ? '' : tile.deviceId))))).toEqual(new Set(garage.deviceIds));
  const living = roomDashboard(roomsOf(s, nl)[0]!, s, 'nl');
  expect(living.sections.map((x) => x.kind)).toEqual(['lights', 'switches', 'climate', 'covers', 'media', 'household', 'security']);
  for (const tile of living.sections.flatMap((x) => x.tiles)) if (['climate', 'cover', 'media', 'guard', 'vacuum'].includes(tile.kind)) expect([tile.kind, tile.size]).toEqual([tile.kind, 'wide']);
  expect(living.sections.find((x) => x.kind === 'switches')!.tiles[0]!.size).toBe('single');
});
