import { expect, test } from 'vitest';
import { defaultWall, emptyWallHub, normalizeWall, wallHubOf, withWallHub, type WallSettings } from '../../src/wall/settings';

const hub = (n: number): string => String(n).padStart(24, 'a');
const full = (): WallSettings => ({
  on: true, after: 5, night: { on: false, from: '21:00', to: '06:45' }, lowBattery: false,
  hubs: { [hub(1)]: { inside: { deviceId: 'd1', capabilityId: 'measure_temperature' }, outside: null, tanks: { tank1: 'low', tank2: 'high' } } },
  screen: { rest: 50, night: 'dim' },
});

test('a device is no wall tablet until it is made one', () => {
  expect(defaultWall()).toEqual({ on: false, after: 2, night: { on: true, from: '22:30', to: '07:30' }, lowBattery: true, hubs: {}, screen: { rest: 'none', night: 'none' } });
  expect(normalizeWall(undefined)).toEqual(defaultWall());
  expect(normalizeWall('x')).toEqual(defaultWall());
  expect(normalizeWall([])).toEqual(defaultWall());
});

test('what was chosen is read back', () => {
  expect(normalizeWall(full())).toEqual(full());
  expect(normalizeWall(JSON.parse(JSON.stringify(full())))).toEqual(full());
});

test.each([
  ['on', { on: 'ja' }, { on: false }],
  ['after', { after: 3 }, { after: 2 }],
  ['after as text', { after: '5' }, { after: 2 }],
  ['the battery', { lowBattery: null }, { lowBattery: true }],
  ['night', { night: 7 }, { night: defaultWall().night }],
  ['the hubs', { hubs: [] }, { hubs: {} }],
])('a wrong value is the default, the others stay: %s', (_name, wrong, expected) => {
  expect(normalizeWall({ ...full(), ...wrong })).toEqual({ ...full(), ...expected });
});

test.each(['24:00', '7:30', '12:60', '', 'ab:cd', '07:30:00', 5, null])('a time that is none is the default: %s', (wrong) => {
  expect(normalizeWall({ ...full(), night: { on: false, from: wrong, to: '06:45' } }).night).toEqual({ on: false, from: '22:30', to: '06:45' });
  expect(normalizeWall({ ...full(), night: { on: false, from: '21:00', to: wrong } }).night).toEqual({ on: false, from: '21:00', to: '07:30' });
});

test('what belongs to a hub is checked one by one', () => {
  const wrong = normalizeWall({ ...full(), hubs: {
    [hub(1)]: { inside: { deviceId: 'd1' }, outside: { deviceId: 'd2', capabilityId: 'x'.repeat(201) }, tanks: { a: 'low', b: 'empty', c: 4, ['d'.repeat(201)]: 'high' } },
    'no-hub': emptyWallHub(),
    [hub(2).toUpperCase()]: { inside: null, outside: { deviceId: 'd9', capabilityId: 'measure_temperature' } },
    [hub(3)]: 'x',
  } });
  expect(wrong.hubs).toEqual({
    [hub(1)]: { inside: null, outside: null, tanks: { a: 'low' } },
    [hub(2)]: { inside: null, outside: { deviceId: 'd9', capabilityId: 'measure_temperature' }, tanks: {} },
  });
});

test('a name that belongs to every object is no tank and no hub', () => {
  const wall = normalizeWall(JSON.parse(`{"on":true,"hubs":{"__proto__":{"tanks":{"a":"low"}},"${hub(1)}":{"tanks":{"__proto__":"low","constructor":"high"}}}}`));
  expect(Object.keys(wall.hubs)).toEqual([hub(1)]);
  expect(({} as Record<string, unknown>)['tanks']).toBeUndefined();
  expect(Object.keys(wall.hubs[hub(1)]!.tanks)).toEqual(['constructor']);
  expect(wallHubOf(wall, 'constructor')).toEqual(emptyWallHub());
});

test('there is an end to what is kept', () => {
  const tanks = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`t${i}`, 'low']));
  const hubs = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [hub(i + 1), { tanks: i === 6 ? tanks : {} }]));
  const wall = normalizeWall({ hubs });
  expect(Object.keys(wall.hubs)).toEqual([3, 4, 5, 6, 7].map(hub));
  expect(Object.keys(wall.hubs[hub(7)]!.tanks)).toHaveLength(100);
});

test('every hub has its own choices; the one that changed goes last and the oldest goes', () => {
  let wall = defaultWall();
  for (const n of [1, 2, 3, 4, 5]) wall = withWallHub(wall, hub(n), { ...emptyWallHub(), tanks: { [`t${n}`]: 'low' } });
  wall = withWallHub(wall, hub(1), { ...emptyWallHub(), tanks: { x: 'high' } });
  expect(Object.keys(wall.hubs)).toEqual([2, 3, 4, 5, 1].map(hub));
  wall = withWallHub(wall, hub(6), emptyWallHub());
  expect(Object.keys(wall.hubs)).toEqual([3, 4, 5, 1, 6].map(hub));
  expect(wallHubOf(wall, hub(1)).tanks).toEqual({ x: 'high' });
  expect(wallHubOf(wall, hub(1).toUpperCase()).tanks).toEqual({ x: 'high' });
  expect(wallHubOf(wall, hub(2))).toEqual(emptyWallHub());
  expect(wallHubOf(wall, null)).toEqual(emptyWallHub());
  expect(Object.keys(defaultWall().hubs)).toEqual([]);
});

test('the screen of a tablet with Fully Kiosk: not dimmed until chosen', () => {
  expect(defaultWall().screen).toEqual({ rest: 'none', night: 'none' });
  expect(normalizeWall({ screen: { rest: 10, night: 'dim' } }).screen).toEqual({ rest: 10, night: 'dim' });
  // a screen that goes off is not there this time
  expect(normalizeWall({ screen: { rest: 33, night: 'off' } }).screen).toEqual({ rest: 'none', night: 'none' });
  // kept from before there was a screen
  expect(normalizeWall({ on: true }).screen).toEqual({ rest: 'none', night: 'none' });
});
