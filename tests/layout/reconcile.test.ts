import { expect, test } from 'vitest';
import type { Device, Flow, HomeySnapshot } from '../../src/homey/types';
import { boardFromLayout } from '../../src/layout/board';
import { applyEdit } from '../../src/layout/edit';
import { freezeOverview } from '../../src/layout/freeze';
import { reconcile } from '../../src/layout/reconcile';
import { defaultHubLayout, flowRef, valueRef, type HeroChoice, type HubLayout } from '../../src/layout/types';
import { tilesFor } from '../../src/dashboard/classify';
import { climate, dimLamp, dish, motion, plug } from '../dashboard/samples';
import { cap, device, snapshot } from '../helpers/build';
import { camper } from '../helpers/camper';
import { board, deepFreeze, flowTile, heroSection, hubLayout, overview, ownSection, sensorTile, tileLayout } from '../helpers/layout';

const hub = (devices: Device[], extra: Partial<HomeySnapshot> = {}) => snapshot(devices, { scopes: ['homey'], ...extra });
const flow = (id: string, name: string, startable = true): Flow => ({ id, name, kind: 'flow', startable });
const ref = (deviceId: string, capabilityId: string) => ({ deviceId, capabilityId });

/** An own overview with the climate sensor's temperature, and "Buiten" with another copy and one value of the dish. */
const sample = (hero: HeroChoice | null = null): HubLayout => deepFreeze(hubLayout([
  overview([heroSection('hero:main', hero), ownSection('own:a', [sensorTile('t-1', 's1'), flowTile('t-2', 'f1')])]),
  board('d-buiten', [ownSection('own:b', [sensorTile('t-3', 's1', 'measure_humidity', { source: 'value' }), sensorTile('t-4', 'o1', 'measure_download', { source: 'value' })])], { name: 'Buiten' }),
], { known: ['s1', 'o1', flowRef('f1')], names: { s1: 's1', o1: 'o1', [flowRef('f1')]: 'Uit', [valueRef('s1', 'measure_humidity')]: 'measure_humidity', [valueRef('o1', 'measure_download')]: 'measure_download' } }));
const full = () => hub([climate, dish], { flows: [flow('f1', 'Uit')] });

test('a layout that fits the hub does not change', () => {
  const layout = sample();
  const result = reconcile(layout, full(), 'nl');
  expect(result).toEqual({ layout, news: [], gone: [], changed: false });
  expect(result.layout).toBe(layout);
});

test('an automatic overview gives no news', () => {
  expect(reconcile(defaultHubLayout(), hub([dimLamp, plug], { flows: [flow('f1', 'Uit')] }), 'nl')).toMatchObject({ news: [], gone: [], changed: false });
});

test('a new device on an own overview is news with its zone and suggested section', () => {
  const sensor = { ...motion, name: 'Bewegingssensor', zoneId: 'z1' };
  const { news } = reconcile(sample(), hub([climate, dish, sensor, { ...dimLamp, name: 'Aanrecht' }], { flows: [flow('f1', 'Uit')], zones: { z1: { id: 'z1', name: 'Hal', parentId: null } } }), 'nl');
  expect(news).toEqual([
    { ref: 'l1', kind: 'device', name: 'Aanrecht', zoneName: null, suggest: 'lights' },
    { ref: 's2', kind: 'device', name: 'Bewegingssensor', zoneName: 'Hal', suggest: 'security' },
  ]);
});

test('a new startable flow is news with the suggestion Flows; a flow that cannot be started is not', () => {
  const { news } = reconcile(sample(), hub([climate, dish], { flows: [flow('f1', 'Uit'), flow('f2', 'Slaapstand'), flow('f3', 'Automatisch', false)] }), 'nl');
  expect(news).toEqual([{ ref: flowRef('f2'), kind: 'flow', name: 'Slaapstand', zoneName: null, suggest: 'flows' }]);
});

test('a known device is no news, also when it is not on any dashboard', () => {
  const layout = applyEdit(sample(), { type: 'know', refs: ['p1'] });
  expect(reconcile(layout, hub([climate, dish, plug], { flows: [flow('f1', 'Uit')] }), 'nl').news).toEqual([]);
});

test('a gone device is gone with its name and the dashboards it was on', () => {
  const layout = { ...sample(), names: { ...sample().names, s1: 'Klimaatsensor' } };
  const result = reconcile(layout, hub([dish], { flows: [flow('f1', 'Uit')] }), 'nl');
  expect(result.gone).toEqual([{ ref: 's1', name: 'Klimaatsensor', boards: ['overview', 'd-buiten'], heroFallback: false }]);
  // it stays in the layout, with its name, until forget-gone
  expect(JSON.stringify(result.layout)).toContain('"t-1"');
  expect(result.layout.names['s1']).toBe('Klimaatsensor');
});

test('a gone flow is gone with its name', () => {
  expect(reconcile(sample(), hub([climate, dish]), 'nl').gone).toEqual([{ ref: flowRef('f1'), name: 'Uit', boards: ['overview'], heroFallback: false }]);
});

