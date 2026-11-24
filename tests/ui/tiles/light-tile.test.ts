// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import { cap, device } from '../../helpers/build';
import { HOLD_DIM_MS } from '../../../src/ui/parts/hold-dim';
import { inside, key, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';
import type { DashboardStatus } from '../../../src/ui/app/context';
import type { ShownDensity } from '../../../src/theme/types';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const spec = { kind: 'light', id: 'l:light', deviceId: 'l', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' } as const;
const lamp = (extra = {}) => device({ id: 'l', name: 'Plafond', deviceClass: 'light', ...extra, caps: [
  cap('onoff', { type: 'boolean', setable: true, value: true }), cap('dim', { setable: true, min: 0, max: 1, units: '%', value: 0.8 }),
] });

async function setup(dev = lamp(), status: Partial<DashboardStatus> = {}) {
  const fake = fakeContext([dev], status);
  const tile = createTile(spec, fake.ctx, 'comfortable') as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  return { ...fake, tile };
}

const face = (tile: TileElement) => inside(tile, '[role="button"]');

test('a tap on a lamp tile toggles it', async () => {
  const { tile, actions } = await setup();
  inside(tile, '.tile').click();
  expect(actions.toggle).toHaveBeenCalledWith(spec);
  expect(actions.openDevice).not.toHaveBeenCalled();
});

test('Enter and the space bar do what a tap does', async () => {
  const { tile, actions } = await setup();
  expect(key(face(tile), 'Enter').defaultPrevented).toBe(true);
  key(face(tile), ' ');
  expect(actions.toggle).toHaveBeenCalledTimes(2);
});

test('a long press opens the device window and does not toggle', async () => {
  vi.useFakeTimers();
  const { tile, actions } = await setup();
  const box = inside(tile, '.tile');
  box.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, bubbles: true, composed: true }));
  vi.advanceTimersByTime(500);
  box.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true, composed: true }));
  box.click();
  expect(actions.openDevice).toHaveBeenCalledWith('l');
  expect(actions.toggle).not.toHaveBeenCalled();
});

test('the More button opens the device window, is named after the device and does not toggle', async () => {
  const { tile, actions } = await setup();
  const more = inside(tile, '.more');
  expect(more.getAttribute('aria-label')).toBe('Meer over Plafond');
  more.click();
  expect(actions.openDevice).toHaveBeenCalledWith('l');
  expect(actions.toggle).not.toHaveBeenCalled();
});

test('the tile is a pressed button for assistive technology', async () => {
  const { tile } = await setup();
  expect(face(tile).getAttribute('aria-pressed')).toBe('true');
  expect(face(tile).getAttribute('aria-label')).toBe('Plafond, Aan · 80%');
  expect(face(tile).getAttribute('tabindex')).toBe('0');
  expect(tile.getAttribute('state')).toBe('on');
  expect(tile.hasAttribute('wide')).toBe(true);
});

test('dragging the slider reports the level and does not toggle', async () => {
  const { tile, actions } = await setup();
  const slider = inside(tile, 'mh-slider');
  slider.dispatchEvent(new CustomEvent('slide', { detail: { fraction: 0.42 }, bubbles: true, composed: true }));
  slider.dispatchEvent(new CustomEvent('commit', { detail: { fraction: 0.5 }, bubbles: true, composed: true }));
  expect(actions.slide.mock.calls).toEqual([['l', 'dim', 0.42, false], ['l', 'dim', 0.5, true]]);
  expect(actions.toggle).not.toHaveBeenCalled();
});

test('the slider follows the level and is grey while the lamp is off', async () => {
  const { tile } = await setup(device({ id: 'l', name: 'Plafond', deviceClass: 'light', caps: [
    cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, min: 0, max: 1, value: 0.6 }),
  ] }));
  const slider = inside(tile, 'mh-slider') as HTMLElement & { fraction: number; dimmed: boolean; label: string };
  expect(slider.fraction).toBe(0.6);
  expect(slider.dimmed).toBe(true);
  expect(slider.label).toBe('Helderheid Plafond');
});

test('a live change redraws only this tile', async () => {
  const { tile, store, flush } = await setup();
  store.apply({ type: 'capability', deviceId: 'l', capabilityId: 'onoff', value: false, at: null });
  flush();
  await settle(tile);
  expect(tile.getAttribute('state')).toBe('off');
  expect(inside(tile, '.state').textContent).toContain('Uit');
});

test('an unavailable device opens the window on a tap', async () => {
  const { tile, actions } = await setup(lamp({ available: false, unavailableMessage: 'Apparaat is offline' }));
  inside(tile, '.tile').click();
  expect(actions.openDevice).toHaveBeenCalledWith('l');
  expect(actions.toggle).not.toHaveBeenCalled();
  expect(tile.getAttribute('state')).toBe('unavailable');
  expect(face(tile).hasAttribute('aria-pressed')).toBe(false);
  expect(tile.shadowRoot!.querySelector('mh-slider')).toBeNull();
});

