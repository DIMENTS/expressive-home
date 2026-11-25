import { beforeEach, expect, test, vi } from 'vitest';
import { ConnectionError, type ClientEvent } from '../../src/homey/client';
import { createServedClient, RESYNC_RETRY_MS } from '../../src/served/client';
import { createLink, HELLO_MS, REOPEN_MS, REQUEST_MS, RequestError, SILENT_MS, UP_WAIT_MS, type EventStream, type LinkEvents } from '../../src/served/link';
import { createServedStore, PAIRED_KEY, SAVE_EVERY_MS, SAVE_RETRY_MS } from '../../src/served/store';
import { createDefaultConfig, type AppConfig } from '../../src/storage/config';
import { STORAGE_KEY } from '../../src/storage/local-store';
import { defaultWall } from '../../src/wall/settings';
import { board, hubLayout, overview, ownSection } from '../helpers/layout';
import { camperSnapshot, HOMEY_ID } from '../helpers/fake-hub';

beforeEach(() => { vi.useFakeTimers(); return () => { vi.useRealTimers(); }; });
const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

// ----- the link -----

function linkSetup() {
  const streams: (EventStream & { readyState: number; closed: boolean; send(type: string, data?: unknown): void })[] = [];
  const answers = new Map<string, { status: number; body: unknown } | 'never' | 'away'>();
  const sent: [string, string, unknown][] = [];
  const kept: unknown[] = [];
  const link = createLink({
    fetch: async (path, init) => {
      kept.push(init?.keepalive);
      sent.push([init?.method ?? 'GET', path, init?.body === undefined ? undefined : JSON.parse(String(init.body))]);
      const answer = answers.get(path) ?? { status: 200, body: {} };
      if (answer === 'away') throw new TypeError('Failed to fetch');
      if (answer === 'never') return new Promise((_done, fail) => { init!.signal!.addEventListener('abort', () => fail(new Error('aborted'))); });
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    },
    openStream: () => {
      const on = new Map<string, (event: { data?: string }) => void>();
      const stream = { readyState: 0, closed: false, addEventListener: (type: string, listener: (event: { data?: string }) => void) => { on.set(type, listener); }, close() { stream.closed = true; }, send(type: string, data?: unknown) { on.get(type)?.({ data: JSON.stringify(data ?? {}) }); } };
      streams.push(stream);
      return stream;
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now(),
  });
  const heard: [string, unknown][] = [];
  for (const type of ['open', 'lost', 'hub', 'layouts', 'role', 'unpaired'] as const) link.on(type, (value) => heard.push([type, value]));
  return { link, streams, answers, sent, heard, kept };
}

test('the link passes on what comes over the stream', () => {
  const s = linkSetup();
  s.link.hold();
  s.streams[0]!.send('hello', { revision: 3, role: 'edit', route: 'local' });
  s.streams[0]!.send('hub', { type: 'reset' });
  s.streams[0]!.send('layouts', { revision: 4 });
  s.streams[0]!.send('ping');
  s.streams[0]!.send('role', { role: 'use' });
  s.streams[0]!.send('role', { role: 'admin' });
  s.streams[0]!.send('role');
  expect(s.heard).toEqual([['open', { revision: 3, role: 'edit', looks: null }], ['hub', { type: 'reset' }], ['layouts', { revision: 4 }], ['role', 'use']]);
});

test('a stream that goes or falls silent is opened again', () => {
  const s = linkSetup();
  s.link.hold();
  s.streams[0]!.send('hello', { revision: 1 });
  s.streams[0]!.send('error');
  expect([s.heard.at(-1), s.streams[0]!.closed]).toEqual([['lost', null], true]);
  vi.advanceTimersByTime(REOPEN_MS);
  expect(s.streams).toHaveLength(2);
  s.streams[1]!.send('hello', { revision: 1 });
  vi.advanceTimersByTime(SILENT_MS - 1);
  s.streams[1]!.send('ping');
  vi.advanceTimersByTime(SILENT_MS - 1);
  expect(s.streams[1]!.closed).toBe(false);
  vi.advanceTimersByTime(1);
  expect(s.streams[1]!.closed).toBe(true);
  // what an old stream still sends does not count
  const before = s.heard.length;
  s.streams[0]!.send('hub', { type: 'reset' });
  expect(s.heard).toHaveLength(before);
});

test('a refused stream asks whether this device is still paired', async () => {
  const s = linkSetup();
  s.answers.set('api/session', { status: 200, body: { paired: true } });
  s.link.hold();
  s.streams[0]!.readyState = 2;
  s.streams[0]!.send('error');
  await settle();
  expect(s.heard).toEqual([['lost', null]]);
  vi.advanceTimersByTime(REOPEN_MS);
  s.answers.set('api/session', { status: 200, body: { paired: false } });
  s.streams[1]!.readyState = 2;
  s.streams[1]!.send('error');
  await settle();
  expect(s.heard).toEqual([['lost', null], ['lost', null], ['unpaired', null]]);
  vi.advanceTimersByTime(60_000);
  expect(s.streams).toHaveLength(2);
});

test('whoever holds the stream keeps it open: it ends with the last one, also what was waiting', () => {
  const s = linkSetup();
  const [one, two] = [s.link.hold(), s.link.hold()];
  expect(s.streams).toHaveLength(1);
  one();
  one();
  expect(s.streams[0]!.closed).toBe(false);
  s.streams[0]!.send('error');
  two();
  vi.advanceTimersByTime(60_000);
  expect(s.streams).toHaveLength(1);
  // a newer holder has its own stream, whatever the older ones still do
  s.link.hold();
  two();
  expect([s.streams.length, s.streams[1]!.closed]).toEqual([2, false]);
});

test('who takes hold of a stream that waits to be tried again does not wait', () => {
  const s = linkSetup();
  s.link.hold();
  s.streams[0]!.send('error');
  s.link.hold();
  expect(s.streams).toHaveLength(2);
  vi.advanceTimersByTime(REOPEN_MS);
  expect(s.streams).toHaveLength(2);
});

test('a stream that does not greet did not come, and is tried again', () => {
  const s = linkSetup();
  s.link.hold();
  vi.advanceTimersByTime(HELLO_MS);
  expect([s.heard, s.streams[0]!.closed]).toEqual([[['lost', null]], true]);
  vi.advanceTimersByTime(REOPEN_MS);
  expect(s.streams).toHaveLength(2);
});

test('waiting for the stream ends when it is there, when it does not come, and after a moment', async () => {
  const s = linkSetup();
  await s.link.whenUp();
  let done = 0;
  const wait = () => { void s.link.whenUp().then(() => { done += 1; }); };
  s.link.hold();
  wait();
  await settle();
  expect(done).toBe(0);
  s.streams[0]!.send('hello', { revision: 1 });
  await settle();
  expect(done).toBe(1);
  wait();
  await settle();
  expect(done).toBe(2);
  s.streams[0]!.send('error');
  vi.advanceTimersByTime(REOPEN_MS);
  wait();
  s.streams[1]!.send('error');
  await settle();
  expect(done).toBe(3);
  vi.advanceTimersByTime(REOPEN_MS);
  wait();
  vi.advanceTimersByTime(UP_WAIT_MS);
  await settle();
  expect(done).toBe(4);
});

test('a page that nobody looks at lets go of the stream without saying so; looked at again it is there at once', () => {
  const s = linkSetup();
  s.link.wake();
  s.link.sleep();
  expect(s.streams).toHaveLength(0);
  s.link.hold();
  s.streams[0]!.send('hello', { revision: 1 });
  s.link.wake();
  expect(s.streams).toHaveLength(1);
  s.link.sleep();
  expect([s.streams[0]!.closed, s.link.up(), s.heard.map(([type]) => type)]).toEqual([true, false, ['open']]);
  vi.advanceTimersByTime(600_000);
  expect(s.streams).toHaveLength(1);
  s.link.wake();
  s.link.wake();
  expect(s.streams).toHaveLength(2);
  s.streams[1]!.send('hello', { revision: 1 });
  // a device that slept itself: its timers stood still, and the stream looks alive
  vi.setSystemTime(Date.now() + 3_600_000);
  s.link.wake();
  expect(s.streams).toHaveLength(3);
  expect(s.heard.map(([type]) => type)).toEqual(['open', 'open']);
});

test('what is saved while the page closes still arrives; only that', async () => {
  const s = linkSetup();
  await s.link.request('PUT', 'api/layouts', { a: 1 });
  await s.link.request('PUT', 'api/layouts', { a: 'x'.repeat(70_000) });
  await s.link.request('POST', 'api/control', { a: 1 });
  expect(s.kept).toEqual([true, undefined, undefined]);
});

test('a request gives the answer, and fails on a refusal or without an answer', async () => {
  const s = linkSetup();
  s.answers.set('api/pair', { status: 403, body: { error: 'code' } });
  s.answers.set('api/slow', 'never');
  expect(await s.link.request('POST', 'api/control', { a: 1 })).toEqual({});
  expect(s.sent).toEqual([['POST', 'api/control', { a: 1 }]]);
  await expect(s.link.request('POST', 'api/pair', {})).rejects.toMatchObject({ status: 403, body: { error: 'code' } });
  const slow = expect(s.link.request('GET', 'api/slow')).rejects.toThrow();
  vi.advanceTimersByTime(REQUEST_MS);
  await slow;
});

// ----- a link without a network, for the client and the store -----

function fakeLink() {
  const state = { up: true };
  const released = vi.fn();
  const listeners: Record<string, Set<(value: never) => void>> = {};
  const answers = new Map<string, (body: unknown) => unknown>();
  const sent: [string, string, unknown][] = [];
  const link = {
    request: vi.fn(async (method: string, path: string, body?: unknown) => {
      sent.push([method, path, body]);
      const answer = answers.get(`${method} ${path}`);
      if (!answer) throw new TypeError('Failed to fetch');
      return structuredClone(answer(body));
    }),
    hold: vi.fn(() => released), up: () => state.up, whenUp: async () => {}, now: () => Date.now(),
    later: (fn: () => void, ms: number) => { const handle = setTimeout(fn, ms); return () => clearTimeout(handle); },
    on: (type: string, listener: (value: never) => void) => { (listeners[type] ??= new Set()).add(listener); return () => { listeners[type]!.delete(listener); }; },
  };
  const emit = <K extends keyof LinkEvents>(type: K, value: LinkEvents[K]) => { for (const listener of [...(listeners[type] ?? [])]) listener(value as never); };
  return { link: link as unknown as ReturnType<typeof createLink>, raw: link, state, released, answers, sent, emit };
}
const refuse = (status: number, body: unknown = {}) => () => { throw new RequestError(status, body); };

async function clientSetup() {
  const f = fakeLink();
  const snapshot = camperSnapshot();
  f.answers.set('GET api/snapshot', () => ({ snapshot, route: 'local' }));
  const client = createServedClient(f.link);
  const events: ClientEvent[] = [];
  client.subscribe((event) => events.push(event));
  return { ...f, snapshot, client, events };
}

test('connecting reads what the hub has and reports the route; controls go to the app', async () => {
  const c = await clientSetup();
  const snapshot = await c.client.connect();
  expect([snapshot.homeyId, c.client.getHomeyId()]).toEqual([c.snapshot.homeyId, c.snapshot.homeyId]);
  expect(c.events).toEqual([{ type: 'route', route: 'local' }]);
  c.answers.set('POST api/control', () => ({}));
  c.answers.set('POST api/flow', () => ({}));
  await c.client.setCapability('device-1', 'onoff', true);
  await c.client.startFlow({ id: 'f', kind: 'flow' });
  expect(c.sent.slice(1)).toEqual([['POST', 'api/control', { deviceId: 'device-1', capabilityId: 'onoff', value: true }], ['POST', 'api/flow', { id: 'f' }]]);
  c.answers.set('POST api/control', refuse(502));
  await expect(c.client.setCapability('device-1', 'onoff', true)).rejects.toThrow();
});

test('connecting says why it failed', async () => {
  const c = await clientSetup();
  c.answers.set('GET api/snapshot', refuse(401));
  await expect(c.client.connect()).rejects.toEqual(new ConnectionError('auth'));
  c.answers.set('GET api/snapshot', refuse(503));
  await expect(c.client.connect()).rejects.toMatchObject({ failure: 'unreachable' });
  c.answers.delete('GET api/snapshot');
  await expect(c.client.connect()).rejects.toMatchObject({ failure: 'unreachable' });
  expect([c.raw.hold.mock.calls.length, c.released.mock.calls.length]).toEqual([3, 3]);
});

test('reports that come while reading are newer than what was read', async () => {
  const c = await clientSetup();
  const opening = c.client.connect();
  c.emit('hub', { type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value: false, at: null });
  await Promise.resolve();
  c.emit('hub', { type: 'capability', deviceId: 'device-1', capabilityId: 'onoff', value: true, at: null });
  const snapshot = await opening;
  await settle();
  expect([snapshot.devices['device-1']!.capabilities['onoff']!.value, c.events]).toEqual([true, [{ type: 'route', route: 'local' }]]);
});

test('everything that can come while reading counts', async () => {
  const c = await clientSetup();
  const lamp = c.snapshot.devices['device-1']!;
  const { zones } = c.snapshot;
  const opening = c.client.connect();
  await settle();
  const reports: ClientEvent[] = [{ type: 'device', device: { ...lamp, name: 'Andere naam' } }, { type: 'deviceRemoved', deviceId: 'device-2' }, { type: 'structure', zones, flows: [] }, { type: 'route', route: null }];
  c.answers.set('GET api/snapshot', () => ({ snapshot: c.snapshot, route: 'local' }));
  const late = createServedClient(c.link);
  const events: ClientEvent[] = [];
  late.subscribe((event) => events.push(event));
  const reading = late.connect();
  // it waits for the stream first, then it reads
  await Promise.resolve();
  for (const report of reports) c.emit('hub', report);
  const snapshot = await reading;
  await opening;
  expect([snapshot.devices['device-1']!.name, snapshot.devices['device-2'], snapshot.flows, events]).toEqual(['Andere naam', undefined, [], [{ type: 'route', route: null }]]);
});

test('a hub that was read anew while a page opened is read again by that page', async () => {
  const c = await clientSetup();
  const opening = c.client.connect();
  await Promise.resolve();
  c.emit('hub', { type: 'reset' });
  await opening;
  expect(c.sent.filter(([, path]) => path === 'api/snapshot')).toHaveLength(1);
  vi.advanceTimersByTime(1);
  await settle();
  expect(c.sent.filter(([, path]) => path === 'api/snapshot')).toHaveLength(2);
});

test('without the live stream there is no route, whatever the hub says', async () => {
  const c = await clientSetup();
  c.state.up = false;
  await c.client.connect();
  expect(c.events).toEqual([{ type: 'route', route: null }]);
  c.state.up = true;
  c.emit('open', { revision: 1, role: 'edit', looks: null });
  await settle();
  expect(c.events.at(-1)).toEqual({ type: 'route', route: 'local' });
});

test('a report of a route that comes late does not bring back what is gone', async () => {
  const c = await clientSetup();
  await c.client.connect();
  c.emit('hub', { type: 'reset' });
  c.emit('hub', { type: 'route', route: 'local' });
  c.state.up = false;
  c.emit('lost', null);
  await settle();
  expect(c.events.filter((e) => e.type === 'route').at(-1)).toEqual({ type: 'route', route: null });
});

test('reading everything again is tried until it works, and not after leaving', async () => {
  const c = await clientSetup();
  await c.client.connect();
  c.emit('lost', null);
  c.answers.delete('GET api/snapshot');
  c.emit('open', { revision: 1, role: 'edit', looks: null });
  await settle();
  expect(c.events.at(-1)).toEqual({ type: 'route', route: null });
  vi.advanceTimersByTime(RESYNC_RETRY_MS);
  await settle();
  c.answers.set('GET api/snapshot', () => ({ snapshot: c.snapshot, route: 'local' }));
  vi.advanceTimersByTime(RESYNC_RETRY_MS);
  await settle();
  expect(c.events.at(-1)).toEqual({ type: 'route', route: 'local' });
  c.answers.delete('GET api/snapshot');
  c.emit('open', { revision: 1, role: 'edit', looks: null });
  await settle();
  c.client.disconnect();
  const count = c.sent.length;
  vi.advanceTimersByTime(10 * RESYNC_RETRY_MS);
  await settle();
  expect(c.sent).toHaveLength(count);
});

test('the way to the app gone and back: no route, then everything is read again', async () => {
  const c = await clientSetup();
  await c.client.connect();
  c.events.length = 0;
  c.emit('lost', null);
  expect(c.events).toEqual([{ type: 'route', route: null }]);
  delete (c.snapshot.devices as Record<string, unknown>)['device-1'];
  c.emit('open', { revision: 1, role: 'edit', looks: null });
  await settle();
  expect(c.events).toContainEqual({ type: 'deviceRemoved', deviceId: 'device-1' });
  expect(c.events.at(-1)).toEqual({ type: 'route', route: 'local' });
  expect(c.events.filter((e) => e.type === 'device')).toHaveLength(Object.keys(c.snapshot.devices).length);
});

test('a route of the hub itself that goes, and a reset, are passed on', async () => {
  const c = await clientSetup();
  await c.client.connect();
  c.events.length = 0;
  c.emit('hub', { type: 'route', route: null });
  c.emit('hub', { type: 'route', route: null });
  c.emit('hub', { type: 'reset' });
  await settle();
  expect(c.events.filter((e) => e.type === 'route')).toEqual([{ type: 'route', route: null }, { type: 'route', route: 'local' }]);
});

test('a device that is taken away is an error of rights; after disconnecting nothing is reported', async () => {
  const c = await clientSetup();
  await c.client.connect();
  c.emit('unpaired', null);
  expect(c.events.at(-1)).toEqual({ type: 'authError' });
  c.client.disconnect();
  const before = c.events.length;
  c.emit('hub', { type: 'reset' });
  c.emit('lost', null);
  await settle();
  expect(c.events).toHaveLength(before);
});

// ----- the settings -----

const layouts = (name: string) => ({ [HOMEY_ID]: hubLayout([overview([ownSection('own:a')]), board('d-1', [], { name })]) });

function storeSetup(role: 'use' | 'edit' = 'edit') {
  const f = fakeLink();
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  f.answers.set('GET api/session', () => ({ paired: true, device: { name: 'Tablet', role }, homeyId: HOMEY_ID }));
  f.answers.set('GET api/layouts', () => ({ revision: 1, layouts: layouts('Buiten'), sectionSeeds: { 'type:lights': '#a6422a' } }));
  const served = createServedStore(storage, f.link);
  const changed = vi.fn();
  const conflict = vi.fn();
  const unsaved = vi.fn();
  served.onChanged(changed);
  served.onConflict(conflict);
  served.onUnsaved(unsaved);
  /** Saves, and lets what goes in the background happen. */
  const save = async (config: AppConfig) => { await served.store.save(config); vi.advanceTimersByTime(SAVE_EVERY_MS); await settle(); };
  return { ...f, values, served, changed, conflict, unsaved, save };
}

test('a paired device gets the layouts of the hub and its own theme and language', async () => {
  const s = storeSetup('use');
  s.values.set(STORAGE_KEY, JSON.stringify({ ...createDefaultConfig(), theme: { seed: '#a6422a', mode: 'dark', density: 'compact' }, language: 'en' }));
  const config = await s.served.store.load();
  expect(config).toMatchObject({ connection: { homeyId: HOMEY_ID, localAddress: null }, theme: { mode: 'dark' }, language: 'en', layouts: layouts('Buiten'), sectionSeeds: { 'type:lights': '#a6422a' } });
  expect(config.connection.apiKey).not.toBeNull();
  expect([s.served.mayArrange(), s.raw.request.mock.calls.length]).toEqual([false, 2]);
  expect(s.changed).not.toHaveBeenCalled();
});

test('a device that is not paired has no connection; a hub that does not answer is something else', async () => {
  const s = storeSetup();
  s.answers.set('GET api/session', () => ({ paired: false }));
  expect((await s.served.store.load()).connection.apiKey).toBeNull();
  const again = storeSetup();
  again.values.set(PAIRED_KEY, HOMEY_ID);
  again.answers.delete('GET api/session');
  expect((await again.served.store.load()).connection).toMatchObject({ homeyId: HOMEY_ID });
  expect((await again.served.store.load()).connection.apiKey).not.toBeNull();
});

test('saving puts the layouts on the hub and only theme and language in the browser', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  s.answers.set('PUT api/layouts', (body) => ({ ...(body as object), revision: 2 }));
  await s.save({ ...config, theme: { seed: '#3a5ba9', mode: 'dark', density: 'compact' }, layouts: layouts('Energie') });
  expect(s.sent.at(-1)).toEqual(['PUT', 'api/layouts', { base: 1, layouts: layouts('Energie'), sectionSeeds: { 'type:lights': '#a6422a' }, knows: ['widget'] }]);
  expect(s.values.get(STORAGE_KEY)).toContain('#3a5ba9');
  for (const secret of ['Energie', 'type:lights', 'paired', HOMEY_ID]) expect(s.values.get(STORAGE_KEY)).not.toContain(secret);
  // only the theme: nothing for the hub
  const count = s.sent.length;
  await s.save({ ...(await s.served.store.load()), language: 'en' });
  expect([s.sent.length, (await s.served.store.load()).language]).toEqual([count, 'en']);
});

