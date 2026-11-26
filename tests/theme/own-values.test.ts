import { expect, test } from 'vitest';
import { BUILT_IN, type ThemeFile, type ThemeValues } from '../../src/theme/look';
import { ownLayers } from '../../src/theme/own-values';
import { computeLook, dangerRoles, sectionLook, styleOf } from '../../src/theme/styles';
import type { ShownDensity, ShownSettings } from '../../src/theme/types';

const rustig = BUILT_IN[0]!;
const settings = (more: Partial<ShownSettings> = {}): ShownSettings => ({ seed: '#3b6939', mode: 'light', density: 'comfortable', ...more });
const theme = (values: ThemeValues, base: ThemeFile['base'] = 'rustig'): ThemeFile => ({ ...rustig, format: 2, id: 't-0000000000000001', base, values });

test('a theme without values of its own computes exactly as before', () => {
  for (const file of BUILT_IN) {
    for (const density of ['comfortable', 'compact', 'phone'] as ShownDensity[]) {
      expect(computeLook(styleOf({ ...file, format: 2, values: {} }), settings({ density }), false)).toEqual(computeLook(styleOf(file), settings({ density }), false));
    }
  }
});

test('own values land in their layer, after what the style sets', () => {
  const file = theme({ both: { 'c-primary': '#7d4cff', 'font-family': 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif', 'shape-xl': '2px', 'density-tile-pad': '4px 6px', 'tile-on-bg': 'var(--c-tertiary)' } });
  const tokens = computeLook(styleOf(file), settings(), false);
  expect(tokens['--c-primary']).toBe('#7d4cff');
  expect(tokens['--font-family']).toBe('system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif');
  expect(tokens['--shape-xl']).toBe('2px');
  expect(tokens['--density-tile-pad']).toBe('4px 6px');
  expect(tokens['--tile-on-bg']).toBe('var(--c-tertiary)');
  expect(Object.keys(tokens).sort()).toEqual(Object.keys(computeLook(styleOf(rustig), settings(), false)).sort());
});

test('an own value wins over the knobs and the base it is on', () => {
  const file = { ...theme({ both: { 'tile-on-bg': '#123456', 'shape-xl': '3px' } }, 'uitbundig'), knobs: { roundness: 'square' as const } };
  const tokens = computeLook(styleOf(file), settings(), false);
  expect(tokens['--tile-on-bg']).toBe('#123456');
  expect(tokens['--shape-xl']).toBe('3px');
});

test('a density value holds for every density', () => {
  const file = theme({ both: { 'density-tile-gap': '2px' } });
  for (const density of ['comfortable', 'compact', 'phone'] as ShownDensity[]) expect(computeLook(styleOf(file), settings({ density }), false)['--density-tile-gap']).toBe('2px');
});

test('light and dark go before both, each in its own mode', () => {
  const file = theme({ both: { 'tile-bg': '#111111' }, dark: { 'tile-bg': '#222222' } });
  expect(computeLook(styleOf(file), settings({ mode: 'light' }), false)['--tile-bg']).toBe('#111111');
  expect(computeLook(styleOf(file), settings({ mode: 'dark' }), false)['--tile-bg']).toBe('#222222');
  expect(computeLook(styleOf(file), settings({ mode: 'auto' }), true)['--tile-bg']).toBe('#222222');
});

test('danger, the error roles and protected names never change, and unknown or wrong values never arrive', () => {
  const file = theme({ both: {
    'c-error': '#00ff00', 'tile-alert-bg': '#00ff00', 'target-min': '2px', 'motion-drift': '0s', 'layer-rest': '1',
    'tile-bg': 'url(x)', 'tile-fg': 'var(--tile-alert-bg)', 'tile-future': '1px', 'page-max-width': '99999px',
  } });
  const tokens = computeLook(styleOf(file), settings(), false);
  const plain = computeLook(styleOf(rustig), settings(), false);
  for (const name of ['--c-error', '--tile-alert-bg', '--target-min', '--motion-drift', '--layer-rest', '--tile-bg', '--tile-fg', '--page-max-width']) expect([name, tokens[name]]).toEqual([name, plain[name]]);
  expect(tokens['--tile-future']).toBeUndefined();
  expect(Object.entries(tokens).filter(([name]) => /^--c-(on-)?error/.test(name))).toEqual(Object.entries(dangerRoles('#3b6939', 'light', 0)));
});

test('a colour role is a colour of its own, never a reference that could go round', () => {
  const file = theme({ both: { 'c-primary': 'var(--c-secondary)', 'c-secondary': 'var(--c-primary)', 'c-tertiary': '#abcdef' } });
  const layers = ownLayers(file.values, 'light');
  expect(layers.roles).toEqual({ '--c-tertiary': '#abcdef' });
});

test('a section with a colour of its own keeps the own values of the parts', () => {
  const file = theme({ both: { 'tile-on-bg': 'var(--c-tertiary)', 'c-surface': '#fafafa' } });
  const section = sectionLook(styleOf(file), '#a6422a', 'light');
  expect(section['--tile-on-bg']).toBe('var(--c-tertiary)');
  expect(section['--c-surface']).not.toBe('#fafafa');
});
