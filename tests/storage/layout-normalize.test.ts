import { expect, test } from 'vitest';
import { freezeOverview } from '../../src/layout/freeze';
import { defaultHubLayout, LIMITS, type HubLayout } from '../../src/layout/types';
import { normalizeHubLayout, normalizeLayouts } from '../../src/storage/layout-normalize';
import { camper } from '../helpers/camper';
import { board, flowTile, heroSection, hubLayout, overview, ownSection, sensorTile, tileLayout } from '../helpers/layout';

const ID = '64a1b2c3d4e5f60718293a4b';
const round = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const ref = (deviceId: string, capabilityId: string) => ({ deviceId, capabilityId });

const good = (): HubLayout => hubLayout([
  overview([
    heroSection('hero:main', { main: ref('w', 'tank_level'), line: null, stats: [{ net: true }, ref('p', 'onoff')], name: 'Water' }),
    ownSection('own:s-a', [sensorTile('t-1', 'd1', 'measure_temperature', { label: 'Binnen', icon: 'cabin' }), flowTile('t-2', 'f1')], { name: 'Buiten', icon: 'park', column: 'right' }),
  ]),
  board('d-buiten', [ownSection('own:s-b', [sensorTile('t-3', 'd1', 'measure_humidity', { source: 'value' })])], { name: 'Buiten', icon: 'deck' }),
], { known: ['d1', 'flow:f1'], names: { d1: 'Sensor', 'flow:f1': 'Uit' } });

test('a layout that is right comes back as it was', () => {
  expect(normalizeHubLayout(round(good()))).toEqual(good());
  expect(normalizeHubLayout(round(defaultHubLayout()))).toEqual(defaultHubLayout());
  const { dashboard, snapshot } = camper();
  const frozen = freezeOverview(dashboard, snapshot);
  const layout = hubLayout([overview(frozen.sections)], { known: frozen.known, names: frozen.names });
  expect(normalizeHubLayout(round(layout))).toEqual(layout);
});

test('every kind of tile comes back with its own fields', () => {
  const specs = [
    { kind: 'light', id: 't-1', deviceId: 'd', size: 'single', onoffCapabilityId: null, dimCapabilityId: 'dim.white' },
    { kind: 'switch', id: 't-2', deviceId: 'd', size: 'wide', onoffCapabilityId: 'onoff', detailCapabilityId: null },
    { kind: 'tank', id: 't-3', deviceId: 'd', size: 'single', levelCapabilityId: 'tank_level', volumeCapabilityId: null, capacityCapabilityId: null },
    { kind: 'button', id: 't-4', deviceId: 'd', size: 'single', capabilityId: 'button' },
    { kind: 'sensor', id: 't-5', deviceId: 'd', size: 'single', capabilityId: 'measure_power', showCapabilityTitle: true },
    { kind: 'multi', id: 't-6', deviceId: 'd', size: 'wide', capabilityIds: ['a', 'b', 'c'] },
    { kind: 'generic', id: 't-7', deviceId: 'd', size: 'single', capabilityId: null },
    { kind: 'flow', id: 't-8', flowId: 'f', flowKind: 'advanced', size: 'single' },
  ] as const;
  const layout = hubLayout([overview([ownSection('own:s-a', specs.map((spec) => tileLayout(spec.kind === 'multi' ? { ...spec, capabilityIds: [...spec.capabilityIds] } : spec)))])]);
  expect(normalizeHubLayout(round(layout))).toEqual(layout);
});

test('what is no layout gives null', () => {
  for (const raw of [null, undefined, 5, 'x', [], {}, { dashboards: {} }]) expect([raw, normalizeHubLayout(raw)]).toEqual([raw, null]);
});