test('a device that may only use it saves nothing on the hub', async () => {
  const s = storeSetup('use');
  const config = await s.served.store.load();
  const count = s.sent.length;
  await s.save({ ...config, layouts: layouts('Energie') });
  expect(s.sent).toHaveLength(count);
});

test('another device was first: its version is taken over, and the owner hears that this one was not saved', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  s.answers.set('PUT api/layouts', refuse(409, { revision: 7, layouts: layouts('Van een ander'), sectionSeeds: {} }));
  await s.save({ ...config, layouts: layouts('Van mij') });
  expect([s.changed.mock.calls.length, s.conflict.mock.calls.length]).toEqual([1, 1]);
  expect((await s.served.store.load()).layouts).toEqual(layouts('Van een ander'));
  // two devices that worked out the same: nothing was lost
  s.answers.set('PUT api/layouts', refuse(409, { revision: 8, layouts: layouts('Samen'), sectionSeeds: {} }));
  await s.save({ ...(await s.served.store.load()), layouts: layouts('Samen') });
  expect(s.conflict).toHaveBeenCalledTimes(1);
  // only names that the hub gave changed: nobody's work either
  const named = layouts('Samen');
  named[HOMEY_ID]!.names = { 'device-1': 'Anders' };
  s.answers.set('PUT api/layouts', refuse(409, { revision: 9, layouts: layouts('Iets nieuws'), sectionSeeds: {} }));
  await s.save({ ...(await s.served.store.load()), layouts: named });
  expect(s.conflict).toHaveBeenCalledTimes(1);
});

