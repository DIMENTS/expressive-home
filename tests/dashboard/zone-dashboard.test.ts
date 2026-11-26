import { expect, test } from 'vitest';
import { generateDashboard } from '../../src/dashboard/generate';
import { NO_ROOM, type Section } from '../../src/dashboard/types';
import { toSnapshot } from '../../src/homey/map';
import type { Device, HomeySnapshot, Zone } from '../../src/homey/types';
import { createTranslate } from '../../src/i18n';
import { boardFromDashboard, boardFromLayout } from '../../src/layout/board';
import { readLayoutFile, writeLayoutFile } from '../../src/layout/file';
import { freezeOverview } from '../../src/layout/freeze';
import { reconcile } from '../../src/layout/reconcile';
import { OVERVIEW_ID, type HubLayout } from '../../src/layout/types';
import { houseRaw } from '../../src/mock/house';
import { normalizeHubLayout } from '../../src/storage/layout-normalize';
import { isLibraryIcon } from '../../src/ui/icons/library';
import { sectionCount, sectionTitle, shownSectionIcon, splitColumns } from '../../src/ui/model/layout';
import { cap, device, snapshot } from '../helpers/build';
import { covers, guards, media } from '../helpers/devices';
import { camperSnapshot } from '../helpers/fake-hub';
import { hubLayout, overview } from '../helpers/layout';

// The Overzicht with a section per room.

const [nl, en] = [createTranslate('nl'), createTranslate('en')];
const house = () => toSnapshot(houseRaw('nl'));
const perRoom = (s: HomeySnapshot) => generateDashboard(s, { grouping: 'zone', locale: 'nl' });
const zone = (id: string, name: string, partial: Partial<Zone> = {}): Zone => ({ id, name, parentId: null, ...partial });
const hub = (devices: Device[], zones: Zone[]): HomeySnapshot => ({ ...snapshot(devices), zones: Object.fromEntries(zones.map((z) => [z.id, z])) });
const lamp = (id: string, zoneId: string | null): Device => device({ id, name: id, zoneId, deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: true })] });

test('every room is a section, in the order of the rooms, and flows keep their own', () => {
  const board = perRoom(house());
  expect(board.hero).not.toBeNull();
  expect(board.sections.map((s) => [s.id, s.kind, sectionTitle(s, nl), shownSectionIcon(s), s.zone])).toEqual([
    ['own:zone:living', 'own', 'Woonkamer', 'weekend', 'living'], ['own:zone:kitchen', 'own', 'Keuken', 'countertops', 'kitchen'], ['own:zone:hall', 'own', 'Hal', 'door_front', 'hall'],
    ['own:zone:bedroom', 'own', 'Slaapkamer', 'bed', 'bedroom'], ['own:zone:study', 'own', 'Werkkamer', 'computer', 'study'], ['own:zone:bathroom', 'own', 'Badkamer', 'bathtub', 'bathroom'],
    ['own:zone:garage', 'own', 'Garage', 'garage', 'garage'], ['own:zone:garden', 'own', 'Tuin', 'yard', 'garden'], ['type:flows', 'flows', 'Flows', 'play_circle', undefined],
  ]);
  for (const section of board.sections) if (section.zone !== undefined) expect(isLibraryIcon(section.icon!)).toBe(true);
});

test('its tiles are those of the app: lamps first, narrow ones for a house, without what is in the hero', () => {
  const living = perRoom(house()).sections[0]!;
  expect(living.tiles.map((tile) => [tile.kind, tile.size])).toEqual([
    ['light', 'wide'], ['light', 'wide'], ['light', 'wide'], ['switch', 'single'], ['climate', 'single'], ['cover', 'single'], ['cover', 'single'], ['media', 'single'], ['media', 'single'], ['vacuum', 'single'], ['generic', 'single'],
  ]);
  const garage = perRoom(house()).sections.find((s) => s.zone === 'garage')!;
  expect(garage.tiles.some((tile) => tile.kind !== 'flow' && tile.kind !== 'widget' && ['garage-solar', 'garage-battery'].includes(tile.deviceId))).toBe(false);
});

