import { expect, test, vi } from 'vitest';
import { createAppWidgetBridge, decodeCrossframe, encodeCrossframe } from '../../src/widgets/crossframe';

test('messages in the form of Homey\'s widgets go back and forth unchanged', () => {
  const message = { type: 'tx', event: 'setHeight', data: 200, callbackId: 3 } as const;
  const text = encodeCrossframe(message);
  expect(text.startsWith('CF2_MESSAGE')).toBe(true);
  expect(decodeCrossframe(text)).toEqual(message);
  expect(decodeCrossframe('CF2_MESSAGEzz')).toBeNull();
  expect(decodeCrossframe({ type: 'tx' })).toBeNull();
});

function bed(api = vi.fn(async (): Promise<{ status: number; body: unknown } | null> => ({ status: 200, body: { temp: 4 } }))) {
  const sent: unknown[] = [];
  const states: string[] = [];
  const heights: number[] = [];
  const bridge = createAppWidgetBridge({
    post: (text) => sent.push(decodeCrossframe(text)), initial: () => ({ settings: { city: 'Utrecht' }, language: 'nl' }),
    api, onReady: () => states.push('ready'), onHeight: (px) => heights.push(px),
  });
  const ask = (event: string, data: unknown, callbackId = 1) => bridge.receive(encodeCrossframe({ type: 'tx', event, data, callbackId }));
  return { bridge, sent, states, heights, ask, api };
}

test('the widget gets its settings, can say it is ready and how high it is', async () => {
  const b = bed();
  await b.ask('getInitialData', null, 1);
  expect(b.sent[0]).toMatchObject({ type: 'cb', callbackId: 1, args: [null, { settings: { city: 'Utrecht' }, language: 'nl' }] });
  await b.ask('ready', null, 2);
  await b.ask('setHeight', 180, 3);
  expect(b.states).toEqual(['ready']);
  expect(b.heights).toEqual([180]);
});

test('what it asks of its own back end goes through the app on the hub; a popup is refused', async () => {
  const b = bed();
  await b.ask('api', { method: 'GET', path: '/forecast', body: null }, 4);
  expect(b.api).toHaveBeenCalledWith('GET', '/forecast', null);
  expect(b.sent.at(-1)).toMatchObject({ type: 'cb', callbackId: 4, args: [null, { temp: 4 }] });
  await b.ask('popup', { url: 'https://example.com' }, 5);
  expect(b.sent.at(-1)).toMatchObject({ type: 'cb', callbackId: 5, args: [{ type: 'Error' }] });
});

test('a refused route is an error for the widget', async () => {
  const b = bed(vi.fn(async (): Promise<{ status: number; body: unknown } | null> => null));
  await b.ask('api', { method: 'GET', path: '/x' }, 6);
  expect(b.sent.at(-1)).toMatchObject({ args: [{ type: 'Error' }] });
});

test('the height a widget asks for when it is ready is taken too, as Homey does', async () => {
  const b = bed();
  await b.ask('ready', { height: 382 }, 7);
  await b.ask('ready', null, 8);
  expect(b.heights).toEqual([382]);
  expect(b.states).toEqual(['ready', 'ready']);
});

function liveBed(api = vi.fn(async (): Promise<{ status: number; body: unknown } | null> => ({ status: 200, body: { temp: 4 } }))) {
  const sent: unknown[] = [];
  const heard: string[][] = [];
  const bridge = createAppWidgetBridge({
    post: (text) => sent.push(decodeCrossframe(text)), initial: () => ({}), api, onReady: () => {}, onHeight: () => {},
    onListen: (names) => heard.push(names),
  });
  const ask = (event: string, data: unknown, callbackId: number | null = 1) => bridge.receive(encodeCrossframe({ type: 'tx', event, data, callbackId }));
  return { bridge, sent, heard, ask, api };
}

