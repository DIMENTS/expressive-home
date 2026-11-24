// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import type { TileSpec } from '../../../src/dashboard/types';
import { t } from '../../../src/i18n';
import { tileView } from '../../../src/ui/model/tile-view';
import '../../../src/ui/tiles/index';
import { createTile, tileSizes } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import { cap, device } from '../../helpers/build';
import { inside, key, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const lamp = device({ id: 'l', name: 'Plafond', deviceClass: 'light', caps: [
  cap('onoff', { type: 'boolean', setable: true, value: true }), cap('dim', { setable: true, min: 0, max: 1, units: '%', value: 0.8 }),
] });
const sensor = device({ id: 's', name: 'Klimaat', caps: [cap('measure_temperature', { title: 'Temperatuur', units: '°C', value: 20.5 })] });
const light: TileSpec = { kind: 'light', id: 't-1', deviceId: 'l', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' };
const reading: TileSpec = { kind: 'sensor', id: 't-2', deviceId: 's', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: false };
const flow: TileSpec = { kind: 'flow', id: 't-3', flowId: 'f', flowKind: 'flow', size: 'single' };

async function show(spec: TileSpec, editing = false) {
  const fake = fakeContext([lamp, sensor], {}, [{ id: 'f', name: 'Alles uit', kind: 'flow', startable: true }]);
  const tile = createTile(spec, fake.ctx, 'comfortable') as TileElement;
  tile.editing = editing;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile };
}
const face = (tile: TileElement) => inside(tile, '.face');

test('a single light has no slider and still toggles; the state shows the level', async () => {
  const { tile, actions } = await show({ ...light, size: 'single' });
  expect(tile.shadowRoot!.querySelector('mh-slider')).toBeNull();
  expect(tile.hasAttribute('wide')).toBe(false);
  expect(tile.shadowRoot!.textContent).toContain('Aan · 80%');
  inside(tile, '.tile').click();
  expect(actions.toggle).toHaveBeenCalledTimes(1);
  expect((await show(light)).tile.shadowRoot!.querySelector('mh-slider')).not.toBeNull();
});

test('a wide sensor spans two columns with the same content', async () => {
  const { tile } = await show({ ...reading, size: 'wide' });
  expect(tile.hasAttribute('wide')).toBe(true);
  expect(tile.shadowRoot!.textContent).toContain('20,5');
  expect(tile.shadowRoot!.querySelector('mh-slider')).toBeNull();
});

test('the sizes each kind can have', () => {
  expect(tileSizes('light')).toEqual(['wide', 'single']);
  expect(tileSizes('multi')).toEqual(['wide']);
  expect(tileSizes('flow')).toEqual(['single']);
  for (const kind of ['switch', 'sensor', 'tank', 'button', 'generic'] as const) expect([kind, tileSizes(kind)]).toEqual([kind, ['single', 'wide']]);
});

test('while editing a tile switches nothing and reports tile-menu', async () => {
  const { tile, actions } = await show(light, true);
  const menus = record<{ tileId: string }>(document.body, 'tile-menu');
  inside(tile, '.tile').click();
  key(face(tile), 'Enter');
  key(face(tile), ' ');
  expect(menus).toEqual([{ tileId: 't-1' }, { tileId: 't-1' }, { tileId: 't-1' }]);
  expect(actions.toggle).not.toHaveBeenCalled();
});

test('while editing the slider, Meer and the long press are off', async () => {
  vi.useFakeTimers();
  const { tile, actions } = await show(light, true);
  expect(inside(tile, 'mh-slider').hasAttribute('inert')).toBe(true);
  expect(tile.shadowRoot!.querySelector('.more')).toBeNull();
  const box = inside(tile, '.tile');
  const menus = record(document.body, 'tile-menu');
  box.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, bubbles: true, composed: true }));
  vi.advanceTimersByTime(800);
  box.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, composed: true }));
  box.click();
  box.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  expect(actions.openDevice).not.toHaveBeenCalled();
  expect(menus).toHaveLength(1);
  // and back again
  tile.editing = false;
  await settle(tile);
  expect(inside(tile, 'mh-slider').hasAttribute('inert')).toBe(false);
  expect(tile.shadowRoot!.querySelector('.more')).not.toBeNull();
});

