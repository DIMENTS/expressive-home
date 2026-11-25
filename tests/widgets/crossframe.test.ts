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
