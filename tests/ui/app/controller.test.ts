import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import camperRaw from '../../../src/mock/fixtures/camper.raw.json';
import { ConnectionError, type ClientEvent, type HistoryPeriod, type HistoryPoint, type HistoryRef } from '../../../src/homey/client';
import type { ConnectionSettings } from '../../../src/homey/api-client';
import { toSnapshot } from '../../../src/homey/map';
import type { CapabilityValue, Device, HomeySnapshot, RawHomey } from '../../../src/homey/types';
import { cap, device } from '../../helpers/build';
import { createSwitchableTranslate, t } from '../../../src/i18n';
import { boardFromDashboard } from '../../../src/layout/board';
import { board, hubLayout, overview, ownSection } from '../../helpers/layout';
import { createStore } from '../../../src/state/store';
import { createDefaultConfig, type AppConfig, type ConfigStore } from '../../../src/storage/config';
import { createLocalConfigStore } from '../../../src/storage/local-store';
import { defaultWall, emptyWallHub, withWallHub } from '../../../src/wall/settings';
import { CONTROL_TIMEOUT_MS, PERMISSION_HINT_MS, REBUILD_QUIET_MS, RESTORED_MS, START_RETRY_MS, createController, type ControllerDeps } from '../../../src/ui/app/controller';

const ID = '5f2a00000000000000000c81';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** Lets every pending promise settle. */
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

function memoryConfig(initial: Partial<AppConfig['connection']> | null = null) {
  let stored: AppConfig = createDefaultConfig();
  if (initial) stored.connection = { homeyId: null, localAddress: null, apiKey: null, ...initial };
  const store: ConfigStore & { stored(): AppConfig; refuse: boolean } = {
    refuse: false,
    load: vi.fn(async () => structuredClone(stored)),
    save: vi.fn(async (config: AppConfig) => {
      if (store.refuse) throw new Error('quota');
      stored = structuredClone(config);
    }),
    clearConnection: vi.fn(async () => {
      stored = { ...stored, connection: { homeyId: null, localAddress: null, apiKey: null } };
      return structuredClone(stored);
    }),
    stored: () => stored,
  };
  return store;
}

function fakeHub(snapshot: HomeySnapshot = toSnapshot(camperRaw as unknown as RawHomey)) {
  let listeners = new Set<(event: ClientEvent) => void>();
  let pending: { resolve(s: HomeySnapshot): void; reject(e: unknown): void } | null = null;
  const hub = {
    manual: false,
    failWith: null as unknown,
    failControl: false,
    connect: vi.fn(async () => {
      if (hub.failWith) throw hub.failWith;
      if (hub.manual) return new Promise<HomeySnapshot>((resolve, reject) => { pending = { resolve, reject }; });
      hub.emit({ type: 'route', route: 'local' });
      return structuredClone(snapshot);
    }),
    setCapability: vi.fn(async (_d: string, _c: string, _v: CapabilityValue) => { if (hub.failControl) throw new Error('refused'); }),
    startFlow: vi.fn(async () => {}),
    listHistory: vi.fn(async (): Promise<HistoryRef[]> => []),
    readHistory: vi.fn(async (_ref: HistoryRef, _period: HistoryPeriod): Promise<HistoryPoint[]> => []),
    subscribe: vi.fn((listener: (event: ClientEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener); }),
    disconnect: vi.fn(() => { listeners = new Set(); }),
    getHomeyId: vi.fn(() => ID),
    getLocalAddress: vi.fn((): string | null => '192.168.1.20'),
    emit(event: ClientEvent) { for (const l of [...listeners]) l(event); },
    finish() { hub.emit({ type: 'route', route: 'local' }); pending?.resolve(structuredClone(snapshot)); },
    fail(error: unknown) { pending?.reject(error); },
  };
  return hub;
}

function setup(options: { saved?: Partial<AppConfig['connection']> | null; hub?: ReturnType<typeof fakeHub>; scopes?: string[]; extra?: Device[]; browser?: string[]; peek?: ConfigStore['peek'] } = {}) {
  const configStore = memoryConfig(options.saved ?? null);
  if (options.peek) configStore.peek = options.peek;
  const snapshot = toSnapshot(camperRaw as unknown as RawHomey);
  if (options.scopes) snapshot.scopes = options.scopes;
  for (const device of options.extra ?? []) snapshot.devices[device.id] = device;
  const hub = options.hub ?? fakeHub(snapshot);
  const demo = fakeHub();
  let flush: (() => void) | null = null;
  const store = createStore((f) => { flush = f; });
  const notify = vi.fn();
  const createRealClient = vi.fn((_settings: ConnectionSettings) => hub);
  const deps: ControllerDeps = {
    configStore, store, createRealClient, createDemoClient: () => demo, notify,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    t: createSwitchableTranslate('nl'), browserLanguages: options.browser ?? ['nl-NL'],
  };
  const controller = createController(deps);
  const run = () => { const f = flush; flush = null; f?.(); };
  return { controller, configStore, hub, demo, store, notify, createRealClient, run, deps };
}

const SEVEN = ['homey.system.readonly', 'homey.device.readonly', 'homey.device.control', 'homey.flow.readonly', 'homey.flow.start', 'homey.insights.readonly', 'homey.zone.readonly'];
const lampId = (s: ReturnType<typeof setup>) => s.controller.getState().dashboard!.sections.find((x) => x.kind === 'lights')!.tiles[0] as { deviceId: string; onoffCapabilityId: string; kind: 'light' } & Record<string, unknown>;

test('without a saved connection the app starts on the connect screen', async () => {
  const s = setup();
  await s.controller.start();
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'none', savedAddress: '' });
  expect(s.createRealClient).not.toHaveBeenCalled();
});

test('a saved connection opens the dashboard', async () => {
  const hub = fakeHub();
  hub.manual = true;
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, hub });
  const started = s.controller.start();
  await settle();
  expect(s.controller.getState().phase).toBe('connecting');
  hub.finish();
  await started;
  s.run();
  expect(s.controller.getState()).toMatchObject({ phase: 'dashboard', route: 'local' });
  expect(s.controller.getState().dashboard!.sections.length).toBeGreaterThan(0);
});

test('an unreachable start keeps trying, 5 then 10 seconds later', async () => {
  expect(START_RETRY_MS).toEqual([5000, 10000, 30000, 60000]);
  const hub = fakeHub();
  hub.failWith = new ConnectionError('unreachable');
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, hub });
  await s.controller.start();
  expect(s.controller.getState()).toMatchObject({ phase: 'connecting', startUnreachable: true });
  expect(hub.connect).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(4999);
  expect(hub.connect).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(hub.connect).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(9999);
  expect(hub.connect).toHaveBeenCalledTimes(2);
  hub.failWith = null;
  await vi.advanceTimersByTimeAsync(1);
  expect(hub.connect).toHaveBeenCalledTimes(3);
  expect(s.controller.getState()).toMatchObject({ phase: 'dashboard', startUnreachable: false });
});

test('"Nu proberen" at an unreachable start tries at once', async () => {
  const hub = fakeHub();
  hub.failWith = new ConnectionError('unreachable');
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, hub });
  await s.controller.start();
  hub.failWith = null;
  s.controller.retry();
  await settle();
  expect(hub.connect).toHaveBeenCalledTimes(2);
  expect(s.controller.getState().phase).toBe('dashboard');
});

test('choosing another hub or key during an unreachable start stops the attempts', async () => {
  const hub = fakeHub();
  hub.failWith = new ConnectionError('unreachable');
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, hub });
  await s.controller.start();
  await s.controller.useOtherKey();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(hub.connect).toHaveBeenCalledTimes(1);
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', startUnreachable: false, savedAddress: ID });
});

test('a rejected key at the start returns to the connect screen and removes only the key', async () => {
  const hub = fakeHub();
  hub.failWith = new ConnectionError('auth');
  const s = setup({ saved: { homeyId: ID, localAddress: '192.168.1.20', apiKey: 'k' }, hub });
  const theme = s.configStore.stored().theme;
  await s.controller.start();
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'revoked', savedAddress: ID });
  expect(s.configStore.stored().connection).toEqual({ homeyId: ID, localAddress: '192.168.1.20', apiKey: null });
  expect(s.configStore.stored().theme).toEqual(theme);
});

test('an authError during use does the same', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'authError' });
  await settle();
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'revoked' });
  expect(s.configStore.stored().connection.apiKey).toBeNull();
  expect(s.hub.disconnect).toHaveBeenCalled();
});

test('an invalid address or an empty key never reaches the hub', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.connect('mijn homey', 'k');
  expect(s.controller.getState().connectIssue).toBe('invalid-address');
  await s.controller.connect(ID, '   ');
  expect(s.controller.getState().connectIssue).toBe('missing-key');
  expect(s.createRealClient).not.toHaveBeenCalled();
});

test('the key is trimmed and never kept in the state or in a message', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.connect(`https://my.homey.app/homeys/${ID}/devices`, '  geheim-123 \n');
  expect(s.createRealClient).toHaveBeenCalledWith({ homeyId: ID, localAddress: null, apiKey: 'geheim-123' });
  expect(JSON.stringify(s.controller.getState())).not.toContain('geheim-123');
  expect(JSON.stringify(s.notify.mock.calls)).not.toContain('geheim-123');
});

test('a successful connect saves the connection and opens the dashboard', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.connect(ID, 'k');
  expect(s.controller.getState()).toMatchObject({ phase: 'dashboard', busy: false, connectIssue: 'none' });
  expect(s.configStore.stored().connection).toEqual({ homeyId: ID, localAddress: '192.168.1.20', apiKey: 'k' });
});

