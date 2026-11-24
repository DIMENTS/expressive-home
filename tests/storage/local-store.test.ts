import { expect, test } from 'vitest';
import { DEFAULT_CONFIG, type AppConfig } from '../../src/storage/config';
import { createLocalConfigStore, STORAGE_KEY } from '../../src/storage/local-store';
import { LIMITS } from '../../src/layout/types';
import { defaultWall } from '../../src/wall/settings';
import { board, hubLayout, overview, ownSection, sensorTile } from '../helpers/layout';

const ID = '64a1b2c3d4e5f60718293a4b';

function memory(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

test('nothing stored gives the defaults', async () => {
  expect(await createLocalConfigStore(memory()).load()).toEqual(DEFAULT_CONFIG);
});

test('save and load round-trip', async () => {
  const storage = memory();
  const store = createLocalConfigStore(storage);
  const config: AppConfig = { ...DEFAULT_CONFIG, connection: { homeyId: ID, localAddress: '192.168.1.50', apiKey: 'k' }, sectionSeeds: { 'type:lights': '#a6422a' }, language: 'en' };
  await store.save(config);
  expect(await createLocalConfigStore(storage).load()).toEqual(config);
});

test.each([['not json'], ['null'], ['[]'], ['{"version":99,"theme":{"seed":"#000000"}}']])('broken or newer data %s gives the defaults', async (stored) => {
  expect(await createLocalConfigStore(memory(stored)).load()).toEqual(DEFAULT_CONFIG);
});

test('partial data is completed and bad fields are replaced', async () => {
  const stored = JSON.stringify({ version: 1, connection: { apiKey: 'k' }, theme: { seed: 'groen', density: 'compact' } });
  expect(await createLocalConfigStore(memory(stored)).load()).toEqual({
    ...DEFAULT_CONFIG, connection: { homeyId: null, localAddress: null, apiKey: 'k' }, theme: { seed: '#3b6939', mode: 'auto', density: 'compact' },
  });
});

test('clearing the connection keeps the theme', async () => {
  const storage = memory();
  const store = createLocalConfigStore(storage);
  await store.save({ ...DEFAULT_CONFIG, connection: { homeyId: ID, localAddress: null, apiKey: 'k' }, theme: { seed: '#a6422a', mode: 'dark', density: 'compact' } });
  const cleared = await store.clearConnection();
  expect(cleared.connection).toEqual({ homeyId: null, localAddress: null, apiKey: null });
  expect(cleared.theme).toEqual({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  expect(storage.data.get(STORAGE_KEY)).not.toContain('"k"');
});

test('a storage that throws does not break loading', async () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} };
  expect(await createLocalConfigStore(broken).load()).toEqual(DEFAULT_CONFIG);
});

test('save rejects with the storage error', async () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  await expect(createLocalConfigStore(broken).save(DEFAULT_CONFIG)).rejects.toThrow('quota');
});

