// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HIDDEN_MS, servedEnvironment } from '../../src/ui/app/served';
import { STORAGE_KEY } from '../../src/storage/local-store';
import { SAVE_EVERY_MS } from '../../src/served/store';
import { fakeHub, HOMEY_ID } from '../helpers/fake-hub';
import { board, hubLayout } from '../helpers/layout';

// What a page that the app on the hub served does when nobody looks at it, when it closes, and beside another tab.

class FakeStream {
  static all: FakeStream[] = [];
  readyState = 0;
  closed = false;
  private on = new Map<string, (event: { data: string }) => void>();
  constructor(readonly url: string) { FakeStream.all.push(this); }
  addEventListener(type: string, listener: (event: { data: string }) => void) { this.on.set(type, listener); }
  close() { this.closed = true; }
  hello(more: Record<string, unknown> = {}) { this.send('hello', { revision: 1, role: 'edit', route: 'local', ...more }); }
  send(type: string, data: unknown) { this.on.get(type)?.({ data: JSON.stringify(data) }); }
}
const open = () => FakeStream.all.filter((stream) => !stream.closed);

let hidden = false;
const puts: string[] = [];
const clients: { disconnect(): void }[] = [];
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const look = (away: boolean) => { hidden = away; document.dispatchEvent(new Event('visibilitychange')); };

beforeEach(() => {
  vi.useFakeTimers();
  FakeStream.all = [];
  puts.length = 0;
  hidden = false;
  localStorage.clear();
  vi.stubGlobal('EventSource', FakeStream);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => (hidden ? 'hidden' : 'visible'));
  vi.spyOn(window, 'fetch').mockImplementation(async (path, init) => {
    if (init?.method === 'PUT') puts.push(String(init.body));
    const snapshot = await fakeHub().connect();
    const body = path === 'api/session' ? { paired: true, device: { name: 'x', role: 'edit' }, homeyId: HOMEY_ID }
      : path === 'api/layouts' ? { revision: 1 + puts.length, layouts: {}, sectionSeeds: {} } : { snapshot, route: 'local' };
    return new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => { for (const client of clients.splice(0)) client.disconnect(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function connected() {
  const env = servedEnvironment(() => fakeHub());
  const config = await env.configStore.load();
  const client = env.createRealClient({ homeyId: HOMEY_ID, localAddress: null, apiKey: 'paired' })!;
  clients.push(client);
  const connecting = client.connect();
  await settle();
  FakeStream.all[0]!.hello();
  await connecting;
  return { env, config, client };
}

test('a tab that is out of sight for a while lets go of its stream, and takes it again in sight', async () => {
  await connected();
  look(true);
  vi.advanceTimersByTime(HIDDEN_MS - 1);
  expect(open()).toHaveLength(1);
  look(false);
  vi.advanceTimersByTime(1);
  expect(open()).toHaveLength(1);
  look(true);
  vi.advanceTimersByTime(HIDDEN_MS);
  expect(open()).toHaveLength(0);
  look(false);
  expect(open()).toHaveLength(1);
});

test('a page that comes back, or gets its network back, looks whether its stream still lives', async () => {
  await connected();
  for (const event of [new Event('pageshow'), new Event('online')]) {
    const count = FakeStream.all.length;
    vi.setSystemTime(Date.now() + 3_600_000);
    window.dispatchEvent(event);
    expect([FakeStream.all.length, open().length]).toEqual([count + 1, 1]);
    open()[0]!.hello();
    await settle();
  }
});

test('what is not saved yet is sent when the page goes out of sight or closes', async () => {
  const { env, config } = await connected();
  const layouts = (name: string) => ({ [HOMEY_ID]: hubLayout([board('d-1', [], { name })]) });
  for (const [name, leave] of [['b', () => look(true)], ['d', () => window.dispatchEvent(new Event('pagehide'))]] as const) {
    vi.advanceTimersByTime(SAVE_EVERY_MS);
    await env.configStore.save({ ...config, layouts: layouts(`first ${name}`) });
    await settle();
    const count = puts.length;
    await env.configStore.save({ ...config, layouts: layouts(name) });
    await settle();
    expect(puts).toHaveLength(count);
    leave();
    await settle();
    expect([puts.length, puts.at(-1)!.includes(`"name":"${name}"`)]).toEqual([count + 1, true]);
  }
});

test('a theme that is chosen in another tab of this device comes in', async () => {
  const { env } = await connected();
  const changed = vi.fn();
  const stop = env.watchStored!(changed);
  window.dispatchEvent(new StorageEvent('storage', { key: 'something else' }));
  expect(changed).not.toHaveBeenCalled();
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  expect(changed).toHaveBeenCalledTimes(1);
  stop();
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  expect(changed).toHaveBeenCalledTimes(1);
});

test('what a flow said is told with the time it was said, on the clock of this device', async () => {
  const { env } = await connected();
  const heard = vi.fn();
  env.served!.onNight(heard);
  open()[0]!.send('night', { night: true, age: 60_000 });
  open()[0]!.hello({ night: null });
  expect(heard.mock.calls).toEqual([[{ night: true, at: Date.now() - 60_000 }], [null]]);
});

test('another version of the dashboard is told once; the one this page is, is not', async () => {
  const { env } = await connected();
  const heard = vi.fn();
  env.served!.onNewBuild(heard);
  const stream = open()[0]!;
  for (const build of ['one', 'one', '', 'one']) stream.hello({ build });
  expect(heard).not.toHaveBeenCalled();
  stream.hello({ build: 'two' });
  stream.hello({ build: 'two' });
  expect(heard).toHaveBeenCalledTimes(1);
  stream.hello({ build: 'three' });
  expect(heard).toHaveBeenCalledTimes(2);
});

test('the version this page is, is known however late somebody asks to hear of another', async () => {
  const { env } = await connected();
  const stream = open()[0]!;
  stream.hello({ build: 'one' });
  const heard = vi.fn();
  env.served!.onNewBuild(heard);
  stream.hello({ build: 'two' });
  expect(heard).toHaveBeenCalledTimes(1);
});

test('a page that was opened with a scanned code knows it, and the address does not show it any more', async () => {
  window.location.hash = '#pair=482913';
  const env = servedEnvironment(() => fakeHub());
  expect([env.served!.scanned(), window.location.hash]).toEqual(['482913', '']);
  const heard: string[] = [];
  env.served!.onScanned((code) => heard.push(code));
  // scanned again in the same tab
  window.location.hash = '#pair=555666';
  window.dispatchEvent(new Event('hashchange'));
  window.location.hash = '#elsewhere';
  window.dispatchEvent(new Event('hashchange'));
  expect([heard, window.location.hash]).toEqual([['555666'], '#elsewhere']);
  window.location.hash = '';
  expect(['phone', 'tablet', 'laptop']).toContain(env.served!.kind());
});
