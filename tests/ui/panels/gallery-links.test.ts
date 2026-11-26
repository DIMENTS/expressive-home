// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/theme-panel';
import type { MhThemePanel, PanelLook } from '../../../src/ui/panels/theme-panel';
import { GALLERY_URL, galleryForm } from '../../../src/app/links';
import type { DeviceLook } from '../../../src/theme/choose';
import { BUILT_IN, type ThemeFile } from '../../../src/theme/look';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import { toShareCode } from '../../../src/theme/share-code';
import { GALLERY_CODE_LIMIT } from '../../../src/theme/theme-file';
import { mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const mine: ThemeFile = { format: 1, id: 't-aaaaaaaaaaaaaaaa', name: 'Avond & licht #1', maker: '', base: 'glas', seed: null, userSeed: true, knobs: { roundness: 'very-round' }, app: '1.3.0' };
const theirs: ThemeFile = { ...mine, id: 't-bbbbbbbbbbbbbbbb', name: 'Van een ander', maker: 'noorderlicht' };
const theirCss: ThemeFile = { ...mine, id: 't-cccccccccccccccc', name: 'Met CSS', format: 2, css: { version: 1, text: '::part(tile) { color: #111111 }' } };
const device: DeviceLook = { followStyle: false, followMode: false, theme: 'rustig', seed: null, mode: 'auto', fromBefore: false, helder: false, ignoreBoards: false };
const look = (role: PanelLook['role'] = 'own'): PanelLook => ({
  role, device, house: role === 'own' ? null : { theme: 'rustig', seed: null, mode: 'auto' }, themes: [...BUILT_IN, mine, theirs, theirCss], cssFrom: { [theirCss.id]: 'other' },
});
const open = (panelLook = look()) => mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook, density: 'comfortable', presets: rustigExpressive.color.presets });
const links = (panel: MhThemePanel) => [...panel.shadowRoot!.querySelectorAll('a')];
const show = async (panel: MhThemePanel, view: object) => { (panel as unknown as { view: object }).view = view; await settle(panel); };

// ----- the address of the form -----

