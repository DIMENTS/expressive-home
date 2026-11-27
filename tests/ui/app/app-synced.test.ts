// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { MhApp } from '../../../src/ui/app/app';
import type { Synced } from '../../../src/ui/app/synced';

// A page with a key that is paired with the app on its hub: the dashboards, looks and own widgets that are shared come from
// the hub, as on a page the hub served; the key and everything else stay as on any page with a key.

const media = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);
beforeEach(() => { vi.stubGlobal('matchMedia', () => media); window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });
const settle = async (app: MhApp) => { for (let i = 0; i < 5; i += 1) { await new Promise((r) => setTimeout(r, 0)); await app.updateComplete; } };

async function start(role: 'use' | 'edit') {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const hub = fakeHub();
  let conflict: () => void = () => {};
  let unsaved: () => void = () => {};
  let unpaired: (by: 'hub' | 'here') => void = () => {};
  const sendLooks = vi.fn();
  const widgets = { list: () => [], change: vi.fn(async () => 'refused' as const), subscribe: () => () => {} };
  const synced = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'de-sleutel' }), mayArrange: () => role === 'edit', knownRole: () => role, widgets, sendLooks,
    onLooks: () => {}, onLooksRefused: () => {}, onLooksTooBig: () => {}, onConflict: (l: () => void) => { conflict = l; }, onUnsaved: (l: () => void) => { unsaved = l; }, onUnpaired: (l: typeof unpaired) => { unpaired = l; }, onRefused: () => {},
    mismatch: () => null, up: () => true, unpair: async () => {}, flush: () => {}, link: { on: () => () => {}, rest: () => {} },
  } as unknown as Synced;
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload, hash: '', href: 'http://localhost/' });
  const app = document.createElement('mh-app') as MhApp & { panel: string };
  app.environment = {
    configStore: synced.configStore, createRealClient: () => hub, createDemoClient: () => hub, synced, away: { pair: async () => 'ok', paired: () => true, unpair: async () => {} },
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  return { app, conflict: () => conflict(), unsaved: () => unsaved(), unpaired: () => unpaired('hub'), reload, widgets };
}

const snackbar = (app: MhApp): string => app.shadowRoot!.querySelector('mh-snackbar')?.shadowRoot?.textContent ?? '';

test('a key page that is paired opens with its key, never the pair screen, and arranges only as the hub allows', async () => {
  const use = await start('use');
  expect(use.app.shadowRoot!.querySelector('mh-pair-screen')).toBeNull();
  expect(use.app.shadowRoot!.querySelector('mh-connect-screen')).toBeNull();
  expect((use.app as unknown as { controller: { mayArrange?: () => boolean } }).controller).toBeDefined();
  document.body.replaceChildren();
  const edit = await start('edit');
  expect(edit.app.shadowRoot!.querySelector('mh-dashboard')).not.toBeNull();
});

test('another device that saved first, and a change that waits for the hub, are said as at home', async () => {
  const s = await start('edit');
  s.conflict();
  await settle(s.app);
  expect(snackbar(s.app)).toContain('Op een ander apparaat is ondertussen iets veranderd.');
  s.unsaved();
  await settle(s.app);
  expect(snackbar(s.app).length).toBeGreaterThan(0);
});

test('taken away on the hub: the page starts anew, and says why once it is back', async () => {
  const s = await start('use');
  s.unpaired();
  expect(s.reload).toHaveBeenCalledOnce();
  expect(window.sessionStorage.getItem('dashboard.away.gone')).toBe('1');
});

test('the own widgets of the house are the hub\'s', async () => {
  const s = await start('edit');
  expect((s.app as unknown as { widgetLibrary: unknown }).widgetLibrary).toBe(s.widgets);
});

async function startPlain(goneBefore = false) {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  if (goneBefore) window.sessionStorage.setItem('dashboard.away.gone', '1');
  const hub = fakeHub();
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload, hash: '', href: 'http://localhost/' });
  const pair = vi.fn(async () => 'ok' as const);
  const unpair = vi.fn(async () => {});
  const app = document.createElement('mh-app') as MhApp & { panel: string };
  app.environment = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'de-sleutel' }), createRealClient: () => hub, createDemoClient: () => hub,
    away: { pair, paired: () => false, unpair },
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  app.panel = 'settings';
  await settle(app);
  return { app, reload, pair, unpair, panel: () => app.shadowRoot!.querySelector('mh-settings-panel') as HTMLElement & { away: unknown; pairAway: (code: string, name: string) => Promise<string> } };
}

test('a page with a key that is not paired offers it in the settings; once paired it starts anew', async () => {
  const s = await startPlain();
  expect(s.panel().away).toEqual({ paired: false, role: null, up: false, mismatch: null });
  expect(await s.panel().pairAway('12345678', 'Telefoon')).toBe('ok');
  expect(s.pair).toHaveBeenCalledWith('12345678', 'Telefoon');
  s.panel().dispatchEvent(new CustomEvent('away-paired', { bubbles: true, composed: true }));
  expect(s.reload).toHaveBeenCalledOnce();
});

test('a paired page tells where it stands, and unpairing takes it off the hub and starts anew', async () => {
  const p = await start('edit');
  p.app.panel = 'settings';
  await settle(p.app);
  const panel = p.app.shadowRoot!.querySelector('mh-settings-panel') as HTMLElement & { away: unknown };
  expect(panel.away).toEqual({ paired: true, role: 'edit', up: true, mismatch: null });
});

test('after the hub took the pairing away the page says so once', async () => {
  const s = await startPlain(true);
  expect(snackbar(s.app)).toContain('Dit apparaat is losgekoppeld van je Homey.');
  expect(window.sessionStorage.getItem('dashboard.away.gone')).toBeNull();
});

test('unpairing from the settings takes the page off the hub, then it starts anew', async () => {
  const s = await startPlain();
  s.panel().dispatchEvent(new CustomEvent('away-unpair', { bubbles: true, composed: true }));
  await settle(s.app);
  expect(s.unpair).toHaveBeenCalledOnce();
  expect(s.reload).toHaveBeenCalledOnce();
});

test('what the hub will never take is said for what it is; breaking the pairing here starts the page anew without a word', async () => {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const hub = fakeHub();
  let refused: (why: 'too-big' | 'format' | 'bad') => void = () => {};
  let unpaired: (by: 'hub' | 'here') => void = () => {};
  const synced = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'de-sleutel' }), mayArrange: () => true, knownRole: () => 'edit', widgets: { list: () => [], change: async () => 'ok', subscribe: () => () => {} }, sendLooks: () => {},
    onLooks: () => {}, onLooksRefused: () => {}, onLooksTooBig: () => {}, onConflict: () => {}, onUnsaved: () => {}, onUnpaired: (l: typeof unpaired) => { unpaired = l; }, onRefused: (l: typeof refused) => { refused = l; },
    mismatch: () => null, up: () => true, unpair: async () => {}, flush: () => {}, link: { on: () => () => {}, rest: () => {} },
  } as unknown as Synced;
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload, hash: '', href: 'http://localhost/' });
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore: synced.configStore, createRealClient: () => hub, createDemoClient: () => hub, synced, away: { pair: async () => 'ok', paired: () => true, unpair: async () => {} },
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  refused('too-big');
  await settle(app);
  expect(snackbar(app)).toContain('Te groot om via de cloud te bewaren.');
  unpaired('here');
  expect(reload).toHaveBeenCalledOnce();
  expect(window.sessionStorage.getItem('dashboard.away.gone')).toBeNull();
});
