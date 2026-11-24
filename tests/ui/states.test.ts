// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ConnectionError } from '../../src/homey/client';
import type { HomeySnapshot } from '../../src/homey/types';
import type { AppEnvironment, MhApp } from '../../src/ui/app/app';
import '../../src/ui/app/app';
import { deep, deepAll, deepText } from '../helpers/deep';
import { camperSnapshot, fakeHub, HOMEY_ID, memoryConfig } from '../helpers/fake-hub';

// Every state of the dashboard, from start to finish: the whole app with a fake hub, a configuration
// in memory and fake time, looking at what the person sees and at what is sent to the hub.

const SEVEN = ['homey.system.readonly', 'homey.device.readonly', 'homey.device.control', 'homey.flow.readonly', 'homey.flow.start', 'homey.insights.readonly', 'homey.zone.readonly'];

beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame'] }); });
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

async function settle(app: MhApp, ms = 1): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await vi.advanceTimersByTimeAsync(ms);
    await app.updateComplete;
  }
}

async function launch(options: { snapshot?: HomeySnapshot; saved?: boolean; prepare?: (hub: ReturnType<typeof fakeHub>) => void } = {}) {
  const hub = fakeHub(options.snapshot ?? withScopes(SEVEN));
  options.prepare?.(hub);
  const configStore = memoryConfig(options.saved === false ? null : { homeyId: HOMEY_ID, apiKey: 'k' });
  const app = document.createElement('mh-app') as MhApp;
  const environment: AppEnvironment = {
    configStore,
    createRealClient: () => hub,
    createDemoClient: () => fakeHub(),
    schedule: (flush) => { setTimeout(flush, 0); },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    browserLanguages: ['nl-NL'],
  };
  app.environment = environment;
  document.body.append(app);
  await settle(app);
  return { app, hub, configStore };
}

function withScopes(scopes: string[], change: (s: HomeySnapshot) => void = () => {}): HomeySnapshot {
  const snapshot = camperSnapshot();
  snapshot.scopes = scopes;
  change(snapshot);
  return snapshot;
}

const firstLight = (app: MhApp) => deep(app, 'mh-light-tile') as HTMLElement & { spec: { deviceId: string; onoffCapabilityId: string }; getAttribute(n: string): string | null };
const tap = (tile: HTMLElement) => tile.shadowRoot!.querySelector<HTMLElement>('.tile')!.click();
const snackbarText = (app: MhApp) => deepText(deep(app, 'mh-snackbar'));

test('loading', async () => {
  const { app } = await launch({ prepare: (hub) => { hub.manual = true; } });
  expect(deepAll(app, 'mh-skeleton')).toHaveLength(1);
  expect(deepText(deep(app, 'mh-header'))).toContain('Verbinden…');
  expect(deepAll(app, 'mh-light-tile')).toHaveLength(0);
});

test('start without a connection', async () => {
  const { app } = await launch({ prepare: (hub) => { hub.failWith = new ConnectionError('unreachable'); } });
  const empty = deep(app, 'mh-empty-state');
  expect(empty.getAttribute('heading')).toBe('Geen verbinding met je Homey');
  expect(deepAll(empty, 'mh-button').map((b) => b.textContent?.trim())).toEqual(['Nu proberen', 'Andere Homey of sleutel']);
});

