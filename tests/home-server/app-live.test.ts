import { beforeEach, expect, test, vi } from 'vitest';
import { createHubLive, HUB_LIVE, listedFrom, parseWants, placedAppWidgets, type LiveHandlers, type LiveSession } from '../../src/home-server/app-live';
import { board, hubLayout, ownSection, tileLayout } from '../helpers/layout';

beforeEach(() => { vi.useFakeTimers(); return () => { vi.useRealTimers(); }; });
const settle = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

const A = 'app:com.example/channels';
const B = 'app:org.radio/now';

function fakeSession() {
  const subs = new Map<string, LiveHandlers>();
  const state = { connected: true, destroyed: false, refuse: null as null | ((uri: string) => unknown), asked: [] as string[], dropped: [] as string[] };
  const session: LiveSession = {
    subscribe: async (uri, handlers) => {
      state.asked.push(uri);
      const error = state.refuse?.(uri);
      if (error) throw error;
      subs.set(uri, handlers);
      return { unsubscribe: () => { state.dropped.push(uri); subs.delete(uri); } };
    },
    isConnected: () => state.connected,
    destroy: () => { state.destroyed = true; },
  };
  const tell = (app: string, event: string, data: unknown): void => subs.get(`homey:app:${app}`)?.onEvent(event, data);
  return { session, subs, state, tell };
}

function setup(options: { listed?: string[] | null | 'refused'; placed?: string[]; key?: boolean } = {}) {
  const sessions: ReturnType<typeof fakeSession>[] = [];
  let next: (() => ReturnType<typeof fakeSession>) = fakeSession;
  const world = { listed: options.listed === undefined ? [A, B] : options.listed, placed: options.placed ?? [A, B], key: options.key ?? true, opens: 0, openFails: false, hang: null as null | ((session: LiveSession | null) => void) };
  const sent: [string[], string, unknown][] = [];
  const logs: string[] = [];
  const live = createHubLive({
    open: async () => {
      world.opens += 1;
      if (world.hang) {
        const made = next();
        sessions.push(made);
        return new Promise<LiveSession | null>((done) => { world.hang = () => done(made.session); });
      }
      if (world.openFails) throw new Error('The id of the hub is not known yet');
      if (!world.key) return null;
      const made = next();
      sessions.push(made);
      return made.session;
    },
    hasKey: () => world.key,
    listed: async () => (world.listed === null || world.listed === 'refused' ? world.listed : new Set(world.listed)),
    placed: () => new Set(world.placed),
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), now: () => Date.now(),
    log: (message) => logs.push(message),
  });
  live.subscribe((streams, event, text) => sent.push([[...streams].sort(), event, JSON.parse(text)]));
  const synced = async () => { await vi.advanceTimersByTimeAsync(HUB_LIVE.syncMs); await settle(); };
  return { live, sessions, world, sent, logs, synced, setNext: (make: () => ReturnType<typeof fakeSession>) => { next = make; } };
}

test('the app listens to the apps of the widgets that pages listen to, once, and only while they are placed and Homey has them', async () => {
  const s = setup({ listed: [A], placed: [A, B] });
  s.live.want('s1', [{ ref: A, events: ['state'] }, { ref: B, events: ['now'] }]);
  s.live.want('s2', [{ ref: A, events: ['alarm'] }]);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.syncMs - 1);
  expect(s.sessions).toHaveLength(0);
  await s.synced();
  expect(s.sessions).toHaveLength(1);
  expect(s.sessions[0]!.state.asked).toEqual(['homey:app:com.example']);
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
  s.world.listed = [A, B];
  s.world.placed = [B];
  s.live.placedChanged();
  await s.synced();
  expect(s.sessions[0]!.state.asked).toEqual(['homey:app:com.example', 'homey:app:org.radio']);
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
  // an app that is no longer wanted is let go after a while
  expect(s.sessions[0]!.state.dropped).toEqual([]);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.releaseMs);
  await settle();
  expect(s.sessions[0]!.state.dropped).toEqual(['homey:app:com.example']);
  s.live.drop('s1');
  await s.synced();
  expect([s.sessions[0]!.state.destroyed, s.live.state()]).toEqual([false, { state: 'idle', apps: 0 }]);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.releaseMs);
  await settle();
  expect(s.sessions[0]!.state.destroyed).toBe(true);
});

test('news goes once, as it came, only to the streams that asked for that app and name', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  s.live.want('s2', [{ ref: A, events: ['state', 'alarm'] }]);
  s.live.want('s3', [{ ref: B, events: ['state'] }]);
  await s.synced();
  const hub = s.sessions[0]!;
  hub.tell('com.example', 'state', { on: true });
  hub.tell('com.example', 'alarm', 1);
  hub.tell('com.example', 'settings.set', 'token');
  hub.tell('com.example', 'odd name', 2);
  expect(s.sent).toEqual([
    [['s1', 's2'], 'app-event', { app: 'com.example', event: 'state', data: { on: true } }],
    [['s2'], 'app-event', { app: 'com.example', event: 'alarm', data: 1 }],
  ]);
});

