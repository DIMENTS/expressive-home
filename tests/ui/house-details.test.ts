// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { coverCommands, coverOf, coverState, MOVING_MS } from '../../src/controls/cover';
import { guardOf, guardState } from '../../src/controls/guard';
import { tilesFor } from '../../src/dashboard/classify';
import type { DeviceTileSpec, HouseKind, TileSpec } from '../../src/dashboard/types';
import { toSnapshot } from '../../src/homey/map';
import type { Device, HomeySnapshot } from '../../src/homey/types';
import { createTranslate } from '../../src/i18n';
import { boardFromDashboard, drawnTiles } from '../../src/layout/board';
import { reconcile } from '../../src/layout/reconcile';
import { ROOMS_ID, roomBoardId, type HubLayout, type TileLayout } from '../../src/layout/types';
import { houseRaw } from '../../src/mock/house';
import { roomCard, roomDashboard, roomsOf } from '../../src/rooms/rooms';
import { createStore } from '../../src/state/store';
import { createLayouts } from '../../src/ui/app/layouts';
import { guardCommands } from '../../src/ui/model/guard-view';
import { tileView } from '../../src/ui/model/tile-view';
import '../../src/ui/panels/device-panel';
import '../../src/ui/screens/dashboard-screen';
import '../../src/ui/tiles/index';
import type { MhDevicePanel } from '../../src/ui/panels/device-panel';
import type { MhDashboard } from '../../src/ui/screens/dashboard-screen';
import { createTile } from '../../src/ui/tiles/registry';
import type { TileElement } from '../../src/ui/tiles/tile-base';
import { cap, device, snapshot } from '../helpers/build';
import { deep, deepAll } from '../helpers/deep';
import { covers, guards, heating, media } from '../helpers/devices';
import { hubLayout, overview, ownSection, tileLayout } from '../helpers/layout';
import { inside, mount, settle } from '../helpers/mount';
import { fakeContext } from '../helpers/ui-context';

// What a second pair of eyes found in the tiles and rooms of a house.

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const [nl, en] = [createTranslate('nl'), createTranslate('en')];
const spec = (kind: HouseKind, d: Device): DeviceTileSpec => ({ kind, id: 't', deviceId: d.id, size: 'single' });
const withCap = (d: Device, id: string, partial: Parameters<typeof cap>[1]): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: cap(id, partial) }, capabilityOrder: [...d.capabilityOrder.filter((c) => c !== id), id] });
const withValue = (d: Device, id: string, value: unknown, lastUpdated: string | null = null): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never, lastUpdated } } });
const tamper = (value: boolean) => ({ type: 'boolean', title: 'Sabotage', value } as const);
const says = (kind: HouseKind, d: Device) => { const { stateText, state } = tileView(spec(kind, d), d, nl); return [stateText, state]; };

// ----- alarms -----

test('a lock with an alarm still says whether it is locked', () => {
  expect(says('guard', withCap(guards.lock, 'alarm_tamper', tamper(true)))).toEqual(['Op slot · Sabotage', 'danger']);
  expect(says('guard', withValue(withCap(guards.lock, 'alarm_tamper', tamper(true)), 'locked', false))).toEqual(['Van slot · Sabotage', 'danger']);
  expect(says('guard', withValue(withCap(guards.lock, 'alarm_tamper', tamper(true)), 'locked', null))).toEqual(['Sabotage', 'danger']);
  expect(says('guard', withCap(guards.garage, 'alarm_generic', tamper(true)))).toEqual(['Dicht · Sabotage', 'danger']);
  // of an alarm the alarm itself comes first
  expect(says('guard', withCap(guards.alarm, 'alarm_fire', { type: 'boolean', title: 'Brand', value: true }))).toEqual(['Brand · Uit', 'danger']);
});

test('heating, a curtain and a speaker with an alarm are red as well, and say which', () => {
  expect(says('climate', withCap(heating.ownMode, 'alarm_co', { type: 'boolean', title: 'CO-alarm', value: true }))).toEqual(['CO-alarm · 20,5° · naar 21°', 'danger']);
  expect(says('cover', withCap(covers.setOnly, 'alarm_generic', tamper(true)))).toEqual(['Sabotage · 60% open', 'danger']);
  expect(says('media', withCap(media.full, 'alarm_heat', { type: 'boolean', title: 'Te warm', value: true }))).toEqual(['Te warm · Speelt: Nummer', 'danger']);
  expect(says('climate', withCap(heating.ownMode, 'alarm_battery', { type: 'boolean', title: 'Batterij', value: true }))[1]).toBe('on');
  expect(says('climate', { ...withCap(heating.ownMode, 'alarm_co', { type: 'boolean', title: 'CO-alarm', value: true }), available: false })[1]).toBe('unavailable');
});

