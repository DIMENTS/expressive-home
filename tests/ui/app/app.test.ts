// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { STORAGE_KEY } from '../../../src/storage/local-store';
import { colorTokens } from '../../../src/theme/engine';
import type { ThemeSettings } from '../../../src/theme/types';
import type { HubLayout } from '../../../src/layout/types';
import { camperSnapshot } from '../../helpers/fake-hub';
import { REBUILD_QUIET_MS } from '../../../src/ui/app/controller';
import type { AppEnvironment, MhApp } from '../../../src/ui/app/app';
import { emptyLooksDoc } from '../../../src/theme/looks-doc';
import type { ThemeFile } from '../../../src/theme/look';
import { cap, device } from '../../helpers/build';
import { deep, deepAll, deepText } from '../../helpers/deep';
import { board, heroSection, hubLayout, overview, ownSection, sensorTile } from '../../helpers/layout';

const listeners = new Set<(event: { matches: boolean }) => void>();
const media = {
  matches: false,
  addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => { listeners.add(listener); },
  removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => { listeners.delete(listener); },
};

/** Whether the window is as narrow as a phone. */
const phoneListeners = new Set<() => void>();
const phoneMedia = {
  matches: false,
  addEventListener: (_type: string, listener: () => void) => { phoneListeners.add(listener); },
  removeEventListener: (_type: string, listener: () => void) => { phoneListeners.delete(listener); },
};
const setPhone = async (app: MhApp, phone: boolean) => {
  phoneMedia.matches = phone;
  for (const listener of [...phoneListeners]) listener();
  await settle(app);
};

// The first import transforms every icon of the library; it is not charged to a test.
beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);

beforeEach(() => {
  media.matches = false;
  listeners.clear();
  phoneMedia.matches = false;
  phoneListeners.clear();
  vi.stubGlobal('matchMedia', (query: string) => (query === '(width < 600px)' ? phoneMedia : media));
  window.localStorage.clear();
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const settle = async (app: MhApp) => { for (let i = 0; i < 5; i += 1) { await new Promise((r) => setTimeout(r, 0)); await app.updateComplete; } };
const surface = () => document.documentElement.style.getPropertyValue('--c-surface');

async function startApp(): Promise<MhApp> {
  await import('../../../src/ui/app/app');
  const app = document.createElement('mh-app') as MhApp;
  document.body.append(app);
  await settle(app);
  return app;
}

test('in automatic mode the app follows the system when it turns dark', async () => {
  const app = await startApp();
  expect(surface()).toBe(colorTokens('#3b6939', 'light', 0)['--c-surface']);
  media.matches = true;
  for (const listener of listeners) listener({ matches: true });
  await settle(app);
  expect(surface()).toBe(colorTokens('#3b6939', 'dark', 0)['--c-surface']);
  expect(document.documentElement.dataset['mode']).toBe('dark');
});

test('a chosen theme is applied to the document at once and saved', async () => {
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'theme' } }));
  await settle(app);
  const panel = app.shadowRoot!.querySelector('mh-theme-panel') as HTMLElement & { open: boolean };
  expect(panel.open).toBe(true);
  const next: ThemeSettings = { seed: '#a6422a', mode: 'dark', density: 'compact' };
  panel.dispatchEvent(new CustomEvent('look-choose', { detail: { target: 'device', seed: next.seed } }));
  panel.dispatchEvent(new CustomEvent('look-choose', { detail: { target: 'device', mode: next.mode } }));
  panel.dispatchEvent(new CustomEvent('density', { detail: { density: next.density } }));
  await settle(app);
  expect(surface()).toBe(colorTokens('#a6422a', 'dark', 0)['--c-surface']);
  expect(document.documentElement.dataset['density']).toBe('compact');
  expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).theme).toEqual(next);
});

test('a window as narrow as a phone gets the sizes of a phone; the choice of the owner stays', async () => {
  phoneMedia.matches = true;
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  const shown = () => [document.documentElement.dataset['density'], (app.shadowRoot!.querySelector('mh-dashboard') as HTMLElement & { density: string }).density];
  expect(shown()).toEqual(['phone', 'phone']);
  await setPhone(app, false);
  expect(shown()).toEqual(['comfortable', 'comfortable']);
  await setPhone(app, true);
  expect(shown()).toEqual(['phone', 'phone']);
  expect(window.localStorage.getItem(STORAGE_KEY) ?? '').not.toContain('phone');
  app.remove();
  expect(phoneListeners.size).toBe(0);
});

test('the rail opens the settings and closes the panels again', async () => {
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  const dashboard = app.shadowRoot!.querySelector('mh-dashboard') as HTMLElement & { activePanel: string };
  dashboard.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'settings' } }));
  await settle(app);
  expect((app.shadowRoot!.querySelector('mh-settings-panel') as HTMLElement & { open: boolean }).open).toBe(true);
  expect(dashboard.activePanel).toBe('settings');
  app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('close'));
  await settle(app);
  expect(dashboard.activePanel).toBe('none');
});

/** The element that really has focus, through shadow roots. */
function focused(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}
const within = (element: Element | null, host: Element | null) => {
  let node: Node | null = element;
  while (node) {
    if (node === host) return true;
    node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
  }
  return false;
};

test('focus follows the person from the connect screen to the dashboard and back', async () => {
  const app = await startApp();
  const screen = app.shadowRoot!.querySelector('mh-connect-screen')!;
  screen.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  expect(within(focused(), app.shadowRoot!.querySelector('mh-dashboard'))).toBe(true);
  app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('leave-demo'));
  await settle(app);
  const back = app.shadowRoot!.querySelector('mh-connect-screen');
  expect(within(focused(), back)).toBe(true);
  expect(focused()?.tagName).toBe('INPUT');
});

test('an open panel closes when the app leaves the dashboard', async () => {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const { createMockClient } = await import('../../../src/mock/mock-client');
  const { demoRaw } = await import('../../../src/ui/app/demo');
  await import('../../../src/ui/app/app');
  const hub = fakeHub();
  const app = document.createElement('mh-app') as MhApp & { panel: string };
  app.environment = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' }), createRealClient: () => hub, createDemoClient: () => createMockClient(demoRaw()),
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  const openTheme = async () => {
    app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'theme' } }));
    await settle(app);
    expect(app.panel).toBe('theme');
  };
  await openTheme();
  hub.emit({ type: 'authError' });
  await settle(app);
  expect(app.shadowRoot!.querySelector('mh-connect-screen')).not.toBeNull();
  expect(app.panel).toBe('none');

  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('connect', { detail: { address: HOMEY_ID, apiKey: 'k2' } }));
  await settle(app);
  expect((app.shadowRoot!.querySelector('mh-theme-panel') as HTMLElement & { open: boolean }).open).toBe(false);
  await openTheme();
  app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('change-connection'));
  await settle(app);
  expect(app.panel).toBe('none');
});

/** An app over a fake hub with a saved key, already on the dashboard. */
async function startWithHub(browser: string[] = ['nl-NL'], layout?: HubLayout, quietMs?: number) {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const { createMockClient } = await import('../../../src/mock/mock-client');
  const { demoRaw } = await import('../../../src/ui/app/demo');
  await import('../../../src/ui/app/app');
  const hub = fakeHub();
  const createRealClient = vi.fn(() => hub);
  const app = document.createElement('mh-app') as MhApp & { panel: string };
  const configStore = memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' });
  if (layout) configStore.stored().layouts = { [HOMEY_ID]: layout };
  app.environment = {
    configStore, createRealClient, createDemoClient: () => createMockClient(demoRaw()),
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms === REBUILD_QUIET_MS && quietMs !== undefined ? quietMs : ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    browserLanguages: browser,
  };
  document.body.append(app);
  await settle(app);
  return { app, hub, createRealClient, configStore };
}

test('switching language keeps the connection and the open panel', async () => {
  const { app, createRealClient } = await startWithHub();
  app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'settings' } }));
  await settle(app);
  const panel = app.shadowRoot!.querySelector('mh-settings-panel') as HTMLElement & { open: boolean };
  const group = [...panel.shadowRoot!.querySelectorAll('mh-choice-group')].find((g) => g.getAttribute('label') === 'Taal')!;
  const english = group.shadowRoot!.querySelector<HTMLElement>('[role="radio"][data-id="en"]')!;
  english.focus();
  english.click();
  await settle(app);
  expect(panel.open).toBe(true);
  expect(app.panel).toBe('settings');
  expect((panel.shadowRoot!.querySelector('mh-sheet') as HTMLElement & { heading: string }).heading).toBe('Settings');
  const dashboard = app.shadowRoot!.querySelector('mh-dashboard')!;
  expect(dashboard.shadowRoot!.querySelector('mh-rail')!.shadowRoot!.textContent).toContain('Overview');
  expect(createRealClient).toHaveBeenCalledTimes(1);
  const active = focused();
  expect(active === english || group.shadowRoot!.contains(active)).toBe(true);
});

test('the page language follows', async () => {
  const { app } = await startWithHub(['nl-NL']);
  expect(document.documentElement.lang).toBe('nl');
  app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'settings' } }));
  await settle(app);
  const panel = app.shadowRoot!.querySelector('mh-settings-panel')!;
  panel.dispatchEvent(new CustomEvent('language', { detail: { choice: 'en' } }));
  await settle(app);
  expect(document.documentElement.lang).toBe('en');
  panel.dispatchEvent(new CustomEvent('language', { detail: { choice: null } }));
  await settle(app);
  expect(document.documentElement.lang).toBe('nl');
});

test('without a saved choice an English browser gets the connect screen in English', async () => {
  await import('../../../src/ui/app/app');
  const { memoryConfig } = await import('../../helpers/fake-hub');
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore: memoryConfig(), createRealClient: () => null, createDemoClient: () => { throw new Error('unused'); },
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    browserLanguages: ['en-GB'],
  };
  document.body.append(app);
  await settle(app);
  expect(app.shadowRoot!.querySelector('mh-connect-screen')!.shadowRoot!.querySelector('h1')!.textContent).toBe('Connect your Homey');
  expect(document.documentElement.lang).toBe('en');
});

test('a section without its own colour follows a new base colour; one with its own keeps it', async () => {
  const { colorTokens } = await import('../../../src/theme/engine');
  const { app } = await startWithHub();
  const dashboard = app.shadowRoot!.querySelector('mh-dashboard')!;
  dashboard.dispatchEvent(new CustomEvent('section-seed', { detail: { sectionId: 'type:water', seed: '#3a5ba9' }, bubbles: true, composed: true }));
  await settle(app);
  const sections = () => [...dashboard.shadowRoot!.querySelectorAll('mh-section')] as (HTMLElement & { section: { id: string } })[];
  const water = () => sections().find((s) => s.section.id === 'type:water')!;
  const lights = () => sections().find((s) => s.section.id === 'type:lights')!;
  expect(water().style.getPropertyValue('--c-primary')).toBe(colorTokens('#3a5ba9', 'light', 0)['--c-primary']);
  app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'theme' } }));
  await settle(app);
  const panel = app.shadowRoot!.querySelector('mh-theme-panel')!;
  panel.dispatchEvent(new CustomEvent('look-choose', { detail: { target: 'device', seed: '#a6422a' } }));
  panel.dispatchEvent(new CustomEvent('look-choose', { detail: { target: 'device', mode: 'dark' } }));
  await settle(app);
  expect(lights().hasAttribute('data-own-seed')).toBe(false);
  expect(surface()).toBe(colorTokens('#a6422a', 'dark', 0)['--c-surface']);
  expect(water().style.getPropertyValue('--c-surface')).toBe(colorTokens('#3a5ba9', 'dark', 0)['--c-surface']);
  // red stays the dashboard's
  expect(water().style.getPropertyValue('--c-error')).toBe('');
});

