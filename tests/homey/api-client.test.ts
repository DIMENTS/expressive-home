import { expect, test, vi } from 'vitest';
import type { ClientEvent, HistorySource } from '../../src/homey/client';
import { recordedLogId } from '../../src/homey/history';
import type { Device } from '../../src/homey/types';
import { createHomeyApiClient, LIVENESS_INTERVAL_MS, RECOVERY_DELAYS_MS, SILENCE_REOPEN_MS, type ApiClientDeps, type HomeyApiLib } from '../../src/homey/api-client';
import { CLOUD_TIMEOUT_MS, LOCAL_RECHECK_MS } from '../../src/homey/routes';

function fakeLib(options: { sessionError?: Error; controlError?: Error; flowsError?: Error; flowsGate?: Promise<void>; authErrorFromInstance?: number; /** Makes getDevices() fail from the second call on. */ devicesError?: Error; systemInfo?: { wifiAddress?: unknown }; systemError?: Error; insightsError?: Error } = {}) {
  let deviceReads = 0;
  const calls: unknown[] = []; const ids: unknown[] = []; const destroyed: number[] = []; const state = { devices: null as Record<string, unknown> | null, devicesGate: null as Promise<void> | null, sessionHook: null as ((index: number) => Promise<void>) | null, flowsGateFor: null as ((index: number) => Promise<void>) | null }; const subscriptions: string[] = []; const instances: { fire(event: string): void }[] = []; const capabilityListeners = new Map<string, (v: unknown) => void>(); const managerListeners = new Map<string, (d: unknown) => void>();
  const rawLamp = { id: 'd1', name: 'Lamp', class: 'light', capabilities: ['onoff'], capabilitiesObj: { onoff: { id: 'onoff', title: 'Aan', type: 'boolean', getable: true, setable: true, value: false } },
    makeCapabilityInstance: (id: string, fn: (v: unknown) => void) => { capabilityListeners.set(`d1:${id}`, fn); subscriptions.push(`d1:${id}`); return { destroy() {} }; } };
  class HomeyAPIV3Local {
    private handlers = new Map<string, () => void>();
    private index: number;
    constructor(init: { baseUrl: string; properties: { id: unknown } }) { calls.push(['new', init.baseUrl]); ids.push(init.properties.id); this.index = instances.length; instances.push({ fire: (event) => this.handlers.get(event)?.() }); }
    on(event: string, fn: () => void) { this.handlers.set(event, fn); }
    sessions = { getSessionMe: async () => { if (state.sessionHook) await state.sessionHook(this.index); if (options.sessionError) throw options.sessionError; if (options.authErrorFromInstance !== undefined && this.index >= options.authErrorFromInstance) throw Object.assign(new Error('denied'), { statusCode: 401 }); return { intersectedScopes: ['homey'] }; } };
    devices = { getDevices: async () => { calls.push(['getDevices']); deviceReads += 1; if (options.devicesError && deviceReads > 1) throw options.devicesError; const gate = state.devicesGate; state.devicesGate = null; if (gate) await gate; return state.devices ?? { d1: rawLamp }; }, connect: async () => { calls.push(['connect']); }, on: (e: string, fn: (d: unknown) => void) => { managerListeners.set(e, fn); },
      setCapabilityValue: async (args: unknown) => { if (options.controlError) throw options.controlError; calls.push(['set', args]); } };
    zones = { getZones: async () => ({}) };
    system = { getInfo: async () => { if (options.systemError) throw options.systemError; return options.systemInfo ?? {}; } };
    flow = { getFlows: async () => { if (options.flowsGate) await options.flowsGate; if (state.flowsGateFor) await state.flowsGateFor(this.index); if (options.flowsError) throw options.flowsError; return { f1: { id: 'f1', name: 'Alles uit' } }; }, getAdvancedFlows: async () => ({}), triggerFlow: async (a: unknown) => { calls.push(['flow', a]); }, triggerAdvancedFlow: async (a: unknown) => { calls.push(['advanced', a]); } };
    insights = {
      getLogs: async () => { if (options.insightsError) throw options.insightsError; return { a: { id: 'homey:device:d1:measure_power', type: 'number' }, b: { id: 'cpu', ownerUri: 'homey:manager:system', type: 'number' }, c: { id: 'onoff', ownerUri: 'homey:device:d1', type: 'boolean' }, r: { id: `homey:app:app.expressive.home:${recordedLogId('d2', 'ac_input_source')}`, type: 'number' } }; },
      getLogEntries: async (args: { id: string; resolution?: string }) => {
        calls.push(['entries', args]);
        if (options.insightsError) throw options.insightsError;
        if (args.id.endsWith(':onoff')) return { id: 'x', values: [{ t: '2026-11-22T10:05:00.000Z', v: false }, { t: '2026-11-22T10:00:00.000Z', v: true }] };
        if (args.resolution === 'lastYear') return { step: 21_600_000, values: [{ t: '2026-01-02T00:00:00.000Z', v: 1 }] };
        return { step: 300_000, values: [{ t: '2026-11-22T10:05:00.000Z', v: 5 }, { t: '2026-11-22T10:00:00.000Z', v: null }] };
      },
    };
    destroy() { calls.push(['destroy']); destroyed.push(this.index); }
  }
  return { lib: { HomeyAPIV3Local } as unknown as HomeyApiLib, calls, ids, capabilityListeners, managerListeners, state, instances, destroyed, subscriptions };
}
const ID = '64a1b2c3d4e5f60718293a4b';
const OTHER = '0123456789abcdef01234567';
const deps = (fetchFn: typeof fetch): ApiClientDeps => ({ fetch: fetchFn, setInterval: () => 1, clearInterval: () => {}, addOnlineListener: () => () => {}, now: () => 0, setTimeout: () => 1, clearTimeout: () => {} });
const localOk = (() => Promise.resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': ID } }))) as unknown as typeof fetch;
const settings = { homeyId: ID, localAddress: '192.168.1.50', apiKey: 'k' };

test('connect maps the snapshot and reports the route', async () => {
  const { lib, calls } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  const snap = await client.connect();
  expect(snap).toMatchObject({ homeyId: ID, scopes: ['homey'] });
  expect(snap.devices['d1']?.deviceClass).toBe('light');
  expect(calls[0]).toEqual(['new', 'https://192-168-1-50.homey.homeylocal.com']);
  expect(events).toContainEqual({ type: 'route', route: 'local' });
  expect(client.getHomeyId()).toBe(ID);
});
test('the homey id is null before connect', () => {
  expect(createHomeyApiClient(fakeLib().lib, settings, deps(localOk)).getHomeyId()).toBeNull();
});
test('live capability values become events', async () => {
  const { lib, capabilityListeners } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  capabilityListeners.get('d1:onoff')?.(true);
  expect(events).toContainEqual({ type: 'capability', deviceId: 'd1', capabilityId: 'onoff', value: true, at: expect.any(String) });
});
test('control and flows call the library with the documented arguments', async () => {
  const { lib, calls } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  await client.connect();
  await client.setCapability('d1', 'onoff', true);
  await client.startFlow({ id: 'f1', kind: 'flow' });
  await client.startFlow({ id: 'f2', kind: 'advanced' });
  expect(calls).toContainEqual(['set', { deviceId: 'd1', capabilityId: 'onoff', value: true }]);
  expect(calls).toContainEqual(['flow', { id: 'f1' }]);
  expect(calls).toContainEqual(['advanced', { id: 'f2' }]);
});
test('connection failures are typed', async () => {
  const unreachable = (() => Promise.reject(new TypeError('x'))) as unknown as typeof fetch;
  await expect(createHomeyApiClient(fakeLib().lib, settings, deps(unreachable)).connect()).rejects.toMatchObject({ failure: 'unreachable' });
  const noId = (() => Promise.resolve(new Response('true', { status: 200 }))) as unknown as typeof fetch;
  await expect(createHomeyApiClient(fakeLib().lib, { homeyId: null, localAddress: '192.168.1.50', apiKey: 'k' }, deps(noId)).connect()).rejects.toMatchObject({ failure: 'homey-id-unknown' });
});
test('a rejected key is an auth failure, also in the middle of a session', async () => {
  const denied = Object.assign(new Error('denied'), { statusCode: 401 });
  await expect(createHomeyApiClient(fakeLib({ sessionError: denied }).lib, settings, deps(localOk)).connect()).rejects.toMatchObject({ failure: 'auth' });

  const client = createHomeyApiClient(fakeLib({ controlError: denied }).lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  await expect(client.setCapability('d1', 'onoff', true)).rejects.toBe(denied);
  expect(events).toContainEqual({ type: 'authError' });
});
test('a read without the right gives an empty collection', async () => {
  const forbidden = Object.assign(new Error('forbidden'), { statusCode: 403 });
  const snap = await createHomeyApiClient(fakeLib({ flowsError: forbidden }).lib, settings, deps(localOk)).connect();
  expect(snap.flows).toEqual([]);
  expect(Object.keys(snap.devices)).toEqual(['d1']);
});
test('device changes and removals become events', async () => {
  const { lib, managerListeners } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  managerListeners.get('device.update')?.({ id: 'd1', name: 'Nieuwe naam', class: 'light', capabilities: [], capabilitiesObj: {} });
  managerListeners.get('device.delete')?.({ id: 'd1' });
  expect(events).toContainEqual({ type: 'device', device: expect.objectContaining({ id: 'd1', name: 'Nieuwe naam' }) });
  expect(events).toContainEqual({ type: 'deviceRemoved', deviceId: 'd1' });
});
test('on the cloud route the client moves to local when it becomes reachable', async () => {
  let localUp = false; let tick!: () => void;
  const fetchFn = ((url: string) => (String(url).includes('homeylocal')
    ? (localUp ? Promise.resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': ID } })) : Promise.reject(new TypeError('x')))
    : Promise.resolve(new Response('true', { status: 200 })))) as unknown as typeof fetch;
  const { lib, calls } = fakeLib();
  const client = createHomeyApiClient(lib, settings, { fetch: fetchFn, setInterval: (fn, ms) => { if (ms === LOCAL_RECHECK_MS) tick = fn; return 1; }, clearInterval: () => {}, addOnlineListener: () => () => {}, now: () => 0, setTimeout: () => 1, clearTimeout: () => {} });
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  expect(calls[0]).toEqual(['new', `https://${ID}.connect.athom.com`]);
  localUp = true; tick();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  expect(calls).toContainEqual(['new', 'https://192-168-1-50.homey.homeylocal.com']);
  expect(calls).toContainEqual(['destroy']);
});
test('disconnect destroys the library instance and silences listeners', async () => {
  const { lib, calls, capabilityListeners } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  client.disconnect();
  expect(calls).toContainEqual(['destroy']);
  const before = events.length;
  capabilityListeners.get('d1:onoff')?.(true);
  expect(events.length).toBe(before);
});
test('the api key never shows up in an error', async () => {
  const unreachable = (() => Promise.reject(new TypeError('x'))) as unknown as typeof fetch;
  const error = await createHomeyApiClient(fakeLib().lib, { ...settings, apiKey: 'secret-key' }, deps(unreachable)).connect().catch((e: Error) => e);
  expect(String((error as Error).message)).not.toContain('secret-key');
});
test('disconnect while the route probe is pending: connect rejects and no instance is built', async () => {
  let release!: () => void;
  const slow = (() => new Promise<Response>((resolve) => { release = () => resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': ID } })); })) as unknown as typeof fetch;
  const { lib, calls } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(slow));
  const pending = client.connect();
  const outcome = expect(pending).rejects.toMatchObject({ failure: 'unreachable' });
  client.disconnect();
  release();
  await outcome;
  expect(calls).toEqual([]);
  expect(client.getHomeyId()).toBeNull();
});
test('disconnect while the library instance is opening destroys it', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const { lib, calls } = fakeLib({ flowsGate: gate });
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  const pending = client.connect();
  const outcome = expect(pending).rejects.toMatchObject({ failure: 'unreachable' });
  await vi.waitFor(() => expect(calls).toContainEqual(['new', 'https://192-168-1-50.homey.homeylocal.com']));
  client.disconnect();
  release();
  await outcome;
  expect(calls).toContainEqual(['destroy']);
  expect(events.some((e) => e.type === 'route')).toBe(false);
  expect(client.getHomeyId()).toBeNull();
  await expect(client.setCapability('d1', 'onoff', true)).rejects.toThrow();
  expect(calls.some((c) => (c as unknown[])[0] === 'set')).toBe(false);
});

// ---- connection loss and recovery ----
function timers() {
  const intervals: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const timeouts: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const onlines: { fn: () => void; removed: boolean }[] = [];
  const probes = { count: 0 };
  const net = { local: true, cloud: true };
  const clock = { now: 0 };
  const fetchFn = ((url: string) => {
    probes.count += 1;
    const isLocal = String(url).includes('homeylocal');
    if (isLocal ? !net.local : !net.cloud) return Promise.reject(new TypeError('x'));
    return Promise.resolve(new Response('true', { status: 200, headers: isLocal ? { 'X-Homey-ID': ID } : {} }));
  }) as unknown as typeof fetch;
  const d: ApiClientDeps = {
    fetch: fetchFn,
    setInterval: (fn, ms) => { intervals.push({ fn, ms, cleared: false }); return intervals.length - 1; },
    clearInterval: (h) => { const i = intervals[h as number]; if (i) i.cleared = true; },
    addOnlineListener: (fn) => { const l = { fn, removed: false }; onlines.push(l); return () => { l.removed = true; }; },
    setTimeout: (fn, ms) => { timeouts.push({ fn, ms, cleared: false }); return timeouts.length - 1; },
    clearTimeout: (h) => { const t = timeouts[h as number]; if (t) t.cleared = true; },
    now: () => clock.now,
  };
  const recovery = () => timeouts.at(-1);
  const watcher = () => intervals.find((i) => i.ms === LOCAL_RECHECK_MS);
  const liveness = () => intervals.find((i) => i.ms === LIVENESS_INTERVAL_MS && !i.cleared);
  const liveWatchers = () => intervals.filter((i) => i.ms === LOCAL_RECHECK_MS && !i.cleared).length;
  const liveRecoveries = () => timeouts.filter((t) => !t.cleared).length;
  return { d, net, clock, intervals, timeouts, onlines, probes, recovery, watcher, liveness, liveWatchers, liveRecoveries };
}
async function connected(libOptions: Parameters<typeof fakeLib>[0] = {}, startOnCloud = false) {
  const f = fakeLib(libOptions); const t = timers();
  if (startOnCloud) t.net.local = false;
  const client = createHomeyApiClient(f.lib, settings, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  events.length = 0;
  return { ...f, ...t, client, events };
}
const newCount = (calls: unknown[]) => calls.filter((c) => (c as unknown[])[0] === 'new').length;

test('losing the live connection reports no route and starts the recovery timer', async () => {
  const { instances, events, recovery } = await connected();
  instances[0]?.fire('disconnect');
  expect(events).toEqual([{ type: 'route', route: null }]);
  expect(recovery()).toBeDefined();
  instances[0]?.fire('disconnect');
  expect(events).toHaveLength(1);
});
test('a recovery tick switches to the cloud when local is gone', async () => {
  const { instances, events, calls, net, recovery, watcher } = await connected();
  instances[0]?.fire('disconnect');
  net.local = false;
  recovery()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'cloud' }));
  expect(calls).toContainEqual(['new', `https://${ID}.connect.athom.com`]);
  expect(calls).toContainEqual(['destroy']);
  const kinds = events.map((e) => e.type);
  expect(kinds.indexOf('device')).toBeLessThan(kinds.lastIndexOf('route'));
  expect(recovery()?.cleared).toBe(true);
  expect(watcher()).toBeDefined();
});
test('the library recovering by itself resyncs and reports the route again', async () => {
  const { instances, events, calls, recovery } = await connected();
  instances[0]?.fire('disconnect');
  instances[0]?.fire('connect');
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  expect(events.map((e) => e.type)).toEqual(['route', 'device', 'route']);
  expect(recovery()?.cleared).toBe(true);
  expect(newCount(calls)).toBe(1);
});
test('a connect event while not recovering does nothing', async () => {
  const { instances, events } = await connected();
  instances[0]?.fire('connect');
  await new Promise((r) => setTimeout(r, 10));
  expect(events).toEqual([]);
});
test('a tick that finds only the current route changes nothing', async () => {
  const { instances, events, calls, recovery } = await connected();
  instances[0]?.fire('disconnect');
  events.length = 0;
  recovery()?.fn();
  await new Promise((r) => setTimeout(r, 20));
  expect(newCount(calls)).toBe(1);
  expect(events).toEqual([]);
  expect(recovery()?.cleared).toBe(false);
});
test('a device that disappeared during the gap is reported as removed', async () => {
  const { instances, events, state } = await connected();
  instances[0]?.fire('disconnect');
  state.devices = {};
  instances[0]?.fire('connect');
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'deviceRemoved', deviceId: 'd1' }));
});
test('an auth failure while recovering reports it and stops the timer', async () => {
  const { instances, events, calls, net, recovery } = await connected({ authErrorFromInstance: 1 });
  instances[0]?.fire('disconnect');
  net.local = false;
  recovery()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'authError' }));
  expect(recovery()?.cleared).toBe(true);
  expect(calls.filter((c) => (c as unknown[])[0] === 'destroy')).toHaveLength(1);
  expect(events.some((e) => e.type === 'route' && e.route === 'cloud')).toBe(false);
});
test('disconnect during recovery clears the timer and later ticks do nothing', async () => {
  const { client, instances, calls, net, recovery } = await connected();
  instances[0]?.fire('disconnect');
  client.disconnect();
  expect(recovery()?.cleared).toBe(true);
  net.local = false;
  recovery()?.fn();
  await new Promise((r) => setTimeout(r, 20));
  expect(newCount(calls)).toBe(1);
});
test('overlapping recovery ticks open only one new connection', async () => {
  const { instances, events, calls, net, recovery } = await connected();
  instances[0]?.fire('disconnect');
  net.local = false;
  recovery()?.fn();
  recovery()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'cloud' }));
  expect(newCount(calls)).toBe(2);
});

