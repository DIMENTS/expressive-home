import { expect, test } from 'vitest';
import type { ThemeFile } from '../../src/theme/look';
import { fileFormat, LIMITS_LOOKS, parseThemeFile, valueCount, written } from '../../src/theme/theme-file';
import { fromFileText, fromShareCode, toFileText, toShareCode } from '../../src/theme/share-code';
import { parseThemeFile as parseOld } from '../fixtures/v1-2/theme-file';

const withCss = (more: Partial<ThemeFile> = {}): ThemeFile => ({
  format: 2, id: 't-00000000000000c1', name: 'Terminal', maker: '', base: 'rustig', seed: null, userSeed: true, knobs: {}, app: '1.4.0',
  css: { version: 1, text: '::part(tile) { border-radius: 0 }' }, ...more,
});

test('a theme of format 2 carries its CSS, with the version of the parts', () => {
  expect(parseThemeFile(JSON.parse(JSON.stringify(withCss())))).toEqual({ ok: true, file: withCss(), dropped: [] });
});

test('CSS alone makes a theme format 2; without it, it stays as it was', () => {
  expect(fileFormat(withCss())).toBe(2);
  expect(fileFormat(withCss({ css: undefined }))).toBe(1);
  expect(written(withCss({ css: undefined })).format).toBe(1);
  expect(written(withCss({ css: { version: 1, text: '' } })).css).toBeUndefined();
});

test('CSS that is not text, or of no known shape, falls away and is named', () => {
  for (const css of [7, 'x', { version: 1 }, { version: 'one', text: 'x' }, { version: 0, text: 'x' }, { version: 1, text: 9 }]) {
    const result = parseThemeFile({ ...withCss(), css });
    expect([css, result.ok && result.file.css, result.ok && result.dropped]).toEqual([css, undefined, ['css']]);
  }
  expect(parseThemeFile({ ...withCss(), format: 1, base: 'rustig' }).ok && parseThemeFile({ ...withCss(), format: 1 }).ok).toBe(true);
});

test('a later version of the parts is kept as it is', () => {
  const result = parseThemeFile({ ...withCss(), css: { version: 2, text: '::part(new) {}' } });
  expect(result.ok && result.file.css).toEqual({ version: 2, text: '::part(new) {}' });
});

test('the CSS counts in the limit of a theme, and as one value', () => {
  expect(valueCount(withCss())).toBe(1);
  expect(parseThemeFile({ ...withCss(), css: { version: 1, text: 'x'.repeat(LIMITS_LOOKS.fileBytes) } })).toEqual({ ok: false, reason: 'too-big' });
});

test('a theme with CSS goes as EH2 and as a file, and comes back the same', () => {
  expect(toShareCode(withCss())).toMatch(/^EH2\./);
  expect(fromShareCode(toShareCode(withCss()))).toEqual({ ok: true, file: withCss(), dropped: [] });
  expect(fromFileText(toFileText(withCss()))).toEqual({ ok: true, file: withCss(), dropped: [] });
});

test('a page of 1.2 takes such a theme in without its CSS and names one value', () => {
  const result = parseOld(JSON.parse(JSON.stringify(withCss())));
  expect(result.ok && result.dropped).toEqual(['css']);
});
