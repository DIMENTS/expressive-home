import { expect, test, vi } from 'vitest';
import { toSnapshot } from '../../../src/homey/map';
import type { HomeySnapshot } from '../../../src/homey/types';
import { ROOMS_ID, roomBoardId, type HubLayout } from '../../../src/layout/types';
import { houseRaw } from '../../../src/mock/house';
import { createLocalConfigStore, STORAGE_KEY } from '../../../src/storage/local-store';
import { createLayouts } from '../../../src/ui/app/layouts';
import { lampsCommands } from '../../../src/ui/app/lamps';
import { cap, device, snapshot } from '../../helpers/build';

// The screen with the rooms and a room, as dashboards that are open.

const HUB = '5f2a00000000000000000c81';
function setup({ start = null as string | null, layout = undefined as HubLayout | undefined, first = toSnapshot(houseRaw('nl')) as HomeySnapshot | null } = {}) {
  let current = first;
  const kept: Record<string, HubLayout> = layout ? { [HUB]: layout } : {};
  const layouts = createLayouts({
    snapshot: () => current, locale: () => 'nl', appearance: () => ({ theme: { seed: '#3b6939', mode: 'light', density: 'comfortable' }, sectionSeeds: {} }), setAppearance: vi.fn(),
    stored: (id) => kept[id], store: (id, next) => { kept[id] = next; }, startBoard: () => start, publish: vi.fn(),
  });
  layouts.use(HUB);
  return { layouts, kept, change: (next: HomeySnapshot | null) => { current = next; layouts.refresh(); } };
}
const house = () => toSnapshot(houseRaw('nl'));
const bare = (): HomeySnapshot => ({ ...snapshot([device({ id: 'a', zoneId: 'z' })]), zones: { z: { id: 'z', name: 'Kamer', parentId: null } } });

test('there is a screen with rooms when there are at least two, unless it is hidden', () => {
  const s = setup();
  expect(s.layouts.state().hasRooms).toBe(true);
  s.change(bare());
  expect(s.layouts.state().hasRooms).toBe(false);
  s.change(house());
  s.layouts.setRooms(false);
  expect([s.layouts.state().hasRooms, s.layouts.state().roomsShown]).toEqual([true, false]);
});

test('it opens as a dashboard does, and so does a room', () => {
  const s = setup();
  s.layouts.openBoard(ROOMS_ID);
  expect([s.layouts.state().boardId, s.layouts.state().board]).toEqual([ROOMS_ID, { id: ROOMS_ID, left: [], right: [] }]);
  s.layouts.openBoard(roomBoardId('living'));
  const { board, boardId } = s.layouts.state();
  expect([boardId, board!.left.concat(board!.right).map((b) => (b.type === 'section' ? b.section.kind : 'hero')).sort()]).toEqual([roomBoardId('living'), ['climate', 'covers', 'household', 'lights', 'media', 'security', 'switches']]);
  s.layouts.openBoard(roomBoardId('nowhere'));
  expect(s.layouts.state().boardId).toBe(roomBoardId('living'));
  s.layouts.openBoard('overview');
  expect(s.layouts.state().boardId).toBe('overview');
});

test('nothing in them can be arranged', () => {
  const s = setup();
  s.layouts.openBoard(roomBoardId('living'));
  s.layouts.setEditing(true);
  expect(s.layouts.state().editing).toBe(false);
  s.layouts.openBoard('overview');
  s.layouts.setEditing(true);
  s.layouts.openBoard(ROOMS_ID);
  expect(s.layouts.state().editing).toBe(false);
});

test('a room that goes away leaves the screen with rooms; without rooms the first dashboard opens', () => {
  const s = setup();
  s.layouts.openBoard(roomBoardId('garden'));
  const without = house();
  s.change({ ...without, devices: Object.fromEntries(Object.entries(without.devices).filter(([, d]) => d.zoneId !== 'garden')) });
  expect(s.layouts.state().boardId).toBe(ROOMS_ID);
  s.change(bare());
  expect(s.layouts.state().boardId).toBe('overview');
  const hidden = setup();
  hidden.layouts.openBoard(ROOMS_ID);
  hidden.layouts.setRooms(false);
  expect(hidden.layouts.state().boardId).toBe('overview');
});

test('a device that moves to another room is there, and a room with a new name keeps its id', () => {
  const s = setup();
  s.layouts.openBoard(roomBoardId('study'));
  const moved = house();
  s.change({ ...moved, devices: { ...moved.devices, 'hall-lamp': { ...moved.devices['hall-lamp']!, zoneId: 'study' } }, zones: { ...moved.zones, study: { ...moved.zones['study']!, name: 'Kantoor' } } });
  const { board, boardId } = s.layouts.state();
  expect([boardId, JSON.stringify(board).includes('hall-lamp')]).toEqual([roomBoardId('study'), true]);
});

test('a device can begin with the rooms, also while the hub still has to answer', () => {
  expect(setup({ start: ROOMS_ID }).layouts.state().boardId).toBe(ROOMS_ID);
  const waiting = setup({ start: ROOMS_ID, first: null });
  expect(waiting.layouts.state().boardId).toBe(ROOMS_ID);
  waiting.change(house());
  expect(waiting.layouts.state().boardId).toBe(ROOMS_ID);
  // there turn out to be none
  const none = setup({ start: ROOMS_ID, first: null });
  none.change(bare());
  expect(none.layouts.state().boardId).toBe('overview');
  expect(setup({ start: ROOMS_ID, layout: { dashboards: [{ id: 'overview', name: null, icon: null, sections: null }], known: [], names: {}, rooms: false } }).layouts.state().boardId).toBe('overview');
});

test('that choice is kept', async () => {
  const data = new Map<string, string>();
  const store = createLocalConfigStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } });
  const config = await store.load();
  await store.save({ ...config, startBoard: ROOMS_ID });
  expect((await store.load()).startBoard).toBe(ROOMS_ID);
});

test('undoing something else from a room opens what is undone', () => {
  const s = setup();
  s.layouts.edit({ type: 'set-section', dashboardId: 'overview', sectionId: 'type:lights', name: 'Lampen', icon: null });
  s.layouts.openBoard(roomBoardId('living'));
  s.layouts.undo();
  expect(s.layouts.state().boardId).toBe('overview');
});

// ----- all lamps of a room -----

test('all lamps go on or off with what each of them has, and what is so already is left alone', () => {
  const lamp = (id: string, caps: Parameters<typeof cap>[1][], ids: string[], extra = {}) => device({ id, deviceClass: 'light', caps: ids.map((c, i) => cap(c, caps[i])), ...extra });
  const on = lamp('on', [{ type: 'boolean', setable: true, value: true }], ['onoff']);
  const off = lamp('off', [{ type: 'boolean', setable: true, value: false }, { setable: true, min: 0, max: 1, value: 0.4 }], ['onoff', 'dim']);
  const dimOnly = lamp('dim', [{ setable: true, min: 0, max: 100, value: 0 }], ['dim']);
  const away = lamp('away', [{ type: 'boolean', setable: true, value: true }], ['onoff'], { available: false });
  expect(lampsCommands([on, off, dimOnly, away], true)).toEqual([{ deviceId: 'off', capabilityId: 'onoff', value: true }, { deviceId: 'dim', capabilityId: 'dim', value: 100 }]);
  expect(lampsCommands([on, off, dimOnly, away], false)).toEqual([{ deviceId: 'on', capabilityId: 'onoff', value: false }]);
});
