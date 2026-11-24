import { expect, test } from 'vitest';
import { countDropped, LAYOUT_FILE_FORMAT, layoutFileName, readLayoutFile, writeLayoutFile } from '../../src/layout/file';
import { freezeOverview } from '../../src/layout/freeze';
import { defaultHubLayout, LIMITS, type HubLayout } from '../../src/layout/types';
import type { ThemeSettings } from '../../src/theme/types';
import { climate, dish } from '../dashboard/samples';
import { snapshot } from '../helpers/build';
import { camper } from '../helpers/camper';
import { board, flowTile, heroSection, hubLayout, overview, ownSection, sensorTile } from '../helpers/layout';

const ID = '64a1b2c3d4e5f60718293a4b';
const theme: ThemeSettings = { seed: '#a6422a', mode: 'dark', density: 'compact' };
const sectionSeeds = { 'type:lights': '#3a5ba9', 'own:s-ab12cd34': '#a03b6c' };
const now = new Date(2026, 10, 23, 9, 5);
const layout = (): HubLayout => {
  const { dashboard, snapshot: hub } = camper();
  const frozen = freezeOverview(dashboard, hub);
  return hubLayout([overview(frozen.sections), board('d-ab12cd34', [ownSection('own:s-ab12cd34', [sensorTile('t-1', 'device-3')])], { name: 'Buiten', icon: 'deck' })], { known: frozen.known, names: frozen.names });
};
const write = (partial: Partial<Parameters<typeof writeLayoutFile>[0]> = {}) => writeLayoutFile({ homeyId: ID, theme, sectionSeeds, layout: layout(), ...partial }, now);

test('a written file reads back to the same dashboards, theme and colours', () => {
  expect(readLayoutFile(write())).toEqual({
    format: LAYOUT_FILE_FORMAT, version: 1, exportedAt: now.toISOString(), homeyId: ID, theme, sectionSeeds, dashboards: layout().dashboards,
  });
  expect(readLayoutFile(write({ layout: defaultHubLayout() }))!.dashboards).toEqual(defaultHubLayout().dashboards);
});

test('the file holds no key and no connection', () => {
  const text = write();
  expect(Object.keys(JSON.parse(text)).sort()).toEqual(['dashboards', 'exportedAt', 'format', 'homeyId', 'sectionSeeds', 'theme', 'version']);
  for (const word of ['apiKey', 'connection', 'localAddress', '"known"', '"names"']) expect([word, text.includes(word)]).toEqual([word, false]);
});

test('the file name follows the local date', () => {
  expect(layoutFileName(now)).toBe('expressive-home-layout-2026-11-23.json');
  expect(layoutFileName(new Date(2027, 0, 5, 0, 0, 1))).toBe('expressive-home-layout-2027-01-05.json');
});

test('a file that is not ours gives null', () => {
  const ours = JSON.parse(write()) as Record<string, unknown>;
  for (const text of ['', 'geen json', '{', 'null', '[]', '5', '{"a":1}', JSON.stringify({ ...ours, format: 'iets-anders' }), JSON.stringify({ ...ours, version: 2 }), JSON.stringify({ ...ours, dashboards: 'x' })]) {
    expect([text.slice(0, 40), readLayoutFile(text)]).toEqual([text.slice(0, 40), null]);
  }
});

test('a file with rubbish keeps what is right', () => {
  const file = JSON.parse(write()) as Record<string, unknown> & { dashboards: { id: string; name: unknown; sections: { tiles: unknown[] }[] }[] };
  file.dashboards[1]!.name = '<img src=x onerror=alert(1)>';
  file.dashboards[1]!.sections[0]!.tiles.push({ id: 't-9', spec: { kind: 'bom' } }, ...Array.from({ length: 5000 }, (_, i) => sensorTile(`t-m${i}`, 'device-3')));
  const text = JSON.stringify({ ...file, homeyId: 5, exportedAt: 7, theme: { seed: 'groen', mode: 'dark', density: 'x' }, sectionSeeds: { 'type:lights': '#3a5ba9', x: '#000000', 'type:water': 'blauw' } })
    .replace('"sectionSeeds":{', '"sectionSeeds":{"__proto__":"#3a5ba9",');
  const read = readLayoutFile(text)!;
  expect(read).toMatchObject({ homeyId: '', exportedAt: '', theme: { seed: '#3b6939', mode: 'dark', density: 'comfortable' }, sectionSeeds: { 'type:lights': '#3a5ba9' } });
  expect(Object.keys(read.sectionSeeds)).toEqual(['type:lights']);
  // the name stays text; only the screen decides how text is shown
  expect(read.dashboards[1]!.name).toBe('<img src=x onerror=alert(1)>');
  expect(read.dashboards[1]!.sections![0]!.tiles).toHaveLength(LIMITS.tilesPerDashboard);
  expect(read.dashboards[0]).toEqual(layout().dashboards[0]);
});

test('countDropped counts the tiles of devices the hub does not know', () => {
  const dashboards = [
    overview([heroSection(), ownSection('own:a', [sensorTile('t-1', 's1'), sensorTile('t-2', 'gone'), flowTile('t-3', 'f1'), flowTile('t-4', 'f9')])]),
    board('d-1', [ownSection('own:b', [sensorTile('t-5', 'o1', 'measure_download', { source: 'value' }), sensorTile('t-6', 'o1', 'measure_gone', { source: 'value' })])]),
  ];
  expect(countDropped(dashboards, snapshot([climate, dish], { scopes: ['homey'], flows: [{ id: 'f1', name: 'Uit', kind: 'flow', startable: true }] }))).toBe(3);
  expect(countDropped(defaultHubLayout().dashboards, snapshot([]))).toBe(0);
  expect(countDropped(layout().dashboards, camper().snapshot)).toBe(0);
});

test('countDropped leaves out what the key may not read: that is not gone', () => {
  const dashboards = [overview([ownSection('own:a', [sensorTile('t-1', 's1'), sensorTile('t-2', 'gone'), flowTile('t-3', 'f1')])])];
  expect(countDropped(dashboards, snapshot([climate], { scopes: ['homey.device'] }))).toBe(1);
  expect(countDropped(dashboards, snapshot([], { scopes: ['homey.flow'] }))).toBe(1);
});

test('a file that was kept under the name the app had before is read too', () => {
  const read = readLayoutFile(JSON.stringify({ format: 'material-homey-indeling', version: 1, homeyId: '', dashboards: [], theme: {}, sectionSeeds: {} }));
  expect(read).toMatchObject({ format: 'expressive-home-layout', version: 1 });
  expect(readLayoutFile(JSON.stringify({ format: 'something-else', version: 1, dashboards: [] }))).toBeNull();
});
