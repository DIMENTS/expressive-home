import { afterEach, expect, test, vi } from 'vitest';
import { applyEdit, newLayoutId, type LayoutEdit } from '../../src/layout/edit';
import { defaultHubLayout, flowRef, LIMITS, valueRef, type HeroChoice, type HubLayout } from '../../src/layout/types';
import { board, column, deepFreeze, flowTile, heroSection, hubLayout, overview, ownSection, sensorTile, tileIds } from '../helpers/layout';

afterEach(() => { vi.unstubAllGlobals(); });

/** Two boards: the overview with a hero and two sections left and one right, and "Buiten" with one section. */
const sample = (hero: HeroChoice | null = null): HubLayout => deepFreeze(hubLayout([
  overview([
    heroSection('hero:main', hero),
    ownSection('own:s-a', [sensorTile('t-1', 'd1'), sensorTile('t-2', 'd2'), sensorTile('t-3', 'd1')]),
    ownSection('own:s-b', [flowTile('t-4', 'f1')]),
    ownSection('own:s-c', [], { column: 'right' }),
  ]),
  board('d-buiten', [ownSection('own:s-x', [sensorTile('t-5', 'd1', 'measure_humidity', { source: 'value' })])], { name: 'Buiten' }),
], { known: ['d1'], names: { d1: 'Een', d2: 'Twee', [flowRef('f1')]: 'Flow' } }));

const tileMove = (tileId: string, toSectionId: string, index: number): LayoutEdit => ({ type: 'move-tile', dashboardId: 'overview', tileId, toSectionId, index });

test('moving a tile within a section and to another section', () => {
  expect(tileIds(applyEdit(sample(), tileMove('t-1', 'own:s-a', 2)), 'overview', 'own:s-a')).toEqual(['t-2', 't-3', 't-1']);
  expect(tileIds(applyEdit(sample(), tileMove('t-3', 'own:s-a', 0)), 'overview', 'own:s-a')).toEqual(['t-3', 't-1', 't-2']);
  const moved = applyEdit(sample(), tileMove('t-2', 'own:s-b', 0));
  expect(tileIds(moved, 'overview', 'own:s-a')).toEqual(['t-1', 't-3']);
  expect(tileIds(moved, 'overview', 'own:s-b')).toEqual(['t-2', 't-4']);
});

test('an index outside the section is kept within it', () => {
  expect(tileIds(applyEdit(sample(), tileMove('t-1', 'own:s-a', 99)), 'overview', 'own:s-a')).toEqual(['t-2', 't-3', 't-1']);
  expect(tileIds(applyEdit(sample(), tileMove('t-2', 'own:s-a', -5)), 'overview', 'own:s-a')).toEqual(['t-2', 't-1', 't-3']);
});