test('when the system turns dark, a section with its own colour follows in its dark palette', async () => {
  const { colorTokens } = await import('../../../src/theme/engine');
  const { app } = await startWithHub();
  const dashboard = app.shadowRoot!.querySelector('mh-dashboard')!;
  dashboard.dispatchEvent(new CustomEvent('section-seed', { detail: { sectionId: 'type:water', seed: '#3a5ba9' }, bubbles: true, composed: true }));
  await settle(app);
  const water = () => ([...dashboard.shadowRoot!.querySelectorAll('mh-section')] as (HTMLElement & { section: { id: string } })[]).find((s) => s.section.id === 'type:water')!;
  expect(water().style.getPropertyValue('--c-surface')).toBe(colorTokens('#3a5ba9', 'light', 0)['--c-surface']);
  media.matches = true;
  for (const listener of listeners) listener({ matches: true });
  await settle(app);
  expect(water().style.getPropertyValue('--c-surface')).toBe(colorTokens('#3a5ba9', 'dark', 0)['--c-surface']);
});

test('a change that another tab saved is taken over', async () => {
  const app = await startApp();
  expect(surface()).toBe(colorTokens('#3b6939', 'light', 0)['--c-surface']);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, theme: { seed: '#a6422a', mode: 'light', density: 'compact' } }));
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'something.else' }));
  await settle(app);
  expect(document.documentElement.dataset['density']).toBe('comfortable');
  window.dispatchEvent(Object.assign(new Event('storage'), { key: STORAGE_KEY }));
  // reading what the other tab saved takes a turn or two; a busy computer takes more
  await vi.waitFor(() => expect(document.documentElement.dataset['density']).toBe('compact'), { timeout: 8000 });
  await vi.waitFor(() => expect(surface()).toBe(colorTokens('#a6422a', 'light', 0)['--c-surface']), { timeout: 8000 });
});

// ----- the edit mode -----

test('an app that is no longer on the page leaves the look of the page alone', async () => {
  const first = await startApp();
  first.remove();
  const second = await startApp();
  const before = [surface(), document.documentElement.dataset['density']];
  // the first one still hears things, and draws itself again
  (first as unknown as { controller: { setTheme(theme: ThemeSettings): void } }).controller.setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  await settle(first);
  await settle(second);
  expect([surface(), document.documentElement.dataset['density']]).toEqual(before);
});

const dashboardOf = (app: MhApp) => app.shadowRoot!.querySelector('mh-dashboard') as HTMLElement & { editing: boolean; firstTime: boolean; canUndo: boolean; boardName: string; board: { id: string } };
/** Without the rooms: those are tested apart. */
const railNames = (app: MhApp) => [...deep(app, 'mh-rail').shadowRoot!.querySelectorAll('button')].map((b) => b.textContent!.trim()).filter((name) => name !== 'Kamers' && name !== 'Rooms');
const twoBoards = () => hubLayout([
  overview([ownSection('own:a', [sensorTile('t-1', 'device-13')], { name: 'Binnen' }), { ...ownSection('type:lights', []), kind: 'lights', name: null }]),
  board('d-1', [ownSection('own:b', [], { name: null })], { name: 'Buiten', icon: 'deck' }),
], { known: [...Object.keys(camperSnapshot().devices), 'flow:flow-1', 'flow:flow-2'], names: {} });

test('Bewerken in the rail turns the edit mode on and off; Klaar turns it off', async () => {
  const { app } = await startWithHub();
  expect(deepAll(app, 'mh-edit-bar')).toHaveLength(0);
  const toggle = () => deep(app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  toggle();
  await settle(app);
  expect(dashboardOf(app)).toMatchObject({ editing: true, firstTime: true, canUndo: false, boardName: 'Overzicht' });
  deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('done', { bubbles: true, composed: true }));
  await settle(app);
  expect(dashboardOf(app).editing).toBe(false);
  toggle();
  toggle();
  await settle(app);
  expect(dashboardOf(app).editing).toBe(false);
});

test('an own overview has no first-time note', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(app);
  expect(dashboardOf(app)).toMatchObject({ editing: true, firstTime: false });
});

test('the rail shows the dashboards and opens them', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  expect(railNames(app).slice(0, 2)).toEqual(['Overzicht', 'Buiten']);
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'board:d-1' } }));
  await settle(app);
  expect(dashboardOf(app).board.id).toBe('d-1');
  expect(deep(app, 'mh-rail').shadowRoot!.querySelector('[aria-current="page"]')!.textContent!.trim()).toBe('Buiten');
});

test('leaving the dashboard turns the edit mode off', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(app);
  // a panel does not leave the dashboard
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'theme' } }));
  await settle(app);
  expect(dashboardOf(app).editing).toBe(true);
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'board:d-1' } }));
  await settle(app);
  expect(dashboardOf(app).editing).toBe(false);
});

test('switching the language renames the app sections and the overview, not own names', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(app);
  const titles = () => deepAll(app, 'mh-section').map((section) => section.shadowRoot!.querySelector('.title')!.textContent);
  expect(titles()).toEqual(['Binnen', 'Verlichting']);
  app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('language', { detail: { choice: 'en' } }));
  await settle(app);
  expect(titles()).toEqual(['Binnen', 'Lights']);
  expect(railNames(app).slice(0, 2)).toEqual(['Overview', 'Buiten']);
  // the edit mode stays on
  expect(dashboardOf(app)).toMatchObject({ editing: true, boardName: 'Overview' });
  expect(deepText(deep(app, 'mh-edit-bar'))).toContain('Editing Overview');
});

const toggleEdit = async (app: MhApp) => {
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(app);
};
const shownTiles = (app: MhApp, sectionId: string) => {
  const section = deepAll(app, 'mh-section').find((el) => (el as HTMLElement & { section: { id: string } }).section.id === sectionId);
  return section ? [...section.shadowRoot!.querySelectorAll<HTMLElement & { spec: { id: string } }>('.tiles > *')].filter((el) => el.spec).map((el) => el.spec.id) : [];
};
const snackbar = (app: MhApp) => deep(app, 'mh-snackbar');

test('removing a tile can be undone from the notice', async () => {
  const { app, configStore } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  dashboardOf(app).dispatchEvent(new CustomEvent('layout-edit', { detail: { edit: { type: 'remove-tile', dashboardId: 'overview', tileId: 't-1' } } }));
  await settle(app);
  expect(shownTiles(app, 'own:a')).toEqual([]);
  expect(deepText(snackbar(app))).toContain(`${camperSnapshot().devices['device-13']!.name} is van dit dashboard gehaald.`);
  const undo = deepAll(snackbar(app), 'button').find((b) => b.textContent!.includes('Ongedaan maken')) ?? deepAll(snackbar(app), 'mh-button').find((b) => b.textContent!.includes('Ongedaan maken'))!;
  undo.click();
  await settle(app);
  expect(shownTiles(app, 'own:a')).toEqual(['t-1']);
  expect(configStore.stored().layouts).not.toEqual({});
});

test('an edit from the dashboard reaches the layout, and the edit bar can undo it', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  const before = shownTiles(app, 'type:lights');
  dashboardOf(app).dispatchEvent(new CustomEvent('layout-edit', { detail: { edit: { type: 'move-tile', dashboardId: 'overview', tileId: before[0], toSectionId: 'type:lights', index: 2 } } }));
  await settle(app);
  expect(shownTiles(app, 'type:lights').slice(0, 3)).toEqual([before[1], before[2], before[0]]);
  expect(dashboardOf(app)).toMatchObject({ firstTime: false, canUndo: true });
  deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('undo', { bubbles: true, composed: true }));
  await settle(app);
  expect(shownTiles(app, 'type:lights')).toEqual(before);
  expect(dashboardOf(app)).toMatchObject({ firstTime: true, canUndo: false });
});

test('a tile added in the panel lands at the end of its section, lights up, and can be undone', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  dashboardOf(app).dispatchEvent(new CustomEvent('open-add', { detail: { sectionId: 'own:a' } }));
  await settle(app);
  const panel = app.shadowRoot!.querySelector('mh-add-panel') as HTMLElement & { open: boolean; sectionName: string; boardName: string; newId: () => string };
  expect([panel.open, panel.sectionName, panel.boardName]).toEqual([true, 'Binnen', 'Overzicht']);
  expect(panel.newId()).toMatch(/^t-/);
  panel.dispatchEvent(new CustomEvent('add-tiles', { detail: { name: 'Sensor', tiles: [sensorTile('t-9', 'device-13', 'measure_humidity', { source: 'value' })] } }));
  await settle(app);
  expect(shownTiles(app, 'own:a')).toEqual(['t-1', 't-9']);
  expect(panel.open).toBe(true);
  expect((dashboardOf(app) as unknown as { freshTiles: string[] }).freshTiles).toEqual(['t-9']);
  expect(deepText(snackbar(app))).toContain('Sensor staat nu in Binnen.');
  deepAll(snackbar(app), 'button').find((b) => b.textContent!.includes('Ongedaan maken'))?.click();
  deepAll(snackbar(app), 'mh-button').find((b) => b.textContent!.includes('Ongedaan maken'))?.click();
  await settle(app);
  expect(shownTiles(app, 'own:a')).toEqual(['t-1']);
  expect(panel.open).toBe(true);
  panel.dispatchEvent(new CustomEvent('close'));
  await settle(app);
  expect(panel.open).toBe(false);
});

test('the panel closes when its section disappears, and one panel is open at a time', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  const panel = app.shadowRoot!.querySelector('mh-add-panel') as HTMLElement & { open: boolean };
  dashboardOf(app).dispatchEvent(new CustomEvent('open-add', { detail: { sectionId: 'own:a' } }));
  await settle(app);
  dashboardOf(app).dispatchEvent(new CustomEvent('layout-edit', { detail: { edit: { type: 'remove-section', dashboardId: 'overview', sectionId: 'own:a' } } }));
  await settle(app);
  expect(panel.open).toBe(false);
  dashboardOf(app).dispatchEvent(new CustomEvent('open-add', { detail: { sectionId: 'type:lights' } }));
  await settle(app);
  expect(panel.open).toBe(true);
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'theme' } }));
  await settle(app);
  expect(panel.open).toBe(false);
  expect((app.shadowRoot!.querySelector('mh-theme-panel') as HTMLElement & { open: boolean }).open).toBe(true);
});

