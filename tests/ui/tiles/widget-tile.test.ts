// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import type { WidgetTileSpec } from '../../../src/dashboard/types';
import type { MhWidgetTile } from '../../../src/ui/tiles/widget-tile';
import { inside, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';
import { cap, device } from '../../helpers/build';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 24, 11, 8, 30)); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const spec = (widget: string, settings: WidgetTileSpec['settings'] = {}, size: 'single' | 'wide' = 'single'): WidgetTileSpec =>
  ({ kind: 'widget', id: 't-1', size, widget, settings });

async function setup(s: WidgetTileSpec, editing = false) {
  const fake = fakeContext([]);
  const openBoard = vi.fn();
  fake.ctx.widgets = { boards: () => [{ id: 'd-1', name: 'Slaapkamer', icon: 'bed' }], openBoard };
  const tile = createTile(s, fake.ctx, 'comfortable') as MhWidgetTile;
  tile.editing = editing;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile, openBoard };
}

test('the clock shows the time and the date, and a screen reader hears both', async () => {
  const { tile } = await setup(spec('clock', {}, 'wide'));
  expect(inside(tile, '.time').textContent).toBe('11:08');
  expect(inside(tile, '.weekday').textContent).toBe('dinsdag');
  expect(inside(tile, '.clock').getAttribute('aria-label')).toBe('Klok, 11:08, dinsdag 24 november');
});

test('the clock moves on with the minute', async () => {
  const { tile } = await setup(spec('clock'));
  vi.advanceTimersByTime(30_000);
  await settle(tile);
  expect(inside(tile, '.time').textContent).toBe('11:09');
});

test('the clock without a date shows only the time', async () => {
  const { tile } = await setup(spec('clock', { date: false }));
  expect(tile.shadowRoot!.querySelector('.date')).toBeNull();
});

test('a note shows its title and text, and the accent when chosen', async () => {
  const { tile } = await setup(spec('note', { title: 'Boodschappen', text: 'Melk\nbrood', accent: true }));
  expect(inside(tile, '.name').textContent).toBe('Boodschappen');
  expect(inside(tile, '.text').textContent).toBe('Melk\nbrood');
  expect(inside(tile, '.tile').classList.contains('accent')).toBe(true);
});

test('a link opens its dashboard', async () => {
  const { tile, openBoard } = await setup(spec('board', { board: 'd-1' }));
  expect(inside(tile, 'button').getAttribute('aria-label')).toBe('Open dashboard Slaapkamer');
  inside(tile, 'button').click();
  expect(openBoard).toHaveBeenCalledWith('d-1');
});

test('a link to a dashboard that is gone is not shown, except while editing', async () => {
  const gone = await setup(spec('board', { board: 'd-9' }));
  expect(gone.tile.hidden).toBe(true);
  document.body.replaceChildren();
  const editing = await setup(spec('board', { board: 'd-9' }), true);
  expect(editing.tile.hidden).toBe(false);
});

test('while editing a tap opens the menu of the tile and does nothing else', async () => {
  const { tile, openBoard } = await setup(spec('board', { board: 'd-1' }), true);
  const menus = record<{ tileId: string }>(tile, 'tile-menu');
  inside(tile, 'button').click();
  expect(menus).toEqual([{ tileId: 't-1' }]);
  expect(openBoard).not.toHaveBeenCalled();
});

async function withDevices(s: WidgetTileSpec, devices: Parameters<typeof fakeContext>[0]) {
  const fake = fakeContext(devices);
  const tile = createTile(s, fake.ctx, 'comfortable') as MhWidgetTile;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile };
}

test('a gauge shows its value on an arc, and says it', async () => {
  const sensor = device({ id: 's', name: 'Woonkamer', caps: [cap('measure_temperature', { value: 20, units: '°C' })] });
  const { tile } = await withDevices(spec('gauge', { device: 's', capability: 'measure_temperature', min: 0, max: 40 }), [sensor]);
  expect(inside(tile, '.gauge').getAttribute('aria-label')).toMatch(/^Woonkamer, 20/);
  const fill = inside(tile, '.fill');
  expect(Number(fill.getAttribute('stroke-dashoffset'))).toBeCloseTo(Number(fill.getAttribute('stroke-dasharray')) / 2, 1);
});

test('a countdown says how many days are left', async () => {
  const { tile } = await setup(spec('countdown', { title: 'Vakantie', date: '2026-12-06' }));
  expect(inside(tile, '.countdown').getAttribute('aria-label')).toBe('Vakantie, nog 12 dagen');
});

test('a group button switches all its devices off when one is on, and is on itself', async () => {
  const a = device({ id: 'a', name: 'A', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: true })] });
  const b = device({ id: 'b', name: 'B', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] });
  const { tile, actions } = await withDevices(spec('group', { title: 'Buiten', devices: 'a,b' }), [a, b]);
  expect(tile.state).toBe('on');
  expect(inside(tile, '.state').textContent).toBe('1 van 2 aan');
  inside(tile, 'button').click();
  expect(actions.lamps).toHaveBeenCalledWith(['a', 'b'], false);
});

test('a widget that asks for more height spans as many rows as it needs, so the tiles beside it stack instead of stretching', async () => {
  const { tile } = await setup(spec('note'));
  tile.style.setProperty('--tile-height', '112px');
  tile.style.setProperty('--tile-gap', '10px');
  const ask = (px: number) => tile.shadowRoot!.querySelector('.tile')!.dispatchEvent(new CustomEvent('widget-height', { detail: { px }, bubbles: true, composed: true }));
  ask(300);
  expect(tile.style.getPropertyValue('grid-row')).toBe('span 3');
  ask(168);
  expect(tile.style.getPropertyValue('grid-row')).toBe('span 2');
  ask(100);
  expect(tile.style.getPropertyValue('grid-row')).toBe('');
});

test('a wide clock on a phone, where tiles are never wide, uses the narrow layout', async () => {
  const fake = fakeContext([]);
  const tile = createTile(spec('clock', {}, 'wide'), fake.ctx, 'phone') as MhWidgetTile;
  document.body.append(tile);
  await tile.updateComplete;
  expect(tile.wide).toBe(false);
  expect(tile.shadowRoot!.querySelector('.clock-wide')).toBeNull();
  expect(inside(tile, '.date').textContent).toBe('di 24 nov');
});

test('on a phone a widget taller than a tile takes the whole width; a small one stays beside another', async () => {
  const fake = fakeContext([]);
  const tile = createTile(spec('note'), fake.ctx, 'phone') as MhWidgetTile;
  document.body.append(tile);
  await tile.updateComplete;
  tile.style.setProperty('--tile-height', '60px');
  tile.style.setProperty('--tile-gap', '8px');
  const ask = async (px: number) => { tile.shadowRoot!.querySelector('.tile')!.dispatchEvent(new CustomEvent('widget-height', { detail: { px }, bubbles: true, composed: true })); await tile.updateComplete; };
  await ask(50);
  expect(tile.wide).toBe(false);
  await ask(382);
  expect(tile.wide).toBe(true);
  tile.density = 'comfortable';
  await tile.updateComplete;
  expect(tile.wide).toBe(false);
});
