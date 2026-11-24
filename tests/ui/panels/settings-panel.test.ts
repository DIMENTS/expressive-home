// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/panels/settings-panel';
import type { MhSettingsPanel } from '../../../src/ui/panels/settings-panel';
import type { DashboardStatus } from '../../../src/ui/app/context';
import { inside, mount, record, settle } from '../../helpers/mount';
import { createTranslate } from '../../../src/i18n';
import { defaultWall } from '../../../src/wall/settings';

afterEach(() => { document.body.replaceChildren(); });

const status: DashboardStatus = { route: 'local', canControl: true, canStartFlows: true, demo: false };
const open = (props: Record<string, unknown> = {}) => mount<MhSettingsPanel>('mh-settings-panel', { open: true, status, missing: [], softwareVersion: '13.5.5', appVersion: '0.0.0', ...props });
const text = (panel: MhSettingsPanel) => panel.shadowRoot!.textContent ?? '';
const buttons = (panel: MhSettingsPanel) => [...panel.shadowRoot!.querySelectorAll('mh-button')] as HTMLElement[];
const press = (button: HTMLElement) => button.shadowRoot!.querySelector('button')!.click();

test('the settings show the route and what the key may do', async () => {
  const panel = await open({ missing: ['startFlows'] });
  expect(text(panel)).toContain('Lokaal verbonden');
  expect(text(panel)).toContain('Thuis rechtstreeks, onderweg via de Homey-cloud.');
  const rights = [...panel.shadowRoot!.querySelectorAll('.results li')];
  expect(rights.map((r) => r.querySelector('b')!.textContent)).toEqual(['Apparaten bekijken', 'Apparaten bedienen', 'Flows starten']);
  expect(rights.map((r) => r.classList.contains('missing'))).toEqual([false, false, true]);
  expect(rights[2]!.textContent).toContain('Ontbreekt. Flow-knoppen blijven uitgeschakeld.');
});

test('the route label follows the cloud and a lost connection', async () => {
  const panel = await open({ status: { ...status, route: 'cloud' } });
  expect(text(panel)).toContain('Via de cloud verbonden');
  panel.status = { ...status, route: null };
  await settle(panel);
  expect(text(panel)).toContain('Geen verbinding');
});

test('disconnecting asks first', async () => {
  const panel = await open();
  const disconnects = record(panel, 'disconnect');
  const dialog = inside(panel, 'mh-dialog') as HTMLElement & { open: boolean; heading: string };
  expect(dialog.open).toBe(false);
  press(buttons(panel).find((b) => b.textContent?.includes('Verbinding verbreken'))!);
  await settle(panel);
  expect(dialog.open).toBe(true);
  expect(dialog.heading).toBe('Verbinding verbreken?');
  const [cancel, ok] = [...dialog.querySelectorAll('mh-button')] as HTMLElement[];
  press(cancel!);
  await settle(panel);
  expect(dialog.open).toBe(false);
  expect(disconnects).toHaveLength(0);
  press(buttons(panel).find((b) => b.textContent?.includes('Verbinding verbreken'))!);
  await settle(panel);
  press(ok!);
  await settle(panel);
  expect(disconnects).toHaveLength(1);
  expect(dialog.open).toBe(false);
});

test('the demo has its own settings', async () => {
  const panel = await open({ status: { ...status, demo: true }, softwareVersion: null });
  expect(text(panel)).toContain('Voorbeeld-Homey');
  const leaves = record(panel, 'leave-demo');
  press(buttons(panel).find((b) => b.textContent?.includes('Verbinden met je eigen Homey'))!);
  expect(leaves).toHaveLength(1);
  expect(buttons(panel).some((b) => b.textContent?.includes('Verbinding verbreken'))).toBe(false);
  expect(panel.shadowRoot!.querySelector('.results')).toBeNull();
});

test('the versions are shown when known', async () => {
  const known = await open();
  expect(text(known)).toContain('13.5.5');
  expect(text(known)).toContain('Versie dashboard');
  document.body.replaceChildren();
  const unknown = await open({ softwareVersion: null });
  expect(text(unknown)).not.toContain('Homey-software');
  expect(text(unknown)).toContain('Versie dashboard');
});

const languageGroup = (panel: MhSettingsPanel) => [...panel.shadowRoot!.querySelectorAll('mh-choice-group')].find((g) => g.getAttribute('label') === 'Taal' || g.getAttribute('label') === 'Language') as HTMLElement & { options: { id: string; label: string }[]; value: string };

test('the settings offer the language: automatic, Dutch and English, each name in its own language', async () => {
  const panel = await open({ language: null });
  const group = languageGroup(panel);
  expect(group.options.map((o) => [o.id, o.label])).toEqual([['auto', 'Automatisch'], ['nl', 'Nederlands'], ['en', 'English']]);
  expect(group.value).toBe('auto');
  expect(text(panel)).toContain('Automatisch volgt de taal van je browser.');
  const chosen = record<{ choice: string | null }>(panel, 'language');
  group.dispatchEvent(new CustomEvent('change', { detail: { value: 'en' }, bubbles: true, composed: true }));
  group.dispatchEvent(new CustomEvent('change', { detail: { value: 'auto' }, bubbles: true, composed: true }));
  expect(chosen).toEqual([{ choice: 'en' }, { choice: null }]);
});

