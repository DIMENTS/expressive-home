// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import type { DeviceTileSpec, HouseKind } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import type { ShownDensity } from '../../../src/theme/types';
import type { MhHoldButton } from '../../../src/ui/parts/hold-button';
import '../../../src/ui/tiles/index';
import { createTile, tileSizes } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import { record } from '../../helpers/mount';
import { appliances, cars, chargers, fans, vacuums } from '../../helpers/devices';
import { fakeContext } from '../../helpers/ui-context';

// The tiles of a fan, a vacuum cleaner, white goods, a charge point and a car: narrow ones show, wide ones have buttons.

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

async function setup(kind: HouseKind, d: Device, { size = 'wide', density = 'comfortable' }: { size?: 'single' | 'wide'; density?: ShownDensity } = {}) {
  const fake = fakeContext([structuredClone(d)]);
  const spec: DeviceTileSpec = { kind, id: 't', deviceId: d.id, size };
  const tile = createTile(spec, fake.ctx, density) as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  const all = <E extends HTMLElement>(selector: string) => [...tile.shadowRoot!.querySelectorAll<E>(selector)];
  return {
    ...fake, tile, asked: record(tile, 'confirm-danger'), all,
    buttons: () => all('.controls button').map((b) => b.getAttribute('aria-label')),
    tap: (label: string) => all<HTMLButtonElement>('.controls button').find((b) => b.getAttribute('aria-label') === label)!.click(),
    slider: () => tile.shadowRoot!.querySelector<HTMLElement & { fraction: number; label: string; valueText: string }>('mh-slider'),
    holds: () => all<MhHoldButton>('mh-hold-button'),
  };
}
const fire = (element: HTMLElement, type: string) => element.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));

test('every new kind can be narrow and wide, and narrow it only shows', async () => {
  for (const kind of ['fan', 'vacuum', 'appliance', 'charger', 'car'] as const) expect(tileSizes(kind)).toEqual(['single', 'wide']);
  for (const [kind, d] of [['fan', fans.standing], ['vacuum', vacuums.full], ['appliance', appliances.washer], ['charger', chargers.full], ['car', cars.tesla]] as const) {
    const s = await setup(kind, d, { size: 'single' });
    expect([kind, s.tile.shadowRoot!.querySelector('.controls')]).toEqual([kind, null]);
    s.tile.remove();
  }
});

test('a fan: on and off, swinging and its speed', async () => {
  const s = await setup('fan', fans.standing);
  expect(s.buttons()).toEqual(['Ventilator aan of uit', 'Ventilator zwenken']);
  expect(s.all('.controls button')[1]!.getAttribute('aria-pressed')).toBe('true');
  expect([s.slider()!.fraction, s.slider()!.label, s.slider()!.valueText]).toEqual([0.6, 'Snelheid van Ventilator', '60%']);
  s.tap('Ventilator aan of uit');
  s.tap('Ventilator zwenken');
  expect(s.actions.setCapability.mock.calls).toEqual([['fan', 'onoff', false], ['fan', 'oscillating', false]]);
});

test('a vacuum cleaner: start and back to the dock; while it cleans, pause', async () => {
  const s = await setup('vacuum', vacuums.full);
  expect(s.buttons()).toEqual(['Robotstofzuiger starten', 'Robotstofzuiger naar het dock']);
  s.tap('Robotstofzuiger starten');
  expect(s.actions.setCapability.mock.calls).toEqual([['robot', 'vacuumcleaner_state', 'cleaning']]);
  document.body.replaceChildren();
  const busy = await setup('vacuum', vacuums.other);
  expect(busy.buttons()).toEqual(['Neato pauzeren', 'Neato naar het dock']);
});

test('white goods: switched off only by holding, with the progress beside it; on with one tap', async () => {
  const s = await setup('appliance', appliances.washer);
  const [off] = s.holds();
  expect([off!.guarded, off!.text, off!.short, off!.label]).toEqual([true, 'Houd vast om uit te zetten', 'Uitzetten', 'Wasmachine uitzetten']);
  expect(s.tile.shadowRoot!.querySelector('.controls .meter')).not.toBeNull();
  expect(s.tile.style.getPropertyValue('--_level')).toBe('60');
  fire(off!, 'ask');
  expect([s.asked, s.actions.guard.mock.calls]).toEqual([[{ deviceId: 'washer', capabilityId: 'onoff', value: false }], []]);
  fire(off!, 'go');
  expect(s.actions.guard.mock.calls).toEqual([['washer', 'onoff', false]]);
  document.body.replaceChildren();
  const plug = await setup('appliance', { ...appliances.plug, capabilities: { ...appliances.plug.capabilities, onoff: { ...appliances.plug.capabilities['onoff']!, value: false } } });
  const [on] = plug.holds();
  expect([on!.guarded, on!.text, on!.main]).toEqual([false, 'Aanzetten', true]);
  expect(plug.tile.shadowRoot!.querySelector('.controls .meter')).toBeNull();
});

test('a charge point: stopping only by holding; starting with one tap', async () => {
  const s = await setup('charger', chargers.full);
  const [stop] = s.holds();
  expect([stop!.guarded, stop!.text, stop!.label, stop!.icon]).toEqual([true, 'Houd vast om te stoppen', 'Laadpaal: laden stoppen', 'stop']);
  expect(s.all('.controls .session').map((e) => e.textContent)).toEqual(['12 kWh deze keer']);
  document.body.replaceChildren();
  const idle = await setup('charger', chargers.onoff);
  const [start] = idle.holds();
  expect([start!.guarded, start!.text, start!.icon]).toEqual([false, 'Laden', 'bolt']);
  fire(start!, 'go');
  expect(idle.actions.guard.mock.calls).toEqual([['chargeamps', 'onoff', true]]);
});

test('a car: its battery as a bar, and unlocking only by holding', async () => {
  const s = await setup('car', cars.tesla);
  expect(s.tile.style.getPropertyValue('--_level')).toBe('64');
  const [unlock] = s.holds();
  expect([s.holds().length, unlock!.guarded, unlock!.label]).toEqual([1, true, 'Auto ontgrendelen']);
  fire(unlock!, 'ask');
  expect(s.asked).toEqual([{ deviceId: 'tesla', capabilityId: 'locked', value: false }]);
  document.body.replaceChildren();
  const open = await setup('car', cars.kia);
  const [lock] = open.holds();
  expect([lock!.guarded, lock!.label, lock!.main]).toEqual([false, 'Niro vergrendelen', true]);
});

test('compact: the buttons beside the name, nothing more', async () => {
  const s = await setup('charger', chargers.full, { density: 'compact' });
  expect(s.holds()).toHaveLength(1);
  expect(s.tile.shadowRoot!.querySelector('.controls .session')).toBeNull();
});

test('a car that tells no battery has no bar, only its lock', async () => {
  const asleep = { ...cars.tesla, capabilities: { ...cars.tesla.capabilities, measure_battery: { ...cars.tesla.capabilities['measure_battery']!, value: null } } };
  const s = await setup('car', asleep);
  expect([s.tile.shadowRoot!.querySelector('.controls .meter'), s.holds().length]).toEqual([null, 1]);
});