// ---- recovery hardening ----
const settle = () => new Promise((r) => setTimeout(r, 20));

test('a drop during the resync read does not report a live route', async () => {
  const { instances, events, state, liveRecoveries, liveWatchers } = await connected({}, true);
  let release!: () => void;
  state.devicesGate = new Promise<void>((resolve) => { release = resolve; });
  instances[0]?.fire('disconnect');
  instances[0]?.fire('connect');
  instances[0]?.fire('disconnect');
  release();
  await settle();
  const lastNull = events.map((e) => e.type === 'route' && e.route === null).lastIndexOf(true);
  expect(events.slice(lastNull + 1).some((e) => e.type === 'route' && e.route !== null)).toBe(false);
  expect(liveRecoveries()).toBe(1);
  expect(liveWatchers()).toBe(0);
});
test('connect() during a pending resync read is not overwritten by the old connection', async () => {
  const { client, instances, events, state } = await connected();
  let release!: () => void;
  state.devicesGate = new Promise<void>((resolve) => { release = resolve; });
  instances[0]?.fire('disconnect');
  instances[0]?.fire('connect');
  await client.connect();
  const after = events.length;
  release();
  await settle();
  expect(events.slice(after).some((e) => e.type === 'device' || e.type === 'deviceRemoved')).toBe(false);
});
test('a failed local open during recovery does not leak a second watcher', async () => {
  const { client, instances, state, net, watcher, liveWatchers, intervals, onlines } = await connected({}, true);
  let fail!: () => void;
  state.sessionHook = (index) => (index === 0 ? Promise.resolve() : new Promise<void>((_, reject) => { fail = () => reject(new Error('down')); }));
  net.local = true;
  watcher()?.fn();
  await vi.waitFor(() => expect(instances).toHaveLength(2));
  instances[0]?.fire('disconnect');
  fail();
  await settle();
  state.sessionHook = null;
  instances[0]?.fire('connect');
  await settle();
  expect(liveWatchers()).toBe(1);
  client.disconnect();
  expect(intervals.every((i) => i.cleared)).toBe(true);
  expect(onlines.every((l) => l.removed)).toBe(true);
});
test('after three ticks on the same route the client reopens that route', async () => {
  const { instances, events, calls, destroyed, recovery } = await connected();
  instances[0]?.fire('disconnect');
  events.length = 0;
  recovery()?.fn(); await settle();
  recovery()?.fn(); await settle();
  expect(newCount(calls)).toBe(1);
  recovery()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  expect(calls.filter((c) => (c as unknown[])[0] === 'new').map((c) => (c as unknown[])[1])).toEqual(['https://192-168-1-50.homey.homeylocal.com', 'https://192-168-1-50.homey.homeylocal.com']);
  expect(destroyed).toEqual([0]);
  const kinds = events.map((e) => e.type);
  expect(kinds.indexOf('device')).toBeLessThan(kinds.lastIndexOf('route'));
  expect(recovery()?.cleared).toBe(true);
});
test('the same-route counter resets when a tick finds something else', async () => {
  const { instances, calls, net, recovery } = await connected();
  instances[0]?.fire('disconnect');
  recovery()?.fn(); await settle();
  recovery()?.fn(); await settle();
  net.local = false; net.cloud = false;
  recovery()?.fn(); await settle();
  net.local = true; net.cloud = true;
  recovery()?.fn(); await settle();
  recovery()?.fn(); await settle();
  expect(newCount(calls)).toBe(1);
});
test('only one switch is in flight at a time', async () => {
  const { instances, calls, state, net, watcher, recovery } = await connected({}, true);
  let release!: () => void;
  state.sessionHook = (index) => (index === 0 ? Promise.resolve() : new Promise<void>((resolve) => { release = resolve; }));
  net.local = true;
  watcher()?.fn();
  await vi.waitFor(() => expect(instances).toHaveLength(2));
  instances[0]?.fire('disconnect');
  recovery()?.fn();
  recovery()?.fn();
  await settle();
  expect(newCount(calls)).toBe(2);
  state.sessionHook = null;
  release();
  await settle();
  recovery()?.fn();
  await vi.waitFor(() => expect(newCount(calls)).toBe(3));
});