async function panel(d: Device, deviceId: string | null = d.id) {
  const fake = fakeContext([structuredClone(d)]);
  const element = await mount<MhDevicePanel>('mh-device-panel', { ctx: fake.ctx, deviceId });
  await settle(element);
  return { ...fake, element };
}

test('in its window the state stays the main line, with the alarm under it', async () => {
  const { element } = await panel(withValue(withCap(guards.lock, 'alarm_tamper', tamper(true)), 'locked', false));
  expect([inside(element, '.stands b').textContent, inside(element, '.stands .alarm').textContent, inside(element, '.stands').classList.contains('danger')]).toEqual(['Van slot', 'Sabotage', true]);
  const read = await panel(withCap(guards.readOnly, 'alarm_tamper', tamper(true)));
  expect(inside(read.element, '.stands b').textContent).toBe('Op slot');
});

test('an alarm that is off says so as everything else does', () => {
  expect(says('guard', guards.alarm)[0]).toBe('Uit');
  expect([en('guard.disarmed'), en('guard.ask.go')]).toEqual(['Off', 'Continue']);
});

// ----- the card of a room -----

const card = (devices: Device[]) => {
  const s: HomeySnapshot = { ...snapshot(devices.map((d, i) => ({ ...d, id: `${d.id}${i}`, zoneId: 'z' }))), zones: { z: { id: 'z', name: 'Kamer', parentId: null } } };
  return roomCard(roomsOf(s, nl)[0]!, s, nl).facts.map((f) => [f.icon, f.text]);
};

test('a card says that all is locked or closed only when all say so', () => {
  const unknown = withValue(guards.lock, 'locked', null);
  const away = { ...withValue(guards.lock, 'locked', false), available: false };
  expect(card([guards.lock, unknown])).toEqual([['lock', 'Stand onbekend']]);
  expect(card([guards.lock, away])).toEqual([['lock', 'Stand onbekend']]);
  expect(card([away])).toEqual([['lock', 'Stand onbekend']]);
  expect(card([guards.lock, guards.lock])).toEqual([['lock', 'Op slot']]);
  // one that is known to be open is said in any case
  expect(card([guards.custom, unknown])).toEqual([['lock_open', '1 van slot']]);
  expect(card([guards.garage, { ...guards.garage, available: false }])).toEqual([['garage_home', 'Stand onbekend']]);
  // curtains too: one that is known is not all of them
  expect(card([covers.closedOnly, covers.stateOnly])).toEqual([]);
  expect(card([covers.setOnly, covers.stateOnly])).toEqual([['blinds', '1 open']]);
});

// ----- what changes live -----

test('a device that moves to another room is followed at once', () => {
  let run: (() => void) | null = null;
  const store = createStore((flush) => { run = flush; });
  store.load({ ...snapshot([device({ id: 'a', zoneId: 'x' })]), zones: {} });
  (run as (() => void) | null)?.();
  const changed = vi.fn();
  store.subscribeStructure(changed);
  store.apply({ type: 'device', device: device({ id: 'a', zoneId: 'x', name: 'Andere naam' }) });
  (run as (() => void) | null)?.();
  expect(changed).not.toHaveBeenCalled();
  store.apply({ type: 'device', device: device({ id: 'a', zoneId: 'y' }) });
  (run as (() => void) | null)?.();
  expect(changed).toHaveBeenCalledTimes(1);
});