test('a gone tile of another dashboard is reported while the overview is automatic', () => {
  const layout = hubLayout([overview(null), sample().dashboards[1]!], { names: { s1: 'Klimaat', o1: 'Schotel' } });
  expect(reconcile(layout, hub([climate]), 'nl').gone).toEqual([{ ref: 'o1', name: 'Schotel', boards: ['d-buiten'], heroFallback: false }]);
});

test('a device that comes back is no longer gone and its tiles are there again', () => {
  const away = reconcile(sample(), hub([dish], { flows: [flow('f1', 'Uit')] }), 'nl');
  const back = reconcile(away.layout, full(), 'nl');
  expect(back.gone).toEqual([]);
  expect(back.news).toEqual([]);
  const view = boardFromLayout(back.layout.dashboards[0]!, full(), 'nl');
  expect(JSON.stringify(view)).toContain('"t-1"');
});

test('a value tile whose value vanished is gone as "device · value"', () => {
  const layout = { ...sample(), names: { ...sample().names, o1: 'Schotel', [valueRef('o1', 'measure_download')]: 'Download' } };
  const poor = device({ ...dish, caps: [dish.capabilities['measure_upload']!, dish.capabilities['measure_latency']!] });
  expect(reconcile(layout, hub([climate, poor], { flows: [flow('f1', 'Uit')] }), 'nl').gone)
    .toEqual([{ ref: valueRef('o1', 'measure_download'), name: 'o1 · Download', boards: ['d-buiten'], heroFallback: false }]);
});

test('the main value of an own hero gone sets heroFallback', () => {
  const hero: HeroChoice = { main: ref('w', 'tank_level'), line: ref('o1', 'measure_upload'), stats: [ref('x', 'y')], name: null };
  const layout = { ...sample(hero), names: { ...sample().names, w: 'Schoon water', x: 'Pomp' } };
  expect(reconcile(layout, full(), 'nl').gone).toEqual([
    { ref: 'x', name: 'Pomp', boards: ['overview'], heroFallback: false },
    { ref: 'w', name: 'Schoon water', boards: ['overview'], heroFallback: true },
  ]);
});

