import { expect, test } from 'vitest';
import { generateDashboard } from '../../src/dashboard/generate';
import { heroDeviceIds, pickHero } from '../../src/dashboard/hero';
import { boardFromDashboard, boardFromLayout, heroFromChoice, shownColumns, type Block, type BoardView } from '../../src/layout/board';
import { freezeOverview } from '../../src/layout/freeze';
import { defaultHubLayout, type HeroChoice } from '../../src/layout/types';
import { createTranslate, t } from '../../src/i18n';
import { heroView } from '../../src/ui/model/hero-view';
import { climate, dimLamp, plug, tank } from '../dashboard/samples';
import { cap, device, snapshot } from '../helpers/build';
import { camper } from '../helpers/camper';
import { board, flowTile, heroSection, overview, ownSection, sensorTile, tileLayout } from '../helpers/layout';

const ids = (blocks: Block[]) => blocks.map((b) => (b.type === 'hero' ? b.id : b.section.id));
const section = (view: BoardView, id: string) => {
  const block = [...view.left, ...view.right].find((b) => b.type === 'section' && b.section.id === id);
  if (block?.type !== 'section') throw new Error(`no section ${id}`);
  return block.section;
};
const hub = (...devices: Parameters<typeof snapshot>[0]) => snapshot(devices, { scopes: ['homey'] });
const ref = (deviceId: string, capabilityId: string) => ({ deviceId, capabilityId });

test('the automatic camper board has the hero and three sections left, the rest right', () => {
  const view = boardFromDashboard(camper().dashboard, 'overview');
  expect(view.id).toBe('overview');
  expect(ids(view.left)).toEqual(['hero:main', 'type:lights', 'type:switches']);
  expect(ids(view.right)).toEqual(['type:climate', 'type:water', 'type:security', 'type:other', 'type:flows']);
});

test('freezing the camper gives the same board as the automatic one', () => {
  const { dashboard, snapshot: camperHub } = camper();
  const frozen = boardFromLayout(overview(freezeOverview(dashboard, camperHub).sections), camperHub, 'nl');
  const plain = (view: BoardView) => JSON.parse(JSON.stringify(view, (key, value) => ((key === 'label' || key === 'icon' || key === 'name') && value === null ? undefined : value)));
  expect(plain(frozen)).toEqual(plain(boardFromDashboard(dashboard, 'overview')));
});

test('a board with one empty column puts everything in one column as in 1B', () => {
  const automatic = boardFromDashboard(generateDashboard(snapshot([dimLamp, plug]), { grouping: 'type' }), 'overview');
  expect([ids(automatic.left), ids(automatic.right)]).toEqual([['type:lights', 'type:switches'], []]);
  const own = boardFromLayout(board('d-1', [ownSection('own:a', [], { column: 'right' }), ownSection('own:b', [], { column: 'right' })]), hub(), 'nl');
  expect(shownColumns(own, false)).toEqual({ left: own.right, right: [] });
  // while editing both columns are there, so there is a place to drag to
  expect(shownColumns(own, true)).toEqual({ left: [], right: own.right });
});

test('a hero with nothing to show takes no place outside the edit mode', () => {
  const view = boardFromLayout(board('d-1', [heroSection('hero:d-1'), ownSection('own:a', [], { column: 'right' })]), hub(dimLamp), 'nl');
  expect(ids(shownColumns(view, false).left)).toEqual(['own:a']);
  expect(ids(shownColumns(view, true).left)).toEqual(['hero:d-1']);
});

test('an own board keeps its columns and order, the hero anywhere', () => {
  const { snapshot: camperHub } = camper();
  const view = boardFromLayout(overview([
    ownSection('own:b', [], { column: 'right' }), ownSection('own:a'), heroSection('hero:main', null, 'right'), ownSection('own:c'),
  ]), camperHub, 'nl');
  expect([ids(view.left), ids(view.right)]).toEqual([['own:a', 'own:c'], ['own:b', 'hero:main']]);
});