test('a cover that keeps saying where it went has arrived after a while', () => {
  const at = Date.parse('2026-11-24T12:00:00Z');
  const said = new Date(at).toISOString();
  const moving = withValue(withValue(covers.both, 'windowcoverings_state', 'up', said), 'windowcoverings_set', 0.6, said);
  const going = (now: number) => coverState(coverOf(moving)!, now).moving;
  expect([going(at + 1000), going(at + MOVING_MS - 1), going(at + MOVING_MS), going(at + 10 * MOVING_MS)]).toEqual(['up', 'up', null, null]);
  // as long as its position goes on it moves; a clock that was set back does not matter
  expect(coverState(coverOf(withValue(moving, 'windowcoverings_set', 0.7, new Date(at + MOVING_MS).toISOString()))!, at + MOVING_MS + 1000).moving).toBe('up');
  expect(going(at - 5000)).toBe('up');
  // a hub that tells no time: as it says
  expect(coverState(coverOf(withValue(moving, 'windowcoverings_state', 'up'))!, at + 10 * MOVING_MS).moving).toBe(null);
  expect(coverState(coverOf(withValue(withValue(covers.both, 'windowcoverings_state', 'up'), 'windowcoverings_set', 0.6))!, at).moving).toBe('up');
});

test('its tile says so by itself, without a report', async () => {
  vi.useFakeTimers({ now: Date.parse('2026-11-24T12:00:00Z') });
  const said = new Date().toISOString();
  const d = withValue(withValue(covers.both, 'windowcoverings_state', 'up', said), 'windowcoverings_set', 0.6, said);
  const fake = fakeContext([d]);
  const tile = createTile(spec('cover', d), fake.ctx, 'comfortable') as TileElement;
  document.body.append(tile);
  await tile.updateComplete;
  expect(inside(tile, '.state').textContent).toBe('Gaat open…');
  await vi.advanceTimersByTimeAsync(MOVING_MS + 10);
  await tile.updateComplete;
  expect(inside(tile, '.state').textContent).toBe('60% open');
  tile.remove();
  expect(vi.getTimerCount()).toBe(0);
});

// ----- a dashboard of the owner -----

test('a tile of one value that is away for a moment is not made into something else', () => {
  const thermostat = device({ id: 'th', name: 'Thermostaat', deviceClass: 'thermostat', caps: [
    cap('measure_temperature', { value: 20 }), cap('measure_humidity', { value: 45 }), cap('target_temperature', { setable: true, value: 21 }),
  ] });
  const sensor = (id: string, capabilityId: string): TileSpec => ({ kind: 'sensor', id, deviceId: 'th', size: 'single', capabilityId, showCapabilityTitle: true });
  const tiles: TileLayout[] = [tileLayout(sensor('a', 'measure_temperature')), tileLayout(sensor('b', 'measure_humidity'))];
  const layout: HubLayout = hubLayout([overview([ownSection('own:a', tiles)])], { known: ['th'], names: { th: 'Thermostaat' } });
  const dry = { ...thermostat, capabilityOrder: ['measure_temperature', 'target_temperature'], capabilities: { measure_temperature: thermostat.capabilities['measure_temperature']!, target_temperature: thermostat.capabilities['target_temperature']! } };
  const away = reconcile(layout, snapshot([dry]), 'nl');
  expect(away.layout.dashboards[0]!.sections![0]!.tiles.map((tile) => tile.spec)).toEqual(tiles.map((tile) => tile.spec));
  expect(drawnTiles(away.layout.dashboards[0]!.sections![0]!.tiles, snapshot([dry])).map(({ spec: s }) => s.kind)).toEqual(['sensor']);
  const back = reconcile(away.layout, snapshot([thermostat]), 'nl');
  expect(drawnTiles(back.layout.dashboards[0]!.sections![0]!.tiles, snapshot([thermostat])).map(({ spec: s }) => s.kind)).toEqual(['sensor', 'sensor']);
  // what the app makes itself is the new tile
  expect(tilesFor(thermostat).map((tile) => tile.kind)).toEqual(['climate']);
});

test('undoing a file that was loaded takes its choices back too', () => {
  const house = toSnapshot(houseRaw('nl'));
  const kept: Record<string, HubLayout> = {};
  const layouts = createLayouts({
    snapshot: () => house, locale: () => 'nl', appearance: () => ({ theme: { seed: '#3b6939', mode: 'light', density: 'comfortable' }, sectionSeeds: {} }), setAppearance: vi.fn(),
    stored: (id) => kept[id], store: (id, layout) => { kept[id] = layout; }, startBoard: () => null, publish: vi.fn(),
  });
  layouts.use('5f2a00000000000000000c81');
  layouts.setGrouping('zone');
  layouts.setRooms(false);
  const file = layouts.exportLayout(new Date())!.text;
  layouts.setGrouping('type');
  layouts.setRooms(true);
  layouts.importLayout(file);
  expect([layouts.state().layout.grouping, layouts.state().layout.rooms]).toEqual(['zone', false]);
  layouts.undo();
  expect([layouts.state().layout.grouping, layouts.state().layout.rooms]).toEqual([undefined, undefined]);
});

