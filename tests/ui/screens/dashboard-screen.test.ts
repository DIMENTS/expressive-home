// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/tiles/index';
import '../../../src/ui/screens/dashboard-screen';
import { DIM_CLOSE_MS, MhDashboard } from '../../../src/ui/screens/dashboard-screen';
import type { DashboardStatus } from '../../../src/ui/app/context';
import type { HeroSpec } from '../../../src/dashboard/types';
import { boardFromDashboard, boardFromLayout, type BoardView } from '../../../src/layout/board';
import type { DashboardLayout } from '../../../src/layout/types';
import { board, flowTile, heroSection, overview, ownSection, sensorTile, tileLayout } from '../../helpers/layout';
import { deepText } from '../../helpers/deep';
import type { MhMenu } from '../../../src/ui/parts/menu';
import { inside, mount, record, settle } from '../../helpers/mount';
import type { LayoutEdit } from '../../../src/layout/edit';
import { camper } from '../../helpers/camper';

afterEach(() => { document.body.replaceChildren(); });

async function setup(props: Record<string, unknown> = {}, status: Partial<DashboardStatus> = {}) {
  const fake = camper(status);
  const element = await mount<MhDashboard>('mh-dashboard', { ctx: fake.ctx, board: boardFromDashboard(fake.dashboard, 'overview'), phase: 'ready', emptyReason: 'none', banner: 'none', density: 'comfortable', connecting: false, activePanel: 'none', ...props });
  return { ...fake, element };
}
const text = (element: Element) => element.shadowRoot!.textContent ?? '';
const all = (element: Element, selector: string) => [...element.shadowRoot!.querySelectorAll(selector)];

test('the ready dashboard shows the hero and every section', async () => {
  const { element } = await setup();
  expect(all(element, 'mh-hero')).toHaveLength(1);
  expect(all(element, 'mh-section')).toHaveLength(7);
  const left = all(element, '.col')[0]!;
  expect([...left.querySelectorAll('mh-section')].map((s) => (s as HTMLElement & { section: { kind: string } }).section.kind)).toEqual(['lights', 'switches']);
});

test('while loading there is a skeleton and the chip says Verbinden…', async () => {
  const { element } = await setup({ phase: 'loading', connecting: true, board: null });
  expect(all(element, 'mh-skeleton')).toHaveLength(1);
  expect(all(element, 'mh-section')).toHaveLength(0);
  const header = inside(element, 'mh-header');
  expect(header.shadowRoot!.textContent).toContain('Verbinden…');
});

test('an unreachable start shows the empty state with both actions', async () => {
  const { element } = await setup({ phase: 'unreachable', board: null }, { route: null });
  expect(inside(element, 'mh-empty-state').getAttribute('heading')).toBe('Geen verbinding met je Homey');
  const retries = record(element, 'retry');
  const changes = record(element, 'change-connection');
  const buttons = all(element, 'mh-empty-state mh-button') as HTMLElement[];
  buttons[0]!.shadowRoot!.querySelector('button')!.click();
  buttons[1]!.shadowRoot!.querySelector('button')!.click();
  expect(retries).toHaveLength(1);
  expect(changes).toHaveLength(1);
});

test('a hub without devices and a key without the right each have their own empty state', async () => {
  const empty = await setup({ emptyReason: 'no-devices' });
  expect(inside(empty.element, 'mh-empty-state').getAttribute('heading')).toBe('Nog geen apparaten');
  document.body.replaceChildren();
  const noRight = await setup({ emptyReason: 'no-right' });
  expect(inside(noRight.element, 'mh-empty-state').getAttribute('heading')).toBe('Geen apparaten te zien');
  expect(text(noRight.element) + inside(noRight.element, 'mh-empty-state').textContent).toContain('Deze sleutel mag geen apparaten bekijken');
});

test('the offline banner is an alert with a retry button', async () => {
  const { element } = await setup({ banner: 'offline' }, { route: null });
  const banner = inside(element, 'mh-banner');
  expect(banner.shadowRoot!.querySelector('[role="alert"]')).not.toBeNull();
  expect(banner.getAttribute('tone')).toBe('error');
  const retries = record(element, 'retry');
  (banner.querySelector('mh-button') as HTMLElement).shadowRoot!.querySelector('button')!.click();
  expect(retries).toHaveLength(1);
});

test('the restored banner says Weer verbonden', async () => {
  const { element } = await setup({ banner: 'restored' });
  const banner = inside(element, 'mh-banner');
  expect(banner.getAttribute('tone')).toBe('ok');
  expect(banner.getAttribute('heading')).toBe('Weer verbonden');
});

test('the flows section explains itself when flows cannot be started', async () => {
  const { element } = await setup({}, { canStartFlows: false });
  const flows = all(element, 'mh-section').find((s) => (s as HTMLElement & { section: { kind: string } }).section.kind === 'flows') as HTMLElement & { note: string };
  expect(flows.note).toBe('Deze sleutel mag geen flows starten.');
});

test('a page of the app on the hub says what to do with flows that cannot be started', async () => {
  const { element } = await setup({}, { canStartFlows: false, served: true });
  const flows = all(element, 'mh-section').find((s) => (s as HTMLElement & { section: { kind: string } }).section.kind === 'flows') as HTMLElement & { note: string };
  expect(flows.note).toBe('De grijze flows kunnen hier niet starten. Geef ze een knop met de flowkaart van Expressive Home, of voeg een sleutel toe in de instellingen van de app op je Homey.');
});

