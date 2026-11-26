// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import { createTile } from '../../../src/ui/tiles/registry';
import type { WidgetTileSpec } from '../../../src/dashboard/types';
import type { MhWidgetTile } from '../../../src/ui/tiles/widget-tile';
import type { Density } from '../../../src/theme/types';
import { readEnergyReport, type EnergyPeriod, type EnergyReport } from '../../../src/widgets/energy';
import type { ReadState } from '../../../src/widgets/live-reads';
import { inside, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';
import { cap, device } from '../../helpers/build';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 25, 20, 8)); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const hourKey = (h: number) => new Date(2026, 10, 25, h).toISOString();
const sub = (consumed: number | null, generated: number | null) => ({ electricity: { consumedPeriod: consumed, generatedPeriod: generated } });
const day = {
  electricity: { consumedPeriod: 4.82, generatedPeriod: 6.2, batteryChargedPeriod: 2.5, batteryDischargedPeriod: 1.3, importedPeriod: null, exportedPeriod: null,
    devices: { consumed: { fridge: 1.1, boiler: 0.9, hob: 0.7, heater: 0.6, charger: 0.3 } } },
  subReports: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [hourKey(h), sub(h === 18 ? 0.6 : 0.2, h === 13 ? 0.9 : h >= 8 && h <= 16 ? 0.5 : 0)])),
};

function fakeSources(state: ReadState<EnergyReport>) {
  const listening: Record<string, number> = {};
  const make = (period: EnergyPeriod) => ({
    get: () => state, refresh: () => {},
    listen: (listener: (s: ReadState<EnergyReport>) => void) => { listening[period] = (listening[period] ?? 0) + 1; listener(state); return () => { listening[period]! -= 1; }; },
  });
  const sources = { day: make('day'), week: make('week'), month: make('month') };
  return { energy: (period: EnergyPeriod) => sources[period], listening };
}

const spec = (size: 'single' | 'wide', settings: WidgetTileSpec['settings'] = {}): WidgetTileSpec => ({ kind: 'widget', id: 'e-1', size, widget: 'energy', settings });

async function setup(s: WidgetTileSpec, state: ReadState<EnergyReport> = { value: readEnergyReport(day), at: Date.now(), error: null }, density: Density = 'comfortable') {
  const devices = [['fridge', 'Koelkast'], ['boiler', 'Boiler'], ['hob', 'Inductie'], ['heater', 'Verwarming'], ['charger', 'Lader']]
    .map(([id, name]) => device({ id: id!, name: name!, deviceClass: 'socket', caps: [cap('measure_power', { value: 10 })] }));
  const fake = fakeContext(devices);
  const sources = fakeSources(state);
  fake.ctx.widgets = { boards: () => [], openBoard: () => {}, energy: sources.energy as never };
  const tile = createTile(s, fake.ctx, density) as MhWidgetTile;
  document.body.append(tile);
  await tile.updateComplete;
  return { tile, sources };
}

const texts = (tile: HTMLElement, selector: string) => [...tile.shadowRoot!.querySelectorAll(selector)].map((node) => node.textContent?.trim().replace(/\s+/g, ' '));

test('narrow: what was used today, and what else the hub knows: sun and battery, no grid where it has none', async () => {
  const { tile } = await setup(spec('single'));
  expect(inside(tile, '.energy .kwh').textContent).toBe('4,8');
  // narrow: only the period under the number, so it fits; the line with the rest has a name of its own
  expect(inside(tile, '.energy .used').textContent).toBe('vandaag');
  expect(inside(tile, '.energy .extra').textContent?.replace(/\s+/g, ' ').trim()).toBe('zon 6,2 · accu +1,2');
  expect(tile.shadowRoot!.querySelector('.energy .more')).toBeNull();
  expect(inside(tile, '.energy').getAttribute('aria-label')).toBe('Energie vandaag: 4,8 kilowattuur verbruikt, 6,2 van de zon, accu +1,2');
  expect(tile.shadowRoot!.querySelector('svg')).toBeNull();
});