// ----- devices that are something in between -----

test('of two locks on one device the one that is unlocked counts, and is what can be locked', () => {
  const two = device({ id: 'two', name: 'Deur', deviceClass: 'lock', caps: [cap('locked.front', { type: 'boolean', setable: true, value: true }), cap('locked.back', { type: 'boolean', setable: true, value: false })] });
  expect([guardState(guardOf(two)!), guardCommands(two, nl).map((c) => [c.capabilityId, c.value])]).toEqual(['unlocked', [['locked.back', true]]]);
  const both = withValue(two, 'locked.back', true);
  expect([guardState(guardOf(both)!), guardCommands(both, nl).map((c) => [c.capabilityId, c.value, c.guarded])]).toEqual(['locked', [['locked.front', false, true]]]);
  // beside a plain one the others are about something else
  const privacy = device({ id: 'p', deviceClass: 'lock', caps: [cap('locked', { type: 'boolean', setable: true, value: true }), cap('locked.privacy', { type: 'boolean', setable: true, value: false })] });
  expect(guardState(guardOf(privacy)!)).toBe('locked');
});

test('a lock is never a curtain: its buttons would do nothing', () => {
  const odd = device({ id: 'o', deviceClass: 'lock', caps: [cap('windowcoverings_set', { setable: true, min: 0, max: 1, value: 0 })] });
  expect([coverOf(odd), tilesFor(odd).map((tile) => tile.kind)]).toEqual([null, ['sensor']]);
});

// ----- sliders -----

const drag = (slider: Element, fractions: number[]) => {
  for (const fraction of fractions) slider.dispatchEvent(new CustomEvent('slide', { detail: { fraction }, bubbles: true, composed: true }));
  slider.dispatchEvent(new CustomEvent('commit', { detail: { fraction: fractions.at(-1) }, bubbles: true, composed: true }));
};

test('a target and a cover are sent once, where the slider is let go; the window says meanwhile where that is', async () => {
  const airco = await panel(heating.airco);
  const slider = inside(airco.element, '.top-of mh-slider');
  slider.dispatchEvent(new CustomEvent('slide', { detail: { fraction: 1 }, bubbles: true, composed: true }));
  await settle(airco.element);
  expect([airco.actions.slide.mock.calls, (inside(airco.element, 'mh-stepper') as HTMLElement & { value: string }).value]).toEqual([[], '31']);
  drag(slider, [0.2, 0.5]);
  await settle(airco.element);
  expect([airco.actions.slide.mock.calls.length, airco.actions.slide.mock.calls[0]![3], (inside(airco.element, 'mh-stepper') as HTMLElement & { value: string }).value]).toEqual([1, true, '22']);
  const blind = await panel(covers.both);
  const [position, slats] = deepAll(blind.element, '.top-of mh-slider') as unknown as [Element, Element];
  position.dispatchEvent(new CustomEvent('slide', { detail: { fraction: 0.8 }, bubbles: true, composed: true }));
  await settle(blind.element);
  expect([blind.actions.slide.mock.calls, inside(blind.element, '.top-of .value').textContent]).toEqual([[], '80% open']);
  drag(position, [0.5]);
  drag(slats, [0.1, 0.2, 0.3]);
  expect(blind.actions.slide.mock.calls.map(([, id, value, final]) => [id, value, final])).toEqual([['windowcoverings_set', 0.5, true], ['windowcoverings_tilt_set', 0.3, true]]);
  // the volume goes along
  const speaker = await panel(media.full);
  drag(inside(speaker.element, '.top-of mh-slider'), [0.4, 0.5]);
  expect(speaker.actions.slide.mock.calls.map((c) => c[3])).toEqual([false, false, true]);
});

