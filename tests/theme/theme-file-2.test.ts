import { expect, test } from 'vitest';
import type { ThemeFile } from '../../src/theme/look';
import { fileFormat, LIMITS_LOOKS, parseThemeFile, valueCount } from '../../src/theme/theme-file';
import { fromFileText, fromShareCode, toFileText, toShareCode } from '../../src/theme/share-code';

const two = (more: Partial<ThemeFile> = {}): ThemeFile => ({
  format: 2, id: 't-0123456789abcdef', name: 'Strak', maker: '', base: 'leeg', seed: null, userSeed: true, knobs: {}, app: '1.2.0',
  values: { both: { 'tile-bg': '#ffffff', 'tile-radius': '4px' }, dark: { 'tile-bg': '#111111' } }, ...more,
});

test('a theme of format 2 comes back the same, with its values and the empty base', () => {
  expect(parseThemeFile(JSON.parse(JSON.stringify(two())))).toEqual({ ok: true, file: two(), dropped: [] });
});

test('the empty base and values belong to format 2 only', () => {
  expect(parseThemeFile({ ...two(), format: 1 })).toEqual({ ok: false, reason: 'too-new' });
  const result = parseThemeFile({ ...two(), format: 1, base: 'rustig' });
  expect(result.ok && result.file.values).toBeUndefined();
  expect(result.ok && result.dropped).toEqual(['values']);
});

test('names it does not know are kept as they are; a wrong name or value falls away and is named', () => {
  const result = parseThemeFile({
    ...two(),
    values: {
      both: { 'tile-glow-future': '3px', 'Tile-Bg': '#fff', '--tile-bg': '#fff', ['x'.repeat(65)]: '1', 'tile-fg': 7, 'page-bg': 'a'.repeat(201) },
      light: 'nope', sepia: { 'tile-bg': '#000' },
    },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.file.values).toEqual({ both: { 'tile-glow-future': '3px' } });
  expect(result.dropped.sort()).toEqual([
    'values.both.--tile-bg', 'values.both.Tile-Bg', `values.both.${'x'.repeat(65)}`, 'values.both.page-bg', 'values.both.tile-fg', 'values.light', 'values.sepia',
  ].sort());
});

test('values that could reach the prototype stay out', () => {
  const raw = JSON.parse('{"format":2,"id":"t-0123456789abcdef","name":"x","maker":"","base":"leeg","seed":null,"userSeed":true,"app":"","knobs":{},"values":{"__proto__":{"a":"1"},"both":{"__proto__":"1","constructor":"2"}}}');
  const result = parseThemeFile(raw);
  expect(result.ok).toBe(true);
  expect(({} as Record<string, unknown>)['a']).toBeUndefined();
  expect(result.ok && result.file.values).toEqual({ both: { constructor: '2' } });
});

test('a layer keeps at most its limit of names', () => {
  const many = Object.fromEntries(Array.from({ length: LIMITS_LOOKS.valuesPerLayer + 5 }, (_, n) => [`n${n}`, '1px']));
  const result = parseThemeFile({ ...two(), values: { both: many } });
  expect(result.ok && Object.keys(result.file.values!.both!).length).toBe(LIMITS_LOOKS.valuesPerLayer);
  expect(result.ok && result.dropped.length).toBe(5);
});

test('empty layers are left out', () => {
  const result = parseThemeFile({ ...two(), values: { both: {}, light: { 'tile-bg': '#fff' } } });
  expect(result.ok && result.file.values).toEqual({ light: { 'tile-bg': '#fff' } });
});

test('a theme is written as format 2 only when it needs to be', () => {
  expect(fileFormat(two())).toBe(2);
  expect(fileFormat(two({ values: undefined }))).toBe(2);
  expect(fileFormat(two({ base: 'glas' }))).toBe(2);
  expect(fileFormat(two({ base: 'glas', values: undefined }))).toBe(1);
  expect(fileFormat(two({ base: 'glas', values: {} }))).toBe(1);
});

test('the number of values counts its own values too', () => {
  expect(valueCount(two())).toBe(3);
});

test('a code of format 2 starts with EH2 and comes back the same, as does a file', () => {
  const code = toShareCode(two());
  expect(code).toMatch(/^EH2\.[A-Za-z0-9_-]+\.[0-9a-z]+$/);
  expect(fromShareCode(code)).toEqual({ ok: true, file: two(), dropped: [] });
  expect(fromFileText(toFileText(two()))).toEqual({ ok: true, file: two(), dropped: [] });
});

test('a theme that needs no format 2 is written as format 1 with EH1', () => {
  const plain = two({ base: 'glas', values: undefined });
  expect(toShareCode(plain)).toMatch(/^EH1\./);
  const back = fromShareCode(toShareCode(plain));
  expect(back.ok && back.file).toEqual({ ...plain, format: 1 });
  expect(JSON.parse(toFileText(plain)).format).toBe(1);
});

test('a code of format 3 is too new', () => {
  const code = toShareCode(two()).replace(/^EH2/, 'EH3');
  expect(fromShareCode(code)).toEqual({ ok: false, reason: 'too-new' });
});

test('a theme just under the limit comes back from its own file, which is written with room', () => {
  const layer = (from: number) => Object.fromEntries(Array.from({ length: 600 }, (_, n) => [`n${from + n}`, 'x'.repeat(21)]));
  const file = two({ values: { both: layer(0), light: layer(600), dark: layer(1200) } });
  expect(new TextEncoder().encode(JSON.stringify(file)).length).toBeLessThan(LIMITS_LOOKS.fileBytes);
  const text = toFileText(file);
  expect(text.length).toBeGreaterThan(LIMITS_LOOKS.fileBytes);
  expect(fromFileText(text).ok).toBe(true);
});
