import { expect, test } from 'vitest';
import { climateOf, climateState, clampTarget, targetStep } from '../../src/controls/climate';
import { coverOf, coverState } from '../../src/controls/cover';
import { isDangerous, isGuarded } from '../../src/controls/danger';
import { find } from '../../src/controls/find';
import { guardOf, guardState } from '../../src/controls/guard';
import { mediaOf, mediaState } from '../../src/controls/media';
import type { Device } from '../../src/homey/types';
import { cap, device } from '../helpers/build';
import { covers, guards, heating, media } from '../helpers/devices';

const ids = (found: object | null): Record<string, unknown> | null => found && Object.fromEntries(Object.entries(found)
  .filter(([, value]) => value !== null && value !== undefined && value !== false).map(([key, value]) => [key, typeof value === 'object' ? (value as { id: string }).id : value]));
const withValue = (d: Device, id: string, value: unknown): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never } } });

test('the plain capability goes first, then one that can be set, then the first derived one', () => {
  const d = device({ caps: [cap('locked.a', { type: 'boolean' }), cap('locked.b', { type: 'boolean', setable: true }), cap('locked', { type: 'boolean' })] });
  expect(find(d, 'locked')?.id).toBe('locked');
  expect(find(d, 'locked', { setable: true })?.id).toBe('locked.b');
  expect(find(device({ caps: [cap('locked.a', { type: 'boolean' }), cap('locked.b', { type: 'boolean', setable: true })] }), 'locked')?.id).toBe('locked.b');
  expect(find(d, 'locked', { type: 'number' })).toBeUndefined();
  expect(find(device({}), 'locked')).toBeUndefined();
});

// ----- heating and cooling -----

test.each([
  ['valveBlind', { target: 'target_temperature' }],
  ['zone', { target: 'target_temperature', measure: 'measure_temperature' }],
  ['ownMode', { target: 'target_temperature', measure: 'measure_temperature' }],
  ['tenths', { target: 'target_temperature', measure: 'measure_temperature', mode: 'thermostat_mode' }],
  ['zones', { target: 'target_temperature', measure: 'measure_temperature', mode: 'thermostat_mode', onoff: 'onoff' }],
  ['airco', { target: 'target_temperature', measure: 'measure_temperature', mode: 'thermostat_mode', humidity: 'measure_humidity' }],
  ['modeReadOnly', { target: 'target_temperature', measure: 'measure_temperature', mode: 'thermostat_mode', onoff: 'onoff' }],
  ['infrared', { target: 'target_temperature', mode: 'thermostat_mode', onoff: 'onoff' }],
  ['childLock', { target: 'target_temperature', measure: 'measure_temperature' }],
] as const)('climate: %s', (name, expected) => {
  expect(ids(climateOf(heating[name]))).toEqual(expected);
});

test.each(['gateway', 'fridge', 'asText'] as const)('no climate: %s', (name) => {
  expect(climateOf(heating[name])).toBeNull();
});

test('a part of a target is enough for a class of heating', () => {
  expect(climateOf({ ...heating.gateway, deviceClass: 'thermostat' })?.target.id).toBe('target_temperature.room');
  for (const deviceClass of ['light', 'socket', 'oven', 'freezer', 'kettle']) expect([deviceClass, climateOf({ ...heating.zone, deviceClass })]).toEqual([deviceClass, null]);
});

test.each([
  ['valveBlind', { off: false, active: true, target: 19, measure: null }],
  ['zone', { off: false, active: false, target: 18, measure: 18.2 }],
  ['ownMode', { off: false, active: true, target: 21, measure: 20.5 }],
  ['tenths', { off: false, active: true, target: 20, measure: 19.4 }],
  // a mode nobody knows: it warms up, and it can cool
  ['oddModes', { off: false, active: true, target: 23, measure: 22 }],
  ['sauna', { off: true, active: false, target: 80, measure: 21 }],
  ['zones', { off: false, active: true, target: 20.5, measure: 20 }],
  ['airco', { off: false, active: true, target: 22, measure: 24.1 }],
  ['modeReadOnly', { off: true, active: false, target: 21, measure: 23 }],
  ['infrared', { off: null, active: false, target: 20, measure: null }],
] as const)('what climate says: %s', (name, expected) => {
  expect(climateState(climateOf(heating[name])!)).toEqual(expected);
});