// ---- the hub id: learned, fed back and validated ----
test('after connecting by IP address alone, recovery reaches the cloud with the learned id', async () => {
  const f = fakeLib(); const t = timers();
  const client = createHomeyApiClient(f.lib, { homeyId: null, localAddress: '192.168.1.50', apiKey: 'k' }, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  expect(client.getHomeyId()).toBe(ID);
  f.instances[0]?.fire('disconnect');
  t.net.local = false;
  t.recovery()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'cloud' }));
  expect(f.calls).toContainEqual(['new', `https://${ID}.connect.athom.com`]);
  expect(f.ids).toEqual([ID, ID]);
});
test('a repeat connect without an id in the settings expects the recorded id', async () => {
  let localId = ID; let cloudUp = true;
  const urls: string[] = [];
  const fetchFn = ((url: string) => {
    urls.push(String(url));
    if (String(url).includes('homeylocal')) return Promise.resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': localId } }));
    return cloudUp ? Promise.resolve(new Response('true', { status: 200 })) : Promise.reject(new TypeError('x'));
  }) as unknown as typeof fetch;
  const { lib, calls, ids } = fakeLib();
  const client = createHomeyApiClient(lib, { homeyId: null, localAddress: '192.168.1.50', apiKey: 'k' }, deps(fetchFn));
  await client.connect();
  localId = OTHER; cloudUp = false;
  await expect(client.connect()).rejects.toMatchObject({ failure: 'unreachable' });
  expect(newCount(calls)).toBe(1);
  expect(ids).not.toContain(OTHER);
  expect(urls).toContain(`https://${ID}.connect.athom.com/api/manager/system/ping`);
  expect(client.getHomeyId()).toBe(ID);
});
test('an id header that is not a Homey id never becomes an address or the hub id', async () => {
  const urls: string[] = [];
  const fetchFn = ((url: string) => {
    urls.push(String(url));
    return Promise.resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': 'evil.example/x' } }));
  }) as unknown as typeof fetch;
  const { lib, calls, ids } = fakeLib();
  const client = createHomeyApiClient(lib, { homeyId: null, localAddress: '192.168.1.50', apiKey: 'k' }, deps(fetchFn));
  await expect(client.connect()).rejects.toMatchObject({ failure: 'homey-id-unknown' });
  await expect(client.connect()).rejects.toMatchObject({ failure: 'homey-id-unknown' });
  expect(calls).toEqual([]);
  expect(ids).toEqual([]);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((u) => u.startsWith('https://192-168-1-50.homey.homeylocal.com/'))).toBe(true);
  expect(client.getHomeyId()).toBeNull();
});

