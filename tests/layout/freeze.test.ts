import { expect, test } from 'vitest';
import { generateDashboard } from '../../src/dashboard/generate';
import { freezeOverview } from '../../src/layout/freeze';
import { defaultHubLayout, flowRef, heroSectionId, OVERVIEW_ID, valueRef } from '../../src/layout/types';
import { splitColumns } from '../../src/ui/model/layout';
import { camper } from '../helpers/camper';
import { snapshot } from '../helpers/build';
import { climate, dimLamp, plug } from '../dashboard/samples';

const frozen = () => {
  const { dashboard, snapshot: hub } = camper();
  return { dashboard, hub, ...freezeOverview(dashboard, hub) };
};

test('freezing the camper keeps every section, tile, column and order as shown', () => {
  const { dashboard, sections } = frozen();
  const { left, right } = splitColumns(dashboard.sections, true);
  expect(sections.map((s) => [s.id, s.column])).toEqual([
    ['hero:main', 'left'], ...left.map((s) => [s.id, 'left']), ...right.map((s) => [s.id, 'right']),
  ]);
  for (const section of dashboard.sections) {
    const own = sections.find((s) => s.id === section.id)!;
    expect(own).toMatchObject({ kind: section.kind, name: null, icon: null, hero: null });
    expect(own.tiles.map((tile) => tile.id)).toEqual(section.tiles.map((tile) => tile.id));
    expect(own.tiles.map((tile) => tile.spec)).toEqual(section.tiles);
    expect(own.tiles.map((tile) => tile.size)).toEqual(section.tiles.map((tile) => tile.size));
  }
});

test('a dashboard with one empty column is frozen in one column, as it is shown', () => {
  const hub = snapshot([dimLamp, plug]);
  const { sections } = freezeOverview(generateDashboard(hub, { grouping: 'type' }), hub);
  expect(sections.map((s) => [s.id, s.column])).toEqual([['type:lights', 'left'], ['type:switches', 'left']]);
});

test('the frozen hero is automatic and has no tiles', () => {
  const { sections } = frozen();
  expect(sections[0]).toEqual({ id: 'hero:main', kind: 'hero', column: 'left', name: null, icon: null, tiles: [], hero: null });
  const hub = snapshot([climate]);
  expect(freezeOverview(generateDashboard(hub, { grouping: 'type' }), hub).sections.some((s) => s.kind === 'hero')).toBe(false);
});

test('the app knows every device and every startable flow at freezing', () => {
  const { hub, known } = frozen();
  const startable = hub.flows.filter((f) => f.startable);
  expect(startable.length).toBeGreaterThan(0);
  expect(hub.flows.some((f) => !f.startable)).toBe(true);
  expect([...known].sort()).toEqual([...Object.keys(hub.devices), ...startable.map((f) => flowRef(f.id))].sort());
});

test('names hold the current name of every device and flow', () => {
  const { hub, names } = frozen();
  for (const device of Object.values(hub.devices)) expect(names[device.id]).toBe(device.name);
  for (const flow of hub.flows.filter((f) => f.startable)) expect(names[flowRef(flow.id)]).toBe(flow.name);
});

test('a frozen tile comes from a device, without own name or icon', () => {
  const tiles = frozen().sections.flatMap((s) => s.tiles);
  expect(tiles.length).toBeGreaterThan(20);
  for (const tile of tiles) expect(tile).toMatchObject({ source: 'device', label: null, icon: null });
});

test('a fresh layout is one automatic overview and knows nothing', () => {
  expect(defaultHubLayout()).toEqual({ dashboards: [{ id: OVERVIEW_ID, name: null, icon: null, sections: null }], known: [], names: {} });
  expect(defaultHubLayout()).not.toBe(defaultHubLayout());
});

test('references to flows, values and heroes have their own shape', () => {
  expect(flowRef('f1')).toBe('flow:f1');
  expect(valueRef('d1', 'dim.white')).toBe('d1/dim.white');
  expect(heroSectionId('overview')).toBe('hero:main');
  expect(heroSectionId('d-12345678')).toBe('hero:d-12345678');
});

test('what could not be chosen is not known at freezing: with a key it is there', () => {
  const hub = { ...camper().snapshot, flowAccess: 'none' as const };
  hub.flows = [{ id: 'button:film', name: 'Film', kind: 'flow', startable: true }, ...hub.flows];
  const { known } = freezeOverview(generateDashboard(hub, { grouping: 'type' }), hub);
  expect(known.filter((ref) => ref.startsWith('flow:'))).toEqual(['flow:button:film']);
});
