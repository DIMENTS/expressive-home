// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Device } from '../../../src/homey/types';
import { ASK_MS, SURE_MS, type MhApp } from '../../../src/ui/app/app';
import { deep, deepAll } from '../../helpers/deep';
import { key } from '../../helpers/mount';
import { guards, heating } from '../../helpers/devices';
import { fakeHub, HOMEY_ID, memoryConfig } from '../../helpers/fake-hub';
import { snapshot } from '../../helpers/build';

// A short tap on something dangerous: the question, and what is done after the answer.

beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); vi.unstubAllGlobals(); });

const settle = async (app: MhApp) => { for (let i = 0; i < 6; i += 1) { await new Promise((r) => setTimeout(r, 0)); await app.updateComplete; } };
const dialog = (app: MhApp) => app.shadowRoot!.querySelector('mh-dialog.confirm') as HTMLElement & { open: boolean; heading: string };
const buttons = (app: MhApp) => [...dialog(app).querySelectorAll('mh-button')] as HTMLElement[];
const ok = (app: MhApp) => buttons(app)[1]!;

async function start(devices: Device[]) {
  const hub = fakeHub({ ...snapshot(structuredClone(devices)), homeyId: HOMEY_ID, scopes: ['homey'] });
  const app = document.createElement('mh-app') as MhApp;
  let time = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => time);
  app.environment = {
    configStore: memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' }), createRealClient: () => hub, createDemoClient: () => hub,
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  const ask = async (deviceId: string, capabilityId: string, value: unknown) => {
    app.shadowRoot!.querySelector('mh-dashboard')!.dispatchEvent(new CustomEvent('confirm-danger', { detail: { deviceId, capabilityId, value }, bubbles: true, composed: true }));
    await settle(app);
  };
  return { hub, app, ask, later: (ms: number) => { time += ms; } };
}
afterEach(() => { vi.restoreAllMocks(); });

test('it is asked with the name of the device, and done after the answer', async () => {
  const s = await start([guards.lock]);
  await s.ask('lock', 'locked', false);
  expect([dialog(s.app).open, dialog(s.app).heading, ok(s.app).textContent!.trim()]).toEqual([true, 'Voordeur ontgrendelen?', 'Ontgrendelen']);
  expect(s.hub.setCapability).not.toHaveBeenCalled();
  s.later(SURE_MS);
  ok(s.app).click();
  await settle(s.app);
  expect([dialog(s.app).open, s.hub.setCapability.mock.calls]).toEqual([false, [['lock', 'locked', false]]]);
});

test('a double tap does not answer the question it asked', async () => {
  const s = await start([guards.lock]);
  await s.ask('lock', 'locked', false);
  s.later(SURE_MS - 1);
  ok(s.app).click();
  await settle(s.app);
  expect([dialog(s.app).open, s.hub.setCapability.mock.calls]).toEqual([true, []]);
  s.later(1);
  ok(s.app).click();
  expect(s.hub.setCapability).toHaveBeenCalledTimes(1);
});

test('nor does it wave the question away, beside the dialog', async () => {
  const s = await start([guards.lock]);
  await s.ask('lock', 'locked', false);
  s.later(SURE_MS - 1);
  dialog(s.app).dispatchEvent(new CustomEvent('cancel'));
  await settle(s.app);
  expect(dialog(s.app).open).toBe(true);
  s.later(1);
  dialog(s.app).dispatchEvent(new CustomEvent('cancel'));
  await settle(s.app);
  expect(dialog(s.app).open).toBe(false);
});

test('Escape always leaves it, however soon', async () => {
  const s = await start([guards.lock]);
  await s.ask('lock', 'locked', false);
  key(dialog(s.app), 'Escape');
  await settle(s.app);
  expect([dialog(s.app).open, s.hub.setCapability.mock.calls]).toEqual([false, []]);
});

test('cancelling does nothing', async () => {
  const s = await start([guards.lock]);
  await s.ask('lock', 'locked', false);
  s.later(SURE_MS);
  buttons(s.app)[0]!.click();
  await settle(s.app);
  expect([dialog(s.app).open, s.hub.setCapability.mock.calls]).toEqual([false, []]);
});

test('a question that nobody answers goes away', async () => {
  const s = await start([guards.lock]);
  const real = setTimeout;
  const waits: [() => void, number][] = [];
  s.app.environment!.setTimeout = (fn, ms) => { waits.push([fn, ms]); return real(() => {}, 0); };
  await s.ask('lock', 'locked', false);
  const [gone] = waits.filter(([, ms]) => ms === ASK_MS);
  gone![0]();
  await settle(s.app);
  expect([dialog(s.app).open, s.hub.setCapability.mock.calls]).toEqual([false, []]);
});

test('the questions of a garage door, an alarm, and what nobody knows', async () => {
  const s = await start([guards.garage, guards.alarm, guards.withLatch, guards.lockMode]);
  const asked = async (deviceId: string, capabilityId: string, value: unknown) => {
    await s.ask(deviceId, capabilityId, value);
    return [dialog(s.app).heading, ok(s.app).textContent!.trim()];
  };
  expect([
    await asked('garage', 'garagedoor_closed', false), await asked('alarm', 'homealarm_state', 'disarmed'), await asked('alarm', 'homealarm_state', 'partially_armed'),
    await asked('latch', 'open', true), await asked('mode', 'lock_mode', 'always_unlocked'),
  ]).toEqual([
    ['Garage openen?', 'Openen'], ['Alarm uitschakelen?', 'Uit'], ['Alarm deels inschakelen?', 'Deels'], ['Schuur bedienen?', 'Doorgaan'], ['Kantoor bedienen?', 'Doorgaan'],
  ]);
  expect(dialog(s.app).textContent).toContain('“lock_mode” wordt “always_unlocked”');
});

test('nothing is asked of a device that is gone, or for what is no danger', async () => {
  const s = await start([heating.ownMode, guards.lock]);
  await s.ask('nothing', 'locked', false);
  expect(dialog(s.app).open).toBe(false);
  await s.ask('own', 'target_temperature', 30);
  expect(dialog(s.app).open).toBe(false);
  expect(s.hub.setCapability).not.toHaveBeenCalled();
});

test('a lock has a tile of its own on the Overzicht', async () => {
  const s = await start([guards.lock]);
  expect(deep(s.app, 'mh-guard-tile')).not.toBeNull();
});

test('the example house is looked around in, in the language of the app, and the camper still is', async () => {
  vi.restoreAllMocks();
  for (const [which, language, name] of [['house', 'nl-NL', 'Huisalarm'], ['house', 'en-GB', 'House alarm'], ['camper', 'nl-NL', 'Keuken']] as const) {
    document.body.replaceChildren();
    const { browserEnvironment } = await import('../../../src/ui/app/app');
    window.localStorage.clear();
    const app = document.createElement('mh-app') as MhApp;
    app.environment = { ...browserEnvironment(), browserLanguages: [language] };
    document.body.append(app);
    await settle(app);
    app.shadowRoot!.querySelector('mh-connect-screen')!.dispatchEvent(new CustomEvent('demo', { detail: { which } }));
    await settle(app);
    await settle(app);
    const names = deepAll(app, '.name').map((el) => el.textContent);
    expect([which, language, names.includes(name)]).toEqual([which, language, true]);
    expect(deepAll(app, 'mh-guard-tile').length > 0).toBe(which === 'house');
  }
});