test('a hub that cannot be reached or refuses the key gives its issue', async () => {
  const hub = fakeHub();
  const s = setup({ hub });
  await s.controller.start();
  hub.failWith = new ConnectionError('unreachable');
  await s.controller.connect(ID, 'k');
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'unreachable', busy: false });
  hub.failWith = new ConnectionError('auth');
  await s.controller.connect(ID, 'k');
  expect(s.controller.getState().connectIssue).toBe('auth');
  expect(hub.disconnect).toHaveBeenCalledTimes(2);
});

test('missing rights wait for a choice', async () => {
  const s = setup({ scopes: SEVEN.filter((x) => x !== 'homey.flow.start') });
  await s.controller.start();
  await s.controller.connect(ID, 'k');
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', review: ['startFlows'] });
  s.controller.continueWithMissingRights();
  expect(s.controller.getState()).toMatchObject({ phase: 'dashboard', review: null });
  expect(s.controller.status().canStartFlows).toBe(false);
});

test('using another key disconnects and clears the connection', async () => {
  const s = setup({ scopes: SEVEN.filter((x) => x !== 'homey.flow.start') });
  await s.controller.start();
  await s.controller.connect(ID, 'k');
  await s.controller.useOtherKey();
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', review: null });
  expect(s.hub.disconnect).toHaveBeenCalled();
  expect(s.configStore.stored().connection.apiKey).toBeNull();
});

test('connecting by address alone hints at the browser permission after two seconds', async () => {
  expect(PERMISSION_HINT_MS).toBe(2000);
  const hub = fakeHub();
  hub.manual = true;
  const s = setup({ hub });
  await s.controller.start();
  const connecting = s.controller.connect('192.168.1.20', 'k');
  await vi.advanceTimersByTimeAsync(1999);
  expect(s.controller.getState()).toMatchObject({ busy: true, waitingForPermission: false });
  await vi.advanceTimersByTimeAsync(1);
  expect(s.controller.getState().waitingForPermission).toBe(true);
  hub.finish();
  await connecting;
  expect(s.controller.getState()).toMatchObject({ busy: false, waitingForPermission: false });
});

test('a learned local address is saved', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'localAddress', address: '192.168.1.50' });
  await settle();
  expect(s.configStore.stored().connection.localAddress).toBe('192.168.1.50');
});

test('losing and regaining the route', async () => {
  expect(RESTORED_MS).toBe(3000);
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  expect(s.controller.getState().restored).toBe(false);
  s.hub.emit({ type: 'route', route: null });
  expect(s.controller.getState().route).toBeNull();
  s.hub.emit({ type: 'route', route: 'cloud' });
  expect(s.controller.getState()).toMatchObject({ route: 'cloud', restored: true });
  await vi.advanceTimersByTimeAsync(2999);
  expect(s.controller.getState().restored).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(s.controller.getState().restored).toBe(false);
});

test('a tap while there is no route sends nothing and says why', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'route', route: null });
  s.controller.actions.toggle(lampId(s) as never);
  expect(s.hub.setCapability).not.toHaveBeenCalled();
  expect(s.notify).toHaveBeenCalledWith(expect.objectContaining({ text: t('notify.offline') }));
});

test('a tap without the right to control sends nothing and says why', async () => {
  const s = setup({ scopes: SEVEN.filter((x) => x !== 'homey.device.control') });
  await s.controller.start();
  await s.controller.connect(ID, 'k');
  s.controller.continueWithMissingRights();
  s.controller.actions.toggle(lampId(s) as never);
  expect(s.hub.setCapability).not.toHaveBeenCalled();
  expect(s.notify).toHaveBeenCalledWith(expect.objectContaining({ text: t('notify.readonly') }));
});

test('a refused control springs back and offers to try again', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  const before = s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value;
  s.hub.failControl = true;
  s.controller.actions.toggle(lamp as never);
  await settle();
  expect(s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value).toBe(before);
  const name = s.store.getDevice(lamp.deviceId)!.name;
  expect(s.notify).toHaveBeenLastCalledWith(expect.objectContaining({ text: `${name} reageerde niet.`, tone: 'error', action: expect.objectContaining({ label: 'Opnieuw' }) }));
  s.hub.failControl = false;
  s.notify.mock.lastCall![0].action.run();
  await settle();
  expect(s.hub.setCapability).toHaveBeenCalledTimes(2);
});

test('two quick taps send both and the last one wins', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  const start = s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value;
  s.controller.actions.toggle(lamp as never);
  s.controller.actions.toggle(lamp as never);
  await settle();
  expect(s.hub.setCapability.mock.calls.map((c) => c[2])).toEqual([!start, start]);
  expect(s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value).toBe(start);
});

test('the last slider value is not sent after the route dropped', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s) as unknown as { deviceId: string; dimCapabilityId: string };
  s.controller.actions.slide(lamp.deviceId, lamp.dimCapabilityId, 0.4, false);
  await settle();
  const sent = s.hub.setCapability.mock.calls.length;
  expect(sent).toBeGreaterThan(0);
  s.hub.emit({ type: 'route', route: null });
  s.controller.actions.slide(lamp.deviceId, lamp.dimCapabilityId, 0.5, true);
  await settle();
  expect(s.hub.setCapability).toHaveBeenCalledTimes(sent);
  expect(s.notify).toHaveBeenCalledWith(expect.objectContaining({ text: t('notify.offline') }));
});

test('sliding a lamp that is off turns it on', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const off = s.controller.getState().dashboard!.sections.find((x) => x.kind === 'lights')!.tiles
    .map((tile) => tile as unknown as { deviceId: string; dimCapabilityId: string; onoffCapabilityId: string })
    .find((tile) => s.store.getDevice(tile.deviceId)!.capabilities[tile.onoffCapabilityId]!.value === false)!;
  s.controller.actions.slide(off.deviceId, off.dimCapabilityId, 0.4, false);
  await settle();
  expect(s.hub.setCapability.mock.calls).toContainEqual([off.deviceId, off.onoffCapabilityId, true]);
  expect(s.hub.setCapability.mock.calls).toContainEqual([off.deviceId, off.dimCapabilityId, 0.4]);
});

test('a lamp without an on/off capability is toggled through its level', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s) as unknown as { deviceId: string; dimCapabilityId: string };
  const spec = { kind: 'light', id: 'x', deviceId: lamp.deviceId, size: 'wide', onoffCapabilityId: null, dimCapabilityId: lamp.dimCapabilityId } as const;
  s.store.apply({ type: 'capability', deviceId: lamp.deviceId, capabilityId: lamp.dimCapabilityId, value: 0.3, at: null });
  s.controller.actions.toggle(spec);
  s.store.apply({ type: 'capability', deviceId: lamp.deviceId, capabilityId: lamp.dimCapabilityId, value: 0, at: null });
  await settle();
  s.controller.actions.toggle(spec);
  await settle();
  expect(s.hub.setCapability.mock.calls.map((c) => [c[1], c[2]])).toEqual([[lamp.dimCapabilityId, 0], [lamp.dimCapabilityId, 1]]);
});

test('a flow that fails reports false and says so', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.startFlow.mockRejectedValueOnce(new Error('nope'));
  const flow = s.store.getSnapshot()!.flows.find((f) => f.startable)!;
  expect(await s.controller.actions.startFlow(flow.id, flow.kind)).toBe(false);
  expect(s.notify).toHaveBeenLastCalledWith(expect.objectContaining({ text: t('notify.flowFailed', { name: flow.name }), tone: 'error' }));
  expect(await s.controller.actions.startFlow(flow.id, flow.kind)).toBe(true);
});

test('a storage that refuses does not stop the app', async () => {
  const s = setup();
  await s.controller.start();
  s.configStore.refuse = true;
  await s.controller.connect(ID, 'k');
  expect(s.controller.getState().phase).toBe('dashboard');
  s.controller.setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  await settle();
  expect(s.notify.mock.calls.filter((c) => c[0].text === t('notify.saveFailed'))).toHaveLength(1);
  expect(s.controller.getState().theme.seed).toBe('#a6422a');
});

test('the demo opens a dashboard, is marked as demo and saves nothing', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.startDemo();
  expect(s.controller.getState().phase).toBe('demo');
  expect(s.controller.status().demo).toBe(true);
  expect(s.configStore.save).not.toHaveBeenCalled();
  s.controller.leaveDemo();
  expect(s.controller.getState().phase).toBe('connect');
  expect(s.demo.disconnect).toHaveBeenCalled();
});

test('disconnect clears the connection and keeps the theme', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const theme = s.controller.getState().theme;
  await s.controller.disconnect();
  expect(s.configStore.clearConnection).toHaveBeenCalled();
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', theme, savedAddress: '' });
  expect(s.hub.disconnect).toHaveBeenCalled();
});

test('a removed device disappears from the dashboard, once things are quiet', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  s.hub.emit({ type: 'deviceRemoved', deviceId: lamp.deviceId });
  s.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS);
  const ids = s.controller.getState().dashboard!.sections.flatMap((x) => x.tiles.map((tile) => ('deviceId' in tile ? tile.deviceId : '')));
  expect(ids).not.toContain(lamp.deviceId);
});

test('listeners hear every change of state', async () => {
  const s = setup();
  const heard = vi.fn();
  s.controller.subscribe(heard);
  await s.controller.start();
  expect(heard).toHaveBeenCalled();
});

test('openDevice remembers which device window is open, also without a route', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  expect(s.controller.getState().openDeviceId).toBeNull();
  s.hub.emit({ type: 'route', route: null });
  s.controller.actions.openDevice(lamp.deviceId);
  expect(s.controller.getState().openDeviceId).toBe(lamp.deviceId);
  s.controller.closeDevice();
  expect(s.controller.getState().openDeviceId).toBeNull();
});

test('leaving the dashboard closes the device window', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.controller.actions.openDevice(lampId(s).deviceId);
  await s.controller.disconnect();
  expect(s.controller.getState().openDeviceId).toBeNull();
});