test('a hub that does not answer while saving is said once, and saved as soon as it answers', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  await s.save({ ...config, layouts: layouts('Energie') });
  expect(s.unsaved).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(SAVE_RETRY_MS);
  await settle();
  expect([s.unsaved.mock.calls.length, s.sent.filter(([method]) => method === 'PUT').length]).toEqual([1, 2]);
  s.answers.set('PUT api/layouts', (body) => ({ ...(body as object), revision: 2 }));
  vi.advanceTimersByTime(SAVE_RETRY_MS);
  await settle();
  expect(s.sent.at(-1)).toMatchObject(['PUT', 'api/layouts', { base: 1, layouts: layouts('Energie') }]);
  // and the next time it is said again
  s.answers.delete('PUT api/layouts');
  await s.save({ ...config, layouts: layouts('Water') });
  expect(s.unsaved).toHaveBeenCalledTimes(2);
  // the stream that comes back is a sign too
  s.answers.set('PUT api/layouts', (body) => ({ ...(body as object), revision: 3 }));
  s.emit('open', { revision: 2, role: 'edit', looks: null });
  await settle();
  expect(s.sent.at(-1)).toMatchObject(['PUT', 'api/layouts', { base: 2, layouts: layouts('Water') }]);
});

test('a change the hub refuses is not sent over and over', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  s.answers.set('PUT api/layouts', refuse(413, { error: 'too-large' }));
  await s.save({ ...config, layouts: layouts('Energie') });
  vi.advanceTimersByTime(10 * SAVE_RETRY_MS);
  await settle();
  expect([s.unsaved.mock.calls.length, s.sent.filter(([method]) => method === 'PUT').length]).toEqual([1, 1]);
});

