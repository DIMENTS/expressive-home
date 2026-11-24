import { expect, test } from 'vitest';
import { boardFromDashboard, boardFromLayout } from '../../../src/layout/board';
import { createTranslate, t } from '../../../src/i18n';
import { deviceList, flowList } from '../../../src/ui/model/device-list';
import { generateDashboard } from '../../../src/dashboard/generate';
import { climate, dish } from '../../dashboard/samples';
import { cap, device, snapshot } from '../../helpers/build';
import { camper } from '../../helpers/camper';
import { board, flowTile, heroSection, ownSection, sensorTile } from '../../helpers/layout';

const camperBoard = () => { const { dashboard, snapshot: hub } = camper(); return { hub, view: boardFromDashboard(dashboard, 'overview') }; };
const empty = { id: 'd-1', left: [], right: [] };

test('the camper devices are grouped per zone in the order of the zone tree', () => {
  const { hub, view } = camperBoard();
  const groups = deviceList(hub, view, '', t);
  // zone-3 is the root; its children by name, each followed by its own (zone-4 lies in zone-5)
  expect(groups.map((g) => g.zoneId)).toEqual(['zone-3', 'zone-1', 'zone-2', 'zone-5', 'zone-4', 'zone-6']);
  expect(groups[0]!.name).toBe(hub.zones['zone-3']!.name);
  const names = groups[0]!.devices.map((d) => d.name);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'nl')));
  expect(groups.flatMap((g) => g.devices)).toHaveLength(27);
});

test('a device without a room, or in a room the hub does not list, stands under "Zonder ruimte" at the end', () => {
  const hub = snapshot([{ ...climate, zoneId: 'z1' }, { ...dish, zoneId: 'gone' }, device({ id: 'x', name: 'Los' })], { zones: { z1: { id: 'z1', name: 'Kamer', parentId: null } } });
  expect(deviceList(hub, empty, '', t).map((g) => [g.name, g.zoneId, g.devices.map((d) => d.id)])).toEqual([['Kamer', 'z1', ['s1']], ['Zonder ruimte', null, ['x', 'o1']].map((v) => v) as never]);
  expect(deviceList(hub, empty, '', createTranslate('en')).at(-1)!.name).toBe('Without a room');
});

test('rooms that point at each other do not hang the list', () => {
  const hub = snapshot([{ ...climate, zoneId: 'a' }], { zones: { a: { id: 'a', name: 'A', parentId: 'b' }, b: { id: 'b', name: 'B', parentId: 'a' } } });
  expect(deviceList(hub, empty, '', t).flatMap((g) => g.devices.map((d) => d.id))).toEqual(['s1']);
});

test('a device on this board says where; one in the hero says so', () => {
  const { hub, view } = camperBoard();
  const rows = new Map(deviceList(hub, view, '', t).flatMap((g) => g.devices).map((d) => [d.id, d]));
  expect(rows.get('device-1')).toMatchObject({ where: ['Verlichting'], inHero: false, icon: 'lightbulb' });
  expect(rows.get('device-13')!.where).toEqual(['Klimaat']);
  expect(rows.get('device-9')).toMatchObject({ where: [], inHero: true });
  // the device behind the consumption keeps its own tile
  expect(rows.get('device-23')).toMatchObject({ where: ['Overig'], inHero: false });
});

test('an own hero counts what it shows, and two sections are both named', () => {
  const hub = snapshot([climate, dish], { scopes: ['homey'] });
  const choice = { main: { deviceId: 's1', capabilityId: 'measure_humidity' }, line: null, stats: [{ deviceId: 'o1', capabilityId: 'measure_upload' }], name: null };
  const view = boardFromLayout(board('d-1', [heroSection('hero:d-1', choice), ownSection('own:a', [sensorTile('t-1', 's1'), sensorTile('t-2', 's1')], { name: 'Binnen' }), ownSection('own:b', [sensorTile('t-3', 's1')], { name: 'Buiten' })]), hub, 'nl');
  const rows = deviceList(hub, view, '', t).flatMap((g) => g.devices);
  expect(rows.map((r) => [r.id, r.where, r.inHero])).toEqual([['o1', [], true], ['s1', ['Binnen', 'Buiten'], true]]);
});

test('the values of a device, the main ones first', () => {
  const hub = snapshot([device({ id: 'd', name: 'D', caps: [
    cap('rssi', { title: 'Signaal', value: -60 }), cap('measure_temperature', { title: 'Temperatuur', units: '°C', value: 20.5 }), cap('state', { title: 'Stand', type: 'enum', value: 'a', options: [{ id: 'a', title: 'Online' }] }),
    cap('button.reset', { title: 'Opnieuw', type: 'boolean', getable: false, setable: true }), cap('hidden', { getable: false }),
  ] })]);
  expect(deviceList(hub, empty, '', t)[0]!.devices[0]!.values).toEqual([
    { capabilityId: 'measure_temperature', title: 'Temperatuur', value: '20,5 °C', icon: 'thermostat', numeric: true, readable: true },
    { capabilityId: 'state', title: 'Stand', value: 'Online', icon: 'category', numeric: false, readable: true },
    { capabilityId: 'button.reset', title: 'Opnieuw', value: 'Indrukken', icon: 'touch_app', numeric: false, readable: false },
    { capabilityId: 'rssi', title: 'Signaal', value: '-60', icon: 'category', numeric: true, readable: true },
  ]);
});

test('searching keeps only matching devices and drops empty zones', () => {
  const { hub, view } = camperBoard();
  const name = hub.devices['device-3']!.name;
  const found = deviceList(hub, view, `  ${name.toUpperCase()} `, t);
  expect(found.flatMap((g) => g.devices.map((d) => d.name))).toContain(name);
  expect(found.every((g) => g.devices.length > 0)).toBe(true);
  expect(deviceList(hub, view, 'bestaat niet', t)).toEqual([]);
});

test('only startable flows are listed', () => {
  const { hub, view } = camperBoard();
  const list = flowList(hub, view, t);
  expect(list.map((f) => f.id)).toEqual(hub.flows.filter((f) => f.startable).map((f) => f.id));
  expect(list[0]).toMatchObject({ name: 'Flow 1', where: ['Flows'] });
  const own = boardFromLayout(board('d-1', [ownSection('own:a', [flowTile('t-1', 'flow-2')], { name: 'Binnen' })]), hub, 'nl');
  expect(flowList(hub, own, t).map((f) => f.where)).toEqual([[], ['Binnen']]);
});

test('the list holds every device of the hub, also one the automatic dashboard leaves out', () => {
  const { hub } = camperBoard();
  expect(deviceList(hub, boardFromDashboard(generateDashboard(hub, { grouping: 'type' }), 'overview'), '', t).flatMap((g) => g.devices.map((d) => d.id)).sort()).toEqual(Object.keys(hub.devices).sort());
});

test('buttons come first, and without a key there is nothing else', () => {
  const flows = [{ id: 'f1', name: 'Alles uit', kind: 'flow' as const, startable: true }, { id: 'button:film', name: 'Film', kind: 'flow' as const, startable: true }, { id: 'button:ontbijt', name: 'Ontbijt', kind: 'flow' as const, startable: false }];
  const view = boardFromLayout(board('d-1', []), snapshot([], { flows }), 'nl');
  expect(flowList(snapshot([], { flows }), view, t).map((f) => [f.id, f.button])).toEqual([['button:film', true], ['button:ontbijt', true], ['f1', false]]);
  expect(flowList(snapshot([], { flows, flowAccess: 'none' }), view, t).map((f) => f.id)).toEqual(['button:film', 'button:ontbijt']);
});
