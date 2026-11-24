// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { HubLayout } from '../../../src/layout/types';
import { createMockClient } from '../../../src/mock/mock-client';
import { colorTokens } from '../../../src/theme/engine';
import { demoRaw } from '../../../src/ui/app/demo';
import { REST_KEY, type AppEnvironment, type MhApp } from '../../../src/ui/app/app';
import type { MhRestScreen } from '../../../src/ui/screens/rest-screen';
import { defaultWall, type WallSettings } from '../../../src/wall/settings';
import { fakeHub, HOMEY_ID, memoryConfig } from '../../helpers/fake-hub';
import { deep, deepAll } from '../../helpers/deep';
import { board, heroSection, hubLayout, overview, ownSection } from '../../helpers/layout';

// A wall tablet, on the whole app.

const MINUTE = 60_000;
const at = (time: string): Date => new Date(`2026-11-23T${time}:00`);
const ON: WallSettings = { ...defaultWall(), on: true };

const phoneListeners = new Set<() => void>();
const phone = { matches: false, addEventListener: (_t: string, l: () => void) => { phoneListeners.add(l); }, removeEventListener: (_t: string, l: () => void) => { phoneListeners.delete(l); } };
const dark = { matches: false, addEventListener: () => {}, removeEventListener: () => {} };

beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame'] });
  vi.setSystemTime(at('12:00'));
  phone.matches = false;
  phoneListeners.clear();
  vi.stubGlobal('matchMedia', (query: string) => (query === '(width < 600px)' ? phone : dark));
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function settle(app: MhApp): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await vi.advanceTimersByTimeAsync(1);
    await app.updateComplete;
  }
}

const two = (): HubLayout => hubLayout([overview([heroSection(), ownSection('own:a')]), board('d-1', [], { name: 'Buiten' })]);

async function launch(options: { wall?: WallSettings; startBoard?: string | null; layout?: HubLayout; hub?: ReturnType<typeof fakeHub>; seeds?: Record<string, string>; change?: (stored: ReturnType<ReturnType<typeof memoryConfig>['stored']>) => void } = {}) {
  const hub = options.hub ?? fakeHub();
  const configStore = memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' });
  const stored = configStore.stored();
  stored.wall = options.wall ?? ON;
  stored.startBoard = options.startBoard ?? null;
  if (options.layout) stored.layouts = { [HOMEY_ID]: options.layout };
  if (options.seeds) stored.sectionSeeds = options.seeds;
  let fromOutside: () => void = () => {};
  const environment: AppEnvironment = {
    configStore, createRealClient: () => hub, createDemoClient: () => createMockClient(demoRaw()),
    schedule: (flush) => { setTimeout(flush, 0); },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    browserLanguages: ['nl-NL'],
    watchStored: (changed) => { fromOutside = changed; return () => {}; },
  };
  const app = document.createElement('mh-app') as MhApp;
  app.environment = environment;
  document.body.append(app);
  await settle(app);
  const rest = () => app.shadowRoot!.querySelector<MhRestScreen>('mh-rest-screen');
  const wait = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await settle(app); };
  const dashboard = () => app.shadowRoot!.querySelector('mh-dashboard')! as HTMLElement & { boardName: string; mode: string };
  const go = async (to: string) => { dashboard().dispatchEvent(new CustomEvent('navigate', { detail: { to } })); await settle(app); };
  return { app, hub, configStore, rest, wait, dashboard, go, outside: async () => { fromOutside(); await settle(app); } };
}