test('devices without a room come last; a room whose devices are all in the hero is not there', () => {
  const solar = device({ id: 'sun', name: 'Zon', zoneId: 'roof', deviceClass: 'solarpanel', caps: [cap('measure_power', { units: 'W', value: 100 })] });
  const s = hub([lamp('a', 'z'), lamp('b', null), solar], [zone('z', 'Kamer'), zone('roof', 'Dak')]);
  const { sections } = perRoom(s);
  expect(sections.map((x) => [x.id, sectionTitle(x, nl), sectionTitle(x, en), x.zone])).toEqual([['own:zone:z', 'Kamer', 'Kamer', 'z'], ['own:zone:none', 'Zonder kamer', 'Without a room', NO_ROOM]]);
});

test('an id of a zone is safe in the id of a section', () => {
  const s = hub([lamp('a', 'a b/ç'), lamp('b', 'c')], [zone('a b/ç', 'Raar'), zone('c', 'Gewoon')]);
  const { sections } = perRoom(s);
  expect(sections.map((x) => x.id).sort()).toEqual(['own:zone:a_b__', 'own:zone:c']);
  for (const { id } of sections) expect(id).toMatch(/^[a-z]+:[a-z0-9:_-]+$/i);
});

test('every next room goes to the shortest column; alone there is one column', () => {
  const tiles = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'generic' as const, id: `g${i}`, deviceId: 'd', size: 'single' as const, capabilityId: null }));
  const room = (id: string, n: number): Section => ({ id: `own:zone:${id}`, kind: 'own', titleKey: 'section.own', zone: id, name: id, tiles: tiles(n) });
  const names = (sections: Section[], hero: boolean) => { const { left, right } = splitColumns(sections, hero); return [left.map((s) => s.name), right.map((s) => s.name)]; };
  // the left one has four tiles beside each other, the right one two
  expect(names([room('a', 4), room('b', 4), room('c', 4), room('d', 4)], false)).toEqual([['a', 'c'], ['b', 'd']]);
  // a hero stands on the left already
  expect(names([room('a', 2), room('b', 2), room('c', 2)], true)).toEqual([['c'], ['a', 'b']]);
  expect(splitColumns([room('a', 4)], false)).toMatchObject({ single: true, right: [] });
  // and the order of one column under the other is that of the rooms
  expect(names([room('a', 40), room('b', 2), room('c', 2), room('d', 2)], false)).toEqual([['a'], ['b', 'c', 'd']]);
});

test('per kind, music and curtains go where there is room; everything else stays where it was', () => {
  const columns = (s: HomeySnapshot) => { const board = generateDashboard(s, { grouping: 'type', locale: 'nl' }); const { left, right } = splitColumns(board.sections, board.hero !== null); return [left.map((x) => x.kind), right.map((x) => x.kind)]; };
  expect(columns(house())).toEqual([['lights', 'switches', 'covers', 'media', 'household', 'vehicles'], ['climate', 'security', 'other', 'flows']]);
  expect(columns(hub([lamp('a', null), covers.both, media.full, guards.lock], []))).toEqual([['lights', 'covers'], ['media', 'security']]);
  // the camper
  expect(columns(camperSnapshot())).toEqual([['lights', 'switches'], ['climate', 'water', 'security', 'other', 'flows']]);
});

test('freezing keeps the rooms as own sections that remember their room', () => {
  const s = house();
  const dashboard = perRoom(s);
  const { sections } = freezeOverview(dashboard, s);
  const living = sections.find((x) => x.id === 'own:zone:living')!;
  expect(living).toMatchObject({ kind: 'own', name: 'Woonkamer', icon: 'weekend', zone: 'living', hero: null });
  // what is drawn is what was drawn
  const before = boardFromDashboard(dashboard, OVERVIEW_ID);
  const after = boardFromLayout({ id: OVERVIEW_ID, name: null, icon: null, sections }, s, 'nl');
  const plain = (board: typeof before) => [board.left, board.right].map((column) => column.map((block) => (block.type === 'hero' ? 'hero' : [block.section.id, sectionTitle(block.section, nl), shownSectionIcon(block.section), block.section.zone, block.section.tiles.map((tile) => [tile.id, tile.kind, tile.size])])));
  expect(plain(after)).toEqual(plain(before));
  // the name is its own from now on
  const renamed = { ...s, zones: { ...s.zones, living: { ...s.zones['living']!, name: 'Zitkamer' } } };
  expect(boardFromLayout({ id: OVERVIEW_ID, name: null, icon: null, sections }, renamed, 'nl').left.concat(boardFromLayout({ id: OVERVIEW_ID, name: null, icon: null, sections }, renamed, 'nl').right).flatMap((b) => (b.type === 'section' && b.section.zone === 'living' ? [sectionTitle(b.section, nl)] : []))).toEqual(['Woonkamer']);
});