test('in English the settings speak English, and the language names stay as they are', async () => {
  const panel = await open({ language: 'en', t: createTranslate('en') });
  const group = languageGroup(panel);
  expect(group.getAttribute('label')).toBe('Language');
  expect(group.options.map((o) => o.label)).toEqual(['Automatic', 'Nederlands', 'English']);
  expect(group.value).toBe('en');
  expect((inside(panel, 'mh-sheet') as HTMLElement & { heading: string }).heading).toBe('Settings');
  expect(text(panel)).toContain('Automatic follows the language of your browser.');
});

test('each language name carries its own language, so it is read out right on a page in the other language', async () => {
  const panel = await open({ language: null, t: createTranslate('en') });
  const group = languageGroup(panel);
  await (group as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  const radio = (id: string) => group.shadowRoot!.querySelector(`[role="radio"][data-id="${id}"]`)!;
  expect(radio('nl').getAttribute('lang')).toBe('nl');
  expect(radio('en').getAttribute('lang')).toBe('en');
  expect(radio('auto').hasAttribute('lang')).toBe(false);
});

// ----- the layout -----

const layoutGroup = (panel: MhSettingsPanel) => [...panel.shadowRoot!.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent === 'Indeling')!;
const rowButton = (panel: MhSettingsPanel, text: string) => [...layoutGroup(panel).querySelectorAll('mh-button')].find((b) => b.textContent!.trim() === text) as HTMLElement & { disabled: boolean };

test('the layout group has export, import and reset; reset is disabled while automatic', async () => {
  const panel = await open({ overviewAutomatic: true });
  const titles = [...panel.shadowRoot!.querySelectorAll('h3')].map((h) => h.textContent);
  expect(titles.indexOf('Indeling')).toBe(titles.indexOf('Taal') + 1);
  const shown = layoutGroup(panel).textContent!.replace(/\s+/g, ' ');
  expect(shown).toContain('Indeling bewaren als bestand');
  expect(shown).toContain('Je dashboards, secties, tegels en kleuren, als reservekopie of om mee te nemen. Je sleutel zit er niet in.');
  expect(shown).toContain('Vervangt je huidige dashboards door die uit een bestand.');
  expect(shown).toContain('Het Overzicht is nu automatisch: de app deelt het zelf in.');
  expect(rowButton(panel, 'Terugzetten').disabled).toBe(true);
  const exports = record(panel, 'export');
  const resets = record(panel, 'reset');
  press(rowButton(panel, 'Bewaren'));
  press(rowButton(panel, 'Terugzetten'));
  expect([exports.length, resets.length]).toEqual([1, 0]);
  panel.overviewAutomatic = false;
  await settle(panel);
  expect(layoutGroup(panel).textContent).toContain('De app deelt het Overzicht weer zelf in. Je andere dashboards blijven.');
  press(rowButton(panel, 'Terugzetten'));
  expect(resets).toHaveLength(1);
});

test('Inladen opens the file chooser and reports the file', async () => {
  const panel = await open();
  const input = inside<HTMLInputElement>(panel, 'input[type="file"]');
  expect(input.getAttribute('accept')).toContain('.json');
  const clicks = vi.spyOn(input, 'click').mockImplementation(() => {});
  press(rowButton(panel, 'Inladen'));
  expect(clicks).toHaveBeenCalledTimes(1);
  const imports = record<{ name: string; text: string }>(panel, 'import');
  const choose = async (file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => { if (imports.length === 0) throw new Error('still reading'); });
  };
  await choose(new File(['{"a":1}'], 'indeling.json', { type: 'application/json' }));
  expect(imports.splice(0)).toEqual([{ name: 'indeling.json', text: '{"a":1}' }]);
  // a file that is far too big to be a layout is not read at all
  const big = new File(['x'], 'groot.json');
  Object.defineProperty(big, 'size', { value: 50_000_000 });
  await choose(big);
  expect(imports).toEqual([{ name: 'groot.json', text: '' }]);
  // choosing nothing reports nothing
  Object.defineProperty(input, 'files', { value: [], configurable: true });
  input.dispatchEvent(new Event('change'));
  expect(imports).toHaveLength(1);
});

test('the disconnect help says the layout is kept', async () => {
  const panel = await open();
  expect(text(panel)).toContain('Wist de sleutel uit deze browser. Je thema en je indeling blijven bewaard.');
  expect(text(panel)).not.toContain('Je thema blijft bewaard');
});

test('the layout group is there with the example hub too, in both languages', async () => {
  const panel = await open({ status: { ...status, demo: true }, t: createTranslate('en') });
  expect(text(panel)).toContain('Save the layout as a file');
});

const BOARDS = [{ id: 'overview', name: 'Overzicht' }, { id: 'd-1', name: 'Buiten' }];
const startList = (panel: MhSettingsPanel) => [...panel.shadowRoot!.querySelectorAll('mh-radio-list')].find((l) => l.getAttribute('label') === 'Dit apparaat begint met') as (HTMLElement & { options: { id: string; label: string }[]; value: string }) | undefined;

