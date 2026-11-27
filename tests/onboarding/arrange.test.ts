import { expect, test } from 'vitest';
import { arrangeOverview } from '../../src/onboarding/arrange';
import { generateDashboard } from '../../src/dashboard/generate';
import { everythingOn } from '../../src/layout/freeze';
import { camperSnapshot } from '../helpers/fake-hub';
import { cap, device, snapshot } from '../helpers/build';

let ids = 0;
const newId = (prefix: string) => `${prefix}-${(ids += 1)}`;
const options = { locale: 'nl', today: 'Vandaag', newId };
const columns = (sections: { id: string; column: string }[]) => ({
  left: sections.filter((s) => s.column === 'left').map((s) => s.id),
  right: sections.filter((s) => s.column === 'right').map((s) => s.id),
});

test('nothing chosen first and no widgets: the Overzicht stays automatic', () => {
  expect(arrangeOverview(camperSnapshot(), { grouping: 'type', first: [], extras: [] }, options)).toBeNull();
});

test('what is chosen stands on top on the left, in the order it was tapped; everything else is still there', () => {
  const house = camperSnapshot();
  const all = generateDashboard(house, { grouping: 'type', locale: 'nl' });
  const first = ['type:water', 'hero:main', 'type:lights'];
  const arranged = arrangeOverview(house, { grouping: 'type', first, extras: [] }, options)!;
  const { left, right } = columns(arranged.sections);
  expect(left.slice(0, 3)).toEqual(first);
  expect([...left, ...right].sort()).toEqual(['hero:main', ...all.sections.map((s) => s.id)].sort());
  // the tiles of a section are those the app chose
  const water = arranged.sections.find((s) => s.id === 'type:water')!;
  expect(water.tiles.map((tile) => tile.spec)).toEqual(all.sections.find((s) => s.id === 'type:water')!.tiles);
  expect(arranged.sections.find((s) => s.id === 'hero:main')).toMatchObject({ kind: 'hero', hero: null, tiles: [] });
  expect({ known: arranged.known, names: arranged.names }).toEqual(everythingOn(house));
});

test('the rest goes one by one into the column that is the shortest by then, so neither column gets long', () => {
  const house = camperSnapshot();
  const arranged = arrangeOverview(house, { grouping: 'type', first: ['type:lights'], extras: [] }, options)!;
  const { left, right } = columns(arranged.sections);
  expect(left[0]).toBe('type:lights');
  expect(right.length).toBeGreaterThan(0);
  // the hero was not chosen: it comes right after what was, on the left
  expect(left[1]).toBe('hero:main');
});

test('weather and energy: a section of their own on top, with wide widgets', () => {
  const arranged = arrangeOverview(camperSnapshot(), { grouping: 'type', first: ['type:lights'], extras: ['weather', 'energy'] }, options)!;
  const [today] = arranged.sections;
  expect(today).toMatchObject({ kind: 'own', column: 'left', name: 'Vandaag', icon: 'partly_cloudy_day', hero: null });
  expect(today!.id).toMatch(/^own:s-\d+$/);
  expect(today!.tiles.map((tile) => [tile.spec.kind, tile.spec.kind === 'widget' ? tile.spec.widget : '', tile.size, tile.spec.id === tile.id])).toEqual([
    ['widget', 'weather', 'wide', true], ['widget', 'energy', 'wide', true],
  ]);
  expect(columns(arranged.sections).left[1]).toBe('type:lights');
  const energyOnly = arrangeOverview(camperSnapshot(), { grouping: 'type', first: [], extras: ['energy'] }, options)!;
  expect(energyOnly.sections[0]).toMatchObject({ name: 'Vandaag', icon: 'bolt' });
});

test('per room: the rooms that were chosen first, with their names; something chosen that is not there is passed over', () => {
  const zones = { a: { id: 'a', name: 'Keuken', parentId: null }, b: { id: 'b', name: 'Slaapkamer', parentId: null } };
  const lamp = (id: string, zoneId: string) => device({ id, name: id, zoneId, deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] });
  const house = snapshot([lamp('l1', 'a'), lamp('l2', 'b'), lamp('l3', 'b')], { zones });
  const arranged = arrangeOverview(house, { grouping: 'zone', first: ['own:zone:b', 'type:gone'], extras: [] }, options)!;
  expect(columns(arranged.sections).left[0]).toBe('own:zone:b');
  expect(arranged.sections.find((s) => s.id === 'own:zone:b')).toMatchObject({ kind: 'own', name: 'Slaapkamer', zone: 'b' });
  expect(arranged.sections.map((s) => s.id).sort()).toEqual(['own:zone:a', 'own:zone:b']);
});

test('only things that are not there were chosen: automatic after all', () => {
  expect(arrangeOverview(camperSnapshot(), { grouping: 'type', first: ['type:gone'], extras: [] }, options)).toBeNull();
});
