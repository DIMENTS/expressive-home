// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import type { WidgetTileSpec } from '../../../src/dashboard/types';
import type { MhWidgetTile } from '../../../src/ui/tiles/widget-tile';
import type { Density } from '../../../src/theme/types';
import { readWeather, type Weather } from '../../../src/widgets/weather';
import type { ReadState } from '../../../src/widgets/live-reads';
import { inside, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

const NOW = new Date(2026, 10, 25, 10, 8);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const at = (h: number, days = 0) => new Date(2026, 10, 25 + days, h, 0).getTime() / 1000;
const raw = {
  when: new Date(2026, 10, 25, 10, 0).toISOString(), iconId: 'clouds_heavy_day', state: 'Geheel bewolkt', temperature: -0.7, temperatureMax: 0.2, temperatureMin: -2.6, temperatureUnits: '°C',
  forecastHourly: [10, 11, 12, 13, 14].map((h) => ({ time: at(h), iconId: h === 13 ? 'rain_light_day' : 'clear_day', temperature: h - 10, temperatureMax: h - 10, temperatureMin: h - 11 })),
  forecast: [1, 2, 3, 4, 5, 6].map((d) => ({ time: at(12, d), iconId: 'clouds_light_day', temperature: d, temperatureMax: d + 2, temperatureMin: d - 3 })),
};

function fakeSource(state: ReadState<Weather>) {
  const listeners = new Set<(s: ReadState<Weather>) => void>();
  let current = state;
  return {
    get: () => current, refresh: () => {},
    listen: vi.fn((listener: (s: ReadState<Weather>) => void) => { listeners.add(listener); listener(current); return () => { listeners.delete(listener); }; }),
    set(next: ReadState<Weather>) { current = next; for (const l of [...listeners]) l(next); },
    count: () => listeners.size,
  };
}

const spec = (size: 'single' | 'wide', settings: WidgetTileSpec['settings'] = {}): WidgetTileSpec => ({ kind: 'widget', id: 'w-1', size, widget: 'weather', settings });

async function setup(s: WidgetTileSpec, state: ReadState<Weather> = { value: readWeather(raw), at: NOW.getTime(), error: null }, density: Density = 'comfortable') {
  const fake = fakeContext([]);
  const source = fakeSource(state);
  fake.ctx.widgets = { boards: () => [], openBoard: () => {}, weather: source as never };
  const tile = createTile(s, fake.ctx, density) as MhWidgetTile;
  document.body.append(tile);
  await tile.updateComplete;
  return { tile, source };
}

const texts = (tile: HTMLElement, selector: string) => [...tile.shadowRoot!.querySelectorAll(selector)].map((node) => node.textContent?.trim());

test('narrow: the weather of now, its state in the words of the dashboard, and the highest and lowest of today', async () => {
  const { tile } = await setup(spec('single'));
  expect(inside(tile, '.weather .temp').textContent).toBe('-1°');
  expect(inside(tile, '.weather .sky').textContent).toBe('Bewolkt');
  expect(inside(tile, '.weather .range').textContent?.replace(/\s+/g, ' ').trim()).toBe('↑ 0° · ↓ -3°');
  expect(inside(tile, '.weather').getAttribute('aria-label')).toBe('Weer: -1 graad, bewolkt, vandaag hoogstens 0 graden en laagstens -3 graden');
  expect(inside(tile, '.weather .range').getAttribute('aria-hidden')).toBe('true');
  expect(tile.shadowRoot!.querySelector('.hours')).toBeNull();
});

test('wide: also the four hours after the running one, each to be read out', async () => {
  const { tile } = await setup(spec('wide'));
  expect(texts(tile, '.hours .when')).toEqual(['11:00', '12:00', '13:00', '14:00']);
  expect(texts(tile, '.hours .deg')).toEqual(['1°', '2°', '3°', '4°']);
  expect(inside(tile, '.hours').getAttribute('aria-label')).toBe('De komende uren');
  expect(tile.shadowRoot!.querySelectorAll('.hours li')[2]!.getAttribute('aria-label')).toBe('13:00: 3 graden, regen');
  expect(tile.shadowRoot!.querySelector('.days')).toBeNull();
  expect(tile.style.getPropertyValue('grid-row')).toBe('');
});

test('wide with the coming days: a second row with five days after today', async () => {
  const { tile } = await setup(spec('wide', { days: true }));
  expect(texts(tile, '.days .when')).toEqual(['do', 'vr', 'za', 'zo', 'ma']);
  expect(texts(tile, '.days .hi')).toEqual(['3°', '4°', '5°', '6°', '7°']);
  expect(tile.shadowRoot!.querySelectorAll('.days li')[0]!.getAttribute('aria-label')).toBe('donderdag: hoogstens 3 graden, laagstens -2 graden, half bewolkt');
  expect(tile.style.getPropertyValue('grid-row')).toBe('span 2');
});

test('the days are for a wide widget only; compact is one line without hours or days', async () => {
  const narrow = await setup(spec('single', { days: true }));
  expect([narrow.tile.shadowRoot!.querySelector('.days'), narrow.tile.style.getPropertyValue('grid-row')]).toEqual([null, '']);
  document.body.replaceChildren();
  const compact = await setup(spec('wide', { days: true }), undefined, 'compact');
  expect(compact.tile.shadowRoot!.querySelector('.weather.line')).not.toBeNull();
  expect([compact.tile.shadowRoot!.querySelector('.hours'), compact.tile.shadowRoot!.querySelector('.days'), compact.tile.style.getPropertyValue('grid-row')]).toEqual([null, null, '']);
});

test('old weather says when it was; none, gone or not allowed is said as such', async () => {
  const { tile, source } = await setup(spec('single'));
  vi.setSystemTime(new Date(2026, 10, 25, 11, 40));
  source.set({ value: readWeather(raw), at: Date.now(), error: null });
  await settle(tile);
  expect(inside(tile, '.weather .when-old').textContent).toBe('om 10:00');
  vi.setSystemTime(new Date(2026, 10, 25, 16, 0));
  source.set({ value: readWeather(raw), at: Date.now(), error: 'failed' });
  await settle(tile);
  // on the tile a short reason on one line, so it keeps its height; the whole sentence is read out
  expect([inside(tile, '.weather .none').textContent, inside(tile, '.weather').getAttribute('aria-label')]).toEqual(['Geen internet', 'Geen weer: de Homey heeft geen internet']);
  source.set({ value: null, at: null, error: 'no-right' });
  await settle(tile);
  expect([inside(tile, '.weather .none').textContent, inside(tile, '.weather').getAttribute('aria-label')]).toEqual(['Geen recht op de locatie', 'Geen weer: deze sleutel mag de locatie niet lezen']);
  source.set({ value: null, at: null, error: null });
  await settle(tile);
  expect(inside(tile, '.weather').getAttribute('aria-label')).toBe('Weer wordt opgehaald');
});

test('the tile listens to the weather while it is on the page, and only then', async () => {
  const { tile, source } = await setup(spec('wide'));
  expect(source.count()).toBe(1);
  tile.remove();
  expect(source.count()).toBe(0);
  document.body.append(tile);
  await settle(tile);
  expect(source.count()).toBe(1);
});

test('compact and narrow: only the icon, the temperature and the state, from the left', async () => {
  const { tile } = await setup(spec('single'), undefined, 'compact');
  expect(tile.shadowRoot!.querySelector('.weather.line .range')).toBeNull();
  expect(inside(tile, '.weather.line .sky').textContent).toBe('Bewolkt');
});

test('compact, no weather is one line too', async () => {
  const { tile } = await setup(spec('wide'), { value: null, at: null, error: 'failed' }, 'compact');
  expect(tile.shadowRoot!.querySelector('.weather.line .none')?.textContent).toBe('Geen internet');
});