test('heating counts up, cooling down, automatic both when it can cool', () => {
  const at = (d: Device, measure: number, mode?: string) => climateState(climateOf(mode === undefined ? withValue(d, 'measure_temperature', measure) : withValue(withValue(d, 'measure_temperature', measure), 'thermostat_mode', mode))!).active;
  expect([at(heating.ownMode, 20.8), at(heating.ownMode, 20.9), at(heating.ownMode, 23)]).toEqual([true, false, false]);
  expect([at(heating.airco, 22.2, 'cool'), at(heating.airco, 22.1, 'cool'), at(heating.airco, 20, 'cool')]).toEqual([true, false, false]);
  expect([at(heating.airco, 25, 'auto'), at(heating.airco, 19, 'auto'), at(heating.airco, 22, 'auto')]).toEqual([true, true, false]);
  expect([at(heating.tenths, 25, 'auto'), at(heating.tenths, 19, 'auto')]).toEqual([false, true]);
  expect([at(heating.airco, 19, 'OFF'), at(heating.airco, 25, 'Off')]).toEqual([false, false]);
});

test('a step is that of the app, but at least half a degree; a target stays within what the app allows', () => {
  expect((['valveBlind', 'zone', 'tenths', 'sauna', 'airco'] as const).map((name) => targetStep(climateOf(heating[name])!.target))).toEqual([0.5, 0.5, 0.5, 1, 1]);
  const { target } = climateOf(heating.valveBlind)!;
  expect([clampTarget(target, 2), clampTarget(target, 99), clampTarget(target, 19.3), clampTarget(target, 19.25)]).toEqual([4, 28, 19.5, 19.5]);
  // no range of its own: what Homey gives
  expect([clampTarget(climateOf(heating.zone)!.target, 2), clampTarget(climateOf(heating.zone)!.target, 99)]).toEqual([4, 35]);
  // a step of the range that does not fit exactly: never outside it
  expect(clampTarget(cap('target_temperature', { min: 5, max: 30.2, step: 0.5, setable: true }), 31)).toBe(30);
});

// ----- curtains -----

test.each([
  ['setOnly', { set: 'windowcoverings_set' }], ['stateOnly', { state: 'windowcoverings_state' }],
  ['both', { set: 'windowcoverings_set', state: 'windowcoverings_state', tilt: 'windowcoverings_tilt_set' }],
  ['closedOnly', { closed: 'windowcoverings_closed' }], ['hundred', { set: 'windowcoverings_set' }],
  ['awning', { set: 'windowcoverings_set', state: 'windowcoverings_state', awning: true }],
  ['twoMotors', { set: 'windowcoverings_set.top', state: 'windowcoverings_state' }],
  ['withSwitch', { set: 'windowcoverings_set', state: 'windowcoverings_state' }],
] as const)('cover: %s', (name, expected) => {
  expect(ids(coverOf(covers[name]))).toEqual(expected);
});

test('only lamellae are no cover, and neither is a garage door', () => {
  expect([coverOf(covers.tiltOnly), coverOf(guards.garageAsCover), coverOf(guards.garageBusy)]).toEqual([null, null, null]);
});

test.each([
  ['setOnly', { part: 0.6, moving: null }], ['stateOnly', { part: null, moving: null }], ['both', { part: 0.25, moving: 'down' }],
  ['noState', { part: null, moving: null }], ['closedOnly', { part: 0, moving: null }], ['hundred', { part: 0.4, moving: null }],
  // an awning counts how far it is out
  ['awning', { part: 0, moving: null }], ['withSwitch', { part: 1, moving: null }],
] as const)('where a cover is: %s', (name, expected) => {
  expect(coverState(coverOf(covers[name])!)).toEqual(expected);
});

