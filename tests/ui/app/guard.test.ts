import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Device } from '../../../src/homey/types';
import { createSwitchableTranslate } from '../../../src/i18n';
import { createStore } from '../../../src/state/store';
import { BUSY_MS, CONTROL_TIMEOUT_MS, createController, NUDGE_MS, type ControllerDeps } from '../../../src/ui/app/controller';
import { fakeHub, HOMEY_ID, memoryConfig } from '../../helpers/fake-hub';
import { snapshot } from '../../helpers/build';
import { covers, guards, heating, media } from '../../helpers/devices';

// Commands for locks, doors and alarms, and for a target temperature.

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

async function setup(devices: Device[], scopes = ['homey']) {
  const hub = fakeHub({ ...snapshot(structuredClone(devices)), homeyId: HOMEY_ID, scopes });
  let flush: (() => void) | null = null;
  const store = createStore((f) => { flush = f; });
  const notify = vi.fn();
  const deps: ControllerDeps = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' }), store, createRealClient: () => hub, createDemoClient: () => fakeHub(), notify,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    t: createSwitchableTranslate('nl'), browserLanguages: ['nl-NL'],
  };
  const controller = createController(deps);
  await controller.start();
  await settle();
  const run = () => { const f = flush; flush = null; f?.(); };
  run();
  const value = (id: string, cap: string) => store.getDevice(id)!.capabilities[cap]!.value;
  return { hub, store, notify, controller, actions: controller.actions, run, value };
}

test('a lock is told to unlock, and says so only when the hub does', async () => {
  const s = await setup([guards.lock]);
  const redraw = vi.fn();
  s.store.subscribeDevice('lock', redraw);
  s.actions.guard('lock', 'locked', false);
  s.run();
  expect([s.hub.setCapability.mock.calls, s.value('lock', 'locked'), s.controller.busy('lock'), redraw.mock.calls.length]).toEqual([[['lock', 'locked', false]], true, { capabilityId: 'locked', value: false }, 1]);
  await settle();
  // the command arrived; the lock still has to turn
  expect([s.value('lock', 'locked'), s.controller.busy('lock')]).toEqual([true, { capabilityId: 'locked', value: false }]);
  s.hub.emit({ type: 'capability', deviceId: 'lock', capabilityId: 'alarm_contact', value: true, at: null });
  expect(s.controller.busy('lock')).not.toBeNull();
  s.hub.emit({ type: 'capability', deviceId: 'lock', capabilityId: 'locked', value: false, at: null });
  s.run();
  expect([s.value('lock', 'locked'), s.controller.busy('lock'), redraw.mock.calls.length]).toEqual([false, null, 2]);
});

test('it is busy until the hub says something, at most a while', async () => {
  const s = await setup([guards.garage]);
  s.actions.guard('garage', 'garagedoor_closed', false);
  vi.advanceTimersByTime(BUSY_MS - 1);
  expect(s.controller.busy('garage')).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect([s.controller.busy('garage'), s.value('garage', 'garagedoor_closed')]).toEqual([null, true]);
  // what the hub says of the whole device counts too
  s.actions.guard('garage', 'garagedoor_closed', false);
  s.hub.emit({ type: 'device', device: structuredClone(guards.garage) });
  expect(s.controller.busy('garage')).toBeNull();
});

test('what fails says so, without a button that does it again', async () => {
  const s = await setup([guards.lock]);
  s.hub.failControl = true;
  s.actions.guard('lock', 'locked', false);
  await settle();
  expect([s.controller.busy('lock'), s.value('lock', 'locked'), s.notify.mock.calls.at(-1)![0].text, s.notify.mock.calls.at(-1)![0].action]).toEqual([null, true, 'Voordeur reageerde niet.', undefined]);
});

test('a hub that does not answer is told as everywhere', async () => {
  const s = await setup([guards.lock]);
  s.hub.setCapability.mockImplementationOnce(() => new Promise<void>(() => {}));
  s.actions.guard('lock', 'locked', true);
  await vi.advanceTimersByTimeAsync(CONTROL_TIMEOUT_MS);
  expect([s.notify.mock.calls.length, s.controller.busy('lock')]).toEqual([1, null]);
});

