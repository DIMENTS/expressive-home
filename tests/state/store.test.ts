import { expect, test, vi } from 'vitest';
import { createStore } from '../../src/state/store';
import type { ClientEvent } from '../../src/homey/client';
import type { CapabilityValue } from '../../src/homey/types';
import { cap, device, snapshot } from '../helpers/build';

function setup() {
  let pending: (() => void) | null = null;
  const store = createStore((flush) => { pending = flush; });
  const lamp = device({ id: 'l1', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, value: 0.5 })] });
  store.load(snapshot([lamp, device({ id: 'l2' })]));
  return { store, lamp, flush: () => { const f = pending; pending = null; f?.(); } };
}
const capEvent = (value: CapabilityValue, capabilityId = 'onoff'): ClientEvent => ({ type: 'capability', deviceId: 'l1', capabilityId, value, at: null });

test('an update replaces the device object and keeps the others', () => {
  const { store, lamp } = setup();
  const other = store.getDevice('l2');
  store.apply(capEvent(true));
  expect(store.getDevice('l1')).not.toBe(lamp);
  expect(store.getDevice('l1')?.capabilities['onoff']?.value).toBe(true);
  expect(store.getDevice('l2')).toBe(other);
});
test('hundreds of updates give one notification per device per flush', () => {
  const { store, flush } = setup();
  const seen = vi.fn();
  store.subscribeDevice('l1', seen);
  for (let i = 0; i < 300; i += 1) store.apply(capEvent(i / 300, 'dim'));
  expect(seen).not.toHaveBeenCalled();
  flush();
  expect(seen).toHaveBeenCalledTimes(1);
});
test('unknown devices and capabilities are ignored', () => {
  const { store } = setup();
  expect(() => store.apply({ type: 'capability', deviceId: 'nope', capabilityId: 'onoff', value: true, at: null })).not.toThrow();
  expect(() => store.apply(capEvent(1, 'nope'))).not.toThrow();
});
test('control is optimistic and rolls back on failure', async () => {
  const { store } = setup();
  let reject!: (e: Error) => void;
  const done = store.control('l1', 'onoff', true, () => new Promise<void>((_, r) => { reject = r; }));
  expect(store.getDevice('l1')?.capabilities['onoff']?.value).toBe(true);
  reject(new Error('refused'));
  await expect(done).rejects.toThrow('refused');
  expect(store.getDevice('l1')?.capabilities['onoff']?.value).toBe(false);
});
test('a live value that arrives during a control wins when it settles', async () => {
  const { store } = setup();
  let resolve!: () => void;
  const done = store.control('l1', 'dim', 0.9, () => new Promise<void>((r) => { resolve = r; }));
  store.apply(capEvent(0.7, 'dim'));
  expect(store.getDevice('l1')?.capabilities['dim']?.value).toBe(0.9);
  resolve();
  await done;
  expect(store.getDevice('l1')?.capabilities['dim']?.value).toBe(0.7);
});
test('removing a device during a pending control does not throw', async () => {
  const { store, flush } = setup();
  const structure = vi.fn();
  store.subscribeStructure(structure);
  let resolve!: () => void;
  const done = store.control('l1', 'onoff', true, () => new Promise<void>((r) => { resolve = r; }));
  store.apply({ type: 'deviceRemoved', deviceId: 'l1' });
  resolve();
  await expect(done).resolves.toBeUndefined();
  flush();
  expect(store.getDevice('l1')).toBeUndefined();
  expect(structure).toHaveBeenCalledTimes(1);
});
test('route events update the route and notify structure listeners', () => {
  const { store, flush } = setup();
  const structure = vi.fn();
  store.subscribeStructure(structure);
  store.apply({ type: 'route', route: 'cloud' });
  flush();
  expect(store.getRoute()).toBe('cloud');
  expect(structure).toHaveBeenCalledTimes(1);
});
test('a device event adds unknown devices as structure and replaces known ones', () => {
  const { store, flush } = setup();
  const structure = vi.fn();
  const seen = vi.fn();
  store.subscribeStructure(structure);
  store.subscribeDevice('l2', seen);
  store.apply({ type: 'device', device: device({ id: 'l3' }) });
  store.apply({ type: 'device', device: device({ id: 'l2', name: 'renamed' }) });
  flush();
  expect(store.getDevice('l3')).toBeDefined();
  expect(store.getDevice('l2')?.name).toBe('renamed');
  expect(structure).toHaveBeenCalledTimes(1);
  expect(seen).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()?.devices['l3']).toBeDefined();
});
test('authError changes nothing and getSnapshot is null before load', () => {
  let scheduled = 0;
  const empty = createStore(() => { scheduled += 1; });
  expect(empty.getSnapshot()).toBeNull();
  const { store, lamp } = setup();
  store.apply({ type: 'authError' });
  expect(store.getDevice('l1')).toBe(lamp);
  expect(scheduled).toBe(0);
});
test('a control that outlives a reload does not overwrite the loaded value on failure', async () => {
  const { store } = setup();
  let reject!: (e: Error) => void;
  const done = store.control('l1', 'onoff', true, () => new Promise<void>((_, r) => { reject = r; }));
  store.load(snapshot([device({ id: 'l1', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('dim', { setable: true, value: 0.5 })] })]));
  store.load(snapshot([device({ id: 'l1', caps: [cap('onoff', { type: 'boolean', setable: true, value: 'fresh' as unknown as boolean }), cap('dim', { setable: true, value: 0.5 })] })]));
  reject(new Error('refused'));
  await expect(done).rejects.toThrow('refused');
  expect(store.getDevice('l1')?.capabilities['onoff']?.value).toBe('fresh');
});
test('an old control settling after a reload leaves a newer control protected', async () => {
  const { store } = setup();
  let resolveOld!: () => void;
  let resolveNew!: () => void;
  const old = store.control('l1', 'dim', 0.9, () => new Promise<void>((r) => { resolveOld = r; }));
  store.load(snapshot([device({ id: 'l1', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, value: 0.5 })] })]));
  const next = store.control('l1', 'dim', 0.8, () => new Promise<void>((r) => { resolveNew = r; }));
  store.apply(capEvent(0.3, 'dim'));
  resolveOld();
  await old;
  expect(store.getDevice('l1')?.capabilities['dim']?.value).toBe(0.8);
  store.apply(capEvent(0.4, 'dim'));
  expect(store.getDevice('l1')?.capabilities['dim']?.value).toBe(0.8);
  resolveNew();
  await next;
  expect(store.getDevice('l1')?.capabilities['dim']?.value).toBe(0.4);
});