test('a widget that listens gets no answer until there is news, and then one for every piece of news', async () => {
  const b = liveBed();
  await b.ask('registerRealtimeListener', 'state', 7);
  expect(b.sent).toEqual([]);
  b.bridge.deliver('state', { on: true });
  b.bridge.deliver('state', { on: false });
  expect(b.sent).toEqual([{ type: 'cb', callbackId: 7, args: [{ on: true }] }, { type: 'cb', callbackId: 7, args: [{ on: false }] }]);
});

test('news goes to every listener of its name and to no other', async () => {
  const b = liveBed();
  await b.ask('registerRealtimeListener', 'state', 3);
  await b.ask('registerRealtimeListener', 'state', 4);
  await b.ask('registerRealtimeListener', 'alarm', 5);
  b.bridge.deliver('state', 1);
  b.bridge.deliver('other', 2);
  expect(b.sent).toEqual([{ type: 'cb', callbackId: 3, args: [1] }, { type: 'cb', callbackId: 4, args: [1] }]);
  expect(b.bridge.names()).toEqual(['state', 'alarm']);
  expect(b.heard.at(-1)).toEqual(['state', 'alarm']);
});

test('a listener goes by its name or by its number, and that is answered', async () => {
  const b = liveBed();
  await b.ask('registerRealtimeListener', 'state', 3);
  await b.ask('registerRealtimeListener', 'state', 4);
  await b.ask('registerRealtimeListener', 'alarm', 5);
  await b.ask('unregisterRealtimeListener', 4, 6);
  expect(b.sent).toEqual([{ type: 'cb', callbackId: 6, args: [null] }]);
  b.bridge.deliver('state', 'a');
  expect(b.sent.at(-1)).toEqual({ type: 'cb', callbackId: 3, args: ['a'] });
  await b.ask('unregisterRealtimeListener', 'state', 8);
  b.sent.length = 0;
  b.bridge.deliver('state', 'b');
  expect(b.sent).toEqual([]);
  expect(b.bridge.names()).toEqual(['alarm']);
  expect(b.heard.at(-1)).toEqual(['alarm']);
});

test('odd names, listeners without a number and too many listeners are left out', async () => {
  const b = liveBed();
  await b.ask('registerRealtimeListener', 'has space', 1);
  await b.ask('registerRealtimeListener', 'x'.repeat(65), 2);
  await b.ask('registerRealtimeListener', { name: 'state' }, 3);
  await b.ask('registerRealtimeListener', 'state', null);
  expect(b.bridge.names()).toEqual([]);
  for (let id = 10; id < 70; id += 1) await b.ask('registerRealtimeListener', `n${id}`, id);
  expect(b.bridge.names()).toHaveLength(50);
  b.bridge.deliver('n65', 1);
  expect(b.sent).toEqual([]);
});

test('a widget that loads anew in its frame starts without listeners, and a late answer of before is not given', async () => {
  let release: (value: { status: number; body: unknown }) => void = () => {};
  const slow = vi.fn(() => new Promise<{ status: number; body: unknown } | null>((done) => { release = done; }));
  const b = liveBed(slow);
  await b.ask('registerRealtimeListener', 'state', 1);
  const late = b.ask('api', { method: 'GET', path: '/x' }, 2);
  await b.ask('getInitialData', null, 1);
  expect(b.bridge.names()).toEqual([]);
  expect(b.heard.at(-1)).toEqual([]);
  b.sent.length = 0;
  release({ status: 200, body: 'old' });
  await late;
  b.bridge.deliver('state', 'x');
  expect(b.sent).toEqual([]);
});

test('text of every kind goes back and forth unchanged, also long', () => {
  const data = { text: 'Wärme ’ 🌡️ '.repeat(2000) };
  const text = encodeCrossframe({ type: 'cb', args: [data], callbackId: 9 });
  expect(decodeCrossframe(text)).toEqual({ type: 'cb', args: [data], callbackId: 9 });
});
