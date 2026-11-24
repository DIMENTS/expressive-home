// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/menu';
import { MhMenu, type MenuGroup } from '../../../src/ui/parts/menu';
import { createTranslate } from '../../../src/i18n';
import { key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const PRESETS = [{ id: 'forest', seed: '#3b6939' }, { id: 'blue', seed: '#3a5ba9' }, { id: 'terracotta', seed: '#a6422a' }];
const groups = (value: string | null = null): MenuGroup[] => [
  { kind: 'items', id: 'colour', title: 'Kleur van Verlichting', items: [{ id: 'follow', label: 'Zoals het dashboard', checked: value === null, dot: '#3b6939' }] },
  { kind: 'swatches', id: 'seed', title: 'Eigen kleur', presets: PRESETS, value, customLabel: 'Eigen kleur kiezen' },
];
const open = (props: Record<string, unknown> = {}) => mount<MhMenu>('mh-menu', { open: true, label: 'Menu van Verlichting', groups: groups(), ...props });
const items = (menu: MhMenu) => [...menu.shadowRoot!.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')];
/** The element that really has focus, through shadow roots. */
function focused(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

test('the menu is a menu with checkable items', async () => {
  const menu = await open();
  const list = menu.shadowRoot!.querySelector('[role="menu"]')!;
  expect(list.getAttribute('aria-label')).toBe('Menu van Verlichting');
  const radios = [...menu.shadowRoot!.querySelectorAll('[role="menuitemradio"]')];
  expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
  expect(radios[0]!.textContent).toContain('Zoals het dashboard');
  expect(radios.slice(1).map((r) => r.getAttribute('aria-label'))).toEqual(['Bosgroen', 'Blauw', 'Terracotta']);
  expect(menu.shadowRoot!.querySelector('[role="menuitem"]')!.getAttribute('aria-label')).toBe('Eigen kleur kiezen');
  expect(menu.shadowRoot!.textContent).toContain('Kleur van Verlichting');
  expect(menu.shadowRoot!.textContent).toContain('Eigen kleur');
});

test('a closed menu shows nothing', async () => {
  const menu = await open({ open: false });
  expect(menu.shadowRoot!.querySelector('[role="menu"]')).toBeNull();
});

test('opening puts the focus on the chosen item', async () => {
  const menu = await open({ open: false, groups: groups('#3a5ba9') });
  menu.open = true;
  await settle(menu);
  expect(focused()).toBe(items(menu)[2]);
});

test('arrow keys move between items, Home and End jump', async () => {
  const menu = await open();
  const all = items(menu);
  all[0]!.focus();
  key(all[0]!, 'ArrowDown');
  expect(focused()).toBe(all[1]);
  key(all[1]!, 'ArrowUp');
  expect(focused()).toBe(all[0]);
  key(all[0]!, 'ArrowUp');
  expect(focused()).toBe(all.at(-1));
  key(all.at(-1)!, 'Home');
  expect(focused()).toBe(all[0]);
  key(all[0]!, 'End');
  expect(focused()).toBe(all.at(-1));
  // only the focused item is in the tab order
  expect(all.filter((item) => item.getAttribute('tabindex') === '0')).toHaveLength(1);
});

test('Escape and a tap outside close it', async () => {
  const menu = await open();
  const closes = record(menu, 'close');
  key(items(menu)[0]!, 'Escape');
  expect(closes).toHaveLength(1);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(2);
  // a tap inside does not close
  items(menu)[1]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(2);
  menu.open = false;
  await settle(menu);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(2);
});

test('choosing an item selects it and keeps the menu open', async () => {
  const menu = await open({ groups: groups('#3a5ba9') });
  const selected = record<{ group: string; id: string }>(menu, 'select');
  const closes = record(menu, 'close');
  items(menu)[0]!.click();
  expect(selected).toEqual([{ group: 'colour', id: 'follow' }]);
  expect(closes).toHaveLength(0);
  expect(menu.open).toBe(true);
});

test('a swatch selects its seed, and the free colour gives the picked seed', async () => {
  const menu = await open();
  const selected = record<{ group: string; id: string }>(menu, 'select');
  items(menu)[3]!.click();
  const input = menu.shadowRoot!.querySelector<HTMLInputElement>('input[type="color"]')!;
  input.value = '#123456';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(selected).toEqual([{ group: 'seed', id: '#a6422a' }, { group: 'seed', id: '#123456' }]);
});

test('the swatches are named in the language of the app', async () => {
  const menu = await open({ t: createTranslate('en') });
  expect(items(menu).slice(1, 4).map((r) => r.getAttribute('aria-label'))).toEqual(['Forest green', 'Blue', 'Terracotta']);
});

test('every item is at least 48 high', () => {
  const css = MhMenu.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/\.item\s*\{[^}]*min-height:\s*var\(--section-menu-item-height\)/);
  expect(css).toMatch(/\.swatch\s*\{[^}]*width:\s*var\(--target-min\)[^}]*height:\s*var\(--target-min\)/);
});

test('each group of choices is a group named after its title', async () => {
  const menu = await open();
  const groupsShown = [...menu.shadowRoot!.querySelectorAll('[role="menu"] > [role="group"]')];
  expect(groupsShown.map((g) => g.getAttribute('aria-label'))).toEqual(['Kleur van Verlichting', 'Eigen kleur']);
  expect(groupsShown[0]!.querySelectorAll('[role="menuitemradio"]')).toHaveLength(1);
  expect(groupsShown[1]!.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).toHaveLength(4);
  // the visible titles are not read twice
  for (const title of menu.shadowRoot!.querySelectorAll('.title')) expect(title.getAttribute('aria-hidden')).toBe('true');
});

// ----- plain choices, icons, disabled choices and a place inside the window -----

const actions = (disabled = false): MenuGroup[] => [
  { kind: 'items', id: 'tile', title: 'Plafond', items: [{ id: 'settings', label: 'Tegel instellen…', checked: null, icon: 'tune' }] },
  { kind: 'items', id: 'size', title: 'Formaat', items: [{ id: 'single', label: 'Enkel', checked: false, disabled: true }, { id: 'wide', label: 'Breed', checked: true }] },
  { kind: 'items', id: 'move', title: '', items: [{ id: 'forward', label: 'Naar voren', checked: null, disabled }, { id: 'back', label: 'Naar achteren', checked: null }] },
];

test('a plain item is a menuitem, a choice a menuitemradio', async () => {
  const menu = await open({ groups: actions() });
  expect(items(menu).map((i) => [i.getAttribute('role'), i.getAttribute('aria-checked')])).toEqual([
    ['menuitem', null], ['menuitemradio', 'false'], ['menuitemradio', 'true'], ['menuitem', null], ['menuitem', null],
  ]);
  expect(items(menu)[0]!.querySelector('mh-icon')!.getAttribute('name')).toBe('tune');
  const selected = record<{ group: string; id: string }>(menu, 'select');
  items(menu)[0]!.click();
  expect(selected).toEqual([{ group: 'tile', id: 'settings' }]);
});

test('a menu of plain items opens on the first one, not on a chosen size further down', async () => {
  const menu = await open({ groups: actions() });
  expect(focused()).toBe(items(menu)[0]);
});

test('a group without a title has no heading', async () => {
  const menu = await open({ groups: actions() });
  const groupsShown = [...menu.shadowRoot!.querySelectorAll('[role="group"]')];
  expect(groupsShown.map((g) => g.getAttribute('aria-label'))).toEqual(['Plafond', 'Formaat', null]);
  expect(groupsShown[2]!.querySelector('.title')).toBeNull();
});

test('a disabled item cannot be chosen and the arrows skip it', async () => {
  const menu = await open({ groups: actions(true) });
  const selected = record(menu, 'select');
  const all = items(menu);
  expect(all.map((i) => i.getAttribute('aria-disabled'))).toEqual([null, 'true', null, 'true', null]);
  all[1]!.click();
  all[3]!.click();
  expect(selected).toEqual([]);
  all[0]!.focus();
  key(all[0]!, 'ArrowDown');
  expect(focused()).toBe(all[2]);
  key(all[2]!, 'ArrowDown');
  expect(focused()).toBe(all[4]);
  key(all[4]!, 'ArrowUp');
  expect(focused()).toBe(all[2]);
  key(all[2]!, 'End');
  expect(focused()).toBe(all[4]);
  expect(all.filter((item) => item.getAttribute('tabindex') === '0')).toHaveLength(1);
  const css = MhMenu.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/\.item\[aria-disabled="true"\]\s*\{[^}]*opacity:\s*var\(--state-disabled-content\)/);
});