// ---- a throwing listener ----
function pair(options?: Parameters<typeof createStore>[1]) {
  let pending: (() => void) | null = null;
  const store = createStore((flush) => { pending = flush; }, options);
  const lampCaps = () => [cap('onoff', { type: 'boolean', setable: true, value: false })];
  store.load(snapshot([device({ id: 'a', caps: lampCaps() }), device({ id: 'b', caps: lampCaps() })]));
  const flush = () => { const f = pending; pending = null; f?.(); };
  flush();
  return { store, flush };
}
const onoff = (deviceId: string): ClientEvent => ({ type: 'capability', deviceId, capabilityId: 'onoff', value: true, at: null });

test('a throwing listener does not stop the others in the same flush', () => {
  const errors: unknown[] = []; const boom = new Error('boom');
  const { store, flush } = pair({ onListenerError: (e) => errors.push(e) });
  store.subscribeDevice('a', () => { throw boom; });
  const second = vi.fn(); store.subscribeDevice('a', second);
  const other = vi.fn(); store.subscribeDevice('b', other);
  const structure = vi.fn(); store.subscribeStructure(structure);
  store.apply(onoff('a')); store.apply(onoff('b')); store.apply({ type: 'route', route: 'local' });
  flush();
  expect(second).toHaveBeenCalledOnce(); expect(other).toHaveBeenCalledOnce(); expect(structure).toHaveBeenCalledOnce();
  expect(errors).toEqual([boom]);
});
test('a throwing structure listener does not stop the next one', () => {
  const errors: unknown[] = []; const boom = new Error('boom');
  const { store, flush } = pair({ onListenerError: (e) => errors.push(e) });
  store.subscribeStructure(() => { throw boom; });
  const next = vi.fn(); store.subscribeStructure(next);
  store.apply({ type: 'route', route: 'cloud' });
  flush();
  expect(next).toHaveBeenCalledOnce();
  expect(errors).toEqual([boom]);
});
test('without a handler the error of a listener goes to the console', () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const boom = new Error('boom');
    const { store, flush } = pair();
    store.subscribeDevice('a', () => { throw boom; });
    store.apply(onoff('a'));
    expect(() => flush()).not.toThrow();
    expect(logged).toHaveBeenCalledWith(boom);
  } finally {
    logged.mockRestore();
  }
});
test('unsubscribing the last listener leaves nothing behind and a later event does not throw', () => {
  const { store, flush } = pair();
  const seen = vi.fn();
  const off = store.subscribeDevice('a', seen);
  off();
  off();
  store.apply(onoff('a'));
  expect(() => flush()).not.toThrow();
  expect(seen).not.toHaveBeenCalled();
  // A new listener for the same device starts clean: exactly one call per flush.
  const again = vi.fn(); store.subscribeDevice('a', again);
  store.apply({ type: 'capability', deviceId: 'a', capabilityId: 'onoff', value: false, at: null });
  flush();
  expect(again).toHaveBeenCalledOnce();
});

