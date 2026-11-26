import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// The settings of the app on the hub: what app.json promises, api.js and app.js do, and every text is there in both languages.

type Texts = Record<string, Record<string, string>>;
const read = (path: string): string => readFileSync(`homey-app/${path}`, 'utf8');
const [nl, en] = ['nl', 'en'].map((language) => JSON.parse(read(`locales/${language}.json`)) as Texts);
const manifest = JSON.parse(read('app.json')) as { api: Record<string, { method: string; path: string }> };
const page = read('settings/index.html');

type Loader = { _load(request: string, ...rest: unknown[]): unknown };
const loader = Module as unknown as Loader;
const original = loader._load;
class App {}
beforeEach(() => {
  loader._load = (request, ...rest) => (request === 'homey' ? { App } : request === 'homey-api' ? {} : original.call(loader, request, ...rest));
});
afterEach(() => { loader._load = original; });

function load<T>(file: string): T {
  const path = `${process.cwd()}/homey-app/${file}`;
  const require = createRequire(path);
  delete require.cache[require.resolve(path)];
  return require(path) as T;
}

interface MaterialApp {
  server: unknown;
  getState(): Promise<Record<string, unknown>>;
  getCode(body: unknown): Promise<unknown>;
  setRole(id: string, role: unknown): unknown;
  setFlowKey(key: unknown): Promise<unknown>;
  removeFlowKey(): unknown;
}
const app = (server: unknown): MaterialApp => Object.assign(new (load<new () => MaterialApp>('app.js'))(), { server });

test('every request of the settings has a place in the app', () => {
  const api = load<Record<string, (request: Record<string, unknown>) => Promise<unknown>>>('api.js');
  expect(Object.keys(api).sort()).toEqual(Object.keys(manifest.api).sort());
  // never for who Homey does not know
  for (const route of Object.values(manifest.api)) expect(route).not.toHaveProperty('public');
  expect(manifest.api).toMatchObject({ getCode: { method: 'POST', path: '/code' }, setRole: { method: 'PUT', path: '/devices/:id' }, setFlowKey: { method: 'POST', path: '/flow-key' }, removeFlowKey: { method: 'DELETE', path: '/flow-key' } });
});

test('a key for flows goes to the server, and only what became of it comes back', async () => {
  const server = {
    connected: () => true, address: () => new Promise(() => {}), devices: () => [], codes: () => ({ scan: 'x' }), buttons: () => ['Film'],
    flowKey: () => 'works', setFlowKey: vi.fn(async () => 'works'), removeFlowKey: vi.fn(), recording: () => true, appLive: () => ({ state: 'on', apps: 2 }),
  };
  const homey = { app: app(server) };
  const api = load<Record<string, (request: Record<string, unknown>) => Promise<unknown>>>('api.js');
  expect(await api['setFlowKey']!({ homey, body: { key: 'een sleutel' } })).toEqual({ result: 'works' });
  expect(server.setFlowKey).toHaveBeenCalledWith('een sleutel');
  expect(await api['setFlowKey']!({ homey, body: null })).toEqual({ result: 'works' });
  await api['removeFlowKey']!({ homey });
  expect(server.removeFlowKey).toHaveBeenCalledOnce();
  expect(await api['getState']!({ homey })).toEqual({ running: true, connected: true, devices: [], flowKey: 'works', codes: { scan: 'x' }, buttons: ['Film'], recording: true, appLive: { state: 'on', apps: 2 } });
});

test('a code is asked for with a slot, a right and whether it has to be a new one', async () => {
  const server = { code: vi.fn(async () => ({ code: '123456' })) };
  const homey = { app: app(server) };
  const api = load<Record<string, (request: Record<string, unknown>) => Promise<unknown>>>('api.js');
  expect(await api['getCode']!({ homey, body: { slot: 'here', role: 'use', fresh: true } })).toEqual({ code: '123456' });
  // as the settings of version 0.1.0 ask for it, and the least of all
  for (const body of [{ role: 'edit' }, {}, null]) await api['getCode']!({ homey, body });
  expect(server.code.mock.calls).toEqual([['here', 'use', true], ['scan', 'edit', false], ['scan', null, false], ['scan', null, false]]);
  for (const body of [{ slot: 'x' }, { role: 'admin' }, { slot: '__proto__' }]) await expect(api['getCode']!({ homey, body })).rejects.toThrow();
});

test('the right of a device is one of two', async () => {
  const server = { setRole: vi.fn(() => true) };
  const homey = { app: app(server) };
  const api = load<Record<string, (request: Record<string, unknown>) => Promise<unknown>>>('api.js');
  expect(await api['setRole']!({ homey, params: { id: 'd1' }, body: { role: 'edit' } })).toBe(true);
  expect(server.setRole).toHaveBeenCalledWith('d1', 'edit');
  for (const body of [{ role: 'admin' }, {}, null]) await expect(api['setRole']!({ homey, params: { id: 'd1' }, body })).rejects.toThrow();
});

test('without a server there is nothing to set', async () => {
  const stopped = app(null);
  await expect(stopped.setFlowKey('x')).rejects.toThrow();
  await expect(stopped.getCode({})).rejects.toThrow();
  expect(() => stopped.setRole('d1', 'use')).toThrow();
  expect(await stopped.getState()).toMatchObject({ running: false });
});

