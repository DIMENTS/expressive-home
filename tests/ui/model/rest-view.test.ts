import { expect, test } from 'vitest';
import { createTranslate, t } from '../../../src/i18n';
import type { Device } from '../../../src/homey/types';
import { sectionFor } from '../../../src/dashboard/classify';
import { attention, shiftAt, tanksOf, temperature, temperatureSources } from '../../../src/ui/model/rest-view';
import { cap, device } from '../../helpers/build';
import { camperSnapshot } from '../../helpers/fake-hub';

const en = createTranslate('en');
const find = (...devices: Device[]) => (id: string): Device | undefined => devices.find((d) => d.id === id);

// ----- what needs attention -----

const battery = (value: unknown, extra: Device['capabilities'][string][] = []): Device =>
  device({ id: 'accu', name: 'Accu', deviceClass: 'battery', caps: [cap('battery_soc', { units: '%', value: value as number }), ...extra] });
const BATTERY = { deviceId: 'accu', capabilityId: 'battery_soc' };
const tank = (id: string, name: string, level: unknown): Device => device({ id, name, caps: [cap('tank_level', { units: '%', value: level as number })] });
const alarming = (name: string, ...alarms: string[]): Device =>
  device({ id: `id-${name}`, name, caps: alarms.map((id) => cap(id, { type: 'boolean', value: true, title: `Melding ${id}` })) });

type Input = Parameters<typeof attention>[0];
const look = (input: Partial<Input>, translate = t) =>
  attention({ devices: [], away: false, lowBattery: true, battery: BATTERY, tanks: {}, night: false, before: new Set(), ...input }, translate);
const texts = (input: Partial<Input>, translate = t) => look(input, translate).items.map((item) => item.text);

test('nothing is wrong: nothing is said', () => {
  expect(look({ devices: [battery(80), tank('t', 'Schoon water', 50)], tanks: { t: 'low' } })).toEqual({ items: [], more: 0, active: new Set() });
});

test('the order: alarms by name, the hub that does not answer, the battery, the tanks by name', () => {
  const devices = [tank('t2', 'Zout', 5), tank('t1', 'Afval', 95), battery(12), alarming('Keuken', 'alarm_smoke'), alarming('Badkamer', 'alarm_water')];
  const all = look({ devices, away: true, tanks: { t2: 'low', t1: 'high' } });
  expect(all.items.map((i) => [i.tone, i.icon, i.text])).toEqual([
    ['alarm', 'warning', 'Badkamer · Melding alarm_water'], ['alarm', 'warning', 'Keuken · Melding alarm_smoke'], ['alarm', 'cloud_off', 'Je Homey antwoordt niet'],
  ]);
  expect(all.more).toBe(3);
  expect([...all.active].sort()).toEqual(['battery', 'tank:t1', 'tank:t2']);
  expect(look({ devices: devices.slice(0, 3), tanks: { t2: 'low', t1: 'high' } }).items.map((i) => [i.tone, i.icon, i.text])).toEqual([
    ['warn', 'battery_alert', 'Accu bijna leeg · 12%'], ['warn', 'water_drop', 'Afval bijna vol · 95%'], ['warn', 'water_drop', 'Zout bijna leeg · 5%'],
  ]);
  expect(new Set(all.items.map((i) => i.id)).size).toBe(3);
});

test('three at most, and how many more', () => {
  const devices = ['a', 'b', 'c', 'd', 'e'].map((name) => alarming(name, 'alarm_smoke'));
  expect([look({ devices }).items.length, look({ devices }).more]).toEqual([3, 2]);
});

test.each([[20, false, false], [19, false, true], [20, true, true], [21, true, true], [22, true, false], [19.6, false, false], [19.4, false, true], [0, false, true]])(
  'a battery of %s, told before: %s, is told: %s', (value, before, told) => {
    const seen = look({ devices: [battery(value)], before: new Set(before ? ['battery'] : []) });
    expect([seen.items.length, seen.active.has('battery')]).toEqual(told ? [1, true] : [0, false]);
  },
);

test.each([null, Number.NaN, 'leeg', true, undefined])('a battery without a number is not empty: %s', (value) => {
  expect(look({ devices: [battery(value)], before: new Set(['battery']) })).toEqual({ items: [], more: 0, active: new Set() });
});