test('the section without a room keeps its name in the language of the app', () => {
  const s = hub([lamp('a', 'z'), lamp('b', null)], [zone('z', 'Kamer')]);
  const { sections } = freezeOverview(perRoom(s), s);
  const board = boardFromLayout({ id: OVERVIEW_ID, name: null, icon: null, sections }, s, 'nl');
  const none = [...board.left, ...board.right].flatMap((b) => (b.type === 'section' && b.section.zone === NO_ROOM ? [b.section] : []))[0]!;
  expect([sectionTitle(none, nl), sectionTitle(none, en)]).toEqual(['Zonder kamer', 'Without a room']);
});

test('what is stored: per room, the rooms hidden, and the room of a section; anything else is as it was', () => {
  const s = house();
  const layout: HubLayout = { ...hubLayout([overview(freezeOverview(perRoom(s), s).sections)]), grouping: 'zone', rooms: false };
  expect(normalizeHubLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
  const before = hubLayout([overview(null)]);
  expect(Object.keys(normalizeHubLayout(JSON.parse(JSON.stringify(before)))!).sort()).toEqual(['dashboards', 'known', 'names']);
  const odd = normalizeHubLayout({ ...JSON.parse(JSON.stringify(layout)), grouping: 'colour', rooms: 'no' })!;
  expect([odd.grouping, odd.rooms]).toEqual([undefined, undefined]);
  const dirty = JSON.parse(JSON.stringify(layout)) as { dashboards: { sections: { zone: unknown }[] }[] };
  dirty.dashboards[0]!.sections[1]!.zone = 7;
  expect(normalizeHubLayout(dirty)!.dashboards[0]!.sections![1]!.zone).toBeUndefined();
});

test('a file takes it along, and one of before says nothing about it', () => {
  const layout: HubLayout = { ...hubLayout([overview(null)]), grouping: 'zone', rooms: false };
  const theme = { seed: '#3b6939', mode: 'light', density: 'comfortable' } as const;
  const file = readLayoutFile(writeLayoutFile({ homeyId: 'h', theme, sectionSeeds: {}, layout }, new Date()))!;
  expect([file.grouping, file.rooms]).toEqual(['zone', false]);
  const plain = readLayoutFile(writeLayoutFile({ homeyId: 'h', theme, sectionSeeds: {}, layout: hubLayout([overview(null)]) }, new Date()))!;
  expect([plain.grouping, plain.rooms]).toEqual([undefined, undefined]);
});

test('reconciling keeps the choice, and something new is suggested for the section of its room', () => {
  const s = house();
  const { sections, known } = freezeOverview(perRoom(s), s);
  const layout: HubLayout = { ...hubLayout([overview(sections)], { known }), grouping: 'zone' };
  const fresh = { ...s, devices: { ...s.devices, x: { ...lamp('x', 'kitchen'), name: 'Nieuwe lamp' }, y: { ...lamp('y', 'home'), name: 'Zonder sectie' } } };
  const result = reconcile(layout, fresh, 'nl');
  expect(result.layout.grouping).toBe('zone');
  expect(result.news.map((n) => [n.name, n.suggest, n.room])).toEqual([['Nieuwe lamp', 'lights', { sectionId: 'own:zone:kitchen', name: 'Keuken' }], ['Zonder sectie', 'lights', undefined]]);
  // a section the owner named: that name
  const named = reconcile({ ...layout, dashboards: [{ ...layout.dashboards[0]!, sections: sections.map((x) => (x.zone === 'kitchen' ? { ...x, name: 'Kookhoek' } : x)) }] }, fresh, 'nl');
  expect(named.news[0]!.room).toEqual({ sectionId: 'own:zone:kitchen', name: 'Kookhoek' });
});

test('the head of a room says its temperature, otherwise what is on', () => {
  const s = house();
  const of = (id: string) => perRoom(s).sections.find((x) => x.zone === id)!;
  const inZone = (id: string) => Object.values(s.devices).filter((d) => d.zoneId === id);
  const count = (id: string) => sectionCount(of(id), (device_) => s.devices[device_], nl, inZone(id));
  expect([count('living'), count('kitchen'), count('study'), count('hall'), count('garage')]).toEqual(['20,8°', '1 aan', '23,8°', 'Alles uit', '']);
});
