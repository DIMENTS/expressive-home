// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/panels/all-values';
import '../../../src/ui/panels/theme-panel';
import type { MhAllValues, ValuesSave } from '../../../src/ui/panels/all-values';
import type { MhThemePanel, PanelLook } from '../../../src/ui/panels/theme-panel';
import { BUILT_IN, type ThemeFile } from '../../../src/theme/look';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const glas = BUILT_IN.find((file) => file.id === 'glas')!;
const editor = (more: Record<string, unknown> = {}) => mount<MhAllValues>('mh-all-values', { file: glas, seed: '#3b6939', mode: 'light', ...more });
const all = (root: Element, selector: string) => [...root.shadowRoot!.querySelectorAll(selector)] as HTMLElement[];
const byText = (root: Element, selector: string, text: string) => all(root, selector).find((element) => element.textContent!.trim().startsWith(text))!;
const change = (element: Element, detail: unknown) => element.dispatchEvent(new CustomEvent('change', { detail, bubbles: true, composed: true }));
const input = (element: Element, value: string) => element.dispatchEvent(new CustomEvent('input', { detail: { value }, bubbles: true, composed: true }));
const rowOf = (panel: MhAllValues, words: string) => all(panel, 'li.row').find((row) => row.querySelector('.label span')!.textContent === words)!;
const fieldIn = (row: HTMLElement) => row.querySelector('mh-text-field')!;

test('it opens on the colours of the theme, with words and the technical name', async () => {
  const panel = await editor();
  expect(byText(panel, '.group', 'Kleur').getAttribute('aria-pressed')).toBe('true');
  const row = rowOf(panel, 'Kleur: primair');
  expect(row.querySelector('code')!.textContent).toBe('c-primary');
  expect(all(panel, 'li.row').every((item) => item.querySelector('code'))).toBe(true);
});

test('a group shows its values; a search finds by words across groups', async () => {
  const panel = await editor();
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  expect(rowOf(panel, 'Tegel aan: achtergrond')).toBeTruthy();
  input(inside(panel, 'mh-text-field'), 'blikvanger');
  await settle(panel);
  expect(all(panel, 'li.row').length).toBeGreaterThan(0);
  expect(all(panel, 'li.row').every((row) => row.textContent!.toLowerCase().includes('blikvanger') || row.textContent!.includes('hero'))).toBe(true);
});

test('a value typed in the chosen layer goes to the try-out, is marked and can be put back; a wrong one changes nothing', async () => {
  const panel = await editor();
  const previews = record<{ file: ThemeFile }>(panel, 'values-preview');
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel: rand')), '3');
  await settle(panel);
  expect(previews.at(-1)!.file.values).toEqual({ both: { 'tile-outline-width': '3px' } });
  expect(rowOf(panel, 'Tegel: rand').classList.contains('changed')).toBe(true);
  input(fieldIn(rowOf(panel, 'Tegel: rand')), 'url(x)');
  await settle(panel);
  expect(previews).toHaveLength(1);
  (rowOf(panel, 'Tegel: rand').querySelector('mh-button') as HTMLElement).click();
  await settle(panel);
  expect(previews.at(-1)!.file.values).toEqual({});
});

test('light, dark or both: the layer that changes', async () => {
  const panel = await editor();
  const previews = record<{ file: ThemeFile }>(panel, 'values-preview');
  change(all(panel, 'mh-choice-group').find((group) => group.getAttribute('label') === 'Je verandert')!, { value: 'dark' });
  await settle(panel);
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel: rand')), '2px');
  expect(previews.at(-1)!.file.values).toEqual({ dark: { 'tile-outline-width': '2px' } });
});

test('a colour: the colours of the theme, an own colour, see-through; a colour role takes only a colour of its own', async () => {
  const panel = await editor();
  const previews = record<{ file: ThemeFile }>(panel, 'values-preview');
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  (rowOf(panel, 'Tegel aan: achtergrond').querySelector('.swatch') as HTMLElement).click();
  await settle(panel);
  const roles = [...rowOf(panel, 'Tegel aan: achtergrond').querySelectorAll('.role')] as HTMLElement[];
  expect(roles.map((role) => role.textContent!.trim())).toContain('tertiair');
  roles.find((role) => role.textContent!.trim() === 'tertiair')!.click();
  expect(previews.at(-1)!.file.values).toEqual({ both: { 'tile-on-bg': 'var(--c-tertiary)' } });
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel aan: achtergrond')), '#7D4CFF');
  expect(previews.at(-1)!.file.values).toEqual({ both: { 'tile-on-bg': '#7d4cff' } });
  byText(panel, '.group', 'Kleur').click();
  await settle(panel);
  (rowOf(panel, 'Kleur: primair').querySelector('.swatch') as HTMLElement).click();
  await settle(panel);
  expect(rowOf(panel, 'Kleur: primair').querySelectorAll('.role')).toHaveLength(0);
});

