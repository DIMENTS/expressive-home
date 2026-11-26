import { beforeEach, expect, test, vi } from 'vitest';
import { createAppLive, LIVE_TIMES, type LiveLink } from '../../src/widgets/app-live';
import type { LinkEvents } from '../../src/served/link';

beforeEach(() => { vi.useFakeTimers(); return () => { vi.useRealTimers(); }; });
const settle = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

function setup(answer: () => Promise<unknown> = async () => ({})) {
  const on = new Map<string, Set<(value: never) => void>>();
  const sent: unknown[] = [];
  const link: LiveLink = {
    on: (type, listener) => {
      const set = on.get(type) ?? new Set();
      set.add(listener as (value: never) => void);
      on.set(type, set);
      return () => { set.delete(listener as (value: never) => void); };
    },
    request: (_method, path, body) => { sent.push([path, body]); return answer(); },
  };
  const emit = <K extends 'open' | 'app-event' | 'app-gap'>(type: K, value: LinkEvents[K]): void => { for (const fn of on.get(type) ?? []) (fn as (v: LinkEvents[K]) => void)(value); };
  let random = 0;
  const live = createAppLive({ link, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), random: () => random });
  return { live, emit, sent, setRandom: (value: number) => { random = value; } };
}

function widget(names: string[] = []) {
  const heard: [string, unknown][] = [];
  let restarts = 0;
  const listener = { names: () => names, news: (event: string, data: unknown) => heard.push([event, data]), restart: () => { restarts += 1; } };
  return { listener, heard, names, restarts: () => restarts };
}

const open = (stream?: string, gap?: number) => ({ revision: 1, role: 'edit' as const, looks: null, ...(stream ? { stream } : {}), ...(gap === undefined ? {} : { gap }) });

test('the page tells the hub, for its stream, which widgets listen to which names, once they settle', async () => {
  const s = setup();
  s.emit('open', open('s1'));
  const a = widget(['state']);
  const handle = s.live.listen('app:com.example/channels', a.listener);
  handle.changed();
  a.names.push('alarm');
  handle.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs - 1);
  expect(s.sent).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(s.sent).toEqual([['api/app-live', { stream: 's1', wants: [{ ref: 'app:com.example/channels', events: ['state', 'alarm'] }] }]]);
  // nothing new: nothing sent
  handle.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toHaveLength(1);
});

test('two tiles of one widget are one want; a tile that goes takes its names with it', () => {
  const s = setup();
  s.emit('open', open('s1'));
  const a = s.live.listen('app:com.example/channels', widget(['state']).listener);
  s.live.listen('app:com.example/channels', widget(['state', 'alarm']).listener).changed();
  a.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent.at(-1)).toEqual(['api/app-live', { stream: 's1', wants: [{ ref: 'app:com.example/channels', events: ['state', 'alarm'] }] }]);
  a.stop();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toHaveLength(1);
});

test('every new stream hears the wants again; without a number of its stream nothing is sent', () => {
  const s = setup();
  const a = s.live.listen('app:com.example/channels', widget(['state']).listener);
  a.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toEqual([]);
  s.emit('open', open());
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toEqual([]);
  s.emit('open', open('s1'));
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  s.emit('open', open('s2', 2000));
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent.map((entry) => (entry as [string, { stream: string }])[1].stream)).toEqual(['s1', 's2']);
});

test('a page without widgets of apps says nothing; one that had them says that they went', async () => {
  const s = setup();
  s.emit('open', open('s1'));
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toEqual([]);
  const a = s.live.listen('app:com.example/channels', widget(['state']).listener);
  a.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  await settle();
  a.stop();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent.at(-1)).toEqual(['api/app-live', { stream: 's1', wants: [] }]);
});

test('news goes to the widgets of its app that listen to its name', () => {
  const s = setup();
  const a = widget(['state']);
  const b = widget(['alarm']);
  const c = widget(['state']);
  s.live.listen('app:com.example/channels', a.listener);
  s.live.listen('app:com.example/other', b.listener);
  s.live.listen('app:org.else/w', c.listener);
  s.emit('app-event', { app: 'com.example', event: 'state', data: 1 });
  s.emit('app-event', { app: 'com.example', event: 'alarm', data: 2 });
  expect([a.heard, b.heard, c.heard]).toEqual([[['state', 1]], [['alarm', 2]], []]);
});