test('an edit that changes nothing or does not apply gives the same layout back', () => {
  const layout = sample();
  const edits: LayoutEdit[] = [
    tileMove('t-1', 'own:s-a', 0), tileMove('t-9', 'own:s-a', 0), tileMove('t-1', 'own:s-z', 0), tileMove('t-1', 'hero:main', 0),
    { type: 'remove-tile', dashboardId: 'd-nope', tileId: 't-1' },
    { type: 'add-tiles', dashboardId: 'overview', sectionId: 'hero:main', tiles: [sensorTile('t-9', 'd1')] },
    { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-a', tiles: [] },
    { type: 'set-tile', dashboardId: 'overview', tileId: 't-9', patch: { label: 'x' } },
    { type: 'set-tile', dashboardId: 'overview', tileId: 't-1', patch: { label: '  ' } },
    { type: 'move-section', dashboardId: 'overview', sectionId: 'own:s-a', column: 'left', index: 1 },
    { type: 'set-section', dashboardId: 'overview', sectionId: 'own:s-a', name: 'own:s-a', icon: null },
    { type: 'remove-section', dashboardId: 'overview', sectionId: 'own:s-z' },
    { type: 'set-hero', dashboardId: 'd-buiten', hero: null },
    { type: 'set-dashboard', dashboardId: 'd-nope', name: 'x', icon: null },
    { type: 'move-dashboard', dashboardId: 'overview', index: -3 },
    { type: 'know', refs: ['d1'] },
    { type: 'forget-gone', refs: ['d-none'] },
  ];
  for (const edit of edits) expect([edit, applyEdit(layout, edit) === layout]).toEqual([edit, true]);
});

test('removing one copy of a device keeps its other copies', () => {
  const layout = applyEdit(sample(), { type: 'remove-tile', dashboardId: 'overview', tileId: 't-1' });
  expect(tileIds(layout, 'overview', 'own:s-a')).toEqual(['t-2', 't-3']);
  expect(tileIds(layout, 'd-buiten', 'own:s-x')).toEqual(['t-5']);
});

test('an edit on an automatic dashboard changes nothing', () => {
  const layout = deepFreeze(defaultHubLayout());
  const edits: LayoutEdit[] = [
    { type: 'remove-tile', dashboardId: 'overview', tileId: 't-1' },
    { type: 'add-tiles', dashboardId: 'overview', sectionId: 'type:lights', tiles: [sensorTile('t-9', 'd1')] },
    { type: 'add-section', dashboardId: 'overview', section: ownSection('own:s-n'), index: 0 },
    { type: 'set-hero', dashboardId: 'overview', hero: null },
  ];
  for (const edit of edits) expect([edit, applyEdit(layout, edit) === layout]).toEqual([edit, true]);
});

test('the overview can be renamed and moved in the rail while it is automatic', () => {
  const layout = applyEdit(applyEdit(deepFreeze(defaultHubLayout()), { type: 'set-dashboard', dashboardId: 'overview', name: ' Thuis ', icon: 'home' }),
    { type: 'add-dashboard', dashboard: board('d-n', []) });
  expect(layout.dashboards[0]).toEqual({ id: 'overview', name: 'Thuis', icon: 'home', sections: null });
  expect(applyEdit(layout, { type: 'move-dashboard', dashboardId: 'overview', index: 1 }).dashboards.map((d) => d.id)).toEqual(['d-n', 'overview']);
});

test('adding tiles goes to the end of the section', () => {
  const layout = applyEdit(sample(), { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-b', tiles: [sensorTile('t-8', 'd1'), sensorTile('t-9', 'd1')] });
  expect(tileIds(layout, 'overview', 'own:s-b')).toEqual(['t-4', 't-8', 't-9']);
});

test('a tile with an id that is already somewhere is refused', () => {
  const layout = sample();
  expect(applyEdit(layout, { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-b', tiles: [sensorTile('t-5', 'd1')] })).toBe(layout);
  expect(applyEdit(layout, { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-b', tiles: [sensorTile('t-8', 'd1'), sensorTile('t-8', 'd1')] })).toBe(layout);
});

test('a tile takes a new size, name, icon or choice', () => {
  const layout = applyEdit(sample(), { type: 'set-tile', dashboardId: 'overview', tileId: 't-1', patch: { size: 'wide', label: ' Buiten ', icon: 'park' } });
  expect(layout.dashboards[0]!.sections![1]!.tiles[0]).toMatchObject({ id: 't-1', size: 'wide', label: 'Buiten', icon: 'park', source: 'device' });
});

test('a second hero on the same dashboard is refused', () => {
  const layout = sample();
  expect(applyEdit(layout, { type: 'add-section', dashboardId: 'overview', section: heroSection('hero:two'), index: 0 })).toBe(layout);
  const other = applyEdit(layout, { type: 'add-section', dashboardId: 'd-buiten', section: heroSection('hero:d-buiten'), index: 0 });
  expect(column(other, 'd-buiten', 'left')).toEqual(['hero:d-buiten', 'own:s-x']);
});

test('a section is added at its place in its column; an id in use is refused', () => {
  const layout = sample();
  const added = applyEdit(layout, { type: 'add-section', dashboardId: 'overview', section: ownSection('own:s-n'), index: 1 });
  expect(column(added, 'overview', 'left')).toEqual(['hero:main', 'own:s-n', 'own:s-a', 'own:s-b']);
  const last = applyEdit(layout, { type: 'add-section', dashboardId: 'overview', section: ownSection('own:s-n', [], { column: 'right' }), index: 99 });
  expect(column(last, 'overview', 'right')).toEqual(['own:s-c', 'own:s-n']);
  expect(applyEdit(layout, { type: 'add-section', dashboardId: 'd-buiten', section: ownSection('own:s-a'), index: 0 })).toBe(layout);
});

test('a removed section takes its tiles; moving a section to the other column', () => {
  const removed = applyEdit(sample(), { type: 'remove-section', dashboardId: 'overview', sectionId: 'own:s-a' });
  expect(column(removed, 'overview', 'left')).toEqual(['hero:main', 'own:s-b']);
  expect(JSON.stringify(removed)).not.toContain('"t-1"');
  const moved = applyEdit(sample(), { type: 'move-section', dashboardId: 'overview', sectionId: 'own:s-a', column: 'right', index: 0 });
  expect(column(moved, 'overview', 'right')).toEqual(['own:s-a', 'own:s-c']);
  expect(column(moved, 'overview', 'left')).toEqual(['hero:main', 'own:s-b']);
  const down = applyEdit(sample(), { type: 'move-section', dashboardId: 'overview', sectionId: 'own:s-a', column: 'left', index: 2 });
  expect(column(down, 'overview', 'left')).toEqual(['hero:main', 'own:s-b', 'own:s-a']);
});

test('names are trimmed to 60 characters and an empty name becomes null', () => {
  const long = 'é'.repeat(100);
  const layout = applyEdit(sample(), { type: 'set-section', dashboardId: 'overview', sectionId: 'own:s-a', name: `  ${long}`, icon: 'park' });
  expect(layout.dashboards[0]!.sections![1]).toMatchObject({ name: 'é'.repeat(LIMITS.nameLength), icon: 'park' });
  expect(applyEdit(layout, { type: 'set-section', dashboardId: 'overview', sectionId: 'own:s-a', name: '   ', icon: null }).dashboards[0]!.sections![1]).toMatchObject({ name: null, icon: null });
  expect(applyEdit(sample(), { type: 'add-dashboard', dashboard: board('d-n', [], { name: long }) }).dashboards[2]!.name).toBe('é'.repeat(60));
  expect(applyEdit(sample(), { type: 'add-section', dashboardId: 'overview', section: ownSection('own:s-n', [], { name: long }), index: 0 }).dashboards[0]!.sections![0]!.name).toBe('é'.repeat(60));
});

test('adding beyond the limits is refused', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => sensorTile(`t-m${i}`, 'd1'));
  const layout = sample();
  expect(applyEdit(layout, { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-b', tiles: many(LIMITS.tilesPerDashboard - 4) })).not.toBe(layout);
  expect(applyEdit(layout, { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-b', tiles: many(LIMITS.tilesPerDashboard - 3) })).toBe(layout);
  let boards: HubLayout = hubLayout([overview([])]);
  for (let i = 1; i < LIMITS.dashboards; i += 1) boards = applyEdit(boards, { type: 'add-dashboard', dashboard: board(`d-${i}`, []) });
  expect(boards.dashboards).toHaveLength(LIMITS.dashboards);
  expect(applyEdit(boards, { type: 'add-dashboard', dashboard: board('d-x', []) })).toBe(boards);
  let sections: HubLayout = hubLayout([overview([])]);
  for (let i = 0; i < LIMITS.sectionsPerDashboard; i += 1) sections = applyEdit(sections, { type: 'add-section', dashboardId: 'overview', section: ownSection(`own:s-${i}`), index: i });
  expect(sections.dashboards[0]!.sections).toHaveLength(LIMITS.sectionsPerDashboard);
  expect(applyEdit(sections, { type: 'add-section', dashboardId: 'overview', section: ownSection('own:s-x'), index: 0 })).toBe(sections);
});

test('the hero takes an own choice and goes back to automatic', () => {
  const choice: HeroChoice = { main: { deviceId: 'd1', capabilityId: 'tank_level' }, line: null, stats: [1, 2, 3, 4, 5].map((n) => ({ deviceId: `d${n}`, capabilityId: 'x' })), name: '  ' };
  const own = applyEdit(sample(), { type: 'set-hero', dashboardId: 'overview', hero: choice });
  expect(own.dashboards[0]!.sections![0]!.hero).toEqual({ ...choice, stats: choice.stats.slice(0, LIMITS.heroStats), name: null });
  expect(applyEdit(own, { type: 'set-hero', dashboardId: 'overview', hero: null }).dashboards[0]!.sections![0]!.hero).toBeNull();
});

test('the overview cannot be removed', () => {
  const layout = sample();
  expect(applyEdit(layout, { type: 'remove-dashboard', dashboardId: 'overview' })).toBe(layout);
  expect(applyEdit(layout, { type: 'remove-dashboard', dashboardId: 'd-buiten' }).dashboards.map((d) => d.id)).toEqual(['overview']);
});

test('a dashboard that is added is always an own one', () => {
  expect(applyEdit(sample(), { type: 'add-dashboard', dashboard: board('d-n', null) }).dashboards[2]).toMatchObject({ id: 'd-n', sections: [] });
  const layout = sample();
  expect(applyEdit(layout, { type: 'add-dashboard', dashboard: board('d-buiten', []) })).toBe(layout);
});

test('what the app knows grows without duplicates', () => {
  expect(applyEdit(sample(), { type: 'know', refs: ['d2', 'd1', 'd2', flowRef('f1')] }).known).toEqual(['d1', 'd2', 'flow:f1']);
});

test('forget-gone removes every tile of a gone device on every dashboard', () => {
  const layout = applyEdit(sample(), { type: 'forget-gone', refs: ['d1'] });
  expect(tileIds(layout, 'overview', 'own:s-a')).toEqual(['t-2']);
  expect(tileIds(layout, 'd-buiten', 'own:s-x')).toEqual([]);
  expect(layout.names).toEqual({ d2: 'Twee', [flowRef('f1')]: 'Flow' });
  expect(tileIds(applyEdit(sample(), { type: 'forget-gone', refs: [flowRef('f1')] }), 'overview', 'own:s-b')).toEqual([]);
});

test('forget-gone of one value removes only the tiles of that value', () => {
  const layout = applyEdit(sample(), { type: 'forget-gone', refs: [valueRef('d1', 'measure_humidity')] });
  expect(tileIds(layout, 'd-buiten', 'own:s-x')).toEqual([]);
  expect(tileIds(layout, 'overview', 'own:s-a')).toEqual(['t-1', 't-2', 't-3']);
  // a tile of the whole device is not a tile of one of its values
  expect(tileIds(applyEdit(sample(), { type: 'forget-gone', refs: [valueRef('d1', 'measure_temperature')] }), 'overview', 'own:s-a')).toEqual(['t-1', 't-2', 't-3']);
});

const ref = (deviceId: string, capabilityId: string) => ({ deviceId, capabilityId });

test('forget-gone sends the hero back to automatic when its main value is gone', () => {
  const choice: HeroChoice = { main: ref('d7', 'tank_level'), line: null, stats: [], name: 'Water' };
  expect(applyEdit(sample(choice), { type: 'forget-gone', refs: ['d7'] }).dashboards[0]!.sections![0]!.hero).toBeNull();
  expect(applyEdit(sample(choice), { type: 'forget-gone', refs: [valueRef('d7', 'tank_level')] }).dashboards[0]!.sections![0]!.hero).toBeNull();
});

test('forget-gone drops only a gone stat or line of an own hero', () => {
  const choice: HeroChoice = { main: ref('d7', 'tank_level'), line: ref('d8', 'time_to_go'), stats: [ref('d8', 'x'), { net: true }, ref('d9', 'x')], name: 'Water' };
  expect(applyEdit(sample(choice), { type: 'forget-gone', refs: ['d8'] }).dashboards[0]!.sections![0]!.hero)
    .toEqual({ main: ref('d7', 'tank_level'), line: null, stats: [{ net: true }, ref('d9', 'x')], name: 'Water' });
});

test('applyEdit never changes the layout it gets', () => {
  const layout = sample({ main: ref('d1', 'x'), line: null, stats: [], name: null });
  const before = JSON.stringify(layout);
  const edits: LayoutEdit[] = [
    tileMove('t-1', 'own:s-b', 0), { type: 'remove-tile', dashboardId: 'overview', tileId: 't-1' },
    { type: 'add-tiles', dashboardId: 'overview', sectionId: 'own:s-c', tiles: [sensorTile('t-8', 'd1')] },
    { type: 'set-tile', dashboardId: 'overview', tileId: 't-1', patch: { label: 'x' } },
    { type: 'add-section', dashboardId: 'overview', section: ownSection('own:s-n'), index: 0 },
    { type: 'move-section', dashboardId: 'overview', sectionId: 'own:s-a', column: 'right', index: 0 },
    { type: 'set-section', dashboardId: 'overview', sectionId: 'own:s-a', name: 'x', icon: 'park' },
    { type: 'remove-section', dashboardId: 'overview', sectionId: 'own:s-a' },
    { type: 'set-hero', dashboardId: 'overview', hero: null },
    { type: 'add-dashboard', dashboard: board('d-n', []) }, { type: 'set-dashboard', dashboardId: 'd-buiten', name: 'x', icon: null },
    { type: 'move-dashboard', dashboardId: 'd-buiten', index: 0 }, { type: 'remove-dashboard', dashboardId: 'd-buiten' },
    { type: 'know', refs: ['d9'] }, { type: 'forget-gone', refs: ['d1'] },
  ];
  for (const edit of edits) expect([edit.type, applyEdit(layout, edit) !== layout]).toEqual([edit.type, true]);
  expect(JSON.stringify(layout)).toBe(before);
});

test('ids are unique and do not use randomUUID', () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto), randomUUID: () => { throw new Error('only on a secure origin'); } });
  const ids = Array.from({ length: 1000 }, () => newLayoutId('t'));
  expect(new Set(ids).size).toBe(1000);
  for (const id of ids) expect(id).toMatch(/^t-[0-9a-z]{8}$/);
  expect(newLayoutId('s')).toMatch(/^s-/);
  expect(newLayoutId('d')).toMatch(/^d-/);
});
