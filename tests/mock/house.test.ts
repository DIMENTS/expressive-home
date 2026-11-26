import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { houseKind, sectionFor, tilesFor } from '../../src/dashboard/classify';
import { generateDashboard } from '../../src/dashboard/generate';
import type { ClientEvent } from '../../src/homey/client';
import { toSnapshot } from '../../src/homey/map';
import { houseLife, houseRaw, LIFE_MS } from '../../src/mock/house';
import { createMockClient } from '../../src/mock/mock-client';

// The example house: what is in it, and how it lives.

const snapshot = toSnapshot(houseRaw('nl'));
const devices = Object.values(snapshot.devices);

test('it is a house of about forty devices in eight rooms', () => {
  const rooms = [...new Set(devices.map((d) => snapshot.zones[d.zoneId!]!.name))];
  expect(devices.length).toBeGreaterThanOrEqual(38);
  expect(devices.length).toBeLessThanOrEqual(48);
  expect(rooms.sort()).toEqual(['Badkamer', 'Garage', 'Hal', 'Keuken', 'Slaapkamer', 'Tuin', 'Werkkamer', 'Woonkamer']);
  // and floors above them without a device of their own
  expect(Object.values(snapshot.zones).map((z) => z.name)).toEqual(expect.arrayContaining(['Thuis', 'Beneden', 'Boven', 'Buiten']));
  for (const zone of Object.values(snapshot.zones)) if (zone.parentId !== null) expect(snapshot.zones[zone.parentId]).toBeDefined();
  expect(snapshot.flows.length).toBeGreaterThanOrEqual(4);
});

test('every device is complete: names, ids and values that fit their range', () => {
  for (const d of devices) {
    expect(d.name.trim()).not.toBe('');
    expect(d.capabilityOrder.length).toBeGreaterThan(0);
    for (const cap of Object.values(d.capabilities)) {
      expect(cap.title, `${d.name} ${cap.id}`).not.toBe(cap.id);
      if (typeof cap.value === 'number' && cap.min !== null && cap.max !== null) expect([d.name, cap.id, cap.value >= cap.min && cap.value <= cap.max]).toEqual([d.name, cap.id, true]);
      if (cap.type === 'enum' && cap.value !== null) expect(cap.options.map((o) => o.id)).toContain(cap.value);
    }
  }
  const inRoom = devices.map((d) => `${d.zoneId}/${d.name}`);
  expect(new Set(inRoom).size).toBe(inRoom.length);
});

test('it has the shapes that real apps have', () => {
  const having = (kind: string, test_: (ids: string[]) => boolean) => devices.some((d) => houseKind(d) === kind && test_(d.capabilityOrder));
  const without = (ids: string[], id: string) => !ids.includes(id);
  expect({
    valveThatDoesNotMeasure: having('climate', (ids) => without(ids, 'measure_temperature')),
    thermostatWithoutMode: having('climate', (ids) => without(ids, 'thermostat_mode') && ids.includes('measure_temperature')),
    aircoWithoutOnoff: having('climate', (ids) => ids.includes('thermostat_mode') && without(ids, 'onoff')),
    blindWithOnlyAPosition: having('cover', (ids) => without(ids, 'windowcoverings_state')),
    shutterWithOnlyUpAndDown: having('cover', (ids) => without(ids, 'windowcoverings_set')),
    slats: having('cover', (ids) => ids.includes('windowcoverings_tilt_set')),
    awning: devices.some((d) => houseKind(d) === 'cover' && d.deviceClass === 'sunshade'),
    speakerWithSong: having('media', (ids) => ids.includes('speaker_track')),
    speakerWithout: having('media', (ids) => ids.includes('speaker_playing') && without(ids, 'speaker_track')),
    televisionWithButtons: having('media', (ids) => ids.includes('volume_up') && without(ids, 'volume_set')),
    lock: having('guard', (ids) => ids.includes('locked')), garage: having('guard', (ids) => ids.includes('garagedoor_closed')), alarm: having('guard', (ids) => ids.includes('homealarm_state')),
  }).toEqual(Object.fromEntries(['valveThatDoesNotMeasure', 'thermostatWithoutMode', 'aircoWithoutOnoff', 'blindWithOnlyAPosition', 'shutterWithOnlyUpAndDown', 'slats', 'awning', 'speakerWithSong', 'speakerWithout', 'televisionWithButtons', 'lock', 'garage', 'alarm'].map((k) => [k, true])));
  expect([...new Set(devices.map(sectionFor))].sort()).toEqual(['climate', 'covers', 'household', 'lights', 'media', 'other', 'security', 'switches', 'vehicles', 'water'].sort().filter((s) => s !== 'water' || devices.some((d) => sectionFor(d) === 'water')));
  // and of a fan, a vacuum cleaner, white goods, a plug that says it is one, a charge point and a car
  expect({
    fanWithSpeed: having('fan', (ids) => ids.includes('fan_speed') && ids.includes('oscillating')),
    plainFan: devices.some((d) => d.deviceClass === 'fan' && houseKind(d) === null),
    vacuum: having('vacuum', (ids) => ids.includes('vacuumcleaner_state') && ids.includes('measure_battery')),
    washer: having('appliance', (ids) => ids.includes('operational_state') && ids.includes('remaining_time')),
    plugAsDishwasher: devices.some((d) => houseKind(d) === 'appliance' && d.deviceClass === 'dishwasher' && !d.capabilityOrder.includes('operational_state')),
    charger: having('charger', (ids) => ids.includes('evcharger_charging_state') && ids.includes('meter_power.session')),
    car: having('car', (ids) => ids.includes('target_temperature') && ids.includes('locked')),
  }).toEqual({ fanWithSpeed: true, plainFan: true, vacuum: true, washer: true, plugAsDishwasher: true, charger: true, car: true });
  // nothing is a bare tile
  expect(devices.filter((d) => tilesFor(d).length === 0).map((d) => d.name)).toEqual([]);
});

