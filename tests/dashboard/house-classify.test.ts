import { expect, test } from 'vitest';
import { sectionFor, tilesFor } from '../../src/dashboard/classify';
import { generateDashboard } from '../../src/dashboard/generate';
import { SECTION_ORDER, type DeviceTileSpec, type TileSpec } from '../../src/dashboard/types';
import { drawnTile } from '../../src/layout/board';
import { adaptTile, followDevice, tileForValue } from '../../src/layout/tiles';
import { normalizeHubLayout } from '../../src/storage/layout-normalize';
import type { Device } from '../../src/homey/types';
import { cap, device, snapshot } from '../helpers/build';
import { covers, guards, heating, media } from '../helpers/devices';
import { hubLayout, overview, ownSection, tileLayout } from '../helpers/layout';

const kinds = (d: Device) => tilesFor(d).map((tile) => tile.kind);

test.each<[Device, string, string]>([
  [heating.valveBlind, 'climate', 'climate'], [heating.ownMode, 'climate', 'climate'], [heating.zones, 'climate', 'climate'], [heating.airco, 'climate', 'climate'], [heating.childLock, 'climate', 'climate'],
  [covers.setOnly, 'cover', 'covers'], [covers.stateOnly, 'cover', 'covers'], [covers.awning, 'cover', 'covers'], [covers.withSwitch, 'cover', 'covers'], [covers.closedOnly, 'cover', 'covers'],
  [guards.lock, 'guard', 'security'], [guards.custom, 'guard', 'security'], [guards.asSensor, 'guard', 'security'], [guards.readOnly, 'guard', 'security'], [guards.garage, 'guard', 'security'], [guards.garageBusy, 'guard', 'security'],
  [guards.garageAsCover, 'guard', 'security'], [guards.alarm, 'guard', 'security'], [guards.alarmAsSensor, 'guard', 'security'],
  [media.full, 'media', 'media'], [media.bare, 'media', 'media'], [media.loudOnly, 'media', 'media'], [media.tv, 'media', 'media'], [media.tvButtons, 'media', 'media'], [media.receiver, 'media', 'media'],
])('%# a device of a house gets one tile of its kind', (d, kind, section) => {
  expect([d.name, tilesFor(d), sectionFor(d)]).toEqual([d.name, [{ kind, id: `${d.id}:${kind}`, deviceId: d.id, size: 'single' }], section]);
});

test('what only looks like it keeps its own tile', () => {
  expect([kinds(media.plugAsTv), sectionFor(media.plugAsTv)]).toEqual([['switch'], 'media']);
  expect([kinds(covers.tiltOnly), sectionFor(covers.tiltOnly)]).toEqual([['sensor'], 'covers']);
  expect([kinds(heating.fridge), sectionFor(heating.fridge)]).toEqual([['sensor', 'sensor'], 'climate']);
  expect([kinds(heating.gateway), kinds(guards.car)]).toEqual([['sensor', 'sensor'], ['generic']]);
  // a lamp and a plug stay what they are, whatever else they can
  const lamp = device({ id: 'l', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('dim', { setable: true, min: 0, max: 1 }), cap('speaker_playing', { type: 'boolean', setable: true })] });
  const plug = device({ id: 'p', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('target_temperature', { setable: true }), cap('locked', { type: 'boolean', setable: true })] });
  expect([kinds(lamp), kinds(plug)]).toEqual([['light'], ['switch']]);
});

test('nothing of a lock or a garage door is a switch or a button', () => {
  const opener = device({ id: 'o', deviceClass: 'lock', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('button', { type: 'boolean', setable: true, getable: false })] });
  const gate = device({ id: 'g', deviceClass: 'garagedoor', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] });
  const push = device({ id: 'b', deviceClass: 'garagedoor', caps: [cap('button', { type: 'boolean', setable: true, getable: false })] });
  for (const d of [opener, gate, push]) expect([kinds(d), sectionFor(d)]).toEqual([['generic'], 'security']);
});