test('the form opens with the name and the code, each encoded', () => {
  const code = toShareCode(mine);
  const form = galleryForm('Avond & licht #1', code);
  expect(form.kind).toBe('filled');
  if (form.kind !== 'filled') return;
  const url = new URL(form.url);
  expect(`${url.origin}${url.pathname}`).toBe(`${GALLERY_URL}/issues/new`);
  expect(url.searchParams.get('template')).toBe('theme.yml');
  expect(url.searchParams.get('name')).toBe('Avond & licht #1');
  expect(url.searchParams.get('code')).toBe(code);
  expect(form.url).not.toMatch(/[ #&]licht|& |#1/);
});

test('a code of more than 6000 characters leaves the form with only the name, to paste the code; more than the gallery takes opens nothing', () => {
  const long = `EH2.${'a'.repeat(6000)}.0`;
  const form = galleryForm('Lang', long);
  expect(form.kind).toBe('name-only');
  if (form.kind !== 'name-only') return;
  expect(new URL(form.url).searchParams.get('code')).toBeNull();
  expect(new URL(form.url).searchParams.get('name')).toBe('Lang');
  expect(galleryForm('Te groot', `EH2.${'a'.repeat(GALLERY_CODE_LIMIT)}.0`)).toEqual({ kind: 'too-big' });
  expect(galleryForm('Precies', `EH2.${'a'.repeat(5994)}.0`).kind).toBe('filled');
});

// ----- Thema van een ander -----

test('a theme of someone else ends with More themes: the address as text and a link that opens the gallery in a new tab', async () => {
  const panel = await open();
  await show(panel, { kind: 'import' });
  const text = panel.shadowRoot!.textContent!;
  expect(text).toContain('Meer thema’s');
  expect(text).toContain('github.com/DIMENTS/expressive-home-themes');
  const [link] = links(panel);
  expect(link!.textContent).toContain('Galerij openen');
  expect(link!.textContent).toContain('opent in een nieuw tabblad');
  expect(link!.getAttribute('href')).toBe(GALLERY_URL);
  expect(link!.getAttribute('target')).toBe('_blank');
  expect(link!.getAttribute('rel')).toBe('noopener noreferrer');
  expect(link!.classList.contains('link')).toBe(true);
});

// ----- sharing -----

test('sharing a theme made in this house offers to send it in, with the form filled in', async () => {
  const panel = await open();
  await show(panel, { kind: 'share', id: mine.id });
  const link = links(panel).find((item) => item.textContent!.includes('Insturen bij de galerij'))!;
  expect(link).toBeTruthy();
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(new URL(link.getAttribute('href')!).searchParams.get('code')).toBe(toShareCode(mine));
  expect(panel.shadowRoot!.textContent).toContain('eigen GitHub-account');
});

test.each([
  ['a theme taken in from someone else', theirs.id, 'own'],
  ['a theme with CSS of someone else', theirCss.id, 'own'],
  ['a built-in style', 'glas', 'own'],
  ['a device that may only use', mine.id, 'use'],
])('there is nothing to send in for %s', async (_what, id, role) => {
  const panel = await open(look(role as PanelLook['role']));
  await show(panel, { kind: 'share', id });
  expect(panel.shadowRoot!.textContent).not.toContain('Insturen bij de galerij');
});

test('a theme too large for the gallery says so and opens nothing', async () => {
  const big: ThemeFile = { ...mine, id: 't-dddddddddddddddd', format: 2, css: { version: 1, text: `::part(tile) { color: #111111 }\n/* ${'x'.repeat(50_000)} */` } };
  const panel = await open({ ...look(), themes: [...BUILT_IN, big] });
  await show(panel, { kind: 'share', id: big.id });
  expect(panel.shadowRoot!.textContent).toContain('te groot voor de galerij');
  expect(links(panel)).toEqual([]);
});

test('with a long code the link opens the form with the name, and copies the code with a word on what to do', async () => {
  const long: ThemeFile = { ...mine, id: 't-eeeeeeeeeeeeeeee', format: 2, css: { version: 1, text: `::part(tile) { color: #111111 }\n/* ${'x'.repeat(8_000)} */` } };
  const copied: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
  const panel = await open({ ...look(), themes: [...BUILT_IN, long] });
  await show(panel, { kind: 'share', id: long.id });
  const link = links(panel).find((item) => item.textContent!.includes('Insturen bij de galerij'))!;
  expect(new URL(link.getAttribute('href')!).searchParams.get('code')).toBeNull();
  link.addEventListener('click', (event) => event.preventDefault());
  link.click();
  await settle(panel);
  await new Promise((done) => { setTimeout(done, 0); });
  await settle(panel);
  expect(copied).toEqual([toShareCode(long)]);
  expect(panel.shadowRoot!.textContent).toContain('De code is gekopieerd; plak hem in het formulier.');
});

test('without a clipboard (an address without https, as on the hub) a long code is not said to be copied: copy it above first', async () => {
  const long: ThemeFile = { ...mine, id: 't-ffffffffffffffff', format: 2, css: { version: 1, text: `::part(tile) { color: #111111 }\n/* ${'x'.repeat(8_000)} */` } };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  const panel = await open({ ...look(), themes: [...BUILT_IN, long] });
  await show(panel, { kind: 'share', id: long.id });
  const text = panel.shadowRoot!.textContent!;
  expect(text).toContain('Kopieer eerst de code hierboven');
  expect(text).not.toContain('kopieert de code');
  const link = links(panel).find((item) => item.textContent!.includes('Insturen bij de galerij'))!;
  link.addEventListener('click', (event) => event.preventDefault());
  link.click();
  await settle(panel);
  expect(panel.shadowRoot!.textContent).not.toContain('De code is gekopieerd');
});

// ----- someone else's theme, remembered -----

const pasted: ThemeFile = { ...mine, id: 't-pastedpastedpast', name: 'Geplakt' };
const withMarks = (theme = 'rustig', role: PanelLook['role'] = 'own'): PanelLook => ({ ...look(role), device: { ...device, theme }, themes: [...BUILT_IN, mine, theirs, theirCss, pasted], takenIn: [pasted.id] });
const button = (panel: MhThemePanel, text: string) => [...panel.shadowRoot!.querySelectorAll('mh-button')].find((item) => item.textContent!.trim() === text) as HTMLElement;

test('a theme taken in without CSS is remembered as someone else\'s: nothing to send in', async () => {
  const panel = await open(withMarks());
  await show(panel, { kind: 'share', id: pasted.id });
  expect(panel.shadowRoot!.textContent).not.toContain('Insturen bij de galerij');
  await show(panel, { kind: 'share', id: mine.id });
  expect(panel.shadowRoot!.textContent).toContain('Insturen bij de galerij');
});

test('taking a theme in says it is someone else\'s', async () => {
  const panel = await open(withMarks());
  const saved = record<{ takenIn?: boolean }>(panel, 'look-save');
  await show(panel, { kind: 'import' });
  (panel as unknown as { check(text: string): void }).check(toShareCode({ ...mine, id: 't-newnewnewnewnewn' }));
  await settle(panel);
  button(panel, 'Bewaren en gebruiken').click();
  expect(saved).toMatchObject([{ takenIn: true }]);
});

test.each([
  ['a theme taken in', pasted.id, true],
  ['a theme from the gallery', theirs.id, true],
  ['a theme with CSS of someone else', theirCss.id, true],
  ['a theme made here', mine.id, false],
  ['a built-in style', 'glas', false],
])('a copy of %s, adjusted and saved, is someone else\'s: %s', async (_what, base, taken) => {
  const panel = await open(withMarks(base));
  const saved = record<{ takenIn?: boolean }>(panel, 'look-save');
  button(panel, 'Bijstellen').click();
  await settle(panel);
  button(panel, 'Bewaren als mijn thema').click();
  expect(saved).toMatchObject([{ takenIn: taken }]);
});

test('Alle waarden starting from someone else\'s theme passes that on to what it saves', async () => {
  const panel = await open(withMarks(pasted.id));
  button(panel, 'Alle waarden').click();
  await settle(panel);
  const values = panel.shadowRoot!.querySelector('mh-all-values') as HTMLElement & { takenIn: boolean };
  expect(values.takenIn).toBe(true);
});

test('Alle waarden keeps where it started from, also when the theme shown changes meanwhile', async () => {
  const panel = await open(withMarks(pasted.id));
  button(panel, 'Alle waarden').click();
  await settle(panel);
  panel.look = withMarks(mine.id);
  await settle(panel);
  const values = panel.shadowRoot!.querySelector('mh-all-values') as HTMLElement & { takenIn: boolean };
  expect(values.takenIn).toBe(true);
});
