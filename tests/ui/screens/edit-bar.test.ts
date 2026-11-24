// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/screens/edit-bar';
import { MhEditBar } from '../../../src/ui/screens/edit-bar';
import { boardMenuGroups } from '../../../src/ui/screens/edit-menus';
import type { MenuGroup } from '../../../src/ui/parts/menu';
import { deepText } from '../../helpers/deep';
import { key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const MENU: MenuGroup[] = [{ kind: 'items', id: 'board', title: '', items: [{ id: 'rename', label: 'Naam en icoon…', checked: null, icon: 'edit' }] }];
const bar = (props: Record<string, unknown> = {}) => mount<MhEditBar>('mh-edit-bar', { boardName: 'Overzicht', canUndo: false, firstTime: false, menu: MENU, ...props });
const button = (host: MhEditBar, text: string) => [...host.shadowRoot!.querySelectorAll('mh-button')].find((b) => b.textContent!.includes(text)) as HTMLElement & { disabled: boolean };

test('the edit bar names the dashboard, disables undo without steps and reports done', async () => {
  const host = await bar();
  expect(host.shadowRoot!.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Bewerken');
  expect(deepText(host)).toContain('Overzicht bewerken');
  expect(deepText(host)).toContain('Sleep tegels en secties, of tik erop voor meer.');
  expect(button(host, 'Ongedaan maken').disabled).toBe(true);
  const undos = record(host, 'undo');
  const dones = record(host, 'done');
  host.canUndo = true;
  await settle(host);
  expect(button(host, 'Ongedaan maken').disabled).toBe(false);
  button(host, 'Ongedaan maken').click();
  button(host, 'Klaar').click();
  expect([undos.length, dones.length]).toEqual([1, 1]);
});

test('the first-time note shows only while the overview is automatic', async () => {
  const host = await bar({ firstTime: true });
  const note = host.shadowRoot!.querySelector('mh-note')!;
  expect(note.textContent).toContain('Je eerste aanpassing maakt van dit Overzicht jouw indeling.');
  expect(note.querySelector('b')!.textContent).toBe('jouw indeling');
  host.firstTime = false;
  await settle(host);
  expect(host.shadowRoot!.querySelector('mh-note')).toBeNull();
});

test('the menu of the dashboard reports what was chosen and closes', async () => {
  const host = await bar();
  const menu = host.shadowRoot!.querySelector('mh-section-menu') as HTMLElement & { open: boolean; updateComplete: Promise<unknown> };
  const trigger = menu.shadowRoot!.querySelector<HTMLElement>('.trigger')!;
  expect(trigger.getAttribute('aria-label')).toBe('Menu van Overzicht');
  const actions = record<{ id: string }>(host, 'board-action');
  trigger.click();
  await menu.updateComplete;
  menu.shadowRoot!.querySelector('mh-menu')!.dispatchEvent(new CustomEvent('select', { detail: { group: 'board', id: 'rename' }, bubbles: true, composed: true }));
  await settle(host);
  expect(actions).toEqual([{ id: 'rename' }]);
  expect(menu.open).toBe(false);
});

test('without a menu there is no menu button', async () => {
  expect((await bar({ menu: [] })).shadowRoot!.querySelector('mh-section-menu')).toBeNull();
});

test('the edit bar stays at the top and follows the language', async () => {
  const host = await bar({ t: createTranslate('en'), boardName: 'Overview' });
  expect(deepText(host)).toContain('Editing Overview');
  const css = MhEditBar.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/:host\s*\{[^}]*display:\s*contents/);
  expect(css).toMatch(/\.bar\s*\{[^}]*position:\s*sticky/);
});

test('the menu of a dashboard names it and follows the language', () => {
  const groups = boardMenuGroups('Outside', { index: 1, count: 3 }, null, createTranslate('en'));
  expect(groups.map((g) => [g.title, ...('items' in g ? g.items.map((i) => i.label) : [])])).toEqual([['Outside', 'Name and icon…', 'Move up', 'Move down'], ['', 'Remove dashboard…']]);
});

test('in the toolbar the arrows go from button to button, past a disabled one', async () => {
  const host = await bar({ canUndo: true });
  const focused = (): string => { let active = document.activeElement; while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement; return (active?.getRootNode() as ShadowRoot).host.textContent!.trim() || active!.getAttribute('aria-label')!; };
  button(host, 'Ongedaan maken').focus();
  expect(focused()).toBe('Ongedaan maken');
  key(button(host, 'Ongedaan maken'), 'ArrowRight');
  expect(focused()).toBe('Menu van Overzicht');
  key(host.shadowRoot!.querySelector('mh-section-menu')!, 'ArrowRight');
  expect(focused()).toBe('Klaar');
  key(button(host, 'Klaar'), 'ArrowRight');
  expect(focused()).toBe('Ongedaan maken');
  host.canUndo = false;
  await settle(host);
  button(host, 'Klaar').focus();
  key(button(host, 'Klaar'), 'ArrowRight');
  expect(focused()).toBe('Menu van Overzicht');
  key(host.shadowRoot!.querySelector('mh-section-menu')!, 'ArrowLeft');
  expect(focused()).toBe('Klaar');
});

test('the arrows in the open menu of the bar stay in the menu', async () => {
  const host = await bar();
  const menu = host.shadowRoot!.querySelector('mh-section-menu') as HTMLElement & { toggle(open: boolean): void; updateComplete: Promise<unknown> };
  menu.toggle(true);
  await settle(host);
  const spy = vi.spyOn(button(host, 'Klaar'), 'focus');
  key(menu.shadowRoot!.querySelector('mh-menu')!.shadowRoot!.querySelector('[role="menuitem"]')!, 'ArrowRight');
  expect(spy).not.toHaveBeenCalled();
});

test('undoing the last step leaves the focus in the bar', async () => {
  const host = await bar({ canUndo: true });
  button(host, 'Ongedaan maken').focus();
  host.canUndo = false;
  await settle(host);
  const active = (): Element | null => { let a = document.activeElement; while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement; return a; };
  expect((active()!.getRootNode() as ShadowRoot).host).toBe(button(host, 'Klaar'));
});
