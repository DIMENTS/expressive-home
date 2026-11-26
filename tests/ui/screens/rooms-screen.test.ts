// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { toSnapshot } from '../../../src/homey/map';
import { createTranslate } from '../../../src/i18n';
import { ROOMS_ID, roomBoardId } from '../../../src/layout/types';
import { boardFromDashboard } from '../../../src/layout/board';
import { houseRaw } from '../../../src/mock/house';
import { roomDashboard, roomsOf } from '../../../src/rooms/rooms';
import '../../../src/ui/tiles/index';
import '../../../src/ui/screens/dashboard-screen';
import '../../../src/ui/screens/nav-bar';
import '../../../src/ui/screens/rail';
import '../../../src/ui/screens/rooms-screen';
import type { MhDashboard } from '../../../src/ui/screens/dashboard-screen';
import type { MhNavBar } from '../../../src/ui/screens/nav-bar';
import type { MhRail } from '../../../src/ui/screens/rail';
import type { MhRooms } from '../../../src/ui/screens/rooms-screen';
import { deep, deepAll } from '../../helpers/deep';
import { key, mount, record, settle } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

// The screen with the rooms, its cards, and a room.

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const nl = createTranslate('nl');
function context() {
  const house = toSnapshot(houseRaw('nl'));
  const fake = fakeContext(Object.values(house.devices));
  fake.store.apply({ type: 'structure', zones: house.zones, flows: [] });
  fake.flush();
  return { ...fake, house, rooms: roomsOf(house, nl) };
}
async function screen() {
  const c = context();
  const element = await mount<MhRooms>('mh-rooms', { ctx: c.ctx, rooms: c.rooms });
  const cards = () => deepAll(element, 'mh-room-card') as HTMLElement[];
  for (const card of cards()) await settle(card as never);
  const card = (name: string) => cards().find((el) => el.shadowRoot!.querySelector('b')!.textContent === name)!;
  return {
    ...c, element, cards, card, opened: record<{ id: string }>(element, 'open-room'),
    facts: (name: string) => [...card(name).shadowRoot!.querySelectorAll('.fact')].map((f) => f.textContent!.trim()),
    face: (name: string) => card(name).shadowRoot!.querySelector<HTMLElement>('[role="button"]')!,
    lamps: (name: string) => card(name).shadowRoot!.querySelector('mh-switch') as (HTMLElement & { checked: boolean; label: string }) | null,
    async set(deviceId: string, capabilityId: string, value: unknown) {
      c.store.apply({ type: 'capability', deviceId, capabilityId, value: value as never, at: null });
      c.flush();
      for (const el of cards()) await settle(el as never);
    },
  };
}

test('every room is a card with what there is', async () => {
  const s = await screen();
  expect(s.cards().map((el) => el.shadowRoot!.querySelector('b')!.textContent)).toEqual(['Woonkamer', 'Keuken', 'Hal', 'Slaapkamer', 'Werkkamer', 'Badkamer', 'Garage', 'Tuin']);
  expect(s.facts('Woonkamer')).toEqual(['2 aan', '20,8°', 'Speelt', '2 open']);
  expect(s.facts('Hal')).toEqual(['Op slot']);
  expect(s.facts('Garage')).toEqual(['Dicht']);
  expect([s.card('Woonkamer').hasAttribute('lit'), s.card('Hal').hasAttribute('lit')]).toEqual([true, false]);
  expect(s.face('Woonkamer').getAttribute('aria-label')).toBe('Woonkamer, 2 aan, 20,8°, Speelt, 2 open');
  // the name of the button says it already: not twice
  expect(s.card('Woonkamer').shadowRoot!.querySelector('.facts')!.getAttribute('aria-hidden')).toBe('true');
});

test('a card goes along with its room', async () => {
  const s = await screen();
  await s.set('hall-lock', 'locked', false);
  expect(s.facts('Hal')).toEqual(['1 van slot']);
  await s.set('kitchen-smoke', 'alarm_smoke', true);
  expect([s.facts('Keuken')[0], s.card('Keuken').shadowRoot!.querySelector('.fact.danger')!.textContent!.trim()]).toEqual(['Rookalarm', 'Rookalarm']);
});

