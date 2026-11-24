// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import { cap, device } from '../../helpers/build';
import { inside } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

const spec = { kind: 'switch', id: 'p:switch', deviceId: 'p', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: 'measure_power' } as const;

async function setup() {
  const plug = device({ id: 'p', name: 'Koelkast', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_power', { units: 'W', decimals: 2, value: 45.37 })] });
  const fake = fakeContext([plug]);
  const tile = createTile(spec, fake.ctx, 'comfortable') as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile };
}

test('a switch tile shows its detail value', async () => {
  const { tile } = await setup();
  expect(inside(tile, '.state').textContent).toContain('Aan · 45 W');
  expect(inside(tile, '.name').textContent).toBe('Koelkast');
  expect(tile.hasAttribute('wide')).toBe(false);
});

test('a tap toggles the switch', async () => {
  const { tile, actions } = await setup();
  inside(tile, '.tile').click();
  expect(actions.toggle).toHaveBeenCalledWith(spec);
});

test('a switch tile has no slider', async () => {
  const { tile } = await setup();
  expect(tile.shadowRoot!.querySelector('mh-slider')).toBeNull();
});
