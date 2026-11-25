import { expect, test, vi } from 'vitest';
import { createWidgetHost, chosenIds, HOST_LIMITS, type HostDeps } from '../../src/widgets/host';
import { parseWidgetFile, type WidgetFile } from '../../src/widgets/widget-file';
import type { WidgetTileSpec } from '../../src/dashboard/types';
import { cap, device } from '../helpers/build';

const file = (): WidgetFile => {
  const parsed = parseWidgetFile({
    format: 'expressive-home-widget', version: 1, id: 'gauge', name: 'Gauge', html: '<p></p>', css: '', js: 'x',
    settings: [{ id: 'device', type: 'device', title: 'Device' }, { id: 'lock', type: 'device', title: 'Lock' }, { id: 'flow', type: 'flow', title: 'Flow' }],
  });
  if (!parsed.ok) throw new Error('bad');
  return parsed.widget;
};
const spec: WidgetTileSpec = { kind: 'widget', id: 't-1', size: 'single', widget: 'own:gauge', settings: { device: 'lamp', lock: 'door', flow: 'f1', other: 'tv' } };
const lamp = device({ id: 'lamp', name: 'Lamp', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('measure_power', { value: 3 })] });
const door = device({ id: 'door', name: 'Voordeur', deviceClass: 'lock', caps: [cap('locked', { type: 'boolean', setable: true, value: true })] });
const tv = device({ id: 'tv', name: 'Tv', caps: [cap('onoff', { type: 'boolean', setable: true })] });

function bed(over: Partial<HostDeps> = {}) {
  const posted: Record<string, unknown>[] = [];
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const states: string[] = [];
  const deps: HostDeps = {
    post: (message) => { posted.push(message); },
    widget: file(), spec, language: 'nl', instance: 't-1',
    device: (id) => ({ lamp, door, tv } as Record<string, typeof lamp>)[id],
    theme: () => ({ tokens: { '--c-primary': '#000' }, mode: 'light', density: 'comfortable' }),
    canControl: () => true,
    setCapability: vi.fn(), guard: vi.fn(), startFlow: vi.fn(async () => true), openDevice: vi.fn(),
    ask: vi.fn(async () => true),
    now: () => now,
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    clearTimeout: () => {},
    onState: (state) => { states.push(state); },
    onHeight: vi.fn(), onLeave: vi.fn(),
    paused: () => false,
    ...over,
  };
  const host = createWidgetHost(deps);
  const from = (message: Record<string, unknown>) => host.receive({ eh: 'widget', ...message });
  const run = (ms: number) => { now += ms; for (const timer of timers.splice(0).sort((a, b) => a.at - b.at)) { if (timer.at <= now) timer.fn(); else timers.push(timer); } };
  const answers = () => posted.filter((m) => m['type'] === 'answer').sort((a, b) => (a['id'] as number) - (b['id'] as number)).map((m) => m['result']);
  return { host, deps, posted, from, run, states, answers, settle: () => new Promise((done) => { setTimeout(done, 0); }) };
}

test('the devices and flows a widget may use are those chosen in its settings, nothing else', () => {
  expect(chosenIds(file(), spec)).toEqual({ devices: ['lamp', 'door'], flows: ['f1'] });
});

test('after hello the frame gets the widget, its settings, the theme and only its own devices', () => {
  const b = bed();
  b.from({ type: 'hello' });
  const load = b.posted.find((m) => m['type'] === 'load')!;
  expect(load).toMatchObject({ settings: spec.settings, instance: 't-1', language: 'nl', widget: { html: '<p></p>', js: 'x' } });
  expect(Object.keys(load['devices'] as object)).toEqual(['lamp', 'door']);
  expect((load['devices'] as Record<string, { capabilities: Record<string, unknown> }>)['lamp']!.capabilities['onoff']).toMatchObject({ value: false, setable: true, type: 'boolean' });
  b.from({ type: 'hello' });
  expect(b.posted.filter((m) => m['type'] === 'load')).toHaveLength(1);
});