test('the Overzicht of the house begins with what makes the energy', () => {
  const board = generateDashboard(snapshot, { grouping: 'type' });
  expect(board.hero).not.toBeNull();
  expect(board.sections.map((s) => s.kind)).toEqual(expect.arrayContaining(['lights', 'switches', 'climate', 'covers', 'media', 'security', 'flows']));
});

test('it speaks English too', () => {
  const english = toSnapshot(houseRaw('en'));
  expect(Object.keys(english.devices)).toEqual(Object.keys(snapshot.devices));
  expect(Object.values(english.zones).map((z) => z.name)).toEqual(expect.arrayContaining(['Living room', 'Kitchen', 'Hall', 'Bedroom', 'Study', 'Bathroom', 'Garage', 'Garden']));
  const titles = (s: typeof snapshot) => Object.values(s.devices).flatMap((d) => Object.values(d.capabilities).map((c) => c.title));
  expect(titles(english).filter((title) => /helderheid|temperatuur|beweging|vermogen|stand|vergrendeld|uit$/i.test(title))).toEqual([]);
  expect(Object.values(english.flows).map((f) => f.name)).not.toEqual(Object.values(snapshot.flows).map((f) => f.name));
  // a name stands for the thing, not for the language
  const same = Object.keys(snapshot.devices).filter((id) => snapshot.devices[id]!.name === english.devices[id]!.name);
  expect(same.length).toBeLessThan(8);
});

// ----- it lives -----

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

async function living() {
  const mock = createMockClient(houseRaw('nl'), { life: houseLife() });
  const events: ClientEvent[] = [];
  mock.subscribe((e) => events.push(e));
  const start = await mock.connect();
  mock.simulate({ setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) });
  const find = (kind: string, id: string) => Object.values(start.devices).find((d) => houseKind(d) === kind && d.capabilityOrder.includes(id))!;
  const values = (deviceId: string, capId: string) => events.flatMap((e) => (e.type === 'capability' && e.deviceId === deviceId && e.capabilityId === capId ? [e.value] : []));
  const value = (deviceId: string, capId: string) => values(deviceId, capId).at(-1) ?? start.devices[deviceId]!.capabilities[capId]!.value;
  return { mock, start, events, find, values, value };
}

test('a lock takes a moment, and only then says so', async () => {
  const s = await living();
  const lock = s.find('guard', 'locked');
  const was = lock.capabilities['locked']!.value;
  await s.mock.setCapability(lock.id, 'locked', !was);
  expect(s.values(lock.id, 'locked')).toEqual([]);
  vi.advanceTimersByTime(LIFE_MS * 4);
  expect(s.values(lock.id, 'locked')).toEqual([!was]);
});