test('a second command while the first is on its way goes on from there', async () => {
  const s = await setup([guards.lock]);
  s.actions.guard('lock', 'locked', false);
  s.actions.guard('lock', 'locked', true);
  expect([s.hub.setCapability.mock.calls.length, s.controller.busy('lock')]).toEqual([2, { capabilityId: 'locked', value: true }]);
  vi.advanceTimersByTime(BUSY_MS);
  expect(s.controller.busy('lock')).toBeNull();
});

test('nothing is sent without a route or a right, and the notice says why', async () => {
  const s = await setup([guards.lock], ['homey.device.readonly']);
  s.actions.guard('lock', 'locked', false);
  expect([s.hub.setCapability.mock.calls, s.controller.busy('lock'), s.notify.mock.calls.length]).toEqual([[], null, 1]);
  const away = await setup([guards.lock]);
  away.hub.emit({ type: 'route', route: null });
  away.actions.guard('lock', 'locked', false);
  expect([away.hub.setCapability.mock.calls, away.controller.busy('lock')]).toEqual([[], null]);
});

test('no other way leads to a lock, a door or an alarm, in either direction', async () => {
  const s = await setup([guards.lock, guards.garage, guards.garageBusy, guards.alarm, guards.withLatch, media.tv]);
  s.actions.setCapability('lock', 'locked', false);
  s.actions.setCapability('lock', 'locked', true);
  s.actions.toggle({ kind: 'switch', id: 't', deviceId: 'lock', size: 'single', onoffCapabilityId: 'locked', detailCapabilityId: null });
  s.actions.toggle({ kind: 'light', id: 't', deviceId: 'garage2', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'windowcoverings_set' });
  s.actions.press('latch', 'open');
  s.actions.slide('garage2', 'windowcoverings_set', 1, true);
  s.actions.setCapability('alarm', 'homealarm_state', 'disarmed');
  expect(s.hub.setCapability).not.toHaveBeenCalled();
  s.actions.setCapability('tv', 'volume_mute', true);
  expect(s.hub.setCapability).toHaveBeenCalledTimes(1);
  // and what is no lock does not go this way
  s.actions.guard('tv', 'onoff', false);
  s.actions.guard('nothing', 'locked', false);
  expect(s.hub.setCapability).toHaveBeenCalledTimes(1);
});

test('a page that is left, and another hub, leave nothing busy', async () => {
  const s = await setup([guards.lock]);
  s.actions.guard('lock', 'locked', false);
  await s.controller.disconnect();
  expect(s.controller.busy('lock')).toBeNull();
});

// ----- the target of a thermostat -----

test('tapping adds up, is seen at once and goes as one command', async () => {
  const s = await setup([heating.ownMode]);
  s.actions.nudge('own', 1);
  s.actions.nudge('own', 1);
  vi.advanceTimersByTime(NUDGE_MS - 100);
  s.actions.nudge('own', 1);
  expect([s.value('own', 'target_temperature'), s.hub.setCapability.mock.calls]).toEqual([22.5, []]);
  vi.advanceTimersByTime(NUDGE_MS - 1);
  expect(s.hub.setCapability).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(s.hub.setCapability.mock.calls).toEqual([['own', 'target_temperature', 22.5]]);
  await settle();
  s.hub.emit({ type: 'capability', deviceId: 'own', capabilityId: 'target_temperature', value: 22.5, at: null });
  s.actions.nudge('own', -1);
  vi.advanceTimersByTime(NUDGE_MS);
  expect(s.hub.setCapability.mock.calls.at(-1)).toEqual(['own', 'target_temperature', 22]);
});