test('on a tile as well', async () => {
  const of = async (kind: HouseKind, d: Device) => {
    const fake = fakeContext([d]);
    const tile = createTile({ ...spec(kind, d), size: 'wide' }, fake.ctx, 'comfortable') as TileElement;
    document.body.append(tile);
    await tile.updateComplete;
    drag(inside(tile, 'mh-slider'), [0.4, 0.5]);
    return fake.actions.slide.mock.calls.map((c) => c[3]);
  };
  expect([await of('cover', covers.setOnly), await of('media', media.full)]).toEqual([[true], [false, false, true]]);
});

test('the mute button says how it is, on the tile and in the window alike', async () => {
  const icons = async (muted: boolean) => {
    const d = withValue(media.tv, 'volume_mute', muted);
    const { element } = await panel(d);
    const fake = fakeContext([d]);
    const tile = createTile({ ...spec('media', d), size: 'wide' }, fake.ctx, 'comfortable') as TileElement;
    document.body.append(tile);
    await tile.updateComplete;
    const icon = (root: Element) => [...root.shadowRoot!.querySelectorAll('.b')].find((b) => /dempen|Geluid/.test(b.getAttribute('aria-label')!))!.querySelector('mh-icon')!.getAttribute('name');
    return [icon(element), icon(tile)];
  };
  expect([await icons(false), await icons(true)]).toEqual([['volume_up', 'volume_up'], ['volume_off', 'volume_off']]);
});

// ----- windows and rooms -----

test('a window keeps what is at its top while it goes away', async () => {
  const { element } = await panel(covers.both);
  expect(element.shadowRoot!.querySelector('.top-of')).not.toBeNull();
  element.deviceId = null;
  await settle(element);
  expect([element.shadowRoot!.querySelector('.top-of') !== null, (inside(element, 'mh-sheet') as HTMLElement & { open: boolean }).open]).toEqual([true, false]);
});

async function rooms(boardId: string) {
  const house = toSnapshot(houseRaw('nl'));
  const fake = fakeContext(Object.values(house.devices));
  fake.store.apply({ type: 'structure', zones: house.zones, flows: [] });
  fake.flush();
  const all = roomsOf(house, nl);
  const boardOf = (id: string) => { const room = all.find((r) => roomBoardId(r.id) === id); return { room: room ?? null, board: room ? boardFromDashboard(roomDashboard(room, house, 'nl'), id) : { id, left: [], right: [] } }; };
  const element = await mount<MhDashboard>('mh-dashboard', { ctx: fake.ctx, rooms: all, boards: [], phase: 'ready', density: 'comfortable', ...boardOf(boardId) });
  const go = async (id: string) => { Object.assign(element, boardOf(id)); for (let i = 0; i < 6; i += 1) { await settle(element); await Promise.resolve(); } };
  await go(boardId);
  const focused = () => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active; };
  return { element, go, focused };
}

test('opening a room with the keyboard puts the focus on its name; going back on its card', async () => {
  const s = await rooms(ROOMS_ID);
  const open = (id: string) => deep(s.element, 'mh-rooms').dispatchEvent(new CustomEvent('open-room', { detail: { id }, bubbles: true, composed: true }));
  open('hall');
  await s.go(roomBoardId('hall'));
  expect(s.focused()?.textContent).toBe('Hal');
  deep(s.element, 'mh-room-head').dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }));
  await s.go(ROOMS_ID);
  expect(s.focused()?.getAttribute('aria-label')).toMatch(/^Hal,/);
});

test('who leaves a room another way and comes back later begins at the start', async () => {
  const s = await rooms(ROOMS_ID);
  deep(s.element, 'mh-rooms').dispatchEvent(new CustomEvent('open-room', { detail: { id: 'hall' }, bubbles: true, composed: true }));
  await s.go(roomBoardId('hall'));
  (s.focused() as HTMLElement).blur();
  await s.go(roomBoardId('living'));
  await s.go(ROOMS_ID);
  expect(s.focused()?.getAttribute('aria-label') ?? '').not.toMatch(/^Hal,/);
});

test('nothing of a room is arranged, also not the colour of a section', async () => {
  const s = await rooms(roomBoardId('living'));
  expect([deepAll(s.element, 'mh-section').length > 3, deepAll(s.element, 'mh-section-menu').length]).toEqual([true, 0]);
});

test('commands of a cover are not changed by any of this', () => {
  expect(coverCommands(coverOf(covers.both)!).up).toEqual({ capabilityId: 'windowcoverings_state', value: 'up' });
});