function send(type: string, target: EventTarget, init: Record<string, unknown> = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  for (const [key, value] of Object.entries(init)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
}
function tap(target: EventTarget): void {
  send('pointerdown', target, { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0 });
  send('pointerup', target, { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0 });
  send('click', target);
}
const touchOnce = (): void => {
  send('pointerdown', document.body, { pointerType: 'touch', pointerId: 1 });
  send('pointerup', document.body, { pointerType: 'touch', pointerId: 1 });
};
const surface = () => document.documentElement.style.getPropertyValue('--c-surface');
const lampFace = (app: MhApp) => deepAll(app, 'mh-light-tile').flatMap((tile) => deepAll(tile, '[role="button"]'))[0]!;

test('after two minutes of silence the rest screen is there, with what this device shows', async () => {
  const s = await launch();
  expect(s.rest()).toBeNull();
  await s.wait(2 * MINUTE);
  const rest = s.rest()!;
  expect([rest.night, rest.away, rest.leaving, rest.hero?.kind, rest.battery?.deviceId === rest.hero?.primary.deviceId]).toEqual([false, false, false, 'battery', true]);
  expect(rest.shadowRoot!.querySelector('.clock')!.textContent).toBe('12:02');
  expect(s.dashboard().hasAttribute('inert')).toBe(true);
  await s.wait(MINUTE);
  expect(s.rest()!.shadowRoot!.querySelector('.clock')!.textContent).toBe('12:03');
});

test('a device that is no wall tablet never rests', async () => {
  const s = await launch({ wall: defaultWall() });
  await s.wait(60 * MINUTE);
  expect([s.rest(), s.dashboard().hasAttribute('inert')]).toEqual([null, false]);
});

test('the touch that wakes switches nothing; the next one does', async () => {
  const s = await launch();
  await s.wait(2 * MINUTE);
  tap(lampFace(s.app));
  await s.wait(300);
  expect([s.rest(), s.hub.setCapability.mock.calls.length, s.dashboard().hasAttribute('inert')]).toEqual([null, 0, false]);
  tap(lampFace(s.app));
  await settle(s.app);
  expect(s.hub.setCapability.mock.calls.length).toBe(1);
});

test('what was open closes, and the dashboard this device starts with is there again, from its beginning', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const s = await launch({ layout: two(), startBoard: 'd-1' });
  await s.go('board:overview');
  await s.go('settings');
  s.hub.emit({ type: 'route', route: 'local' });
  scroll.mockClear();
  await s.wait(2 * MINUTE);
  expect([s.app.panel, s.dashboard().boardName, scroll.mock.calls.length > 0]).toEqual(['none', 'Buiten', true]);
  scroll.mockRestore();
});

test('the window of a device closes too', async () => {
  const s = await launch();
  const id = Object.keys((await s.hub.connect()).devices)[0]!;
  (s.dashboard() as unknown as { ctx: { actions: { openDevice(id: string): void } } }).ctx.actions.openDevice(id);
  await settle(s.app);
  expect(s.app.state.openDeviceId).toBe(id);
  await s.wait(2 * MINUTE);
  expect(s.app.state.openDeviceId).toBeNull();
});

test('not while somebody arranges, however long', async () => {
  const s = await launch({ layout: two() });
  s.dashboard().dispatchEvent(new CustomEvent('toggle-edit'));
  await settle(s.app);
  expect(s.app.state.editing).toBe(true);
  await s.wait(60 * MINUTE);
  expect([s.rest(), s.app.state.editing]).toEqual([null, true]);
  s.dashboard().dispatchEvent(new CustomEvent('done'));
  await s.wait(1);
  expect(s.rest()).not.toBeNull();
});

test('not while something is asked', async () => {
  const s = await launch({ layout: two() });
  s.app.asking = true;
  await s.wait(10 * MINUTE);
  expect(s.rest()).toBeNull();
  s.app.asking = false;
  await s.wait(1);
  expect(s.rest()).not.toBeNull();
});

test('not while the settings ask whether to disconnect', async () => {
  const s = await launch();
  await s.go('settings');
  const panel = s.app.shadowRoot!.querySelector('mh-settings-panel')!;
  panel.confirming = true;
  await s.wait(10 * MINUTE);
  expect([s.rest(), s.app.panel]).toEqual([null, 'settings']);
});

test('not in a window as narrow as a phone; one that becomes narrow loses it', async () => {
  const s = await launch();
  phone.matches = true;
  for (const listener of [...phoneListeners]) listener();
  await s.wait(10 * MINUTE);
  expect(s.rest()).toBeNull();
  phone.matches = false;
  for (const listener of [...phoneListeners]) listener();
  await s.wait(2 * MINUTE);
  expect(s.rest()).not.toBeNull();
  phone.matches = true;
  for (const listener of [...phoneListeners]) listener();
  await settle(s.app);
  expect([s.rest(), s.dashboard().hasAttribute('inert')]).toEqual([null, false]);
});