const tilePanel = (app: MhApp) => app.shadowRoot!.querySelector('mh-tile-panel') as HTMLElement & { open: boolean; tile: { id: string; label: string | null; spec: { dimCapabilityId?: string } } | null; sectionName: string; device: { id: string } | undefined };

test('tile settings work on the automatic overview too, and typing a name is one step', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  const id = shownTiles(app, 'type:lights')[0]!;
  dashboardOf(app).dispatchEvent(new CustomEvent('open-tile', { detail: { tileId: id } }));
  await settle(app);
  expect(tilePanel(app)).toMatchObject({ open: true, sectionName: 'Verlichting', tile: { id, label: null }, device: { id: 'device-1' } });
  for (const label of ['B', 'Bo', 'Boven']) tilePanel(app).dispatchEvent(new CustomEvent('set-tile', { detail: { patch: { label }, typing: true } }));
  await settle(app);
  expect(tilePanel(app).tile!.label).toBe('Boven');
  const tile = deepAll(app, 'mh-light-tile')[0]!;
  expect(tile.shadowRoot!.querySelector('.name')!.textContent).toBe('Boven');
  deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('undo', { bubbles: true, composed: true }));
  await settle(app);
  expect(dashboardOf(app)).toMatchObject({ firstTime: true, canUndo: false });
  expect(tilePanel(app).open).toBe(true);
});

test('the slider of an RGBW lamp then sets the white level', async () => {
  const { app, hub } = await startWithHub();
  await toggleEdit(app);
  const id = shownTiles(app, 'type:lights')[0]!;
  dashboardOf(app).dispatchEvent(new CustomEvent('open-tile', { detail: { tileId: id } }));
  await settle(app);
  const spec = tilePanel(app).tile!.spec;
  tilePanel(app).dispatchEvent(new CustomEvent('set-tile', { detail: { patch: { spec: { ...spec, dimCapabilityId: 'dim.white' } } } }));
  await settle(app);
  tilePanel(app).dispatchEvent(new CustomEvent('close'));
  await toggleEdit(app);
  deepAll(app, 'mh-light-tile')[0]!.shadowRoot!.querySelector('mh-slider')!.dispatchEvent(new CustomEvent('commit', { detail: { fraction: 0.5 } }));
  await settle(app);
  expect(hub.setCapability).toHaveBeenCalledWith('device-1', 'dim.white', 0.5);
});

test('removing a tile in its settings closes them', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  dashboardOf(app).dispatchEvent(new CustomEvent('open-tile', { detail: { tileId: 't-1' } }));
  await settle(app);
  tilePanel(app).dispatchEvent(new CustomEvent('remove'));
  await settle(app);
  expect(tilePanel(app).open).toBe(false);
  expect(shownTiles(app, 'own:a')).toEqual([]);
  expect(deepText(snackbar(app))).toContain('is van dit dashboard gehaald.');
});

const nameDialog = (app: MhApp) => app.shadowRoot!.querySelector('mh-name-icon-dialog') as HTMLElement & { open: boolean; heading: string; name: string; namePlaceholder: string; icon: string | null; autoIcon: string | null; kindChoice: string; heroTaken: boolean; confirmLabel: string };
const confirmDialog = (app: MhApp) => app.shadowRoot!.querySelector('mh-dialog.confirm') as HTMLElement & { open: boolean; heading: string };
const press = (root: Element, text: string) => deepAll(root, 'mh-button').find((b) => b.textContent!.trim() === text)!.click();
const dispatch = async (app: MhApp, type: string, detail: unknown) => { dashboardOf(app).dispatchEvent(new CustomEvent(type, { detail })); await settle(app); };
const shownSections = (app: MhApp) => deepAll(app, '.col').map((col) => [...col.children].flatMap((el) => ((el as HTMLElement).dataset['sectionId'] ? [(el as HTMLElement).dataset['sectionId']!] : [])));
const sectionTitles = (app: MhApp) => deepAll(app, 'mh-section').map((el) => el.shadowRoot!.querySelector('.title')!.textContent);

test('adding an own section puts it at the end of its column, empty', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await dispatch(app, 'open-section-dialog', { sectionId: null, column: 'right' });
  expect(nameDialog(app)).toMatchObject({ open: true, heading: 'Sectie toevoegen', confirmLabel: 'Toevoegen', name: '', icon: 'view_agenda', autoIcon: null, kindChoice: 'section', heroTaken: true });
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Buiten', icon: 'park' } }));
  await settle(app);
  expect(nameDialog(app).open).toBe(false);
  expect(sectionTitles(app).at(-1)).toBe('Buiten');
  const id = shownSections(app)[1]!.at(-1)!;
  expect(id).toMatch(/^own:s-/);
  expect(shownTiles(app, id)).toEqual([]);
});

test('the hero can be added to a board without one', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  await dispatch(app, 'open-section-dialog', { sectionId: null, column: 'left' });
  expect(nameDialog(app).heroTaken).toBe(false);
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'hero', name: null, icon: null } }));
  await settle(app);
  expect(shownSections(app)[0]!.at(-1)).toBe('hero:main');
  expect(deepAll(app, 'mh-hero')).toHaveLength(1);
});

test('renaming an app section; Automatisch restores its icon', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await dispatch(app, 'open-section-dialog', { sectionId: 'type:lights', column: 'left' });
  expect(nameDialog(app)).toMatchObject({ open: true, heading: 'Naam en icoon', confirmLabel: 'Bewaren', name: '', namePlaceholder: 'Verlichting', icon: null, autoIcon: 'lightbulb', kindChoice: 'none' });
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Lampen', icon: 'bed' } }));
  await settle(app);
  const lights = () => deepAll(app, 'mh-section').find((el) => (el as HTMLElement & { section: { id: string } }).section.id === 'type:lights')!;
  expect([lights().shadowRoot!.querySelector('.title')!.textContent, lights().shadowRoot!.querySelector('.head > mh-icon')!.getAttribute('name')]).toEqual(['Lampen', 'bed']);
  await dispatch(app, 'open-section-dialog', { sectionId: 'type:lights', column: 'left' });
  expect(nameDialog(app)).toMatchObject({ name: 'Lampen', icon: 'bed' });
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: null, icon: null } }));
  await settle(app);
  expect([lights().shadowRoot!.querySelector('.title')!.textContent, lights().shadowRoot!.querySelector('.head > mh-icon')!.getAttribute('name')]).toEqual(['Verlichting', 'lightbulb']);
});

test('cancelling the section dialog changes nothing', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await dispatch(app, 'open-section-dialog', { sectionId: null, column: 'right' });
  nameDialog(app).dispatchEvent(new CustomEvent('cancel'));
  await settle(app);
  expect(nameDialog(app).open).toBe(false);
  expect(dashboardOf(app)).toMatchObject({ firstTime: true, canUndo: false });
});

test('removing a section with tiles asks first; an empty one goes at once', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  await dispatch(app, 'remove-section', { sectionId: 'type:lights' });
  expect(confirmDialog(app).open).toBe(false);
  expect(shownSections(app)[0]).toEqual(['own:a']);
  expect(deepText(snackbar(app))).toContain('Verlichting is weggehaald.');

  await dispatch(app, 'remove-section', { sectionId: 'own:a' });
  expect([confirmDialog(app).open, confirmDialog(app).heading]).toEqual([true, 'Binnen weghalen?']);
  expect(confirmDialog(app).textContent).toContain('De tegel erin gaat ook van dit dashboard. Je apparaten blijven gewoon in je Homey. Ongedaan maken haalt alles terug.');
  press(confirmDialog(app), 'Annuleren');
  await settle(app);
  expect(shownSections(app)[0]).toEqual(['own:a']);
  await dispatch(app, 'remove-section', { sectionId: 'own:a' });
  press(confirmDialog(app), 'Weghalen');
  await settle(app);
  expect(confirmDialog(app).open).toBe(false);
  expect(deepText(deep(app, 'mh-empty-state'))).toContain('Overzicht is nog leeg');
  expect(deepText(snackbar(app))).toContain('Binnen is weggehaald.');
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(shownSections(app)[0]).toEqual(['own:a']);
  expect(shownTiles(app, 'own:a')).toEqual(['t-1']);
});

test('the question counts the tiles, and the hero goes at once', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await dispatch(app, 'remove-section', { sectionId: 'type:lights' });
  expect(confirmDialog(app).textContent).toContain('De 8 tegels erin gaan ook van dit dashboard.');
  press(confirmDialog(app), 'Annuleren');
  await dispatch(app, 'remove-section', { sectionId: 'hero:main' });
  expect(confirmDialog(app).open).toBe(false);
  expect(deepAll(app, 'mh-hero')).toHaveLength(0);
  expect(deepText(snackbar(app))).toContain('Blikvanger is weggehaald.');
});

const heroPanel = (app: MhApp) => app.shadowRoot!.querySelector('mh-hero-panel') as HTMLElement & { open: boolean; choice: unknown; automatic: { kind: string } | null; boardName: string };
const tankChoice = { main: { deviceId: 'device-4', capabilityId: 'tank_level' }, line: null, stats: [], name: null };

test('the hero settings change the hero at once, and typing its name is one step', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await dispatch(app, 'open-hero', { sectionId: 'hero:main' });
  expect(heroPanel(app)).toMatchObject({ open: true, choice: null, boardName: 'Overzicht', automatic: { kind: 'battery' } });
  heroPanel(app).dispatchEvent(new CustomEvent('set-hero', { detail: { hero: tankChoice } }));
  await settle(app);
  expect(heroPanel(app).choice).toEqual(tankChoice);
  expect(deep(app, 'mh-hero').shadowRoot!.querySelector('.title')!.textContent).toBe(camperSnapshot().devices['device-4']!.name);
  for (const name of ['W', 'Wa', 'Water']) heroPanel(app).dispatchEvent(new CustomEvent('set-hero', { detail: { hero: { ...tankChoice, name }, typing: true } }));
  await settle(app);
  expect(deep(app, 'mh-hero').shadowRoot!.querySelector('.title')!.textContent).toBe('Water');
  deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('undo', { bubbles: true, composed: true }));
  await settle(app);
  expect(heroPanel(app).choice).toEqual(tankChoice);
  heroPanel(app).dispatchEvent(new CustomEvent('remove'));
  await settle(app);
  expect(heroPanel(app).open).toBe(false);
  expect(deepAll(app, 'mh-hero')).toHaveLength(0);
});

test('a hero on another dashboard keeps its own choice', async () => {
  const layout = hubLayout([overview([heroSection()]), board('d-1', [heroSection('hero:d-1')], { name: 'Buiten' })], { known: [], names: {} });
  const { app, configStore } = await startWithHub(['nl-NL'], layout);
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'board:d-1' } }));
  await settle(app);
  await toggleEdit(app);
  await dispatch(app, 'open-hero', { sectionId: 'hero:d-1' });
  heroPanel(app).dispatchEvent(new CustomEvent('set-hero', { detail: { hero: tankChoice } }));
  await settle(app);
  const { HOMEY_ID } = await import('../../helpers/fake-hub');
  expect(configStore.stored().layouts[HOMEY_ID]!.dashboards.map((d) => d.sections![0]!.hero)).toEqual([null, tankChoice]);
});