test('with more than one dashboard this device can be told which to start with', async () => {
  const panel = await open({ boards: BOARDS, startBoard: null });
  expect([startList(panel)!.options.map((o) => o.label), startList(panel)!.value]).toEqual([['Overzicht', 'Buiten'], 'overview']);
  expect(text(panel)).toContain('Alleen op dit apparaat.');
  const chosen = record<{ id: string }>(panel, 'start-board');
  startList(panel)!.dispatchEvent(new CustomEvent('change', { detail: { value: 'd-1' }, bubbles: true, composed: true }));
  expect(chosen).toEqual([{ id: 'd-1' }]);
  panel.startBoard = 'd-1';
  await settle(panel);
  expect(startList(panel)!.value).toBe('d-1');
  panel.startBoard = 'd-gone';
  await settle(panel);
  expect(startList(panel)!.value).toBe('overview');
});

test('with one dashboard, or on the example hub, there is nothing to choose', async () => {
  expect(startList(await open({ boards: BOARDS.slice(0, 1), startBoard: null }))).toBeUndefined();
  expect(startList(await open({ boards: BOARDS, startBoard: null, status: { ...status, demo: true } }))).toBeUndefined();
});

// ----- the wall tablet -----

const wallRow = (panel: MhSettingsPanel) => buttons(panel).find((b) => b.textContent?.trim() === 'Instellen');

test.each([
  [defaultWall(), 'Geen rustbeeld'], [{ ...defaultWall(), on: true }, 'Rustbeeld na 2 minuten'], [{ ...defaultWall(), on: true, after: 1 as const }, 'Rustbeeld na 1 minuut'],
])('this device can be made a wall tablet, and says what it is now: %#', async (wall, summary) => {
  const panel = await open({ wall });
  expect([text(panel).includes('Dit apparaat'), text(panel).includes('Wandtablet'), text(panel).includes(summary)]).toEqual([true, true, true]);
  const opened = record(panel, 'open-wall');
  wallRow(panel)!.click();
  expect(opened).toHaveLength(1);
});

test('also on the example hub, and with only the right to use; not on a phone', async () => {
  expect(wallRow(await open({ wall: defaultWall(), status: { ...status, demo: true } }))).toBeDefined();
  expect(wallRow(await open({ wall: defaultWall(), status: { ...status, served: true, canArrange: false } }))).toBeDefined();
  const phone = await open({ wall: defaultWall(), phone: true });
  expect([wallRow(phone), text(phone).includes('Wandtablet')]).toEqual([undefined, false]);
});

// ----- per kind or per room -----

const choices = (panel: MhSettingsPanel) => [...panel.shadowRoot!.querySelectorAll('mh-choice-group')].find((el) => (el as HTMLElement & { label: string }).label === 'Het Overzicht') as (HTMLElement & { value: string; options: { label: string }[]; disabled: boolean }) | undefined;
const roomsSwitch = (panel: MhSettingsPanel) => [...panel.shadowRoot!.querySelectorAll('mh-switch')].find((el) => (el as HTMLElement & { label: string }).label === 'Kamers in de balk') as (HTMLElement & { checked: boolean }) | undefined;

test('the Overzicht can be per kind or per room while it is automatic', async () => {
  const panel = await open({ overviewAutomatic: true, hasRooms: true, grouping: 'type' });
  expect([choices(panel)!.value, choices(panel)!.options.map((o) => o.label), choices(panel)!.disabled]).toEqual(['type', ['Per soort', 'Per kamer'], false]);
  const chosen = record<{ grouping: string }>(panel, 'grouping');
  choices(panel)!.dispatchEvent(new CustomEvent('change', { detail: { value: 'zone' }, bubbles: true, composed: true }));
  expect(chosen).toEqual([{ grouping: 'zone' }]);
});

test('of an Overzicht of the owner nothing can be chosen, and it says why', async () => {
  const panel = await open({ overviewAutomatic: false, hasRooms: true });
  expect([choices(panel)!.disabled, panel.shadowRoot!.textContent!.includes('zolang het Overzicht automatisch is')]).toEqual([true, true]);
});

test('the rooms can be hidden', async () => {
  const panel = await open({ hasRooms: true, roomsShown: true });
  expect(roomsSwitch(panel)!.checked).toBe(true);
  const shown = record<{ shown: boolean }>(panel, 'rooms-shown');
  roomsSwitch(panel)!.dispatchEvent(new CustomEvent('change', { detail: { checked: false }, bubbles: true, composed: true }));
  expect(shown).toEqual([{ shown: false }]);
});

test('without rooms, or without the right to arrange, there is nothing to choose', async () => {
  for (const props of [{ hasRooms: false, overviewAutomatic: true }, { hasRooms: true, overviewAutomatic: true, status: { route: 'local', canControl: true, canStartFlows: true, demo: false, served: true, canArrange: false } }]) {
    const panel = await open(props);
    expect([choices(panel), roomsSwitch(panel)]).toEqual([undefined, undefined]);
  }
});
