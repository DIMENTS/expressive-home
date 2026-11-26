import { expect, test, vi } from 'vitest';
import { rustigExpressive } from '../../src/theme/rustig-expressive';
import { COLOR_ROLES, applyTokens, colorTokens, computeTokens, isValidSeed, resolveMode, sectionTokens } from '../../src/theme/engine';
import type { ThemeSettings } from '../../src/theme/types';

const luminance = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi! + 0.05) / (lo! + 0.05); };
const settings: ThemeSettings = { seed: '#3b6939', mode: 'light', density: 'comfortable' };

test('every colour role is a hex value in both modes', () => {
  for (const mode of ['light', 'dark'] as const) {
    const tokens = colorTokens('#3b6939', mode, 0);
    for (const role of COLOR_ROLES) expect(tokens[`--c-${role}`]).toMatch(/^#[0-9a-f]{6}$/);
  }
});
test('text roles are readable on their backgrounds', () => {
  for (const mode of ['light', 'dark'] as const) {
    const t = colorTokens('#3b6939', mode, 0);
    expect(contrast(t['--c-on-primary']!, t['--c-primary']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--c-on-primary-container']!, t['--c-primary-container']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--c-on-surface']!, t['--c-surface']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--c-on-surface-variant']!, t['--c-surface-container-high']!)).toBeGreaterThanOrEqual(3);
  }
});
test('light is light and dark is dark, and the seed matters', () => {
  expect(luminance(colorTokens('#3b6939', 'light', 0)['--c-surface']!)).toBeGreaterThan(0.8);
  expect(luminance(colorTokens('#3b6939', 'dark', 0)['--c-surface']!)).toBeLessThan(0.05);
  expect(colorTokens('#3b6939', 'light', 0)['--c-primary']).not.toBe(colorTokens('#a6422a', 'light', 0)['--c-primary']);
});
test('compact changes only the density tokens', () => {
  const a = computeTokens(rustigExpressive, { seed: '#3b6939', mode: 'light', density: 'comfortable' }, false);
  const b = computeTokens(rustigExpressive, { seed: '#3b6939', mode: 'light', density: 'compact' }, false);
  const changed = Object.keys(a).filter((k) => a[k] !== b[k]);
  expect(changed.length).toBeGreaterThan(0);
  expect(changed.every((k) => k.startsWith('--density-'))).toBe(true);
});
test('a phone is a density of its own: the same names, other sizes', () => {
  const { comfortable, compact, phone } = rustigExpressive.density;
  expect(Object.keys(phone).sort()).toEqual(Object.keys(comfortable).sort());
  expect(Object.keys(compact).sort()).toEqual(Object.keys(comfortable).sort());
  const tokens = computeTokens(rustigExpressive, { seed: '#3b6939', mode: 'light', density: 'phone' }, false);
  expect([tokens['--density-tile-height'], tokens['--density-hero-size'], tokens['--density-greeting-size']]).toEqual(['60px', '56px', '26px']);
});
test('the theme offers the five preset colours', () => {
  expect(rustigExpressive.color.presets.map((p) => p.seed)).toEqual(['#3b6939', '#3a5ba9', '#6750a4', '#a6422a', '#a03b6c']);
});
test('the tokens carry the four shapes, scrim and shadow, and none of the old names', () => {
  const tokens = computeTokens(rustigExpressive, settings, false);
  for (const name of ['--shape-circle', '--shape-cookie', '--shape-clover', '--shape-flower']) expect(tokens[name]).toMatch(/^polygon\(/);
  expect(tokens['--c-scrim']).toMatch(/^#[0-9a-f]{6}$/);
  expect(tokens['--c-shadow']).toMatch(/^#[0-9a-f]{6}$/);
  for (const name of Object.keys(tokens)) expect(name).not.toMatch(/^--(r|fs|gap|pad)-|^--fw-strong$|^--tile-layout$/);
});
test('mode preference and invalid seeds', () => {
  expect(resolveMode('auto', true)).toBe('dark');
  expect(resolveMode('auto', false)).toBe('light');
  expect(resolveMode('light', true)).toBe('light');
  expect(isValidSeed('#3b6939')).toBe(true);
  expect(isValidSeed('groen')).toBe(false);
  expect(computeTokens(rustigExpressive, { ...settings, seed: 'groen' }, false)['--c-primary']).toBe(colorTokens('#3b6939', 'light', 0)['--c-primary']);
  expect(computeTokens(rustigExpressive, { ...settings, mode: 'auto' }, true)['--c-surface']).toBe(colorTokens('#3b6939', 'dark', 0)['--c-surface']);
});
test('applyTokens sets every token', () => {
  const set = vi.fn();
  applyTokens({ style: { setProperty: set } }, { '--a': '1', '--b': '2' });
  expect(set.mock.calls).toEqual([['--a', '1'], ['--b', '2']]);
});

test('a section palette has its own primary and keeps the error roles out', () => {
  const tokens = sectionTokens(rustigExpressive, '#3a5ba9', 'light');
  expect(tokens['--c-primary']).toBe(colorTokens('#3a5ba9', 'light', 0)['--c-primary']);
  expect(tokens['--c-primary']).not.toBe(colorTokens('#3b6939', 'light', 0)['--c-primary']);
  expect(Object.keys(tokens).some((name) => name.startsWith('--c-error') || name === '--c-on-error')).toBe(false);
  // layer 3 again, so it resolves against the section's own roles
  expect(tokens['--tile-on-bg']).toBe('var(--c-primary-container)');
  expect(tokens['--section-bg']).toBe('var(--c-surface)');
  // no layer 2: sizes and motion stay the dashboard's
  expect(tokens['--space-8']).toBeUndefined();
});

test('dark mode gives the dark palette of the same seed', () => {
  expect(sectionTokens(rustigExpressive, '#3a5ba9', 'dark')['--c-surface']).toBe(colorTokens('#3a5ba9', 'dark', 0)['--c-surface']);
});

test('the bars of the energy widget stand out from their tile: sun and use at least 3:1, for every seed and mode', () => {
  for (const seed of ['#3b6939', '#a6422a', '#3a5ba9', '#7a5c00']) {
    for (const mode of ['light', 'dark'] as const) {
      const t = colorTokens(seed, mode, 0);
      // the energy widget draws sun in primary and use in tertiary on the tile
      expect([seed, mode, contrast(t['--c-primary']!, t['--c-surface-container-high']!)]).toEqual([seed, mode, expect.any(Number)]);
      expect(contrast(t['--c-primary']!, t['--c-surface-container-high']!)).toBeGreaterThanOrEqual(3);
      expect(contrast(t['--c-tertiary']!, t['--c-surface-container-high']!)).toBeGreaterThanOrEqual(3);
    }
  }
  expect(rustigExpressive.components['widget-energy-sun']).toBe('var(--c-primary)');
  expect(rustigExpressive.components['widget-energy-use']).toBe('var(--c-tertiary)');
});