test('not on the connect screen; a device that loses its connection there loses it', async () => {
  const s = await launch();
  await s.wait(2 * MINUTE);
  expect(s.rest()).not.toBeNull();
  s.hub.emit({ type: 'authError' });
  await settle(s.app);
  expect([s.app.state.phase, s.rest()]).toEqual(['connect', null]);
  await s.wait(10 * MINUTE);
  expect(s.rest()).toBeNull();
});

test('while the hub is not there yet: the clock, and that it does not answer', async () => {
  const { ConnectionError } = await import('../../../src/homey/client');
  const hub = fakeHub();
  hub.connect.mockRejectedValue(new ConnectionError('unreachable'));
  const s = await launch({ hub });
  expect(s.app.state.phase).toBe('connecting');
  await s.wait(2 * MINUTE);
  const rest = s.rest()!;
  expect([rest.away, rest.hero, rest.shadowRoot!.querySelector('.clock')!.textContent, rest.shadowRoot!.querySelector('.pill')!.textContent!.trim()]).toEqual([true, null, '12:02', 'Je Homey antwoordt niet']);
});

test('while it is still being connected nothing is said of that', async () => {
  const hub = fakeHub();
  hub.connect.mockReturnValue(new Promise(() => {}));
  const s = await launch({ hub });
  await s.wait(2 * MINUTE);
  expect([s.rest()!.away, s.app.state.startUnreachable]).toEqual([false, false]);
});

test('a hub that goes away while it rests: that is said, and what is known stays', async () => {
  const s = await launch();
  await s.wait(2 * MINUTE);
  s.hub.emit({ type: 'route', route: null });
  await settle(s.app);
  expect([s.rest()!.away, s.rest()!.hero?.kind]).toEqual([true, 'battery']);
  s.hub.emit({ type: 'route', route: 'local' });
  await settle(s.app);
  expect(s.rest()!.away).toBe(false);
});

test('at night the dashboard is dark, whatever the theme; in the morning it is as it was', async () => {
  vi.setSystemTime(at('22:29'));
  const s = await launch();
  const light = colorTokens('#3b6939', 'light', 0)['--c-surface'];
  const night = colorTokens('#3b6939', 'dark', 0)['--c-surface'];
  expect([surface(), s.dashboard().mode]).toEqual([light, 'light']);
  // somebody uses it when the night begins
  touchOnce();
  await s.wait(59_000);
  touchOnce();
  await s.wait(1000);
  expect([surface(), s.dashboard().mode, document.documentElement.dataset['mode'], s.rest()]).toEqual([night, 'dark', 'dark', null]);
  await s.wait(30_000);
  expect(s.rest()!.night).toBe(true);
  tap(s.rest()!);
  await s.wait(300);
  expect([s.rest(), surface()]).toEqual([null, night]);
  vi.setSystemTime(at('07:29'));
  touchOnce();
  await s.wait(MINUTE);
  expect([surface(), s.app.state.theme.mode]).toEqual([light, 'auto']);
});

test('a phone, and a device that is no wall tablet, have no dark night', async () => {
  vi.setSystemTime(at('23:00'));
  const light = colorTokens('#3b6939', 'light', 0)['--c-surface'];
  await launch({ wall: defaultWall() });
  expect(surface()).toBe(light);
  document.body.replaceChildren();
  phone.matches = true;
  await launch();
  expect(surface()).toBe(light);
});

test('another tab turns it off: it goes', async () => {
  const s = await launch();
  await s.wait(2 * MINUTE);
  s.configStore.stored().wall = defaultWall();
  await s.outside();
  expect(s.rest()).toBeNull();
});

test('the colour of the hero is that of its section', async () => {
  const s = await launch({ seeds: { 'hero:main': '#a6422a' } });
  await s.wait(2 * MINUTE);
  expect(s.rest()!.heroSeed).toBe('#a6422a');
});

