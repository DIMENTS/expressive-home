// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/tiles/index';
import '../../../src/ui/screens/section';
import type { MhSection } from '../../../src/ui/screens/section';
import type { DeviceTileSpec } from '../../../src/dashboard/types';
import { inside, mount, record, settle } from '../../helpers/mount';
import { createTranslate } from '../../../src/i18n';
import type { Section, TileSpec } from '../../../src/dashboard/types';
import { camper } from '../../helpers/camper';

afterEach(() => { document.body.replaceChildren(); });

async function lightsSection() {
  const fake = camper();
  const section = fake.dashboard.sections.find((s) => s.kind === 'lights')!;
  const element = await mount<MhSection>('mh-section', { section, ctx: fake.ctx, density: 'comfortable', note: '' });
  return { ...fake, section, element };
}

test('a section shows its title, its count and its tiles in the order of the dashboard', async () => {
  const { section, element } = await lightsSection();
  const heading = inside(element, 'h2');
  expect(heading.textContent).toContain('Verlichting');
  expect(inside(element, 'section').getAttribute('aria-labelledby')).toBe(heading.id);
  expect(inside(element, '.count').textContent).toBe('7 aan');
  const tiles = [...element.shadowRoot!.querySelectorAll('.tiles > *')] as (HTMLElement & { spec: { id: string } })[];
  expect(tiles.map((t) => t.spec.id)).toEqual(section.tiles.map((t) => t.id));
});

test('the count follows live changes', async () => {
  const { section, element, store, flush } = await lightsSection();
  const first = section.tiles[0] as DeviceTileSpec;
  store.apply({ type: 'capability', deviceId: first.deviceId, capabilityId: 'onoff', value: false, at: null });
  flush();
  await settle(element);
  expect(inside(element, '.count').textContent).toBe('6 aan');
});

test('tiles keep their element when the section draws again', async () => {
  const { element } = await lightsSection();
  const before = element.shadowRoot!.querySelector('.tiles > *');
  element.density = 'compact';
  await settle(element);
  const after = element.shadowRoot!.querySelector('.tiles > *') as HTMLElement & { density: string };
  expect(after).toBe(before);
  expect(after.density).toBe('compact');
});

test('the flows section explains itself when flows cannot be started', async () => {
  const fake = camper({ canStartFlows: false });
  const section = fake.dashboard.sections.find((s) => s.kind === 'flows')!;
  const element = await mount<MhSection>('mh-section', { section, ctx: fake.ctx, density: 'comfortable', note: 'Deze sleutel mag geen flows starten.' });
  expect(inside(element, '.note').textContent).toContain('Deze sleutel mag geen flows starten.');
  expect(element.shadowRoot!.querySelectorAll('.tiles > mh-flow-tile')).toHaveLength(2);
  expect(element.shadowRoot!.querySelector('.count')).toBeNull();
});