// ---- subscribe first, then read ----
test('the adapter subscribes before it reads', async () => {
  const { lib, calls } = fakeLib();
  await createHomeyApiClient(lib, settings, deps(localOk)).connect();
  const order = calls.map((c) => (c as unknown[])[0]);
  expect(order.indexOf('connect')).toBeGreaterThan(-1);
  expect(order.indexOf('connect')).toBeLessThan(order.indexOf('getDevices'));
});
test('a live value that arrives while the rest is still being read ends up in the snapshot', async () => {
  let release!: () => void;
  const f = fakeLib({ flowsGate: new Promise<void>((r) => { release = r; }) });
  const pending = createHomeyApiClient(f.lib, settings, deps(localOk)).connect();
  await vi.waitFor(() => expect(f.capabilityListeners.has('d1:onoff')).toBe(true));
  f.capabilityListeners.get('d1:onoff')?.(true);
  release();
  expect((await pending).devices['d1']?.capabilities['onoff']?.value).toBe(true);
});
test('after a route switch a newer live value is not overwritten by the value that was read', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const { client, events, state, net, watcher, subscriptions, capabilityListeners } = await connected({}, true);
  state.flowsGateFor = (index) => (index === 1 ? gate : Promise.resolve());
  net.local = true;
  watcher()?.fn();
  // The second connection has subscribed while its flows are still being read.
  await vi.waitFor(() => expect(subscriptions).toHaveLength(2));
  capabilityListeners.get('d1:onoff')?.(true);
  release();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  const last = events.filter((e) => e.type === 'device' && e.device.id === 'd1').at(-1);
  expect(last).toMatchObject({ device: { capabilities: { onoff: { value: true } } } });
  client.disconnect();
});
test('a device event that arrives while the rest is still being read ends up in the snapshot', async () => {
  let release!: () => void;
  const f = fakeLib({ flowsGate: new Promise<void>((r) => { release = r; }) });
  const client = createHomeyApiClient(f.lib, settings, deps(localOk));
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  const pending = client.connect();
  await vi.waitFor(() => expect(f.capabilityListeners.has('d1:onoff')).toBe(true));
  f.managerListeners.get('device.create')?.({ id: 'd2', name: 'Nieuw', class: 'socket', capabilities: [], capabilitiesObj: {} });
  f.managerListeners.get('device.delete')?.({ id: 'd1' });
  release();
  const snap = await pending;
  expect(Object.keys(snap.devices)).toEqual(['d2']);
  // Nothing was reported before the snapshot was handed over.
  expect(events.filter((e) => e.type === 'device' || e.type === 'deviceRemoved' || e.type === 'capability')).toEqual([]);
});