// ----- notices about new and gone devices -----

const newcomer = (id: string, name: string) => device({ id, name, zoneId: 'zone-4', deviceClass: 'sensor', caps: [cap('alarm_motion', { type: 'boolean', value: false })] });
/** The quiet time of the controller, on real timers shortened by the environment of the test. */
async function withNews(...names: string[]) {
  const started = await startWithHub(['nl-NL'], twoBoards(), 0);
    const news = () => app.shadowRoot!.querySelector('mh-dashboard')!.shadowRoot!.querySelector('mh-news-card') as HTMLElement & { news: unknown[]; gone: unknown[] } | null;
  const { app, hub } = started;
  names.forEach((name, i) => hub.emit({ type: 'device', device: newcomer(`nieuw${i}`, name) }));
  await settle(app);
  await settle(app);
  return { ...started, news, snapshot: camperSnapshot() };
}
const railBadge = (app: MhApp) => deepAll(deep(app, 'mh-rail'), '.badge').length;
const overviewSection = (app: MhApp, id: string) => shownTiles(app, id).length;

test('a new device gives a card on the overview; Toevoegen places it and the notice can undo it', async () => {
  const { app, news } = await withNews('Bewegingssensor');
  expect(news()!.news).toHaveLength(1);
  expect(railBadge(app)).toBe(1);
  news()!.dispatchEvent(new CustomEvent('place', { detail: { ref: 'nieuw0', sectionId: null }, bubbles: true, composed: true }));
  await settle(app);
  expect(overviewSection(app, 'type:security')).toBe(1);
  expect(deepText(snackbar(app))).toContain('Bewegingssensor staat nu in Beveiliging.');
  expect([news()?.news.length ?? 0, railBadge(app)]).toEqual([0, 0]);
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(news()!.news).toHaveLength(1);
  expect(overviewSection(app, 'type:security')).toBe(0);
});

test('the card is only on the overview and not while editing; the dot shows on every dashboard', async () => {
  const { app, news } = await withNews('Bewegingssensor');
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'board:d-1' } }));
  await settle(app);
  expect(news()).toBeNull();
  expect(railBadge(app)).toBe(1);
  dashboardOf(app).dispatchEvent(new CustomEvent('navigate', { detail: { to: 'board:overview' } }));
  await settle(app);
  expect(news()).not.toBeNull();
  await toggleEdit(app);
  expect(news()).toBeNull();
  expect(railBadge(app)).toBe(0);
});

test('Niet tonen leaves it out and says how to add it later', async () => {
  const { app, news } = await withNews('Bewegingssensor');
  news()!.dispatchEvent(new CustomEvent('skip', { detail: { ref: 'nieuw0' }, bubbles: true, composed: true }));
  await settle(app);
  expect(news()?.news.length ?? 0).toBe(0);
  expect(deepText(snackbar(app))).toContain('Je kunt het later toevoegen met "Tegel toevoegen" in de bewerkmodus.');
});

test('several new devices open the list, where everything can be placed at once, in one step to undo', async () => {
  const { app, news } = await withNews('Een', 'Twee', 'Drie');
  news()!.dispatchEvent(new CustomEvent('view-all', { bubbles: true, composed: true }));
  await settle(app);
  const panel = app.shadowRoot!.querySelector('mh-news-panel') as HTMLElement & { open: boolean; news: unknown[] };
  expect([panel.open, panel.news.length]).toEqual([true, 3]);
  panel.dispatchEvent(new CustomEvent('place-all'));
  await settle(app);
  expect(overviewSection(app, 'type:security')).toBe(3);
  expect(panel.open).toBe(false);
  expect(deepText(snackbar(app))).toContain('De nieuwe apparaten staan op hun voorgestelde plek.');
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(overviewSection(app, 'type:security')).toBe(0);
  expect(news()!.news).toHaveLength(3);
});

test('a new section for something new opens the dialog in the edit mode and puts it in there', async () => {
  const { app, news } = await withNews('Bewegingssensor');
  news()!.dispatchEvent(new CustomEvent('new-section', { detail: { ref: 'nieuw0' }, bubbles: true, composed: true }));
  await settle(app);
  expect(dashboardOf(app).editing).toBe(true);
  expect(nameDialog(app).open).toBe(true);
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Hal', icon: 'door_front' } }));
  await settle(app);
  const id = shownSections(app).flat().at(-1)!;
  expect(id).toMatch(/^own:s-/);
  expect(shownTiles(app, id)).toHaveLength(1);
});

test('cancelling that dialog leaves the edit mode again and keeps the notice', async () => {
  const { app, news } = await withNews('Bewegingssensor');
  news()!.dispatchEvent(new CustomEvent('new-section', { detail: { ref: 'nieuw0' }, bubbles: true, composed: true }));
  await settle(app);
  nameDialog(app).dispatchEvent(new CustomEvent('cancel'));
  await settle(app);
  expect(dashboardOf(app).editing).toBe(false);
  expect(news()!.news).toHaveLength(1);
});

test('a gone device gives a card with the dashboards; OK takes it out of the layout', async () => {
  const { app, news, hub, configStore, snapshot } = await withNews();
  expect(news()).toBeNull();
  hub.emit({ type: 'deviceRemoved', deviceId: 'device-13' });
  await settle(app);
  await settle(app);
  expect(news()!.gone).toEqual([{ ref: 'device-13', name: snapshot.devices['device-13']!.name, boards: ['overview'], heroFallback: false }]);
  expect(deepText(news()!)).toContain('(Overzicht)');
  // the dot is for something new
  expect(railBadge(app)).toBe(0);
  expect(shownTiles(app, 'own:a')).toEqual([]);
  news()!.dispatchEvent(new CustomEvent('gone-ok', { bubbles: true, composed: true }));
  await settle(app);
  expect(news()).toBeNull();
  expect(JSON.stringify(configStore.stored().layouts)).not.toContain('t-1');
});

// ----- saving, loading and resetting the layout -----

const settingsPanel = (app: MhApp) => app.shadowRoot!.querySelector('mh-settings-panel') as HTMLElement & { open: boolean; overviewAutomatic: boolean };
const openSettings = async (app: MhApp) => { await dispatch(app, 'navigate', { to: 'settings' }); };
/** What the page offers as a download: the name and the text of the file. */
function downloads() {
  const files: { name: string; text: Promise<string>; type: string }[] = [];
  let last: Blob | null = null;
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { last = blob as Blob; return 'blob:x'; });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { files.push({ name: this.download, text: last!.text(), type: last!.type }); });
  return { files, restore: () => { create.mockRestore(); revoke.mockRestore(); click.mockRestore(); } };
}

test('export offers a json file with the date in its name', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  const page = downloads();
  await openSettings(app);
  settingsPanel(app).dispatchEvent(new CustomEvent('export'));
  await settle(app);
  page.restore();
  expect(page.files).toHaveLength(1);
  expect(page.files[0]!.name).toMatch(/^expressive-home-layout-\d{4}-\d{2}-\d{2}\.json$/);
  expect(page.files[0]!.type).toBe('application/json');
  const content = await page.files[0]!.text;
  expect(content).not.toContain('apiKey');
  expect(JSON.parse(content).dashboards).toHaveLength(2);
  expect(deepText(snackbar(app))).toContain(`Bewaard als ${page.files[0]!.name} in je downloads.`);
  expect(document.querySelector('a[download]')).toBeNull();
});

/** A file of a layout with one board more, made by the app itself. */
async function layoutFile(change: (file: { dashboards: unknown[] }) => void) {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  const page = downloads();
  settingsPanel(app).dispatchEvent(new CustomEvent('export'));
  page.restore();
  const file = JSON.parse(await page.files[0]!.text) as { dashboards: unknown[] };
  change(file);
  app.remove();
  return JSON.stringify(file);
}

test('import asks first, then replaces and reports dropped tiles', async () => {
  const content = await layoutFile((file) => { file.dashboards.push(board('d-2', [ownSection('own:z', [sensorTile('t-7', 'other-hub')])], { name: 'Energie' })); });
  const { app } = await startWithHub();
  await openSettings(app);
  settingsPanel(app).dispatchEvent(new CustomEvent('import', { detail: { name: 'mijn-indeling.json', text: content } }));
  await settle(app);
  expect([confirmDialog(app).open, confirmDialog(app).heading]).toEqual([true, 'Indeling inladen?']);
  expect(confirmDialog(app).textContent).toContain('vervangen door die uit mijn-indeling.json.');
  expect(railNames(app).slice(0, 2)).toEqual(['Overzicht', 'Bewerken']);
  press(confirmDialog(app), 'Inladen');
  await settle(app);
  expect(railNames(app).slice(0, 3)).toEqual(['Overzicht', 'Buiten', 'Energie']);
  expect(deepText(snackbar(app))).toContain('Indeling ingeladen. Eén tegel viel weg: dat apparaat kent deze Homey niet.');
  expect(settingsPanel(app).open).toBe(false);
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(railNames(app).slice(0, 2)).toEqual(['Overzicht', 'Bewerken']);
});

test('a file that fits says it is loaded', async () => {
  const content = await layoutFile(() => {});
  const { app } = await startWithHub();
  settingsPanel(app).dispatchEvent(new CustomEvent('import', { detail: { name: 'x.json', text: content } }));
  await settle(app);
  press(confirmDialog(app), 'Inladen');
  await settle(app);
  expect(deepText(snackbar(app))).toContain('Indeling ingeladen.');
  expect(settingsPanel(app).overviewAutomatic).toBe(false);
});

test('a file that is not ours says so and changes nothing', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  for (const content of ['', '{"a":1}', 'geen json']) {
    settingsPanel(app).dispatchEvent(new CustomEvent('import', { detail: { name: 'x.json', text: content } }));
    await settle(app);
    expect(confirmDialog(app).open).toBe(false);
    expect(deepText(snackbar(app))).toContain('Dit bestand is geen indeling van Expressive Home.');
  }
  expect(railNames(app).slice(0, 2)).toEqual(['Overzicht', 'Buiten']);
});

test('reset asks first and can be undone', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await openSettings(app);
  settingsPanel(app).dispatchEvent(new CustomEvent('reset'));
  await settle(app);
  expect(confirmDialog(app).heading).toBe('Overzicht terug naar automatisch?');
  expect(shownSections(app)[0]).toEqual(['own:a', 'type:lights']);
  press(confirmDialog(app), 'Terugzetten');
  await settle(app);
  expect(settingsPanel(app).overviewAutomatic).toBe(true);
  expect(shownSections(app)[0]![0]).toBe('hero:main');
  expect(deepText(snackbar(app))).toContain('Het Overzicht is weer automatisch.');
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(shownSections(app)[0]).toEqual(['own:a', 'type:lights']);
});

