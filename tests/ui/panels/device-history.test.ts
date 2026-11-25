// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/panels/device-panel';
import type { MhDevicePanel } from '../../../src/ui/panels/device-panel';
import type { HistoryPeriod, HistorySeries, HistorySource } from '../../../src/homey/client';
import type { Device } from '../../../src/homey/types';
import type { HistoryAccess } from '../../../src/ui/app/history';
import { cap, device } from '../../helpers/build';
import { inside, mount, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

const climate = (): Device => device({ id: 'k', name: 'Klimaat', deviceClass: 'sensor', caps: [
  cap('measure_temperature', { title: 'Temperatuur', units: '°C', value: 21.5 }), cap('measure_humidity', { title: 'Vochtigheid', units: '%', value: 55 }),
  cap('meter_power', { title: 'Energie', units: 'kWh', value: 3 }), cap('alarm_contact', { type: 'boolean', title: 'Contact', value: false }),
] });
const src = (capabilityId: string, type: HistorySource['type'] = 'number'): HistorySource => ({ log: `homey:device:k:${capabilityId}`, kind: 'device', type, deviceId: 'k', capabilityId });
const now = Date.now();
const series = (value: number): HistorySeries => ({ start: now - 86_400_000, end: now, step: 300_000, updatesIn: null, points: Array.from({ length: 10 }, (_, i) => ({ at: now - (10 - i) * 300_000, value: value + i / 10 })) });

function history(sources: HistorySource[]) {
  const access = {
    sources: vi.fn(async () => sources),
    series: vi.fn(async (source: HistorySource, _period: HistoryPeriod) => series(source.capabilityId === 'measure_humidity' ? 50 : 20)),
    switches: vi.fn(async () => ({ changes: [{ at: now - 3_600_000, on: true }, { at: now - 1_800_000, on: false }] })),
  } satisfies HistoryAccess;
  return access;
}

async function open(sources: HistorySource[]) {
  const fake = fakeContext([climate()]);
  const access = history(sources);
  fake.ctx.history = access;
  const panel = await mount<MhDevicePanel>('mh-device-panel', { ctx: fake.ctx, deviceId: 'k' });
  await vi.waitFor(() => expect(access.sources).toHaveBeenCalled());
  // the group is loaded only where there is history; wait for it
  if (sources.length > 0) await vi.waitFor(() => expect(panel.shadowRoot!.querySelector('mh-device-history')).not.toBeNull(), { timeout: 5000 });
  await new Promise((done) => { setTimeout(done, 0); });
  await settle(panel);
  return { panel, access };
}
/** A part inside the group Verloop. */
const within = async (panel: MhDevicePanel, selector: string): Promise<HTMLElement> => {
  let found: HTMLElement | null = null;
  await vi.waitFor(() => { found = inside(panel, 'mh-device-history').shadowRoot!.querySelector<HTMLElement>(selector); expect(found).not.toBeNull(); });
  return found!;
};
const headings = (panel: MhDevicePanel) => [...panel.shadowRoot!.querySelectorAll('h3')].map((h) => h.textContent);

test('without history there is no group Verloop at all', async () => {
  const { panel } = await open([]);
  expect(headings(panel)).toEqual(['Waarden']);
  expect(panel.shadowRoot!.querySelector('mh-chart')).toBeNull();
});

test('Verloop comes between Waarden and Technisch, with the first value, Dag, and the four periods', async () => {
  const { panel, access } = await open([src('measure_temperature'), src('measure_humidity'), src('meter_power')]);
  expect(headings(panel)).toEqual(['Waarden', 'Verloop']);
  const chart = await within(panel, 'mh-chart') as HTMLElement & { name: string; period: string };
  await vi.waitFor(() => expect(access.series).toHaveBeenCalledWith(src('measure_temperature'), 'last24Hours'));
  expect(chart.name).toBe('Temperatuur');
  const periods = await within(panel, 'mh-choice-group') as HTMLElement & { options: { label: string }[]; value: string };
  expect(periods.options.map((o) => o.label)).toEqual(['Dag', 'Week', 'Maand', 'Jaar']);
  expect(periods.value).toBe('last24Hours');
  periods.dispatchEvent(new CustomEvent('change', { detail: { value: 'year' }, bubbles: true, composed: true }));
  await vi.waitFor(() => expect(access.series).toHaveBeenCalledWith(src('measure_temperature'), 'year'));
});

test('a value with history is a button that shows its history; a meter is not', async () => {
  const { panel, access } = await open([src('measure_temperature'), src('measure_humidity'), src('meter_power')]);
  const cells = [...panel.shadowRoot!.querySelectorAll<HTMLElement>('.values .cell')];
  const pressable = cells.filter((cell) => cell.tagName === 'BUTTON');
  expect(pressable.map((cell) => cell.querySelector('span')!.textContent)).toEqual(['Temperatuur', 'Vochtigheid']);
  expect(pressable.map((cell) => cell.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  pressable[1]!.click();
  await settle(panel);
  await vi.waitFor(() => expect(access.series).toHaveBeenCalledWith(src('measure_humidity'), 'last24Hours'));
  await vi.waitFor(async () => expect((await within(panel, 'mh-chart') as HTMLElement & { name: string }).name).toBe('Vochtigheid'));
});

test('a contact with history has its strips', async () => {
  const { panel, access } = await open([src('alarm_contact', 'boolean')]);
  expect(headings(panel)).toEqual(['Waarden', 'Verloop']);
  await vi.waitFor(() => expect(access.switches).toHaveBeenCalledWith(src('alarm_contact', 'boolean')));
  const strip = await within(panel, 'mh-onoff-strip') as HTMLElement & { baseId: string };
  expect(strip.baseId).toBe('alarm_contact');
});