test('the sections stand in their order', () => {
  expect(SECTION_ORDER).toEqual(['lights', 'switches', 'climate', 'covers', 'media', 'water', 'security', 'other', 'flows']);
  const board = generateDashboard(snapshot([guards.lock, media.full, covers.both, heating.zone]), { grouping: 'type' });
  expect(board.sections.map((section) => [section.id, section.titleKey, section.tiles.length])).toEqual([
    ['type:climate', 'section.climate', 1], ['type:covers', 'section.covers', 1], ['type:media', 'section.media', 1], ['type:security', 'section.security', 1],
  ]);
});

test('a tile follows its device, and falls back when the device is something else now', () => {
  const spec: DeviceTileSpec = { kind: 'climate', id: 't', deviceId: 'zone', size: 'wide', label: 'Boven', icon: 'cabin' };
  expect(adaptTile(spec, heating.zone)).toBe(spec);
  expect(adaptTile(spec, { ...covers.both, id: 'zone' })).toMatchObject({ kind: 'cover', id: 't', size: 'wide', label: 'Boven' });
  for (const [kind, d] of [['cover', covers.both], ['media', media.full], ['guard', guards.lock]] as const) {
    const own: DeviceTileSpec = { kind, id: 't', deviceId: d.id, size: 'single' };
    expect(adaptTile(own, d)).toBe(own);
    expect(adaptTile(own, device({ id: d.id })).kind).toBe('generic');
  }
});

test('one value of a lock, a garage door or an alarm is never a switch or a button', () => {
  for (const [d, id] of [[guards.lock, 'locked'], [guards.withLatch, 'open'], [guards.garage, 'garagedoor_closed'], [guards.garageBusy, 'onoff'], [guards.alarm, 'homealarm_state'], [heating.childLock, 'locked']] as const) {
    expect([d.id, id, tileForValue(d, id, 't')]).toEqual([d.id, id, { kind: 'generic', id: 't', deviceId: d.id, size: 'single', capabilityId: id }]);
  }
  expect(tileForValue(media.tv, 'onoff', 't')?.kind).toBe('switch');
});

test('a switch or a button that was stored for it is one that opens the window from now on', () => {
  const stored = (spec: TileSpec, source: 'device' | 'value') => ({ ...tileLayout(spec), source });
  const locked: TileSpec = { kind: 'switch', id: 't', deviceId: 'lock', size: 'wide', onoffCapabilityId: 'locked', detailCapabilityId: null };
  const open: TileSpec = { kind: 'button', id: 't', deviceId: 'latch', size: 'single', capabilityId: 'open' };
  expect(followDevice(stored(locked, 'value'), guards.lock)).toMatchObject({ kind: 'generic', capabilityId: 'locked' });
  expect(followDevice(stored(open, 'value'), guards.withLatch)).toMatchObject({ kind: 'generic', capabilityId: 'open' });
  // and made from the device: the tile the app would choose
  expect(followDevice(stored(locked, 'device'), guards.lock)).toMatchObject({ kind: 'guard', id: 't', size: 'wide' });
  // what is no danger stays
  expect(followDevice(stored({ kind: 'switch', id: 't', deviceId: 'tv', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: null }, 'device'), media.tv)).toMatchObject({ kind: 'switch' });
});

test('the new kinds and sections are kept, with nothing else in them', () => {
  const tiles = (['climate', 'cover', 'media', 'guard'] as const).map((kind, i) => tileLayout({ kind, id: `t${i}`, deviceId: `d${i}`, size: i % 2 ? 'wide' : 'single' }));
  const layout = hubLayout([overview([{ ...ownSection('type:covers', tiles.slice(0, 2)), kind: 'covers' }, { ...ownSection('type:media', tiles.slice(2)), kind: 'media' }])]);
  expect(normalizeHubLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  const dirty = JSON.parse(JSON.stringify(layout)) as { dashboards: { sections: { tiles: { spec: Record<string, unknown> }[] }[] }[] };
  dirty.dashboards[0]!.sections[0]!.tiles[0]!.spec['extra'] = 'x';
  expect(normalizeHubLayout(dirty)).toEqual(layout);
});

test('a kind that this version does not know is not drawn and breaks nothing', () => {
  const tile = tileLayout({ kind: 'hologram', id: 't', deviceId: 'lock', size: 'single' } as unknown as TileSpec);
  expect(drawnTile(tile, snapshot([guards.lock]))).toBeNull();
});