test('one thing is saved at a time, and what was changed meanwhile goes together', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  let answer: (value: unknown) => void = () => {};
  const puts: { base: number; layouts: unknown }[] = [];
  s.raw.request.mockImplementation(async (method, _path, body) => {
    if (method !== 'PUT') throw new TypeError('not now');
    puts.push(body as { base: number; layouts: unknown });
    return new Promise((done) => { answer = done; });
  });
  await s.served.store.save({ ...config, layouts: layouts('a') });
  for (const name of ['ab', 'abc', 'abcd']) {
    await s.served.store.save({ ...config, layouts: layouts(name) });
    vi.advanceTimersByTime(SAVE_EVERY_MS);
  }
  // another device is heard of, and its own save comes back as news: nothing is turned back
  s.emit('layouts', { revision: 2 });
  await settle();
  expect([puts.length, s.changed.mock.calls.length, (await s.served.store.load()).layouts]).toEqual([1, 0, layouts('abcd')]);
  answer({ revision: 2, layouts: layouts('A'), sectionSeeds: {} });
  await settle();
  vi.advanceTimersByTime(SAVE_EVERY_MS);
  await settle();
  expect(puts.map((put) => [put.base, put.layouts])).toEqual([[1, layouts('a')], [2, layouts('abcd')]]);
  answer({ revision: 3, layouts: layouts('ABCD'), sectionSeeds: {} });
  s.emit('layouts', { revision: 3 });
  await settle();
  // also where the hub keeps it a little differently, what is shown here stays as it is
  expect([puts.length, s.changed.mock.calls.length, (await s.served.store.load()).layouts]).toEqual([2, 0, layouts('abcd')]);
});