// Final review, issue 1: a side attempt from "Nu proberen" must not deafen the client that is recovering by itself.
test('a failed "Nu proberen" leaves the old connection heard', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'route', route: null });
  const candidate = fakeHub();
  candidate.failWith = new ConnectionError('unreachable');
  s.createRealClient.mockReturnValueOnce(candidate);
  s.controller.retry();
  await settle();
  expect(candidate.disconnect).toHaveBeenCalled();
  s.hub.emit({ type: 'route', route: 'cloud' });
  expect(s.controller.getState().route).toBe('cloud');
  s.hub.emit({ type: 'authError' });
  await settle();
  expect(s.controller.getState().phase).toBe('connect');
});

test('while "Nu proberen" is pending the old connection is still heard, and a late answer is dropped', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'route', route: null });
  const candidate = fakeHub();
  candidate.manual = true;
  s.createRealClient.mockReturnValueOnce(candidate);
  s.controller.retry();
  await settle();
  s.hub.emit({ type: 'route', route: 'cloud' });
  expect(s.controller.getState().route).toBe('cloud');
  candidate.finish();
  await settle();
  expect(candidate.disconnect).toHaveBeenCalled();
  expect(s.hub.disconnect).not.toHaveBeenCalled();
  s.hub.emit({ type: 'route', route: 'local' });
  expect(s.controller.getState().route).toBe('local');
});

test('a "Nu proberen" that connects takes over, with its own route', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'route', route: null });
  const candidate = fakeHub();
  s.createRealClient.mockReturnValueOnce(candidate);
  s.controller.retry();
  await settle();
  expect(s.hub.disconnect).toHaveBeenCalled();
  expect(s.controller.getState().route).toBe('local');
  s.hub.emit({ type: 'route', route: null });
  expect(s.controller.getState().route).toBe('local');
  candidate.emit({ type: 'route', route: 'cloud' });
  expect(s.controller.getState().route).toBe('cloud');
});

test('a key refused during "Nu proberen" goes back to the connect screen', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.hub.emit({ type: 'route', route: null });
  const candidate = fakeHub();
  candidate.failWith = new ConnectionError('auth');
  s.createRealClient.mockReturnValueOnce(candidate);
  s.controller.retry();
  await settle();
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'revoked' });
});

// Final review, issue 3: only dimming turns a device on, with the capability the device toggles with.
test('sliding something other than a dimmer does not turn the device on', async () => {
  const heater = device({ id: 'h', name: 'Kachel', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('target_temperature', { setable: true, min: 5, max: 30, value: 18 })] });
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, extra: [heater] });
  await s.controller.start();
  s.controller.actions.slide('h', 'target_temperature', 21, true);
  await settle();
  expect(s.hub.setCapability.mock.calls).toEqual([['h', 'target_temperature', 21]]);
});

test('dimming a lamp that only has a derived on/off turns it on with that capability', async () => {
  const lamp = device({ id: 'x', name: 'Spot', deviceClass: 'light', caps: [cap('onoff.1', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, min: 0, max: 1, value: 0.2 })] });
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, extra: [lamp] });
  await s.controller.start();
  s.controller.actions.slide('x', 'dim', 0.5, true);
  await settle();
  expect(s.hub.setCapability.mock.calls).toEqual([['x', 'onoff.1', true], ['x', 'dim', 0.5]]);
});

// Final review, issue 4: going to the connect screen from an unreachable start keeps the saved key.
test('"Andere Homey of sleutel" stops the attempts but keeps the saved connection', async () => {
  const hub = fakeHub();
  hub.failWith = new ConnectionError('unreachable');
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, hub });
  await s.controller.start();
  s.controller.changeConnection();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(hub.connect).toHaveBeenCalledTimes(1);
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'none', startUnreachable: false, savedAddress: ID });
  expect(s.configStore.stored().connection).toMatchObject({ homeyId: ID, apiKey: 'k' });
});

test('an address with two different Homey IDs never reaches the hub', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.connect('homeys/5f2a00000000000000000c81 5f2a00000000000000000c82', 'k');
  expect(s.controller.getState().connectIssue).toBe('ambiguous-address');
  expect(s.createRealClient).not.toHaveBeenCalled();
});

test('when the key cannot be cleared, the app says the key is still stored', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  vi.mocked(s.configStore.clearConnection).mockRejectedValueOnce(new Error('denied'));
  await s.controller.disconnect();
  expect(s.notify).toHaveBeenCalledWith(expect.objectContaining({ text: t('notify.clearFailed'), tone: 'error' }));
  s.notify.mockClear();
  await s.controller.connect(ID, 'k');
  vi.mocked(s.configStore.clearConnection).mockRejectedValueOnce(new Error('denied'));
  await s.controller.useOtherKey();
  expect(s.notify).toHaveBeenCalledWith(expect.objectContaining({ text: t('notify.clearFailed') }));
});

test('an auth failure during saving after connect does not end on the dashboard', async () => {
  const s = setup();
  await s.controller.start();
  let release: () => void = () => {};
  vi.mocked(s.configStore.save).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const connecting = s.controller.connect(ID, 'k');
  await vi.waitFor(() => expect(s.configStore.save).toHaveBeenCalled());
  s.hub.emit({ type: 'authError' });
  await vi.waitFor(() => expect(s.controller.getState().connectIssue).toBe('revoked'));
  release();
  await connecting;
  expect(s.controller.getState()).toMatchObject({ phase: 'connect', connectIssue: 'revoked', busy: false });
});

test('a superseded connect does not clear the busy state of a newer one', async () => {
  const a = fakeHub(); a.manual = true;
  const b = fakeHub(); b.manual = true;
  const s = setup();
  await s.controller.start();
  s.createRealClient.mockReturnValueOnce(a).mockReturnValueOnce(b);
  const first = s.controller.connect(ID, 'k');
  await vi.waitFor(() => expect(a.connect).toHaveBeenCalled());
  const second = s.controller.connect(ID, 'k2');
  await vi.waitFor(() => expect(b.connect).toHaveBeenCalled());
  a.fail(new ConnectionError('unreachable'));
  await first;
  expect(s.controller.getState()).toMatchObject({ busy: true, connectIssue: 'none' });
  b.finish();
  await second;
  expect(s.controller.getState()).toMatchObject({ busy: false, phase: 'dashboard' });
});

test('cancelling a first connect by IP stops waiting and unlocks the form', async () => {
  vi.useFakeTimers();
  try {
    const hub = fakeHub(); hub.manual = true;
    const s = setup({ hub });
    await s.controller.start();
    const connecting = s.controller.connect('192.168.1.20', 'k');
    await vi.advanceTimersByTimeAsync(PERMISSION_HINT_MS);
    expect(s.controller.getState()).toMatchObject({ busy: true, waitingForPermission: true });
    s.controller.cancelConnect();
    expect(s.controller.getState()).toMatchObject({ busy: false, waitingForPermission: false, phase: 'connect' });
    expect(hub.disconnect).toHaveBeenCalled();
    hub.finish();
    await connecting;
    await vi.advanceTimersByTimeAsync(PERMISSION_HINT_MS);
    expect(s.controller.getState()).toMatchObject({ busy: false, waitingForPermission: false, phase: 'connect' });
    expect(s.configStore.stored().connection.apiKey).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('a command without an answer fails after ten seconds and the tile springs back', async () => {
  expect(CONTROL_TIMEOUT_MS).toBe(10_000);
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  const value = () => s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value;
  const before = value();
  s.hub.setCapability.mockImplementationOnce(() => new Promise<void>(() => {}));
  s.controller.actions.toggle(lamp as never);
  await settle();
  expect(value()).toBe(before !== true);
  await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS - 1);
  expect(value()).toBe(before !== true);
  expect(s.notify).not.toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
  await vi.advanceTimersByTimeAsync(1);
  expect(value()).toBe(before);
  const name = s.store.getDevice(lamp.deviceId)!.name;
  expect(s.notify).toHaveBeenLastCalledWith(expect.objectContaining({ text: `${name} reageerde niet.`, action: expect.objectContaining({ label: 'Opnieuw' }) }));
});

test('live values flow again after the time limit', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  const value = () => s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value;
  s.hub.setCapability.mockImplementationOnce(() => new Promise<void>(() => {}));
  s.controller.actions.toggle(lamp as never);
  await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS);
  s.hub.emit({ type: 'capability', deviceId: lamp.deviceId, capabilityId: lamp.onoffCapabilityId, value: 'live' as never, at: null });
  expect(value()).toBe('live');
});

test('a late answer after the time limit changes nothing', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  const value = () => s.store.getDevice(lamp.deviceId)!.capabilities[lamp.onoffCapabilityId]!.value;
  let answer: () => void = () => {};
  s.hub.setCapability.mockImplementationOnce(() => new Promise<void>((resolve) => { answer = resolve; }));
  s.controller.actions.toggle(lamp as never);
  await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS);
  s.hub.emit({ type: 'capability', deviceId: lamp.deviceId, capabilityId: lamp.onoffCapabilityId, value: 'live' as never, at: null });
  const notices = s.notify.mock.calls.length;
  answer();
  await settle();
  expect(value()).toBe('live');
  expect(s.notify.mock.calls.length).toBe(notices);
});

test('a press without an answer also fails after ten seconds', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s);
  s.hub.setCapability.mockImplementationOnce(() => new Promise<void>(() => {}));
  s.controller.actions.press(lamp.deviceId, 'button.identify');
  await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS - 1);
  expect(s.notify).not.toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
  await vi.advanceTimersByTimeAsync(1);
  expect(s.notify).toHaveBeenLastCalledWith(expect.objectContaining({ tone: 'error', text: expect.stringContaining('reageerde niet.') }));
});

/** The lamp of the dashboard with one capability more: another make-up. */
const reshaped = (s: ReturnType<typeof setup>, extra: string): Device => {
  const lamp = s.store.getDevice(lampId(s).deviceId)!;
  return { ...lamp, capabilityOrder: [...lamp.capabilityOrder, extra], capabilities: { ...lamp.capabilities, [extra]: cap(extra, { setable: true }) } };
};