test('a section with only buttons has nothing to explain, unless a flow is off', async () => {
  const buttons = boardFromLayout(board('d-1', [ownSection('own:a', [flowTile('t-1', 'button:film'), flowTile('t-2', 'button:nacht')])]), camper().snapshot, 'nl');
  const note = async (off: boolean, more: ReturnType<typeof flowTile>[] = []) => {
    const flows = [{ id: 'button:film', name: 'Film', kind: 'flow' as const, startable: true }, { id: 'button:nacht', name: 'Nacht', kind: 'flow' as const, startable: !off }, { id: 'f1', name: 'Uit', kind: 'flow' as const, startable: true }];
    const fake = await setup({}, { canStartFlows: false, served: true });
    fake.ctx.store.load({ ...camper().snapshot, flows });
    const view = boardFromLayout(board('d-1', [ownSection('own:a', [flowTile('t-1', 'button:film'), flowTile('t-2', 'button:nacht'), ...more])]), { ...camper().snapshot, flows }, 'nl');
    Object.assign(fake.element, { board: view });
    await settle(fake.element);
    return (all(fake.element, 'mh-section')[0] as HTMLElement & { note: string }).note;
  };
  expect(buttons.left).toBeDefined();
  const refused = await setup({}, { canStartFlows: false, served: true });
  refused.ctx.store.load({ ...camper().snapshot, flowAccess: 'refused' });
  Object.assign(refused.element, { density: 'compact' });
  await settle(refused.element);
  const section = all(refused.element, 'mh-section').find((s) => (s as HTMLElement & { section: { kind: string } }).section.kind === 'flows') as HTMLElement & { note: string };
  expect(section.note).toBe('De Homey accepteert de sleutel voor flows niet meer. Maak een nieuwe: zie in de Homey-app de instellingen van Expressive Home.');
  expect(await note(false)).toBe('');
  expect(await note(true)).toBe('Een grijze knop hoort bij een flow die in Homey uitstaat.');
  expect(await note(true, [flowTile('t-3', 'f1')])).toMatch(/^De grijze flows .* Een grijze knop hoort bij een flow die in Homey uitstaat\.$/);
});

test('the rail marks the open panel', async () => {
  const { element } = await setup({ activePanel: 'theme' });
  const rail = inside(element, 'mh-rail');
  const current = rail.shadowRoot!.querySelector('[aria-current="page"]');
  expect(current?.textContent).toContain('Thema');
  const moves = record<{ to: string }>(element, 'navigate');
  ([...rail.shadowRoot!.querySelectorAll('button')].at(-1) as HTMLElement).click();
  expect(moves).toEqual([{ to: 'settings' }]);
});

test('the header greets and shows the route', async () => {
  const { element } = await setup();
  const header = inside(element, 'mh-header');
  expect(header.shadowRoot!.querySelector('h1')!.textContent).toMatch(/^Goede(morgen|middag|navond|nacht)$/);
  expect(header.shadowRoot!.textContent).toContain('Lokaal verbonden');
});

// ----- boards and the edit mode -----

type SectionEl = HTMLElement & { section: { id: string; kind: string; name?: string | null }; note: string; editing: boolean };
const column = (element: Element, index: number) => [...all(element, '.col')[index]!.children].map((child) =>
  (child.tagName === 'MH-HERO' ? (child as HTMLElement & { sectionId: string }).sectionId : child.tagName === 'MH-SECTION' ? (child as SectionEl).section.id : child.className));
const view = (layout: DashboardLayout): BoardView => boardFromLayout(layout, camper().snapshot, 'nl');
const ownBoard = () => board('d-1', [
  ownSection('own:a', [sensorTile('t-1', 'device-13')], { name: 'Binnen' }), heroSection('hero:d-1', null, 'right'), ownSection('own:b', [flowTile('t-2', 'flow-1')], { column: 'right' }),
]);

test('the automatic camper looks as in round 1C', async () => {
  const { element } = await setup();
  expect(column(element, 0)).toEqual(['hero:main', 'type:lights', 'type:switches']);
  expect(column(element, 1)).toEqual(['type:climate', 'type:water', 'type:security', 'type:other', 'type:flows']);
  expect(all(element, 'mh-edit-bar')).toHaveLength(0);
  expect(all(element, '.add-slot')).toHaveLength(0);
});

test('an own board draws its columns and order, with the hero in the right column', async () => {
  const { element } = await setup({ board: view(ownBoard()) });
  expect(column(element, 0)).toEqual(['own:a']);
  expect(column(element, 1)).toEqual(['hero:d-1', 'own:b']);
  expect(deepText(all(element, 'mh-section')[0]!)).toContain('Binnen');
});

test('a section with a flow shows the missing right', async () => {
  const { element } = await setup({ board: view(ownBoard()) }, { canStartFlows: false });
  const notes = (all(element, 'mh-section') as SectionEl[]).map((section) => [section.section.id, section.note]);
  expect(notes).toEqual([['own:a', ''], ['own:b', 'Deze sleutel mag geen flows starten.']]);
});

test('while editing there is an edit bar, and every column ends with Sectie toevoegen', async () => {
  const { element } = await setup({ board: view(ownBoard()), editing: true, canUndo: true, firstTime: false, boardName: 'Buiten' });
  const bar = inside(element, 'mh-edit-bar') as HTMLElement & { boardName: string; canUndo: boolean };
  expect([bar.boardName, bar.canUndo]).toEqual(['Buiten', true]);
  expect(column(element, 0)).toEqual(['own:a', 'add-slot']);
  expect(column(element, 1)).toEqual(['hero:d-1', 'own:b', 'add-slot']);
  const opens = record(element, 'open-section-dialog');
  const slots = all(element, '.add-slot') as HTMLElement[];
  expect(slots[0]!.textContent!.trim()).toBe('Sectie toevoegen');
  slots[0]!.click();
  slots[1]!.click();
  expect(opens).toEqual([{ sectionId: null, column: 'left' }, { sectionId: null, column: 'right' }]);
  expect((all(element, 'mh-section') as SectionEl[]).every((section) => section.editing)).toBe(true);
});

test('with one column everything stands left, but while editing both columns are there', async () => {
  const layout = board('d-1', [ownSection('own:a', [], { column: 'right' })]);
  const { element } = await setup({ board: view(layout) });
  expect(column(element, 0)).toEqual(['own:a']);
  expect(column(element, 1)).toEqual([]);
  element.editing = true;
  await settle(element);
  expect(column(element, 0)).toEqual(['add-slot']);
  expect(column(element, 1)).toEqual(['own:a', 'add-slot']);
});