test('a chosen device is controlled like a tile; another device, or a value it cannot set, is refused', async () => {
  const b = bed();
  b.from({ type: 'call', id: 1, method: 'setCapabilityValue', args: ['lamp', 'onoff', true] });
  b.from({ type: 'call', id: 2, method: 'setCapabilityValue', args: ['tv', 'onoff', true] });
  b.from({ type: 'call', id: 3, method: 'setCapabilityValue', args: ['lamp', 'measure_power', 5] });
  b.from({ type: 'call', id: 4, method: 'setCapabilityValue', args: ['lamp', 'onoff', 'yes'] });
  await b.settle();
  expect(b.deps.setCapability).toHaveBeenCalledTimes(1);
  expect(b.deps.setCapability).toHaveBeenCalledWith('lamp', 'onoff', true);
  expect(b.answers()).toEqual(['done', 'refused', 'refused', 'refused']);
});

test('without the right to control, nothing is controlled', async () => {
  const b = bed({ canControl: () => false });
  b.from({ type: 'call', id: 1, method: 'setCapabilityValue', args: ['lamp', 'onoff', true] });
  await b.settle();
  expect(b.answers()).toEqual(['refused']);
});

test('a lock goes through the question of the dashboard, with the name of the widget; at most one question per half minute', async () => {
  const b = bed();
  b.from({ type: 'hello' });
  b.from({ type: 'ready' });
  b.from({ type: 'call', id: 1, method: 'setCapabilityValue', args: ['door', 'locked', false] });
  await b.settle();
  expect(b.deps.ask).toHaveBeenCalledWith('door', 'locked', false, 'Gauge');
  expect(b.deps.guard).toHaveBeenCalledWith('door', 'locked', false);
  expect(b.deps.setCapability).not.toHaveBeenCalled();
  b.from({ type: 'call', id: 2, method: 'setCapabilityValue', args: ['door', 'locked', false] });
  await b.settle();
  expect(b.answers()).toEqual(['done', 'refused']);
  // half a minute later, a widget that stayed alive may ask again
  for (let ms = 0; ms < HOST_LIMITS.questionMs; ms += HOST_LIMITS.pingMs) {
    b.run(HOST_LIMITS.pingMs);
    b.from({ type: 'pong', n: 0 });
  }
  (b.deps.ask as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
  b.from({ type: 'call', id: 3, method: 'setCapabilityValue', args: ['door', 'locked', false] });
  await b.settle();
  expect(b.answers()).toEqual(['done', 'refused', 'declined']);
  expect(b.deps.guard).toHaveBeenCalledTimes(1);
});

test('too many commands are refused', async () => {
  const b = bed();
  for (let i = 0; i < HOST_LIMITS.commands + 3; i += 1) b.from({ type: 'call', id: i, method: 'setCapabilityValue', args: ['lamp', 'onoff', true] });
  await b.settle();
  expect(b.deps.setCapability).toHaveBeenCalledTimes(HOST_LIMITS.commands);
  expect(b.answers().filter((a) => a === 'refused')).toHaveLength(3);
});

test('only a chosen flow starts; only a chosen device opens', async () => {
  const b = bed();
  b.from({ type: 'call', id: 1, method: 'startFlow', args: ['f1'] });
  b.from({ type: 'call', id: 2, method: 'startFlow', args: ['f2'] });
  b.from({ type: 'call', id: 3, method: 'openDevice', args: ['tv'] });
  b.from({ type: 'call', id: 4, method: 'openDevice', args: ['lamp'] });
  b.from({ type: 'call', id: 5, method: 'deleteEverything', args: [] });
  await b.settle();
  expect(b.answers()).toEqual(['done', 'refused', 'refused', 'done', 'refused']);
  expect(b.deps.openDevice).toHaveBeenCalledWith('lamp');
});

test('a widget that is never ready, or stops answering, is stopped; one that is paused is not', () => {
  const never = bed();
  never.from({ type: 'hello' });
  never.run(HOST_LIMITS.readyMs + 1);
  expect(never.states.at(-1)).toBe('stuck');
  const silent = bed();
  silent.from({ type: 'hello' });
  silent.from({ type: 'ready' });
  expect(silent.states.at(-1)).toBe('ready');
  for (let i = 0; i < 4; i += 1) silent.run(HOST_LIMITS.pingMs);
  expect(silent.states.at(-1)).toBe('stuck');
  let paused = true;
  const resting = bed({ paused: () => paused });
  resting.from({ type: 'hello' });
  resting.from({ type: 'ready' });
  for (let i = 0; i < 6; i += 1) resting.run(HOST_LIMITS.pingMs);
  expect(resting.states.at(-1)).toBe('ready');
  paused = false;
});

test('a widget that answers its pings stays', () => {
  const b = bed();
  b.from({ type: 'hello' });
  b.from({ type: 'ready' });
  for (let i = 0; i < 6; i += 1) {
    b.run(HOST_LIMITS.pingMs);
    const ping = b.posted.filter((m) => m['type'] === 'ping').at(-1);
    if (ping) b.from({ type: 'pong', n: ping['n'] });
  }
  expect(b.states.at(-1)).toBe('ready');
});

test('a frame that sends too much is stopped; height and leaving are passed on', () => {
  const b = bed();
  b.from({ type: 'height', px: 300 });
  expect(b.deps.onHeight).toHaveBeenCalledWith(300);
  b.from({ type: 'leave' });
  expect(b.deps.onLeave).toHaveBeenCalled();
  for (let i = 0; i < HOST_LIMITS.messagesPerSecond + 1; i += 1) b.from({ type: 'pong', n: 0 });
  expect(b.states.at(-1)).toBe('stuck');
});

test('what is no message of a widget is ignored', () => {
  const b = bed();
  for (const message of [null, 'x', { type: 'ready' }, { eh: 'other', type: 'ready' }]) b.host.receive(message);
  expect(b.states).toEqual([]);
});

test('a host that is stopped while the letter is read sends nothing and stops nothing any more', async () => {
  let release: (bytes: ArrayBuffer | null) => void = () => {};
  const b = bed({ font: () => new Promise((done) => { release = done; }) });
  b.from({ type: 'hello' });
  b.host.stop();
  release(null);
  await b.settle();
  b.run(HOST_LIMITS.readyMs * 3);
  expect(b.posted.filter((m) => m['type'] === 'load')).toEqual([]);
  expect(b.states).not.toContain('stuck');
});

test('a frame that never says hello is stopped too', () => {
  const b = bed();
  b.run(HOST_LIMITS.readyMs + 1);
  expect(b.states.at(-1)).toBe('stuck');
});

test('flows and windows count as commands; opening a window or leaving only while the widget has the focus', async () => {
  let focused = false;
  const b = bed({ focused: () => focused });
  b.from({ type: 'call', id: 1, method: 'openDevice', args: ['lamp'] });
  b.from({ type: 'leave' });
  await b.settle();
  expect(b.deps.openDevice).not.toHaveBeenCalled();
  expect(b.deps.onLeave).not.toHaveBeenCalled();
  focused = true;
  for (let i = 2; i < HOST_LIMITS.commands + 5; i += 1) b.from({ type: 'call', id: i, method: 'startFlow', args: ['f1'] });
  await b.settle();
  expect(b.deps.startFlow).toHaveBeenCalledTimes(HOST_LIMITS.commands);
});

test('the defaults of the settings reach the widget, but never a device', () => {
  const parsed = parseWidgetFile({ format: 'expressive-home-widget', version: 1, id: 'g', name: 'G', html: '', css: '', js: '',
    settings: [{ id: 'device', type: 'device', title: 'D', default: 'tv' }, { id: 'max', type: 'number', title: 'M', default: 40 }, { id: 'min', type: 'number', title: 'm', default: 0 }] });
  if (!parsed.ok) throw new Error('bad');
  const b = bed({ widget: parsed.widget, spec: { ...spec, settings: { min: 5 } } });
  b.from({ type: 'hello' });
  return b.settle().then(() => {
    expect(b.posted.find((m) => m['type'] === 'load')!['settings']).toEqual({ max: 40, min: 5 });
  });
});
