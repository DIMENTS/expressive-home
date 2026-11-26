import { expect, test } from 'vitest';
import { BUILT_IN } from '../../src/theme/look';
import { betterText, coloursOf, dangerStandsOut, legibility } from '../../src/theme/legible';
import { computeLook, styleOf } from '../../src/theme/styles';

const settings = { seed: '#3b6939', mode: 'light' as const, density: 'comfortable' as const };

test('a colour with see-through in it is read, and lies over what is beneath', () => {
  expect(coloursOf('#ff000080', {})).toEqual([{ r: 1, g: 0, b: 0, a: 128 / 255 }]);
  const tokens = { ...computeLook(styleOf(BUILT_IN[0]!), settings, false), '--tile-bg': '#00000000', '--tile-fg': '#ffffff' };
  // a clear tile shows the section beneath, which is light: white text on it is unreadable
  expect(legibility(tokens).find((result) => result.id === 'tile')!.ok).toBe(false);
});

test('danger stands out from a plain tile in every built-in style, and not when a theme makes them alike', () => {
  for (const file of BUILT_IN) {
    for (const mode of ['light', 'dark'] as const) expect([file.id, mode, dangerStandsOut(computeLook(styleOf(file), { ...settings, mode }, false))]).toEqual([file.id, mode, true]);
  }
  const tokens = computeLook(styleOf(BUILT_IN[0]!), settings, false);
  expect(dangerStandsOut({ ...tokens, '--tile-bg': tokens['--c-error-container']! })).toBe(false);
});

test('a better text colour is black or white, whichever reads best on that place', () => {
  const tokens = computeLook(styleOf(BUILT_IN[0]!), settings, false);
  expect(betterText({ ...tokens, '--tile-on-bg': '#7d4cff' }, 'tile-on')).toBe('#ffffff');
  expect(betterText({ ...tokens, '--tile-on-bg': '#ffeb3b' }, 'tile-on')).toBe('#111111');
  expect(betterText(tokens, 'no-such-place')).toBeNull();
});