test('the dashboard is rebuilt once, two seconds after the last change', async () => {
  expect(REBUILD_QUIET_MS).toBe(2000);
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const first = s.controller.getState().dashboard;
  s.hub.emit({ type: 'device', device: reshaped(s, 'light_hue') });
  s.run();
  await vi.advanceTimersByTimeAsync(1000);
  s.hub.emit({ type: 'device', device: reshaped(s, 'light_saturation') });
  s.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS - 1);
  expect(s.controller.getState().dashboard).toBe(first);
  await vi.advanceTimersByTimeAsync(1);
  const second = s.controller.getState().dashboard;
  expect(second).not.toBe(first);
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS * 2);
  expect(s.controller.getState().dashboard).toBe(second);
});

test('an added device also waits for the quiet time', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const first = s.controller.getState().dashboard;
  s.hub.emit({ type: 'device', device: device({ id: 'nieuw', name: 'Nieuwe lamp', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] }) });
  s.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS - 1);
  expect(s.controller.getState().dashboard).toBe(first);
  await vi.advanceTimersByTimeAsync(1);
  const lights = s.controller.getState().dashboard!.sections.find((x) => x.kind === 'lights')!;
  expect(lights.tiles.some((tile) => 'deviceId' in tile && tile.deviceId === 'nieuw')).toBe(true);
});

test('the open device window stays open when the dashboard is rebuilt', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.controller.actions.openDevice(lampId(s).deviceId);
  s.hub.emit({ type: 'device', device: reshaped(s, 'light_hue') });
  s.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS);
  expect(s.controller.getState().openDeviceId).toBe(lampId(s).deviceId);
});

test('a device removed while its window is open does not throw', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const lamp = lampId(s).deviceId;
  s.controller.actions.openDevice(lamp);
  s.hub.emit({ type: 'deviceRemoved', deviceId: lamp });
  expect(() => s.run()).not.toThrow();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS);
  expect(s.controller.getState().openDeviceId).toBe(lamp);
  const tiles = s.controller.getState().dashboard!.sections.flatMap((x) => x.tiles);
  expect(tiles.some((tile) => 'deviceId' in tile && tile.deviceId === lamp)).toBe(false);
});

test('the saved language wins; without one the browser decides', async () => {
  const saved = setup({ browser: ['nl-NL'] });
  saved.configStore.stored().language = 'en';
  await saved.controller.start();
  expect(saved.controller.getState().language).toEqual({ choice: 'en', active: 'en' });
  expect(saved.deps.t.language).toBe('en');
  const dutch = setup({ browser: ['nl-BE', 'en'] });
  await dutch.controller.start();
  expect(dutch.controller.getState().language).toEqual({ choice: null, active: 'nl' });
  const other = setup({ browser: ['de-DE'] });
  await other.controller.start();
  expect(other.controller.getState().language).toEqual({ choice: null, active: 'en' });
  expect(other.deps.t('count.on', { n: 2 })).toBe('2 on');
});

test('setLanguage saves the choice and switches the translate function', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, browser: ['nl-NL'] });
  await s.controller.start();
  const before = s.controller.getState().dashboard;
  s.controller.setLanguage('en');
  await settle();
  expect(s.controller.getState().language).toEqual({ choice: 'en', active: 'en' });
  expect(s.configStore.stored().language).toBe('en');
  expect(s.deps.t.language).toBe('en');
  // the dashboard is made again, so names sort in the new language
  expect(s.controller.getState().dashboard).not.toBe(before);
  s.controller.setLanguage(null);
  await settle();
  expect(s.controller.getState().language).toEqual({ choice: null, active: 'nl' });
  expect(s.configStore.stored().language).toBeNull();
  // the connection was not touched
  expect(s.createRealClient).toHaveBeenCalledTimes(1);
  expect(s.controller.getState().phase).toBe('dashboard');
});

test('choosing a colour saves it under the section id; following the dashboard removes it', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.controller.setSectionSeed('type:water', '#3a5ba9');
  s.controller.setSectionSeed('hero:main', '#a6422a');
  await settle();
  expect(s.controller.getState().sectionSeeds).toEqual({ 'type:water': '#3a5ba9', 'hero:main': '#a6422a' });
  expect(s.configStore.stored().sectionSeeds).toEqual({ 'type:water': '#3a5ba9', 'hero:main': '#a6422a' });
  s.controller.setSectionSeed('type:water', null);
  await settle();
  expect(s.configStore.stored().sectionSeeds).toEqual({ 'hero:main': '#a6422a' });
  s.controller.setSectionSeed('type:water', 'blauw');
  expect(s.controller.getState().sectionSeeds).toEqual({ 'hero:main': '#a6422a' });
});

test('saved section colours load, and disconnecting keeps them', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  s.configStore.stored().sectionSeeds = { 'type:lights': '#a6422a' };
  await s.controller.start();
  expect(s.controller.getState().sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
  await s.controller.disconnect();
  expect(s.controller.getState().sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
  expect(s.configStore.stored().sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
});

test('a flow start without an answer fails after ten seconds, so the flow button works again', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  const flow = s.store.getSnapshot()!.flows.find((f) => f.startable)!;
  s.hub.startFlow.mockImplementationOnce(() => new Promise<void>(() => {}));
  let result: boolean | null = null;
  void s.controller.actions.startFlow(flow.id, flow.kind).then((ok) => { result = ok; });
  await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS - 1);
  expect(result).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(result).toBe(false);
  expect(s.notify).toHaveBeenLastCalledWith(expect.objectContaining({ tone: 'error', text: t('notify.flowFailed', { name: flow.name }) }));
});

// ----- the layout -----

/** The app connected to the camper; `edit` changes the first light's place, which freezes the overview. */
async function connected(options: Parameters<typeof setup>[0] = {}) {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' }, ...options });
  await s.controller.start();
  s.run();
  const state = () => s.controller.getState();
  const quiet = async () => { s.run(); await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS); };
  const blocks = () => { const board = state().board!; return [...board.left, ...board.right]; };
  const sectionOf = (id: string) => { const found = blocks().find((b) => b.type === 'section' && b.section.id === id); return found?.type === 'section' ? found.section : undefined; };
  const tiles = (id: string) => sectionOf(id)?.tiles.map((tile) => tile.id) ?? [];
  const moveFirstLight = () => s.controller.edit({ type: 'move-tile', dashboardId: 'overview', tileId: tiles('type:lights')[0]!, toSectionId: 'type:lights', index: 1 });
  const overviewSections = () => state().layout.dashboards.find((d) => d.id === 'overview')!.sections;
  return { ...s, state, quiet, blocks, sectionOf, tiles, moveFirstLight, overviewSections };
}

const newSensor = (partial: Parameters<typeof device>[0] = {}) => device({ id: 'nieuw', name: 'Bewegingssensor', deviceClass: 'sensor', caps: [cap('alarm_motion', { type: 'boolean', value: false })], ...partial });

test('the app starts with an automatic overview in columns', async () => {
  const c = await connected();
  expect(c.state()).toMatchObject({ boardId: 'overview', editing: false, canUndo: false, news: [], gone: [] });
  expect(c.overviewSections()).toBeNull();
  expect(c.state().board).toEqual(boardFromDashboard(c.state().dashboard!, 'overview'));
});

test('an automatic overview follows the hub as in round 1C', async () => {
  const c = await connected();
  c.hub.emit({ type: 'device', device: newSensor() });
  await c.quiet();
  expect(c.tiles('type:security')).toContain('nieuw:generic');
  expect(c.state().news).toEqual([]);
  expect(c.configStore.save).not.toHaveBeenCalled();
});

test('the first edit freezes the overview as shown and applies the edit', async () => {
  const c = await connected();
  const before = c.state().board!;
  const [first, second, ...rest] = c.tiles('type:lights');
  c.moveFirstLight();
  expect(c.tiles('type:lights')).toEqual([second, first, ...rest]);
  const others = (view: typeof before) => JSON.stringify([...view.left, ...view.right].flatMap((b) => (b.type === 'section' && b.section.id !== 'type:lights' ? [[b.section.id, b.section.tiles.map((tile) => tile.id)]] : [])));
  expect(others(c.state().board!)).toBe(others(before));
  expect(c.overviewSections()).not.toBeNull();
  expect(c.state().layout.known).toContain('device-1');
  expect(c.state().canUndo).toBe(true);
});

test('an edit that changes nothing does not freeze the overview', async () => {
  const c = await connected();
  c.controller.edit({ type: 'remove-tile', dashboardId: 'overview', tileId: 'no-such-tile' });
  c.controller.edit({ type: 'move-tile', dashboardId: 'overview', tileId: c.tiles('type:lights')[0]!, toSectionId: 'type:lights', index: 0 });
  expect(c.overviewSections()).toBeNull();
  expect(c.state().canUndo).toBe(false);
  expect(c.configStore.save).not.toHaveBeenCalled();
});

test('a colour for a section and a new name for the overview do not freeze it', async () => {
  const c = await connected();
  c.controller.setSectionSeed('type:lights', '#a6422a');
  c.controller.edit({ type: 'set-dashboard', dashboardId: 'overview', name: 'Thuis', icon: null });
  expect(c.overviewSections()).toBeNull();
  expect(c.state().layout.dashboards[0]!.name).toBe('Thuis');
});

test('every edit is saved under the hub id', async () => {
  const c = await connected();
  c.moveFirstLight();
  await settle();
  expect(Object.keys(c.configStore.stored().layouts)).toEqual([ID]);
  expect(c.configStore.stored().layouts[ID]).toEqual(c.state().layout);
  c.controller.edit({ type: 'remove-tile', dashboardId: 'overview', tileId: c.tiles('type:lights')[0]! });
  await settle();
  expect(c.configStore.stored().layouts[ID]).toEqual(c.state().layout);
});