test('invalid section seeds, kinds and language are dropped', async () => {
  const stored = JSON.stringify({ version: 1, sectionSeeds: { lights: '#a6422a', climate: 'red', bogus: '#000000' }, language: 'fr', connection: { homeyId: '', localAddress: 5 } });
  const loaded = await createLocalConfigStore(memory(stored)).load();
  expect(loaded.sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
  expect(loaded.language).toBeNull();
  expect(loaded.connection).toEqual({ homeyId: null, localAddress: null, apiKey: null });
});

test('a stored id or address of the wrong shape loads as null and the key is kept', async () => {
  const badId = JSON.stringify({ version: 1, connection: { homeyId: 'evil.example/x', localAddress: '192.168.1.50', apiKey: 'k' } });
  expect((await createLocalConfigStore(memory(badId)).load()).connection).toEqual({ homeyId: null, localAddress: '192.168.1.50', apiKey: 'k' });
  const badAddress = JSON.stringify({ version: 1, connection: { homeyId: ID, localAddress: 'evil.example', apiKey: 'k' } });
  expect((await createLocalConfigStore(memory(badAddress)).load()).connection).toEqual({ homeyId: ID, localAddress: null, apiKey: 'k' });
});

test('load returns a fresh object and defaults are protected', async () => {
  const store = createLocalConfigStore(memory());
  const first = await store.load();
  first.theme.seed = '#000000';
  first.sectionSeeds['type:lights'] = '#000000';
  expect(DEFAULT_CONFIG.theme.seed).toBe('#3b6939');
  expect(DEFAULT_CONFIG.sectionSeeds).toEqual({});
  expect((await store.load()).theme.seed).toBe('#3b6939');
});

test('version 1 section colours move to section ids', async () => {
  const storage = memory(JSON.stringify({ version: 1, sectionSeeds: { lights: '#112233', nonsense: '#112233' } }));
  const store = createLocalConfigStore(storage);
  expect(await store.load()).toMatchObject({ version: 3, sectionSeeds: { 'type:lights': '#112233' } });
  expect(Object.keys((await store.load()).sectionSeeds)).toEqual(['type:lights']);
});
test('section colours are kept by id and bad keys are dropped', async () => {
  const storage = memory('{"version":2,"sectionSeeds":{"type:lights":"#112233","zone:abc:lights":"#445566","x":"#112233","__proto__":"#112233","type:water":"red"}}');
  expect((await createLocalConfigStore(storage).load()).sectionSeeds).toEqual({ 'type:lights': '#112233', 'zone:abc:lights': '#445566' });
});
test('a colour for every section there can be is kept, and not without end', async () => {
  const kept = async (count: number) => {
    const many = Object.fromEntries(Array.from({ length: count }, (_, i) => [`zone:z${i}:lights`, '#112233']));
    return Object.keys((await createLocalConfigStore(memory(JSON.stringify({ version: 2, sectionSeeds: many }))).load()).sectionSeeds).length;
  };
  expect(await kept(LIMITS.dashboards * LIMITS.sectionsPerDashboard)).toBe(800);
  expect(await kept(5000)).toBe(800);
});
test('saving always writes version 3', async () => {
  const storage = memory(JSON.stringify({ version: 1, sectionSeeds: { lights: '#112233' } }));
  const store = createLocalConfigStore(storage);
  await store.save(await store.load());
  expect(JSON.parse(storage.data.get(STORAGE_KEY) ?? '{}')).toMatchObject({ version: 3, sectionSeeds: { 'type:lights': '#112233' } });
});

test('a stored seed for hero:main loads; a seed under a strange id does not', async () => {
  const stored = JSON.stringify({ version: 2, sectionSeeds: { 'hero:main': '#a6422a', 'hero main': '#3a5ba9', '<script>': '#3a5ba9' } });
  expect((await createLocalConfigStore(memory(stored)).load()).sectionSeeds).toEqual({ 'hero:main': '#a6422a' });
});

test('version 1 and 2 still load, without a layout', async () => {
  for (const version of [1, 2]) {
    const stored = JSON.stringify({ version, connection: { homeyId: ID, localAddress: null, apiKey: 'k' }, theme: { seed: '#a6422a', mode: 'dark', density: 'compact' }, language: 'en', layouts: { [ID]: hubLayout([overview([])]) } });
    expect(await createLocalConfigStore(memory(stored)).load()).toEqual({
      ...DEFAULT_CONFIG, connection: { homeyId: ID, localAddress: null, apiKey: 'k' }, theme: { seed: '#a6422a', mode: 'dark', density: 'compact' }, language: 'en',
    });
  }
});

const layout = () => hubLayout([overview([ownSection('own:s-a', [sensorTile('t-1', 'd1')])]), board('d-buiten', [], { name: 'Buiten' })], { known: ['d1'], names: { d1: 'Sensor' } });

test('a layout is saved and loaded under its Homey id', async () => {
  const storage = memory();
  await createLocalConfigStore(storage).save({ ...DEFAULT_CONFIG, layouts: { [ID]: layout() } });
  expect((await createLocalConfigStore(storage).load()).layouts).toEqual({ [ID]: layout() });
});

test('a layout under a key that is no Homey id is not loaded', async () => {
  const stored = JSON.stringify({ ...DEFAULT_CONFIG, layouts: { 'mock-homey': layout(), '../x': layout(), [ID]: layout() } });
  expect(Object.keys((await createLocalConfigStore(memory(stored)).load()).layouts)).toEqual([ID]);
});

test('a broken layout costs only itself', async () => {
  const stored = JSON.stringify({ ...DEFAULT_CONFIG, language: 'en', layouts: { [ID]: 'broken' } });
  expect(await createLocalConfigStore(memory(stored)).load()).toEqual({ ...DEFAULT_CONFIG, language: 'en' });
});

test('clearConnection keeps the layouts', async () => {
  const store = createLocalConfigStore(memory());
  await store.save({ ...DEFAULT_CONFIG, connection: { homeyId: ID, localAddress: null, apiKey: 'k' }, layouts: { [ID]: layout() } });
  const cleared = await store.clearConnection();
  expect(cleared.connection.apiKey).toBeNull();
  expect(cleared.layouts).toEqual({ [ID]: layout() });
});

test('the colours of own sections and heroes load by their id', async () => {
  const seeds = { 'own:s-ab12cd34': '#a6422a', 'hero:d-ab12cd34': '#3a5ba9' };
  expect((await createLocalConfigStore(memory(JSON.stringify({ version: 3, sectionSeeds: seeds }))).load()).sectionSeeds).toEqual(seeds);
});

test('the dashboard to start with is kept; what cannot be one is none', async () => {
  const storage = memory();
  const store = createLocalConfigStore(storage);
  await store.save({ ...DEFAULT_CONFIG, startBoard: 'd-1a2b' });
  expect((await store.load()).startBoard).toBe('d-1a2b');
  for (const wrong of [5, null, '', 'x'.repeat(61), '<b>', {}, undefined]) {
    storage.data.set(STORAGE_KEY, JSON.stringify({ ...DEFAULT_CONFIG, startBoard: wrong }));
    expect([wrong, (await store.load()).startBoard]).toEqual([wrong, null]);
  }
  expect(DEFAULT_CONFIG.startBoard).toBeNull();
});

test('what is set up for a wall tablet is kept, without a new version; what is wrong is the default', async () => {
  const storage = memory();
  const store = createLocalConfigStore(storage);
  const wall = { ...defaultWall(), on: true, after: 5 as const, hubs: { [ID]: { inside: { deviceId: 'd', capabilityId: 'measure_temperature' }, outside: null, tanks: { t: 'low' as const } } } };
  await store.save({ ...DEFAULT_CONFIG, wall });
  expect((await store.load()).wall).toEqual(wall);
  expect(JSON.parse(storage.data.get(STORAGE_KEY)!).version).toBe(3);
  storage.data.set(STORAGE_KEY, JSON.stringify({ ...DEFAULT_CONFIG, wall: { ...wall, after: 3 } }));
  expect((await store.load()).wall).toEqual({ ...wall, after: 2 });
  storage.data.set(STORAGE_KEY, JSON.stringify({ version: 2, theme: DEFAULT_CONFIG.theme }));
  expect((await store.load()).wall).toEqual(defaultWall());
});

test('what is of this device can be had at once, without waiting', async () => {
  const storage = memory();
  const store = createLocalConfigStore(storage);
  expect(store.peek!()).toEqual({ theme: DEFAULT_CONFIG.theme, language: null, startBoard: null, wall: defaultWall() });
  const mine = { theme: { seed: '#a6422a', mode: 'dark' as const, density: 'compact' as const }, language: 'en' as const, startBoard: 'd-1', wall: { ...defaultWall(), on: true } };
  await store.save({ ...DEFAULT_CONFIG, ...mine });
  expect(store.peek!()).toEqual(mine);
  expect(createLocalConfigStore(memory('not json')).peek!().wall).toEqual(defaultWall());
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} };
  expect(createLocalConfigStore(broken).peek!().wall).toEqual(defaultWall());
});