test('a battery is not told when it is off, when there is none, or when it went', () => {
  expect(texts({ devices: [battery(5)], lowBattery: false })).toEqual([]);
  expect(texts({ devices: [battery(5)], battery: null })).toEqual([]);
  expect(texts({ devices: [], before: new Set(['battery']) })).toEqual([]);
  expect(texts({ devices: [device({ id: 'accu' })] })).toEqual([]);
});

test('a battery that raises its own alarm is told once', () => {
  const devices = [battery(5, [cap('alarm_battery', { type: 'boolean', value: true, title: 'Batterij-alarm' })])];
  expect(texts({ devices })).toEqual(['Accu · Batterij-alarm']);
});

test.each([
  ['low', 15, false, false], ['low', 14, false, true], ['low', 16, true, true], ['low', 17, true, false],
  ['high', 90, false, false], ['high', 91, false, true], ['high', 89, true, true], ['high', 88, true, false],
] as const)('a tank watched for %s at %s, told before: %s, is told: %s', (watch, level, before, told) => {
  const seen = look({ devices: [tank('t', 'Water', level)], tanks: { t: watch }, before: new Set(before ? ['tank:t'] : []) });
  expect([seen.items.length, seen.active.has('tank:t')]).toEqual(told ? [1, true] : [0, false]);
});

test('a tank without a level, without a choice, or that is gone, is not told', () => {
  expect(texts({ devices: [tank('t', 'Water', null)], tanks: { t: 'low' }, before: new Set(['tank:t']) })).toEqual([]);
  expect(texts({ devices: [tank('t', 'Water', 2)] })).toEqual([]);
  expect(texts({ tanks: { t: 'low' }, before: new Set(['tank:t']) })).toEqual([]);
  // what is no tank any more
  expect(texts({ devices: [device({ id: 't', name: 'Lamp', caps: [cap('dim', { value: 0 })] })], tanks: { t: 'low' } })).toEqual([]);
});

test('a tank with only a content is told by what is in it', () => {
  const litres = device({ id: 't', name: 'Water', caps: [cap('measure_content_volume', { value: 9 }), cap('tank_capacity', { value: 90 })] });
  expect(texts({ devices: [litres], tanks: { t: 'low' } })).toEqual(['Water bijna leeg · 10%']);
});

test('at night only alarms, without empty batteries, and two at most', () => {
  const devices = [battery(5), tank('t', 'Water', 2), alarming('Afstandsbediening', 'alarm_battery'), alarming('Badkamer', 'alarm_water'), alarming('Keuken', 'alarm_smoke', 'alarm_battery'), alarming('Slaapkamer', 'alarm_co')];
  const night = look({ devices, away: true, tanks: { t: 'low' }, night: true });
  expect(night.items.map((i) => i.text)).toEqual(['Badkamer · Melding alarm_water', 'Keuken · Melding alarm_smoke']);
  expect(night.more).toBe(1);
  // the margins go on
  expect([...night.active].sort()).toEqual(['battery', 'tank:t']);
  expect(look({ devices: devices.slice(0, 3), night: true }).items).toEqual([]);
});

test('in English, and without a name', () => {
  expect(texts({ devices: [battery(12), tank('t', ' ', 95)], away: true, tanks: { t: 'high' } }, en)).toEqual(['Your Homey isn’t answering', 'Battery almost empty · 12%', 'Unnamed device almost full · 95%']);
});

test('what is told has a name and what is the matter, so a long name can be cut instead of the alarm', () => {
  const devices = [battery(12), tank('t', 'Schoon water', 3), alarming('Badkamer', 'alarm_water')];
  expect(look({ devices, tanks: { t: 'low' } }).items.map((i) => [i.name, i.dot, i.what])).toEqual([
    ['Badkamer', true, 'Melding alarm_water'], ['', false, 'Accu bijna leeg · 12%'], ['Schoon water', false, 'bijna leeg · 3%'],
  ]);
  expect(look({ devices: [], away: true }).items.map((i) => [i.name, i.what])).toEqual([['', 'Je Homey antwoordt niet']]);
});

// ----- the temperatures -----