test('a stored layout is there again after a restart', async () => {
  const c = await connected();
  c.moveFirstLight();
  const order = c.tiles('type:lights');
  await settle();
  const again = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  again.configStore.stored().layouts = structuredClone(c.configStore.stored().layouts);
  await again.controller.start();
  const board = again.controller.getState().board!;
  const lights = [...board.left, ...board.right].flatMap((b) => (b.type === 'section' && b.section.id === 'type:lights' ? b.section.tiles.map((tile) => tile.id) : []));
  expect(lights).toEqual(order);
});

test('a save that is refused is reported once and editing goes on', async () => {
  const c = await connected();
  c.configStore.refuse = true;
  c.moveFirstLight();
  c.moveFirstLight();
  await settle();
  expect(c.notify).toHaveBeenCalledTimes(1);
  expect(c.notify).toHaveBeenCalledWith(expect.objectContaining({ text: t('notify.saveFailed') }));
  expect(c.overviewSections()).not.toBeNull();
});

test('the example hub saves nothing', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.startDemo();
  const board = s.controller.getState().board!;
  const lights = board.left.find((b) => b.type === 'section' && b.section.id === 'type:lights');
  const first = lights?.type === 'section' ? lights.section.tiles[0]!.id : '';
  s.controller.edit({ type: 'remove-tile', dashboardId: 'overview', tileId: first });
  await settle();
  expect(s.controller.getState().layout.dashboards[0]!.sections).not.toBeNull();
  expect(s.configStore.save).not.toHaveBeenCalled();
  s.controller.leaveDemo();
  await s.controller.startDemo();
  expect(s.controller.getState().layout.dashboards[0]!.sections).toBeNull();
  expect(s.controller.getState().canUndo).toBe(false);
});

test('undoing the first edit makes the overview automatic again', async () => {
  const c = await connected();
  const order = c.tiles('type:lights');
  c.moveFirstLight();
  c.controller.undo();
  expect(c.overviewSections()).toBeNull();
  expect(c.state().canUndo).toBe(false);
  expect(c.tiles('type:lights')).toEqual(order);
  await settle();
  expect(c.configStore.stored().layouts[ID]!.dashboards[0]!.sections).toBeNull();
  // a new device then appears by itself again
  c.hub.emit({ type: 'device', device: newSensor() });
  await c.quiet();
  expect(c.tiles('type:security')).toContain('nieuw:generic');
  expect(c.state().news).toEqual([]);
});

test('undo goes back step by step', async () => {
  const c = await connected();
  const order = c.tiles('type:lights');
  c.moveFirstLight();
  const moved = c.tiles('type:lights');
  c.controller.edit({ type: 'remove-tile', dashboardId: 'overview', tileId: moved[2]! });
  c.controller.undo();
  expect(c.tiles('type:lights')).toEqual(moved);
  c.controller.undo();
  expect(c.tiles('type:lights')).toEqual(order);
  c.controller.undo();
  expect(c.tiles('type:lights')).toEqual(order);
});

test('a new device on an own overview is news after two quiet seconds and the layout stays', async () => {
  const c = await connected();
  c.moveFirstLight();
  const before = JSON.stringify(c.state().board);
  c.hub.emit({ type: 'device', device: newSensor() });
  c.run();
  expect(c.state().news).toEqual([]);
  await c.quiet();
  expect(c.state().news).toEqual([{ ref: 'nieuw', kind: 'device', name: 'Bewegingssensor', zoneName: null, suggest: 'security' }]);
  expect(JSON.stringify(c.state().board)).toBe(before);
});

test('news waits while editing and shows after Klaar', async () => {
  const c = await connected();
  c.moveFirstLight();
  c.controller.setEditing(true);
  c.hub.emit({ type: 'device', device: newSensor() });
  c.hub.emit({ type: 'deviceRemoved', deviceId: 'device-2' });
  await c.quiet();
  expect([c.state().news, c.state().gone]).toEqual([[], []]);
  c.controller.setEditing(false);
  expect(c.state().news).toHaveLength(1);
  expect(c.state().gone).toHaveLength(1);
});

test('placeNew puts it in the suggested section, made again when it was removed', async () => {
  const c = await connected();
  c.controller.edit({ type: 'remove-section', dashboardId: 'overview', sectionId: 'type:security' });
  c.hub.emit({ type: 'device', device: newSensor() });
  await c.quiet();
  c.controller.placeNew('nieuw', null);
  const security = c.sectionOf('type:security')!;
  expect(security.tiles).toHaveLength(1);
  expect(security.tiles[0]).toMatchObject({ kind: 'generic', deviceId: 'nieuw', capabilityId: 'alarm_motion' });
  expect(c.overviewSections()!.find((section) => section.id === 'type:security')).toMatchObject({ kind: 'security', column: 'right' });
  expect(c.state().news).toEqual([]);
  c.controller.undo();
  expect(c.sectionOf('type:security')).toBeUndefined();
  expect(c.state().news).toHaveLength(1);
});

test('placeNew puts it in another section, and a new lamp goes left again', async () => {
  const c = await connected();
  c.controller.edit({ type: 'remove-section', dashboardId: 'overview', sectionId: 'type:lights' });
  c.hub.emit({ type: 'device', device: newSensor() });
  c.hub.emit({ type: 'device', device: device({ id: 'lamp', name: 'Lamp', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, value: 1 })] }) });
  await c.quiet();
  c.controller.placeNew('nieuw', 'type:water');
  expect(c.sectionOf('type:water')!.tiles.at(-1)).toMatchObject({ deviceId: 'nieuw' });
  c.controller.placeNew('lamp', null);
  expect(c.overviewSections()!.find((section) => section.id === 'type:lights')).toMatchObject({ column: 'left' });
  expect(c.sectionOf('type:lights')!.tiles).toEqual([expect.objectContaining({ kind: 'light', deviceId: 'lamp', size: 'wide' })]);
  // ids of placed tiles are the layout's own, so the same device can be there twice
  expect(c.sectionOf('type:lights')!.tiles[0]!.id).toMatch(/^t-/);
});

test('placing something that is not news, or in a section that does not exist, changes nothing', async () => {
  const c = await connected();
  c.moveFirstLight();
  const before = c.state().layout;
  c.controller.placeNew('device-1', null);
  c.controller.placeNew('no-such', null);
  c.hub.emit({ type: 'device', device: newSensor() });
  await c.quiet();
  c.controller.placeNew('nieuw', 'own:nowhere');
  expect(c.state().news).toHaveLength(1);
  expect(c.state().layout.dashboards).toEqual(before.dashboards);
});

test('dismissNew makes it known and drops the news', async () => {
  const c = await connected();
  c.moveFirstLight();
  c.hub.emit({ type: 'device', device: newSensor() });
  await c.quiet();
  c.controller.dismissNew('nieuw');
  expect(c.state().news).toEqual([]);
  expect(c.state().layout.known).toContain('nieuw');
  await settle();
  expect(c.configStore.stored().layouts[ID]!.known).toContain('nieuw');
  c.controller.undo();
  expect(c.state().news).toHaveLength(1);
});

test('a removed device hides its tiles; acknowledgeGone removes them; a returning device brings them back', async () => {
  const c = await connected();
  c.moveFirstLight();
  const lamp = c.store.getDevice('device-1')!;
  const order = c.tiles('type:lights');
  c.hub.emit({ type: 'deviceRemoved', deviceId: 'device-1' });
  await c.quiet();
  expect(c.tiles('type:lights')).not.toContain('device-1:light');
  expect(c.state().gone).toEqual([{ ref: 'device-1', name: lamp.name, boards: ['overview'], heroFallback: false }]);
  c.hub.emit({ type: 'device', device: lamp });
  await c.quiet();
  expect(c.state().gone).toEqual([]);
  expect(c.state().news).toEqual([]);
  expect(c.tiles('type:lights')).toEqual(order);
  c.hub.emit({ type: 'deviceRemoved', deviceId: 'device-1' });
  await c.quiet();
  c.controller.acknowledgeGone();
  expect(c.state().gone).toEqual([]);
  expect(JSON.stringify(c.state().layout)).not.toContain('"device-1"');
  c.controller.undo();
  expect(c.state().gone).toHaveLength(1);
});

test('a device removed while editing ends the edit mode without an error', async () => {
  const c = await connected();
  c.controller.setEditing(true);
  c.moveFirstLight();
  c.hub.emit({ type: 'deviceRemoved', deviceId: 'device-1' });
  expect(() => c.run()).not.toThrow();
  c.controller.edit({ type: 'move-tile', dashboardId: 'overview', tileId: 'device-1:light', toSectionId: 'type:water', index: 0 });
  await c.quiet();
  c.controller.setEditing(false);
  expect(c.state().editing).toBe(false);
  expect(c.state().gone.map((g) => g.ref)).toEqual(['device-1']);
});

test('a first edit right after a device was removed does not bring it back', async () => {
  const c = await connected();
  c.hub.emit({ type: 'deviceRemoved', deviceId: 'device-2' });
  c.run();
  c.moveFirstLight();
  await c.quiet();
  expect(c.state().gone).toEqual([]);
  expect(JSON.stringify(c.state().layout.dashboards)).not.toContain('"device-2"');
});

