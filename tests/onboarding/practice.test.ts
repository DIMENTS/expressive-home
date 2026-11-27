import { expect, test, vi } from 'vitest';
import { createPractice } from '../../src/onboarding/practice';
import { createTranslate } from '../../src/i18n';

const now = (flushes: (() => void)[]) => (flush: () => void) => { flushes.push(flush); };

test('a lamp and a lock of its own, in a hub of its own; the context says it is local and may control', () => {
  const practice = createPractice(createTranslate('nl'), (flush) => flush());
  const lamp = practice.ctx.store.getDevice(practice.lamp.deviceId)!;
  const lock = practice.ctx.store.getDevice(practice.lock.deviceId)!;
  expect([lamp.name, lamp.capabilities['onoff']?.value, lamp.capabilities['dim']?.value]).toEqual(['Oefenlamp', false, 0.6]);
  expect([lock.name, lock.deviceClass, lock.capabilities['locked']?.value]).toEqual(['Oefenslot', 'lock', true]);
  expect(practice.lamp).toMatchObject({ kind: 'light', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' });
  expect(practice.lock).toMatchObject({ kind: 'guard', size: 'wide' });
  expect(practice.ctx.status()).toMatchObject({ route: 'local', canControl: true, canStartFlows: false, demo: true });
  expect(practice.ctx.busy('x')).toBeNull();
  expect(practice.done()).toEqual({ tap: false, dim: false, lock: false });
});

test('tapping, dimming and locking change only the hub of the practice, and are told once each', () => {
  const flushes: (() => void)[] = [];
  const practice = createPractice(createTranslate('en'), now(flushes));
  const heard = vi.fn();
  practice.onDone(heard);
  const { actions, store } = practice.ctx;
  actions.toggle(practice.lamp);
  expect(store.getDevice(practice.lamp.deviceId)!.capabilities['onoff']!.value).toBe(true);
  actions.slide(practice.lamp.deviceId, 'dim', 0.3, false);
  actions.slide(practice.lamp.deviceId, 'dim', 0.2, true);
  expect(store.getDevice(practice.lamp.deviceId)!.capabilities['dim']!.value).toBe(0.2);
  actions.guard(practice.lock.deviceId, 'locked', false);
  expect(store.getDevice(practice.lock.deviceId)!.capabilities['locked']!.value).toBe(false);
  // locking again is no exercise
  actions.guard(practice.lock.deviceId, 'locked', true);
  expect(practice.done()).toEqual({ tap: true, dim: true, lock: true });
  expect(heard.mock.calls.map(([which]) => which)).toEqual(['tap', 'dim', 'lock']);
  // English names in English
  expect(store.getDevice(practice.lamp.deviceId)!.name).toBe('Practice lamp');
});

test('a slide that is not let go yet is not done; dimming a lamp that is off turns it on, as the hub does', () => {
  const practice = createPractice(createTranslate('nl'), (flush) => flush());
  practice.ctx.actions.slide(practice.lamp.deviceId, 'dim', 0.4, false);
  expect(practice.done().dim).toBe(false);
  expect(practice.ctx.store.getDevice(practice.lamp.deviceId)!.capabilities['onoff']!.value).toBe(true);
  practice.ctx.actions.slide(practice.lamp.deviceId, 'dim', 0.4, true);
  expect(practice.done().dim).toBe(true);
});

test('everything else does nothing: no device window (it is told), no flows, nothing to anything else', () => {
  const practice = createPractice(createTranslate('nl'), (flush) => flush());
  const opened = vi.fn();
  practice.onOpen(opened);
  const { actions } = practice.ctx;
  actions.openDevice(practice.lamp.deviceId);
  expect(opened).toHaveBeenCalledTimes(1);
  expect([practice.lamp.deviceId, practice.lock.deviceId]).toEqual(['practice:lamp', 'practice:lock']);
  actions.press('x', 'button');
  actions.setCapability('x', 'onoff', true);
  actions.lamps(['x'], true);
  actions.nudge('x', 1);
  expect(practice.done()).toEqual({ tap: false, dim: false, lock: false });
  expect(practice.ctx.store.getDevices().map((d) => d.id).sort()).toEqual([practice.lamp.deviceId, practice.lock.deviceId].sort());
});
