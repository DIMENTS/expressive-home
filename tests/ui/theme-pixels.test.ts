import { expect, test } from 'vitest';
import { themePixels } from '../../src/ui/theme-pixels';

test('geometry drawn in code reads its sizes from the theme', () => {
  expect(themePixels('hero-wave-length')).toBe(28);
  expect(themePixels('hero-wave-amplitude')).toBe(3.2);
  expect(themePixels('banner-wave-width')).toBe(96);
  expect(themePixels('space-8')).toBe(8);
  expect(themePixels('target-min')).toBe(48);
});

test('a name that is no length in pixels is a mistake in the code', () => {
  expect(() => themePixels('hero-wave-fg')).toThrow();
  expect(() => themePixels('no-such-value')).toThrow();
});