test('own widgets and odd refs never listen', () => {
  const s = setup();
  s.emit('open', open('s1'));
  const a = widget(['state']);
  s.live.listen('own:gauge', a.listener).changed();
  s.live.listen('clock', a.listener).changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  s.emit('app-event', { app: 'own', event: 'state', data: 1 });
  expect([s.sent, a.heard]).toEqual([[], []]);
});

test('after a long silence of the hub, or news the hub missed, the widgets start anew, spread out', () => {
  const s = setup();
  s.emit('open', open('s1'));
  const a = widget(['state']);
  const b = widget(['state']);
  s.live.listen('app:com.example/channels', a.listener);
  s.live.listen('app:org.else/w', b.listener);
  s.emit('open', open('s2', LIVE_TIMES.restartAfterMs));
  vi.advanceTimersByTime(LIVE_TIMES.spreadMs);
  expect([a.restarts(), b.restarts()]).toEqual([0, 0]);
  s.setRandom(0.5);
  s.emit('open', open('s3', LIVE_TIMES.restartAfterMs + 1));
  vi.advanceTimersByTime(LIVE_TIMES.spreadMs / 2 - 1);
  expect(a.restarts()).toBe(0);
  vi.advanceTimersByTime(1);
  expect([a.restarts(), b.restarts()]).toEqual([1, 1]);
  s.emit('app-gap', { app: 'com.example' });
  vi.advanceTimersByTime(LIVE_TIMES.spreadMs);
  expect([a.restarts(), b.restarts()]).toEqual([2, 1]);
});

test('a widget that goes before its turn to start anew is not started', () => {
  const s = setup();
  const a = widget(['state']);
  const handle = s.live.listen('app:com.example/channels', a.listener);
  s.setRandom(0.9);
  s.emit('app-gap', { app: 'com.example' });
  handle.stop();
  vi.advanceTimersByTime(LIVE_TIMES.spreadMs);
  expect(a.restarts()).toBe(0);
});

test('what the hub did not take is tried again, ever more slowly, while the stream is the same', async () => {
  let fail = true;
  const s = setup(async () => { if (fail) throw new Error('no'); return {}; });
  s.emit('open', open('s1'));
  s.live.listen('app:com.example/channels', widget(['state']).listener).changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  await settle();
  expect(s.sent).toHaveLength(1);
  vi.advanceTimersByTime(LIVE_TIMES.retryMs[0]!);
  await settle();
  expect(s.sent).toHaveLength(2);
  fail = false;
  vi.advanceTimersByTime(LIVE_TIMES.retryMs[1]!);
  await settle();
  expect(s.sent).toHaveLength(3);
  vi.advanceTimersByTime(600_000);
  await settle();
  expect(s.sent).toHaveLength(3);
});

test('what is told keeps to the limits of the hub: twenty widgets, fifty names each', () => {
  const s = setup();
  s.emit('open', open('s1'));
  for (let i = 0; i < 25; i += 1) s.live.listen(`app:com.example/w${i}`, widget(Array.from({ length: 30 }, (_, n) => `n${n}`)).listener);
  const extra = s.live.listen('app:com.example/w0', widget(Array.from({ length: 30 }, (_, n) => `m${n}`)).listener);
  extra.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  const { wants } = (s.sent[0] as [string, { wants: { ref: string; events: string[] }[] }])[1];
  expect(wants).toHaveLength(20);
  expect(wants[0]!.events).toHaveLength(50);
});

test('what the hub refused is not told again until it changes; one telling at a time, the newest after it', async () => {
  const { RequestError } = await import('../../src/served/link');
  let answer: () => Promise<unknown> = async () => { throw new RequestError(400, { error: 'bad-wants' }); };
  const waiting: (() => void)[] = [];
  const s = setup(() => answer());
  s.emit('open', open('s1'));
  const names = ['state'];
  const handle = s.live.listen('app:com.example/channels', widget(names).listener);
  handle.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  await settle();
  vi.advanceTimersByTime(600_000);
  await settle();
  expect(s.sent).toHaveLength(1);
  answer = () => new Promise((done) => { waiting.push(() => done({})); });
  names.push('alarm');
  handle.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  names.push('third');
  handle.changed();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toHaveLength(2);
  waiting.shift()!();
  await settle();
  vi.advanceTimersByTime(LIVE_TIMES.sendMs);
  expect(s.sent).toHaveLength(3);
  expect((s.sent[2] as [string, { wants: { events: string[] }[] }])[1].wants[0]!.events).toEqual(['state', 'alarm', 'third']);
});