test('undo and redo step by step, with the buttons and with the keyboard', async () => {
  const panel = await editor();
  const previews = record<{ file: ThemeFile }>(panel, 'values-preview');
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel: rand')), '2px');
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel: hoeken')), '4px');
  await settle(panel);
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true }));
  expect(previews.at(-1)!.file.values).toEqual({ both: { 'tile-outline-width': '2px' } });
  await settle(panel);
  (all(panel, '.steps mh-button')[0]!).click();
  expect(previews.at(-1)!.file.values).toEqual({});
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, composed: true }));
  expect(previews.at(-1)!.file.values).toEqual({ both: { 'tile-outline-width': '2px' } });
});

test('the empty base can be the start, and the rest of the names can be shown without promise', async () => {
  const panel = await editor();
  const previews = record<{ file: ThemeFile }>(panel, 'values-preview');
  change(all(panel, 'mh-choice-group').find((group) => group.getAttribute('label') === 'Begin bij')!, { value: 'leeg' });
  expect(previews.at(-1)!.file.base).toBe('leeg');
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  const before = all(panel, 'li.row').length;
  expect(inside(panel, 'mh-switch').closest('.row')!.textContent).toContain('Ook de rest tonen (zonder belofte)');
  change(inside(panel, 'mh-switch'), { checked: true });
  await settle(panel);
  expect(all(panel, 'li.row').length).toBeGreaterThan(before);
  expect(panel.shadowRoot!.textContent).toContain('Zonder belofte');
});

test('saving gives a theme of format 2 with a name; nothing of its own gives format 1; discarding is reported', async () => {
  const panel = await editor();
  const saved = record<ValuesSave>(panel, 'look-save');
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel: rand')), '2px');
  await settle(panel);
  byText(panel, 'mh-button', 'Bewaren als mijn thema').click();
  expect(saved[0]!.file).toMatchObject({ format: 2, base: 'glas', name: 'Mijn thema', values: { both: { 'tile-outline-width': '2px' } } });
  const plain = await editor();
  const plainSaved = record<ValuesSave>(plain, 'look-save');
  byText(plain, 'mh-button', 'Bewaren als mijn thema').click();
  expect(plainSaved[0]!.file.format).toBe(1);
  const gone = record(plain, 'values-discard');
  byText(plain, 'mh-button', 'Weggooien').click();
  expect(gone).toHaveLength(1);
});

test('hard to read is named with a fix, and too big cannot be saved', async () => {
  const panel = await editor({ otherBytes: 1_048_500 });
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  (rowOf(panel, 'Tegel aan: tekst').querySelector('.swatch') as HTMLElement).click();
  await settle(panel);
  input(fieldIn(rowOf(panel, 'Tegel aan: tekst')), '#e0e0e0');
  await settle(panel);
  expect(panel.shadowRoot!.textContent).toMatch(/slecht te lezen/);
  expect(panel.shadowRoot!.textContent).toMatch(/Te groot om te bewaren/);
  expect(all(panel, 'mh-button').some((button) => button.textContent!.includes('Bewaren als mijn thema'))).toBe(false);
  byText(panel, 'mh-button', 'Kleur aanpassen').click();
  await settle(panel);
  expect(panel.shadowRoot!.textContent).not.toMatch(/slecht te lezen/);
});

const panelLook = (role: PanelLook['role']): PanelLook => ({
  role, device: { followStyle: false, followMode: false, theme: 'glas', seed: null, mode: 'auto', fromBefore: false, helder: false, ignoreBoards: false },
  house: role === 'own' ? null : { theme: 'glas', seed: null, mode: 'auto' }, themes: [...BUILT_IN],
});

test('the theme panel offers Alle waarden to a device that may edit, never to one that may only use', async () => {
  const use = await mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook('use'), presets: rustigExpressive.color.presets });
  expect(all(use, 'mh-button').some((button) => button.textContent!.includes('Alle waarden'))).toBe(false);
  const edit = await mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook('edit'), presets: rustigExpressive.color.presets });
  const previews = record<{ file: ThemeFile | null }>(edit, 'look-preview');
  byText(edit, 'mh-button', 'Alle waarden').click();
  await settle(edit);
  const values = inside(edit, 'mh-all-values') as MhAllValues;
  expect(values.file.base).toBe('glas');
  expect(previews.at(-1)!.file!.base).toBe('glas');
  values.dispatchEvent(new CustomEvent('values-preview', { detail: { file: { ...values.file, values: { both: { 'tile-bg': '#ffffff' } } } }, bubbles: true, composed: true }));
  expect(previews.at(-1)!.file!.values).toEqual({ both: { 'tile-bg': '#ffffff' } });
  values.dispatchEvent(new CustomEvent('values-discard', { bubbles: true, composed: true }));
  await settle(edit);
  expect(previews.at(-1)!.file).toBeNull();
  expect(edit.shadowRoot!.querySelector('mh-all-values')).toBeNull();
});