test('a tap, Enter and the space bar open the room', async () => {
  const s = await screen();
  s.card('Keuken').shadowRoot!.querySelector<HTMLElement>('.card')!.click();
  key(s.face('Keuken'), 'Enter');
  expect(key(s.face('Hal'), ' ').defaultPrevented).toBe(true);
  expect(s.opened).toEqual([{ id: 'kitchen' }, { id: 'kitchen' }, { id: 'hall' }]);
});

test('the switch turns all lamps of the room on or off, and opens nothing', async () => {
  const s = await screen();
  expect([s.lamps('Woonkamer')!.checked, s.lamps('Woonkamer')!.label, s.lamps('Hal')!.checked]).toEqual([true, 'Lampen van Woonkamer', false]);
  const change = (name: string, checked: boolean) => s.lamps(name)!.dispatchEvent(new CustomEvent('change', { detail: { checked }, bubbles: true, composed: true }));
  change('Woonkamer', false);
  change('Hal', true);
  s.lamps('Hal')!.click();
  expect([s.actions.lamps.mock.calls, s.opened]).toEqual([[[['living-reading', 'living-ceiling', 'living-mood'].sort((a, b) => s.house.devices[a]!.name.localeCompare(s.house.devices[b]!.name)), false], [['hall-lamp'], true]], []]);
  // when nothing came of it the switch says how it is
  await settle(s.card('Woonkamer') as never);
  expect(s.lamps('Woonkamer')!.checked).toBe(true);
  // a room without lamps has none
  expect(s.lamps('Garage')).toBeNull();
});

test('a hub without rooms says so', async () => {
  const c = context();
  const element = await mount<MhRooms>('mh-rooms', { ctx: c.ctx, rooms: [] });
  expect(element.shadowRoot!.querySelectorAll('mh-room-card')).toHaveLength(0);
});

// ----- in the dashboard -----

async function dashboard(boardId: string, props: Record<string, unknown> = {}) {
  const c = context();
  const room = c.rooms.find((r) => roomBoardId(r.id) === boardId) ?? null;
  const board = room ? boardFromDashboard(roomDashboard(room, c.house, 'nl'), boardId) : { id: boardId, left: [], right: [] };
  const element = await mount<MhDashboard>('mh-dashboard', { ctx: c.ctx, board, rooms: c.rooms, room, boards: [{ id: 'overview', name: 'Overzicht', icon: 'dashboard', badge: false }, { id: ROOMS_ID, name: 'Kamers', icon: 'meeting_room', badge: false }], phase: 'ready', density: 'comfortable', ...props });
  await settle(element);
  for (const el of [...deepAll(element, 'mh-rooms'), ...deepAll(element, 'mh-room-head')]) await settle(el as never);
  return { ...c, element, navigated: record<{ to: string }>(element, 'navigate') };
}

test('the rooms stand in place of the sections, and opening one goes there', async () => {
  const s = await dashboard(ROOMS_ID);
  expect([s.element.shadowRoot!.querySelector('.cols'), deepAll(s.element, 'mh-room-card').length]).toEqual([null, 8]);
  deep(s.element, 'mh-rooms').dispatchEvent(new CustomEvent('open-room', { detail: { id: 'hall' }, bubbles: true, composed: true }));
  expect(s.navigated).toEqual([{ to: `board:${roomBoardId('hall')}` }]);
  const rail = deep(s.element, 'mh-rail') as HTMLElement & { activeBoard: string; editBlocked: boolean };
  expect([rail.activeBoard, rail.editBlocked]).toEqual([ROOMS_ID, true]);
});