test('a dashboard without a hero, and one that loses it while it rests', async () => {
  const s = await launch({ layout: hubLayout([overview([ownSection('own:a')]), board('d-1', [heroSection('hero:d-1')])]), startBoard: 'd-1' });
  await s.wait(2 * MINUTE);
  expect(s.rest()!.hero).not.toBeNull();
  // another device takes it away
  s.configStore.stored().layouts = { [HOMEY_ID]: hubLayout([overview([ownSection('own:a')]), board('d-1', [])]) };
  await s.outside();
  expect([s.rest()!.hero, s.rest()!.shadowRoot!.querySelector('.clock')!.textContent]).toEqual([null, '12:02']);
  // the large battery is still watched
  expect(s.rest()!.battery).not.toBeNull();
});

test('the focus is on the rest screen, and afterwards where it was', async () => {
  const s = await launch();
  const face = lampFace(s.app);
  face.focus();
  await s.wait(2 * MINUTE);
  expect(s.rest()!.shadowRoot!.activeElement?.className).toBe('wake');
  send('click', s.rest()!);
  await s.wait(300);
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  expect(active).toBe(face);
});

test('without a focus before, there is none to give back', async () => {
  const s = await launch();
  (document.activeElement as HTMLElement | null)?.blur();
  await s.wait(2 * MINUTE);
  send('click', s.rest()!);
  await s.wait(300);
  expect([document.body, null]).toContain(document.activeElement);
});

test('the dashboard underneath rests too, as long as it is covered', async () => {
  const s = await launch();
  await s.wait(2 * MINUTE);
  await s.wait(1000);
  expect(s.dashboard().hasAttribute('resting')).toBe(true);
  send('touchstart', s.rest()!, { touches: [{}] });
  await settle(s.app);
  expect([s.dashboard().hasAttribute('resting'), s.rest()!.leaving]).toEqual([false, true]);
  send('touchend', s.rest()!, { touches: [] });
  await s.wait(300);
  expect([s.rest(), s.dashboard().hasAttribute('resting')]).toEqual([null, false]);
});

test('an app that goes takes its listeners along', async () => {
  const s = await launch();
  await s.wait(2 * MINUTE);
  s.app.remove();
  let arrived = false;
  document.body.addEventListener('click', () => { arrived = true; }, { once: true });
  send('click', document.body);
  expect(arrived).toBe(true);
});

// ----- the panel -----

const wallPanel = (app: MhApp) => app.shadowRoot!.querySelector('mh-wall-panel')!;

test('the settings open the panel, with what this hub has', async () => {
  const s = await launch({ wall: defaultWall() });
  await s.go('settings');
  s.app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('open-wall'));
  await settle(s.app);
  const panel = wallPanel(s.app);
  expect([s.app.panel, panel.open, panel.hasBattery, panel.tanks.length > 0, panel.sources.length > 0, panel.served]).toEqual(['wall', true, true, true, true, false]);
  panel.dispatchEvent(new CustomEvent('close'));
  await settle(s.app);
  expect([s.app.panel, panel.open]).toEqual(['none', false]);
});

test('what is chosen there counts at once and is kept, for this hub', async () => {
  const s = await launch({ wall: defaultWall() });
  wallPanel(s.app).dispatchEvent(new CustomEvent('change', { detail: { wall: ON } }));
  await settle(s.app);
  wallPanel(s.app).dispatchEvent(new CustomEvent('change', { detail: { hub: { inside: null, outside: null, tanks: { t1: 'low' } } } }));
  await settle(s.app);
  expect(s.configStore.stored().wall).toEqual({ ...ON, hubs: { [HOMEY_ID]: { inside: null, outside: null, tanks: { t1: 'low' } } } });
  expect(wallPanel(s.app).hub.tanks).toEqual({ t1: 'low' });
  await s.wait(2 * MINUTE);
  expect(s.rest()!.hub.tanks).toEqual({ t1: 'low' });
});

