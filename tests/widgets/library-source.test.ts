import { expect, test } from 'vitest';
import { RequestError } from '../../src/served/link';
import { createLocalWidgets, createServedWidgets, WIDGETS_KEY } from '../../src/widgets/library-source';
import { parseWidgetFile, type WidgetFile } from '../../src/widgets/widget-file';
import { applyWidgetOps, type WidgetsDoc } from '../../src/widgets/widget-library';

const widget = (id: string): WidgetFile => {
  const parsed = parseWidgetFile({ format: 'expressive-home-widget', version: 1, id, name: id, html: '', css: '', js: '' });
  if (!parsed.ok) throw new Error('bad');
  return parsed.widget;
};
const settle = () => new Promise((done) => { setTimeout(done, 0); });

function hubBed() {
  const listeners: Record<string, ((value: never) => void)[]> = {};
  let hub: WidgetsDoc = { revision: 0, widgets: [] };
  let answer: 'ok' | 'use-only' | 'offline' = 'ok';
  const asked: string[] = [];
  const link = {
    on(type: string, listener: (value: never) => void) { (listeners[type] ??= []).push(listener); return () => {}; },
    async request(method: string, path: string, body?: unknown) {
      asked.push(`${method} ${path}`);
      if (answer === 'offline') throw new TypeError('offline');
      if (method === 'GET') return hub;
      if (answer === 'use-only') throw new RequestError(403, { error: 'use-only' });
      hub = { ...applyWidgetOps(hub, (body as { ops: [] }).ops), revision: hub.revision + 1 };
      return hub;
    },
  };
  const emit = (type: string, value: unknown) => { for (const listener of listeners[type] ?? []) listener(value as never); };
  return { link, emit, asked, setAnswer: (next: typeof answer) => { answer = next; }, setHub: (doc: WidgetsDoc) => { hub = doc; } };
}

test('on the hub: read when the stream opens with news, changed with operations, refused when the device may only use', async () => {
  const bed = hubBed();
  const library = createServedWidgets(bed.link as never);
  let told = 0;
  library.subscribe(() => { told += 1; });
  bed.setHub({ revision: 2, widgets: [widget('a')] });
  bed.emit('open', { widgets: 2 });
  await settle();
  expect(library.list().map((w) => w.id)).toEqual(['a']);
  expect(await library.change([{ add: widget('b') }])).toBe('ok');
  expect(library.list().map((w) => w.id)).toEqual(['a', 'b']);
  expect(told).toBe(2);
  bed.setAnswer('use-only');
  expect(await library.change([{ remove: 'a' }])).toBe('refused');
  bed.setAnswer('offline');
  expect(await library.change([{ remove: 'a' }])).toBe('unreachable');
});

test('a hub that knows no widgets is never asked', async () => {
  const bed = hubBed();
  createServedWidgets(bed.link as never);
  bed.emit('open', { widgets: null });
  await settle();
  expect(bed.asked).toEqual([]);
});

test('in a browser with its own key: per hub, kept in the browser', async () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  let hub: string | null = 'hub-1';
  const library = createLocalWidgets(storage, () => hub);
  expect(await library.change([{ add: widget('a') }])).toBe('ok');
  expect(library.list().map((w) => w.id)).toEqual(['a']);
  hub = 'hub-2';
  expect(library.list()).toEqual([]);
  hub = 'hub-1';
  expect(createLocalWidgets(storage, () => 'hub-1').list().map((w) => w.id)).toEqual(['a']);
  expect(JSON.parse(data.get(WIDGETS_KEY)!)).toHaveProperty('hub-1');
  hub = null;
  expect(await library.change([{ add: widget('b') }])).toBe('refused');
});
