import { expect, test } from 'vitest';
import { RequestError, type LinkEvents } from '../../src/served/link';
import { LOOKS_RETRY_MS, createLooksSync } from '../../src/served/looks-sync';
import type { ThemeFile } from '../../src/theme/look';
import { applyLookOps } from '../../src/theme/look-ops';
import { emptyLooksDoc, type LooksDoc } from '../../src/theme/looks-doc';

const A = 't-aaaaaaaaaaaaaaaa';
const avond: ThemeFile = { format: 1, id: A, name: 'Avondlicht', maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '' };

function bed() {
  const listeners: Record<string, ((value: unknown) => void)[]> = {};
  let hub: LooksDoc = emptyLooksDoc();
  let answer: 'ok' | 'use-only' | 'offline' = 'ok';
  const asked: string[] = [];
  const timers: (() => void)[] = [];
  /** While it is there, what is read comes back only when it is let go: what the hub had when it was asked. */
  let gate: Promise<void> | null = null;
  const link = {
    on<K extends keyof LinkEvents>(type: K, listener: (value: LinkEvents[K]) => void) { (listeners[type] ??= []).push(listener as (value: unknown) => void); return () => {}; },
    async request(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> {
      asked.push(`${method} ${path}`);
      if (answer === 'offline') throw new TypeError('offline');
      if (method === 'GET') {
        const doc = hub;
        if (gate) await gate;
        return doc;
      }
      if (answer === 'use-only') throw new RequestError(403, { error: 'use-only' });
      hub = { ...applyLookOps(hub, (body as { ops: [] }).ops), revision: hub.revision + 1 };
      return hub;
    },
  };
  const adopted: LooksDoc[] = [];
  let refusals = 0;
  const sync = createLooksSync({
    link, adopt: (doc) => adopted.push(doc), refused: () => { refusals += 1; },
    setTimeout: (fn, ms) => { expect(ms).toBe(LOOKS_RETRY_MS); timers.push(fn); return timers.length; }, clearTimeout: () => {},
  });
  const emit = <K extends keyof LinkEvents>(type: K, value: LinkEvents[K]) => { for (const listener of listeners[type] ?? []) listener(value); };
  const settle = () => new Promise((done) => { setTimeout(done, 0); });
  const slowReads = (): (() => void) => {
    let release: () => void = () => {};
    gate = new Promise((done) => { release = () => { gate = null; done(); }; });
    return release;
  };
  return { sync, emit, settle, asked, adopted, timers, slowReads, refusals: () => refusals, setAnswer: (next: typeof answer) => { answer = next; }, setHub: (doc: LooksDoc) => { hub = doc; } };
}

test('when the stream opens, the looks are read if the hub has another number than this page knows', async () => {
  const b = bed();
  b.setHub({ ...emptyLooksDoc(), revision: 3 });
  b.emit('open', { revision: 0, role: 'use', looks: 3 });
  await b.settle();
  expect(b.adopted.map((doc) => doc.revision)).toEqual([3]);
  b.emit('open', { revision: 0, role: 'use', looks: 3 });
  await b.settle();
  expect(b.asked).toEqual(['GET api/looks']);
});

test('a hub of 1.0.0, which knows no looks, is not asked for them', async () => {
  const b = bed();
  b.emit('open', { revision: 0, role: 'edit', looks: null });
  await b.settle();
  expect(b.asked).toEqual([]);
});

test('news from another device is read, a rescue with it', async () => {
  const b = bed();
  b.setHub({ ...emptyLooksDoc(), revision: 2, house: { theme: 'glas', seed: null, mode: 'dark' } });
  b.emit('looks', { revision: 2 });
  await b.settle();
  expect(b.adopted.at(-1)!.house.theme).toBe('glas');
  b.setHub({ ...emptyLooksDoc(), revision: 3, rescue: 1 });
  b.emit('looks', { revision: 3 });
  await b.settle();
  expect(b.adopted.at(-1)).toMatchObject({ revision: 3, rescue: 1 });
});

test('a stream that opens with a rescue this page did not see reads, also with the same number', async () => {
  const b = bed();
  b.setHub({ ...emptyLooksDoc(), revision: 4 });
  b.emit('open', { revision: 0, role: 'use', looks: 4, rescue: 0 });
  await b.settle();
  b.setHub({ ...emptyLooksDoc(), revision: 4, rescue: 1 });
  b.emit('open', { revision: 0, role: 'use', looks: 4, rescue: 1 });
  await b.settle();
  expect([b.asked, b.adopted.at(-1)!.rescue]).toEqual([['GET api/looks', 'GET api/looks'], 1]);
});

test('a change goes to the hub, and what the hub has afterwards is taken over', async () => {
  const b = bed();
  b.sync.send([{ save: avond }, { house: { theme: A, seed: null, mode: 'auto' } }]);
  await b.settle();
  expect(b.asked).toEqual(['POST api/looks']);
  expect(b.adopted.at(-1)).toMatchObject({ revision: 1, house: { theme: A }, themes: [avond] });
  expect(b.sync.pending()).toBe(0);
});

test('without a connection a change waits, stays shown, and goes when the stream is back', async () => {
  const b = bed();
  b.setAnswer('offline');
  b.sync.send([{ save: avond }]);
  await b.settle();
  expect(b.sync.pending()).toBe(1);
  b.setHub({ ...emptyLooksDoc(), revision: 5, house: { theme: 'helder', seed: null, mode: 'auto' } });
  b.setAnswer('ok');
  b.emit('looks', { revision: 5 });
  await b.settle();
  // what the hub has, with the change that waits on top
  expect(b.adopted.at(-1)).toMatchObject({ house: { theme: 'helder' }, themes: [avond] });
  b.emit('open', { revision: 0, role: 'edit', looks: 5 });
  await b.settle();
  expect([b.sync.pending(), b.adopted.at(-1)!.revision]).toEqual([0, 6]);
});

test('a change that fails is tried again after a while', async () => {
  const b = bed();
  b.setAnswer('offline');
  b.sync.send([{ save: avond }]);
  await b.settle();
  expect(b.timers).toHaveLength(1);
  b.setAnswer('ok');
  b.timers[0]!();
  await b.settle();
  expect(b.sync.pending()).toBe(0);
});

test('a device whose right was taken away: its changes are refused, it says so, and it takes over what the hub has', async () => {
  const b = bed();
  b.setAnswer('use-only');
  b.sync.send([{ save: avond }]);
  await b.settle();
  expect([b.sync.pending(), b.refusals(), b.asked]).toEqual([0, 1, ['POST api/looks', 'GET api/looks']]);
});

test('news that comes while the looks are being read is read after it', async () => {
  const b = bed();
  const release = b.slowReads();
  b.setHub({ ...emptyLooksDoc(), revision: 1 });
  b.emit('looks', { revision: 1 });
  await b.settle();
  b.setHub({ ...emptyLooksDoc(), revision: 2, house: { theme: 'glas', seed: null, mode: 'dark' } });
  b.emit('looks', { revision: 2 });
  await b.settle();
  release();
  await b.settle();
  expect(b.asked).toEqual(['GET api/looks', 'GET api/looks']);
  expect(b.adopted.at(-1)).toMatchObject({ revision: 2, house: { theme: 'glas' } });
});

test('an answer that was overtaken by a newer one is not shown', async () => {
  const b = bed();
  const release = b.slowReads();
  b.setHub({ ...emptyLooksDoc(), revision: 1 });
  b.emit('looks', { revision: 1 });
  await b.settle();
  b.sync.send([{ save: avond }]);
  await b.settle();
  expect(b.adopted.at(-1)).toMatchObject({ revision: 2, themes: [avond] });
  release();
  await b.settle();
  expect(b.adopted.map((doc) => doc.revision)).toEqual([2]);
});

test('a lower number with a rescue that was not seen yet still counts', async () => {
  const b = bed();
  b.setHub({ ...emptyLooksDoc(), revision: 5 });
  b.emit('looks', { revision: 5 });
  await b.settle();
  b.setHub({ ...emptyLooksDoc(), revision: 3, rescue: 1 });
  b.emit('looks', { revision: 3 });
  await b.settle();
  expect(b.adopted.map((doc) => [doc.revision, doc.rescue])).toEqual([[5, 0], [3, 1]]);
});

test('an app on the hub that began anew, with fewer changes than this page knows: what it has now is shown', async () => {
  const b = bed();
  b.setHub({ ...emptyLooksDoc(), revision: 7, house: { theme: 'glas', seed: null, mode: 'dark' } });
  b.emit('open', { revision: 0, role: 'edit', looks: 7, rescue: 0 });
  await b.settle();
  // an answer of before is still on its way when the stream opens anew
  const release = b.slowReads();
  b.emit('looks', { revision: 8 });
  await b.settle();
  b.setHub(emptyLooksDoc());
  b.emit('open', { revision: 0, role: 'edit', looks: 0, rescue: 0 });
  await b.settle();
  release();
  await b.settle();
  expect(b.adopted.at(-1)).toEqual(emptyLooksDoc());
});
