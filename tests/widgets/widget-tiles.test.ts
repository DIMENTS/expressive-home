import { expect, test } from 'vitest';
import type { TileSpec } from '../../src/dashboard/types';
import { normalizeHubLayout } from '../../src/storage/layout-normalize';
import { board, hubLayout, overview, ownSection, tileLayout } from '../helpers/layout';

const widget = (id: string, ref: string, settings: Record<string, unknown> = {}, size = 'single') =>
  ({ kind: 'widget', id, size, widget: ref, settings }) as unknown as TileSpec;
const layoutWith = (...specs: TileSpec[]) => hubLayout([overview(null), board('d-1', [ownSection('own:a', specs.map((spec) => tileLayout(spec, { size: spec.size })))])]);
const tilesOf = (raw: unknown) => normalizeHubLayout(JSON.parse(JSON.stringify(raw)))!.dashboards[1]!.sections![0]!.tiles.map((tile) => tile.spec);

test('a widget of the app, an own one and one of an app come back as they were', () => {
  const specs = [
    widget('t-1', 'clock', { seconds: false, date: true }, 'wide'),
    widget('t-2', 'note', { title: 'Boodschappen', text: 'Melk\nbrood', accent: true }),
    widget('t-3', 'board', { board: 'd-1' }),
    widget('t-4', 'own:gauge', { device: 'abc', min: 0, max: 40.5, unit: null }),
    widget('t-5', 'app:com.example.weather/today', {}),
  ];
  expect(tilesOf(layoutWith(...specs))).toEqual(specs);
});

test('a widget that names nothing known, or something odd, falls away', () => {
  const kept = tilesOf(layoutWith(
    widget('t-1', 'rain'), widget('t-2', 'own:'), widget('t-3', 'own:__proto__'), widget('t-4', 'own:Bad Id'), widget('t-5', 'app:x'),
    widget('t-6', 'clock'),
  ));
  expect(kept.map((spec) => spec.id)).toEqual(['t-6']);
});

test('settings keep only plain values, at most twelve, and text of at most 500 characters', () => {
  const settings: Record<string, unknown> = { obj: { a: 1 }, list: [1], nan: Number.NaN, huge: Infinity, ['__proto__']: 'x', 'bad key': 1, text: 'x'.repeat(600) };
  for (let i = 0; i < 20; i += 1) settings[`k${i}`] = i;
  const [spec] = tilesOf(layoutWith(widget('t-1', 'note', settings)));
  const kept = spec!.kind === 'widget' ? spec!.settings : {};
  expect(Object.keys(kept)).toHaveLength(12);
  expect(kept['text']).toHaveLength(500);
  expect(kept).not.toHaveProperty('obj');
  expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
});

test('a number that is not finite is no setting', async () => {
  const { normalizeWidgetSettings } = await import('../../src/widgets/widget-ref');
  expect(normalizeWidgetSettings({ a: Number.NaN, b: Infinity, c: 2 })).toEqual({ c: 2 });
});

test('a widget is never taken for something that went from the hub', async () => {
  const { reconcile } = await import('../../src/layout/reconcile');
  const { camper } = await import('../helpers/camper');
  const layout = layoutWith(widget('t-1', 'clock'), widget('t-2', 'app:com.example/x'));
  const result = reconcile(layout, camper().snapshot, 'nl');
  expect(result.gone).toEqual([]);
});