test('a changed device adapts its tiles and reports changed', () => {
  const lamp = tileLayout({ kind: 'light', id: 'x', deviceId: 'l1', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim.white' }, { id: 't-1', label: 'Boven' });
  const layout = hubLayout([overview([ownSection('own:a', [lamp])])], { known: ['l1'], names: { l1: 'Plafond' } });
  const result = reconcile(deepFreeze(layout), hub([dimLamp]), 'nl');
  expect(result.changed).toBe(true);
  expect(result.layout.dashboards[0]!.sections![0]!.tiles[0]).toEqual({ ...lamp, spec: { ...lamp.spec, dimCapabilityId: 'dim' } });
  expect(reconcile(result.layout, hub([dimLamp]), 'nl').changed).toBe(false);
});

test('names follow a renamed device and hold the title of a value', () => {
  const result = reconcile(sample(), hub([{ ...climate, name: 'Woonkamer' }, dish], { flows: [flow('f1', 'Alles uit')] }), 'nl');
  expect(result.changed).toBe(true);
  expect(result.layout.names).toMatchObject({ s1: 'Woonkamer', [flowRef('f1')]: 'Alles uit', [valueRef('s1', 'measure_humidity')]: 'measure_humidity' });
});

test('known forgets what is gone and not referenced', () => {
  const layout = applyEdit(sample(), { type: 'know', refs: ['p1', flowRef('f9')] });
  const result = reconcile(layout, hub([dish], { flows: [flow('f1', 'Uit')] }), 'nl');
  // s1 is gone too, but a tile still refers to it
  expect(result.layout.known).toEqual(['s1', 'o1', flowRef('f1')]);
});

test('two copies of a gone device give one gone item', () => {
  const layout = hubLayout([overview([ownSection('own:a', [sensorTile('t-1', 's1'), sensorTile('t-2', 's1', 'measure_humidity'), sensorTile('t-3', 's1', 'measure_humidity', { source: 'value' })])])], { known: ['s1'], names: { s1: 'Klimaat' } });
  expect(reconcile(layout, hub([]), 'nl').gone).toEqual([{ ref: 's1', name: 'Klimaat', boards: ['overview'], heroFallback: false }]);
});

test('without the right to read devices or flows nothing is gone or forgotten', () => {
  const layout = sample();
  expect(reconcile(layout, snapshot([], { scopes: ['homey.zone'] }), 'nl')).toEqual({ layout, news: [], gone: [], changed: false });
  expect(reconcile(layout, snapshot([climate], { scopes: ['homey.device'], flows: [] }), 'nl').gone.map((g) => g.ref)).toEqual(['o1']);
});

test('a camper frozen and reconciled with the same camper stays as it is', () => {
  const { dashboard, snapshot: camperHub } = camper();
  const frozen = freezeOverview(dashboard, camperHub);
  const layout = hubLayout([overview(frozen.sections)], { known: frozen.known, names: frozen.names });
  expect(reconcile(layout, camperHub, 'nl')).toEqual({ layout, news: [], gone: [], changed: false });
});

test('a tile that changed kind keeps fitting its size', () => {
  const single = tileLayout({ ...tilesFor(climate)[0]!, capabilityId: 'gone' } as never, { id: 't-1', size: 'single' });
  const layout = hubLayout([overview([ownSection('own:a', [single])])], { known: ['s1'], names: { s1: 's1' } });
  const many = device({ ...climate, caps: [cap('measure_a', { value: 1 }), cap('measure_b', { value: 2 }), cap('measure_c', { value: 3 })] });
  expect(reconcile(layout, hub([many]), 'nl').layout.dashboards[0]!.sections![0]!.tiles[0]).toMatchObject({ id: 't-1', size: 'wide', spec: { kind: 'multi' } });
});

test('a device that loses one of its values does not get two of the same tile; when the value comes back, so does the tile', () => {
  const layout = hubLayout([overview([ownSection('own:a', [sensorTile('t-1', 's1'), sensorTile('t-2', 's1', 'measure_humidity'), sensorTile('t-3', 's2')])])], { known: ['s1', 's2'], names: {} });
  const { measure_humidity: _gone, ...rest } = climate.capabilities;
  const one: Device = { ...climate, capabilities: rest, capabilityOrder: climate.capabilityOrder.filter((id) => id !== 'measure_humidity') };
  const shown = (stored: HubLayout, devices: Device[]) => {
    const [block] = boardFromLayout(stored.dashboards[0]!, hub(devices), 'nl').left;
    return block?.type === 'section' ? block.section.tiles.map((tile) => [tile.id, 'capabilityId' in tile ? tile.capabilityId : null]) : [];
  };
  const without = reconcile(layout, hub([one, motion]), 'nl');
  expect(shown(without.layout, [one, motion])).toEqual([['t-1', 'measure_temperature'], ['t-3', 'measure_temperature']]);
  expect(without.gone).toEqual([]);
  const back = reconcile(without.layout, hub([climate, motion]), 'nl');
  expect(shown(back.layout, [climate, motion])).toEqual([['t-1', 'measure_temperature'], ['t-2', 'measure_humidity'], ['t-3', 'measure_temperature']]);
});

test('two copies of one tile follow their device and stay two', () => {
  const layout = hubLayout([overview([ownSection('own:a', [sensorTile('t-2', 's1', 'measure_humidity'), sensorTile('t-4', 's1', 'measure_humidity')])])], { known: ['s1'], names: {} });
  const { measure_humidity: _gone, ...rest } = climate.capabilities;
  const one: Device = { ...climate, capabilities: rest, capabilityOrder: climate.capabilityOrder.filter((id) => id !== 'measure_humidity') };
  const [block] = boardFromLayout(reconcile(layout, hub([one]), 'nl').layout.dashboards[0]!, hub([one]), 'nl').left;
  expect(block?.type === 'section' && block.section.tiles.map((tile) => [tile.id, 'capabilityId' in tile && tile.capabilityId])).toEqual([['t-2', 'measure_temperature'], ['t-4', 'measure_temperature']]);
});

test('without a key ordinary flows are no news, and those that stand somewhere stay; with one they are', () => {
  const flows = [flow('button:film', 'Film'), flow('f1', 'Uit'), flow('f2', 'Slaapstand')];
  const without = reconcile(sample(), hub([climate, dish], { flows, flowAccess: 'none' }), 'nl');
  expect([without.news.map((item) => item.ref), without.gone, without.changed]).toEqual([[flowRef('button:film')], [], false]);
  expect(reconcile(sample(), hub([climate, dish], { flows, flowAccess: 'works' }), 'nl').news.map((item) => item.ref)).toEqual([flowRef('button:film'), flowRef('f2')]);
});

test('a button that no flow has any more is gone with its name', () => {
  const layout = deepFreeze(hubLayout([overview([ownSection('own:a', [flowTile('t-2', 'button:film')])])], { known: [flowRef('button:film')], names: { [flowRef('button:film')]: 'Film' } }));
  expect(reconcile(layout, hub([climate, dish]), 'nl').gone).toEqual([{ ref: flowRef('button:film'), name: 'Film', boards: ['overview'], heroFallback: false }]);
});

test('what stands on the Overzicht is no news, also when nobody ever said it was known', () => {
  const flows = [flow('f1', 'Uit'), flow('f2', 'Slaapstand')];
  const layout = { ...sample(), known: ['s1', 'o1'] };
  expect(reconcile(layout, hub([climate, dish], { flows, flowAccess: 'works' }), 'nl').news.map((item) => item.ref)).toEqual([flowRef('f2')]);
});