test('a room has its name, what there is, its sections and a way back', async () => {
  const s = await dashboard(roomBoardId('living'));
  const head = deep(s.element, 'mh-room-head');
  expect([head.shadowRoot!.querySelector('h2')!.textContent, [...head.shadowRoot!.querySelectorAll('.fact')].map((f) => f.textContent!.trim())]).toEqual(['Woonkamer', ['2 aan', '20,8°', 'Speelt', '2 open']]);
  expect(head.shadowRoot!.querySelector('.facts')!.hasAttribute('aria-hidden')).toBe(false);
  expect(deepAll(s.element, 'mh-section').length).toBe(7);
  expect((deep(s.element, 'mh-rail') as HTMLElement & { activeBoard: string }).activeBoard).toBe(ROOMS_ID);
  const back = head.shadowRoot!.querySelector<HTMLElement>('.back')!;
  expect(back.getAttribute('label') ?? back.getAttribute('aria-label')).toBe('Terug naar Kamers');
  (back.shadowRoot?.querySelector('button') ?? back).dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  expect(s.navigated).toEqual([{ to: `board:${ROOMS_ID}` }]);
  // what can be operated is wide
  expect(deepAll(s.element, 'mh-climate-tile')[0]!.hasAttribute('wide')).toBe(true);
});

test('nothing in a room can be edited', async () => {
  const s = await dashboard(roomBoardId('living'));
  expect((deep(s.element, 'mh-rail') as HTMLElement & { editBlocked: boolean }).editBlocked).toBe(true);
  expect(deepAll(s.element, 'mh-edit-bar')).toEqual([]);
});

// ----- the bars -----

const boards = [{ id: 'overview', name: 'Overzicht', icon: 'dashboard', badge: false }, { id: ROOMS_ID, name: 'Kamers', icon: 'meeting_room', badge: false }] as const;

test('the rail has the rooms after the dashboards, and they do not count as one', async () => {
  const many = [...Array.from({ length: 19 }, (_, i) => ({ id: `d${i}`, name: `D${i}`, icon: 'home' as const, badge: false })), boards[1]];
  const rail = await mount<MhRail>('mh-rail', { boards: many, activeBoard: ROOMS_ID, editing: true });
  const names = [...rail.shadowRoot!.querySelectorAll('.boards .name')].map((n) => n.textContent);
  expect([names.at(-1), rail.shadowRoot!.querySelector('.new') !== null]).toEqual(['Kamers', true]);
  const gone = record<{ to: string }>(rail, 'navigate');
  [...rail.shadowRoot!.querySelectorAll<HTMLElement>('.boards button')].at(-1)!.click();
  expect(gone).toEqual([{ to: `board:${ROOMS_ID}` }]);
});

test('on a phone the rooms stand in the bar, or in the menu when there is no room', async () => {
  const bar = await mount<MhNavBar>('mh-nav-bar', { boards: [...boards], activeBoard: 'overview' });
  await settle(bar);
  const names = () => [...bar.shadowRoot!.querySelectorAll('.boards .name')].map((n) => n.textContent);
  expect(names()).toEqual(['Overzicht', 'Kamers']);
  // it does not fit any more
  const box = bar.shadowRoot!.querySelector<HTMLElement>('.boards')!;
  Object.defineProperty(box, 'scrollWidth', { value: 400, configurable: true });
  Object.defineProperty(box, 'clientWidth', { value: 300, configurable: true });
  bar.boards = [...boards].map((b) => ({ ...b }));
  await settle(bar);
  await settle(bar);
  expect(names()).toEqual(['Overzicht']);
  bar.shadowRoot!.querySelector<HTMLElement>('.more > button')!.click();
  await settle(bar);
  const gone = record<{ to: string }>(bar, 'navigate');
  const menu = bar.shadowRoot!.querySelector('mh-menu') as HTMLElement & { groups: { items: { id: string; label: string }[] }[] };
  expect(menu.groups[0]!.items.map((i) => i.label)).toEqual(['Kamers', 'Thema', 'Instellingen']);
  menu.dispatchEvent(new CustomEvent('select', { detail: { group: 'more', id: 'rooms' }, bubbles: true, composed: true }));
  expect(gone).toEqual([{ to: `board:${ROOMS_ID}` }]);
});

test('the bar shows where one is, also in the menu', async () => {
  const bar = await mount<MhNavBar>('mh-nav-bar', { boards: [boards[1]], activeBoard: ROOMS_ID });
  await settle(bar);
  expect(bar.shadowRoot!.querySelector('.boards .active .name')!.textContent).toBe('Kamers');
});