const trigger = (host: HTMLElement) => host.shadowRoot!.querySelector('mh-section-menu')!.shadowRoot!.querySelector<HTMLButtonElement>('button.trigger')!;
const menuOf = (host: HTMLElement) => host.shadowRoot!.querySelector('mh-section-menu')!.shadowRoot!.querySelector('mh-menu') as HTMLElement & { open: boolean; groups: { kind: string; items?: { checked: boolean }[]; value?: string | null }[] };
/** The element that really has focus, through shadow roots. */
function focused(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

test('every section has a menu button named after it, after the count', async () => {
  const { element } = await lightsSection();
  const button = trigger(element);
  expect(button.getAttribute('aria-label')).toBe('Menu van Verlichting');
  expect(button.getAttribute('aria-haspopup')).toBe('menu');
  expect(button.getAttribute('aria-expanded')).toBe('false');
  const heading = inside(element, '.head');
  expect([...heading.children].map((c) => c.tagName.toLowerCase()).slice(-2)).toEqual(['span', 'mh-section-menu']);
});

test('the menu offers the dashboard colour and the own colours, and choosing reports the section', async () => {
  const { element, section } = await lightsSection();
  element.baseSeed = '#3b6939';
  trigger(element).click();
  await settle(element);
  const menu = menuOf(element);
  expect(menu.open).toBe(true);
  expect(trigger(element).getAttribute('aria-expanded')).toBe('true');
  expect(menu.groups[0]!.items![0]!.checked).toBe(true);
  const seeds: { sectionId: string; seed: string | null }[] = [];
  element.addEventListener('section-seed', (e) => seeds.push((e as CustomEvent).detail));
  menu.dispatchEvent(new CustomEvent('select', { detail: { group: 'seed', id: '#3a5ba9' }, bubbles: true, composed: true }));
  menu.dispatchEvent(new CustomEvent('select', { detail: { group: 'colour', id: 'follow' }, bubbles: true, composed: true }));
  expect(seeds).toEqual([{ sectionId: section.id, seed: '#3a5ba9' }, { sectionId: section.id, seed: null }]);
  // the menu stays open to compare
  expect(menuOf(element).open).toBe(true);
});

test('Escape closes the menu and puts the focus back on its button', async () => {
  const { element } = await lightsSection();
  trigger(element).click();
  await settle(element);
  menuOf(element).dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  await settle(element);
  expect(menuOf(element).open).toBe(false);
  expect(focused()).toBe(trigger(element));
});

test('a section with its own colour gets its palette and shows its title icon in its own primary colour', async () => {
  const { colorTokens } = await import('../../../src/theme/engine');
  const { element } = await lightsSection();
  element.seed = '#3a5ba9';
  element.mode = 'light';
  await settle(element);
  expect(element.hasAttribute('data-own-seed')).toBe(true);
  expect(element.style.getPropertyValue('--c-primary')).toBe(colorTokens('#3a5ba9', 'light', 0)['--c-primary']);
  const css = (element.constructor as unknown as { styles: { cssText?: string }[] }).styles.map((s) => s.cssText ?? '').join('\n');
  expect(css).toMatch(/:host\(\[data-own-seed\]\) \.head > mh-icon\s*\{\s*color:\s*var\(--section-own-title-icon-fg\)/);
  expect(menuOf(element).groups[1]!.value).toBe('#3a5ba9');
});

test('switching to dark keeps the own colour, in the dark palette', async () => {
  const { colorTokens } = await import('../../../src/theme/engine');
  const { element } = await lightsSection();
  element.seed = '#3a5ba9';
  element.mode = 'light';
  await settle(element);
  element.mode = 'dark';
  await settle(element);
  expect(element.style.getPropertyValue('--c-surface')).toBe(colorTokens('#3a5ba9', 'dark', 0)['--c-surface']);
});

test('a section without its own colour follows the dashboard', async () => {
  const { element } = await lightsSection();
  element.seed = '#3a5ba9';
  await settle(element);
  element.seed = null;
  await settle(element);
  expect(element.hasAttribute('data-own-seed')).toBe(false);
  expect(element.style.getPropertyValue('--c-primary')).toBe('');
});

test('the menu button shows it is open while its menu is', async () => {
  const { MhSectionMenu } = await import('../../../src/ui/screens/section-menu');
  const css = MhSectionMenu.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/\.trigger\[aria-expanded="true"\]\s*\{[^}]*background:\s*color-mix\(in srgb, currentColor var\(--state-pressed\), transparent\)/);
});

// ----- own sections and the edit mode -----

const own = (partial: Partial<Section> = {}): Section => ({ id: 'own:a', kind: 'own', titleKey: 'section.own', tiles: [], name: null, icon: null, ...partial });
async function ownSection(partial: Partial<Section> = {}, props: Record<string, unknown> = {}) {
  const fake = camper();
  const element = await mount<MhSection>('mh-section', { section: own(partial), ctx: fake.ctx, density: 'comfortable', note: '', ...props });
  return { ...fake, element };
}
const iconOf = (element: HTMLElement) => inside(element, '.head > mh-icon').getAttribute('name');
const titleOf = (element: HTMLElement) => inside(element, '.title').textContent;

test('an own name and icon show on a section; an unknown icon falls back', async () => {
  const { element } = await ownSection({ name: 'Buiten', icon: 'park' });
  expect([titleOf(element), iconOf(element)]).toEqual(['Buiten', 'park']);
  element.section = own({ name: '<b>x</b>', icon: 'icon_of_later' });
  await settle(element);
  expect([titleOf(element), iconOf(element)]).toEqual(['<b>x</b>', 'view_agenda']);
  element.section = own({ id: 'type:lights', kind: 'lights', titleKey: 'section.lights', icon: 'close' });
  await settle(element);
  expect([titleOf(element), iconOf(element)]).toEqual(['Verlichting', 'lightbulb']);
});

test('an own section without a name follows the language', async () => {
  const { element, ctx } = await ownSection();
  expect(titleOf(element)).toBe('Nieuwe sectie');
  element.ctx = { ...ctx, t: createTranslate('en') };
  await settle(element);
  expect(titleOf(element)).toBe('New section');
});

test('an own section with a light counts what is on, and follows it live', async () => {
  const { dashboard } = camper();
  const light = dashboard.sections[0]!.tiles[0] as DeviceTileSpec;
  const sensor: TileSpec = { kind: 'sensor', id: 't-2', deviceId: 'device-13', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: false };
  const { element, store, flush } = await ownSection({ tiles: [light, sensor] });
  expect(inside(element, '.count').textContent).toBe('1 aan');
  store.apply({ type: 'capability', deviceId: light.deviceId, capabilityId: 'onoff', value: false, at: null });
  flush();
  await settle(element);
  expect(inside(element, '.count').textContent).toBe('Alles uit');
  element.section = own({ tiles: [sensor] });
  await settle(element);
  expect(element.shadowRoot!.querySelector('.count')).toBeNull();
});

test('while editing a section has a grip before its title and ends with Tegel toevoegen', async () => {
  const { element } = await ownSection({ name: 'Buiten' }, { editing: true });
  const grip = inside(element, '.head .grip');
  expect(grip.getAttribute('aria-label')).toBe('Verplaats Buiten');
  expect(inside(element, '.head').firstElementChild).toBe(grip);
  const opens = record(element, 'open-add');
  const slot = inside(element, '.add-slot');
  expect(slot.textContent!.trim()).toBe('Tegel toevoegen');
  slot.click();
  expect(opens).toEqual([{ sectionId: 'own:a' }]);
  element.editing = false;
  await settle(element);
  expect(element.shadowRoot!.querySelector('.grip')).toBeNull();
  expect(element.shadowRoot!.querySelector('.add-slot')).toBeNull();
});

test('a tap on the grip opens the menu of the section', async () => {
  const { element } = await ownSection({}, { editing: true });
  inside(element, '.head .grip').click();
  await settle(element);
  expect((inside(element, 'mh-section-menu') as HTMLElement & { open: boolean }).open).toBe(true);
});

test('an empty section says so, differently while editing', async () => {
  const { element } = await ownSection();
  expect(inside(element, '.empty').textContent).toBe('Nog leeg.');
  element.editing = true;
  await settle(element);
  expect(inside(element, '.empty').textContent).toBe('Nog leeg. Voeg een tegel toe, of sleep er een heen.');
});

test('the edit mode reaches the tiles of a section', async () => {
  const { element } = await ownSection({ tiles: camper().dashboard.sections[0]!.tiles }, { editing: true });
  const tiles = [...element.shadowRoot!.querySelectorAll('mh-light-tile')] as (HTMLElement & { editing: boolean })[];
  expect(tiles.length).toBeGreaterThan(3);
  expect(tiles.every((tile) => tile.editing)).toBe(true);
});

test('a flow stands half as wide as the section, also next to other tiles', () => {
  const css = (customElements.get('mh-section') as unknown as { styles: { cssText?: string }[] }).styles.map((part) => part.cssText ?? '').join('\n');
  expect(css).toMatch(/\.tiles > mh-flow-tile\s*\{[^}]*grid-column:\s*span 2/);
});

test('a section measures its tiles and shows where a dragged one would land', async () => {
  const tiles = camper().dashboard.sections[0]!.tiles.slice(0, 3);
  const { element } = await ownSection({ tiles }, { editing: true });
  const shownTiles = [...element.shadowRoot!.querySelectorAll<HTMLElement & { spec: TileSpec }>('mh-light-tile')];
  shownTiles.forEach((tile, i) => { tile.getBoundingClientRect = () => ({ left: i * 10, top: 5, width: 8, height: 6, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }); });
  expect(element.tileSlots()).toEqual(tiles.map((spec, i) => ({ id: spec.id, left: i * 10, top: 5, width: 8, height: 6 })));
  element.dragged = tiles[0]!.id;
  element.dropAt = { index: 1, wide: true, height: 120 };
  await settle(element);
  const children = [...element.shadowRoot!.querySelectorAll('.tiles > *')];
  const place = inside(element, '.placeholder');
  // the dragged tile stays in the page (a finger keeps reporting to it) but is not shown
  expect(shownTiles[0]!.hasAttribute('data-dragged')).toBe(true);
  expect(children.indexOf(place)).toBe(children.indexOf(shownTiles[1]!) + 1);
  expect(place.classList.contains('wide')).toBe(true);
  expect(place.style.getPropertyValue('--_height')).toBe('120px');
  element.dropAt = { index: 2, wide: false, height: 80 };
  await settle(element);
  expect([...element.shadowRoot!.querySelectorAll('.tiles > *')].indexOf(inside(element, '.placeholder'))).toBe(children.length - 2);
  element.dragged = null;
  element.dropAt = null;
  await settle(element);
  expect(element.shadowRoot!.querySelector('.placeholder')).toBeNull();
  expect(shownTiles[0]!.hasAttribute('data-dragged')).toBe(false);
});

test('the empty place also shows in an empty section, instead of the text', async () => {
  const { element } = await ownSection({}, { editing: true, dropAt: { index: 0, wide: false, height: 80 } });
  expect(element.shadowRoot!.querySelector('.empty')).toBeNull();
  expect(element.shadowRoot!.querySelectorAll('.placeholder')).toHaveLength(1);
});