test('an unknown tile kind, a duplicate id and a second hero fall away, the rest stays', () => {
  const raw = round(good()) as { dashboards: { id: string; sections: { id: string; tiles: unknown[] }[] }[] };
  raw.dashboards[0]!.sections[1]!.tiles.push(
    { ...sensorTile('t-9', 'd1'), spec: { kind: 'widget', id: 't-9', deviceId: 'd1', size: 'single' } },
    sensorTile('t-1', 'd2'), sensorTile('t-10', ''), { id: 't-11' }, null, 'x',
    tileLayout({ kind: 'sensor', id: 't-12', deviceId: 'd1', size: 'single', capabilityId: 7 as unknown as string, showCapabilityTitle: true }),
    tileLayout({ kind: 'multi', id: 't-13', deviceId: 'd1', size: 'wide', capabilityIds: [] }),
    tileLayout({ kind: 'flow', id: 't-14', flowId: 'f', flowKind: 'other' as 'flow', size: 'single' }),
  );
  raw.dashboards[0]!.sections.push(heroSection('hero:two') as never, ownSection('own:s-a') as never, ownSection('geen id') as never, { id: 'own:s-q', kind: 'nonsense', column: 'left', tiles: [] } as never);
  raw.dashboards[1]!.sections[0]!.tiles.push(sensorTile('t-2', 'd1'));
  raw.dashboards.push(board('d-buiten', []) as never, board('not a good id!', []) as never);
  expect(normalizeHubLayout(raw)).toEqual(good());
});

test('a layout without an overview gets an automatic one first', () => {
  const layout = hubLayout([board('d-buiten', [])]);
  expect(normalizeHubLayout(round(layout))!.dashboards).toEqual([defaultHubLayout().dashboards[0], board('d-buiten', [])]);
});

test('only the overview can be automatic', () => {
  expect(normalizeHubLayout({ dashboards: [{ id: 'd-1', sections: null }, { id: 'overview', sections: 'x' }] })).toEqual(hubLayout([board('d-1', []), overview(null)]));
});

test('__proto__, a huge layout and a name of 10 000 characters are kept in check', () => {
  const raw = JSON.parse(JSON.stringify(good()).replace('"names":{', '"names":{"__proto__":"x","constructor":"x",').replace('"known":[', '"known":["__proto__",5,')) as {
    dashboards: { name: unknown; sections: { name: unknown; tiles: unknown[] }[] }[];
  };
  raw.dashboards[0]!.sections[1]!.name = 'x'.repeat(10_000);
  raw.dashboards[0]!.sections[1]!.tiles.push(
    sensorTile('t-20', '__proto__'), sensorTile('t-21', 'd1', 'constructor'),
    ...Array.from({ length: 5000 }, (_, i) => sensorTile(`t-m${i}`, 'd1', 'measure_temperature', { label: '<b>x</b>' })),
  );
  raw.dashboards.push(...Array.from({ length: 100 }, (_, i) => board(`d-${i}`, Array.from({ length: 100 }, (_x, n) => ownSection(`own:s-${i}-${n}`)))) as never[]);
  const layout = normalizeHubLayout(raw)!;
  expect(Object.getPrototypeOf(layout.names)).toBe(Object.prototype);
  expect(Object.keys(layout.names)).toEqual(['d1', 'flow:f1']);
  expect(layout.known).toEqual(['d1', 'flow:f1']);
  expect(JSON.stringify(layout)).not.toContain('__proto__');
  expect(layout.dashboards[0]!.sections![1]!.name).toBe('x'.repeat(LIMITS.nameLength));
  expect(layout.dashboards[0]!.sections!.flatMap((s) => s.tiles)).toHaveLength(LIMITS.tilesPerDashboard);
  expect(layout.dashboards).toHaveLength(LIMITS.dashboards);
  expect(layout.dashboards[5]!.sections).toHaveLength(LIMITS.sectionsPerDashboard);
  // a name is kept as the text it is; the screen shows it as text
  expect(layout.dashboards[0]!.sections![1]!.tiles.at(-1)!.label).toBe('<b>x</b>');
});

test('the overview stays when there are too many dashboards', () => {
  const layout = normalizeHubLayout({ dashboards: [...Array.from({ length: 40 }, (_, i) => board(`d-${i}`, [])), overview([])] })!;
  expect(layout.dashboards).toHaveLength(LIMITS.dashboards);
  expect(layout.dashboards.at(-1)!.id).toBe('overview');
});

