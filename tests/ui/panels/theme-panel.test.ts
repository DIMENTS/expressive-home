// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/theme-panel';
import type { LookChoose, MhThemePanel, PanelLook } from '../../../src/ui/panels/theme-panel';
import type { DeviceLook } from '../../../src/theme/choose';
import { BUILT_IN, type ThemeFile } from '../../../src/theme/look';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import { toShareCode } from '../../../src/theme/share-code';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const avond: ThemeFile = { format: 1, id: 't-aaaaaaaaaaaaaaaa', name: 'Avondlicht', maker: 'noorderlicht', base: 'glas', seed: null, userSeed: true, knobs: { roundness: 'very-round' }, app: '1.1.0' };
const device = (more: Partial<DeviceLook> = {}): DeviceLook => ({ followStyle: true, followMode: true, theme: 'rustig', seed: null, mode: 'auto', fromBefore: false, helder: false, ignoreBoards: false, ...more });
const look = (role: PanelLook['role'], more: Partial<DeviceLook> = {}): PanelLook => ({
  role, device: device(role === 'own' ? { followStyle: false, followMode: false, ...more } : more),
  house: role === 'own' ? null : { theme: 'glas', seed: '#3a5ba9', mode: 'dark' }, themes: [...BUILT_IN, avond],
});
const open = (panelLook: PanelLook, more: Record<string, unknown> = {}) => mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook, density: 'comfortable', presets: rustigExpressive.color.presets, ...more });
const picker = (panel: MhThemePanel) => inside(panel, 'mh-look-picker') as HTMLElement & { value: string; disabled: boolean; options: { id: string; label: string }[] };
const groups = (panel: MhThemePanel) => [...panel.shadowRoot!.querySelectorAll('mh-choice-group')] as (HTMLElement & { label: string; value: string })[];
const group = (panel: MhThemePanel, label: string) => groups(panel).find((g) => g.label === label)!;
const change = (element: HTMLElement, detail: unknown) => element.dispatchEvent(new CustomEvent('change', { detail, bubbles: true, composed: true }));
const buttons = (panel: MhThemePanel) => [...panel.shadowRoot!.querySelectorAll('mh-button')] as HTMLElement[];
const button = (panel: MhThemePanel, text: string) => buttons(panel).find((b) => b.textContent!.trim() === text)!;

test('a device that may edit and follows the house: the house is shown, and what is chosen goes to the house', async () => {
  const panel = await open(look('edit'));
  expect(picker(panel).options.map((o) => o.label)).toEqual(['Rustig', 'Uitbundig', 'Glas', 'Helder', 'Avondlicht']);
  expect(picker(panel).value).toBe('glas');
  expect(group(panel, 'Licht of donker').value).toBe('dark');
  expect(group(panel, 'Voor wie').value).toBe('house');
  const chosen = record<LookChoose>(panel, 'look-choose');
  change(picker(panel), { value: 'uitbundig' });
  change(group(panel, 'Licht of donker'), { value: 'light' });
  change(inside(panel, 'mh-swatch-group'), { seed: '#a6422a' });
  expect(chosen).toEqual([{ target: 'house', theme: 'uitbundig' }, { target: 'house', mode: 'light' }, { target: 'house', seed: '#a6422a' }]);
});

test('a device that may edit with its own choice: it is shown, changes stay on this device, and it can follow the house again', async () => {
  const panel = await open(look('edit', { followStyle: false, followMode: false, theme: 'helder', seed: '#a03b6c', mode: 'light' }));
  expect([picker(panel).value, group(panel, 'Voor wie').value, group(panel, 'Licht of donker').value]).toEqual(['helder', 'device', 'light']);
  expect(panel.shadowRoot!.textContent).toContain('Het huis heeft Glas, donker.');
  const chosen = record<LookChoose>(panel, 'look-choose');
  change(picker(panel), { value: 't-aaaaaaaaaaaaaaaa' });
  expect(chosen).toEqual([{ target: 'device', theme: 't-aaaaaaaaaaaaaaaa' }]);
  const follow = record(panel, 'follow-house');
  button(panel, 'Weer het huis volgen').click();
  expect(follow).toHaveLength(1);
  const targets = record(panel, 'look-target');
  change(group(panel, 'Voor wie'), { value: 'house' });
  expect(targets).toEqual([{ target: 'house' }]);
});