test('when the choices change while it is open, the focus goes to the first of the new ones', async () => {
  const menu = await open({ groups: actions() });
  items(menu)[4]!.focus();
  menu.groups = [{ kind: 'items', id: 'to', title: 'Plafond verplaatsen naar', items: [{ id: 'back', label: 'Terug', checked: null }, { id: 'a', label: 'Water', checked: false }] }];
  await settle(menu);
  expect(focused()).toBe(items(menu)[0]);
  // the same choices again (a live redraw) leave the focus where it is
  items(menu)[1]!.focus();
  menu.groups = [{ kind: 'items', id: 'to', title: 'Plafond verplaatsen naar', items: [{ id: 'back', label: 'Terug', checked: null }, { id: 'a', label: 'Water', checked: true }] }];
  await settle(menu);
  expect(focused()).toBe(items(menu)[1]);
});

/** Places the menu in a window of 1000 by 800: its own size, where it would open, and the button that opens it. */
async function placed(menuBox: { top: number; left: number; width: number; height: number }, anchorBox: { top: number; bottom: number }) {
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('innerWidth', 1000);
  const anchor = document.createElement('button');
  anchor.getBoundingClientRect = () => ({ ...anchorBox, left: 0, right: 0, width: 0, height: anchorBox.bottom - anchorBox.top, x: 0, y: anchorBox.top, toJSON: () => ({}) });
  const rect = { ...menuBox, right: menuBox.left + menuBox.width, bottom: menuBox.top + menuBox.height, x: menuBox.left, y: menuBox.top, toJSON: () => ({}) };
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  const menu = await open({ open: false, anchor });
  menu.open = true;
  await settle(menu);
  spy.mockRestore();
  vi.unstubAllGlobals();
  const box = menu.shadowRoot!.querySelector<HTMLElement>('.menu')!;
  const px = (name: string) => box.style.getPropertyValue(name);
  return { dx: px('--_dx'), dy: px('--_dy'), max: px('--_max') };
}