test('while editing tiles have a grip and a name for screen readers', async () => {
  for (const spec of [light, reading]) {
    const { tile } = await show(spec, true);
    expect(tile.shadowRoot!.querySelector('.grip')).not.toBeNull();
    expect(face(tile).getAttribute('role')).toBe('button');
    expect(face(tile).hasAttribute('aria-pressed')).toBe(false);
    expect(face(tile).getAttribute('aria-label')).toBe(`${spec === light ? 'Plafond' : 'Klimaat'}, menu openen`);
    expect(tile.hasAttribute('editing')).toBe(true);
  }
  expect((await show(reading)).tile.shadowRoot!.querySelector('.grip')).toBeNull();
});

test('while editing a flow starts nothing and reports tile-menu', async () => {
  const { tile, actions } = await show(flow, true);
  const menus = record<{ tileId: string }>(document.body, 'tile-menu');
  const button = inside(tile, 'button');
  expect(button.getAttribute('aria-label')).toBe('Alles uit, menu openen');
  button.click();
  expect(menus).toEqual([{ tileId: 't-3' }]);
  expect(actions.startFlow).not.toHaveBeenCalled();
});

test('a flow without the right to start it can be moved all the same', async () => {
  const { tile, state } = await show(flow, true);
  state.canStartFlows = false;
  tile.requestUpdate();
  await settle(tile);
  expect((inside(tile, 'button') as HTMLButtonElement).disabled).toBe(false);
});

test('a tile stays live while editing', async () => {
  const { tile, store, flush } = await show(light, true);
  store.apply({ type: 'capability', deviceId: 'l', capabilityId: 'onoff', value: false, at: null });
  flush();
  await settle(tile);
  expect(tile.getAttribute('state')).toBe('off');
});

test('an own name and icon go before those of the device; an unknown icon falls back', () => {
  const own = tileView({ ...reading, label: 'Binnen', icon: 'cabin' } as never, sensor, t);
  expect([own.name, own.icon]).toEqual(['Binnen', 'cabin']);
  expect(own.ariaLabel).toContain('Binnen');
  const unknown = tileView({ ...reading, label: null, icon: 'icon_of_later' } as never, sensor, t);
  expect([unknown.name, unknown.icon]).toEqual(['Klimaat', 'thermostat']);
  // an icon of the app that is not in the library is no choice either
  expect(tileView({ ...reading, icon: 'close' } as never, sensor, t).icon).toBe('thermostat');
  // an unreachable device keeps saying so
  expect(tileView({ ...reading, label: 'Binnen', icon: 'cabin' } as never, { ...sensor, available: false }, t)).toMatchObject({ name: 'Binnen', icon: 'link_off', state: 'unavailable' });
});

test('a name with markup in it is shown as text', async () => {
  const { tile } = await show({ ...reading, label: '<img src=x onerror=alert(1)>' });
  expect(inside(tile, '.name').textContent).toBe('<img src=x onerror=alert(1)>');
  expect(tile.shadowRoot!.querySelector('img')).toBeNull();
});

test('the grip never lies over what the tile shows: compact tiles and wide heads keep room for it', async () => {
  const { tile } = await show(light, true);
  const css = (tile.constructor as unknown as { styles: unknown }).styles as { cssText?: string }[];
  const text = css.flat(3).map((part) => (part as { cssText?: string }).cssText ?? '').join('\n');
  expect(text).toMatch(/:host\(\[editing\]\[density="compact"\]\) \.tile\s*\{[^}]*padding-right/);
  expect(text).toMatch(/:host\(\[editing\]\) \.head\s*\{[^}]*padding-right/);
});