test('resetOverview makes the overview automatic and keeps the other dashboards', async () => {
  const c = await connected();
  c.controller.setSectionSeed('type:lights', '#a6422a');
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-buiten', name: 'Buiten', icon: 'deck', sections: [] } });
  c.moveFirstLight();
  const moved = c.tiles('type:lights');
  c.controller.resetOverview();
  expect(c.overviewSections()).toBeNull();
  expect(c.state().layout.dashboards.map((d) => d.id)).toEqual(['overview', 'd-buiten']);
  expect(c.state().sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
  expect(c.tiles('type:lights')).not.toEqual(moved);
  c.controller.undo();
  expect(c.tiles('type:lights')).toEqual(moved);
});

test('resetting an automatic overview is no step to undo', async () => {
  const c = await connected();
  c.controller.resetOverview();
  expect(c.state().canUndo).toBe(false);
});

test('exportLayout has no key; importLayout replaces layout, theme and colours and counts dropped tiles', async () => {
  const c = await connected();
  c.moveFirstLight();
  c.controller.setSectionSeed('type:lights', '#a6422a');
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-buiten', name: 'Buiten', icon: 'deck', sections: [] } });
  const order = c.tiles('type:lights');
  const file = c.controller.exportLayout(new Date(2026, 10, 23))!;
  expect(file.fileName).toBe('expressive-home-layout-2026-11-23.json');
  expect(file.text).not.toContain('apiKey');
  expect(JSON.parse(file.text)).toMatchObject({ homeyId: ID });

  // the same hub without one lamp, in another browser
  const other = await connected({ hub: (() => { const snap = toSnapshot(camperRaw as unknown as RawHomey); delete snap.devices['device-1']; return fakeHub(snap); })() });
  expect(other.controller.importLayout(file.text)).toEqual({ ok: true, dropped: 1, otherHub: false });
  expect(other.tiles('type:lights')).toEqual(order.filter((id) => id !== 'device-1:light'));
  expect(other.state().layout.dashboards.map((d) => d.name)).toEqual([null, 'Buiten']);
  expect(other.state().sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
  expect(other.state().theme).toEqual(c.state().theme);
  // the dropped tile left the layout: it is not reported as gone as well
  expect(other.state().gone).toEqual([]);
  expect(JSON.stringify(other.state().layout)).not.toContain('"device-1"');
  await settle();
  expect(other.configStore.stored()).toMatchObject({ layouts: { [ID]: other.state().layout }, sectionSeeds: { 'type:lights': '#a6422a' } });
});

test('loading a file can be undone, with the theme and the colours', async () => {
  const c = await connected();
  c.controller.setTheme({ seed: '#3a5ba9', mode: 'dark', density: 'compact' });
  c.controller.setSectionSeed('type:water', '#3a5ba9');
  const file = JSON.parse(c.controller.exportLayout(new Date())!.text) as Record<string, unknown>;
  const text = JSON.stringify({ ...file, homeyId: 'f'.repeat(24), theme: { seed: '#a6422a', mode: 'light', density: 'comfortable' }, sectionSeeds: {} });
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-1', name: 'Een', icon: null, sections: [] } });
  expect(c.controller.importLayout(text)).toEqual({ ok: true, dropped: 0, otherHub: true });
  expect(c.state().theme.seed).toBe('#a6422a');
  expect(c.state().sectionSeeds).toEqual({});
  expect(c.state().layout.dashboards).toHaveLength(1);
  c.controller.undo();
  expect(c.state().theme).toEqual({ seed: '#3a5ba9', mode: 'dark', density: 'compact' });
  expect(c.state().sectionSeeds).toEqual({ 'type:water': '#3a5ba9' });
  expect(c.state().layout.dashboards).toHaveLength(2);
  await settle();
  expect(c.configStore.stored().theme.seed).toBe('#3a5ba9');
});

test('a file with flows that is loaded without a key: with one they are known, also when their tile is taken away', async () => {
  const c = await connected();
  c.moveFirstLight();
  const file = c.controller.exportLayout(new Date())!.text;
  const snap = toSnapshot(camperRaw as unknown as RawHomey);
  snap.flowAccess = 'none';
  const other = await connected({ hub: fakeHub(snap) });
  other.controller.importLayout(file);
  const flows = other.state().layout.known.filter((ref) => ref.startsWith('flow:'));
  expect(flows.length).toBeGreaterThan(0);
  const tile = other.state().layout.dashboards[0]!.sections!.flatMap((s) => s.tiles).find((found) => found.spec.kind === 'flow')!;
  other.controller.edit({ type: 'remove-tile', dashboardId: 'overview', tileId: tile.id });
  other.hub.emit({ type: 'scopes', scopes: other.store.getSnapshot()!.scopes, flowAccess: 'works' });
  other.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS);
  expect(other.state().news).toEqual([]);
});

test('after an import the app knows what is on the hub, so no pile of news', async () => {
  const c = await connected();
  c.moveFirstLight();
  const file = c.controller.exportLayout(new Date())!.text;
  const other = await connected({ extra: [newSensor(), newSensor({ id: 'nieuw2', name: 'Tweede' })] });
  other.controller.importLayout(file);
  expect(other.state().news).toEqual([]);
  other.hub.emit({ type: 'device', device: newSensor({ id: 'nieuw3', name: 'Derde' }) });
  await other.quiet();
  expect(other.state().news.map((n) => n.ref)).toEqual(['nieuw3']);
});

test('a file that is not ours changes nothing', async () => {
  const c = await connected();
  c.moveFirstLight();
  const before = c.state();
  for (const text of ['', '{}', 'geen json']) expect(c.controller.importLayout(text)).toEqual({ ok: false, reason: 'file' });
  expect(c.state().layout).toBe(before.layout);
  expect(c.state().theme).toBe(before.theme);
});

test('another Homey id starts with the automatic overview', async () => {
  const c = await connected();
  c.moveFirstLight();
  await settle();
  const mine = c.configStore.stored().layouts[ID];
  const OTHER = '0'.repeat(24);
  c.hub.getHomeyId.mockReturnValue(OTHER);
  await c.controller.connect(OTHER, 'k2');
  expect(c.overviewSections()).toBeNull();
  expect(c.state().canUndo).toBe(false);
  c.moveFirstLight();
  await settle();
  expect(Object.keys(c.configStore.stored().layouts).sort()).toEqual([OTHER, ID].sort());
  expect(c.configStore.stored().layouts[ID]).toEqual(mine);
  c.hub.getHomeyId.mockReturnValue(ID);
  await c.controller.connect(ID, 'k');
  expect(c.state().layout).toEqual(mine);
});

test('reconnecting to the same hub keeps the edit mode, the open dashboard and undo', async () => {
  const c = await connected();
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-1', name: 'Een', icon: null, sections: [] } });
  c.controller.openBoard('d-1');
  c.controller.setEditing(true);
  c.hub.emit({ type: 'route', route: null });
  c.controller.retry();
  await settle();
  expect(c.state()).toMatchObject({ boardId: 'd-1', editing: true, canUndo: true });
});

test('at start the first dashboard in the rail is open', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  s.configStore.stored().layouts = { [ID]: hubLayout([board('d-buiten', [ownSection('own:s-a')], { name: 'Buiten' }), overview(null)]) };
  await s.controller.start();
  expect(s.controller.getState().boardId).toBe('d-buiten');
  expect(s.controller.getState().board).toMatchObject({ id: 'd-buiten', left: [{ type: 'section', section: { id: 'own:s-a' } }] });
});

test('opening another dashboard leaves the edit mode; an unknown one changes nothing', async () => {
  const c = await connected();
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-1', name: 'Een', icon: null, sections: [] } });
  c.controller.setEditing(true);
  c.controller.openBoard('no-such');
  expect(c.state()).toMatchObject({ boardId: 'overview', editing: true });
  c.controller.openBoard('overview');
  expect(c.state().editing).toBe(true);
  c.controller.openBoard('d-1');
  expect(c.state()).toMatchObject({ boardId: 'd-1', editing: false, board: { id: 'd-1', left: [], right: [] } });
});

test('removing the open dashboard opens the first one', async () => {
  const c = await connected();
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-1', name: 'Een', icon: null, sections: [] } });
  c.controller.openBoard('d-1');
  c.controller.edit({ type: 'remove-dashboard', dashboardId: 'd-1' });
  expect(c.state()).toMatchObject({ boardId: 'overview' });
  expect(c.state().board!.id).toBe('overview');
});

test('leaving the dashboard turns the edit mode off', async () => {
  const c = await connected();
  c.controller.setEditing(true);
  c.controller.changeConnection();
  expect(c.state().editing).toBe(false);
});

test('a change from another tab is taken over', async () => {
  const c = await connected();
  c.moveFirstLight();
  await settle();
  const stored = c.configStore.stored();
  stored.layouts[ID]!.dashboards.push({ id: 'd-x', name: 'Ander tabblad', icon: null, sections: [] });
  stored.theme = { seed: '#a6422a', mode: 'dark', density: 'compact' };
  await c.controller.reloadStored();
  expect(c.state().layout.dashboards.map((d) => d.name)).toEqual([null, 'Ander tabblad']);
  expect(c.state().theme.seed).toBe('#a6422a');
  // saving here does not undo the other tab's change, and the connection stays
  c.controller.setSectionSeed('type:lights', '#3a5ba9');
  await settle();
  expect(c.configStore.stored().layouts[ID]!.dashboards).toHaveLength(2);
  expect(c.configStore.stored().connection.apiKey).toBe('k');
  expect(c.state().phase).toBe('dashboard');
});

test('a stored layout of another tab does not reach the example hub', async () => {
  const s = setup();
  await s.controller.start();
  await s.controller.startDemo();
  s.configStore.stored().layouts = { [ID]: hubLayout([overview([])]) };
  await s.controller.reloadStored();
  expect(s.controller.getState().layout.dashboards[0]!.sections).toBeNull();
});

test('switching the language redraws the board in that language', async () => {
  const c = await connected();
  c.moveFirstLight();
  const layout = c.state().layout;
  c.controller.setLanguage('en');
  expect(c.state().layout).toEqual(layout);
  expect(c.state().board).not.toBeNull();
});

test('newId gives a fresh id of the layout', async () => {
  const c = await connected();
  expect(c.controller.newId('d')).toMatch(/^d-[0-9a-z]{8}$/);
});

