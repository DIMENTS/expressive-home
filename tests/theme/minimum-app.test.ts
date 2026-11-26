import { expect, test } from 'vitest';
import type { ThemeFile } from '../../src/theme/look';
import { GALLERY_CODE_LIMIT, LIMITS_LOOKS, minimumApp } from '../../src/theme/theme-file';

const theme = (more: Partial<ThemeFile> = {}): ThemeFile => ({
  format: 1, id: 't-0123456789abcdef', name: 'Avondlicht', maker: '', base: 'glas', seed: '#3a5ba9', userSeed: false, knobs: { roundness: 'square' }, app: '1.3.0', ...more,
});

test('a style with knobs and a colour needs 1.1.0', () => {
  expect(minimumApp(theme())).toBe('1.1.0');
  expect(minimumApp(theme({ knobs: {}, seed: null }))).toBe('1.1.0');
});

test('values of its own or the empty base need 1.2.0', () => {
  expect(minimumApp(theme({ format: 2, values: { both: { 'c-primary': '#112233' } } }))).toBe('1.2.0');
  expect(minimumApp(theme({ format: 2, base: 'leeg' }))).toBe('1.2.0');
  expect(minimumApp(theme({ format: 2, values: {} }))).toBe('1.1.0');
});

test('CSS of its own needs 1.3.0, whatever else it has; blank CSS does not count', () => {
  expect(minimumApp(theme({ format: 2, css: { version: 1, text: 'mh-app::part(tile) { color: red; }' } }))).toBe('1.3.0');
  expect(minimumApp(theme({ format: 2, base: 'leeg', css: { version: 1, text: 'mh-app::part(tile) { color: red; }' } }))).toBe('1.3.0');
  expect(minimumApp(theme({ format: 2, css: { version: 1, text: '  \n ' } }))).toBe('1.1.0');
});

test('the gallery takes codes up to 60 000 characters, below what the app itself takes', () => {
  expect(GALLERY_CODE_LIMIT).toBe(60_000);
  expect(GALLERY_CODE_LIMIT).toBeLessThan(LIMITS_LOOKS.fileBytes * 2);
});