// ---- device events are validated ----
test('a device event without an id is ignored', async () => {
  const { managerListeners, events } = await connected();
  managerListeners.get('device.update')?.({ name: 'Spook' });
  managerListeners.get('device.create')?.({});
  managerListeners.get('device.create')?.({ id: '', name: 'Leeg', capabilities: [], capabilitiesObj: {} });
  managerListeners.get('device.update')?.(null);
  expect(events.filter((e) => e.type === 'device')).toEqual([]);
});
test('an incomplete update keeps the capabilities and takes over the name', async () => {
  const { managerListeners, events } = await connected();
  managerListeners.get('device.update')?.({ id: 'd1', name: 'Nieuwe naam' });
  const last = events.filter((e) => e.type === 'device').at(-1);
  expect(last).toMatchObject({ device: { id: 'd1', name: 'Nieuwe naam', deviceClass: 'light' } });
  expect((last as { device: Device }).device.capabilities['onoff']).toBeDefined();
});
test('an incomplete update carries the latest live value, not the one that was read', async () => {
  const { managerListeners, capabilityListeners, events } = await connected();
  capabilityListeners.get('d1:onoff')?.(true);
  managerListeners.get('device.update')?.({ id: 'd1', available: false, unavailableMessage: 'Buiten bereik' });
  const last = events.filter((e) => e.type === 'device').at(-1) as { device: Device };
  expect(last.device.capabilities['onoff']?.value).toBe(true);
  expect(last.device).toMatchObject({ name: 'Lamp', available: false, unavailableMessage: 'Buiten bereik' });
});
test('an incomplete event for an unknown device is ignored', async () => {
  const { managerListeners, events } = await connected();
  managerListeners.get('device.create')?.({ id: 'd9', name: 'Half' });
  expect(events.filter((e) => e.type === 'device')).toEqual([]);
});

// ---- a silent connection is noticed ----
const denied = () => Promise.reject(Object.assign(new Error('denied'), { statusCode: 401 }));