// ----- more dashboards -----

const boardDialog = (app: MhApp) => app.shadowRoot!.querySelector('mh-name-icon-dialog.board') as HTMLElement & { open: boolean; heading: string; text: string; confirmLabel: string; name: string; namePlaceholder: string; icon: string | null; autoIcon: string | null; kindChoice: string };
const boardMenu = (app: MhApp) => (deep(app, 'mh-edit-bar') as HTMLElement & { menu: { title: string; items: { id: string; label: string; disabled?: boolean }[] }[] }).menu;
const menuLabels = (app: MhApp) => boardMenu(app).map((g) => [g.title, ...g.items.map((i) => `${i.label}${i.disabled ? ' (uit)' : ''}`)]);
const boardAction = async (app: MhApp, id: string) => { deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('board-action', { detail: { id }, bubbles: true, composed: true })); await settle(app); };
const openBoard = (app: MhApp, id: string) => dispatch(app, 'navigate', { to: `board:${id}` });
const newBoard = async (app: MhApp, name: string | null, icon: string) => {
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('new-board', { bubbles: true, composed: true }));
  await settle(app);
  boardDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name, icon } }));
  await settle(app);
};
const boardsOf = (app: MhApp) => railNames(app).slice(0, railNames(app).findIndex((n) => n === 'Nieuw' || n === 'Bewerken'));

test('a new dashboard has a name and an icon and opens empty in the edit mode', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('new-board', { bubbles: true, composed: true }));
  await settle(app);
  expect(boardDialog(app)).toMatchObject({ open: true, heading: 'Nieuw dashboard', confirmLabel: 'Maken', name: '', namePlaceholder: 'Bijvoorbeeld Buiten of Energie', icon: 'dashboard', autoIcon: null, kindChoice: 'none', text: 'Het begint leeg; daarna voeg je secties en tegels toe.' });
  boardDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Buiten', icon: 'deck' } }));
  await settle(app);
  expect(boardDialog(app).open).toBe(false);
  expect(boardsOf(app)).toEqual(['Overzicht', 'Buiten']);
  expect(dashboardOf(app)).toMatchObject({ editing: true, boardName: 'Buiten' });
  expect(dashboardOf(app).board.id).toMatch(/^d-/);
  expect(deepText(deep(app, 'mh-empty-state'))).toContain('Buiten is nog leeg');
  expect(deep(app, 'mh-rail').shadowRoot!.querySelector('[aria-current="page"] mh-icon')!.getAttribute('name')).toBe('deck');
  // the overview itself is still automatic
  await openBoard(app, 'overview');
  await toggleEdit(app);
  expect(dashboardOf(app).firstTime).toBe(true);
});

test('a dashboard without a name gets the usual one; cancelling makes none', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  deep(app, 'mh-rail').dispatchEvent(new CustomEvent('new-board', { bubbles: true, composed: true }));
  await settle(app);
  boardDialog(app).dispatchEvent(new CustomEvent('cancel'));
  await settle(app);
  expect(boardsOf(app)).toEqual(['Overzicht']);
  await newBoard(app, null, 'dashboard');
  expect(boardsOf(app)).toEqual(['Overzicht', 'Nieuw dashboard']);
});

test('an empty dashboard gets a section or the hero from its own buttons', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await newBoard(app, 'Energie', 'bolt');
  await dispatch(app, 'add-hero', null);
  expect(shownSections(app)[0]!.at(-1)).toMatch(/^hero:d-/);
  expect(deepAll(app, 'mh-empty-state')).toHaveLength(0);
});

test('a dashboard is renamed in its menu', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await openBoard(app, 'd-1');
  await toggleEdit(app);
  expect(menuLabels(app)).toEqual([['Buiten', 'Naam en icoon…', 'Uiterlijk…', 'Hoger in de balk', 'Lager in de balk (uit)'], ['', 'Dashboard weghalen…']]);
  await boardAction(app, 'rename');
  expect(boardDialog(app)).toMatchObject({ open: true, heading: 'Naam en icoon', name: 'Buiten', icon: 'deck', autoIcon: null, confirmLabel: 'Bewaren' });
  boardDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Tuin', icon: 'yard' } }));
  await settle(app);
  expect(boardsOf(app)).toEqual(['Overzicht', 'Tuin']);
});

test('the overview can be renamed without becoming an own layout, and Automatisch gives its icon back', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await boardAction(app, 'rename');
  expect(boardDialog(app)).toMatchObject({ name: '', namePlaceholder: 'Overzicht', icon: null, autoIcon: 'dashboard' });
  boardDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Thuis', icon: 'home' } }));
  await settle(app);
  expect(boardsOf(app)).toEqual(['Thuis']);
  expect(dashboardOf(app)).toMatchObject({ firstTime: true, boardName: 'Thuis' });
});

test('dashboards move up and down in the rail; the first one opens at start', async () => {
  const { app, configStore } = await startWithHub(['nl-NL'], twoBoards());
  await openBoard(app, 'd-1');
  await toggleEdit(app);
  await boardAction(app, 'up');
  expect(boardsOf(app)).toEqual(['Buiten', 'Overzicht']);
  expect(menuLabels(app)[0]).toEqual(['Buiten', 'Naam en icoon…', 'Uiterlijk…', 'Hoger in de balk (uit)', 'Lager in de balk']);
  const layout = Object.values(configStore.stored().layouts)[0]!;
  app.remove();
  const again = await startWithHub(['nl-NL'], layout);
  expect(dashboardOf(again.app).board.id).toBe('d-1');
  await toggleEdit(again.app);
  await boardAction(again.app, 'down');
  expect(boardsOf(again.app)).toEqual(['Overzicht', 'Buiten']);
});

test('removing a dashboard asks first, opens the first and can be undone', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await openBoard(app, 'd-1');
  await toggleEdit(app);
  await boardAction(app, 'remove');
  expect([confirmDialog(app).open, confirmDialog(app).heading]).toEqual([true, 'Buiten weghalen?']);
  expect(confirmDialog(app).textContent).toContain('Het dashboard en alles erop verdwijnt. Je apparaten blijven gewoon in je Homey en op je andere dashboards.');
  expect(boardsOf(app)).toEqual(['Overzicht', 'Buiten']);
  press(confirmDialog(app), 'Weghalen');
  await settle(app);
  expect(boardsOf(app)).toEqual(['Overzicht']);
  expect(dashboardOf(app)).toMatchObject({ editing: true, board: { id: 'overview' } });
  expect(deepText(snackbar(app))).toContain('Buiten is weggehaald.');
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(boardsOf(app)).toEqual(['Overzicht', 'Buiten']);
});

test('the overview cannot be removed; its menu offers back to automatic', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  expect(menuLabels(app)).toEqual([['Overzicht', 'Naam en icoon…', 'Uiterlijk…', 'Hoger in de balk (uit)', 'Lager in de balk'], ['', 'Terug naar automatisch…']]);
  await boardAction(app, 'reset');
  expect(confirmDialog(app).heading).toBe('Overzicht terug naar automatisch?');
  press(confirmDialog(app), 'Terugzetten');
  await settle(app);
  expect(menuLabels(app)[1]).toEqual(['', 'Terug naar automatisch… (uit)']);
  expect(dashboardOf(app)).toMatchObject({ editing: true, firstTime: true });
});

test('a hero on another dashboard has its own colour and choice', async () => {
  const layout = hubLayout([overview([heroSection()]), board('d-1', [heroSection('hero:d-1')], { name: 'Buiten' })], { known: [], names: {} });
  const { app, configStore } = await startWithHub(['nl-NL'], layout);
  await openBoard(app, 'd-1');
  deep(app, 'mh-hero').dispatchEvent(new CustomEvent('section-seed', { detail: { sectionId: 'hero:d-1', seed: '#a6422a' }, bubbles: true, composed: true }));
  await settle(app);
  expect(deep(app, 'mh-hero').hasAttribute('data-own-seed')).toBe(true);
  await openBoard(app, 'overview');
  expect(deep(app, 'mh-hero').hasAttribute('data-own-seed')).toBe(false);
  expect(configStore.stored().sectionSeeds).toEqual({ 'hero:d-1': '#a6422a' });
});

test('more than six dashboards make the list in the rail scroll, and all of them are in it', async () => {
  const many = hubLayout([overview(null), ...Array.from({ length: 9 }, (_, i) => board(`d-${i}`, [], { name: `Bord ${i}` }))], { known: [], names: {} });
  const { app } = await startWithHub(['nl-NL'], many);
  expect(boardsOf(app)).toHaveLength(10);
  const list = deep(app, 'mh-rail').shadowRoot!.querySelector('.boards')!;
  // and the rooms
  expect(list.querySelectorAll('button')).toHaveLength(11);
});

test('undoing a new dashboard leaves it and its edit mode', async () => {
  const { app } = await startWithHub();
  await toggleEdit(app);
  await newBoard(app, 'Buiten', 'deck');
  deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('undo', { bubbles: true, composed: true }));
  await settle(app);
  expect(boardsOf(app)).toEqual(['Overzicht']);
  expect(dashboardOf(app)).toMatchObject({ editing: true, board: { id: 'overview' } });
});

test('another dashboard, and the dashboard after connecting, begin at the top of the page', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  scroll.mockClear();
  await toggleEdit(app);
  expect(scroll).not.toHaveBeenCalled();
  await openBoard(app, 'd-1');
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll).toHaveBeenLastCalledWith(0, 0);
  // what happens on the same dashboard leaves the page where it is
  await openBoard(app, 'd-1');
  await toggleEdit(app);
  expect(scroll).toHaveBeenCalledTimes(1);
  app.remove();
  scroll.mockClear();
  const demo = await startApp();
  scroll.mockClear();
  deep(demo, 'mh-connect-screen').dispatchEvent(new CustomEvent('demo'));
  await settle(demo);
  expect(scroll).toHaveBeenCalledWith(0, 0);
  scroll.mockRestore();
});

// ----- where the focus goes, and what a screen reader hears -----

const appFocus = (): Element | null => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active; };
const heard = (app: MhApp) => dashboardOf(app).shadowRoot!.querySelector('p[aria-live]')!.textContent!.trim();

test('after removing a tile the focus goes to the next one, or to the place to add', async () => {
  const layout = hubLayout([overview([ownSection('own:a', [sensorTile('t-1', 'device-13'), sensorTile('t-2', 'device-13')], { name: 'Binnen' })])], { known: [], names: {} });
  const { app } = await startWithHub(['nl-NL'], layout);
  await toggleEdit(app);
  const edit = (tileId: string) => dispatch(app, 'layout-edit', { edit: { type: 'remove-tile', dashboardId: 'overview', tileId } });
  expect(shownTiles(app, 'own:a')).toEqual(['t-1', 't-2']);
  await edit('t-1');
  expect((appFocus()?.getRootNode() as ShadowRoot).host.getAttribute('data-tile-id')).toBe('t-2');
  await edit('t-2');
  expect(appFocus()?.className).toBe('add-slot');
  expect(appFocus()?.textContent).toContain('Tegel toevoegen');
});