test('a garage door takes longer', async () => {
  const s = await living();
  const door = s.find('guard', 'garagedoor_closed');
  await s.mock.setCapability(door.id, 'garagedoor_closed', false);
  vi.advanceTimersByTime(LIFE_MS * 4);
  expect(s.values(door.id, 'garagedoor_closed')).toEqual([]);
  vi.advanceTimersByTime(LIFE_MS * 8);
  expect(s.values(door.id, 'garagedoor_closed')).toEqual([false]);
});

test('a curtain moves bit by bit, can be stopped, and ends at its end', async () => {
  const s = await living();
  const curtain = Object.values(s.start.devices).find((d) => d.capabilityOrder.includes('windowcoverings_set') && d.capabilityOrder.includes('windowcoverings_state') && d.deviceClass !== 'sunshade')!;
  await s.mock.setCapability(curtain.id, 'windowcoverings_state', 'down');
  vi.advanceTimersByTime(LIFE_MS * 3);
  const halfway = s.value(curtain.id, 'windowcoverings_set') as number;
  expect(halfway).toBeGreaterThan(0);
  expect(halfway).toBeLessThan(curtain.capabilities['windowcoverings_set']!.value as number);
  await s.mock.setCapability(curtain.id, 'windowcoverings_state', 'idle');
  vi.advanceTimersByTime(LIFE_MS * 20);
  expect(s.value(curtain.id, 'windowcoverings_set')).toBe(halfway);
  await s.mock.setCapability(curtain.id, 'windowcoverings_state', 'up');
  vi.advanceTimersByTime(LIFE_MS * 40);
  expect([s.value(curtain.id, 'windowcoverings_set'), s.value(curtain.id, 'windowcoverings_state')]).toEqual([1, 'idle']);
  // and to where it is put
  await s.mock.setCapability(curtain.id, 'windowcoverings_set', 0.35);
  vi.advanceTimersByTime(LIFE_MS * 40);
  expect([s.value(curtain.id, 'windowcoverings_set'), s.value(curtain.id, 'windowcoverings_state')]).toEqual([0.35, 'idle']);
});

test('the song goes on, and the next one comes after it', async () => {
  const s = await living();
  const speaker = s.find('media', 'speaker_track');
  const first = s.value(speaker.id, 'speaker_track');
  vi.advanceTimersByTime(10_000);
  expect(s.value(speaker.id, 'speaker_position')).toBeGreaterThan(speaker.capabilities['speaker_position']!.value as number);
  await s.mock.setCapability(speaker.id, 'speaker_next', true);
  expect([s.value(speaker.id, 'speaker_track') !== first, s.value(speaker.id, 'speaker_position')]).toEqual([true, 0]);
  await s.mock.setCapability(speaker.id, 'speaker_playing', false);
  const at = s.value(speaker.id, 'speaker_position');
  vi.advanceTimersByTime(10_000);
  expect(s.value(speaker.id, 'speaker_position')).toBe(at);
  await s.mock.setCapability(speaker.id, 'speaker_playing', true);
  const track = s.value(speaker.id, 'speaker_track');
  vi.advanceTimersByTime(600_000);
  expect(s.value(speaker.id, 'speaker_track')).not.toBe(track);
});

test('a room slowly gets as warm as it was told', async () => {
  const s = await living();
  const thermostat = Object.values(s.start.devices).find((d) => houseKind(d) === 'climate' && d.capabilityOrder.includes('measure_temperature') && d.deviceClass === 'thermostat')!;
  await s.mock.setCapability(thermostat.id, 'target_temperature', 25);
  vi.advanceTimersByTime(60_000);
  expect(s.value(thermostat.id, 'measure_temperature')).toBeGreaterThan(thermostat.capabilities['measure_temperature']!.value as number);
});

test('once it is left nothing moves any more, and the camper does not live so', async () => {
  const s = await living();
  const lock = s.find('guard', 'locked');
  await s.mock.setCapability(lock.id, 'locked', false);
  s.mock.disconnect();
  const count = s.events.length;
  vi.advanceTimersByTime(60_000);
  expect(s.events.length).toBe(count);
  expect(vi.getTimerCount()).toBe(0);
  // without life a command is there at once
  const plain = createMockClient(houseRaw('nl'));
  const seen: ClientEvent[] = [];
  plain.subscribe((e) => seen.push(e));
  await plain.setCapability(lock.id, 'locked', false);
  expect(seen).toHaveLength(1);
});