test('a hero with nothing to show appears only while editing', async () => {
  const empty = { id: 'd-1', left: [{ type: 'hero', id: 'hero:d-1', hero: null as HeroSpec | null }], right: [] } as BoardView;
  const { element } = await setup({ board: empty });
  expect(all(element, 'mh-hero')).toHaveLength(0);
  element.editing = true;
  await settle(element);
  const hero = inside(element, 'mh-hero');
  expect(deepText(hero)).toContain('Blikvanger');
  expect(deepText(hero)).toContain('Deze Homey heeft niets voor een automatische blikvanger.');
});

test('sections keep their element when they move to the other column, and tiles when they move to another section', async () => {
  const layout = ownBoard();
  const { element } = await setup({ board: view(layout) });
  const sectionA = (all(element, 'mh-section') as SectionEl[]).find((el) => el.section.id === 'own:a')!;
  const tile = sectionA.shadowRoot!.querySelector('mh-sensor-tile');
  expect(tile).not.toBeNull();
  const moved = board('d-1', [{ ...layout.sections![0]!, column: 'right' }, ...layout.sections!.slice(1)]);
  element.board = view(moved);
  await settle(element);
  expect((all(element, 'mh-section') as SectionEl[]).find((el) => el.section.id === 'own:a')).toBe(sectionA);
  expect(sectionA.shadowRoot!.querySelector('mh-sensor-tile')).toBe(tile);
  // and the tile to the other section
  const [a, hero, b] = layout.sections!;
  element.board = view(board('d-1', [{ ...a!, tiles: [] }, hero!, { ...b!, tiles: [...a!.tiles, ...b!.tiles] }]));
  await settle(element);
  const sectionB = (all(element, 'mh-section') as SectionEl[]).find((el) => el.section.id === 'own:b')!;
  await settle(sectionB as unknown as { updateComplete: Promise<unknown> });
  expect(sectionB.shadowRoot!.querySelector('mh-sensor-tile')).toBe(tile);
});

test('a tile that changed kind gets another element', async () => {
  const { element } = await setup({ board: view(ownBoard()) });
  const changed = view(ownBoard());
  const first = changed.left[0]!;
  if (first.type === 'section') first.section.tiles = [{ kind: 'generic', id: 't-1', deviceId: 'device-13', size: 'single', capabilityId: null }];
  element.board = changed;
  await settle(element);
  const sectionA = all(element, 'mh-section')[0]!;
  expect([sectionA.shadowRoot!.querySelectorAll('mh-sensor-tile').length, sectionA.shadowRoot!.querySelectorAll('mh-generic-tile').length]).toEqual([0, 1]);
});

test('the rail gets the dashboards and the edit mode', async () => {
  const boards = [{ id: 'overview', name: 'Overzicht', icon: 'dashboard', badge: false }, { id: 'd-1', name: 'Buiten', icon: 'deck', badge: false }];
  const { element } = await setup({ boards, editing: true, board: view(ownBoard()) });
  const rail = inside(element, 'mh-rail') as HTMLElement & { boards: unknown; activeBoard: string; editing: boolean };
  expect([rail.boards, rail.activeBoard, rail.editing]).toEqual([boards, 'd-1', true]);
});

test('the hero of a board has the colour of its own section', async () => {
  const { element } = await setup({ board: view(overview([heroSection('hero:main')])), sectionSeeds: { 'hero:main': '#a6422a', 'hero:d-1': '#3a5ba9' } });
  expect((inside(element, 'mh-hero') as HTMLElement & { seed: string }).seed).toBe('#a6422a');
  element.board = view(ownBoard());
  await settle(element);
  expect((inside(element, 'mh-hero') as HTMLElement & { seed: string }).seed).toBe('#3a5ba9');
});

// ----- the menu of a tile and of a section -----