test('a device that may only use: what the house shows, its own roominess and high contrast, nothing more', async () => {
  const panel = await open(look('use'));
  expect(panel.shadowRoot!.textContent).toContain('Dit apparaat volgt het huis.');
  expect([picker(panel).disabled, picker(panel).options.map((o) => o.id)]).toEqual([true, ['glas']]);
  expect(groups(panel).map((g) => g.label)).toEqual(['Weergave']);
  expect(buttons(panel).map((b) => b.textContent!.trim())).toEqual([]);
  const looks = record(panel, 'device-look');
  change(inside(panel, 'mh-switch'), { checked: true });
  expect(looks).toEqual([{ helder: true }]);
});

test('a device that may only use, with its own choice from before the update: it says so, and offers to follow the house', async () => {
  const panel = await open(look('use', { fromBefore: true, followStyle: false, followMode: false, seed: '#a6422a', mode: 'dark' }));
  expect(panel.shadowRoot!.textContent).toContain('Eigen keuze van vóór de update: Rustig, donker.');
  expect(picker(panel).options.map((o) => o.id)).toEqual(['rustig']);
  const follow = record(panel, 'follow-house');
  button(panel, 'Voortaan het huis volgen').click();
  expect(follow).toHaveLength(1);
});

test('a browser with its own key, and the example house: everything, without "voor wie"', async () => {
  const panel = await open(look('own', { theme: 'uitbundig', seed: '#6750a4', mode: 'light' }));
  expect(groups(panel).map((g) => g.label)).toEqual(['Licht of donker', 'Weergave']);
  const chosen = record<LookChoose>(panel, 'look-choose');
  change(picker(panel), { value: 'glas' });
  expect(chosen).toEqual([{ target: 'device', theme: 'glas' }]);
});

test('on a phone there is no choice between roomy and compact; elsewhere it is told as density', async () => {
  expect(groups(await open(look('own'), { phone: true })).map((g) => g.label)).toEqual(['Licht of donker', 'Automatisch volgt']);
  const panel = await open(look('own'));
  const told = record(panel, 'density');
  change(group(panel, 'Weergave'), { value: 'compact' });
  expect(told).toEqual([{ density: 'compact' }]);
});

test('adjusting: every knob changes the dashboard at once; save asks a name and keeps it, discard leaves nothing', async () => {
  const panel = await open(look('edit'));
  const previews = record<{ file: ThemeFile | null }>(panel, 'look-preview');
  button(panel, 'Bijstellen').click();
  await settle(panel);
  expect(groups(panel).map((g) => g.label)).toEqual(['Rondheid', 'Kleurkracht', 'Contrast', 'Letter', 'Letterdikte', 'Vlakken', 'Achtergrond']);
  expect(previews.at(-1)!.file).toMatchObject({ base: 'glas', knobs: { surfaces: 'see-through', background: 'gradient' } });
  change(group(panel, 'Rondheid'), { value: 'square' });
  change(group(panel, 'Letterdikte'), { value: '800' });
  expect(previews.at(-1)!.file!.knobs).toMatchObject({ roundness: 'square', weight: 800 });
  const saved = record<{ file: ThemeFile }>(panel, 'look-save');
  const field = inside(panel, 'mh-text-field');
  field.dispatchEvent(new CustomEvent('input', { detail: { value: 'Zee' }, bubbles: true, composed: true }));
  button(panel, 'Bewaren als mijn thema').click();
  expect(saved.map(({ file }) => [file.name, file.base, file.knobs.roundness, file.knobs.weight, /^t-[0-9a-z]{16}$/.test(file.id)])).toEqual([['Zee', 'glas', 'square', 800, true]]);
  expect(previews.at(-1)).toEqual({ file: null });
  await settle(panel);
  button(panel, 'Bijstellen').click();
  await settle(panel);
  button(panel, 'Weggooien').click();
  expect(previews.at(-1)).toEqual({ file: null });
  expect(saved).toHaveLength(1);
});