test('typing a number keeps what is typed in the field, counts it with its unit, and is one step to undo', async () => {
  const panel = await editor();
  const previews = record<{ file: ThemeFile }>(panel, 'values-preview');
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  for (const text of ['1', '12']) {
    input(fieldIn(rowOf(panel, 'Tegel: rand')), text);
    await settle(panel);
  }
  expect((fieldIn(rowOf(panel, 'Tegel: rand')) as HTMLElement & { value: string }).value).toBe('12');
  expect(previews.at(-1)!.file.values).toEqual({ both: { 'tile-outline-width': '12px' } });
  (all(panel, '.steps mh-button')[0]!).click();
  expect(previews.at(-1)!.file.values).toEqual({});
});

test('the editor says what it starts from', async () => {
  const panel = await editor({ file: { ...glas, name: '' }, startName: 'Glas' });
  expect(panel.shadowRoot!.querySelector('.lead')!.textContent).toContain('Begint bij Glas');
});

test('a colour of the theme is a toggle button in a group, reachable with Tab', async () => {
  const panel = await editor();
  byText(panel, '.group', 'Tegels').click();
  await settle(panel);
  (rowOf(panel, 'Tegel aan: achtergrond').querySelector('.swatch') as HTMLElement).click();
  await settle(panel);
  const role = rowOf(panel, 'Tegel aan: achtergrond').querySelector('.role')!;
  expect([role.getAttribute('role'), role.hasAttribute('aria-pressed')]).toEqual([null, true]);
  expect(role.closest('[role="group"]')).not.toBeNull();
});

test('a theme taken in from another whose plain tiles look like an alarm is said to be so', async () => {
  const edit = await mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook('edit'), presets: rustigExpressive.color.presets });
  byText(edit, 'mh-button', 'Thema van een ander').click();
  await settle(edit);
  const { toShareCode } = await import('../../../src/theme/share-code');
  const { computeLook, styleOf } = await import('../../../src/theme/styles');
  const errorBg = computeLook(styleOf(BUILT_IN[0]!), { seed: rustigExpressive.color.defaultSeed, mode: 'light', density: 'comfortable' }, false)['--c-error-container']!;
  const alike: ThemeFile = { ...BUILT_IN[0]!, format: 2, id: 't-0000000000000077', name: 'Alarm', values: { light: { 'tile-bg': errorBg } } };
  input(edit.shadowRoot!.querySelector('mh-text-field')!, toShareCode(alike));
  await settle(edit);
  expect(edit.shadowRoot!.textContent).toContain('lijkt nu te veel op een gewone tegel');
});

test('own CSS: a step of its own, typed with a pause, what was left out per line, parts to insert, and saved as from the house', async () => {
  vi.useFakeTimers();
  try {
    const panel = await editor();
    const previews = record<{ file: ThemeFile; cssFrom?: string }>(panel, 'values-preview');
    byText(panel, 'mh-button', 'Eigen CSS').click();
    await settle(panel);
    const area = panel.shadowRoot!.querySelector('textarea')!;
    expect(area.getAttribute('aria-label')).toBe('Eigen CSS');
    area.value = '::part(tile) { border-radius: 0;\n  position: fixed }';
    area.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(previews).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    await settle(panel);
    expect(previews.at(-1)).toMatchObject({ file: { css: { version: 1, text: '::part(tile) { border-radius: 0;\n  position: fixed }' } }, cssFrom: 'house' });
    expect(panel.shadowRoot!.textContent).toContain('Regel 2: position, kan niet; weggelaten');
    all(panel, 'mh-button').find((button) => button.getAttribute('label') === 'Invoegen: hero-number')!.click();
    await vi.advanceTimersByTimeAsync(300);
    expect(previews.at(-1)!.file.css!.text).toContain('::part(hero-number) {');
    byText(panel, 'mh-button', 'Terug naar alle waarden').click();
    await settle(panel);
    const saved = record<{ file: ThemeFile; cssFrom: string }>(panel, 'look-save');
    byText(panel, 'mh-button', 'Bewaren als mijn thema').click();
    expect(saved[0]).toMatchObject({ file: { format: 2, css: { version: 1 } }, cssFrom: 'house' });
  } finally {
    vi.useRealTimers();
  }
});