test('a cover moves until it is where it goes', () => {
  const moving = (state: string, set: number | null) => coverState(coverOf(withValue(withValue(covers.both, 'windowcoverings_state', state), 'windowcoverings_set', set))!);
  expect([moving('up', 0.5), moving('up', 1), moving('down', 0.5), moving('down', 0), moving('idle', 0.5), moving('odd', 0.5)]).toEqual([
    { part: 0.5, moving: 'up' }, { part: 1, moving: null }, { part: 0.5, moving: 'down' }, { part: 0, moving: null }, { part: 0.5, moving: null }, { part: 0.5, moving: null },
  ]);
  const out = (state: string, set: number) => coverState(coverOf(withValue(withValue(covers.awning, 'windowcoverings_state', state), 'windowcoverings_set', set))!);
  expect([out('down', 0.6), out('up', 0.6), out('idle', 0)]).toEqual([{ part: 0.4, moving: 'down' }, { part: 0.4, moving: 'up' }, { part: 1, moving: null }]);
});

// ----- locks, doors and alarms -----

test.each([
  ['lock', 'lock', 'locked', true], ['custom', 'lock', 'locked.custom', true], ['withLatch', 'lock', 'locked', true], ['asSensor', 'lock', 'locked', true], ['readOnly', 'lock', 'locked', false],
  ['garage', 'door', 'garagedoor_closed', true], ['garageBusy', 'door', 'garagedoor_closed', true], ['garageAsCover', 'door', 'windowcoverings_set', true],
  ['alarm', 'alarm', 'homealarm_state', true], ['alarmAsSensor', 'alarm', 'homealarm_state', true],
] as const)('guard: %s', (name, kind, id, canSet) => {
  const guard = guardOf(guards[name])!;
  expect([guard.kind, guard.cap.id, guard.canSet]).toEqual([kind, id, canSet]);
});

test('a car, a child lock and a curtain are no guard', () => {
  expect([guardOf(guards.car), guardOf(heating.childLock), guardOf(covers.both), guardOf({ ...guards.car, deviceClass: 'evcharger' })]).toEqual([null, null, null, null]);
});

test.each([
  ['lock', 'locked'], ['custom', 'unlocked'], ['garage', 'closed'], ['garageAsCover', 'closed'], ['alarm', 'disarmed'], ['alarmAsSensor', 'armed'],
] as const)('what a guard says: %s', (name, state) => {
  expect(guardState(guardOf(guards[name])!)).toBe(state);
});

test('what a guard does not know it does not say', () => {
  const said = (d: Device, id: string, value: unknown) => guardState(guardOf(withValue(d, id, value))!);
  expect([said(guards.lock, 'locked', null), said(guards.alarm, 'homealarm_state', 'sos'), said(guards.garage, 'garagedoor_closed', false), said(guards.garageAsCover, 'windowcoverings_set', 0.3), said(guards.garageAsCover, 'windowcoverings_set', null)])
    .toEqual([null, null, 'open', 'open', null]);
});

// ----- music and television -----

test.each([
  ['full', { playing: 'speaker_playing', next: 'speaker_next', prev: 'speaker_prev', shuffle: 'speaker_shuffle', repeat: 'speaker_repeat', track: 'speaker_track', artist: 'speaker_artist', album: 'speaker_album', position: 'speaker_position', duration: 'speaker_duration', volume: 'volume_set', mute: 'volume_mute' }],
  ['loudOnly', { onoff: 'onoff', volume: 'volume_set', up: 'volume_up', down: 'volume_down', mute: 'volume_mute' }],
  ['tvButtons', { onoff: 'onoff', up: 'volume_up', down: 'volume_down', mute: 'volume_mute', channelUp: 'channel_up', channelDown: 'channel_down' }],
  ['tvNoPower', { playing: 'speaker_playing', volume: 'volume_set', mute: 'volume_mute' }],
  ['receiver', { onoff: 'onoff', volume: 'volume_set', up: 'volume_up', down: 'volume_down', mute: 'volume_mute' }],
] as const)('media: %s', (name, expected) => {
  expect(ids(mediaOf(media[name]))).toEqual(expected);
});

test('what can only be on or off is no media, and neither is a lamp with a volume', () => {
  expect([mediaOf(media.plugAsTv), mediaOf({ ...media.receiver, deviceClass: 'light' }), mediaOf({ ...media.receiver, deviceClass: 'socket' })]).toEqual([null, null, null]);
});