test('closing the panel while adjusting throws the adjustment away', async () => {
  const panel = await open(look('own'));
  const previews = record<{ file: ThemeFile | null }>(panel, 'look-preview');
  button(panel, 'Bijstellen').click();
  await settle(panel);
  panel.open = false;
  await settle(panel);
  expect(previews.at(-1)).toEqual({ file: null });
});

test('sharing shows the code of the theme; taking it in elsewhere gives the same theme', async () => {
  const panel = await open(look('edit'));
  (panel.shadowRoot!.querySelector('.theme-row') as HTMLElement).click();
  await settle(panel);
  expect(panel.shadowRoot!.querySelector('.code')!.textContent).toBe(toShareCode(avond));
  const other = await open({ ...look('own'), themes: BUILT_IN });
  button(other, 'Thema van een ander').click();
  await settle(other);
  inside(other, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: toShareCode(avond) }, bubbles: true, composed: true }));
  await settle(other);
  expect(other.shadowRoot!.textContent).toContain('Nagekeken: 1 waarden, 0 weggevallen.');
  const saved = record<{ file: ThemeFile }>(other, 'look-save');
  button(other, 'Bewaren en gebruiken').click();
  expect(saved.map(({ file }) => file)).toEqual([avond]);
});

test('half a code is refused with a clear reason, and nothing can be saved', async () => {
  const panel = await open(look('own'));
  button(panel, 'Thema van een ander').click();
  await settle(panel);
  inside(panel, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: toShareCode(avond).slice(0, 30) }, bubbles: true, composed: true }));
  await settle(panel);
  expect(panel.shadowRoot!.textContent).toContain('Deze code is niet compleet of veranderd.');
  expect(button(panel, 'Bewaren en gebruiken')).toBeUndefined();
});

test('a theme that is there already: replace it, or add it as a new one', async () => {
  const panel = await open(look('edit'));
  button(panel, 'Thema van een ander').click();
  await settle(panel);
  inside(panel, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: toShareCode({ ...avond, name: 'Avond 2' }) }, bubbles: true, composed: true }));
  await settle(panel);
  expect(panel.shadowRoot!.textContent).toContain('Dit thema heb je al.');
  change(group(panel, 'Dit thema heb je al.'), { value: 'add' });
  await settle(panel);
  const saved = record<{ file: ThemeFile }>(panel, 'look-save');
  button(panel, 'Bewaren en gebruiken').click();
  expect(saved[0]!.file.id).not.toBe(avond.id);
  expect(saved[0]!.file.name).toBe('Avond 2');
});

test('removing a theme asks first', async () => {
  const panel = await open(look('edit'));
  (panel.shadowRoot!.querySelector('.theme-row') as HTMLElement).click();
  await settle(panel);
  const removed = record(panel, 'look-remove');
  button(panel, 'Verwijderen').click();
  await settle(panel);
  expect(removed).toEqual([]);
  button(panel, 'Ja, verwijderen').click();
  expect(removed).toEqual([{ id: avond.id }]);
});

test('the theme panel is a sheet named Thema', async () => {
  const panel = await open(look('own'));
  const sheet = inside(panel, 'mh-sheet') as HTMLElement & { heading: string; open: boolean };
  expect([sheet.heading, sheet.open]).toEqual(['Thema', true]);
  const closes = record(panel, 'close');
  sheet.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  expect(closes).toHaveLength(1);
});

/** Hard to read in the dark only: in two places, with every colour. */
const grijs: ThemeFile = { format: 1, id: 't-gggggggggggggggg', name: 'Grijs', maker: '', base: 'uitbundig', seed: null, userSeed: true, knobs: { strength: 'grey', surfaces: 'solid', background: 'plain', contrast: 'high' }, app: '' };

test('how hard a theme is to read counts light and dark, and goes along when it is saved', async () => {
  const panel = await open({ ...look('edit'), house: { theme: grijs.id, seed: null, mode: 'light' }, themes: [...BUILT_IN, grijs] });
  button(panel, 'Bijstellen').click();
  await settle(panel);
  expect(panel.shadowRoot!.textContent).toContain('Op 2 plekken is tekst slecht te lezen.');
  const saved = record<{ file: ThemeFile; poor?: number }>(panel, 'look-save');
  button(panel, 'Bewaren als mijn thema').click();
  expect(saved.map(({ poor }) => poor)).toEqual([2]);
});