test('a message that is too big is left out, and said once a minute without what was in it', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  const big = 'x'.repeat(HUB_LIVE.messageBytes);
  s.sessions[0]!.tell('com.example', 'state', big);
  s.sessions[0]!.tell('com.example', 'state', big);
  expect(s.sent).toEqual([]);
  expect(s.logs.filter((line) => line.includes('com.example'))).toHaveLength(1);
  expect(s.logs.join()).not.toContain('xxx');
});

test('an app that says a lot is held to its limit; the newest of every name comes when it may', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['a', 'b'] }]);
  await s.synced();
  for (let i = 0; i < HUB_LIVE.messages + 5; i += 1) s.sessions[0]!.tell('com.example', i % 2 === 0 ? 'a' : 'b', i);
  expect(s.sent).toHaveLength(HUB_LIVE.messages);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.windowMs);
  expect(s.sent.slice(HUB_LIVE.messages).map(([, , body]) => body)).toEqual([{ app: 'com.example', event: 'a', data: 24 }, { app: 'com.example', event: 'b', data: 23 }]);
  // bytes count too
  const s2 = setup();
  s2.live.want('s1', [{ ref: A, events: ['a'] }]);
  await s2.synced();
  const piece = 'y'.repeat(20_000);
  for (let i = 0; i < 5; i += 1) s2.sessions[0]!.tell('com.example', 'a', `${i}${piece}`);
  expect(s2.sent.length).toBeLessThan(5);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.windowMs);
  expect((s2.sent.at(-1)![2] as { data: string }).data.startsWith('4')).toBe(true);
});

test('a first try that fails is tried again with a new session, and pages hear that news may have been missed', async () => {
  const s = setup();
  s.setNext(() => {
    const made = fakeSession();
    if (s.sessions.length === 0) { made.state.connected = false; made.state.refuse = () => new Error('timeout'); }
    return made;
  });
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  expect(s.live.state()).toEqual({ state: 'waiting', apps: 0 });
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect([s.sessions.length, s.sessions[0]!.state.destroyed]).toEqual([2, true]);
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
  expect(s.sent).toEqual([[['s1'], 'app-gap', { app: 'com.example' }]]);
});

test('one app that cannot be listened to is tried again by itself; the others go on', async () => {
  const s = setup();
  let refuse = true;
  s.setNext(() => { const made = fakeSession(); made.state.refuse = (uri) => (refuse && uri.endsWith('radio') ? new Error('no such app') : null); return made; });
  s.live.want('s1', [{ ref: A, events: ['state'] }, { ref: B, events: ['now'] }]);
  await s.synced();
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
  refuse = false;
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect([s.sessions.length, s.live.state()]).toEqual([1, { state: 'on', apps: 2 }]);
});

test('a key the hub refuses is said so; once it works again that goes', async () => {
  const s = setup();
  let refused = true;
  s.setNext(() => { const made = fakeSession(); made.state.connected = !refused; made.state.refuse = () => (refused ? Object.assign(new Error('Unauthorized'), { statusCode: 401 }) : null); return made; });
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  expect(s.live.state()).toEqual({ state: 'refused', apps: 0 });
  refused = false;
  s.live.restart();
  await settle();
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
});

test('without a key that may do everything nothing is tried until the key changes', async () => {
  const s = setup({ key: false });
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  expect(s.live.state()).toEqual({ state: 'none', apps: 0 });
  await vi.advanceTimersByTimeAsync(600_000);
  expect(s.world.opens).toBe(0);
  s.world.key = true;
  s.live.restart();
  await settle();
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
});

test('while the id of the hub is not known it is tried again', async () => {
  const s = setup();
  s.world.openFails = true;
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  expect(s.live.state()).toEqual({ state: 'waiting', apps: 0 });
  s.world.openFails = false;
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
});

test('a session that stays without connection, or fails to come back, is replaced; one that came back says news may be missed', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  const first = s.sessions[0]!;
  first.subs.get('homey:app:com.example')!.onReconnect?.();
  expect(s.sent).toEqual([[['s1'], 'app-gap', { app: 'com.example' }]]);
  first.state.connected = false;
  await vi.advanceTimersByTimeAsync(HUB_LIVE.silentMs + HUB_LIVE.watchMs);
  await settle();
  expect([first.state.destroyed, s.sessions.length]).toEqual([true, 1]);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect(s.sessions).toHaveLength(2);
  s.sessions[1]!.subs.get('homey:app:com.example')!.onReconnectError?.(new Error('gone'));
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect([s.sessions[1]!.state.destroyed, s.sessions.length]).toEqual([true, 3]);
});

test('a new key or a new connection of the app itself starts anew at once', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  s.live.restart();
  await settle();
  expect([s.sessions[0]!.state.destroyed, s.sessions.length, s.sessions[1]!.state.asked]).toEqual([true, 2, ['homey:app:com.example']]);
  // what the old session still says, is not passed on
  s.sessions[0]!.tell('com.example', 'state', 'old');
  expect(s.sent.filter(([, event]) => event === 'app-event')).toEqual([]);
});

test('without the list of Homey nothing is listened to, and it is asked again', async () => {
  const s = setup({ listed: null });
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  expect(s.sessions).toHaveLength(0);
  s.world.listed = [A];
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
});

