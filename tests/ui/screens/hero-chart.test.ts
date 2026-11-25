// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/screens/hero';
// loaded by the hero when a chart is chosen; here at once, so the tests do not wait for it
import '../../../src/ui/screens/hero-chart';
import type { MhHero } from '../../../src/ui/screens/hero';
import type { HistoryPeriod, HistorySeries, HistorySource } from '../../../src/homey/client';
import { inside, mount, record, settle } from '../../helpers/mount';
import { camper } from '../../helpers/camper';

afterEach(() => { document.body.replaceChildren(); });

const now = Date.now();
const H = 3_600_000;
/** Points every five minutes over the last `hours`, the lowest at `lowAgo` hours ago. */
const day = (hours: number, lowAgo = 6): HistorySeries => ({
  start: now - 24 * H, end: now, step: 300_000, updatesIn: null,
  points: Array.from({ length: hours * 12 }, (_, i) => {
    const at = now - (hours * 12 - i) * 300_000;
    return { at, value: Math.abs(at - (now - lowAgo * H)) < 150_000 ? 52 : 70 };
  }),
});

async function setup(chart: string | null, options: { battery?: HistorySeries; recorded?: boolean } = {}) {
  const fake = camper();
  const hero = fake.dashboard.hero!;
  const sources: HistorySource[] = [{ log: 'b', kind: 'device', type: 'number', ...hero.primary }];
  const solar = hero.stats.find((stat) => stat.role === 'solar');
  if (options.recorded && solar && 'ref' in solar) sources.push({ log: 's', kind: 'recorded', type: 'number', ...solar.ref });
  const history = {
    sources: vi.fn(async () => sources),
    series: vi.fn(async (_source: HistorySource, period: HistoryPeriod) => (period === 'last7Days' ? { ...day(48), step: H } : options.battery ?? day(24))),
    switches: vi.fn(async () => null),
  };
  fake.ctx.history = history;
  const element = await mount<MhHero>('mh-hero', { hero, ctx: fake.ctx, chart });
  await new Promise((done) => { setTimeout(done, 0); });
  await settle(element);
  return { ...fake, hero, element, history };
}
/** A part inside the chart of the hero, once it is there. */
const inChart = (element: MhHero, selector: string): HTMLElement | null => element.shadowRoot!.querySelector('mh-hero-chart')?.shadowRoot?.querySelector<HTMLElement>(selector) ?? null;
const groupOf = (element: MhHero) => (inside(element, 'mh-section-menu') as HTMLElement & { groups: { id: string; items?: { id: string; checked: boolean }[] }[] }).groups.find((g) => g.id === 'chart');

test('without a chosen chart the hero is as it was; the menu offers what this hub can deliver', async () => {
  const { element, history } = await setup(null);
  expect(element.shadowRoot!.querySelector('mh-hero-chart')).toBeNull();
  expect(history.series).not.toHaveBeenCalled();
  expect(groupOf(element)!.items!.map((item) => [item.id, item.checked])).toEqual([['none', true], ['battery', false]]);
  const chosen = record<{ chart: string | null }>(element, 'hero-chart');
  inside(element, 'mh-section-menu').dispatchEvent(new CustomEvent('select', { detail: { group: 'chart', id: 'battery' } }));
  inside(element, 'mh-section-menu').dispatchEvent(new CustomEvent('select', { detail: { group: 'chart', id: 'none' } }));
  expect(chosen).toEqual([{ chart: 'battery' }, { chart: null }]);
});

test('the battery of the last 24 hours, with its lowest point in the corner', async () => {
  const { element, history, hero } = await setup('battery');
  await vi.waitFor(() => expect(history.series).toHaveBeenCalledWith(expect.objectContaining(hero.primary), 'last24Hours'));
  await vi.waitFor(() => expect(inChart(element, 'mh-chart')).not.toBeNull());
  expect(inChart(element, '.corner')!.textContent).toMatch(/^Laagste 52% om \d\d:\d\d$/);
  const chart = inChart(element, 'mh-chart') as HTMLElement & { variant: string; period: string };
  expect([chart.variant, chart.period]).toEqual(['hero', 'last24Hours']);
});

test('with less than twelve hours per five minutes, the hourly points of the week are shown, cut at 24 hours', async () => {
  const { element, history } = await setup('battery', { battery: day(7) });
  await vi.waitFor(() => expect(history.series).toHaveBeenCalledWith(expect.anything(), 'last7Days'));
  await vi.waitFor(() => expect(inChart(element, 'mh-chart')).not.toBeNull());
  const chart = inChart(element, 'mh-chart') as HTMLElement & { series: HistorySeries };
  expect(chart.series.points.every((point) => point.at >= now - 24 * H - 1000)).toBe(true);
  expect(chart.series.step).toBe(H);
});

test('the sun appears in the menu once it is recorded; a chart that cannot any more draws nothing', async () => {
  const recorded = await setup(null, { recorded: true });
  expect(groupOf(recorded.element)!.items!.map((item) => item.id)).toContain('solar');
  const gone = await setup('solar');
  expect(gone.element.shadowRoot!.querySelector('mh-hero-chart')).toBeNull();
});

test('the slider of the hero chart is no part of a button, and a tap on the chart opens the device', async () => {
  const { element, hero, actions } = await setup('battery');
  await vi.waitFor(() => expect(inChart(element, 'mh-chart')).not.toBeNull());
  const chart = inChart(element, 'mh-chart')!;
  await (chart as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  expect(chart.closest('button')).toBeNull();
  expect(chart.shadowRoot!.querySelector('[role="slider"]')).not.toBeNull();
  chart.click();
  expect(actions.openDevice).toHaveBeenCalledWith(hero.primary.deviceId);
});
