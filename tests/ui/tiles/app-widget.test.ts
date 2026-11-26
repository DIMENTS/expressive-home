// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/tiles/app-widget';
import { mount } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); });

test('a widget of an app starts anew when its settings change, so another layout shows at once', async () => {
  const fake = fakeContext([]);
  fake.ctx.widgets = { boards: () => [], openBoard: () => {}, appApi: async () => null };
  const spec = { kind: 'widget', id: 't-1', size: 'single', widget: 'app:com.example/channels', settings: { layout: 'panel' } } as const;
  const element = await mount<HTMLElement & { spec: unknown; updateComplete: Promise<unknown> }>('mh-app-widget', { spec, ctx: fake.ctx });
  const first = element.shadowRoot!.querySelector('iframe');
  expect(first).not.toBeNull();
  element.spec = { ...spec, settings: { layout: 'camper' } };
  await element.updateComplete;
  await element.updateComplete;
  const second = element.shadowRoot!.querySelector('iframe');
  expect(second).not.toBeNull();
  expect(second).not.toBe(first);
  element.spec = { ...spec, settings: { layout: 'camper' } };
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector('iframe')).toBe(second);
});

test('a widget of an app hears the news it listens to, tells what it listens to, and starts anew when asked', async () => {
  const { encodeCrossframe, decodeCrossframe } = await import('../../../src/widgets/crossframe');
  const fake = fakeContext([]);
  const handles: { ref: string; listener: { names(): string[]; news(event: string, data: unknown): void; restart(): void }; changed: number; stopped: boolean }[] = [];
  fake.ctx.widgets = {
    boards: () => [], openBoard: () => {}, appApi: async () => null, appRow: async () => undefined,
    live: (ref, listener) => {
      const handle = { ref, listener, changed: 0, stopped: false };
      handles.push(handle);
      return { changed: () => { handle.changed += 1; }, stop: () => { handle.stopped = true; } };
    },
  };
  const spec = { kind: 'widget', id: 't-2', size: 'single', widget: 'app:com.example/channels', settings: {} } as const;
  const element = await mount<HTMLElement & { spec: unknown; updateComplete: Promise<unknown> }>('mh-app-widget', { spec, ctx: fake.ctx });
  const frame = element.shadowRoot!.querySelector('iframe')!;
  const posted: unknown[] = [];
  Object.defineProperty(frame, 'contentWindow', { value: { postMessage: (text: string) => posted.push(decodeCrossframe(text)) } });
  expect(handles).toHaveLength(1);
  expect(handles[0]!.ref).toBe('app:com.example/channels');
  window.dispatchEvent(new MessageEvent('message', { data: encodeCrossframe({ type: 'tx', event: 'registerRealtimeListener', data: 'state', callbackId: 4 }), source: frame.contentWindow as Window }));
  await new Promise((done) => setTimeout(done, 0));
  expect(handles[0]!.listener.names()).toEqual(['state']);
  expect(handles[0]!.changed).toBe(1);
  handles[0]!.listener.news('state', { on: true });
  expect(posted.at(-1)).toEqual({ type: 'cb', callbackId: 4, args: [{ on: true }] });
  handles[0]!.listener.restart();
  await element.updateComplete;
  expect(handles[0]!.stopped).toBe(true);
  expect(handles).toHaveLength(2);
  expect(element.shadowRoot!.querySelector('iframe')).not.toBe(frame);
  element.remove();
  expect(handles[1]!.stopped).toBe(true);
});