test.each(['day', 'night'] as const)('having a look at the %s from the panel; afterwards the panel is there again', async (look) => {
  const s = await launch({ layout: two() });
  await s.go('settings');
  s.app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('open-wall'));
  await settle(s.app);
  wallPanel(s.app).dispatchEvent(new CustomEvent('preview', { detail: { look } }));
  await settle(s.app);
  expect([s.rest()!.night, s.app.panel, document.documentElement.dataset['mode']]).toEqual([look === 'night', 'none', 'light']);
  tap(s.rest()!);
  await s.wait(300);
  expect([s.rest(), s.app.panel, wallPanel(s.app).open]).toEqual([null, 'wall', true]);
});

test('the panel goes when the window becomes as narrow as a phone', async () => {
  const s = await launch();
  await s.go('settings');
  s.app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('open-wall'));
  await settle(s.app);
  phone.matches = true;
  for (const listener of [...phoneListeners]) listener();
  await settle(s.app);
  expect(wallPanel(s.app).hidden).toBe(true);
});

test('an app that disappears while somebody has a look ends it', async () => {
  const s = await launch();
  wallPanel(s.app).dispatchEvent(new CustomEvent('preview', { detail: { look: 'day' } }));
  await settle(s.app);
  s.hub.emit({ type: 'authError' });
  await settle(s.app);
  expect([s.app.state.phase, s.rest(), s.app.panel]).toEqual(['connect', null, 'none']);
});

// ----- with the app on the hub -----

function servedLaunch(options: { wall?: WallSettings; hub?: ReturnType<typeof fakeHub>; peek?: boolean; paired?: boolean } = {}) {
  const hub = options.hub ?? fakeHub();
  const configStore = memoryConfig(options.paired === false ? null : { homeyId: HOMEY_ID, apiKey: 'paired' });
  const stored = configStore.stored();
  stored.wall = options.wall ?? ON;
  if (options.peek) (configStore as { peek?: () => unknown }).peek = () => ({ theme: stored.theme, language: stored.language, startBoard: stored.startBoard, wall: stored.wall });
  const reload = vi.fn();
  const state = { settled: true };
  let night: (flow: { night: boolean; at: number } | null) => void = () => {};
  let newBuild: () => void = () => {};
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore, createRealClient: () => hub, createDemoClient: () => createMockClient(demoRaw()),
    schedule: (flush) => { setTimeout(flush, 0); },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    browserLanguages: ['nl-NL'],
    served: {
      pair: async () => 'ok' as const, mayArrange: () => true, onConflict: () => {}, onUnsaved: () => {}, scanned: () => null, onScanned: () => {}, kind: () => 'tablet',
      onNight: (listener) => { night = listener; }, onNewBuild: (listener) => { newBuild = listener; }, settled: () => state.settled, reload,
    },
  };
  document.body.append(app);
  const rest = () => app.shadowRoot!.querySelector<MhRestScreen>('mh-rest-screen');
  const wait = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); await settle(app); };
  return { app, hub, reload, state, rest, wait, flow: async (on: boolean) => { night({ night: on, at: Date.now() }); await settle(app); }, build: async () => { newBuild(); await settle(app); } };
}

test('a flow on the hub makes it night, and ends it', async () => {
  const s = servedLaunch();
  await settle(s.app);
  await s.wait(2 * MINUTE);
  await s.flow(true);
  expect([s.rest()!.night, document.documentElement.dataset['mode']]).toEqual([true, 'dark']);
  await s.flow(false);
  expect([s.rest()!.night, document.documentElement.dataset['mode']]).toEqual([false, 'light']);
});

test('the panel knows that there are flow cards', async () => {
  const s = servedLaunch();
  await settle(s.app);
  expect(wallPanel(s.app).served).toBe(true);
});

test('another version of the dashboard: a page that rests loads it, once; one in use waits until it rests', async () => {
  const s = servedLaunch();
  await settle(s.app);
  await s.build();
  expect(s.reload).not.toHaveBeenCalled();
  await s.wait(2 * MINUTE);
  expect([s.reload.mock.calls.length, window.sessionStorage.getItem(REST_KEY)]).toEqual([1, '1']);
  await s.wait(10 * MINUTE);
  expect(s.reload).toHaveBeenCalledTimes(1);
});