test('the connection drops', async () => {
  const { app, hub } = await launch();
  hub.emit({ type: 'route', route: null });
  await settle(app);
  const banner = deep(app, 'mh-banner');
  expect(banner.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull();
  expect(banner.getAttribute('tone')).toBe('error');
  expect(deepText(deep(app, 'mh-header'))).toContain('Geen verbinding');
  const tile = firstLight(app);
  expect(tile.hasAttribute('stale')).toBe(true);
  tap(tile);
  await settle(app);
  expect(hub.setCapability).not.toHaveBeenCalled();
  expect(snackbarText(app)).toContain('Geen verbinding. Bedienen kan weer zodra je Homey terug is.');
});

test('the connection returns', async () => {
  const { app, hub } = await launch();
  hub.emit({ type: 'route', route: null });
  await settle(app);
  hub.emit({ type: 'route', route: 'local' });
  await settle(app);
  const banner = deep(app, 'mh-banner');
  expect(banner.getAttribute('tone')).toBe('ok');
  expect(banner.getAttribute('heading')).toBe('Weer verbonden');
  await settle(app, 600);
  expect(deepAll(app, 'mh-banner')).toHaveLength(0);
  expect(firstLight(app).hasAttribute('stale')).toBe(false);
});

test('through the cloud', async () => {
  const { app, hub } = await launch();
  hub.emit({ type: 'route', route: 'cloud' });
  await settle(app);
  expect(deepText(deep(app, 'mh-header'))).toContain('Via de cloud verbonden');
  expect(deepAll(app, 'mh-banner')).toHaveLength(0);
  expect(firstLight(app).hasAttribute('stale')).toBe(false);
});

test('a revoked key', async () => {
  const { app, hub, configStore } = await launch();
  hub.emit({ type: 'authError' });
  await settle(app);
  const screen = deep(app, 'mh-connect-screen');
  expect(screen.shadowRoot!.querySelector('h2')!.textContent).toBe('Opnieuw verbinden');
  expect(deepText(screen)).toContain('Je sleutel werkt niet meer.');
  expect(configStore.stored().connection.apiKey).toBeNull();
});

test('no right to control', async () => {
  const { app, hub } = await launch({ snapshot: withScopes(SEVEN.filter((s) => s !== 'homey.device.control')) });
  expect(deepText(deep(app, 'mh-header'))).toContain('Alleen bekijken');
  tap(firstLight(app));
  await settle(app);
  expect(hub.setCapability).not.toHaveBeenCalled();
  expect(snackbarText(app)).toContain('Deze sleutel mag geen apparaten bedienen.');
  firstLight(app).shadowRoot!.querySelector<HTMLElement>('.more')!.click();
  await settle(app);
  const panel = deep(app, 'mh-device-panel');
  expect(deepText(panel)).toContain('Deze sleutel mag geen apparaten bedienen.');
  expect((deep(panel, 'mh-switch') as HTMLElement & { disabled: boolean }).disabled).toBe(true);
});

test('no right to start flows', async () => {
  const { app, hub } = await launch({ snapshot: withScopes(SEVEN.filter((s) => s !== 'homey.flow.start')) });
  const flows = deepAll(app, 'mh-flow-tile');
  expect(flows.length).toBeGreaterThan(0);
  for (const flow of flows) expect(flow.shadowRoot!.querySelector('button')!.disabled).toBe(true);
  const section = deepAll(app, 'mh-section').find((s) => (s as HTMLElement & { section: { kind: string } }).section.kind === 'flows')!;
  expect(deepText(section)).toContain('Deze sleutel mag geen flows starten.');
  flows[0]!.shadowRoot!.querySelector('button')!.click();
  await settle(app);
  expect(hub.startFlow).not.toHaveBeenCalled();
});

test('no right to read devices', async () => {
  const { app } = await launch({ snapshot: withScopes(SEVEN.filter((s) => s !== 'homey.device.readonly'), (s) => { s.devices = {}; }) });
  const empty = deep(app, 'mh-empty-state');
  expect(empty.getAttribute('heading')).toBe('Geen apparaten te zien');
  expect(deepText(empty)).toContain('Deze sleutel mag geen apparaten bekijken.');
});

test('an unavailable device', async () => {
  const snapshot = withScopes(SEVEN);
  const lamp = Object.values(snapshot.devices).find((d) => d.deviceClass === 'light')!;
  lamp.available = false;
  lamp.unavailableMessage = 'Apparaat is offline';
  const { app, hub } = await launch({ snapshot });
  const tile = deepAll(app, 'mh-light-tile').find((t) => (t as HTMLElement & { spec: { deviceId: string } }).spec.deviceId === lamp.id)!;
  expect(tile.getAttribute('state')).toBe('unavailable');
  expect(deepText(tile)).toContain('Apparaat is offline');
  tap(tile);
  await settle(app);
  expect(hub.setCapability).not.toHaveBeenCalled();
  expect((deep(app, 'mh-device-panel') as HTMLElement & { deviceId: string | null }).deviceId).toBe(lamp.id);
});

test('a control fails', async () => {
  const { app, hub } = await launch({ prepare: (h) => { h.failControl = true; } });
  const tile = firstLight(app);
  const before = tile.getAttribute('state');
  tap(tile);
  await settle(app);
  expect(hub.setCapability).toHaveBeenCalledTimes(1);
  expect(tile.getAttribute('state')).toBe(before);
  expect(snackbarText(app)).toContain('reageerde niet.');
  expect(snackbarText(app)).toContain('Opnieuw');
});

test('a flow fails', async () => {
  const { app, hub } = await launch();
  hub.startFlow.mockRejectedValue(new Error('nope'));
  const flow = deep(app, 'mh-flow-tile');
  flow.shadowRoot!.querySelector('button')!.click();
  await settle(app);
  expect(flow.shadowRoot!.querySelector('mh-icon')!.getAttribute('name')).toBe('error');
  expect(snackbarText(app)).toContain('kon niet starten.');
});

test('an active alarm', async () => {
  const snapshot = withScopes(SEVEN);
  const device = Object.values(snapshot.devices).find((d) => d.capabilityOrder.includes('alarm_generic'))!;
  const { app, hub } = await launch({ snapshot });
  hub.emit({ type: 'capability', deviceId: device.id, capabilityId: 'alarm_generic', value: true, at: null });
  await settle(app);
  const chip = deepAll(app, 'mh-chip').find((c) => c.getAttribute('tone') === 'alert' && c.textContent?.includes(' · '))!;
  expect(chip.textContent).toBe(`${device.name} · ${device.capabilities['alarm_generic']!.title}`);
  chip.shadowRoot!.querySelector('button')!.click();
  await settle(app);
  expect((deep(app, 'mh-device-panel') as HTMLElement & { deviceId: string | null }).deviceId).toBe(device.id);
});

test('an empty hub', async () => {
  const { app } = await launch({ snapshot: withScopes(SEVEN, (s) => { s.devices = {}; s.flows = []; }) });
  expect(deep(app, 'mh-empty-state').getAttribute('heading')).toBe('Nog geen apparaten');
});

test('"Andere Homey of sleutel" at an unreachable start opens the connect screen and keeps the saved key', async () => {
  const { app, configStore } = await launch({ prepare: (hub) => { hub.failWith = new ConnectionError('unreachable'); } });
  const other = deepAll(deep(app, 'mh-empty-state'), 'mh-button').find((b) => b.textContent?.includes('Andere Homey of sleutel'))!;
  other.shadowRoot!.querySelector('button')!.click();
  await settle(app);
  expect(deepAll(app, 'mh-connect-screen')).toHaveLength(1);
  expect(configStore.stored().connection).toMatchObject({ homeyId: HOMEY_ID, apiKey: 'k' });
});