test('a place in a section counts the tiles that are shown, also when some are hidden', async () => {
  const c = await connected();
  c.moveFirstLight();
  const order = c.tiles('type:lights');
  const hidden = order[0]!;
  c.hub.emit({ type: 'deviceRemoved', deviceId: hidden.split(':')[0]! });
  await c.quiet();
  const shown = c.tiles('type:lights');
  expect(shown).toEqual(order.slice(1));
  // the last shown one to the first place that is shown: it stays behind the hidden one
  const last = shown.at(-1)!;
  c.controller.edit({ type: 'move-tile', dashboardId: 'overview', tileId: last, toSectionId: 'type:lights', index: 0 });
  expect(c.tiles('type:lights')).toEqual([last, ...shown.slice(0, -1)]);
  // one place further: between the first and second shown
  c.controller.edit({ type: 'move-tile', dashboardId: 'overview', tileId: last, toSectionId: 'type:lights', index: 1 });
  expect(c.tiles('type:lights')).toEqual([shown[0], last, ...shown.slice(1, -1)]);
  c.controller.edit({ type: 'move-tile', dashboardId: 'overview', tileId: last, toSectionId: 'type:lights', index: 99 });
  expect(c.tiles('type:lights')).toEqual(shown);
  expect(c.overviewSections()!.find((section) => section.id === 'type:lights')!.tiles.map((tile) => tile.id)).toContain(hidden);
});

test('typing a name is one step to undo', async () => {
  const c = await connected();
  const id = c.tiles('type:lights')[0]!;
  for (const label of ['B', 'Bo', 'Bov']) c.controller.edit({ type: 'set-tile', dashboardId: 'overview', tileId: id, patch: { label } }, `label:${id}`);
  expect(c.sectionOf('type:lights')!.tiles[0]!.label).toBe('Bov');
  c.controller.edit({ type: 'set-tile', dashboardId: 'overview', tileId: id, patch: { size: 'single' } });
  c.controller.edit({ type: 'set-tile', dashboardId: 'overview', tileId: id, patch: { label: 'Boven' } }, `label:${id}`);
  c.controller.undo();
  expect(c.sectionOf('type:lights')!.tiles[0]).toMatchObject({ label: 'Bov', size: 'single' });
  c.controller.undo();
  c.controller.undo();
  expect(c.overviewSections()).toBeNull();
  expect(c.state().canUndo).toBe(false);
});

// ----- found by the review of the whole branch -----

test('a big hub keeps all its tiles after the first edit and a reload', async () => {
  const c = await connected();
  const plug = structuredClone(c.store.getDevice('device-8')!);
  for (let i = 0; i < 250; i += 1) c.hub.emit({ type: 'device', device: { ...plug, id: `x-${i}`, name: `Stekker ${i}` } });
  await c.quiet();
  const shown = c.tiles('type:switches').length;
  expect(shown).toBeGreaterThan(250);
  c.controller.edit({ type: 'set-section', dashboardId: 'overview', sectionId: 'type:lights', name: 'Licht', icon: null });
  await settle();
  const again = createLocalConfigStore({ getItem: () => JSON.stringify(c.configStore.stored()), setItem: () => {}, removeItem: () => {} });
  const layout = (await again.load()).layouts[ID]!;
  expect(layout.dashboards[0]!.sections!.find((section) => section.id === 'type:switches')!.tiles).toHaveLength(shown);
});

test('while the hub cannot be reached at the start the stored layout is there to save, and loading says why not', async () => {
  const saved = hubLayout([overview([ownSection('own:a')]), board('d-1', [], { name: 'Buiten' })]);
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  s.configStore.stored().layouts = { [ID]: saved };
  s.hub.failWith = new Error('away');
  await s.controller.start();
  expect(s.controller.getState()).toMatchObject({ phase: 'connecting', startUnreachable: true, board: null });
  expect(s.controller.getState().layout.dashboards.map((d) => d.id)).toEqual(['overview', 'd-1']);
  const file = s.controller.exportLayout(new Date())!;
  expect(JSON.parse(file.text)).toMatchObject({ homeyId: ID, dashboards: [{ id: 'overview' }, { id: 'd-1', name: 'Buiten' }] });
  expect(s.controller.importLayout(file.text)).toEqual({ ok: false, reason: 'offline' });
  // and once it is there, nothing was lost
  s.hub.failWith = null;
  s.controller.retry();
  await settle();
  expect(s.controller.getState().layout.dashboards.map((d) => d.id)).toEqual(['overview', 'd-1']);
});

test('without a hub that is known there is nothing to save', async () => {
  const s = setup({ saved: { localAddress: '192.168.1.20', apiKey: 'k' } });
  s.hub.failWith = new Error('away');
  await s.controller.start();
  expect(s.controller.exportLayout(new Date())).toBeNull();
});

test('a group of edits ends when the edit mode or the dashboard changes', async () => {
  const c = await connected();
  c.controller.setEditing(true);
  const id = c.tiles('type:lights')[0]!;
  const label = (text: string) => c.controller.edit({ type: 'set-tile', dashboardId: 'overview', tileId: id, patch: { label: text } }, 'label');
  const now = () => c.state().layout.dashboards[0]!.sections?.flatMap((section) => section.tiles).find((tile) => tile.id === id)?.label;
  label('K');
  label('Keuken');
  c.controller.setEditing(false);
  c.controller.setEditing(true);
  label('Keuken 2');
  c.controller.undo();
  expect(now()).toBe('Keuken');
  label('Keuken 3');
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-1', name: 'Buiten', icon: null, sections: [] } });
  c.controller.openBoard('d-1');
  c.controller.openBoard('overview');
  label('Keuken 4');
  c.controller.undo();
  expect(now()).toBe('Keuken 3');
});

test('every step to undo has a number of its own, and undoing opens the dashboard it changes', async () => {
  const c = await connected();
  expect(c.state().undoId).toBeNull();
  c.moveFirstLight();
  const first = c.state().undoId;
  c.controller.edit({ type: 'add-dashboard', dashboard: { id: 'd-1', name: 'Buiten', icon: null, sections: [] } });
  expect(c.state().undoId).not.toBe(first);
  c.controller.openBoard('d-1');
  c.controller.setEditing(true);
  c.controller.edit({ type: 'set-section', dashboardId: 'overview', sectionId: 'type:lights', name: 'Licht', icon: null });
  c.controller.undo();
  expect(c.state()).toMatchObject({ boardId: 'overview', editing: true });
  // a dashboard that comes back opens
  c.controller.edit({ type: 'remove-dashboard', dashboardId: 'd-1' });
  c.controller.undo();
  expect(c.state().boardId).toBe('d-1');
  // what is undone on the open dashboard leaves it open
  c.controller.edit({ type: 'set-dashboard', dashboardId: 'd-1', name: 'Tuin', icon: null });
  c.controller.undo();
  expect(c.state().boardId).toBe('d-1');
});

test('what is saved just before disconnecting is kept, and the key is gone', async () => {
  const c = await connected();
  c.moveFirstLight();
  c.controller.setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  void c.controller.disconnect();
  for (let i = 0; i < 5; i += 1) await settle();
  expect(c.configStore.stored().connection).toEqual({ homeyId: null, localAddress: null, apiKey: null });
  expect(c.configStore.stored().theme).toEqual({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  expect(c.configStore.stored().layouts[ID]!.dashboards[0]!.sections).not.toBeNull();
});

// ----- the small points of the review -----

test('OK does not take away a device that came back a moment ago', async () => {
  const c = await connected();
  c.moveFirstLight();
  const id = c.tiles('type:lights')[0]!;
  const deviceId = id.split(':')[0]!;
  const back = structuredClone(c.store.getDevice(deviceId)!);
  c.hub.emit({ type: 'deviceRemoved', deviceId });
  await c.quiet();
  expect(c.state().gone.map((g) => g.ref)).toEqual([deviceId]);
  c.hub.emit({ type: 'device', device: back });
  c.run();
  c.controller.acknowledgeGone();
  await c.quiet();
  expect(c.tiles('type:lights')).toContain(id);
  expect(c.state().gone).toEqual([]);
});

test('a file loaded in the example hub changes nothing that is kept; leaving it brings the own look back', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'k' } });
  await s.controller.start();
  s.controller.setTheme({ seed: '#3a5ba9', mode: 'light', density: 'comfortable' });
  s.controller.setSectionSeed('type:water', '#a6422a');
  await settle();
  await s.controller.startDemo();
  s.run();
  const file = JSON.stringify({ format: 'expressive-home-layout', version: 1, homeyId: '', dashboards: [{ id: 'overview', name: null, icon: null, sections: null }], theme: { seed: '#a6422a', mode: 'dark', density: 'compact' }, sectionSeeds: { 'type:lights': '#3b6939' } });
  expect(s.controller.importLayout(file)).toMatchObject({ ok: true });
  await settle();
  expect(s.controller.getState()).toMatchObject({ theme: { seed: '#a6422a' }, sectionSeeds: { 'type:lights': '#3b6939' } });
  expect(s.configStore.stored()).toMatchObject({ theme: { seed: '#3a5ba9' }, sectionSeeds: { 'type:water': '#a6422a' } });
  // what the owner chooses by hand there is kept, as always; what the file brought is not
  s.controller.setTheme({ seed: '#6750a4', mode: 'dark', density: 'compact' });
  await settle();
  expect(s.configStore.stored()).toMatchObject({ theme: { seed: '#6750a4' }, sectionSeeds: { 'type:water': '#a6422a' } });
  s.controller.leaveDemo();
  expect(s.controller.getState()).toMatchObject({ theme: { seed: '#6750a4' }, sectionSeeds: { 'type:water': '#a6422a' } });
});

// ----- the dashboard to start with -----