test('a failed check on the live route starts recovery', async () => {
  const { events, state, liveness, recovery } = await connected();
  state.sessionHook = () => Promise.reject(new TypeError('network'));
  liveness()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: null }));
  expect(recovery()).toBeDefined();
});
test('a check that gets no answer within the limit counts as a failure', async () => {
  const { events, state, liveness } = await connected();
  vi.useFakeTimers();
  try {
    state.sessionHook = () => new Promise<void>(() => {});
    liveness()?.fn();
    await vi.advanceTimersByTimeAsync(CLOUD_TIMEOUT_MS - 1);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toContainEqual({ type: 'route', route: null });
  } finally {
    vi.useRealTimers();
  }
});
test('a revoked key is noticed by the check', async () => {
  const { events, state, liveness, intervals } = await connected();
  state.sessionHook = denied;
  liveness()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'authError' }));
  expect(events).not.toContainEqual({ type: 'route', route: null });
  // The adapter stops checking: nothing keeps running against a hub that refuses the key.
  expect(intervals.every((i) => i.cleared)).toBe(true);
});
test('silence with a healthy check reopens the same route without reporting a loss', async () => {
  const { events, calls, clock, liveness } = await connected();
  clock.now += SILENCE_REOPEN_MS + 1;
  liveness()?.fn();
  await vi.waitFor(() => expect(calls.filter((c) => (c as unknown[])[0] === 'new')).toHaveLength(2));
  await vi.waitFor(() => expect(calls).toContainEqual(['destroy']));
  expect(calls.filter((c) => (c as unknown[])[0] === 'new').map((c) => (c as unknown[])[1])).toEqual(['https://192-168-1-50.homey.homeylocal.com', 'https://192-168-1-50.homey.homeylocal.com']);
  expect(events).not.toContainEqual({ type: 'route', route: null });
});
test('a healthy check within the silence limit changes nothing', async () => {
  const { events, calls, clock, liveness } = await connected();
  clock.now += SILENCE_REOPEN_MS;
  liveness()?.fn();
  await settle();
  expect(newCount(calls)).toBe(1);
  expect(events).toEqual([]);
});
test('an event resets the silence clock', async () => {
  const { calls, clock, liveness, capabilityListeners } = await connected();
  clock.now = 100_000;
  capabilityListeners.get('d1:onoff')?.(true);
  clock.now = 130_000;
  liveness()?.fn();
  await settle();
  expect(newCount(calls)).toBe(1);
});
test('the silence limit doubles after a reopen and returns after an event', async () => {
  const { calls, clock, liveness, capabilityListeners } = await connected();
  clock.now += SILENCE_REOPEN_MS + 1;
  liveness()?.fn();
  await vi.waitFor(() => expect(newCount(calls)).toBe(2));
  await settle();
  clock.now += SILENCE_REOPEN_MS + 1;
  liveness()?.fn();
  await settle();
  expect(newCount(calls)).toBe(2);
  clock.now += SILENCE_REOPEN_MS;
  liveness()?.fn();
  await vi.waitFor(() => expect(newCount(calls)).toBe(3));
  await settle();
  // An event brings the limit back to where it started.
  capabilityListeners.get('d1:onoff')?.(true);
  clock.now += SILENCE_REOPEN_MS + 1;
  liveness()?.fn();
  await vi.waitFor(() => expect(newCount(calls)).toBe(4));
});
test('no check runs while the connection is being recovered', async () => {
  const { instances, state, liveness } = await connected();
  let checks = 0;
  instances[0]?.fire('disconnect');
  state.sessionHook = async () => { checks += 1; };
  liveness()?.fn();
  await settle();
  expect(checks).toBe(0);
});
test('disconnect stops the check', async () => {
  const { client, intervals } = await connected();
  expect(intervals.some((i) => i.ms === LIVENESS_INTERVAL_MS && !i.cleared)).toBe(true);
  client.disconnect();
  expect(intervals.every((i) => i.cleared)).toBe(true);
});

// ---- recovery backs off ----
test('recovery waits longer after every tick, up to a minute', async () => {
  const { instances, net, timeouts } = await connected();
  net.local = false; net.cloud = false;
  instances[0]?.fire('disconnect');
  for (let i = 1; i <= 6; i++) {
    timeouts.at(-1)?.fn();
    await vi.waitFor(() => expect(timeouts).toHaveLength(i + 1));
  }
  expect(RECOVERY_DELAYS_MS).toEqual([5000, 5000, 10000, 20000, 40000, 60000]);
  expect(timeouts.map((t) => t.ms).slice(0, 7)).toEqual([5000, 5000, 10000, 20000, 40000, 60000, 60000]);
  // Never more than one waiting at a time.
  expect(timeouts.filter((t) => !t.cleared)).toHaveLength(1);
});
test('coming back online tries at once and starts the delays again', async () => {
  const { instances, net, timeouts, onlines, probes } = await connected();
  net.local = false; net.cloud = false;
  instances[0]?.fire('disconnect');
  for (let i = 1; i <= 3; i++) {
    timeouts.at(-1)?.fn();
    await vi.waitFor(() => expect(timeouts).toHaveLength(i + 1));
  }
  expect(timeouts.at(-1)?.ms).toBe(20000);
  const before = probes.count;
  const scheduled = timeouts.length;
  onlines.filter((l) => !l.removed).forEach((l) => l.fn());
  expect(probes.count).toBeGreaterThan(before);
  await vi.waitFor(() => expect(timeouts.length).toBeGreaterThan(scheduled));
  expect(timeouts.at(-1)?.ms).toBe(5000);
  expect(timeouts.filter((t) => !t.cleared)).toHaveLength(1);
});
test('a recovered connection clears the pending timeout', async () => {
  const { instances, events, timeouts, onlines } = await connected();
  instances[0]?.fire('disconnect');
  expect(timeouts).toHaveLength(1);
  instances[0]?.fire('connect');
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  expect(timeouts.at(-1)?.cleared).toBe(true);
  expect(onlines.every((l) => l.removed)).toBe(true);
});

// ---- a rejected key is reported at once, in every path ----
const authErrors = (events: ClientEvent[]) => events.filter((e) => e.type === 'authError');