/** With a colour of its own, easy to read in it; with the colour of the house it is not everywhere. */
const paars: ThemeFile = { format: 1, id: 't-pppppppppppppppp', name: 'Paars', maker: '', base: 'helder', seed: '#6750a4', userSeed: false, knobs: { strength: 'vivid', surfaces: 'see-through', background: 'plain', contrast: 'highest' }, app: '' };

test('a theme with a colour of its own is shown and measured in that colour', async () => {
  const panel = await open({ ...look('edit'), themes: [...BUILT_IN, paars] });
  const options = picker(panel).options as unknown as { id: string; seed: string }[];
  expect([options.find((o) => o.id === 'glas')!.seed, options.find((o) => o.id === paars.id)!.seed]).toEqual(['#3a5ba9', '#6750a4']);
  const other = await open({ ...look('edit'), themes: BUILT_IN });
  button(other, 'Thema van een ander').click();
  await settle(other);
  inside(other, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: toShareCode(paars) }, bubbles: true, composed: true }));
  await settle(other);
  expect(other.shadowRoot!.textContent).toContain('Overal goed te lezen.');
});

test('on a dashboard with a theme of its own the panel says so, and where that is changed', async () => {
  const told = 'Dit dashboard heeft een eigen thema: Avondlicht. Dat verander je bij Bewerken → Uiterlijk.';
  expect((await open(look('edit'), { boardTheme: avond.id })).shadowRoot!.textContent).toContain(told);
  expect((await open(look('own'), { boardTheme: avond.id })).shadowRoot!.textContent).toContain(told);
  expect((await open(look('edit'))).shadowRoot!.textContent).not.toContain('eigen thema:');
});

test('with as many themes as there may be, nothing new is offered to save, and that is said', async () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ ...avond, id: `t-${String(i).padStart(16, '0')}` }));
  const panel = await open({ ...look('edit'), themes: [...BUILT_IN, ...many] });
  button(panel, 'Bijstellen').click();
  await settle(panel);
  expect(button(panel, 'Bewaren als mijn thema')).toBeUndefined();
  expect(panel.shadowRoot!.textContent).toContain('Er zijn al 50 thema’s. Verwijder er eerst een.');
  button(panel, 'Weggooien').click();
  await settle(panel);
  button(panel, 'Thema van een ander').click();
  await settle(panel);
  inside(panel, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: toShareCode({ ...avond, id: 't-zzzzzzzzzzzzzzzz' }) }, bubbles: true, composed: true }));
  await settle(panel);
  expect([button(panel, 'Bewaren en gebruiken'), panel.shadowRoot!.textContent!.includes('Er zijn al 50 thema’s.')]).toEqual([undefined, true]);
});

test('automatic can follow this device or the sun, in a row of its own; without the weather of the Homey the panel says it follows this device', async () => {
  const panel = await open(look('own', { mode: 'sun' }));
  type Group = HTMLElement & { value: string; options: { id: string; label: string }[] };
  const mode = group(panel, 'Licht of donker') as unknown as Group;
  const follows = group(panel, 'Automatisch volgt') as unknown as Group;
  // three options side by side, as always: the sun is a kind of automatic
  expect([mode.options.map((o) => o.label), mode.value]).toEqual([['Licht', 'Donker', 'Automatisch'], 'auto']);
  expect([follows.options.map((o) => o.label), follows.value]).toEqual([['Dit apparaat', 'De zon'], 'sun']);
  const chosen = record<LookChoose>(panel, 'look-choose');
  change(follows, { value: 'auto' });
  expect(chosen).toEqual([{ target: 'device', mode: 'auto' }]);
  expect(panel.shadowRoot!.textContent).toContain('Zonder het weer van de Homey volgt het dit apparaat.');
  // light or dark has no row of what it follows
  expect(groups(await open(look('own', { mode: 'light' }))).map((g) => g.label)).not.toContain('Automatisch volgt');
  panel.sunDark = true;
  await settle(panel);
  expect(panel.shadowRoot!.textContent).not.toContain('Zonder het weer van de Homey');
});