const climate = (id: string, name: string, value: unknown, extra: Partial<Device> = {}): Device => device({ id, name, deviceClass: 'sensor', ...extra, caps: [cap('measure_temperature', { units: '°C', value: value as number })] });

test('a temperature in the language, with one decimal; nothing without a value', () => {
  const get = find(climate('a', 'A', 21.44), climate('b', 'B', null), climate('c', 'C', Number.NaN), climate('d', 'D', -3), climate('e', 'E', 'warm'));
  const ref = (deviceId: string, capabilityId = 'measure_temperature') => ({ deviceId, capabilityId });
  expect(temperature(ref('a'), get, t)).toBe('21,4°');
  expect(temperature(ref('a'), get, en)).toBe('21.4°');
  expect(temperature(ref('d'), get, t)).toBe('-3°');
  for (const none of [null, ref('b'), ref('c'), ref('e'), ref('gone'), ref('a', 'gone')]) expect([none, temperature(none, get, t)]).toEqual([none, null]);
});

test('what can be chosen: what measures a temperature and is no lamp or switch', () => {
  const zones = { z1: { id: 'z1', name: 'Woonkamer', parentId: null } };
  const devices = [
    device({ id: 'lamp', name: 'Lamp', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true }), cap('dim', { setable: true }), cap('measure_temperature', { value: 30 })] }),
    device({ id: 'plug', name: 'Stekker', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true }), cap('measure_power'), cap('measure_temperature', { value: 40 })] }),
    device({ id: 'inverter', name: 'Aap', caps: [cap('measure_power'), cap('measure_voltage'), cap('measure_current'), cap('measure_temperature', { value: 33 })] }),
    climate('room', 'Zolder', 20, { zoneId: 'z1' }),
    device({ id: 'two', name: 'Buiten', deviceClass: 'sensor', caps: [cap('measure_temperature.air', { title: 'Lucht' }), cap('measure_temperature.ground', { title: 'Grond' })] }),
    device({ id: 'text', name: 'Tekst', caps: [cap('measure_temperature', { type: 'string' })] }),
    device({ id: 'blind', name: 'Blind', caps: [cap('measure_temperature', { getable: false })] }),
    climate('nameless', ' ', 5),
  ];
  expect(temperatureSources(devices, zones, t).map((s) => [s.ref.deviceId, s.ref.capabilityId, s.name, s.zone])).toEqual([
    ['two', 'measure_temperature.air', 'Buiten · Lucht', ''], ['two', 'measure_temperature.ground', 'Buiten · Grond', ''],
    ['nameless', 'measure_temperature', 'Naamloos apparaat', ''], ['room', 'measure_temperature', 'Zolder', 'Woonkamer'],
    ['inverter', 'measure_temperature', 'Aap', ''],
  ]);
});

test('in the camper there are no lamps or sockets to choose', () => {
  const snapshot = camperSnapshot();
  const devices = Object.values(snapshot.devices);
  const found = temperatureSources(devices, snapshot.zones, t).map((s) => sectionFor(snapshot.devices[s.ref.deviceId]!));
  expect(found.length).toBeGreaterThan(0);
  expect(found.filter((kind) => kind === 'lights' || kind === 'switches')).toEqual([]);
});

test('the tanks, by name', () => {
  expect(tanksOf([tank('b', 'Zout', 1), climate('x', 'A', 2), tank('a', 'Afval', 2)], t).map((d) => d.id)).toEqual(['a', 'b']);
});

// ----- against burning in -----

test('every minute another place, in a ring; each of them the same number of times', () => {
  const places = Array.from({ length: 8 }, (_, minute) => shiftAt(minute));
  expect(new Set(places.map((p) => `${p.x},${p.y}`)).size).toBe(8);
  expect(places.every((p) => [-1, 0, 1].includes(p.x) && [-1, 0, 1].includes(p.y) && (p.x !== 0 || p.y !== 0))).toBe(true);
  expect(shiftAt(8)).toEqual(shiftAt(0));
  expect(shiftAt(29_000_003)).toEqual(shiftAt(3));
  // from one to the next it is a small step
  for (let i = 0; i < 8; i += 1) expect(Math.abs(shiftAt(i).x - shiftAt(i + 1).x) + Math.abs(shiftAt(i).y - shiftAt(i + 1).y)).toBe(1);
});
