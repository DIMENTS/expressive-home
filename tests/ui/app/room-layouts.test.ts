import { expect, test, vi } from 'vitest';
import { toSnapshot } from '../../../src/homey/map';
import type { HomeySnapshot } from '../../../src/homey/types';
import type { HubLayout } from '../../../src/layout/types';
import { houseRaw } from '../../../src/mock/house';
import { createLayouts } from '../../../src/ui/app/layouts';
import { hubLayout, overview } from '../../helpers/layout';

// The layouts with the Overzicht per room.

const HUB = '5f2a00000000000000000c81';
function setup(start: HubLayout | undefined = undefined) {
  let current: HomeySnapshot = toSnapshot(houseRaw('nl'));
  const kept: Record<string, HubLayout> = start ? { [HUB]: start } : {};
  const publish = vi.fn();
  const layouts = createLayouts({
    snapshot: () => current, locale: () => 'nl', appearance: () => ({ theme: { seed: '#3b6939', mode: 'light', density: 'comfortable' }, sectionSeeds: {} }), setAppearance: vi.fn(),
    stored: (id) => kept[id], store: (id, layout) => { kept[id] = layout; }, startBoard: () => null, publish,
  });
  layouts.use(HUB);
  const sections = () => [...layouts.state().board!.left, ...layouts.state().board!.right].flatMap((b) => (b.type === 'section' ? [b.section] : []));
  return { layouts, kept, publish, sections, change: (next: HomeySnapshot) => { current = next; layouts.refresh(); }, now: () => current };
}

test('the choice is kept per hub, drawn at once, and no step to undo', () => {
  const s = setup();
  expect(s.sections().map((x) => x.kind)).toContain('lights');
  s.layouts.setGrouping('zone');
  expect([s.kept[HUB]!.grouping, s.publish.mock.calls.length, s.layouts.state().canUndo]).toEqual(['zone', 1, false]);
  expect(s.sections().filter((x) => x.zone !== undefined)).toHaveLength(8);
  s.layouts.setGrouping('zone');
  expect(s.publish).toHaveBeenCalledTimes(1);
  s.layouts.setGrouping('type');
  expect([s.kept[HUB]!.grouping, 'grouping' in s.kept[HUB]!, s.sections().some((x) => x.zone !== undefined)]).toEqual([undefined, false, false]);
});

test('the rooms are there, and can be hidden', () => {
  const s = setup();
  s.layouts.setRooms(false);
  expect(s.kept[HUB]!.rooms).toBe(false);
  s.layouts.setRooms(true);
  expect('rooms' in s.kept[HUB]!).toBe(false);
});

test('the first edit freezes the rooms as they are, with everything in its place', () => {
  const s = setup();
  s.layouts.setGrouping('zone');
  const before = s.sections().map((x) => [x.id, x.name ?? null, x.icon ?? null, x.zone, x.tiles.length]);
  s.layouts.edit({ type: 'set-section', dashboardId: 'overview', sectionId: 'own:zone:kitchen', name: 'Kookhoek', icon: 'countertops' });
  expect(s.sections().map((x) => [x.id, x.name ?? null, x.icon ?? null, x.zone, x.tiles.length])).toEqual(before.map((row) => (row[0] === 'own:zone:kitchen' ? [row[0], 'Kookhoek', ...row.slice(2)] : row)));
  expect(s.layouts.state().layout.dashboards[0]!.sections).not.toBeNull();
  s.layouts.undo();
  expect([s.layouts.state().layout.dashboards[0]!.sections, s.layouts.state().layout.grouping]).toEqual([null, 'zone']);
});

test('undoing what was done before keeps the choice of now', () => {
  const s = setup();
  s.layouts.edit({ type: 'set-section', dashboardId: 'overview', sectionId: 'type:lights', name: 'Lampen', icon: null });
  s.layouts.setGrouping('zone');
  s.layouts.setRooms(false);
  s.layouts.undo();
  expect([s.layouts.state().layout.grouping, s.layouts.state().layout.rooms, s.layouts.state().layout.dashboards[0]!.sections]).toEqual(['zone', false, null]);
});

test('what is new in a room goes to its section, unless that is gone', () => {
  const s = setup();
  s.layouts.setGrouping('zone');
  s.layouts.edit({ type: 'set-section', dashboardId: 'overview', sectionId: 'own:zone:kitchen', name: 'Kookhoek', icon: null });
  const lamp = { ...s.now().devices['kitchen-ceiling']!, id: 'nieuw', name: 'Nieuwe lamp' };
  s.change({ ...s.now(), devices: { ...s.now().devices, nieuw: lamp } });
  expect(s.layouts.state().news.map((n) => [n.name, n.room?.name])).toEqual([['Nieuwe lamp', 'Kookhoek']]);
  s.layouts.placeNew('nieuw', null);
  expect(s.sections().find((x) => x.id === 'own:zone:kitchen')!.tiles.at(-1)).toMatchObject({ kind: 'light', deviceId: 'nieuw' });
  expect(s.sections().some((x) => x.kind === 'lights')).toBe(false);
});

test('a file takes the choice along, and without one the choice stays', () => {
  const s = setup();
  s.layouts.setGrouping('zone');
  const file = s.layouts.exportLayout(new Date())!.text;
  s.layouts.setGrouping('type');
  s.layouts.importLayout(file);
  expect(s.layouts.state().layout.grouping).toBe('zone');
  const plain = JSON.stringify({ ...JSON.parse(file), grouping: undefined });
  s.layouts.importLayout(plain);
  expect(s.layouts.state().layout.grouping).toBe('zone');
});

test('a choice made on another device is taken over', () => {
  const s = setup(hubLayout([overview(null)]));
  s.kept[HUB] = { ...s.kept[HUB]!, grouping: 'zone', rooms: false };
  s.layouts.adopt();
  expect([s.layouts.state().layout.grouping, s.layouts.state().layout.rooms, s.sections().some((x) => x.zone === 'living')]).toEqual(['zone', false, true]);
});

test('the Overzicht back to automatic keeps the choice', () => {
  const s = setup();
  s.layouts.setGrouping('zone');
  s.layouts.edit({ type: 'remove-section', dashboardId: 'overview', sectionId: 'own:zone:hall' });
  s.layouts.resetOverview();
  expect(s.sections().some((x) => x.zone === 'hall')).toBe(true);
});

test('the arrangement of a first start goes only onto an automatic Overzicht, and is no step to undo', () => {
  const s = setup();
  const arranged = { sections: [{ id: 'own:s-1', kind: 'own' as const, column: 'left' as const, name: 'Vandaag', icon: null, tiles: [], hero: null }], known: ['a'], names: { a: 'A' } };
  expect(s.layouts.arrangeOverview(arranged)).toBe(true);
  expect([s.kept[HUB]!.dashboards[0]!.sections!.map((x) => x.id), s.layouts.state().canUndo]).toEqual([['own:s-1'], false]);
  // another device arranged it first: what it did stays
  expect(s.layouts.arrangeOverview({ ...arranged, sections: [] })).toBe(false);
  expect(s.kept[HUB]!.dashboards[0]!.sections!.map((x) => x.id)).toEqual(['own:s-1']);
  const own = setup(hubLayout([overview([])]));
  expect(own.layouts.arrangeOverview(arranged)).toBe(false);
});