const multi = tileLayout({ kind: 'multi', id: 't-m', deviceId: 'device-3', size: 'wide', capabilityIds: ['measure_starlink_download', 'measure_starlink_upload', 'measure_starlink_latency'] });
const lamp = tileLayout({ kind: 'light', id: 't-l', deviceId: 'device-1', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' });
const menuBoard = () => board('d-1', [
  ownSection('own:a', [sensorTile('t-1', 'device-13', 'measure_temperature', { label: 'Binnen' }), lamp, multi], { name: 'Kamer', icon: 'weekend' }),
  heroSection('hero:d-1', null, 'right'), ownSection('own:b', [flowTile('t-2', 'flow-1')], { name: 'Buiten', column: 'right' }), ownSection('own:c', [], { name: 'Leeg', column: 'right' }),
]);

async function editing(layout = menuBoard()) {
  const s = await setup({ board: view(layout), editing: true });
  const edits = record<{ edit: LayoutEdit }>(s.element, 'layout-edit');
  const tile = (id: string) => (all(s.element, 'mh-section') as HTMLElement[]).flatMap((section) => [...section.shadowRoot!.querySelectorAll<HTMLElement & { spec: { id: string } }>('.tiles > *')]).find((el) => el.spec?.id === id)!;
  const openMenu = async (id: string) => {
    tile(id).dispatchEvent(new CustomEvent('tile-menu', { detail: { tileId: id }, bubbles: true, composed: true }));
    await settle(s.element);
  };
  const menu = () => s.element.shadowRoot!.querySelector<MhMenu>('mh-menu.tile-menu')!;
  const shown = () => menu().groups.map((g) => [g.title, ...(g.kind === 'items' ? g.items.map((i) => `${i.label}${i.disabled ? ' (uit)' : ''}${i.checked ? ' ✓' : ''}`) : [])]);
  const choose = async (group: string, id: string) => {
    menu().dispatchEvent(new CustomEvent('select', { detail: { group, id }, bubbles: true, composed: true }));
    await settle(s.element);
  };
  return { ...s, edits, tile, openMenu, menu, shown, choose };
}

test('the tile menu has settings, size, forward, back, move to and remove', async () => {
  const e = await editing();
  expect(e.menu().open).toBe(false);
  await e.openMenu('t-l');
  expect(e.menu().open).toBe(true);
  expect(e.menu().label).toBe('Menu van Badkamer'.replace('Badkamer', e.snapshot.devices['device-1']!.name));
  expect(e.shown()).toEqual([
    [e.snapshot.devices['device-1']!.name, 'Tegel instellen…'], ['Formaat', 'Enkel, zonder schuif', 'Breed, met schuif ✓'],
    ['', 'Naar voren', 'Naar achteren', 'Verplaatsen naar…'], ['', 'Weghalen'],
  ]);
  // a second tap on the tile closes it again
  await e.openMenu('t-l');
  expect(e.menu().open).toBe(false);
});

test('the menu carries the own name of the tile, and its settings can be opened', async () => {
  const e = await editing();
  const opens = record(e.element, 'open-tile');
  await e.openMenu('t-1');
  expect(e.shown()[0]).toEqual(['Binnen', 'Tegel instellen…']);
  expect(e.shown()[1]).toEqual(['Formaat', 'Enkel ✓', 'Breed']);
  await e.choose('tile', 'settings');
  expect(opens).toEqual([{ tileId: 't-1' }]);
  expect(e.menu().open).toBe(false);
});

test('a flow has no settings and no size; a multi-value tile cannot be single', async () => {
  const e = await editing();
  await e.openMenu('t-2');
  expect(e.shown()).toEqual([['Flow 1', 'Naar voren (uit)', 'Naar achteren (uit)', 'Verplaatsen naar…'], ['', 'Weghalen']]);
  await e.openMenu('t-m');
  expect(e.shown()[1]).toEqual(['Formaat', 'Enkel (uit)', 'Breed ✓']);
});

test('choosing a size sets it', async () => {
  const e = await editing();
  await e.openMenu('t-l');
  await e.choose('size', 'single');
  expect(e.edits).toEqual([{ edit: { type: 'set-tile', dashboardId: 'd-1', tileId: 't-l', patch: { size: 'single' } } }]);
});

test('forward is disabled for the first tile and back for the last', async () => {
  const e = await editing();
  await e.openMenu('t-1');
  expect(e.shown()[2]).toEqual(['', 'Naar voren (uit)', 'Naar achteren', 'Verplaatsen naar…']);
  await e.choose('move', 'back');
  await e.openMenu('t-m');
  expect(e.shown()[2]).toEqual(['', 'Naar voren', 'Naar achteren (uit)', 'Verplaatsen naar…']);
  await e.choose('move', 'forward');
  expect(e.edits).toEqual([
    { edit: { type: 'move-tile', dashboardId: 'd-1', tileId: 't-1', toSectionId: 'own:a', index: 1 } },
    { edit: { type: 'move-tile', dashboardId: 'd-1', tileId: 't-m', toSectionId: 'own:a', index: 1 } },
  ]);
});

test('move to lists the sections and moves the tile to the end of the chosen one', async () => {
  const e = await editing();
  await e.openMenu('t-1');
  await e.choose('move', 'to');
  expect(e.menu().open).toBe(true);
  expect(e.shown()).toEqual([['', 'Terug'], ['Binnen verplaatsen naar', 'Kamer ✓', 'Buiten', 'Leeg']]);
  expect(e.menu().groups[1]).toMatchObject({ items: [{ icon: 'weekend' }, { icon: 'view_agenda' }, { icon: 'view_agenda' }] });
  await e.choose('back', 'back');
  expect(e.shown()[0]).toEqual(['Binnen', 'Tegel instellen…']);
  await e.choose('move', 'to');
  await e.choose('section', 'own:b');
  expect(e.edits).toEqual([{ edit: { type: 'move-tile', dashboardId: 'd-1', tileId: 't-1', toSectionId: 'own:b', index: 1 } }]);
  expect(e.menu().open).toBe(false);
});

test('a keyboard move is announced and keeps the focus on the tile', async () => {
  const e = await editing();
  await e.openMenu('t-1');
  await e.choose('move', 'to');
  await e.choose('section', 'own:b');
  const [a, hero, b, c] = menuBoard().sections!;
  e.element.board = view(board('d-1', [{ ...a!, tiles: a!.tiles.slice(1) }, hero!, { ...b!, tiles: [...b!.tiles, a!.tiles[0]!] }, c!]));
  await settle(e.element);
  for (const section of all(e.element, 'mh-section')) await settle(section as unknown as { updateComplete: Promise<unknown> });
  await settle(e.element);
  expect(inside(e.element, '[aria-live="polite"]').textContent).toBe('Binnen staat nu op plek 2 van 2 in Buiten.');
  const focused = (): Element | null => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active; };
  expect(focused()?.getRootNode()).toBe(e.tile('t-1').shadowRoot);
});

test('removing a tile from its menu', async () => {
  const e = await editing();
  await e.openMenu('t-2');
  await e.choose('remove', 'remove');
  expect(e.edits).toEqual([{ edit: { type: 'remove-tile', dashboardId: 'd-1', tileId: 't-2' } }]);
});

test('Escape closes the menu and puts the focus back on the tile', async () => {
  const e = await editing();
  await e.openMenu('t-1');
  e.menu().dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  await settle(e.element);
  await settle(e.element);
  expect(e.menu().open).toBe(false);
  expect(e.tile('t-1').shadowRoot!.activeElement).not.toBeNull();
});

test('the menu closes when its tile disappears or the edit mode ends', async () => {
  const e = await editing();
  await e.openMenu('t-1');
  const [a, ...rest] = menuBoard().sections!;
  e.element.board = view(board('d-1', [{ ...a!, tiles: a!.tiles.slice(1) }, ...rest]));
  await settle(e.element);
  await settle(e.element);
  expect(e.menu().open).toBe(false);
  await e.openMenu('t-l');
  e.element.editing = false;
  await settle(e.element);
  await settle(e.element);
  expect(e.element.shadowRoot!.querySelector<MhMenu>('mh-menu.tile-menu')?.open ?? false).toBe(false);
});

const sectionGroups = (element: HTMLElement) => (element.shadowRoot!.querySelector('mh-section-menu') as HTMLElement & { groups: MhMenu['groups'] }).groups;
const labels = (group: MhMenu['groups'][number]) => (group.kind === 'items' ? group.items.map((i) => `${i.label}${i.disabled ? ' (uit)' : ''}`) : []);
const chooseIn = async (element: Element, e: { element: MhDashboard }, group: string, id: string) => {
  element.shadowRoot!.querySelector('mh-section-menu')!.dispatchEvent(new CustomEvent('select', { detail: { group, id }, bubbles: true, composed: true }));
  await settle(e.element);
};

test('the section menu has the layout group only while editing', async () => {
  const e = await editing();
  const [a, b] = all(e.element, 'mh-section') as HTMLElement[];
  expect(sectionGroups(a!)[0]).toMatchObject({ id: 'layout', title: 'Indeling' });
  expect(labels(sectionGroups(a!)[0]!)).toEqual(['Naam en icoon…', 'Omhoog (uit)', 'Omlaag (uit)', 'Naar de andere kolom', 'Sectie weghalen']);
  expect(labels(sectionGroups(b!)[0]!)).toEqual(['Naam en icoon…', 'Omhoog', 'Omlaag', 'Naar de andere kolom', 'Sectie weghalen']);
  expect(sectionGroups(a!).map((g) => g.id)).toEqual(['layout', 'colour', 'seed']);
  e.element.editing = false;
  await settle(e.element);
  await settle(a as unknown as { updateComplete: Promise<unknown> });
  expect(sectionGroups(a!).map((g) => g.id)).toEqual(['colour', 'seed']);
});

test('up and down move a section within its column; other column moves it across', async () => {
  const e = await editing();
  const [a, b] = all(e.element, 'mh-section') as HTMLElement[];
  await chooseIn(b!, e, 'layout', 'up');
  await chooseIn(b!, e, 'layout', 'down');
  await chooseIn(a!, e, 'layout', 'other');
  expect(e.edits.map((x) => x.edit)).toEqual([
    { type: 'move-section', dashboardId: 'd-1', sectionId: 'own:b', column: 'right', index: 0 },
    { type: 'move-section', dashboardId: 'd-1', sectionId: 'own:b', column: 'right', index: 2 },
    { type: 'move-section', dashboardId: 'd-1', sectionId: 'own:a', column: 'right', index: 0 },
  ]);
});

test('a section can be renamed and removed from its menu', async () => {
  const e = await editing();
  const dialogs = record(e.element, 'open-section-dialog');
  const removals = record(e.element, 'remove-section');
  const [, b] = all(e.element, 'mh-section') as HTMLElement[];
  await chooseIn(b!, e, 'layout', 'rename');
  await chooseIn(b!, e, 'layout', 'remove');
  expect(dialogs).toEqual([{ sectionId: 'own:b', column: 'right' }]);
  expect(removals).toEqual([{ sectionId: 'own:b' }]);
});

test('the hero menu opens the hero settings, moves and removes the hero', async () => {
  const e = await editing();
  const opens = record(e.element, 'open-hero');
  const removals = record(e.element, 'remove-section');
  const hero = inside(e.element, 'mh-hero');
  expect(labels(sectionGroups(hero)[0]!)).toEqual(['Blikvanger instellen…', 'Omhoog (uit)', 'Omlaag', 'Naar de andere kolom', 'Blikvanger weghalen']);
  await chooseIn(hero, e, 'layout', 'settings');
  await chooseIn(hero, e, 'layout', 'down');
  await chooseIn(hero, e, 'layout', 'remove');
  expect(opens).toEqual([{ sectionId: 'hero:d-1' }]);
  expect(e.edits).toEqual([{ edit: { type: 'move-section', dashboardId: 'd-1', sectionId: 'hero:d-1', column: 'right', index: 1 } }]);
  expect(removals).toEqual([{ sectionId: 'hero:d-1' }]);
});

test('moving a section is announced', async () => {
  const e = await editing();
  const [a] = all(e.element, 'mh-section') as HTMLElement[];
  await chooseIn(a!, e, 'layout', 'other');
  const [first, ...rest] = menuBoard().sections!;
  e.element.board = view(board('d-1', [{ ...first!, column: 'right' }, ...rest]));
  await settle(e.element);
  await settle(e.element);
  expect(inside(e.element, '[aria-live="polite"]').textContent).toBe('Kamer staat nu op plek 1 van 4 in de rechterkolom.');
});

// ----- dragging -----

/** Gives everything on the page a place: two columns of 400, sections of 200 high, tiles of 100 by 80 in a row. */
function layOut(element: MhDashboard) {
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
  all(element, '.col').forEach((col, c) => {
    col.getBoundingClientRect = () => rect(c * 420, 0, 400, 1000);
    [...col.children].forEach((child, i) => {
      child.getBoundingClientRect = () => rect(c * 420, i * 210, 400, 200);
      [...(child.shadowRoot?.querySelectorAll<HTMLElement & { spec?: unknown }>('.tiles > *') ?? [])].filter((tile) => tile.spec).forEach((tile, t) => {
        tile.getBoundingClientRect = () => rect(c * 420 + t * 110, i * 210 + 50, 100, 80);
      });
    });
  });
}
function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(new PointerEvent(type, { pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX: x, clientY: y, bubbles: true, composed: true, cancelable: true }));
}
async function dragging() {
  const e = await editing();
  layOut(e.element);
  const sectionOf = (id: string) => (all(e.element, 'mh-section') as (SectionEl & { dropAt: unknown; dragged: unknown; updateComplete: Promise<unknown> })[]).find((el) => el.section.id === id)!;
  return { ...e, sectionOf };
}