test('after removing a section the focus goes to the one after it, and a new section gets it', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await toggleEdit(app);
  await dispatch(app, 'remove-section', { sectionId: 'type:lights' });
  expect(appFocus()?.getAttribute('aria-label')).toBe('Menu van Binnen');
  await dispatch(app, 'open-section-dialog', { sectionId: null, column: 'left' });
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Terras', icon: 'deck' } }));
  await settle(app);
  expect(appFocus()?.textContent).toContain('Tegel toevoegen');
  expect(((appFocus()!.getRootNode() as ShadowRoot).host as HTMLElement).dataset['sectionId']).toMatch(/^own:s-/);
});

test('undoing and moving a dashboard are said for screen readers', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  await openBoard(app, 'd-1');
  await toggleEdit(app);
  await boardAction(app, 'up');
  expect(heard(app)).toBe('Buiten staat nu op plek 1 van 2 in de balk.');
  deep(app, 'mh-edit-bar').dispatchEvent(new CustomEvent('undo', { bubbles: true, composed: true }));
  await settle(app);
  expect(heard(app)).toBe('Ongedaan gemaakt.');
});

// ----- found by the review of the whole branch -----

const threeTiles = () => hubLayout([overview([ownSection('own:a', [sensorTile('t-1', 'device-13'), sensorTile('t-2', 'device-6', 'presence'), sensorTile('t-3', 'device-11', 'viewers')], { name: 'Binnen' })])], { known: [...Object.keys(camperSnapshot().devices), 'flow:flow-1', 'flow:flow-2'], names: {} });
const layoutEdit = (app: MhApp, change: unknown) => dispatch(app, 'layout-edit', { edit: change });
const snackbarOpen = (app: MhApp) => (snackbar(app) as HTMLElement & { open: boolean }).open;

test('the undo of a notice undoes only what it says: it goes away with the next change or undo', async () => {
  const { app } = await startWithHub(['nl-NL'], threeTiles());
  await toggleEdit(app);
  await layoutEdit(app, { type: 'remove-tile', dashboardId: 'overview', tileId: 't-1' });
  expect(snackbarOpen(app)).toBe(true);
  await layoutEdit(app, { type: 'move-tile', dashboardId: 'overview', tileId: 't-3', toSectionId: 'own:a', index: 0 });
  expect(snackbarOpen(app)).toBe(false);
  await layoutEdit(app, { type: 'remove-tile', dashboardId: 'overview', tileId: 't-2' });
  await dispatch(app, 'undo', null);
  expect(snackbarOpen(app)).toBe(false);
  expect(shownTiles(app, 'own:a')).toEqual(['t-3', 't-2']);
  // and its own button still works at once
  await layoutEdit(app, { type: 'remove-tile', dashboardId: 'overview', tileId: 't-2' });
  press(snackbar(app), 'Ongedaan maken');
  await settle(app);
  expect(shownTiles(app, 'own:a')).toEqual(['t-3', 't-2']);
});