test('without a route the tile is marked stale', async () => {
  const { tile } = await setup(lamp(), { route: null });
  expect(tile.hasAttribute('stale')).toBe(true);
});

test('a tile stops listening when it leaves the page', async () => {
  const { tile, store, flush } = await setup();
  tile.remove();
  store.apply({ type: 'capability', deviceId: 'l', capabilityId: 'onoff', value: false, at: null });
  flush();
  await settle(tile);
  expect(tile.getAttribute('state')).toBe('on');
});

// Final review, issue 2: a release that is refused must not leave the handle where it was dropped.
test('a slider released while nothing changes in the store springs back to the real level', async () => {
  const { tile } = await setup(lamp(), { route: null });
  const slider = inside(tile, 'mh-slider') as HTMLElement & { fraction: number; updateComplete: Promise<unknown> };
  slider.fraction = 0.2;
  slider.dispatchEvent(new CustomEvent('commit', { detail: { fraction: 0.2 }, bubbles: true, composed: true }));
  await settle(tile);
  await settle(slider);
  expect(slider.fraction).toBe(0.8);
});

async function shown(density: ShownDensity) {
  const tile = createTile(spec, fakeContext([lamp()]).ctx, density) as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  return tile;
}

test('on a phone a lamp is as wide as the others and has no slider; its state tells the level', async () => {
  const tile = await shown('phone');
  expect([tile.wide, tile.hasAttribute('wide'), tile.shadowRoot!.querySelector('mh-slider'), inside(tile, '.state').textContent!.trim()]).toEqual([false, false, null, 'Aan · 80%']);
  tile.density = 'comfortable';
  await settle(tile);
  expect([tile.wide, tile.shadowRoot!.querySelector('mh-slider') !== null]).toEqual([true, true]);
  tile.density = 'phone';
  await settle(tile);
  expect([tile.wide, tile.shadowRoot!.querySelector('mh-slider')]).toEqual([false, null]);
});

// ----- holding and swiping -----

interface Dim { phase: string; tileId: string; level: number; percent: number; name: string; icon: string; box: { startY: number } }

const single = { ...spec, size: 'single' } as const;
const point = (target: Element, type: string, y: number) =>
  target.dispatchEvent(new PointerEvent(type, { clientX: 10, clientY: y, pointerId: 1, isPrimary: true, button: 0, bubbles: true, composed: true, cancelable: true }));

let now = 5_000_000;
async function held(dev = lamp(), status: Partial<DashboardStatus> = {}, tileSpec: typeof spec | typeof single = single, density: ShownDensity = 'comfortable') {
  vi.useFakeTimers({ now: (now += 60_000) });
  const fake = fakeContext([dev], status);
  const tile = createTile(tileSpec, fake.ctx, density) as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  const dims = record<Dim>(tile, 'dim');
  const box = inside(tile, '.tile');
  return { ...fake, tile, dims, box, hold: (y = 400) => { point(box, 'pointerdown', y); vi.advanceTimersByTime(HOLD_DIM_MS); } };
}

test('holding a lamp without a slider and swiping dims it live, and lifting keeps it', async () => {
  const h = await held();
  h.hold();
  expect(h.dims).toMatchObject([{ phase: 'start', tileId: 'l:light', level: 0.8, name: 'Plafond', box: { startY: 400 } }]);
  expect(h.actions.slide).not.toHaveBeenCalled();
  point(h.box, 'pointermove', 400 + 59);
  expect(h.actions.slide).toHaveBeenLastCalledWith('l', 'dim', 0.55, false);
  point(h.box, 'pointermove', 400 + 118);
  point(h.box, 'pointermove', 400 + 120);
  expect(h.actions.slide).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(200);
  expect(h.actions.slide).toHaveBeenCalledTimes(2);
  point(h.box, 'pointermove', 400 + 177);
  point(h.box, 'pointerup', 400 + 177);
  expect(h.actions.slide).toHaveBeenLastCalledWith('l', 'dim', 0.05, true);
  expect(h.dims.map((d) => [d.phase, Number(d.level.toFixed(2))])).toEqual([['start', 0.8], ['move', 0.55], ['move', 0.3], ['move', 0.29], ['move', 0.05], ['end', 0.05]]);
  h.box.click();
  vi.advanceTimersByTime(2000);
  expect([h.actions.toggle.mock.calls.length, h.actions.openDevice.mock.calls.length, h.actions.slide.mock.calls.length]).toEqual([0, 0, 3]);
});

test('holding and lifting without swiping opens the window of the lamp, and dims nothing', async () => {
  const h = await held();
  h.hold();
  point(h.box, 'pointermove', 403);
  point(h.box, 'pointerup', 403);
  h.box.click();
  expect([h.actions.slide.mock.calls.length, h.actions.openDevice.mock.calls, h.actions.toggle.mock.calls.length]).toEqual([0, [['l']], 0]);
  expect(h.dims.map((d) => d.phase)).toEqual(['start', 'end']);
});