test('a strange icon name is dropped, a well-formed unknown one is kept', () => {
  const raw = round(good()) as HubLayout;
  raw.dashboards[0]!.icon = '<svg onload=x>';
  raw.dashboards[1]!.icon = 'icon_of_later';
  raw.dashboards[0]!.sections![1]!.icon = 'Not An Icon';
  raw.dashboards[0]!.sections![1]!.tiles[0]!.icon = 'a'.repeat(41);
  const layout = normalizeHubLayout(raw)!;
  expect(layout.dashboards.map((d) => d.icon)).toEqual([null, 'icon_of_later']);
  expect(layout.dashboards[0]!.sections![1]!.icon).toBeNull();
  expect(layout.dashboards[0]!.sections![1]!.tiles[0]!.icon).toBeNull();
});

test('an own hero without a big number is automatic; a broken stat or line falls away', () => {
  const heroOf = (hero: unknown) => normalizeHubLayout({ dashboards: [{ id: 'overview', sections: [{ ...heroSection(), hero }] }] })!.dashboards[0]!.sections![0]!.hero;
  expect(heroOf({ main: { deviceId: 'w' }, line: null, stats: [] })).toBeNull();
  expect(heroOf({ main: ref('w', 'x'), line: { deviceId: 5 }, stats: [null, ref('a', 'b'), { net: true }, { net: false }, ...Array.from({ length: 9 }, () => ref('c', 'd'))], name: '  ' }))
    .toEqual({ main: ref('w', 'x'), line: null, stats: [ref('a', 'b'), { net: true }, ref('c', 'd'), ref('c', 'd')], name: null });
  expect(heroOf({ main: ref('w', 'x'), stats: 'x' })).toEqual({ main: ref('w', 'x'), line: null, stats: [], name: null });
});

test('a size, column or source that makes no sense becomes the usual one', () => {
  const tile = { ...sensorTile('t-1', 'd1'), size: 'huge', source: 'magic', label: 5 };
  const multi = { ...tileLayout({ kind: 'multi', id: 't-2', deviceId: 'd1', size: 'wide', capabilityIds: ['a', 'b', 'c', 'd', 'e'] }), size: 'single', source: 'value' };
  const layout = normalizeHubLayout({ dashboards: [{ id: 'overview', sections: [{ ...ownSection('own:s-a'), column: 'middle', tiles: [tile, multi] }] }] })!;
  expect(layout.dashboards[0]!.sections![0]!.column).toBe('left');
  expect(layout.dashboards[0]!.sections![0]!.tiles).toEqual([
    sensorTile('t-1', 'd1'),
    tileLayout({ kind: 'multi', id: 't-2', deviceId: 'd1', size: 'wide', capabilityIds: ['a', 'b', 'c'] }),
  ]);
});

test('layouts are kept per Homey id, for at most five hubs', () => {
  const keys = Array.from({ length: 7 }, (_, i) => `${i}${ID.slice(1)}`);
  const layouts = normalizeLayouts({ ...Object.fromEntries(keys.map((key) => [key, good()])), 'no-homey': good(), ['f'.repeat(24)]: 'x' });
  // the last ones: the hub in use is always written last
  expect(Object.keys(layouts)).toEqual(keys.slice(-5));
  expect(normalizeLayouts([good()])).toEqual({});
  expect(normalizeLayouts(null)).toEqual({});
});

test('a button is kept as a flow, as every version of the app knows it', () => {
  for (const name of ['film kijken', '"><b>', '😀'.repeat(60), 'constructor']) {
    const tile = { id: `flow:button:${name}`, spec: { kind: 'flow', id: `flow:button:${name}`, flowId: `button:${name}`, flowKind: 'flow', size: 'single' }, size: 'single', label: null, icon: null, source: 'device' };
    const layout = { ...good(), known: [`flow:button:${name}`], names: { [`flow:button:${name}`]: 'Film' } };
    layout.dashboards[0]!.sections![1]!.tiles = [tile as never];
    expect(normalizeHubLayout(round(layout))).toEqual(layout);
  }
});
