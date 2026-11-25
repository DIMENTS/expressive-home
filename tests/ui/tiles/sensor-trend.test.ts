// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import type { TileElement } from '../../../src/ui/tiles/tile-base';
import type { TileSpec } from '../../../src/dashboard/types';
import type { HistorySeries, HistorySource } from '../../../src/homey/client';
import type { ShownDensity } from '../../../src/theme/types';
import { cap, device } from '../../helpers/build';
import { inside } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

/** A tile in view at once, as on a dashboard that is looked at. */
class InView {
  constructor(private readonly told: (entries: { isIntersecting: boolean }[]) => void) {}
  observe(): void { queueMicrotask(() => this.told([{ isIntersecting: true }])); }
  disconnect(): void {}
}

const climate = device({ id: 'k', name: 'Klimaatsensor', deviceClass: 'sensor', caps: [
  cap('measure_temperature', { title: 'Temperatuur', units: '°C', decimals: 1, value: 20.5 }),
] });
const source: HistorySource = { log: 'homey:device:k:measure_temperature', kind: 'device', type: 'number', deviceId: 'k', capabilityId: 'measure_temperature' };
const now = Date.now();
const series: HistorySeries = { start: now - 86_400_000, end: now, step: 300_000, updatesIn: null, points: [{ at: now - 7_200_000, value: 17.6 }, { at: now - 3_600_000, value: 23.1 }] };
const spec = (extra: Partial<Extract<TileSpec, { kind: 'sensor' }>> = {}): TileSpec => ({ kind: 'sensor', id: 'k:t', deviceId: 'k', size: 'wide', capabilityId: 'measure_temperature', showCapabilityTitle: false, ...extra });

async function setup(tileSpec: TileSpec, density: ShownDensity = 'comfortable') {
  vi.stubGlobal('IntersectionObserver', InView);
  const fake = fakeContext([climate]);
  const history = { sources: vi.fn(async () => [source]), series: vi.fn(async () => series), switches: vi.fn(async () => null) };
  fake.ctx.history = history;
  const tile = createTile(tileSpec, fake.ctx, density) as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  return { tile, history };
}

test('a wide sensor tile with "Verloop achter de waarde" shows the last 24 hours as a soft area, and says it', async () => {
  const { tile, history } = await setup(spec({ trend: true }));
  await vi.waitFor(() => expect(history.series).toHaveBeenCalledWith(source, 'last24Hours'));
  await vi.waitFor(() => expect(tile.shadowRoot!.querySelector('mh-chart')).not.toBeNull());
  const chart = inside(tile, 'mh-chart') as HTMLElement & { variant: string };
  expect(chart.variant).toBe('tile');
  await vi.waitFor(() => expect(inside(tile, '[role="button"]').getAttribute('aria-label')).toBe('Klimaatsensor, 20,5 °C, laatste 24 uur tussen 17,6 °C en 23,1 °C'));
});

test('no area without the choice, or in compact, where a tile is a row', async () => {
  for (const [tileSpec, density] of [[spec(), 'comfortable'], [spec({ trend: false }), 'comfortable'], [spec({ trend: true }), 'compact']] as const) {
    const { tile, history } = await setup(tileSpec, density);
    await new Promise((done) => { setTimeout(done, 10); });
    await tile.updateComplete;
    expect(tile.shadowRoot!.querySelector('mh-chart')).toBeNull();
    expect(history.series).not.toHaveBeenCalled();
    tile.remove();
  }
});

test('a tile out of view reads nothing', async () => {
  const fake = fakeContext([climate]);
  const history = { sources: vi.fn(async () => [source]), series: vi.fn(async () => series), switches: vi.fn(async () => null) };
  fake.ctx.history = history;
  vi.stubGlobal('IntersectionObserver', class { observe(): void {} disconnect(): void {} });
  const tile = createTile(spec({ trend: true }), fake.ctx, 'comfortable') as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  await new Promise((done) => { setTimeout(done, 10); });
  expect(history.sources).not.toHaveBeenCalled();
});

test('out of view it stops reading; switched on again it reads at once', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  let told: (entries: { isIntersecting: boolean }[]) => void = () => {};
  vi.stubGlobal('IntersectionObserver', class { constructor(fn: typeof told) { told = fn; } observe(): void { queueMicrotask(() => told([{ isIntersecting: true }])); } disconnect(): void {} });
  const fake = fakeContext([climate]);
  const history = { sources: vi.fn(async () => [source]), series: vi.fn(async () => series), switches: vi.fn(async () => null) };
  fake.ctx.history = history;
  const tile = createTile(spec({ trend: true }), fake.ctx, 'comfortable') as TileElement & { spec: TileSpec };
  document.body.append(tile);
  await vi.waitFor(() => expect(history.series).toHaveBeenCalledTimes(1));
  told([{ isIntersecting: false }]);
  vi.advanceTimersByTime(300_000);
  await Promise.resolve();
  expect(history.series).toHaveBeenCalledTimes(1);
  tile.spec = spec({ trend: false });
  await tile.updateComplete;
  tile.spec = spec({ trend: true });
  await vi.waitFor(() => expect(history.series).toHaveBeenCalledTimes(2));
  vi.useRealTimers();
});

test('a narrow tile and a tile on a phone can have the area too', async () => {
  for (const [tileSpec, density] of [[spec({ trend: true, size: 'single' }), 'comfortable'], [spec({ trend: true }), 'phone']] as const) {
    const { tile, history } = await setup(tileSpec, density);
    await vi.waitFor(() => expect(history.series).toHaveBeenCalled());
    await vi.waitFor(() => expect(tile.shadowRoot!.querySelector('mh-chart')).not.toBeNull());
    tile.remove();
  }
});