test('a vacuum cleaner cleans, its battery runs down, and back in its dock it charges', async () => {
  const s = await living();
  const robot = s.find('vacuum', 'vacuumcleaner_state');
  const full = s.value(robot.id, 'measure_battery') as number;
  await s.mock.setCapability(robot.id, 'vacuumcleaner_state', 'cleaning');
  vi.advanceTimersByTime(LIFE_MS * 40);
  expect([s.value(robot.id, 'vacuumcleaner_state'), s.value(robot.id, 'docked')]).toEqual(['cleaning', false]);
  expect(s.value(robot.id, 'measure_battery')).toBeLessThan(full);
  await s.mock.setCapability(robot.id, 'vacuumcleaner_state', 'docked');
  vi.advanceTimersByTime(LIFE_MS * 4);
  expect([s.value(robot.id, 'vacuumcleaner_state'), s.value(robot.id, 'docked')]).toEqual(['charging', true]);
  vi.advanceTimersByTime(LIFE_MS * 400);
  expect([s.value(robot.id, 'vacuumcleaner_state'), s.value(robot.id, 'measure_battery')]).toEqual(['docked', 100]);
});

test('the washing machine gets on, its time runs out, and then it is done', async () => {
  const s = await living();
  const washer = s.find('appliance', 'operational_state');
  const left = s.value(washer.id, 'remaining_time') as number;
  vi.advanceTimersByTime(LIFE_MS * 20);
  expect(s.value(washer.id, 'remaining_time')).toBeLessThan(left);
  expect(s.value(washer.id, 'progress')).toBeGreaterThan(washer.capabilities['progress']!.value as number);
  vi.advanceTimersByTime(LIFE_MS * 2000);
  expect([s.value(washer.id, 'operational_state'), s.value(washer.id, 'remaining_time')]).toEqual(['stopped', 0]);
});

test('the charge point charges the car: its power, this time, and the battery of the car go up; stopped, it rests', async () => {
  const s = await living();
  const charger = s.find('charger', 'evcharger_charging');
  const car = s.find('car', 'ev_charging_state');
  const battery = s.value(car.id, 'measure_battery') as number;
  await s.mock.setCapability(charger.id, 'evcharger_charging', true);
  vi.advanceTimersByTime(LIFE_MS * 60);
  expect([s.value(charger.id, 'evcharger_charging_state'), s.value(car.id, 'ev_charging_state')]).toEqual(['plugged_in_charging', 'plugged_in_charging']);
  expect(s.value(charger.id, 'measure_power')).toBeGreaterThan(5_000);
  expect(s.value(charger.id, 'meter_power.session')).toBeGreaterThan(0);
  expect(s.value(car.id, 'measure_battery')).toBeGreaterThan(battery);
  await s.mock.setCapability(charger.id, 'evcharger_charging', false);
  vi.advanceTimersByTime(LIFE_MS * 4);
  expect([s.value(charger.id, 'evcharger_charging_state'), s.value(charger.id, 'measure_power'), s.value(car.id, 'ev_charging_state')]).toEqual(['plugged_in', 0, 'plugged_in']);
});

test('the washing machine switched off stops; charging stops when the car is full, at the power it may use', async () => {
  const s = await living();
  const washer = s.find('appliance', 'operational_state');
  await s.mock.setCapability(washer.id, 'onoff', false);
  vi.advanceTimersByTime(LIFE_MS * 4);
  expect([s.value(washer.id, 'operational_state'), s.value(washer.id, 'measure_power')]).toEqual(['stopped', 0]);
  const charger = s.find('charger', 'evcharger_charging');
  const car = s.find('car', 'ev_charging_state');
  await s.mock.setCapability(charger.id, 'target_power', 7400);
  await s.mock.setCapability(charger.id, 'evcharger_charging', true);
  vi.advanceTimersByTime(LIFE_MS * 4);
  expect(s.value(charger.id, 'measure_power')).toBeLessThanOrEqual(7400 * 1.2);
  vi.advanceTimersByTime(LIFE_MS * 2000);
  expect([s.value(car.id, 'measure_battery'), s.value(charger.id, 'evcharger_charging'), s.value(charger.id, 'evcharger_charging_state'), s.value(charger.id, 'measure_power'), s.value(car.id, 'ev_charging_state')])
    .toEqual([100, false, 'plugged_in', 0, 'plugged_in']);
});