test('a menu that fits under its button stays there', async () => {
  expect(await placed({ top: 100, left: 300, width: 336, height: 400 }, { top: 50, bottom: 96 })).toEqual({ dx: '0px', dy: '0px', max: '' });
});

test('a menu that does not fit under its button opens above it', async () => {
  // 400 high, opens at 604: 8 px of room is kept at the bottom, so it goes above the button, with the same gap of 4
  expect(await placed({ top: 604, left: 300, width: 336, height: 400 }, { top: 560, bottom: 600 })).toEqual({ dx: '0px', dy: '-448px', max: '' });
});

test('a menu that fits nowhere is as tall as the window allows and scrolls', async () => {
  expect(await placed({ top: 404, left: 300, width: 336, height: 900 }, { top: 360, bottom: 400 })).toEqual({ dx: '0px', dy: '-396px', max: '784px' });
});

test('a menu stays inside the window sideways', async () => {
  expect((await placed({ top: 100, left: -60, width: 336, height: 100 }, { top: 50, bottom: 96 })).dx).toBe('68px');
  expect((await placed({ top: 100, left: 800, width: 336, height: 100 }, { top: 50, bottom: 96 })).dx).toBe('-144px');
});

test('Tab closes the menu, so the focus does not get lost behind it', async () => {
  const menu = await open();
  const closes = record(menu, 'close');
  const event = key(items(menu)[0]!, 'Tab');
  expect(closes).toHaveLength(1);
  expect(event.defaultPrevented).toBe(true);
});