test('own CSS that makes plain tiles look like an alarm is said to', async () => {
  vi.useFakeTimers();
  try {
    const panel = await editor({ file: { ...glas, format: 2, css: { version: 1, text: '::part(tile) { background: #ffdad6 }' } } });
    byText(panel, 'mh-button', 'Eigen CSS').click();
    await settle(panel);
    expect(panel.shadowRoot!.textContent).toContain('Gewone tegels lijken nu op een alarm');
  } finally {
    vi.useRealTimers();
  }
});

test('a theme of someone else with CSS: the code shown, what is not allowed struck through, and the switch only on a device that may edit', async () => {
  const { toShareCode } = await import('../../../src/theme/share-code');
  const terminal: ThemeFile = { ...BUILT_IN[0]!, format: 2, id: 't-00000000000000c3', name: 'Terminal', css: { version: 1, text: '::part(tile) {\n  border-radius: 0;\n  box-shadow: 0 0 4px #3f3;\n  opacity: .5;\n}' } };
  for (const role of ['edit', 'use'] as const) {
    const edit = await mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook(role === 'use' ? 'own' : 'edit'), presets: rustigExpressive.color.presets });
    byText(edit, 'mh-button', 'Thema van een ander').click();
    await settle(edit);
    input(edit.shadowRoot!.querySelector('mh-text-field')!, toShareCode(terminal));
    await settle(edit);
    expect(edit.shadowRoot!.textContent).toContain('Dit thema heeft eigen CSS (5 regels)');
    const lines = [...edit.shadowRoot!.querySelectorAll('.css-line')] as HTMLElement[];
    expect(lines.map((line) => line.className.replace('css-line', '').trim())).toEqual(['', '', 'not-yet', 'never', '']);
    const saved = record<{ file: ThemeFile; cssFrom: string }>(edit, 'look-save');
    byText(edit, 'mh-button', 'Bewaren en gebruiken').click();
    expect(saved[0]).toMatchObject({ file: { css: terminal.css }, cssFrom: 'other' });
  }
});

test('a theme of someone else stays someone else’s when it is adjusted or tried out: only writing its CSS here makes it the house’s', async () => {
  const other: ThemeFile = { ...BUILT_IN[0]!, format: 2, id: 't-00000000000000c4', name: 'Van een ander', css: { version: 1, text: '::part(tile) { border-radius: 0 }' } };
  const look: PanelLook = { ...panelLook('edit'), device: { ...panelLook('edit').device, theme: other.id }, themes: [...BUILT_IN, other], cssFrom: { [other.id]: 'other' } };
  const panel = await mount<MhThemePanel>('mh-theme-panel', { open: true, look, presets: rustigExpressive.color.presets });
  const previews = record<{ file: ThemeFile | null; cssFrom?: string }>(panel, 'look-preview');
  byText(panel, 'mh-button', 'Bijstellen').click();
  await settle(panel);
  expect(previews.at(-1)).toMatchObject({ cssFrom: 'other' });
  const saved = record<{ file: ThemeFile; cssFrom?: string }>(panel, 'look-save');
  byText(panel, 'mh-button', 'Bewaren als mijn thema').click();
  expect(saved[0]).toMatchObject({ file: { css: other.css }, cssFrom: 'other' });
  await settle(panel);
  byText(panel, 'mh-button', 'Alle waarden').click();
  await settle(panel);
  expect(previews.at(-1)).toMatchObject({ cssFrom: 'other' });
});

test('taking in CSS that fakes an alarm says so; a line with only !important dropped still works', async () => {
  const { toShareCode } = await import('../../../src/theme/share-code');
  const fake: ThemeFile = { ...BUILT_IN[0]!, format: 2, id: 't-00000000000000c5', name: 'Nep', css: { version: 1, text: '::part(tile) {\n  background: #ffdad6 !important;\n}' } };
  const edit = await mount<MhThemePanel>('mh-theme-panel', { open: true, look: panelLook('edit'), presets: rustigExpressive.color.presets });
  byText(edit, 'mh-button', 'Thema van een ander').click();
  await settle(edit);
  input(edit.shadowRoot!.querySelector('mh-text-field')!, toShareCode(fake));
  await settle(edit);
  expect(edit.shadowRoot!.textContent).toContain('Gewone tegels lijken nu op een alarm');
  expect([...edit.shadowRoot!.querySelectorAll('.css-line')].map((line) => line.className)).toEqual(['css-line', 'css-line', 'css-line']);
});