test('a full dashboard says so', async () => {
  const known = [...Object.keys(camperSnapshot().devices), 'flow:flow-1', 'flow:flow-2'];
  const many = Array.from({ length: 1000 }, (_, i) => ({ ...sensorTile(`t-${i}`, 'weg'), id: `t-${i}` }));
  const { app } = await startWithHub(['nl-NL'], hubLayout([overview([ownSection('own:a', many)])], { known, names: {} }));
  await toggleEdit(app);
  await dispatch(app, 'open-add', { sectionId: 'own:a' });
  app.shadowRoot!.querySelector('mh-add-panel')!.dispatchEvent(new CustomEvent('add-tiles', { detail: { tiles: [sensorTile('t-new', 'device-13')], name: 'X' } }));
  await settle(app);
  expect(deepText(snackbar(app))).toContain('Dit dashboard is vol: er kan niets meer bij.');
  app.remove();
  const forty = Array.from({ length: 40 }, (_, i) => ownSection(`own:s${i}`));
  const second = await startWithHub(['nl-NL'], hubLayout([overview(forty)], { known, names: {} }));
  await toggleEdit(second.app);
  await dispatch(second.app, 'open-section-dialog', { sectionId: null, column: 'left' });
  nameDialog(second.app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Nog een', icon: null } }));
  await settle(second.app);
  expect(deepText(snackbar(second.app))).toContain('Dit dashboard is vol: er kan niets meer bij.');
});

test('putting everything new in its place says so only when all of it fitted', async () => {
  const known = [...Object.keys(camperSnapshot().devices), 'flow:flow-1', 'flow:flow-2'];
  const many = Array.from({ length: 999 }, (_, i) => ({ ...sensorTile(`t-${i}`, 'weg'), id: `t-${i}` }));
  const { app, hub } = await startWithHub(['nl-NL'], hubLayout([overview([ownSection('own:a', many)])], { known, names: {} }), 0);
  hub.emit({ type: 'device', device: newcomer('n0', 'Een') });
  hub.emit({ type: 'device', device: newcomer('n1', 'Twee') });
  await settle(app);
  await settle(app);
  await dispatch(app, 'view-all', null);
  app.shadowRoot!.querySelector('mh-news-panel')!.dispatchEvent(new CustomEvent('place-all'));
  await settle(app);
  expect(deepText(snackbar(app))).toContain('Dit dashboard is vol: er kan niets meer bij.');
  expect((app.shadowRoot!.querySelector('mh-dashboard') as HTMLElement & { news: unknown[] }).news).toHaveLength(1);
  // one at a time it says so too
  await dispatch(app, 'place', { ref: 'n1', sectionId: null });
  expect(deepText(snackbar(app))).toContain('Dit dashboard is vol: er kan niets meer bij.');
});

test('two times everything new in its place are two steps to undo', async () => {
  const { app, hub } = await withNews('Een');
  const placeAll = async () => { app.shadowRoot!.querySelector('mh-news-panel')!.dispatchEvent(new CustomEvent('place-all')); await settle(app); };
  await placeAll();
  hub.emit({ type: 'device', device: newcomer('later', 'Later') });
  await settle(app);
  await settle(app);
  await placeAll();
  expect(overviewSection(app, 'type:security')).toBe(2);
  await dispatch(app, 'undo', null);
  expect(overviewSection(app, 'type:security')).toBe(1);
});

test('a name typed in two openings of the panel are two steps to undo', async () => {
  const { app } = await startWithHub(['nl-NL'], threeTiles());
  await toggleEdit(app);
  const type = async (label: string) => {
    app.shadowRoot!.querySelector('mh-tile-panel')!.dispatchEvent(new CustomEvent('set-tile', { detail: { patch: { label }, typing: true } }));
    await settle(app);
  };
  const label = () => (dashboardOf(app).board as unknown as { left: { section: { tiles: { label?: string | null }[] } }[] }).left[0]!.section.tiles[0]!.label;
  await dispatch(app, 'open-tile', { tileId: 't-1' });
  await type('K');
  await type('Keuken');
  app.shadowRoot!.querySelector('mh-tile-panel')!.dispatchEvent(new CustomEvent('close'));
  await dispatch(app, 'open-tile', { tileId: 't-1' });
  await type('Hal');
  await dispatch(app, 'undo', null);
  expect(label()).toBe('Keuken');
});

test('a panel whose subject went away does not come back by itself', async () => {
  const { app, hub, news } = await withNews('Een', 'Twee');
  const panel = app.shadowRoot!.querySelector('mh-news-panel') as HTMLElement & { open: boolean };
  await dispatch(app, 'view-all', null);
  expect(panel.open).toBe(true);
  for (const ref of ['nieuw0', 'nieuw1']) {
    panel.dispatchEvent(new CustomEvent('place', { detail: { ref, sectionId: null } }));
    await settle(app);
  }
  expect([panel.open, news()]).toEqual([false, null]);
  hub.emit({ type: 'device', device: newcomer('later', 'Uren later') });
  await settle(app);
  await settle(app);
  expect(panel.open).toBe(false);

  const tilePanel = app.shadowRoot!.querySelector('mh-tile-panel') as HTMLElement & { open: boolean };
  const back = camperSnapshot().devices['device-13']!;
  await toggleEdit(app);
  await dispatch(app, 'open-tile', { tileId: 't-1' });
  hub.emit({ type: 'deviceRemoved', deviceId: 'device-13' });
  await settle(app);
  await settle(app);
  expect(tilePanel.open).toBe(false);
  await dispatch(app, 'done', null);
  hub.emit({ type: 'device', device: back });
  await settle(app);
  await settle(app);
  await toggleEdit(app);
  expect(tilePanel.open).toBe(false);
  // and leaving the edit mode closes what it opened for good
  await dispatch(app, 'open-tile', { tileId: 't-1' });
  expect(tilePanel.open).toBe(true);
  await dispatch(app, 'done', null);
  await toggleEdit(app);
  expect(tilePanel.open).toBe(false);
});

test('a section whose tiles are away for a moment is asked about, with all of them counted', async () => {
  const layout = hubLayout([overview([ownSection('own:a', [sensorTile('t-1', 'device-13'), sensorTile('t-2', 'device-13')], { name: 'Binnen' })])], { known: [...Object.keys(camperSnapshot().devices), 'flow:flow-1', 'flow:flow-2'], names: {} });
  const { app, hub } = await startWithHub(['nl-NL'], layout, 0);
  hub.emit({ type: 'deviceRemoved', deviceId: 'device-13' });
  await settle(app);
  await settle(app);
  await toggleEdit(app);
  expect(shownTiles(app, 'own:a')).toEqual([]);
  await dispatch(app, 'remove-section', { sectionId: 'own:a' });
  expect(confirmDialog(app).open).toBe(true);
  expect(confirmDialog(app).textContent).toContain('De 2 tegels erin gaan ook van dit dashboard.');
});

test('without a hub, saving and loading the layout say what is the matter', async () => {
  const { fakeHub, memoryConfig } = await import('../../helpers/fake-hub');
  const hub = fakeHub();
  hub.failWith = new Error('away');
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore: memoryConfig({ localAddress: '192.168.1.20', apiKey: 'k' }), createRealClient: () => hub, createDemoClient: () => hub,
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  const saved = downloads();
  settingsPanel(app).dispatchEvent(new CustomEvent('export'));
  await settle(app);
  saved.restore();
  expect(saved.files).toHaveLength(0);
  expect(deepText(snackbar(app))).toContain('Dat kan weer zodra je Homey verbonden is.');
  const file = JSON.stringify({ format: 'expressive-home-layout', version: 1, homeyId: '', dashboards: [], theme: {}, sectionSeeds: {} });
  settingsPanel(app).dispatchEvent(new CustomEvent('import', { detail: { name: 'x.json', text: file } }));
  await settle(app);
  expect(deepText(snackbar(app))).not.toContain('Dit bestand is geen indeling');
  expect(deepText(snackbar(app))).toContain('Dat kan weer zodra je Homey verbonden is.');
  expect(confirmDialog(app).open).toBe(false);
});

test('when what had the focus is gone, the focus stays on the dashboard', async () => {
  const lost = () => document.activeElement === document.body || document.activeElement === null;
  const { app, news } = await withNews('Een');
  const button = (text: string) => deepAll(news()!, 'mh-button').find((b) => b.textContent!.trim() === text)!;
  button('Niet tonen').focus();
  button('Niet tonen').click();
  await settle(app);
  expect(news()).toBeNull();
  expect(lost()).toBe(false);
  expect(appFocus()?.localName).toBe('main');
});

test('a new section for something new is one step to undo', async () => {
  const { app, news } = await withNews('Bewegingssensor');
  const before = shownSections(app).flat();
  news()!.dispatchEvent(new CustomEvent('new-section', { detail: { ref: 'nieuw0' }, bubbles: true, composed: true }));
  await settle(app);
  nameDialog(app).dispatchEvent(new CustomEvent('confirm', { detail: { kind: 'own', name: 'Hal', icon: 'door_front' } }));
  await settle(app);
  expect(shownSections(app).flat()).toHaveLength(before.length + 1);
  await dispatch(app, 'undo', null);
  expect(shownSections(app).flat()).toEqual(before);
  expect(dashboardOf(app).canUndo).toBe(false);
});

// ----- served by the app on the hub -----

/** An app that the app on the hub served; `role` null: not paired yet. */
async function startServed(role: 'use' | 'edit' | null, layout?: HubLayout, code: string | null = null, more: Partial<NonNullable<AppEnvironment['served']>> = {}) {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const hub = fakeHub();
  const configStore = memoryConfig(role === null ? null : { homeyId: HOMEY_ID, apiKey: 'paired' });
  if (layout) configStore.stored().layouts = { [HOMEY_ID]: layout };
  let conflict: () => void = () => {};
  let unsaved: () => void = () => {};
  let scan: (code: string) => void = () => {};
  const pair = vi.fn(async (): Promise<'ok' | 'code'> => 'ok');
  const app = document.createElement('mh-app') as MhApp & { panel: string };
  app.environment = {
    configStore, createRealClient: () => hub, createDemoClient: () => hub,
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
    served: { pair, mayArrange: () => role !== 'use', knownRole: () => (role === 'use' ? 'use' : 'edit'), onConflict: (listener) => { conflict = listener; }, onUnsaved: (listener) => { unsaved = listener; }, onNight: () => {}, onNewBuild: () => {}, settled: () => true, reload: () => {}, scanned: () => code, onScanned: (listener) => { scan = listener; }, kind: () => 'tablet', ...more },
  };
  document.body.append(app);
  await settle(app);
  return { app, hub, configStore, pair, scan: async (next: string) => { scan(next); await settle(app); }, conflict: () => conflict(), unsaved: () => unsaved(), HOMEY_ID };
}
const pairScreen = (app: MhApp) => app.shadowRoot!.querySelector('mh-pair-screen') as HTMLElement & { issue: string; busy: boolean; revoked: boolean; scanned: string; kind: string };

test('a device that is not paired gets the pair screen, never the one that asks for a key', async () => {
  const { app, pair, configStore, HOMEY_ID } = await startServed(null);
  expect(app.shadowRoot!.querySelector('mh-connect-screen')).toBeNull();
  pair.mockResolvedValueOnce('code');
  const ask = async () => { pairScreen(app).dispatchEvent(new CustomEvent('pair', { detail: { code: '123456', name: 'Tablet' } })); await settle(app); };
  await ask();
  expect(pair).toHaveBeenCalledWith('123456', 'Tablet');
  expect([pairScreen(app).issue, pairScreen(app).busy]).toEqual(['code', false]);
  configStore.stored().connection = { homeyId: HOMEY_ID, localAddress: null, apiKey: 'paired' };
  await ask();
  expect(pairScreen(app)).toBeNull();
  expect(shownSections(app).flat().length).toBeGreaterThan(3);
});

test('a scanned code goes to the pair screen; the next one replaces it, and what was said of the last', async () => {
  const { app, pair, scan } = await startServed(null, undefined, '482913');
  expect([pairScreen(app).scanned, pairScreen(app).kind, pair.mock.calls.length]).toEqual(['482913', 'tablet', 0]);
  pair.mockResolvedValueOnce('code');
  pairScreen(app).dispatchEvent(new CustomEvent('pair', { detail: { code: '482913', name: 'Tablet' } }));
  await settle(app);
  expect(pairScreen(app).issue).toBe('code');
  await scan('555666');
  expect([pairScreen(app).scanned, pairScreen(app).issue]).toEqual(['555666', 'none']);
});

test('a device that is paired just opens, and the code it was opened with is forgotten', async () => {
  const { app, hub, pair, scan } = await startServed('use', undefined, '482913');
  expect(pairScreen(app)).toBeNull();
  await scan('555666');
  expect([pairScreen(app), pair.mock.calls.length]).toEqual([null, 0]);
  hub.emit({ type: 'authError' });
  await settle(app);
  expect([pairScreen(app).scanned, pairScreen(app).revoked]).toEqual(['', true]);
});

test('a device that the owner took away goes to the pair screen and hears why', async () => {
  const { app, hub } = await startServed('edit');
  hub.emit({ type: 'authError' });
  await settle(app);
  expect(pairScreen(app).revoked).toBe(true);
});

test('a device that may only use the dashboard has nothing to arrange it with', async () => {
  const { app, hub } = await startServed('use', twoBoards());
  expect(railNames(app)).not.toContain('Bewerken');
  expect(deepAll(app, 'mh-section-menu')).toHaveLength(0);
  hub.emit({ type: 'device', device: newcomer('n0', 'Nieuw apparaat') });
  await settle(app);
  await new Promise((done) => { setTimeout(done, REBUILD_QUIET_MS + 50); });
  await settle(app);
  expect([deepAll(app, 'mh-news-card').length, railBadge(app)]).toEqual([0, 0]);
  await toggleEdit(app);
  expect(deepAll(app, 'mh-edit-bar')).toHaveLength(0);
  const before = app.shadowRoot!.querySelector('mh-dashboard');
  await dispatch(app, 'section-seed', { sectionId: 'own:a', seed: '#a6422a' });
  await layoutEdit(app, { type: 'remove-tile', dashboardId: 'overview', tileId: 't-1' });
  expect(shownTiles(app, 'own:a')).toEqual(['t-1']);
  expect(before).not.toBeNull();
  await openSettings(app);
  const text = deepText(settingsPanel(app));
  expect(text).toContain('Via je Homey');
  expect(text).toContain('Dit apparaat mag alleen gebruiken.');
  expect(text).not.toContain('Rechten');
  for (const gone of ['Inladen', 'Terugzetten']) expect(deepAll(settingsPanel(app), 'mh-button').some((b) => b.textContent!.trim() === gone)).toBe(false);
  expect(deepAll(settingsPanel(app), 'mh-button').some((b) => b.textContent!.trim() === 'Bewaren')).toBe(true);
});

test('a device that may also edit has everything, and takes itself away in the settings', async () => {
  const { app, configStore } = await startServed('edit', twoBoards());
  expect(railNames(app)).toContain('Bewerken');
  await openSettings(app);
  expect(deepText(settingsPanel(app))).toContain('Dit apparaat mag ook bewerken.');
  expect(deepText(settingsPanel(app))).toContain('Dit apparaat ontkoppelen');
  settingsPanel(app).dispatchEvent(new CustomEvent('disconnect'));
  await settle(app);
  expect(configStore.clearConnection).toHaveBeenCalled();
  expect([pairScreen(app).revoked, pairScreen(app).issue]).toEqual([false, 'none']);
});

test('when another device was first, that is said', async () => {
  const { app, conflict } = await startServed('edit');
  conflict();
  await settle(app);
  expect(deepText(snackbar(app))).toContain('Op een ander apparaat is ondertussen iets veranderd. Wat je hier net wijzigde, is niet bewaard.');
});

test('a hub that does not answer offers only to try again', async () => {
  const { fakeHub, memoryConfig, HOMEY_ID } = await import('../../helpers/fake-hub');
  const hub = fakeHub();
  hub.failWith = new Error('away');
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'paired' }), createRealClient: () => hub, createDemoClient: () => hub, schedule: (flush) => { setTimeout(flush, 0); },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
    served: { pair: async () => 'ok', mayArrange: () => true, knownRole: () => 'edit', onConflict: () => {}, onUnsaved: () => {}, onNight: () => {}, onNewBuild: () => {}, settled: () => true, reload: () => {}, scanned: () => null, onScanned: () => {}, kind: () => 'tablet' },
  };
  document.body.append(app);
  await settle(app);
  expect(deepAll(deep(app, 'mh-empty-state').getRootNode() as ShadowRoot, 'mh-empty-state mh-button').map((b) => b.textContent!.trim())).toEqual(['Nu proberen']);
  const text = deepText(deep(app, 'mh-empty-state'));
  expect([text.includes('op hetzelfde netwerk'), text.includes('internet')]).toEqual([true, false]);
});

test('a change that is not on the hub yet is said', async () => {
  const { app, unsaved } = await startServed('edit');
  unsaved();
  await settle(app);
  expect(deepText(snackbar(app))).toContain('Nog niet bewaard op de Homey. Dat gebeurt zodra hij weer antwoordt.');
});

test('a device that cannot take itself away now is still paired, and that is said', async () => {
  const { app, configStore } = await startServed('edit');
  configStore.clearConnection = vi.fn(async () => { throw new Error('away'); });
  await openSettings(app);
  settingsPanel(app).dispatchEvent(new CustomEvent('disconnect'));
  await settle(app);
  await settle(app);
  expect(pairScreen(app)).toBeNull();
  expect(shownSections(app).flat().length).toBeGreaterThan(3);
  const text = deepText(snackbar(app));
  expect(text).toContain('Ontkoppelen lukte niet: je Homey antwoordt niet.');
  expect(text).not.toContain('sleutel');
});

// ----- a phone -----

test('in a window as narrow as a phone the edit mode is put aside, and it is there again in a wide one', async () => {
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  await toggleEdit(app);
  expect(deepAll(app, 'mh-edit-bar')).toHaveLength(1);
  await setPhone(app, true);
  expect([deepAll(app, 'mh-edit-bar').length, deepAll(app, 'mh-nav-bar').length]).toEqual([0, 1]);
  // only the window was narrow for a moment: an iPad does that when it goes to the background
  await setPhone(app, false);
  expect(deepAll(app, 'mh-edit-bar')).toHaveLength(1);
  await toggleEdit(app);
  await setPhone(app, true);
  await dispatch(app, 'toggle-edit', undefined);
  await setPhone(app, false);
  expect(deepAll(app, 'mh-edit-bar')).toHaveLength(0);
});

