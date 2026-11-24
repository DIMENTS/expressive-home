// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/screens/rail';
import { MhRail, type RailBoard } from '../../../src/ui/screens/rail';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const BOARDS: RailBoard[] = [
  { id: 'overview', name: 'Overzicht', icon: 'dashboard', badge: false },
  { id: 'd-buiten', name: 'Buiten', icon: 'deck', badge: false },
];
const rail = (props: Record<string, unknown> = {}) => mount<MhRail>('mh-rail', { boards: BOARDS, activeBoard: 'overview', panel: 'none', editing: false, ...props });
const buttons = (host: MhRail) => [...host.shadowRoot!.querySelectorAll('button')];
const named = (host: MhRail, name: string) => buttons(host).find((b) => b.textContent!.trim() === name)!;
const current = (host: MhRail) => buttons(host).filter((b) => b.getAttribute('aria-current') === 'page').map((b) => b.textContent!.trim());

test('the rail lists the dashboards first and marks the open one', async () => {
  const host = await rail({ activeBoard: 'd-buiten' });
  expect(buttons(host).map((b) => b.textContent!.trim())).toEqual(['Overzicht', 'Buiten', 'Bewerken', 'Thema', 'Instellingen']);
  expect(current(host)).toEqual(['Buiten']);
  expect(named(host, 'Buiten').querySelector('mh-icon')!.getAttribute('name')).toBe('deck');
  expect(named(host, 'Buiten').querySelector('mh-icon')!.hasAttribute('filled')).toBe(true);
  const moves = record<{ to: string }>(host, 'navigate');
  named(host, 'Overzicht').click();
  named(host, 'Thema').click();
  named(host, 'Instellingen').click();
  expect(moves).toEqual([{ to: 'board:overview' }, { to: 'theme' }, { to: 'settings' }]);
});

test('an open panel is marked instead of the dashboard, except while editing', async () => {
  const host = await rail({ panel: 'theme' });
  expect(current(host)).toEqual(['Thema']);
  host.editing = true;
  await settle(host);
  expect(current(host)).toEqual(['Overzicht', 'Thema']);
});

test('Bewerken is a toggle button and reports toggle-edit', async () => {
  const host = await rail();
  const edit = named(host, 'Bewerken');
  expect(edit.getAttribute('aria-pressed')).toBe('false');
  expect(edit.hasAttribute('aria-current')).toBe(false);
  const toggles = record(host, 'toggle-edit');
  edit.click();
  expect(toggles).toHaveLength(1);
  host.editing = true;
  await settle(host);
  expect(named(host, 'Bewerken').getAttribute('aria-pressed')).toBe('true');
  expect(named(host, 'Bewerken').querySelector('mh-icon')!.hasAttribute('filled')).toBe(true);
});

test('Nieuw is only there while editing', async () => {
  const host = await rail();
  expect(named(host, 'Nieuw')).toBeUndefined();
  host.editing = true;
  await settle(host);
  expect(buttons(host).map((b) => b.textContent!.trim()).slice(0, 3)).toEqual(['Overzicht', 'Buiten', 'Nieuw']);
  const news = record(host, 'new-board');
  named(host, 'Nieuw').click();
  expect(news).toHaveLength(1);
});

test('a dashboard with news has a dot and says so to screen readers', async () => {
  const host = await rail({ boards: [{ ...BOARDS[0]!, badge: true }, BOARDS[1]] });
  expect(named(host, 'Overzicht').querySelector('.badge')).not.toBeNull();
  expect(named(host, 'Overzicht').getAttribute('aria-label')).toBe('Overzicht, nieuw op je Homey');
  expect(named(host, 'Buiten').querySelector('.badge')).toBeNull();
  expect(named(host, 'Buiten').hasAttribute('aria-label')).toBe(false);
});

test('the rail follows the language and shows a name as text', async () => {
  const host = await rail({ t: createTranslate('en'), boards: [{ id: 'd-1', name: '<b>x</b>', icon: 'home', badge: false }], editing: true });
  expect(buttons(host).map((b) => b.textContent!.trim())).toEqual(['<b>x</b>', 'New', 'Edit', 'Theme', 'Settings']);
});

test('a long name is cut off and more than six dashboards scroll', () => {
  const css = MhRail.styles.map((s) => ('cssText' in s ? s.cssText : '')).join('\n');
  expect(css).toMatch(/\.name\s*\{[^}]*text-overflow:\s*ellipsis/);
  expect(css).toMatch(/\.boards\s*\{[^}]*max-height:\s*calc\(6 \*[^}]*overflow-y:\s*auto/);
});

test('with as many dashboards as there can be, Nieuw is not there', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ ...BOARDS[1]!, id: `d-${i}` }));
  const host = await rail({ boards: many, editing: true });
  expect(named(host, 'Nieuw')).toBeUndefined();
  host.boards = many.slice(1);
  await settle(host);
  expect(named(host, 'Nieuw')).not.toBeUndefined();
});

test('Bewerken cannot be pressed while there is no dashboard yet', async () => {
  const host = await rail({ editBlocked: true });
  const toggles = record(host, 'toggle-edit');
  expect((named(host, 'Bewerken') as HTMLButtonElement).disabled).toBe(true);
  named(host, 'Bewerken').click();
  expect(toggles).toEqual([]);
  host.editBlocked = false;
  await settle(host);
  named(host, 'Bewerken').click();
  expect(toggles).toHaveLength(1);
});