test('letters go together, and a page that closes sends what is waiting at once', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  let revision = 1;
  s.answers.set('PUT api/layouts', (body) => ({ ...(body as object), revision: (revision += 1) }));
  const puts = () => s.sent.filter(([method]) => method === 'PUT').length;
  for (const name of ['a', 'ab', 'abc']) {
    await s.served.store.save({ ...config, layouts: layouts(name) });
    await settle();
  }
  expect(puts()).toBe(1);
  s.served.flush();
  await settle();
  expect([puts(), s.sent.at(-1)![2]]).toMatchObject([2, { layouts: layouts('abc') }]);
  s.served.flush();
  vi.advanceTimersByTime(10 * SAVE_EVERY_MS);
  await settle();
  expect(puts()).toBe(2);
});

test('a browser that keeps nothing still saves on the hub, and that is only said for what it does not keep', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  s.values.set = () => { throw new Error('quota'); };
  s.answers.set('PUT api/layouts', (body) => ({ ...(body as object), revision: 2 }));
  const dark = { seed: '#3a5ba9', mode: 'dark' as const, density: 'compact' as const };
  await expect(s.save({ ...config, theme: dark })).rejects.toThrow();
  await s.save({ ...config, theme: dark, layouts: layouts('Energie') });
  expect(s.sent.at(-1)).toMatchObject(['PUT', 'api/layouts', { layouts: layouts('Energie') }]);
});