test('the panels and dialogs to arrange with are put aside too', async () => {
  const { app, hub } = await startServed('edit', twoBoards());
  hub.emit({ type: 'device', device: newcomer('n0', 'Nieuw apparaat') });
  await new Promise((done) => { setTimeout(done, REBUILD_QUIET_MS + 50); });
  await settle(app);
  const open = () => deepAll(app, 'mh-news-panel').some((p) => (p as HTMLElement & { open: boolean }).open && !p.hidden);
  await dispatch(app, 'view-all', undefined);
  expect(open()).toBe(true);
  await setPhone(app, true);
  expect(open()).toBe(false);
  await setPhone(app, false);
  expect(open()).toBe(true);
});

test('what was typed is still there when the window was narrow for a moment', async () => {
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  await toggleEdit(app);
  for (const [type, detail, selector] of [['new-board', undefined, 'mh-name-icon-dialog.board'], ['open-section-dialog', { sectionId: null, column: 'left' }, 'mh-name-icon-dialog:not(.board)']] as const) {
    await dispatch(app, type, detail);
    const dialog = app.shadowRoot!.querySelector(selector) as HTMLElement & { open: boolean; updateComplete: Promise<unknown> };
    const field = () => dialog.shadowRoot!.querySelector('mh-text-field') as HTMLElement & { value: string };
    field().dispatchEvent(new CustomEvent('input', { detail: { value: 'Slapen' }, bubbles: true, composed: true }));
    await dialog.updateComplete;
    await setPhone(app, true);
    expect([dialog.open && !dialog.hidden]).toEqual([false]);
    await setPhone(app, false);
    expect([dialog.open, dialog.hidden, field().value]).toEqual([true, false, 'Slapen']);
    dialog.dispatchEvent(new CustomEvent('cancel'));
    await settle(app);
    // another time it begins empty
    await dispatch(app, type, detail);
    expect(field().value).toBe('');
    dialog.dispatchEvent(new CustomEvent('cancel'));
    await settle(app);
  }
});

test('how a slider is held is not told over a notice with something to choose', async () => {
  const { app } = await startWithHub();
  const bar = snackbar(app) as HTMLElement & { show(message: unknown): void };
  bar.show({ text: 'Iets is weg.', icon: 'info', action: { label: 'Ongedaan maken', run() {} } });
  await settle(app);
  deepAll(app, 'mh-light-tile')[0]!.shadowRoot!.dispatchEvent(new CustomEvent('hold-hint', { bubbles: true, composed: true }));
  await settle(app);
  expect(deepText(bar)).toContain('Iets is weg.');
});

test('who taps a slider with a finger is told how it is held, at most once an hour', async () => {
  const { app } = await startWithHub();
  const hint = (): void => { deepAll(app, 'mh-light-tile')[0]!.shadowRoot!.dispatchEvent(new CustomEvent('hold-hint', { bubbles: true, composed: true })); };
  const bar = snackbar(app) as HTMLElement & { hide(): void };
  const shown = (): boolean => deepText(bar).includes('Houd een schuif even vast en veeg dan opzij.') && snackbarOpen(app);
  const later = async (ms: number): Promise<void> => { bar.hide(); now += ms; await settle(app); };
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  hint();
  await settle(app);
  expect(shown()).toBe(true);
  await later(3_599_000);
  hint();
  await settle(app);
  expect(shown()).toBe(false);
  await later(1000);
  hint();
  await settle(app);
  expect(shown()).toBe(true);
  vi.restoreAllMocks();
});

// ----- themes -----

/** Hard to read in the dark only: in two places, with every colour. */
const grijs: ThemeFile = { format: 1, id: 't-gggggggggggggggg', name: 'Grijs', maker: '', base: 'uitbundig', seed: null, userSeed: true, knobs: { strength: 'grey', surfaces: 'solid', background: 'plain', contrast: 'high' }, app: '' };
/** With a colour of its own, easy to read in it; with the colour of the house it is not everywhere. */
const paars: ThemeFile = { format: 1, id: 't-pppppppppppppppp', name: 'Paars', maker: '', base: 'helder', seed: '#6750a4', userSeed: false, knobs: { strength: 'vivid', surfaces: 'see-through', background: 'plain', contrast: 'highest' }, app: '' };
const themePanel = (app: MhApp) => app.shadowRoot!.querySelector('mh-theme-panel') as HTMLElement & { open: boolean };

/** A device that may edit and follows the house, with Grijs among the themes of the house. */
async function houseWithGrijs() {
  const sendLooks = vi.fn();
  const served = await startServed('edit', undefined, null, { sendLooks, onLooks: (listener) => { listener({ ...emptyLooksDoc(), revision: 1, themes: [grijs, paars] }); } });
  await dispatch(served.app, 'navigate', { to: 'theme' });
  return { ...served, sendLooks, choose: async (detail: unknown) => { themePanel(served.app).dispatchEvent(new CustomEvent('look-choose', { detail })); await settle(served.app); } };
}

test('a theme that is hard to read is only chosen for the whole house after a question; one that is easy to read at once', async () => {
  const { app, sendLooks, choose } = await houseWithGrijs();
  await choose({ target: 'house', theme: grijs.id });
  expect([confirmDialog(app).open, sendLooks.mock.calls.length]).toEqual([true, 0]);
  expect(confirmDialog(app).textContent).toContain('Op 2 plekken slecht te lezen. Toch voor het hele huis gebruiken?');
  press(confirmDialog(app), 'Annuleren');
  await settle(app);
  expect(sendLooks).not.toHaveBeenCalled();
  await choose({ target: 'house', theme: grijs.id });
  press(confirmDialog(app), 'Toch gebruiken');
  await settle(app);
  expect(sendLooks.mock.calls).toEqual([[[{ house: { theme: grijs.id } }]]]);
  await choose({ target: 'house', theme: 'glas' });
  expect([confirmDialog(app).open, sendLooks.mock.calls.at(-1)]).toEqual([false, [[{ house: { theme: 'glas' } }]]]);
});

test('a theme that is made and is hard to read is asked about once before the whole house gets it', async () => {
  const { app, sendLooks } = await houseWithGrijs();
  themePanel(app).dispatchEvent(new CustomEvent('look-save', { detail: { file: { ...grijs, id: 't-hhhhhhhhhhhhhhhh' }, poor: 2 } }));
  await settle(app);
  expect([confirmDialog(app).open, sendLooks.mock.calls.length]).toEqual([true, 1]);
  press(confirmDialog(app), 'Bewaren en gebruiken');
  await settle(app);
  expect(confirmDialog(app).open).toBe(false);
  expect(sendLooks.mock.calls.at(-1)).toEqual([[{ house: { theme: 't-hhhhhhhhhhhhhhhh' } }]]);
});

test('a theme with a colour of its own is measured in that colour before the whole house gets it', async () => {
  const { app, sendLooks, choose } = await houseWithGrijs();
  await choose({ target: 'house', theme: paars.id });
  expect([confirmDialog(app).open, sendLooks.mock.calls]).toEqual([false, [[[{ house: { theme: paars.id } }]]]]);
});

test('the cards of a dashboard with a colourful theme of its own show the other themes in the colour of this device', async () => {
  const { app } = await startWithHub();
  themePanel(app).dispatchEvent(new CustomEvent('look-save', { detail: { file: paars, poor: 0 } }));
  await settle(app);
  const boardLook = app.shadowRoot!.querySelector('mh-board-look-panel') as HTMLElement & { seed: string };
  boardLook.dispatchEvent(new CustomEvent('board-theme', { detail: { theme: paars.id } }));
  await settle(app);
  expect(surface()).toBe(colorTokens('#6750a4', 'light', 0)['--c-surface']);
  expect(boardLook.seed).toBe('#3b6939');
});

test('an adjustment that was not saved goes when the app leaves the dashboard', async () => {
  const { app, hub } = await startWithHub();
  const adjusting = { ...grijs, base: 'glas' as const, knobs: {} };
  const preview = async () => {
    await dispatch(app, 'navigate', { to: 'theme' });
    themePanel(app).dispatchEvent(new CustomEvent('look-preview', { detail: { file: adjusting } }));
    await settle(app);
    expect(document.documentElement.dataset['look']).toBe('glas');
  };
  await preview();
  hub.emit({ type: 'authError' });
  await settle(app);
  expect([app.shadowRoot!.querySelector('mh-connect-screen') === null, document.documentElement.dataset['look']]).toEqual([false, 'rustig']);
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('connect', { detail: { address: '5f2a00000000000000000c81', apiKey: 'k2' } }));
  await settle(app);
  expect(document.documentElement.dataset['look']).toBe('rustig');
  await preview();
  app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('change-connection'));
  await settle(app);
  expect(document.documentElement.dataset['look']).toBe('rustig');
});

test('the theme panel knows when the dashboard that is open shows a theme of its own', async () => {
  const { app } = await startWithHub(['nl-NL'], twoBoards());
  const panel = themePanel(app) as unknown as { boardTheme: string | null };
  expect(panel.boardTheme).toBeNull();
  app.shadowRoot!.querySelector('mh-board-look-panel')!.dispatchEvent(new CustomEvent('board-theme', { detail: { theme: 'glas' } }));
  await settle(app);
  expect(panel.boardTheme).toBe('glas');
  await openBoard(app, 'd-1');
  expect(panel.boardTheme).toBeNull();
});

test('the weather and the energy of one hub are forgotten when another is opened, so they are never shown as of the next', async () => {
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  const { weather, energy } = (app as unknown as { ctx: { widgets: { weather: { listen(l: () => void): () => void; get(): { value: unknown } }; energy(p: string): { listen(l: () => void): () => void; get(): { value: unknown } } } } }).ctx.widgets;
  const stops = [weather.listen(() => {}), energy('day').listen(() => {})];
  await vi.waitFor(() => expect([weather.get().value, energy('day').get().value].every((value) => value !== null)).toBe(true));
  for (const stop of stops) stop();
  app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('leave-demo'));
  await settle(app);
  expect([weather.get().value, energy('day').get().value]).toEqual([null, null]);
});

test('with the sun: dark at night and light by day at the place of the hub, as its weather tells; the panel knows it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 26, 23, 0));
  try {
    const app = await startApp();
    app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
    await settle(app);
    app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('navigate', { detail: { to: 'theme' } }));
    await settle(app);
    const panel = app.shadowRoot!.querySelector('mh-theme-panel') as HTMLElement & { sunDark: boolean | null };
    panel.dispatchEvent(new CustomEvent('look-choose', { detail: { target: 'device', mode: 'sun' } }));
    await vi.waitFor(() => expect(document.documentElement.dataset['mode']).toBe('dark'));
    expect(panel.sunDark).toBe(true);
    // the system is light all the while: this is the sun
    expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(false);
    const kept = JSON.parse(window.localStorage.getItem('dashboard.sun')!) as { dark: boolean };
    expect(kept.dark).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test('with light and dark as they were, the weather of the hub is not asked for it', async () => {
  const app = await startApp();
  app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo'));
  await settle(app);
  const { weather } = (app as unknown as { ctx: { widgets: { weather: { get(): { at: number | null; error: unknown } } } } }).ctx.widgets;
  expect(weather.get()).toMatchObject({ at: null, error: null });
});
