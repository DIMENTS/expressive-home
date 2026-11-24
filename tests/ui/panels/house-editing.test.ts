// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { tilesFor } from '../../../src/dashboard/classify';
import { generateDashboard } from '../../../src/dashboard/generate';
import { toSnapshot } from '../../../src/homey/map';
import { createTranslate, t } from '../../../src/i18n';
import { boardFromDashboard, drawnTile } from '../../../src/layout/board';
import { freezeOverview } from '../../../src/layout/freeze';
import { reconcile } from '../../../src/layout/reconcile';
import type { TileLayout } from '../../../src/layout/types';
import { houseRaw } from '../../../src/mock/house';
import { tileMenuGroups } from '../../../src/ui/screens/edit-menus';
import '../../../src/ui/tiles/index';
import '../../../src/ui/panels/add-panel';
import '../../../src/ui/panels/tile-panel';
import type { MhAddPanel } from '../../../src/ui/panels/add-panel';
import type { MhTilePanel } from '../../../src/ui/panels/tile-panel';
import { snapshot } from '../../helpers/build';
import { deep, deepAll } from '../../helpers/deep';
import { covers, guards, heating, media } from '../../helpers/devices';
import { hubLayout, overview, tileLayout } from '../../helpers/layout';
import { mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

// The tiles of a house in the edit mode.

afterEach(() => { document.body.replaceChildren(); });

test.each([heating.ownMode, covers.both, media.full, guards.lock])('$name: the menu says what the sizes are', (d) => {
  const spec = tilesFor(d)[0]!;
  const sizes = (language: 'nl' | 'en') => tileMenuGroups(spec, d.name, { index: 0, count: 2 }, createTranslate(language)).flatMap((g) => (g.kind === 'items' && g.id === 'size' ? g.items.map((i) => [i.label, i.checked, i.disabled]) : []));
  expect(sizes('nl')).toEqual([['Enkel, zonder knoppen', true, false], ['Breed, met knoppen', false, false]]);
  expect(sizes('en')).toEqual([['Single, without buttons', true, false], ['Wide, with buttons', false, false]]);
});

test('a tile has its own name and icon, its size, and nothing else to choose', async () => {
  const tile = tileLayout(tilesFor(heating.ownMode)[0]!, { id: 't-1' });
  const element = await mount<MhTilePanel>('mh-tile-panel', { open: true, tile, device: heating.ownMode, sectionName: 'Klimaat' });
  await settle(element);
  expect([...element.shadowRoot!.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Naam op de tegel', 'Icoon', 'Formaat']);
  const size = deep(element, 'mh-choice-group') as HTMLElement & { options: { label: string }[]; value: string };
  expect([size.value, size.options.map((o) => o.label)]).toEqual(['single', ['Enkel, zonder knoppen', 'Breed, met knoppen']]);
  const patches = record<{ patch: Partial<TileLayout> }>(element, 'set-tile');
  size.dispatchEvent(new CustomEvent('change', { detail: { value: 'wide' }, bubbles: true, composed: true }));
  expect(patches).toEqual([{ patch: { size: 'wide' } }]);
});

test('an own name and icon and the size are drawn', () => {
  const tile: TileLayout = { ...tileLayout(tilesFor(guards.lock)[0]!, { id: 't-1' }), size: 'wide', label: 'Voor', icon: 'cabin' };
  expect(drawnTile(tile, snapshot([guards.lock]))).toMatchObject({ kind: 'guard', id: 't-1', size: 'wide', label: 'Voor', icon: 'cabin' });
});

test('adding a device gives its tile; adding one value of a lock gives one that opens the window', async () => {
  const fake = fakeContext([guards.lock, heating.ownMode]);
  let n = 0;
  const board = boardFromDashboard(generateDashboard(fake.store.getSnapshot()!, { grouping: 'type' }), 'overview');
  const element = await mount<MhAddPanel>('mh-add-panel', { open: true, ctx: fake.ctx, sectionName: 'Beveiliging', boardName: 'Overzicht', board, newId: () => `t-${++n}` });
  const list = deep(element, 'mh-device-list');
  await settle(list as never);
  const adds = record<{ tiles: TileLayout[] }>(element, 'add-tiles');
  const row = (id: string) => list.shadowRoot!.querySelector<HTMLElement>(`[data-device="${id}"]`)!;
  row('lock').querySelector<HTMLElement>('mh-button')!.click();
  expect(adds.at(-1)!.tiles.map((x) => [x.spec.kind, x.size, x.source])).toEqual([['guard', 'single', 'device']]);
  list.dispatchEvent(new CustomEvent('add-value', { detail: { deviceId: 'lock', capabilityId: 'locked' }, bubbles: true, composed: true }));
  list.dispatchEvent(new CustomEvent('add-value', { detail: { deviceId: 'own', capabilityId: 'target_temperature' }, bubbles: true, composed: true }));
  expect(adds.slice(1).flatMap((a) => a.tiles.map((x) => [x.spec.kind, x.source]))).toEqual([['generic', 'value'], ['sensor', 'value']]);
  expect(deepAll(element, 'mh-device-list')).toHaveLength(1);
});

test('a new device of a house is news, with a suggestion of its own section', () => {
  const before = toSnapshot(houseRaw('nl'));
  const { sections, known } = freezeOverview(generateDashboard(before, { grouping: 'type' }), before);
  const layout = hubLayout([overview(sections)], { known });
  const after = { ...before, devices: { ...before.devices, [covers.both.id]: covers.both, [media.full.id]: media.full, [guards.garage.id]: guards.garage, [heating.zone.id]: heating.zone } };
  const { news } = reconcile(layout, after, 'nl');
  expect(Object.fromEntries(news.map((item) => [item.name, item.suggest]))).toMatchObject({ Rolluik: 'covers', Keuken: 'media', Garage: 'security', Zolder: 'climate' });
  expect([t('section.covers'), t('section.media')]).toEqual(['Gordijnen', 'Muziek en tv']);
});