test.each([
  ['full', { on: true, playing: true, title: 'Nummer', artist: 'Artiest', volume: 0.32, muted: false }],
  ['bare', { on: false, playing: false, title: '', artist: '', volume: 0.1, muted: false }],
  ['loudOnly', { on: true, playing: null, title: '', artist: '', volume: 0.2, muted: false }],
  ['tv', { on: true, playing: null, title: '', artist: '', volume: 0.18, muted: false }],
  ['tvButtons', { on: false, playing: null, title: '', artist: '', volume: null, muted: null }],
  ['tvInfrared', { on: null, playing: null, title: '', artist: '', volume: null, muted: null }],
] as const)('what media says: %s', (name, expected) => {
  expect(mediaState(mediaOf(media[name])!)).toEqual(expected);
});

test('what is off does not play', () => {
  const off = device({ deviceClass: 'speaker', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('speaker_playing', { type: 'boolean', setable: true, value: true }), cap('speaker_track', { type: 'string', value: '  Nummer  ' })] });
  expect(mediaState(mediaOf(off)!)).toMatchObject({ on: false, playing: false, title: 'Nummer' });
});

// ----- danger -----

test.each<[Device, string, unknown, boolean]>([
  [guards.lock, 'locked', false, true], [guards.lock, 'locked', true, false], [guards.custom, 'locked.custom', false, true], [guards.custom, 'lock_unlock_open', 'open', true],
  [guards.withLatch, 'open', true, true], [guards.asSensor, 'locked', false, true],
  [guards.lockMode, 'lock_mode', 'always_locked', false], [guards.lockMode, 'lock_mode', 'always_unlocked', true], [guards.lockMode, 'lock_mode', 'locked_until_unlock', true],
  [guards.garage, 'garagedoor_closed', false, true], [guards.garage, 'garagedoor_closed', true, false],
  [guards.garageBusy, 'onoff', true, true], [guards.garageBusy, 'onoff', false, true], [guards.garageBusy, 'windowcoverings_set', 0, true], [guards.garageBusy, 'button.re_sync', true, true],
  [guards.garageAsCover, 'windowcoverings_state', 'up', true], [guards.garageAsCover, 'windowcoverings_state', 'down', true],
  [guards.car, 'locked', false, true], [heating.childLock, 'locked', false, true],
  [covers.both, 'windowcoverings_state', 'up', false], [covers.withSwitch, 'onoff', true, false], [media.full, 'speaker_playing', true, false], [heating.zone, 'target_temperature', 35, false],
])('danger: %# ', (d, id, value, expected) => {
  expect([d.id, id, value, isDangerous(d, id, value as never)]).toEqual([d.id, id, value, expected]);
});

test('an alarm that does less than it did is dangerous, one that does more is not', () => {
  const at = (from: string | null, to: string) => isDangerous(withValue(guards.alarm, 'homealarm_state', from), 'homealarm_state', to);
  expect([at('armed', 'partially_armed'), at('armed', 'disarmed'), at('partially_armed', 'disarmed'), at('disarmed', 'armed'), at('disarmed', 'partially_armed'), at('partially_armed', 'armed'), at('armed', 'armed')])
    .toEqual([true, true, true, false, false, false, false]);
  // not known what it does now: only all of it is safe
  expect([at(null, 'armed'), at(null, 'partially_armed'), at('sos', 'disarmed'), at('armed', 'sos')]).toEqual([false, true, true, true]);
});

test('what is guarded asks, whichever way it goes', () => {
  const guarded = (d: Device) => d.capabilityOrder.filter((id) => isGuarded(d, id));
  expect([guarded(guards.lock), guarded(guards.custom), guarded(guards.withLatch), guarded(guards.garageBusy), guarded(guards.alarm), guarded(guards.lockMode), guarded(heating.childLock), guarded(covers.both), guarded(guards.readOnly)]).toEqual([
    ['locked'], ['locked.custom', 'lock_unlock_open'], ['locked', 'open'], ['garagedoor_closed', 'onoff', 'onoff.light', 'windowcoverings_set', 'locked.remote', 'button.re_sync'], ['homealarm_state'], ['locked', 'lock_mode'], ['locked'], [], [],
  ]);
  expect([isGuarded(guards.lock, 'nothing'), isDangerous(guards.lock, 'nothing', true)]).toEqual([false, false]);
});
