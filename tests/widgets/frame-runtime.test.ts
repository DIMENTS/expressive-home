// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { startFrame } from '../../src/widgets/frame/runtime';

afterEach(() => { document.body.replaceChildren(); document.head.querySelectorAll('style').forEach((s) => s.remove()); });

const HOME = 'http://hub.local';

/** The window as the frame sees it: an opaque origin, a parent, and the messages it gets. */
function frame(options: { origin?: string; framed?: boolean; own?: PropertyDescriptorMap } = {}) {
  const sent: Record<string, unknown>[] = [];
  const parent = { postMessage: vi.fn((message: Record<string, unknown>, target: string) => { expect(target).toBe(HOME); sent.push(message); }) };
  const handlers: Record<string, ((event: unknown) => void)[]> = {};
  const win = Object.create(window, {
    origin: { value: options.origin ?? 'null' },
    parent: { value: parent, configurable: true },
    location: { value: { href: `${HOME}/widget-frame.html` } },
    addEventListener: { value: (type: string, fn: (event: unknown) => void) => { (handlers[type] ??= []).push(fn); } },
    ...options.own,
  });
  if (options.framed === false) Object.defineProperty(win, 'parent', { value: win });
  const started = startFrame(win as Window & typeof globalThis);
  const receive = (data: unknown, from: { source?: unknown; origin?: string } = {}) => {
    for (const fn of handlers['message'] ?? []) fn({ data, source: from.source ?? parent, origin: from.origin ?? HOME });
  };
  const key = (k: string) => { for (const fn of handlers['keydown'] ?? []) fn({ key: k }); };
  return { started, sent, receive, key, win };
}

const load = (js: string, extra: Record<string, unknown> = {}) => ({
  eh: 'widget', type: 'load', settings: { min: 0 }, instance: 't-1', language: 'nl', devices: { d1: { id: 'd1', name: 'Lamp' } },
  theme: { tokens: { '--c-primary': '#3b6939', 'bad name': 'x' }, mode: 'dark', density: 'compact' },
  widget: { html: '<p id="v" onclick="alert(1)">hallo</p><script>window.ran = true</script>', css: 'p { color: red; }', js, texts: { nl: { hi: 'Hoi' }, en: { hi: 'Hi' } } },
  ...extra,
});

test('it does nothing outside a sandboxed frame', () => {
  expect(frame({ origin: HOME }).started).toBe(false);
  expect(frame({ framed: false }).started).toBe(false);
});

test('it says hello, and listens only to its parent at the address of the dashboard', () => {
  const f = frame();
  expect(f.sent).toEqual([{ eh: 'widget', type: 'hello' }]);
  f.receive({ eh: 'widget', type: 'ping', n: 1 }, { origin: 'https://evil.example' });
  f.receive({ eh: 'widget', type: 'ping', n: 2 }, { source: {} });
  f.receive({ eh: 'widget', type: 'ping', n: 3 });
  expect(f.sent.slice(1)).toEqual([{ eh: 'widget', type: 'pong', n: 3 }]);
});

test('it puts the markup, the style and the theme in the page and starts the widget with Homey', () => {
  const f = frame();
  f.receive(load(`function onHomeyReady(Homey) {
    document.getElementById('v').textContent = Homey.__('hi') + ' ' + Homey.getSettings().min + ' ' + Homey.getWidgetInstanceId() + ' ' + Homey.devices.get('d1').name + ' ' + Homey.devices.get('x');
    Homey.ready({ height: 200 });
  }`));
  expect(document.getElementById('v')!.textContent).toBe('Hoi 0 t-1 Lamp null');
  expect((window as unknown as { ran?: boolean }).ran).toBeUndefined();
  expect(document.documentElement.style.getPropertyValue('--c-primary')).toBe('#3b6939');
  expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
  expect(f.sent.slice(1)).toEqual([{ eh: 'widget', type: 'height', px: 200 }, { eh: 'widget', type: 'ready' }]);
});

test('asking the dashboard to do something waits for its answer', async () => {
  const f = frame();
  f.receive(load(`function onHomeyReady(Homey) { Homey.devices.setCapabilityValue('d1', 'onoff', true).then((a) => { window.answer = a; }); }`));
  expect(f.sent.at(-1)).toEqual({ eh: 'widget', type: 'call', id: 1, method: 'setCapabilityValue', args: ['d1', 'onoff', true] });
  f.receive({ eh: 'widget', type: 'answer', id: 1, result: 'done' });
  await Promise.resolve();
  expect((window as unknown as { answer?: string }).answer).toBe('done');
});

test('a widget that throws is reported, and a second load does nothing', () => {
  const f = frame();
  f.receive(load('throw new Error("kapot")'));
  expect(f.sent.at(-1)).toMatchObject({ type: 'error' });
  f.receive(load('window.second = true'));
  expect((window as unknown as { second?: boolean }).second).toBeUndefined();
});

test('Escape always gives the focus back to the dashboard', () => {
  const f = frame();
  f.key('Escape');
  expect(f.sent.at(-1)).toEqual({ eh: 'widget', type: 'leave' });
});

test('news of a device it was given reaches the widget; of another device it does not', () => {
  const f = frame();
  f.receive(load(`function onHomeyReady(Homey) { Homey.on('device', (d) => { window.heard = (window.heard || []).concat(d.id); }); }`));
  f.receive({ eh: 'widget', type: 'device', device: { id: 'd1', name: 'Lamp' } });
  f.receive({ eh: 'widget', type: 'device', device: { id: 'other' } });
  expect((window as unknown as { heard?: string[] }).heard).toEqual(['d1']);
});

test('a widget that puts something else in place of its parent cannot silence Escape', () => {
  const f = frame();
  f.receive(load(`function onHomeyReady() { Object.defineProperty(window, 'parent', { value: { postMessage() {} } }); }`));
  f.key('Escape');
  expect(f.sent.at(-1)).toEqual({ eh: 'widget', type: 'leave' });
});

test('the runtime leaves the colour scheme of the page alone', () => {
  const f = frame();
  f.receive(load('function onHomeyReady() {}'));
  expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('');
});

test('a widget never reaches the kiosk app of a wall tablet, also where its object cannot be deleted', () => {
  const fully = { loadUrl: vi.fn() };
  const loose = frame({ own: { fully: { value: fully, configurable: true, writable: true }, FullyKiosk: { value: {}, configurable: true, writable: true } } });
  expect([(loose.win as unknown as { fully?: unknown }).fully, (loose.win as unknown as { FullyKiosk?: unknown }).FullyKiosk]).toEqual([undefined, undefined]);
  const fixed = frame({ own: { fully: { value: fully, configurable: false, writable: true } } });
  expect((fixed.win as unknown as { fully?: unknown }).fully).toBeUndefined();
});