test('it stays within what the app allows, and does not send what does not change', async () => {
  const s = await setup([heating.valveBlind]);
  s.actions.nudge('valve', 100);
  vi.advanceTimersByTime(NUDGE_MS);
  expect(s.hub.setCapability.mock.calls).toEqual([['valve', 'target_temperature', 28]]);
  await settle();
  s.hub.emit({ type: 'capability', deviceId: 'valve', capabilityId: 'target_temperature', value: 28, at: null });
  s.actions.nudge('valve', 1);
  vi.advanceTimersByTime(NUDGE_MS);
  expect(s.hub.setCapability).toHaveBeenCalledTimes(1);
});

test('what the hub reports meanwhile does not take the finger back; what fails goes back', async () => {
  const s = await setup([heating.ownMode]);
  s.actions.nudge('own', 1);
  s.hub.emit({ type: 'capability', deviceId: 'own', capabilityId: 'target_temperature', value: 18, at: null });
  expect(s.value('own', 'target_temperature')).toBe(21.5);
  s.hub.failControl = true;
  vi.advanceTimersByTime(NUDGE_MS);
  await settle();
  expect([s.value('own', 'target_temperature'), s.notify.mock.calls.at(-1)![0].text]).toEqual([18, 'Woonkamer reageerde niet.']);
});

test('two thermostats at once do not wait for each other', async () => {
  const s = await setup([heating.ownMode, heating.zone]);
  s.actions.nudge('own', 1);
  vi.advanceTimersByTime(300);
  s.actions.nudge('zone', -2);
  vi.advanceTimersByTime(300);
  expect(s.hub.setCapability.mock.calls).toEqual([['own', 'target_temperature', 21.5]]);
  vi.advanceTimersByTime(300);
  expect(s.hub.setCapability.mock.calls.at(-1)).toEqual(['zone', 'target_temperature', 17]);
});

test('a target that is not known begins at what it measures; what is no thermostat does nothing', async () => {
  const unknown = structuredClone(heating.zone);
  unknown.capabilities['target_temperature']!.value = null;
  const s = await setup([unknown, covers.both]);
  s.actions.nudge('zone', 1);
  expect(s.value('zone', 'target_temperature')).toBe(18.5);
  s.actions.nudge('both', 1);
  s.actions.nudge('nothing', 1);
  vi.advanceTimersByTime(NUDGE_MS);
  expect(s.hub.setCapability.mock.calls).toEqual([['zone', 'target_temperature', 18.5]]);
});

test('leaving sends nothing more, and nothing without a route', async () => {
  const s = await setup([heating.ownMode]);
  s.hub.emit({ type: 'route', route: null });
  s.actions.nudge('own', 1);
  expect([s.value('own', 'target_temperature'), s.notify.mock.calls.length]).toEqual([21, 1]);
  s.hub.emit({ type: 'route', route: 'local' });
  s.actions.nudge('own', 1);
  await s.controller.disconnect();
  vi.advanceTimersByTime(NUDGE_MS);
  expect(s.hub.setCapability).not.toHaveBeenCalled();
});

test('setting the target another way while it is still tapped: that counts, and is not overridden', async () => {
  const s = await setup([heating.ownMode]);
  s.actions.nudge('own', 1);
  s.actions.slide('own', 'target_temperature', 25, true);
  vi.advanceTimersByTime(NUDGE_MS * 2);
  await settle();
  expect([s.hub.setCapability.mock.calls, s.value('own', 'target_temperature')]).toEqual([[['own', 'target_temperature', 25]], 25]);
  s.actions.nudge('own', 1);
  s.actions.setCapability('own', 'target_temperature', 18);
  vi.advanceTimersByTime(NUDGE_MS * 2);
  await settle();
  expect(s.hub.setCapability.mock.calls.at(-1)).toEqual(['own', 'target_temperature', 18]);
  // something else of it is something else
  s.actions.nudge('own', 1);
  s.actions.setCapability('own', 'netatmo_thermostat_mode', 'away');
  vi.advanceTimersByTime(NUDGE_MS);
  expect(s.hub.setCapability.mock.calls.filter(([, id]) => id === 'target_temperature')).toHaveLength(3);
});