test('a device report with another make-up marks the structure', () => {
  const { store, lamp, flush } = setup();
  flush();
  const structure = vi.fn();
  store.subscribeStructure(structure);
  store.apply({ type: 'device', device: { ...lamp, deviceClass: 'socket' } });
  flush();
  expect(structure).toHaveBeenCalledTimes(1);
});

test('a renamed device does not mark the structure', () => {
  const { store, lamp, flush } = setup();
  flush();
  const structure = vi.fn();
  const listener = vi.fn();
  store.subscribeStructure(structure);
  store.subscribeDevice('l1', listener);
  store.apply({ type: 'device', device: { ...lamp, name: 'Nieuwe naam', available: false } });
  flush();
  expect(structure).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(store.getDevice('l1')!.name).toBe('Nieuwe naam');
});

test('other rooms and flows are a change of the structure; the same ones are none', () => {
  const { store, flush } = setup();
  flush();
  const seen = vi.fn();
  store.subscribeStructure(seen);
  const { zones, flows } = store.getSnapshot()!;
  store.apply({ type: 'structure', zones: structuredClone(zones), flows: structuredClone(flows) });
  flush();
  expect(seen).not.toHaveBeenCalled();
  store.apply({ type: 'structure', zones: { z: { id: 'z', name: 'Dak', parentId: null } }, flows: [{ id: 'f', name: 'Alles uit', kind: 'flow', startable: true }] });
  flush();
  expect(seen).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toMatchObject({ zones: { z: { name: 'Dak' } }, flows: [{ id: 'f' }] });
  expect(store.getDevice('l1')).toBeDefined();
});

test('other rights are a change of the structure; the same ones are none', () => {
  const { store, flush } = setup();
  flush();
  const seen = vi.fn();
  store.subscribeStructure(seen);
  store.apply({ type: 'scopes', scopes: [...store.getSnapshot()!.scopes] });
  flush();
  expect(seen).not.toHaveBeenCalled();
  store.apply({ type: 'scopes', scopes: ['homey.device'] });
  flush();
  expect([seen.mock.calls.length, store.getSnapshot()!.scopes]).toEqual([1, ['homey.device']]);
});

test('how flows may be started changes with the rights, and is kept when nothing is said of it', () => {
  const { store, flush } = setup();
  store.load({ ...snapshot([]), flowAccess: 'none' });
  flush();
  const seen = vi.fn();
  store.subscribeStructure(seen);
  const { scopes } = store.getSnapshot()!;
  store.apply({ type: 'scopes', scopes, flowAccess: 'refused' });
  flush();
  expect([store.getSnapshot()!.flowAccess, seen.mock.calls.length]).toEqual(['refused', 1]);
  store.apply({ type: 'scopes', scopes, flowAccess: 'refused' });
  store.apply({ type: 'scopes', scopes });
  flush();
  expect([store.getSnapshot()!.flowAccess, seen.mock.calls.length]).toEqual(['refused', 1]);
});
