// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/screens/nav-bar';
import type { MhNavBar } from '../../../src/ui/screens/nav-bar';
import type { RailBoard } from '../../../src/ui/screens/rail';
import type { MhMenu } from '../../../src/ui/parts/menu';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

const boards = (...names: string[]): RailBoard[] => names.map((name, i) => ({ id: `d-${i}`, name, icon: 'dashboard', badge: i === 0 }));
const bar = (props: Record<string, unknown> = {}) => mount<MhNavBar>('mh-nav-bar', { boards: boards('Overzicht', 'Buiten'), activeBoard: 'd-0', panel: 'none', ...props });
const buttons = (host: MhNavBar) => [...host.shadowRoot!.querySelectorAll<HTMLElement>('nav button')];
const named = (host: MhNavBar, name: string) => buttons(host).find((b) => b.textContent!.trim() === name)!;
const menu = (host: MhNavBar) => host.shadowRoot!.querySelector('mh-menu') as MhMenu;

test('the dashboards are in the bar, the open one marked, and "Meer" is last', async () => {
  const host = await bar({ activeBoard: 'd-1' });
  expect(buttons(host).map((b) => [b.textContent!.trim(), b.getAttribute('aria-current')])).toEqual([['Overzicht', 'false'], ['Buiten', 'page'], ['Meer', null]]);
  expect(named(host, 'Buiten').querySelector('mh-icon')!.hasAttribute('filled')).toBe(true);
  const moves = record<{ to: string }>(host, 'navigate');
  named(host, 'Overzicht').click();
  expect(moves).toEqual([{ to: 'board:d-0' }]);
  // nothing new on the hub is reported here: it asks for arranging
  expect(host.shadowRoot!.querySelector('.badge')).toBeNull();
});

test('"Meer" opens a menu with the theme and the settings', async () => {
  const host = await bar();
  const more = named(host, 'Meer');
  expect([more.getAttribute('aria-haspopup'), more.getAttribute('aria-expanded'), menu(host).open]).toEqual(['menu', 'false', false]);
  more.click();
  await settle(host);
  expect([more.getAttribute('aria-expanded'), menu(host).open]).toEqual(['true', true]);
  expect(menu(host).groups.flatMap((g) => (g.kind === 'items' ? g.items.map((i) => i.label) : []))).toEqual(['Thema', 'Instellingen']);
  const moves = record<{ to: string }>(host, 'navigate');
  menu(host).dispatchEvent(new CustomEvent('select', { detail: { group: 'more', id: 'settings' }, bubbles: true, composed: true }));
  await settle(host);
  expect([moves, menu(host).open]).toEqual([[{ to: 'settings' }], false]);
  more.click();
  await settle(host);
  more.click();
  await settle(host);
  expect(menu(host).open).toBe(false);
});

test('closing the menu gives the focus back to "Meer"', async () => {
  const host = await bar();
  named(host, 'Meer').click();
  await settle(host);
  menu(host).dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  await settle(host);
  expect([menu(host).open, host.shadowRoot!.activeElement]).toEqual([false, named(host, 'Meer')]);
});

test('many dashboards scroll beside "Meer", and the open one is brought into view', async () => {
  const seen: string[] = [];
  const into = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) { seen.push(this.textContent!.trim()); });
  const host = await bar({ boards: boards('A', 'B', 'C', 'D', 'E', 'F', 'G'), activeBoard: 'd-6' });
  expect(host.shadowRoot!.querySelectorAll('.boards button')).toHaveLength(7);
  expect(named(host, 'Meer').closest('.boards')).toBeNull();
  expect(seen).toEqual(['G']);
  host.activeBoard = 'd-1';
  await settle(host);
  expect(seen).toEqual(['G', 'B']);
  host.panel = 'theme';
  await settle(host);
  expect(into).toHaveBeenCalledTimes(2);
});

test('one dashboard is a bar too, and while a panel is open "Meer" is marked', async () => {
  const host = await bar({ boards: boards('Overzicht'), panel: 'theme' });
  expect(buttons(host).map((b) => b.textContent!.trim())).toEqual(['Overzicht', 'Meer']);
  expect(named(host, 'Meer').classList.contains('active')).toBe(true);
});

test('a long name stays inside its button, with the whole name at hand', async () => {
  const name = 'x'.repeat(60);
  const host = await bar({ boards: boards(name) });
  const button = named(host, name);
  expect([button.getAttribute('title'), button.querySelector('.name')!.textContent]).toEqual([name, name]);
});