test('what a page wants is read with care', () => {
  expect(parseWants([{ ref: A, events: ['state', 'state', 'alarm'] }, { ref: 'own:gauge', events: ['x'] }, { ref: B, events: ['bad name', 7] }, 'x'])).toEqual([{ ref: A, events: ['state', 'alarm'] }, { ref: B, events: [] }]);
  expect(parseWants('x')).toBeNull();
  // too many are cut off, not refused: the rest still gets its news
  expect(parseWants(Array.from({ length: HUB_LIVE.refs + 1 }, () => ({ ref: A, events: [] })))).toHaveLength(HUB_LIVE.refs);
  expect(parseWants([{ ref: A, events: Array.from({ length: HUB_LIVE.names + 1 }, (_, i) => `n${i}`) }])![0]!.events).toHaveLength(HUB_LIVE.names);
  expect(parseWants([{ ref: 'app:Com.Example/x', events: [] }])).toEqual([]);
});

test('the widgets of apps placed on the dashboards of the house are found', () => {
  const widget = (ref: string) => tileLayout({ kind: 'widget', id: `w-${ref}`, size: 'single', widget: ref, settings: {} });
  const layout = hubLayout([board('b1', [ownSection('s1', [widget(A), widget('clock')])]), board('b2', [ownSection('s2', [widget(B)])])]);
  expect(placedAppWidgets({ revision: 1, layouts: { hub: layout }, sectionSeeds: {} })).toEqual(new Set([A, B]));
});

test('an app that comes back while it is not let go yet just goes on; a key that went lets go at once', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  s.live.drop('s1');
  await s.synced();
  await vi.advanceTimersByTimeAsync(HUB_LIVE.releaseMs / 2);
  s.live.want('s2', [{ ref: A, events: ['state'] }]);
  await s.synced();
  await vi.advanceTimersByTimeAsync(HUB_LIVE.releaseMs);
  await settle();
  expect([s.sessions.length, s.sessions[0]!.state.asked, s.sessions[0]!.state.dropped, s.sent]).toEqual([1, ['homey:app:com.example'], [], []]);
  s.sessions[0]!.tell('com.example', 'state', 1);
  expect(s.sent).toEqual([[['s2'], 'app-event', { app: 'com.example', event: 'state', data: 1 }]]);
  s.world.key = false;
  s.live.restart();
  await settle();
  expect([s.sessions[0]!.state.destroyed, s.live.state()]).toEqual([true, { state: 'none', apps: 0 }]);
});

test('a page that keeps changing does not hold up what others want: at most one wait after the first change', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  for (let i = 0; i < 10; i += 1) {
    await vi.advanceTimersByTimeAsync(HUB_LIVE.syncMs / 2);
    s.live.want('s2', [{ ref: B, events: [`n${i}`] }]);
  }
  await settle();
  expect(s.sessions).toHaveLength(1);
  expect(s.sessions[0]!.state.asked).toContain('homey:app:com.example');
});

test('a session that does not come is given up after a while, and one that comes too late is closed', async () => {
  const s = setup();
  s.world.hang = () => {};
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  const late = s.world.hang;
  s.world.hang = null;
  await vi.advanceTimersByTimeAsync(HUB_LIVE.openMs);
  await settle();
  expect(s.live.state()).toEqual({ state: 'waiting', apps: 0 });
  await vi.advanceTimersByTimeAsync(HUB_LIVE.retryMs[0]!);
  await settle();
  expect(s.live.state()).toEqual({ state: 'on', apps: 1 });
  late!(null);
  await settle();
  expect([s.sessions[0]!.state.destroyed, s.sessions[1]!.state.destroyed]).toEqual([true, false]);
});

test('a key that may not read the list of widgets is said to be refused', async () => {
  const s = setup({ listed: 'refused' });
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await s.synced();
  expect(s.live.state()).toEqual({ state: 'refused', apps: 0 });
});

test('the limits count bytes, not characters', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['a'] }]);
  await s.synced();
  // three bytes a character
  s.sessions[0]!.tell('com.example', 'a', '€'.repeat(Math.ceil(HUB_LIVE.messageBytes / 3)));
  expect(s.sent).toEqual([]);
});

test('a want that did not change does not wait anew', async () => {
  const s = setup();
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await vi.advanceTimersByTimeAsync(HUB_LIVE.syncMs - 1);
  s.live.want('s1', [{ ref: A, events: ['state'] }]);
  await vi.advanceTimersByTimeAsync(1);
  await settle();
  expect(s.sessions).toHaveLength(1);
});

test('what the hub answers for its list of widgets is read as a list, as no answer, or as a refusal', () => {
  expect(listedFrom({ status: 200, body: { 'homey:app:com.example:channels': { id: 'homey:app:com.example:channels' } } })).toEqual(new Set([A]));
  expect(listedFrom(null)).toBeNull();
  expect(listedFrom({ status: 500, body: null })).toBeNull();
  expect(listedFrom({ status: 401, body: null })).toBe('refused');
  expect(listedFrom({ status: 403, body: null })).toBe('refused');
});
