// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { toSnapshot } from '../../../src/homey/map';
import type { HomeySnapshot } from '../../../src/homey/types';
import { ROOMS_ID } from '../../../src/layout/types';
import { houseRaw } from '../../../src/mock/house';
import { REBUILD_QUIET_MS } from '../../../src/ui/app/controller';
import type { MhApp } from '../../../src/ui/app/app';
import { deep, deepAll } from '../../helpers/deep';
import { fakeHub, HOMEY_ID, memoryConfig } from '../../helpers/fake-hub';
import { device, snapshot } from '../../helpers/build';

// The rooms in the whole app.

beforeAll(async () => { await import('../../../src/ui/app/app'); }, 60_000);
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  window.localStorage.clear();
});
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

const settle = async (app: MhApp) => { for (let i = 0; i < 8; i += 1) { await new Promise((r) => setTimeout(r, 0)); await app.updateComplete; } };
const house = (): HomeySnapshot => ({ ...toSnapshot(houseRaw('nl')), homeyId: HOMEY_ID, scopes: ['homey'] });

async function start(config = memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' }), of: HomeySnapshot = house()) {
  const hub = fakeHub(of);
  const app = document.createElement('mh-app') as MhApp;
  app.environment = {
    configStore: config, createRealClient: () => hub, createDemoClient: () => hub,
    schedule: (flush) => { setTimeout(flush, 0); }, setTimeout: (fn, ms) => setTimeout(fn, ms === REBUILD_QUIET_MS ? 0 : ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>), browserLanguages: ['nl-NL'],
  };
  document.body.append(app);
  await settle(app);
  const places = () => [...deep(app, 'mh-rail').shadowRoot!.querySelectorAll<HTMLElement>('.boards button')];
  const go = async (name: string) => { places().find((b) => b.textContent!.trim() === name)!.click(); await settle(app); };
  const card = (name: string) => deepAll(app, 'mh-room-card').find((el) => el.shadowRoot!.querySelector('b')!.textContent === name)!;
  return {
    hub, app, config, go, card, places: () => places().map((b) => b.textContent!.trim()), active: () => deep(app, 'mh-rail').shadowRoot!.querySelector('[aria-current="page"]')!.textContent!.trim(),
    async open(name: string) { card(name).shadowRoot!.querySelector<HTMLElement>('.card')!.click(); await settle(app); },
    settings: () => deep(app, 'mh-settings-panel') as HTMLElement & { hasRooms: boolean; grouping: string; roomsShown: boolean; boards: { name: string }[]; startBoard: string | null },
    async set(deviceId: string, capabilityId: string, value: unknown) { hub.emit({ type: 'capability', deviceId, capabilityId, value: value as never, at: null }); await settle(app); },
  };
}

test('from the bar to the rooms, into one and back', async () => {
  const s = await start();
  expect([s.places(), s.active()]).toEqual([['Overzicht', 'Kamers'], 'Overzicht']);
  await s.go('Kamers');
  expect([s.active(), deepAll(s.app, 'mh-room-card').length, deepAll(s.app, 'mh-section').length]).toEqual(['Kamers', 8, 0]);
  await s.open('Werkkamer');
  expect([s.active(), deep(s.app, 'mh-room-head').shadowRoot!.querySelector('h2')!.textContent, deepAll(s.app, 'mh-climate-tile').length]).toEqual(['Kamers', 'Werkkamer', 1]);
  deep(s.app, 'mh-room-head').dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  await settle(s.app);
  expect(deepAll(s.app, 'mh-room-card')).toHaveLength(8);
  await s.open('Hal');
  // the bar leads back as well
  await s.go('Kamers');
  expect(deepAll(s.app, 'mh-room-card')).toHaveLength(8);
  await s.go('Overzicht');
  expect(deepAll(s.app, 'mh-hero')).toHaveLength(1);
});