test('a tile of a gone device, flow or value is left out', () => {
  const flows = [{ id: 'f1', name: 'Uit', kind: 'flow', startable: true } as const];
  const view = boardFromLayout(board('d-1', [ownSection('own:a', [
    sensorTile('t-1', 's1'), sensorTile('t-2', 'gone'), flowTile('t-3', 'f1'), flowTile('t-4', 'f9'),
    sensorTile('t-5', 's1', 'measure_humidity', { source: 'value' }), sensorTile('t-6', 's1', 'measure_co2', { source: 'value' }),
  ])]), snapshot([climate], { flows: [...flows] }), 'nl');
  expect(section(view, 'own:a').tiles.map((tile) => tile.id)).toEqual(['t-1', 't-3', 't-5']);
});

test('a device tile follows its device, under the id and size of the layout', () => {
  const lamp = tileLayout({ kind: 'light', id: 'x', deviceId: 'l1', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim.white' }, { id: 't-1', size: 'single' });
  const view = boardFromLayout(board('d-1', [ownSection('own:a', [lamp])]), hub(dimLamp), 'nl');
  expect(section(view, 'own:a').tiles[0]).toMatchObject({ kind: 'light', id: 't-1', size: 'single', dimCapabilityId: 'dim' });
});

test('an own name and icon reach the tile spec and the section', () => {
  const view = boardFromLayout(board('d-1', [ownSection('own:a', [sensorTile('t-1', 's1', 'measure_temperature', { label: 'Binnen', icon: 'cabin' })], { name: 'Buiten', icon: 'park' })]), hub(climate), 'nl');
  expect(section(view, 'own:a')).toMatchObject({ name: 'Buiten', icon: 'park', kind: 'own' });
  expect(section(view, 'own:a').tiles[0]).toMatchObject({ label: 'Binnen', icon: 'cabin' });
});

test('an own section without a name is called "Nieuwe sectie"', () => {
  const view = boardFromLayout(board('d-1', [ownSection('own:a', [], { name: null })]), hub(), 'nl');
  expect(section(view, 'own:a')).toMatchObject({ name: null, titleKey: 'section.own' });
  expect(t('section.own')).toBe('Nieuwe sectie');
  expect(createTranslate('en')('section.own')).toBe('New section');
});

test('an automatic hero on an own board is the same as on the automatic overview', () => {
  const { snapshot: camperHub, dashboard } = camper();
  const view = boardFromLayout(board('d-1', [heroSection('hero:d-1')]), camperHub, 'nl');
  expect(view.left).toEqual([{ type: 'hero', id: 'hero:d-1', hero: dashboard.hero }]);
});

const water = device({ id: 'w', name: 'Schoon water', caps: [cap('tank_level', { title: 'Niveau', units: '%', value: 64 }), cap('measure_content_volume', { title: 'Inhoud', units: 'L', value: 58 })] });
const grey = device({ id: 'g', name: 'Grijs water', caps: [cap('tank_level', { title: 'Niveau', units: '%', value: 31 })] });
const pump = device({ id: 'p', name: 'Waterpomp', deviceClass: 'socket', caps: [cap('onoff', { title: 'Aan', type: 'boolean', setable: true, value: true })] });
const TANK_HERO: HeroChoice = { main: ref('w', 'tank_level'), line: ref('w', 'measure_content_volume'), stats: [ref('g', 'tank_level'), ref('p', 'onoff'), ref('w', 'measure_content_volume')], name: null };

test('an own hero shows the clean-water level with the wave and its own stats', () => {
  const camperHub = hub(water, grey, pump);
  const hero = heroFromChoice(TANK_HERO, camperHub, 'nl')!;
  expect(hero).toMatchObject({ kind: 'own', primary: ref('w', 'tank_level'), line: ref('w', 'measure_content_volume') });
  expect(heroDeviceIds(hero).sort()).toEqual(['g', 'p', 'w']);
  const view = heroView(hero, (id) => camperHub.devices[id], t);
  expect(view).toMatchObject({ title: 'Schoon water', icon: 'water_drop', number: { text: '64', unit: '%' }, line: '58 L', progress: 64, primaryDeviceId: 'w' });
  expect(view.stats).toEqual([
    { role: 'value', icon: 'water_drop', value: '31%', label: 'Grijs water', deviceId: 'g' },
    { role: 'value', icon: 'toggle_on', value: 'Aan', label: 'Waterpomp', deviceId: 'p' },
    { role: 'value', icon: 'water_drop', value: '58 L', label: 'Inhoud', deviceId: 'w' },
  ]);
});

test('an own name for the hero goes before the device of the big number', () => {
  const hero = heroFromChoice({ ...TANK_HERO, name: 'Water' }, hub(water, grey, pump), 'nl')!;
  expect(heroView(hero, (id) => hub(water, grey, pump).devices[id], t).title).toBe('Water');
});

test('a gone stat or line of an own hero is left out', () => {
  const hero = heroFromChoice({ ...TANK_HERO, line: ref('x', 'y') }, hub(water, pump), 'nl')!;
  expect(hero.line).toBeNull();
  expect(hero.stats).toEqual([{ role: 'value', ref: ref('p', 'onoff') }, { role: 'value', ref: ref('w', 'measure_content_volume') }]);
});

test('an own hero whose main value is gone falls back to the automatic hero', () => {
  const { snapshot: camperHub } = camper();
  expect(heroFromChoice(TANK_HERO, camperHub, 'nl')).toEqual(pickHero(camperHub, 'nl'));
  expect(heroFromChoice({ ...TANK_HERO, main: ref('w', 'gone') }, hub(water), 'nl')).toBeNull();
});

test('net charging in an own hero reads from the shore device on the camper', () => {
  const { snapshot: camperHub } = camper();
  const automatic = pickHero(camperHub, 'nl')!;
  const consumption = automatic.stats.find((s) => s.role === 'consumption');
  expect(consumption).toMatchObject({ ref: { deviceId: 'device-23' } });
  const hero = heroFromChoice({ main: automatic.primary, line: null, stats: [{ net: true }], name: null }, camperHub, 'nl')!;
  expect(hero.stats).toEqual([{ role: 'net' }]);
  expect(hero.net).toEqual({ solar: ref('device-22', 'measure_power'), consumption: ref('device-23', 'measure_power') });
  expect(heroDeviceIds(hero)).toEqual(expect.arrayContaining(['device-9', 'device-22', 'device-23']));
  // the same amount as the automatic hero shows
  const lookup = (id: string) => ({ ...camperHub.devices[id]!, capabilities: { ...camperHub.devices[id]!.capabilities, measure_power: { ...camperHub.devices[id]!.capabilities['measure_power']!, value: id === 'device-22' ? 412 : 186 } } });
  const net = (spec: typeof hero) => heroView(spec, lookup, t).stats.find((s) => s.role === 'net');
  expect(net(hero)).toEqual(net(automatic));
  expect(net(hero)).toMatchObject({ value: '+226 W', label: 'Netto laden' });
});

test('net charging is left out when the hub has no solar or no consumption', () => {
  const hero = heroFromChoice({ main: ref('w', 'tank_level'), line: null, stats: [{ net: true }], name: null }, hub(water), 'nl')!;
  expect([hero.net, hero.stats]).toEqual([null, []]);
});

test('a remaining time as the line reads as "Nog ongeveer"', () => {
  const { snapshot: camperHub } = camper();
  const automatic = pickHero(camperHub, 'nl')!;
  const hero = heroFromChoice({ main: automatic.primary, line: automatic.timeToGo, stats: [], name: null }, camperHub, 'nl')!;
  const battery = camperHub.devices['device-9']!;
  const lookup = (value: number | null) => (id: string) => (id === 'device-9' ? { ...battery, capabilities: { ...battery.capabilities, time_to_go: { ...battery.capabilities['time_to_go']!, value } } } : undefined);
  expect(heroView(hero, lookup(3124), t).line).toBe('Nog ongeveer 2 dagen en 4 uur');
  expect(heroView(hero, lookup(null), t).line).toBe('');
});

test('a hero with nothing to show is null', () => {
  const view = boardFromLayout(board('d-1', [heroSection('hero:d-1')]), hub(dimLamp, climate), 'nl');
  expect(view.left).toEqual([{ type: 'hero', id: 'hero:d-1', hero: null }]);
});

test('a non-percentage main value has no wave', () => {
  const shown = (choice: HeroChoice) => heroView(heroFromChoice(choice, hub(water, tank, dimLamp), 'nl')!, (id) => hub(water, tank, dimLamp).devices[id], t).progress;
  expect(shown({ ...TANK_HERO, main: ref('w', 'measure_content_volume') })).toBeNull();
  // a range of 0 to 1 is shown as a percentage, so it has the wave too
  const dim = device({ id: 'l', caps: [cap('dim', { min: 0, max: 1, value: 0.4 })] });
  expect(heroView(heroFromChoice({ ...TANK_HERO, main: ref('l', 'dim') }, hub(dim), 'nl')!, () => dim, t)).toMatchObject({ number: { text: '40', unit: '%' }, progress: 40 });
});

test('an automatic dashboard is not drawn from its layout', () => {
  expect(boardFromLayout(defaultHubLayout().dashboards[0]!, hub(dimLamp), 'nl')).toEqual({ id: 'overview', left: [], right: [] });
});

test('an own hero that begins with what stands there keeps the names of its boxes', () => {
  const { snapshot: camperHub } = camper();
  const automatic = pickHero(camperHub, 'nl')!;
  const stats = automatic.stats.map((stat) => (stat.role === 'net' ? { net: true as const } : stat.ref));
  const own = heroFromChoice({ main: automatic.primary, line: null, stats, name: null }, camperHub, 'nl')!;
  const lookup = (id: string) => camperHub.devices[id];
  const boxes = (spec: typeof own) => heroView(spec, lookup, t).stats.map(({ icon, value, label }) => ({ icon, value, label }));
  expect(boxes(own).map((b) => b.label)).toEqual(expect.arrayContaining(['Zon', 'Verbruik', 'Walstroom']));
  expect(boxes(own)).toEqual(boxes(automatic));
  // one without a value stays, with a dash (the owner chose it)
  const shore = automatic.stats.find((s) => s.role === 'shore') as { ref: { deviceId: string; capabilityId: string } };
  const without = (id: string) => {
    const device = camperHub.devices[id];
    const found = device?.capabilities[shore.ref.capabilityId];
    return device && found && id === shore.ref.deviceId ? { ...device, capabilities: { ...device.capabilities, [shore.ref.capabilityId]: { ...found, value: null } } } : device;
  };
  expect(heroView(own, without, t).stats.map((s) => s.label)).toContain('Walstroom');
  expect(heroView(automatic, without, t).stats.map((s) => s.label)).not.toContain('Walstroom');
});

test('two boxes of one device are told apart by the names of their values', () => {
  const dish = device({ id: 'd', name: 'Schotel', caps: [cap('measure_data_rate.down', { title: 'Download', units: 'Mbit/s', value: 51 }), cap('measure_data_rate.up', { title: 'Upload', units: 'Mbit/s', value: 6 })] });
  const own = heroFromChoice({ ...TANK_HERO, stats: [ref('d', 'measure_data_rate.down'), ref('d', 'measure_data_rate.up'), ref('p', 'onoff')] }, hub(water, pump, dish), 'nl')!;
  expect(heroView(own, (id) => hub(water, pump, dish).devices[id], t).stats.map((s) => s.label)).toEqual(['Download', 'Upload', 'Waterpomp']);
});