const HUB = '5f2a00000000000000000c81';
async function startedWith(startBoard: string | null, layout: ReturnType<typeof hubLayout> | null) {
  const s = setup({ saved: { homeyId: HUB, apiKey: 'k' } });
  if (layout) s.configStore.stored().layouts = { [HUB]: layout };
  s.configStore.stored().startBoard = startBoard;
  await s.controller.start();
  return s;
}
const two = () => hubLayout([overview([ownSection('own:a')]), board('d-1', [])]);

test('a device starts with the dashboard it was told to', async () => {
  const s = await startedWith('d-1', two());
  expect([s.controller.getState().boardId, s.controller.getState().startBoard]).toEqual(['d-1', 'd-1']);
  expect((await startedWith(null, two())).controller.getState().boardId).toBe('overview');
  // the first in the list, when it is told nothing
  expect((await startedWith(null, hubLayout([board('d-1', []), overview([ownSection('own:a')])]))).controller.getState().boardId).toBe('d-1');
});

test('a dashboard that is not there any more is not started with; nothing is said about it', async () => {
  const s = await startedWith('d-gone', two());
  expect([s.controller.getState().boardId, s.notify.mock.calls.length]).toEqual(['overview', 0]);
});

test('choosing it changes nothing on the screen, is saved, and is not changed by opening another', async () => {
  const s = await startedWith(null, two());
  s.controller.setStartBoard('d-1');
  await settle();
  expect([s.controller.getState().boardId, s.controller.getState().startBoard, s.configStore.stored().startBoard]).toEqual(['overview', 'd-1', 'd-1']);
  s.controller.openBoard('overview');
  s.controller.openBoard('d-1');
  await settle();
  expect(s.configStore.stored().startBoard).toBe('d-1');
  s.controller.setStartBoard(null);
  await settle();
  expect([s.controller.getState().startBoard, s.configStore.stored().startBoard]).toEqual([null, null]);
});

test('dashboards that come later, when the hub was away at the start, begin where they should', async () => {
  const s = await startedWith('d-1', null);
  expect(s.controller.getState().boardId).toBe('overview');
  s.configStore.stored().layouts = { [HUB]: two() };
  await s.controller.reloadStored();
  expect(s.controller.getState().boardId).toBe('d-1');
  // but not under the finger of someone who looks at another, nor another time
  s.controller.openBoard('overview');
  s.configStore.stored().layouts = { [HUB]: hubLayout([overview([ownSection('own:b')]), board('d-1', [])]) };
  await s.controller.reloadStored();
  expect(s.controller.getState().boardId).toBe('overview');
  const other = await startedWith('d-1', two());
  other.controller.openBoard('overview');
  other.configStore.stored().layouts = { [HUB]: hubLayout([overview([ownSection('own:b')]), board('d-1', [])]) };
  await other.controller.reloadStored();
  expect(other.controller.getState().boardId).toBe('overview');
});

// ----- the wall tablet -----

const ON = { ...defaultWall(), on: true };

test('what is of this device is there from the first moment, before the settings are read', async () => {
  const mine = { theme: { seed: '#a6422a', mode: 'dark' as const, density: 'compact' as const }, language: 'en' as const, startBoard: 'd-1', wall: ON };
  const s = setup({ peek: () => mine });
  expect(s.controller.getState()).toMatchObject({ phase: 'connecting', theme: mine.theme, startBoard: 'd-1', wall: ON, language: { choice: 'en', active: 'en' } });
  expect(setup().controller.getState().wall).toEqual(defaultWall());
  // a store that cannot say it at once
  const broken = setup({ peek: () => { throw new Error('denied'); } });
  expect(broken.controller.getState().wall).toEqual(defaultWall());
});

test('what is set up for a wall tablet is shown and saved', async () => {
  const s = await startedWith(null, two());
  s.controller.setWall(ON);
  expect(s.controller.getState().wall).toEqual(ON);
  await settle();
  expect(s.configStore.stored().wall).toEqual(ON);
  expect(s.configStore.stored().connection.apiKey).toBe('k');
});

test('what is set up while the settings are still being read goes over them', async () => {
  const s = setup({ saved: { homeyId: HUB, apiKey: 'k' } });
  const started = s.controller.start();
  s.controller.setWall(ON);
  await started;
  await settle();
  expect([s.controller.getState().wall, s.configStore.stored().wall]).toEqual([ON, ON]);
});

test('another tab sets it up: this one follows', async () => {
  const s = await startedWith(null, two());
  s.configStore.stored().wall = ON;
  await s.controller.reloadStored();
  expect(s.controller.getState().wall).toEqual(ON);
});

test('the example hub keeps nothing of a wall tablet', async () => {
  const s = setup();
  s.configStore.stored().wall = { ...defaultWall(), after: 10 };
  await s.controller.start();
  await s.controller.startDemo();
  expect(s.controller.getState()).toMatchObject({ wall: { after: 10, on: false }, hubId: 'demo' });
  const tried = withWallHub({ ...ON, after: 1 }, 'demo', { ...emptyWallHub(), tanks: { t: 'low' } });
  s.controller.setWall(tried);
  expect(s.controller.getState().wall).toEqual(tried);
  s.controller.setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  await settle();
  expect(s.configStore.stored()).toMatchObject({ theme: { seed: '#a6422a' }, wall: { ...defaultWall(), after: 10 } });
  await s.controller.reloadStored();
  expect(s.controller.getState().wall).toEqual(tried);
  s.controller.leaveDemo();
  expect(s.controller.getState().wall).toEqual({ ...defaultWall(), after: 10 });
  await s.controller.startDemo();
  expect(s.controller.getState().wall).toEqual({ ...defaultWall(), after: 10 });
});

test('the hub whose choices count is the one that is open, also before it answers', async () => {
  const hub = fakeHub();
  hub.manual = true;
  const s = setup({ saved: { homeyId: HUB.toUpperCase(), apiKey: 'k' }, hub });
  expect(s.controller.getState().hubId).toBeNull();
  void s.controller.start();
  await settle();
  expect(s.controller.getState()).toMatchObject({ phase: 'connecting', hubId: HUB });
  hub.finish();
  await settle();
  expect(s.controller.getState()).toMatchObject({ phase: 'dashboard', hubId: HUB });
  await s.controller.disconnect();
  expect(s.controller.getState().hubId).toBeNull();
});

test('the dashboard this device starts with opens again, the first when there is none', async () => {
  const s = await startedWith('d-1', two());
  s.controller.openBoard('overview');
  s.controller.openStart();
  expect(s.controller.getState().boardId).toBe('d-1');
  s.controller.setStartBoard('d-gone');
  s.controller.openStart();
  expect(s.controller.getState().boardId).toBe('overview');
  // without a hub there is nothing to open
  const none = setup();
  none.controller.openStart();
  expect(none.controller.getState().board).toBeNull();
});

test('opening the dashboard this device starts with does not settle where to begin, while its dashboards are still to come', async () => {
  const s = await startedWith('d-1', null);
  s.controller.openStart();
  s.configStore.stored().layouts = { [HUB]: two() };
  await s.controller.reloadStored();
  expect(s.controller.getState().boardId).toBe('d-1');
});

test('a page of the app on the hub says what to do with flows that cannot be started', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'sleutel' }, scopes: ['homey.device'] });
  s.deps.served = true;
  await s.controller.start();
  await s.controller.actions.startFlow('f', 'flow');
  expect(s.notify.mock.calls.at(-1)![0].text).toContain('Geef ze een knop met de flowkaart van Expressive Home');
  s.hub.emit({ type: 'scopes', scopes: ['homey.device'], flowAccess: 'refused' });
  await s.controller.actions.startFlow('f', 'flow');
  expect(s.notify.mock.calls.at(-1)![0].text).toContain('accepteert de sleutel voor flows niet meer');
  // a button needs no right
  expect(await s.controller.actions.startFlow('button:film', 'flow')).toBe(true);
  expect(s.hub.startFlow).toHaveBeenCalledWith({ id: 'button:film', kind: 'flow' });
});

test('a key that comes or goes changes what the automatic Overzicht offers', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'sleutel' } });
  s.deps.served = true;
  const connect = s.hub.connect.getMockImplementation()!;
  const button = { id: 'button:film', name: 'Film', kind: 'flow' as const, startable: true };
  s.hub.connect.mockImplementation(async () => { const found = await connect(); return { ...found, flows: [button, ...found.flows], flowAccess: 'none' as const }; });
  await s.controller.start();
  await settle();
  const flows = () => s.controller.getState().dashboard!.sections.find((section) => section.kind === 'flows')?.tiles.map((tile) => tile.id);
  expect(flows()).toEqual(['flow:button:film']);
  const { scopes } = s.store.getSnapshot()!;
  s.hub.emit({ type: 'scopes', scopes, flowAccess: 'works' });
  s.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS);
  expect(flows()!.length).toBeGreaterThan(1);
  expect(flows()![0]).toBe('flow:button:film');
  s.hub.emit({ type: 'scopes', scopes, flowAccess: 'none' });
  s.run();
  await vi.advanceTimersByTimeAsync(REBUILD_QUIET_MS);
  expect(flows()).toEqual(['flow:button:film']);
});

test('rights that change while the page is open count at once', async () => {
  const s = setup({ saved: { homeyId: ID, apiKey: 'sleutel' }, scopes: ['homey.device', 'homey.zone', 'homey.flow.readonly', 'homey.insights', 'homey.system'] });
  await s.controller.start();
  await settle();
  const flow = s.store.getSnapshot()!.flows.find((f) => f.startable)!;
  expect([s.controller.status().canStartFlows, await s.controller.actions.startFlow(flow.id, flow.kind)]).toEqual([false, false]);
  expect(s.notify.mock.calls.at(-1)![0].text).toBe('Deze sleutel mag geen flows starten.');
  s.hub.emit({ type: 'scopes', scopes: ['homey'] });
  expect([s.controller.status().canStartFlows, await s.controller.actions.startFlow(flow.id, flow.kind), s.controller.getState().missing]).toEqual([true, true, []]);
});