test('a rejected key during the move from cloud to local is reported at once', async () => {
  const { events, calls, net, watcher, intervals } = await connected({ authErrorFromInstance: 1 }, true);
  net.local = true;
  watcher()?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'authError' }));
  expect(newCount(calls)).toBe(2);
  // The adapter stops looking, recovering and checking; a later watcher tick opens no further instance.
  expect(intervals.every((i) => i.cleared)).toBe(true);
  watcher()?.fn();
  await settle();
  expect(newCount(calls)).toBe(2);
  expect(authErrors(events)).toHaveLength(1);
});
test('a rejected key after the library reconnects by itself is reported at once', async () => {
  const { instances, events, intervals, timeouts } = await connected({ devicesError: Object.assign(new Error('denied'), { statusCode: 401 }) });
  instances[0]?.fire('disconnect');
  instances[0]?.fire('connect');
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'authError' }));
  expect(events).not.toContainEqual({ type: 'route', route: 'local' });
  expect(intervals.every((i) => i.cleared)).toBe(true);
  expect(timeouts.every((t) => t.cleared)).toBe(true);
});
test('a rejected key is reported once, until connect is called again', async () => {
  const error = Object.assign(new Error('denied'), { statusCode: 401 });
  const { client, events, liveness } = await connected({ controlError: error });
  await expect(client.setCapability('d1', 'onoff', true)).rejects.toBe(error);
  await expect(client.setCapability('d1', 'onoff', true)).rejects.toBe(error);
  expect(authErrors(events)).toHaveLength(1);
  expect(liveness()).toBeUndefined();
  await client.connect();
  await expect(client.setCapability('d1', 'onoff', true)).rejects.toBe(error);
  expect(authErrors(events)).toHaveLength(2);
});

// ---- the local address from the system info ----
const idOnly = { homeyId: ID, localAddress: null, apiKey: 'k' };

test('a cloud connection learns the local address and moves to local', async () => {
  const f = fakeLib({ systemInfo: { wifiAddress: '192.168.1.50' } }); const t = timers();
  const client = createHomeyApiClient(f.lib, idOnly, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  expect(client.getLocalAddress()).toBeNull();
  await client.connect();
  expect(f.calls[0]).toEqual(['new', `https://${ID}.connect.athom.com`]);
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'localAddress', address: '192.168.1.50' }));
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  expect(client.getLocalAddress()).toBe('192.168.1.50');
  expect(f.calls).toContainEqual(['new', 'https://192-168-1-50.homey.homeylocal.com']);
  expect(events.filter((e) => e.type === 'localAddress')).toHaveLength(1);
  client.disconnect();
});
test('a learned address that does not answer yet is watched', async () => {
  const f = fakeLib({ systemInfo: { wifiAddress: '192.168.1.50:80' } }); const t = timers(); t.net.local = false;
  const client = createHomeyApiClient(f.lib, idOnly, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'localAddress', address: '192.168.1.50' }));
  await vi.waitFor(() => expect(t.liveWatchers()).toBe(1));
  t.net.local = true;
  t.intervals.find((i) => i.ms === LOCAL_RECHECK_MS && !i.cleared)?.fn();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'route', route: 'local' }));
  client.disconnect();
});
test('on the cloud route a changed address replaces the stored one', async () => {
  const f = fakeLib({ systemInfo: { wifiAddress: '192.168.1.77' } }); const t = timers(); t.net.local = false;
  const client = createHomeyApiClient(f.lib, settings, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'localAddress', address: '192.168.1.77' }));
  expect(client.getLocalAddress()).toBe('192.168.1.77');
  client.disconnect();
});
test('on the local route the address that works is kept', async () => {
  const f = fakeLib({ systemInfo: { wifiAddress: '192.168.1.77' } }); const t = timers();
  const client = createHomeyApiClient(f.lib, settings, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  await settle();
  expect(events.filter((e) => e.type === 'localAddress')).toEqual([]);
  expect(client.getLocalAddress()).toBe('192.168.1.50');
  expect(client.getLocalAddressShape()).toBe('nnn.nnn.n.nn');
  client.disconnect();
});
test('system info without the right changes nothing', async () => {
  const f = fakeLib({ systemError: Object.assign(new Error('forbidden'), { statusCode: 403 }) }); const t = timers(); t.net.local = false;
  const client = createHomeyApiClient(f.lib, idOnly, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await expect(client.connect()).resolves.toMatchObject({ homeyId: ID });
  await settle();
  expect(events.filter((e) => e.type === 'localAddress' || e.type === 'authError')).toEqual([]);
  expect(client.getLocalAddress()).toBeNull();
  expect(client.getLocalAddressShape()).toBeNull();
  client.disconnect();
});
test('system info that names no private address changes nothing', async () => {
  for (const wifiAddress of ['8.8.8.8', '', null, 42, undefined]) {
    const f = fakeLib({ systemInfo: { wifiAddress } }); const t = timers(); t.net.local = false;
    const client = createHomeyApiClient(f.lib, idOnly, t.d);
    const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
    await client.connect();
    await settle();
    expect(events.filter((e) => e.type === 'localAddress')).toEqual([]);
    client.disconnect();
  }
});
test('system info with a rejected key is an auth failure', async () => {
  const f = fakeLib({ systemError: Object.assign(new Error('denied'), { statusCode: 401 }) }); const t = timers(); t.net.local = false;
  const client = createHomeyApiClient(f.lib, idOnly, t.d);
  const events: ClientEvent[] = []; client.subscribe((e) => events.push(e));
  await client.connect();
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'authError' }));
  client.disconnect();
});
test('connect does not wait for the system info', async () => {
  const f = fakeLib(); const t = timers();
  let asked = 0;
  const lib = { HomeyAPIV3Local: class extends (f.lib.HomeyAPIV3Local as unknown as new (init: unknown) => { system: { getInfo(): Promise<unknown> } }) {
    constructor(init: unknown) { super(init); this.system = { getInfo: () => { asked += 1; return new Promise(() => {}); } }; }
  } } as unknown as HomeyApiLib;
  const client = createHomeyApiClient(lib, settings, t.d);
  await expect(client.connect()).resolves.toMatchObject({ homeyId: ID });
  expect(asked).toBe(1);
  client.disconnect();
});

// ---- the first connection by address alone ----
const slowLocal = ((url: string) => (String(url).includes('homeylocal')
  ? new Promise<Response>((resolve) => { setTimeout(() => resolve(new Response('true', { status: 200, headers: { 'X-Homey-ID': ID } })), 5000); })
  : Promise.resolve(new Response('true', { status: 200 })))) as unknown as typeof fetch;