test('a right that changes is known at once; what was not saved yet is gone with it', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  expect(s.served.mayArrange()).toBe(true);
  await s.save({ ...config, layouts: layouts('Energie') });
  s.emit('open', { revision: 1, role: 'use', looks: null });
  await settle();
  expect([s.served.mayArrange(), s.changed.mock.calls.length, (await s.served.store.load()).layouts]).toEqual([false, 1, layouts('Buiten')]);
  s.emit('open', { revision: 1, role: 'edit', looks: null });
  expect([s.served.mayArrange(), s.changed.mock.calls.length]).toEqual([true, 2]);
  // also without the stream opening anew
  s.emit('role', 'use');
  expect([s.served.mayArrange(), s.changed.mock.calls.length]).toEqual([false, 3]);
  s.emit('role', 'use');
  s.emit('role', 'edit');
  expect([s.served.mayArrange(), s.changed.mock.calls.length]).toEqual([true, 4]);
  // also when the hub says so while saving
  s.answers.set('PUT api/layouts', refuse(403, { error: 'use-only' }));
  await s.save({ ...config, layouts: layouts('Water') });
  expect([s.served.mayArrange(), (await s.served.store.load()).layouts, s.conflict.mock.calls.length]).toEqual([false, layouts('Buiten'), 0]);
});

test('what was not saved yet is gone when the right to arrange is taken', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  s.raw.request.mockImplementationOnce(() => new Promise(() => {}));
  await s.save({ ...config, layouts: layouts('Energie') });
  s.emit('role', 'use');
  await settle();
  expect([s.served.mayArrange(), (await s.served.store.load()).layouts, s.conflict.mock.calls.length]).toEqual([false, layouts('Buiten'), 0]);
});

test('a right that is taken while a layout is on its way: what the hub has is what is shown, and nothing is left to send', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  let answer: (value: unknown) => void = () => {};
  s.raw.request.mockImplementationOnce(() => new Promise((done) => { answer = done; }));
  await s.save({ ...config, layouts: layouts('Energie') });
  s.emit('role', 'use');
  await settle();
  answer({ revision: 2, layouts: layouts('Energie'), sectionSeeds: {} });
  await settle();
  expect([(await s.served.store.load()).layouts, s.served.settled()]).toEqual([layouts('Energie'), true]);
  const sent = s.sent.length;
  s.emit('role', 'edit');
  vi.advanceTimersByTime(10 * SAVE_EVERY_MS);
  await settle();
  expect(s.sent.slice(sent).filter(([method]) => method === 'PUT')).toEqual([]);
});

test('an app on the hub that began anew counts lower, and that is followed too', async () => {
  const s = storeSetup();
  await s.served.store.load();
  s.answers.set('GET api/layouts', () => ({ revision: 0, layouts: {}, sectionSeeds: {} }));
  s.emit('open', { revision: 0, role: 'edit', looks: null });
  await settle();
  expect([(await s.served.store.load()).layouts, s.changed.mock.calls.length]).toEqual([{}, 1]);
});

test('an answer from before this device was taken away changes nothing afterwards', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  let answer: (value: unknown) => void = () => {};
  s.raw.request.mockImplementationOnce(() => new Promise((done) => { answer = done; }));
  await s.served.store.save({ ...config, layouts: layouts('Energie') });
  await s.served.store.save({ ...config, connection: { ...config.connection, apiKey: null } });
  answer({ revision: 2, layouts: layouts('Energie'), sectionSeeds: {} });
  await settle();
  expect([s.served.mayArrange(), (await s.served.store.load()).layouts]).toEqual([false, {}]);
});

test('what another device saves comes in, also what was saved while this one was away', async () => {
  const s = storeSetup();
  await s.served.store.load();
  s.emit('open', { revision: 1, role: null, looks: null });
  await settle();
  expect(s.changed).not.toHaveBeenCalled();
  s.answers.set('GET api/layouts', () => ({ revision: 2, layouts: layouts('Nieuw'), sectionSeeds: {} }));
  s.emit('layouts', { revision: 2 });
  await settle();
  expect(s.changed).toHaveBeenCalledTimes(1);
  expect((await s.served.store.load()).layouts).toEqual(layouts('Nieuw'));
});

test('before the layouts were read nothing is written over them; reading is tried again', async () => {
  const s = storeSetup();
  const answer = s.answers.get('GET api/layouts')!;
  s.answers.delete('GET api/layouts');
  const config = await s.served.store.load();
  expect(s.served.mayArrange()).toBe(false);
  await s.save({ ...config, layouts: layouts('Leeg begonnen') });
  s.answers.set('GET api/layouts', answer);
  vi.advanceTimersByTime(SAVE_RETRY_MS);
  await settle();
  expect(s.sent.filter(([method]) => method === 'PUT')).toEqual([]);
  expect([s.served.mayArrange(), s.changed.mock.calls.length, (await s.served.store.load()).layouts]).toEqual([true, 1, layouts('Buiten')]);
});