test('wide: the bars per hour, sun above and use below, said in words', async () => {
  const { tile } = await setup(spec('wide'));
  const svg = inside(tile, '.energy svg');
  expect(svg.querySelectorAll('rect.sun').length).toBe(9);
  expect(svg.querySelectorAll('rect.use').length).toBe(24);
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(inside(tile, '.energy .chart-say').textContent).toBe('Meeste verbruik om 18:00, meeste zon om 13:00');
  expect(tile.style.getPropertyValue('grid-row')).toBe('');
});

test('another period: the week, per day', async () => {
  const week = { electricity: { consumedPeriod: 28 }, subReports: Object.fromEntries(['2026-11-23', '2026-11-24', '2026-11-25'].map((d, i) => [d, sub(4 + i, null)])) };
  const { tile, sources } = await setup(spec('wide', { period: 'week' }), { value: readEnergyReport(week), at: Date.now(), error: null });
  expect(sources.listening).toEqual({ week: 1 });
  // wide: room for the whole word
  expect(inside(tile, '.energy .used').textContent).toBe('verbruikt deze week');
  expect(inside(tile, '.energy svg').querySelectorAll('rect.use').length).toBe(3);
  expect(inside(tile, '.energy .chart-say').textContent).toBe('Meeste verbruik op woensdag');
});

test('wide with per device: a second row with the four largest and the rest', async () => {
  const { tile } = await setup(spec('wide', { devices: true }));
  expect(texts(tile, '.devices .name')).toEqual(['Koelkast', 'Boiler', 'Inductie', 'Verwarming', 'Overig']);
  expect(texts(tile, '.devices .num')).toEqual(['1,1 kWh', '0,9 kWh', '0,7 kWh', '0,6 kWh', '1,5 kWh']);
  expect(tile.style.getPropertyValue('grid-row')).toBe('span 2');
});

test('compact is one line; nothing yet, not allowed and empty are said', async () => {
  const compact = await setup(spec('wide', { devices: true }), undefined, 'compact');
  expect(compact.tile.shadowRoot!.querySelector('.energy.line')).not.toBeNull();
  expect([compact.tile.shadowRoot!.querySelector('svg'), compact.tile.style.getPropertyValue('grid-row')]).toEqual([null, '']);
  document.body.replaceChildren();
  const empty = await setup(spec('single'), { value: readEnergyReport({ electricity: {} }), at: Date.now(), error: null });
  const said = (tile: HTMLElement) => [inside(tile, '.energy .none').textContent, inside(tile, '.energy').getAttribute('aria-label')];
  expect(said(empty.tile)).toEqual(['Nog niets', 'Nog geen energie van de Homey voor deze periode']);
  document.body.replaceChildren();
  const refused = await setup(spec('single'), { value: null, at: null, error: 'no-right' });
  expect(said(refused.tile)).toEqual(['Geen recht op Energy', 'Geen energie: deze sleutel mag Homey Energy niet lezen']);
  document.body.replaceChildren();
  const none = await setup(spec('single'), { value: null, at: null, error: 'none' });
  expect(said(none.tile)).toEqual(['Geen Homey Energy', 'Geen energie: deze Homey heeft geen Homey Energy']);
  document.body.replaceChildren();
  const away = await setup(spec('single'), { value: null, at: null, error: 'failed' }, 'compact');
  expect(away.tile.shadowRoot!.querySelector('.energy.line .none')?.textContent).toBe('Geen antwoord');
  document.body.replaceChildren();
  const loading = await setup(spec('single'), { value: null, at: null, error: null });
  expect(inside(loading.tile, '.energy').getAttribute('aria-label')).toBe('Energie wordt opgehaald');
});

test('a period chosen anew listens to that period instead', async () => {
  const { tile, sources } = await setup(spec('single'));
  tile.spec = spec('single', { period: 'month' });
  await settle(tile);
  expect(sources.listening).toEqual({ day: 0, month: 1 });
});

test('compact and narrow: only the number of kWh', async () => {
  const { tile } = await setup(spec('single'), undefined, 'compact');
  expect(tile.shadowRoot!.querySelector('.energy.line .used')).toBeNull();
  expect(inside(tile, '.energy.line .kwh').textContent).toBe('4,8');
});