const updateBanner = (app: MhApp) => deepAll(app, 'mh-banner').find((el) => (el as HTMLElement & { heading: string }).heading === 'Er is een nieuwe versie');

test('a page that is in use says so, with a button that loads it; not while something is arranged', async () => {
  const s = servedLaunch({ wall: { ...ON, on: false } });
  await settle(s.app);
  expect(updateBanner(s.app)).toBeUndefined();
  await s.build();
  const button = updateBanner(s.app)!.querySelector('mh-button') as HTMLElement;
  expect([button.textContent!.trim(), s.reload.mock.calls.length]).toEqual(['Vernieuwen', 0]);
  deep(s.app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(s.app);
  expect(updateBanner(s.app)).toBeUndefined();
  deep(s.app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(s.app);
  (updateBanner(s.app)!.querySelector('mh-button') as HTMLElement).click();
  expect(s.reload).toHaveBeenCalledTimes(1);
});

test('what is wrong now comes before what is new', async () => {
  const s = servedLaunch({ wall: { ...ON, on: false } });
  await settle(s.app);
  await s.build();
  s.hub.emit({ type: 'route', route: null });
  await settle(s.app);
  expect([updateBanner(s.app), deepAll(s.app, 'mh-banner').length]).toEqual([undefined, 1]);
  s.hub.emit({ type: 'route', route: 'local' });
  await s.wait(4000);
  expect(updateBanner(s.app)).toBeDefined();
});

test('not at night: in the morning', async () => {
  vi.setSystemTime(at('23:00'));
  const s = servedLaunch();
  await settle(s.app);
  await s.build();
  await s.wait(30_000);
  expect([s.rest()!.night, s.reload.mock.calls.length]).toEqual([true, 0]);
  vi.setSystemTime(at('07:29'));
  await s.wait(2 * MINUTE);
  expect([s.rest()!.night, s.reload.mock.calls.length]).toEqual([false, 1]);
});

test('not while the hub does not answer, and not while something is not on it yet', async () => {
  const s = servedLaunch();
  await settle(s.app);
  await s.build();
  s.hub.emit({ type: 'route', route: null });
  s.state.settled = false;
  await s.wait(3 * MINUTE);
  expect([s.rest() !== null, s.reload.mock.calls.length]).toEqual([true, 0]);
  s.hub.emit({ type: 'route', route: 'local' });
  await s.wait(MINUTE);
  expect(s.reload).not.toHaveBeenCalled();
  s.state.settled = true;
  await s.wait(MINUTE);
  expect(s.reload).toHaveBeenCalledTimes(1);
});

test('not while somebody has a look, nor while a finger wakes it', async () => {
  const s = servedLaunch();
  await settle(s.app);
  wallPanel(s.app).dispatchEvent(new CustomEvent('preview', { detail: { look: 'day' } }));
  await settle(s.app);
  await s.build();
  await s.wait(MINUTE);
  expect(s.reload).not.toHaveBeenCalled();
  s.app.remove();
  const other = servedLaunch();
  await settle(other.app);
  await other.wait(2 * MINUTE);
  send('touchstart', other.rest()!, { touches: [{}] });
  await other.build();
  expect(other.reload).not.toHaveBeenCalled();
});

test('a device that is no wall tablet never loads itself anew', async () => {
  const s = servedLaunch({ wall: defaultWall() });
  await settle(s.app);
  await s.build();
  await s.wait(60 * MINUTE);
  expect(s.reload).not.toHaveBeenCalled();
});

test('after that it rests at once, before anything was read of the hub', async () => {
  window.sessionStorage.setItem(REST_KEY, '1');
  const hub = fakeHub();
  hub.connect.mockReturnValue(new Promise(() => {}));
  const s = servedLaunch({ peek: true, hub });
  await s.app.updateComplete;
  expect([s.rest()?.shadowRoot!.querySelector('.clock')?.textContent, window.sessionStorage.getItem(REST_KEY)]).toEqual(['12:00', null]);
  await settle(s.app);
  expect([s.app.state.phase, s.rest()!.away, s.rest()!.hero]).toEqual(['connecting', false, null]);
});

test('and shows what there is as soon as it was read', async () => {
  window.sessionStorage.setItem(REST_KEY, '1');
  const s = servedLaunch({ peek: true });
  await settle(s.app);
  expect([s.app.state.phase, s.rest()!.hero?.kind]).toEqual(['dashboard', 'battery']);
});

test('not when it is no wall tablet, or not paired any more', async () => {
  window.sessionStorage.setItem(REST_KEY, '1');
  const off = servedLaunch({ peek: true, wall: defaultWall() });
  await settle(off.app);
  expect(off.rest()).toBeNull();
  window.sessionStorage.setItem(REST_KEY, '1');
  const alone = servedLaunch({ peek: true, paired: false });
  await settle(alone.app);
  expect([alone.app.state.phase, alone.rest()]).toEqual(['connect', null]);
});

test('a tablet that starts in the night is dark before anything was read of the hub', async () => {
  vi.setSystemTime(at('23:30'));
  const hub = fakeHub();
  hub.connect.mockReturnValue(new Promise(() => {}));
  const s = servedLaunch({ peek: true, hub });
  await s.app.updateComplete;
  expect([document.documentElement.dataset['mode'], surface()]).toEqual(['dark', colorTokens('#3b6939', 'dark', 0)['--c-surface']]);
  await s.wait(30_000);
  expect(s.rest()!.night).toBe(true);
});

test('a browser that keeps nothing between two pages does not stop it', async () => {
  const broken = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  const reading = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const s = servedLaunch();
  await settle(s.app);
  await s.wait(2 * MINUTE);
  await s.build();
  expect(s.reload).toHaveBeenCalledTimes(1);
  broken.mockRestore();
  reading.mockRestore();
});

// ----- found by the review -----

test('a menu that was left open closes', async () => {
  const s = await launch();
  const menus = () => deepAll(s.app, 'mh-section-menu').filter((menu) => (menu as unknown as { open: boolean }).open).length;
  (deepAll(s.app, 'mh-section-menu')[0] as unknown as { toggle(open: boolean): void }).toggle(true);
  await settle(s.app);
  expect(menus()).toBe(1);
  await s.wait(2 * MINUTE);
  expect([s.rest() !== null, menus()]).toEqual([true, 0]);
  send('click', s.rest()!);
  await s.wait(300);
  expect(menus()).toBe(0);
});

test('while somebody arranges there is nothing to look at', async () => {
  const s = await launch({ layout: two() });
  s.dashboard().dispatchEvent(new CustomEvent('toggle-edit'));
  await settle(s.app);
  await s.go('settings');
  s.app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('open-wall'));
  await settle(s.app);
  expect(wallPanel(s.app).canPreview).toBe(false);
  s.dashboard().dispatchEvent(new CustomEvent('done'));
  await settle(s.app);
  expect(wallPanel(s.app).canPreview).toBe(true);
});

test('a look that ends because the window became narrow does not leave a panel behind', async () => {
  const s = await launch();
  wallPanel(s.app).dispatchEvent(new CustomEvent('preview', { detail: { look: 'day' } }));
  await settle(s.app);
  phone.matches = true;
  for (const listener of [...phoneListeners]) listener();
  await settle(s.app);
  expect([s.rest(), s.app.panel]).toEqual([null, 'none']);
  phone.matches = false;
  for (const listener of [...phoneListeners]) listener();
  await settle(s.app);
  expect(wallPanel(s.app).open).toBe(false);
});

test('a look that was left alone becomes the rest screen: touched, the dashboard is there and not the panel', async () => {
  const s = await launch();
  await s.go('settings');
  s.app.shadowRoot!.querySelector('mh-settings-panel')!.dispatchEvent(new CustomEvent('open-wall'));
  await settle(s.app);
  wallPanel(s.app).dispatchEvent(new CustomEvent('preview', { detail: { look: 'night' } }));
  await s.wait(2 * MINUTE);
  expect(s.rest()!.night).toBe(false);
  send('click', s.rest()!);
  await s.wait(300);
  expect([s.rest(), s.app.panel]).toEqual([null, 'none']);
});