test('the first connection by address alone waits for the browser permission', async () => {
  vi.useFakeTimers();
  try {
    const { lib, calls } = fakeLib();
    const client = createHomeyApiClient(lib, { homeyId: null, localAddress: '192.168.1.50', apiKey: 'k' }, deps(slowLocal));
    const pending = client.connect();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toMatchObject({ homeyId: ID });
    expect(calls[0]).toEqual(['new', 'https://192-168-1-50.homey.homeylocal.com']);
    client.disconnect();
  } finally {
    vi.useRealTimers();
  }
});
test('with a known id the local probe keeps its short limit', async () => {
  vi.useFakeTimers();
  try {
    const { lib, calls } = fakeLib();
    const client = createHomeyApiClient(lib, settings, deps(slowLocal));
    const pending = client.connect();
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toMatchObject({ homeyId: ID });
    expect(calls[0]).toEqual(['new', `https://${ID}.connect.athom.com`]);
    client.disconnect();
  } finally {
    vi.useRealTimers();
  }
});

const POWER: HistorySource = { log: 'homey:device:d1:measure_power', kind: 'device', type: 'number', deviceId: 'd1', capabilityId: 'measure_power' };
test('listHistory gives the logs of devices, and the recorded ones of values it is told; a missing right is none', async () => {
  const client = createHomeyApiClient(fakeLib().lib, settings, deps(localOk));
  expect(await client.listHistory()).toEqual([]);
  await client.connect();
  expect(await client.listHistory()).toEqual([POWER, { log: 'homey:device:d1:onoff', kind: 'device', type: 'boolean', deviceId: 'd1', capabilityId: 'onoff' }]);
  expect(await client.listHistory([{ deviceId: 'd2', capabilityId: 'ac_input_source' }])).toContainEqual(expect.objectContaining({ kind: 'recorded', deviceId: 'd2', capabilityId: 'ac_input_source' }));
  const forbidden = Object.assign(new Error('forbidden'), { statusCode: 403 });
  const limited = createHomeyApiClient(fakeLib({ insightsError: forbidden }).lib, settings, deps(localOk));
  await limited.connect();
  expect(await limited.listHistory()).toEqual([]);
});
test('readSeries asks for the log and the period, and keeps the gaps; a year asks for two periods', async () => {
  const { lib, calls } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  expect(await client.readSeries(POWER, 'last24Hours')).toBeNull();
  await client.connect();
  const series = await client.readSeries(POWER, 'last24Hours');
  expect(calls).toContainEqual(['entries', { id: 'homey:device:d1:measure_power', resolution: 'last24Hours' }]);
  expect(series!.points).toEqual([{ at: Date.parse('2026-11-22T10:00:00.000Z'), value: null }, { at: Date.parse('2026-11-22T10:05:00.000Z'), value: 5 }]);
  await client.readSeries(POWER, 'year');
  expect(calls).toContainEqual(['entries', { id: 'homey:device:d1:measure_power', resolution: 'lastYear' }]);
  expect(calls).toContainEqual(['entries', { id: 'homey:device:d1:measure_power', resolution: 'thisYear' }]);
  const switches = await client.readSwitches({ ...POWER, log: 'homey:device:d1:onoff', type: 'boolean', capabilityId: 'onoff' });
  expect(switches!.changes.map((change) => change.on)).toEqual([true, false]);
});
test('reading history with a rejected key reports the auth failure', async () => {
  const denied = Object.assign(new Error('denied'), { statusCode: 401 });
  const client = createHomeyApiClient(fakeLib({ insightsError: denied }).lib, settings, deps(localOk));
  await client.connect();
  const events: ClientEvent[] = [];
  client.subscribe((e) => events.push(e));
  await expect(client.readSeries(POWER, 'last24Hours')).rejects.toMatchObject({ name: 'ConnectionError', failure: 'auth' });
  await expect(client.listHistory()).rejects.toMatchObject({ failure: 'auth' });
  expect(events).toContainEqual({ type: 'authError' });
});
test('history of an unknown log is none; any other failure is unreachable', async () => {
  const missing = Object.assign(new Error('not found'), { statusCode: 404 });
  const client = createHomeyApiClient(fakeLib({ insightsError: missing }).lib, settings, deps(localOk));
  await client.connect();
  expect(await client.readSeries(POWER, 'last24Hours')).toBeNull();
  expect(await client.readSwitches(POWER)).toBeNull();
  const broken = createHomeyApiClient(fakeLib({ insightsError: new Error('boom') }).lib, settings, deps(localOk));
  await broken.connect();
  await expect(broken.readSeries(POWER, 'last24Hours')).rejects.toMatchObject({ failure: 'unreachable' });
});
test('readStructure reads the rooms and flows as they are now', async () => {
  const f = fakeLib();
  const client = createHomeyApiClient(f.lib, settings, deps(localOk));
  expect(await client.readStructure!()).toBeNull();
  const snapshot = await client.connect();
  expect(await client.readStructure!()).toEqual({ zones: snapshot.zones, flows: snapshot.flows });
  const broken = createHomeyApiClient(fakeLib().lib, settings, deps(localOk));
  await broken.connect();
  broken.disconnect();
  expect(await broken.readStructure!()).toBeNull();
});
test('readStructure gives nothing when the hub does not answer', async () => {
  const options: { flowsError?: Error } = {};
  const client = createHomeyApiClient(fakeLib(options).lib, settings, deps(localOk));
  await client.connect();
  options.flowsError = new Error('boom');
  expect(await client.readStructure!()).toBeNull();
});

test('for measuring, the history comes as the hub gives it, with every period or none', async () => {
  const { lib, calls } = fakeLib();
  const client = createHomeyApiClient(lib, settings, deps(localOk));
  await client.connect();
  expect(await client.rawHistory!.logs()).toHaveProperty('a');
  expect(await client.rawHistory!.entries('homey:device:d1:measure_power', 'last7Days')).toHaveProperty('values');
  await client.rawHistory!.entries('homey:device:d1:measure_power', null);
  expect((calls as [string, unknown][]).filter(([name]) => name === 'entries').map(([, args]) => args)).toEqual([{ id: 'homey:device:d1:measure_power', resolution: 'last7Days' }, { id: 'homey:device:d1:measure_power' }]);
  client.disconnect();
  await expect(client.rawHistory!.logs()).rejects.toThrow();
});