test('both languages have every text the settings use', () => {
  const keys = (texts: Texts) => Object.entries(texts).flatMap(([group, values]) => Object.keys(values).map((key) => `${group}.${key}`));
  expect(keys(nl!)).toEqual(keys(en!));
  for (const texts of [nl!, en!]) for (const value of Object.values(texts).flatMap((group) => Object.values(group))) expect(value.trim()).not.toBe('');
  const used = [...page.matchAll(/data-i18n="settings\.([\w-]+)"/g), ...page.matchAll(/\bt\('([\w-]+)'[,)]/g)].map((match) => match[1]!);
  expect(used.filter((key) => !(key in nl!['settings']!))).toEqual([]);
  // what is said of a key, by what the app calls it
  for (const state of ['none', 'works', 'wide', 'refused']) expect(nl!['settings']).toHaveProperty(`flowKey-${state}`);
  for (const result of ['not-a-key', 'refused', 'no-right', 'unreachable']) expect(nl!['settings']).toHaveProperty(`flowKeyFailed-${result}`);
  // how the live news of widgets of apps is doing, under a key that may do everything
  for (const state of ['idle', 'waiting', 'on', 'on-one', 'refused']) for (const texts of [nl!, en!]) expect(texts['settings']).toHaveProperty(`live-${state}`);
  expect(nl!['settings']!['live-on']).toContain('__apps__');
  expect(page).toMatch(/id="liveState"[^>]*aria-live="polite"/);
});

test('what somebody types as a key is not shown and not kept by a browser', () => {
  const input = /<input[^>]*id="key"[^>]*>/.exec(page)![0];
  expect(input).toContain('type="password"');
  expect(input).toContain('autocomplete="off"');
  // what became of it is read out with the field
  expect(input).toContain('aria-describedby="keyResult"');
});

test('the app has one name, in every place somebody sees it', () => {
  const app = JSON.parse(read('app.json')) as { id: string; name: Record<string, string>; author: { name: string } };
  expect(app.author).toEqual({ name: 'DIMENTS' });
  expect([app.id, app.name]).toEqual(['app.expressive.home', { en: 'Expressive Home', nl: 'Expressive Home' }]);
  for (const path of ['app.json', 'app.js', 'package.json', 'locales/nl.json', 'locales/en.json', 'settings/index.html', 'README.txt', 'README.nl.txt']) expect([path, /material.?(?:homey|dashboard)/i.test(read(path))]).toEqual([path, false]);
});

test('the settings only use the styles that Homey has', () => {
  const known = ['homey-header', 'homey-title', 'homey-button-primary-full', 'homey-button-secondary-shadow', 'homey-button-danger-shadow', 'homey-button-small', 'homey-form-fieldset', 'homey-form-legend', 'homey-form-label', 'homey-form-input', 'homey-form-select', 'homey-form-checkbox', 'homey-form-checkbox-input', 'homey-form-checkbox-checkmark', 'homey-form-checkbox-text'];
  const used = [...page.matchAll(/homey-(?:button|form|header|title)[\w-]*/g)].map((match) => match[0]);
  expect(used.length).toBeGreaterThan(10);
  expect([...new Set(used)].filter((name) => !known.includes(name))).toEqual([]);
});

test('what stands on the settings is never made from text', () => {
  expect(page).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\sstyle="/);
});

test('recording what Homey does not keep is switched on and off, and wiped, from the settings', async () => {
  expect(manifest.api['setRecording']).toEqual({ method: 'PUT', path: '/recording' });
  expect(manifest.api['wipeRecording']).toEqual({ method: 'DELETE', path: '/recording' });
  expect(manifest.api).not.toHaveProperty('measureHistory');
  const server = { setRecording: vi.fn(), wipeRecording: vi.fn(async () => {}), recording: () => true };
  const homey = { app: app(server) };
  const api = load<Record<string, (request: Record<string, unknown>) => Promise<unknown>>>('api.js');
  await api['setRecording']!({ homey, body: { on: false } });
  expect(server.setRecording).toHaveBeenCalledWith(false);
  await expect(api['setRecording']!({ homey, body: { on: 'ja' } })).rejects.toThrow();
  await api['wipeRecording']!({ homey });
  expect(server.wipeRecording).toHaveBeenCalledOnce();
  expect(page).toMatch(/<input[^>]*id="record"[^>]*type="checkbox"/);
  expect(page).toMatch(/<button[^>]*id="wipe"[^>]*data-i18n="settings\.recordWipe"/);
  expect(page).not.toContain('/history/measure');
});

test('the page is one list of sections, without anything folded away, with three choices for the key for flows', () => {
  const legends = [...page.matchAll(/<legend class="homey-form-legend" data-i18n="settings\.([\w-]+)"/g)].map((match) => match[1]);
  expect(legends.filter((key) => ['devices', 'here', 'flows', 'record', 'night', 'help'].includes(key!))).toEqual(['devices', 'here', 'flows', 'record', 'night', 'help']);
  expect(page).not.toContain('<details');
  const levels = [...page.matchAll(/<input[^>]*name="level"[^>]*value="(\w+)"/g)].map((match) => match[1]);
  expect(levels).toEqual(['none', 'flows', 'full']);
  for (const key of ['levelNone', 'levelNoneText', 'levelFlows', 'levelFlowsText', 'levelFull', 'levelFullText', 'flowsStep2Full', 'help', 'helpText']) {
    expect([key, nl!['settings']![key]?.length ?? 0]).not.toEqual([key, 0]);
    expect([key, en!['settings']![key]?.length ?? 0]).not.toEqual([key, 0]);
  }
});