test('pairing tells what went wrong, and afterwards the settings are read again', async () => {
  const s = storeSetup();
  s.answers.set('GET api/session', () => ({ paired: false }));
  expect((await s.served.store.load()).connection.apiKey).toBeNull();
  expect(await s.served.pair('1', 'x')).toBe('unreachable');
  for (const reason of ['code', 'locked', 'full'] as const) {
    s.answers.set('POST api/pair', refuse(403, { error: reason }));
    expect(await s.served.pair('1', 'x')).toBe(reason);
  }
  s.answers.set('POST api/pair', () => ({ device: {} }));
  s.answers.set('GET api/session', () => ({ paired: true, device: { name: 'x', role: 'edit' }, homeyId: HOMEY_ID }));
  expect(await s.served.pair('123456', 'x')).toBe('ok');
  expect((await s.served.store.load()).connection.apiKey).not.toBeNull();
});

test('unpairing this device forgets everything of the hub', async () => {
  const s = storeSetup();
  await s.served.store.load();
  s.answers.set('POST api/unpair', () => ({}));
  s.answers.set('GET api/session', () => ({ paired: false }));
  const config = await s.served.store.clearConnection();
  expect([config.connection.apiKey, config.layouts, s.values.get(PAIRED_KEY)]).toEqual([null, {}, undefined]);
});

test('a key that was refused (the owner took this device away) is remembered as gone', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  await s.save({ ...config, connection: { ...config.connection, apiKey: null } });
  expect((await s.served.store.load()).connection.apiKey).toBeNull();
  expect(s.values.get(PAIRED_KEY)).toBeUndefined();
});

test('a broken answer is no answer: this device is still paired', async () => {
  for (const answer of [null, 'x', {}, { paired: 'yes' }]) {
    const s = storeSetup();
    s.values.set(PAIRED_KEY, HOMEY_ID);
    s.answers.set('GET api/session', () => answer);
    expect([(await s.served.store.load()).connection.apiKey !== null, s.values.get(PAIRED_KEY)]).toEqual([true, HOMEY_ID]);
  }
});

test('reading the settings twice at once is reading them once', async () => {
  const s = storeSetup();
  const [one, two] = await Promise.all([s.served.store.load(), s.served.store.load()]);
  expect([one, s.sent.filter(([, path]) => path === 'api/session').length]).toEqual([two, 1]);
  expect(one.layouts).toEqual(layouts('Buiten'));
});

test('settings that were not read from the hub say nothing about the hub', async () => {
  const s = storeSetup();
  await s.served.store.load();
  // paired anew meanwhile: what the page still has is from before
  s.answers.set('POST api/pair', () => ({ device: {} }));
  await s.served.pair('123456', 'x');
  await s.save({ ...createDefaultConfig(), theme: { seed: '#a6422a', mode: 'dark', density: 'compact' } });
  expect([s.sent.filter(([method]) => method === 'PUT').length, s.values.get(PAIRED_KEY)]).toEqual([0, HOMEY_ID]);
  const config = await s.served.store.load();
  expect([config.connection.apiKey !== null, config.theme.mode, config.layouts]).toEqual([true, 'dark', layouts('Buiten')]);
});

test('news that comes while something is asked is not forgotten, also when the hub began anew', async () => {
  const s = storeSetup();
  await s.served.store.load();
  let revision = 2;
  s.answers.set('GET api/layouts', () => {
    const answer = { revision, layouts: layouts(`stand ${revision}`), sectionSeeds: {} };
    if (revision === 2) { revision = 3; s.emit('layouts', { revision: 3 }); }
    else if (revision === 3) { revision = 0; s.emit('open', { revision: 0, role: 'edit', looks: null }); }
    return answer;
  });
  s.emit('layouts', { revision: 2 });
  await settle();
  await settle();
  expect((await s.served.store.load()).layouts).toEqual(layouts('stand 0'));
  const count = s.sent.length;
  vi.advanceTimersByTime(60_000);
  await settle();
  expect(s.sent).toHaveLength(count);
});

test('the dashboard to start with belongs to this device: it stays in the browser', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  expect(config.startBoard).toBeNull();
  await s.save({ ...config, startBoard: 'd-1' });
  expect([s.values.get(STORAGE_KEY)!.includes('d-1'), s.sent.filter(([method]) => method === 'PUT').length]).toEqual([true, 0]);
  expect((await s.served.store.load()).startBoard).toBe('d-1');
  // it is written once, and lasts as long as the page in a browser that keeps nothing
  let writes = 0;
  s.values.set = () => { writes += 1; throw new Error('quota'); };
  await s.save({ ...config, startBoard: 'd-1' });
  expect(writes).toBe(0);
  await expect(s.save({ ...config, startBoard: null })).rejects.toThrow();
  expect((await s.served.store.load()).startBoard).toBeNull();
});

test('a wall tablet is one by itself: what is set up for it stays in the browser', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  expect(config.wall).toEqual(defaultWall());
  const wall = { ...defaultWall(), on: true };
  await s.save({ ...config, wall });
  expect(s.sent.filter(([method]) => method === 'PUT')).toHaveLength(0);
  expect((await s.served.store.load()).wall).toEqual(wall);
  // it does not go along with what the hub keeps
  await s.save({ ...config, wall, sectionSeeds: { 'type:lights': '#3b6939' } });
  expect(s.sent.filter(([method]) => method === 'PUT')).toHaveLength(1);
  expect(JSON.stringify(s.sent)).not.toContain('"wall"');
});