test('what is new or renamed on the hub is seen at once', async () => {
  const s = await start();
  await s.go('Kamers');
  const zones = { ...house().zones, study: { ...house().zones['study']!, name: 'Kantoor' } };
  s.hub.emit({ type: 'structure', zones, flows: [] });
  await settle(s.app);
  expect(s.card('Kantoor')).toBeDefined();
  // a device that goes from the only one in a room
  for (const id of Object.keys(house().devices).filter((d) => house().devices[d]!.zoneId === 'garden')) s.hub.emit({ type: 'deviceRemoved', deviceId: id });
  await settle(s.app);
  expect(deepAll(s.app, 'mh-room-card').length).toBe(7);
});

test('the switch of a room goes to its lamps', async () => {
  const s = await start();
  await s.go('Kamers');
  const lamps = s.card('Woonkamer').shadowRoot!.querySelector('mh-switch')!;
  lamps.dispatchEvent(new CustomEvent('change', { detail: { checked: false }, bubbles: true, composed: true }));
  await settle(s.app);
  expect(s.hub.setCapability.mock.calls.map(([id, cap, value]) => [id, cap, value]).sort()).toEqual([['living-ceiling', 'onoff', false], ['living-reading', 'onoff', false]]);
  expect((s.card('Woonkamer').shadowRoot!.querySelector('mh-switch') as HTMLElement & { checked: boolean }).checked).toBe(false);
});

test('a device can begin with the rooms', async () => {
  const config = memoryConfig({ homeyId: HOMEY_ID, apiKey: 'k' });
  const first = await start(config);
  await first.go('Kamers');
  expect(first.settings().boards.map((b) => b.name)).toEqual(['Overzicht', 'Kamers']);
  first.settings().dispatchEvent(new CustomEvent('start-board', { detail: { id: ROOMS_ID }, bubbles: true, composed: true }));
  await settle(first.app);
  first.app.remove();
  const again = await start(config);
  expect([again.active(), deepAll(again.app, 'mh-room-card').length]).toEqual(['Kamers', 8]);
});

test('the settings: per room, and the rooms hidden', async () => {
  const s = await start();
  expect([s.settings().hasRooms, s.settings().grouping, s.settings().roomsShown]).toEqual([true, 'type', true]);
  s.settings().dispatchEvent(new CustomEvent('grouping', { detail: { grouping: 'zone' }, bubbles: true, composed: true }));
  await settle(s.app);
  const titles = () => deepAll(s.app, 'mh-section').map((el) => el.shadowRoot!.querySelector('h2')!.textContent!.trim());
  expect(titles()).toEqual(expect.arrayContaining(['Woonkamer', 'Keuken', 'Flows']));
  s.settings().dispatchEvent(new CustomEvent('rooms-shown', { detail: { shown: false }, bubbles: true, composed: true }));
  await settle(s.app);
  expect(s.places()).toEqual(['Overzicht']);
  const stored = s.config.stored().layouts[HOMEY_ID]!;
  expect([stored.grouping, stored.rooms]).toEqual(['zone', false]);
});

test('a hub with one room, or none, has no such screen', async () => {
  const one = { ...snapshot([device({ id: 'a', zoneId: 'z' }), device({ id: 'b', zoneId: null })]), zones: { z: { id: 'z', name: 'Kamer', parentId: null } }, homeyId: HOMEY_ID, scopes: ['homey'] };
  const s = await start(undefined, one);
  expect([s.places(), s.settings().hasRooms]).toEqual([['Overzicht'], false]);
});

test('editing from a room is not there; on the Overzicht it is', async () => {
  const s = await start();
  await s.go('Kamers');
  await s.open('Hal');
  const edit = () => deep(s.app, 'mh-rail').shadowRoot!.querySelector<HTMLButtonElement>('.edit')!;
  expect(edit().disabled).toBe(true);
  deep(s.app, 'mh-rail').dispatchEvent(new CustomEvent('toggle-edit', { bubbles: true, composed: true }));
  await settle(s.app);
  expect(deepAll(s.app, 'mh-edit-bar')).toHaveLength(0);
  await s.go('Overzicht');
  expect(edit().disabled).toBe(false);
});
