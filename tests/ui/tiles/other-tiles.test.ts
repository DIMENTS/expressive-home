// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile, tileTag } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import type { TileSpec } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import type { ShownDensity } from '../../../src/theme/types';
import { cap, device } from '../../helpers/build';
import { inside } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

async function setup(spec: TileSpec, dev: Device, density: ShownDensity = 'comfortable') {
  const fake = fakeContext([dev]);
  const tile = createTile(spec, fake.ctx, density) as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile };
}

const climate = device({ id: 'k', name: 'Klimaatsensor', deviceClass: 'sensor', caps: [
  cap('measure_temperature', { title: 'Temperatuur', units: '°C', decimals: 1, value: 20.5 }), cap('measure_humidity', { title: 'Luchtvochtigheid', units: '%', value: 52 }),
] });

test('a sensor tile shows its value and opens the device window on a tap', async () => {
  const { tile, actions } = await setup({ kind: 'sensor', id: 'k:t', deviceId: 'k', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: true }, climate);
  expect(inside(tile, '.value').textContent).toContain('20,5');
  expect(inside(tile, '.value .unit').textContent).toBe('°C');
  expect(inside(tile, '.state').textContent).toContain('Temperatuur');
  expect(inside(tile, '[role="button"]').getAttribute('aria-label')).toBe('Klimaatsensor, Temperatuur 20,5 °C');
  inside(tile, '.tile').click();
  expect(actions.openDevice).toHaveBeenCalledWith('k');
});

const tankDevice = device({ id: 't', name: 'Schoon water', caps: [
  cap('tank_level', { units: '%', value: 64 }), cap('measure_content_volume', { units: 'L', value: 58 }), cap('tank_capacity', { units: 'L', value: 90 }),
] });
const tankSpec: TileSpec = { kind: 'tank', id: 't:tank', deviceId: 't', size: 'single', levelCapabilityId: 'tank_level', volumeCapabilityId: 'measure_content_volume', capacityCapabilityId: 'tank_capacity' };

test('a tank tile exposes its level for the bar', async () => {
  const { tile } = await setup(tankSpec, tankDevice);
  expect(tile.style.getPropertyValue('--_level')).toBe('64');
  expect(inside(tile, '.value').textContent).toContain('64');
  expect(inside(tile, '.state').textContent).toContain('58 van 90 liter');
  expect(tile.shadowRoot!.querySelector('.bar')).not.toBeNull();
});

test('a tank without a level has an empty bar', async () => {
  const { tile } = await setup({ ...tankSpec, levelCapabilityId: null, capacityCapabilityId: null } as TileSpec, tankDevice);
  expect(tile.style.getPropertyValue('--_level')).toBe('0');
  expect(inside(tile, '.value').textContent).toContain('–');
});

test('a multi-value tile shows three cells', async () => {
  const starlink = device({ id: 's', name: 'Starlink', caps: [
    cap('status', { type: 'string', title: 'Status', value: 'Online' }), cap('download', { title: 'Download', units: 'Mbit/s', value: 182.4 }),
    cap('upload', { title: 'Upload', units: 'Mbit/s', value: 21 }), cap('latency', { title: 'Vertraging', units: 'ms', value: 34 }),
  ] });
  const { tile } = await setup({ kind: 'multi', id: 's:multi', deviceId: 's', size: 'wide', capabilityIds: ['download', 'upload', 'latency'] }, starlink);
  const cells = [...tile.shadowRoot!.querySelectorAll('.cell')];
  expect(cells).toHaveLength(3);
  expect(cells.map((c) => c.querySelector('.label')!.textContent)).toEqual(['Download', 'Upload', 'Vertraging']);
  expect(cells[0]!.querySelector('b')!.textContent).toContain('182');
  expect(inside(tile, '.state').textContent).toContain('Online');
  expect(tile.hasAttribute('wide')).toBe(true);
});

test('a generic tile on a danger alarm is marked danger', async () => {
  const smoke = device({ id: 'r', name: 'Rookmelder', deviceClass: 'sensor', caps: [cap('alarm_smoke', { type: 'boolean', value: true })] });
  const { tile } = await setup({ kind: 'generic', id: 'r:generic', deviceId: 'r', size: 'single', capabilityId: 'alarm_smoke' }, smoke);
  expect(tile.getAttribute('state')).toBe('danger');
  expect(inside(tile, 'mh-icon').hasAttribute('filled')).toBe(true);
});

test('a button tile presses its capability', async () => {
  const bell = device({ id: 'b', name: 'Deurbel', deviceClass: 'button', caps: [cap('button', { type: 'boolean', setable: true, getable: false })] });
  const { tile, actions } = await setup({ kind: 'button', id: 'b:button', deviceId: 'b', size: 'single', capabilityId: 'button' }, bell);
  inside(tile, '.tile').click();
  expect(actions.press).toHaveBeenCalledWith('b', 'button');
  expect(actions.openDevice).not.toHaveBeenCalled();
});

test('every tile kind of the dashboard has a registered element', () => {
  for (const kind of ['light', 'switch', 'tank', 'button', 'sensor', 'multi', 'generic', 'flow'] as const) expect(tileTag(kind)).toMatch(/^mh-/);
});

test('on a phone only a tile with more values takes the whole width', async () => {
  const wide = { size: 'wide' } as const;
  const starlink = device({ id: 's', name: 'Starlink', caps: [cap('download', { title: 'Download', units: 'Mbit/s', value: 182.4 })] });
  const sensor = await setup({ kind: 'sensor', id: 'k:t', deviceId: 'k', ...wide, capabilityId: 'measure_temperature', showCapabilityTitle: true }, climate, 'phone');
  const tank = await setup({ ...tankSpec, ...wide } as TileSpec, tankDevice, 'phone');
  const multi = await setup({ kind: 'multi', id: 's:multi', deviceId: 's', ...wide, capabilityIds: ['download'], statusCapabilityId: null } as unknown as TileSpec, starlink, 'phone');
  expect([sensor.tile.wide, tank.tile.wide, multi.tile.wide]).toEqual([false, false, true]);
  expect((await setup({ ...tankSpec, ...wide } as TileSpec, tankDevice)).tile.wide).toBe(true);
});

test('on a phone a sensor keeps its name and what it measures, so two tiles of one device are told apart', async () => {
  const { tile } = await setup({ kind: 'sensor', id: 'k:t', deviceId: 'k', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: true }, climate, 'phone');
  expect([inside(tile, '.name').textContent, inside(tile, '.state').textContent!.trim()]).toEqual(['Klimaatsensor', 'Temperatuur']);
});