test('what is of this device is there before anything was asked of the hub', async () => {
  const s = storeSetup();
  const mine = { theme: { seed: '#a6422a', mode: 'dark', density: 'compact' }, wall: { ...defaultWall(), on: true } };
  s.values.set(STORAGE_KEY, JSON.stringify({ ...createDefaultConfig(), ...mine }));
  expect(s.served.store.peek!()).toMatchObject(mine);
  expect(s.sent).toHaveLength(0);
  // also what the browser refused to keep
  const config = await s.served.store.load();
  s.values.set = () => { throw new Error('quota'); };
  await expect(s.save({ ...config, wall: { ...defaultWall(), on: true, after: 10 } })).rejects.toThrow();
  expect(s.served.store.peek!().wall.after).toBe(10);
});

// ----- the wall tablet -----

test('the link passes on what a flow said of the night, and which version of the dashboard there is', () => {
  const s = linkSetup();
  const nights: unknown[] = [];
  const builds: string[] = [];
  s.link.on('night', (night) => nights.push(night));
  s.link.on('build', (build) => builds.push(build));
  s.link.hold();
  const { send } = s.streams[0]!;
  send('hello', { revision: 1, night: null, build: 'abc' });
  send('night', { night: true, age: 0 });
  send('hello', { revision: 1, night: { night: false, age: 4000 }, build: 'def' });
  expect([nights, builds]).toEqual([[null, { night: true, age: 0 }, { night: false, age: 4000 }], ['abc', 'def']]);
  // an older app on the hub, or half a word
  send('hello', { revision: 1 });
  for (const wrong of [{ night: 'x', age: 1 }, { night: true }, { night: true, age: -1 }, { night: true, age: 'x' }, null, 5]) {
    send('night', wrong);
    send('hello', { revision: 1, night: wrong === null ? 5 : wrong, build: '' });
  }
  expect([nights.length, builds.length]).toEqual([3, 2]);
});

test('whether everything that was arranged is on the hub', async () => {
  const s = storeSetup();
  const config = await s.served.store.load();
  expect(s.served.settled()).toBe(true);
  await s.save({ ...config, layouts: layouts('Zolder') });
  expect(s.served.settled()).toBe(false);
  s.answers.set('PUT api/layouts', () => ({ revision: 2, layouts: layouts('Zolder'), sectionSeeds: config.sectionSeeds }));
  for (let i = 0; i < 3; i += 1) {
    vi.advanceTimersByTime(SAVE_RETRY_MS);
    await settle();
  }
  expect(s.served.settled()).toBe(true);
});

test('rights that change are told, and read again after the way was gone', async () => {
  const c = await clientSetup();
  await c.client.connect();
  c.emit('hub', { type: 'scopes', scopes: ['homey.device', 'homey.flow.start'] });
  expect(c.events.at(-1)).toEqual({ type: 'scopes', scopes: ['homey.device', 'homey.flow.start'] });
  c.answers.set('GET api/snapshot', () => ({ snapshot: { ...c.snapshot, scopes: ['homey.device'] }, route: 'local' }));
  c.emit('hub', { type: 'reset' });
  await settle();
  expect(c.events.filter((event) => event.type === 'scopes').at(-1)).toEqual({ type: 'scopes', scopes: ['homey.device'] });
  // the same ones again are no news
  const before = c.events.filter((event) => event.type === 'scopes').length;
  c.emit('hub', { type: 'reset' });
  await settle();
  expect(c.events.filter((event) => event.type === 'scopes')).toHaveLength(before);
});

test('rights that are gone when everything is read again are told', async () => {
  const c = await clientSetup();
  expect((await c.client.connect()).scopes).not.toEqual([]);
  c.answers.set('GET api/snapshot', () => ({ snapshot: { ...c.snapshot, scopes: [] }, route: 'local' }));
  c.emit('hub', { type: 'reset' });
  await settle();
  expect(c.events.filter((event) => event.type === 'scopes')).toEqual([{ type: 'scopes', scopes: [] }]);
});

test('rights that change while everything is being read are newer', async () => {
  const c = await clientSetup();
  const opening = c.client.connect();
  await Promise.resolve();
  c.emit('hub', { type: 'scopes', scopes: ['homey.device'] });
  expect((await opening).scopes).toEqual(['homey.device']);
});

test('how flows may be started is told, laid over what is being read, and read again', async () => {
  const c = await clientSetup();
  c.answers.set('GET api/snapshot', () => ({ snapshot: { ...c.snapshot, flowAccess: 'none' }, route: 'local' }));
  const opening = c.client.connect();
  await Promise.resolve();
  c.emit('hub', { type: 'scopes', scopes: c.snapshot.scopes, flowAccess: 'refused' });
  expect((await opening).flowAccess).toBe('refused');
  c.emit('hub', { type: 'reset' });
  await settle();
  expect(c.events.filter((event) => event.type === 'scopes')).toEqual([{ type: 'scopes', scopes: c.snapshot.scopes, flowAccess: 'none' }]);
  c.emit('hub', { type: 'reset' });
  await settle();
  expect(c.events.filter((event) => event.type === 'scopes')).toHaveLength(1);
});