test('a touch that the system takes over leaves the level where it is, and opens nothing', async () => {
  const h = await held();
  h.hold();
  point(h.box, 'pointermove', 340);
  point(h.box, 'pointercancel', 340);
  expect([h.actions.slide.mock.lastCall, h.actions.openDevice.mock.calls.length]).toEqual([['l', 'dim', 1, true], 0]);
  h.hold();
  point(h.box, 'pointercancel', 400);
  expect([h.actions.slide.mock.lastCall![3], h.actions.openDevice.mock.calls.length, h.dims.at(-1)!.phase]).toEqual([true, 0, 'end']);
});

test('a lamp that is off begins at the bottom', async () => {
  const off = device({ id: 'l', name: 'Plafond', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, min: 0, max: 1, units: '%', value: 0.8 })] });
  const h = await held(off);
  h.hold();
  expect(h.dims[0]!.level).toBe(0);
});

test('a tile that goes while it is dimmed keeps the level and opens nothing', async () => {
  const h = await held();
  h.hold();
  point(h.box, 'pointermove', 341);
  h.tile.remove();
  expect([h.actions.slide.mock.lastCall, h.actions.openDevice.mock.calls.length]).toEqual([['l', 'dim', 1, true], 0]);
});

test('without a connection or the right to control, holding opens the window at once', async () => {
  for (const status of [{ route: null }, { canControl: false }] as const) {
    const h = await held(lamp(), status);
    h.hold();
    expect([h.dims, h.actions.openDevice.mock.calls.length]).toEqual([[], 1]);
    point(h.box, 'pointerup', 400);
    document.body.replaceChildren();
  }
});

test('a lamp with a slider, one that cannot be reached and one that is arranged are held as before', async () => {
  const wide = await held(lamp(), {}, spec);
  wide.hold();
  expect([wide.dims, wide.actions.openDevice.mock.calls.length]).toEqual([[], 0]);
  vi.advanceTimersByTime(150);
  expect([wide.dims, wide.actions.openDevice.mock.calls.length]).toEqual([[], 1]);
  document.body.replaceChildren();
  const away = await held(lamp({ available: false }));
  away.hold();
  expect([away.dims, away.actions.openDevice.mock.calls.length]).toEqual([[], 1]);
  document.body.replaceChildren();
  const arranged = await held();
  arranged.tile.editing = true;
  await arranged.tile.updateComplete;
  arranged.hold();
  vi.advanceTimersByTime(500);
  expect([arranged.dims, arranged.actions.openDevice.mock.calls.length]).toEqual([[], 0]);
});

test('a wide lamp tile on a phone is dimmed by holding, and has its slider again when the window is wide', async () => {
  const h = await held(lamp(), {}, spec, 'phone');
  h.hold();
  expect(h.dims.map((d) => d.phase)).toEqual(['start']);
  point(h.box, 'pointercancel', 400);
  h.tile.density = 'comfortable';
  await h.tile.updateComplete;
  h.hold();
  expect(h.dims.map((d) => d.phase)).toEqual(['start', 'end']);
  point(h.box, 'pointerup', 400);
});

const lampThatIsOff = () => device({ id: 'l', name: 'Plafond', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, min: 0, max: 1, units: '%', value: 0.8 })] });

test('a finger that slips down on a lamp that is off leaves its brightness alone', async () => {
  const h = await held(lampThatIsOff());
  h.hold();
  point(h.box, 'pointermove', 430);
  point(h.box, 'pointerup', 430);
  expect([h.actions.slide.mock.calls.length, h.actions.openDevice.mock.calls.length]).toEqual([0, 0]);
  // up and down again is what the owner did
  h.hold();
  point(h.box, 'pointermove', 380);
  point(h.box, 'pointermove', 410);
  point(h.box, 'pointerup', 410);
  expect(h.actions.slide.mock.lastCall).toEqual(['l', 'dim', 0, true]);
});

test('the dimmer tells what the tile will say of the value the lamp gets, also with a range and steps of its own', async () => {
  const of = async (range: object, value: number) => {
    const h = await held(device({ id: 'l', name: 'Plafond', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('dim', { setable: true, units: '%', ...range, value })] }));
    h.hold();
    const shown = [h.dims.at(-1)!.percent];
    for (const y of [430, 800]) {
      point(h.box, 'pointermove', y);
      shown.push(h.dims.at(-1)!.percent);
    }
    const sent = h.actions.slide.mock.calls.map((call) => call[2] as number);
    point(h.box, 'pointercancel', 800);
    document.body.replaceChildren();
    return [shown, sent];
  };
  expect(await of({ min: 0, max: 1, step: 0.25 }, 0.5)).toEqual([[50, 25, 0], [0.25]]);
  expect(await of({ min: 0.1, max: 1 }, 0.55)).toEqual([[50, 37, 0], [0.433]]);
  expect(await of({ min: 0, max: 1 }, 0.1)).toEqual([[10, 0, 0], [0]]);
});