test('dragging a tile shows a copy and an empty place, and reports the edit at release', async () => {
  const e = await dragging();
  pointer(e.tile('t-1').shadowRoot!.querySelector('.face')!, 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 60, 80);
  await settle(e.element);
  const copy = inside(e.element, '.lifted');
  expect(copy.querySelector('mh-sensor-tile')).not.toBeNull();
  expect(e.element.hasAttribute('dragging')).toBe(true);
  pointer(window, 'pointermove', 430, 300);
  await settle(e.element);
  expect(e.sectionOf('own:b').dropAt).toMatchObject({ index: 0, wide: false, height: 80 });
  expect(e.sectionOf('own:a').dragged).toBe('t-1');
  expect(e.sectionOf('own:a').dropAt).toBeNull();
  pointer(window, 'pointerup', 800, 300);
  await settle(e.element);
  expect(e.edits).toEqual([{ edit: { type: 'move-tile', dashboardId: 'd-1', tileId: 't-1', toSectionId: 'own:b', index: 1 } }]);
  expect(e.element.shadowRoot!.querySelector('.lifted')).toBeNull();
  expect(e.element.hasAttribute('dragging')).toBe(false);
  expect(e.sectionOf('own:b').dropAt).toBeNull();
});

test('a tile cannot be dropped on the hero', async () => {
  const e = await dragging();
  pointer(e.tile('t-1'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 500, 100);
  pointer(window, 'pointerup', 500, 100);
  expect(e.edits).toEqual([]);
});

test('dragging a section by its grip to the other column', async () => {
  const e = await dragging();
  pointer(e.sectionOf('own:a').shadowRoot!.querySelector('.head .grip')!, 'pointerdown', 20, 20);
  pointer(window, 'pointermove', 500, 250);
  await settle(e.element);
  expect(inside(e.element, '.lifted').textContent).toContain('Kamer');
  expect(all(e.element, '.col > .placeholder')).toHaveLength(1);
  expect(e.sectionOf('own:a').hasAttribute('data-dragged')).toBe(true);
  pointer(window, 'pointerup', 500, 250);
  await settle(e.element);
  expect(e.edits).toEqual([{ edit: { type: 'move-section', dashboardId: 'd-1', sectionId: 'own:a', column: 'right', index: 1 } }]);
  expect(all(e.element, '.placeholder')).toHaveLength(0);
});

test('outside the edit mode nothing can be dragged', async () => {
  const e = await dragging();
  e.element.editing = false;
  await settle(e.element);
  pointer(e.tile('t-1'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 300);
  await settle(e.element);
  expect(e.element.shadowRoot!.querySelector('.lifted')).toBeNull();
  pointer(window, 'pointerup', 430, 300);
  expect(e.edits).toEqual([]);
});

test('a dragged tile whose device disappears ends the drag without an error', async () => {
  const e = await dragging();
  pointer(e.tile('t-1'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 300);
  await settle(e.element);
  const [a, ...rest] = menuBoard().sections!;
  e.element.board = view(board('d-1', [{ ...a!, tiles: a!.tiles.slice(1) }, ...rest]));
  await settle(e.element);
  expect(() => pointer(window, 'pointermove', 440, 300)).not.toThrow();
  await settle(e.element);
  expect(e.element.shadowRoot!.querySelector('.lifted')).toBeNull();
  pointer(window, 'pointerup', 440, 300);
  expect(e.edits).toEqual([]);
});

test('ending the edit mode while dragging ends the drag', async () => {
  const e = await dragging();
  pointer(e.tile('t-1'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 430, 300);
  e.element.editing = false;
  await settle(e.element);
  await settle(e.element);
  expect(e.element.shadowRoot!.querySelector('.lifted')).toBeNull();
  pointer(window, 'pointerup', 430, 300);
  expect(e.edits).toEqual([]);
});

test('a drop is announced, without moving the focus', async () => {
  const e = await dragging();
  pointer(e.tile('t-1'), 'pointerdown', 50, 80);
  pointer(window, 'pointermove', 800, 300);
  pointer(window, 'pointerup', 800, 300);
  const [a, hero, b, c] = menuBoard().sections!;
  e.element.board = view(board('d-1', [{ ...a!, tiles: a!.tiles.slice(1) }, hero!, { ...b!, tiles: [...b!.tiles, a!.tiles[0]!] }, c!]));
  const focus = vi.spyOn(e.tile('t-1'), 'focus');
  await settle(e.element);
  await settle(e.element);
  expect(inside(e.element, '[aria-live="polite"]').textContent).toBe('Binnen staat nu op plek 2 van 2 in Buiten.');
  expect(focus).not.toHaveBeenCalled();
});

test('a new tile lights up for a moment', async () => {
  const e = await editing();
  const [a, ...rest] = menuBoard().sections!;
  e.element.board = view(board('d-1', [{ ...a!, tiles: [...a!.tiles, sensorTile('t-9', 'device-13')] }, ...rest]));
  e.element.freshTiles = ['t-9'];
  await settle(e.element);
  const sectionA = all(e.element, 'mh-section')[0] as HTMLElement & { updateComplete: Promise<unknown> };
  await settle(sectionA);
  expect(e.tile('t-9').hasAttribute('data-fresh')).toBe(true);
  expect(e.tile('t-1').hasAttribute('data-fresh')).toBe(false);
});

// ----- an empty dashboard -----

/** A drag swallows the click that follows it; the next test waits until that is over. */
const afterDrags = () => new Promise((done) => { setTimeout(done, 0); });

const emptyState = (element: Element) => element.shadowRoot!.querySelector('mh-empty-state') as HTMLElement & { heading: string; icon: string } | null;

test('the empty dashboard offers a section and the hero while editing', async () => {
  await afterDrags();
  const { element } = await setup({ board: view(board('d-1', [])), editing: true, boardName: 'Buiten', boardIcon: 'deck' });
  expect(emptyState(element)).toMatchObject({ heading: 'Buiten is nog leeg', icon: 'deck' });
  expect(emptyState(element)!.textContent).toContain('Begin met een sectie, en zet er tegels in. Je kiest uit al je apparaten en flows.');
  const sections = record(element, 'open-section-dialog');
  const heroes = record(element, 'add-hero');
  const buttons = [...emptyState(element)!.querySelectorAll('mh-button')];
  expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Sectie toevoegen', 'Blikvanger toevoegen']);
  buttons[0]!.click();
  buttons[1]!.click();
  expect([sections, heroes]).toEqual([[{ sectionId: null, column: 'left' }], [null]]);
  expect(all(element, '.add-slot')).toHaveLength(0);
});

test('outside the edit mode an empty dashboard offers Bewerken', async () => {
  await afterDrags();
  const { element } = await setup({ board: view(board('d-1', [])), boardName: 'Buiten', boardIcon: 'deck' });
  const toggles = record(element, 'toggle-edit');
  const buttons = [...emptyState(element)!.querySelectorAll('mh-button')];
  expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Bewerken']);
  buttons[0]!.click();
  expect(toggles).toHaveLength(1);
});

test('a dashboard with only a hero that has nothing to show is empty outside the edit mode', async () => {
  const empty = { id: 'd-1', left: [{ type: 'hero', id: 'hero:d-1', hero: null as HeroSpec | null }], right: [] } as BoardView;
  const { element } = await setup({ board: empty, boardName: 'Buiten' });
  expect(emptyState(element)!.heading).toBe('Buiten is nog leeg');
  element.editing = true;
  await settle(element);
  expect(emptyState(element)).toBeNull();
  expect(all(element, 'mh-hero')).toHaveLength(1);
});

test('while editing no text is selected by a drag that starts beside a tile', () => {
  const css = MhDashboard.styles.map((part) => ('cssText' in part ? part.cssText : '')).join('\n');
  expect(css).toMatch(/:host\(\[editing\]\) \.cols\s*\{[^}]*user-select:\s*none/);
});

test('in one column an empty second column has no "Sectie toevoegen" of its own, except while dragging', async () => {
  const { element } = await setup({ board: view(board('d-1', [ownSection('own:a', [], { column: 'left' })])), editing: true });
  expect(all(element, '.col').map((col) => [(col as HTMLElement).dataset['column'], col.classList.contains('empty')])).toEqual([['left', false], ['right', true]]);
  const css = MhDashboard.styles.map((part) => ('cssText' in part ? part.cssText : '')).join('\n');
  expect(css).toMatch(/@media \(width < \d+px\)[^@]*:host\(:not\(\[dragging\]\)\) \.col\.empty\s*\{\s*display:\s*none/);
});

const deepFocus = (): Element | null => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return active; };

test('after Klaar the focus goes to Bewerken, not to nowhere', async () => {
  const { element } = await setup({ board: view(board('d-1', [ownSection('own:a', [sensorTile('t-1', 'a')])])), editing: true });
  const bar = inside(element, 'mh-edit-bar');
  ([...bar.shadowRoot!.querySelectorAll('mh-button')].at(-1) as HTMLElement).focus();
  element.editing = false;
  await settle(element);
  await settle(inside(element, 'mh-rail') as never);
  expect(deepFocus()?.textContent).toContain('Bewerken');
  expect(deepFocus()?.getRootNode()).toBe(inside(element, 'mh-rail').shadowRoot);
});

test('the app can say something for screen readers, also twice the same', async () => {
  const { element } = await setup({});
  const live = () => inside(element, '[aria-live]').textContent!;
  element.announce('Ongedaan gemaakt.');
  await settle(element);
  const first = live();
  expect(first).toBe('Ongedaan gemaakt.');
  element.announce('Ongedaan gemaakt.');
  await settle(element);
  expect(live().trim()).toBe('Ongedaan gemaakt.');
  expect(live()).not.toBe(first);
});

const lastOf = (element: { board: BoardView | null }, id: string) => [...element.board!.left, ...element.board!.right].flatMap((b) => (b.type === 'section' && b.section.id === id ? [b.section.tiles.at(-1)!.id] : []))[0]!;

test('a move that changes nothing is no edit, and the focus goes back to the tile at once', async () => {
  await afterDrags();
  const e = await editing();
  const last = lastOf(e.element, 'own:a');
  await e.openMenu(last);
  await e.choose('move', 'to');
  await e.choose('section', 'own:a');
  expect(e.edits).toEqual([]);
  expect(deepFocus()?.getRootNode()).toBe(e.tile(last).shadowRoot);
  // something else changes: nothing is announced and the focus stays where it is
  e.element.board = { ...e.element.board! };
  await settle(e.element);
  expect(inside(e.element, '[aria-live]').textContent).toBe('');
});

test('dropping on the same place is no edit either', async () => {
  const e = await editing();
  const drop = (result: unknown) => (e.element as unknown as { onDrop(r: unknown): void }).onDrop(result);
  drop({ kind: 'tile', tileId: lastOf(e.element, 'own:a'), toSectionId: 'own:a', index: 2 });
  drop({ kind: 'section', sectionId: 'own:b', column: 'right', index: 1 });
  expect(e.edits).toEqual([]);
  e.element.board = { ...e.element.board! };
  await settle(e.element);
  expect(inside(e.element, '[aria-live]').textContent).toBe('');
  // one place further is
  drop({ kind: 'section', sectionId: 'own:b', column: 'right', index: 0 });
  expect(e.edits).toHaveLength(1);
});

test('while loading or unreachable the rail does not offer the edit mode', async () => {
  const blocked = (element: Element) => (inside(element, 'mh-rail') as HTMLElement & { editBlocked: boolean }).editBlocked;
  expect(blocked((await setup({ phase: 'loading', board: null })).element)).toBe(true);
  expect(blocked((await setup({ phase: 'unreachable', board: null })).element)).toBe(true);
  expect(blocked((await setup({})).element)).toBe(false);
});

// ----- a phone -----

const NEWS = [{ ref: 'new-1', kind: 'device', name: 'Nieuwe lamp', zoneName: null, suggest: 'lights' }];
const BOARDS = [{ id: 'overview', name: 'Overzicht', icon: 'dashboard', badge: true }];

test('on a phone the bar is at the bottom and there is nothing to arrange with', async () => {
  const { element } = await setup({ density: 'phone', boards: BOARDS, news: NEWS });
  expect([all(element, 'mh-rail').length, all(element, 'mh-nav-bar').length, all(element, 'mh-news-card').length]).toEqual([0, 1, 0]);
  expect(all(element, 'mh-section')).toHaveLength(7);
  const wide = await setup({ density: 'comfortable', boards: BOARDS, news: NEWS });
  expect([all(wide.element, 'mh-rail').length, all(wide.element, 'mh-nav-bar').length, all(wide.element, 'mh-news-card').length]).toEqual([1, 0, 1]);
});

test('an own dashboard without anything does not ask a phone to arrange it', async () => {
  const empty = boardFromLayout(board('d-1', []), camper().ctx.store.getSnapshot()!, 'nl');
  const { element } = await setup({ density: 'phone', board: empty, boards: BOARDS, boardName: 'Buiten' });
  expect(inside(element, 'mh-empty-state').querySelector('mh-button')).toBeNull();
});

test('on a phone the connection is an icon, until there is something to say', async () => {
  const chips = (element: Element) => [...inside(element, 'mh-header').shadowRoot!.querySelectorAll('mh-chip')] as (HTMLElement & { iconOnly: boolean; label: string })[];
  const { element } = await setup({ density: 'phone', boards: BOARDS });
  expect(chips(element).map((c) => [c.iconOnly, c.label, c.textContent!.trim()])).toEqual([[true, 'Lokaal verbonden', '']]);
  const cloud = await setup({ density: 'phone', boards: BOARDS }, { route: 'cloud' });
  expect(chips(cloud.element).map((c) => [c.iconOnly, c.label])).toEqual([[true, 'Via de cloud verbonden']]);
  const gone = await setup({ density: 'phone', boards: BOARDS }, { route: null });
  expect(chips(gone.element).map((c) => [c.iconOnly, c.textContent!.trim()])).toEqual([[false, 'Geen verbinding']]);
  const demo = await setup({ density: 'phone', boards: BOARDS }, { demo: true });
  expect(chips(demo.element).map((c) => [c.iconOnly, c.textContent!.trim()])).toEqual([[true, ''], [false, 'Voorbeeld']]);
  // the icon stands beside the title, what there is to say under it
  expect(chips(demo.element).map((c) => c.closest('.chips') !== null)).toEqual([false, true]);
  const wide = await setup({ density: 'comfortable', boards: BOARDS });
  expect(chips(wide.element).map((c) => [c.iconOnly, c.textContent!.trim()])).toEqual([[false, 'Lokaal verbonden']]);
});

test('a bar that becomes a rail again takes the open menu with it', async () => {
  const { element } = await setup({ density: 'phone', boards: BOARDS });
  (inside(element, 'mh-nav-bar').shadowRoot!.querySelector('[aria-haspopup]') as HTMLElement).click();
  await settle(element);
  element.density = 'comfortable';
  await settle(element);
  expect([all(element, 'mh-nav-bar').length, all(element, 'mh-rail').length]).toEqual([0, 1]);
});

const DIM = { box: { left: 16, top: 300, width: 168, height: 236, startLevel: 0.5, startY: 418 }, from: { left: 20, top: 400, width: 160, height: 60 }, name: 'Keuken', icon: 'lightbulb', percent: 50 };
const lampTile = (element: MhDashboard) => all(element, 'mh-section').flatMap((s) => [...(s as Element).shadowRoot!.querySelectorAll('mh-light-tile')])[0] as HTMLElement & { spec: { id: string } };
const dim = (element: MhDashboard, phase: string, level: number) => {
  const tile = lampTile(element);
  tile.dispatchEvent(new CustomEvent('dim', { detail: { ...DIM, phase, level, tileId: tile.spec.id }, bubbles: true, composed: true }));
};
const dimmers = (element: MhDashboard) => all(element, 'mh-dimmer') as (HTMLElement & { level: number; seed: string | null; closing: boolean })[];

test('a lamp that is dimmed grows over the rest, outside the sections, in the colour of its section', async () => {
  const { element } = await setup({ density: 'phone', sectionSeeds: { 'type:lights': '#3a5ba9' } });
  dim(element, 'start', 0.5);
  await settle(element);
  expect(dimmers(element).map((d) => [d.level, d.seed, d.closing, d.closest('mh-section')])).toEqual([[0.5, '#3a5ba9', false, null]]);
  dim(element, 'move', 0.7);
  await settle(element);
  expect(dimmers(element).map((d) => d.level)).toEqual([0.7]);
  vi.useFakeTimers();
  dim(element, 'end', 0.7);
  await settle(element);
  expect(dimmers(element).map((d) => d.closing)).toEqual([true]);
  vi.advanceTimersByTime(DIM_CLOSE_MS);
  await settle(element);
  expect(dimmers(element)).toEqual([]);
  vi.useRealTimers();
});

test('the dimmer goes with its tile: gone, another dashboard, another form of the window', async () => {
  const { element, ctx } = await setup({ density: 'phone' });
  dim(element, 'start', 0.5);
  await settle(element);
  element.density = 'comfortable';
  await settle(element);
  expect(dimmers(element)).toEqual([]);
  // what the finger still reports does not bring it back
  dim(element, 'move', 0.6);
  dim(element, 'end', 0.6);
  await settle(element);
  expect(dimmers(element)).toEqual([]);
  element.density = 'phone';
  await settle(element);
  dim(element, 'start', 0.5);
  await settle(element);
  element.board = boardFromLayout(board('d-1', []), ctx.store.getSnapshot()!, 'nl');
  await settle(element);
  expect(dimmers(element)).toEqual([]);
});
