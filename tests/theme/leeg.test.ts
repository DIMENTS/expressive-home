import { expect, test } from 'vitest';
import { BUILT_IN, type ThemeFile } from '../../src/theme/look';
import { legibility } from '../../src/theme/legible';
import { computeLook, sectionLook, styleOf } from '../../src/theme/styles';
import { rustigExpressive } from '../../src/theme/rustig-expressive';
import type { ShownSettings } from '../../src/theme/types';

const leeg: ThemeFile = { ...BUILT_IN[0]!, format: 2, id: 't-0000000000000002', base: 'leeg' };
const settings = (more: Partial<ShownSettings> = {}): ShownSettings => ({ seed: rustigExpressive.color.defaultSeed, mode: 'light', density: 'comfortable', ...more });

test('the empty base has square corners, the system letter, no motion and a straight line in the hero', () => {
  const tokens = computeLook(styleOf(leeg), settings(), false);
  for (const shape of ['xs', 'sm', 'md', 'lg', 'xl', '2xl']) expect(tokens[`--shape-${shape}`]).toBe('0px');
  expect(tokens['--shape-full']).toBe('999px');
  expect(tokens['--shape-cookie']).toBe(tokens['--shape-circle']);
  expect(tokens['--font-family']).toMatch(/^system-ui/);
  for (const name of ['--motion-spatial', '--motion-effects', '--duration-spatial', '--motion-arrive']) expect(tokens[name]).toMatch(/^0m?s/);
  expect(tokens['--press-scale']).toBe('1');
  expect(tokens['--hero-wave-scale']).toBe('0');
  expect(tokens['--motion-drift']).toBe(rustigExpressive.system['motion-drift']);
});

test('the empty base has plain colours of its own: white and black with one blue accent', () => {
  const light = computeLook(styleOf(leeg), settings(), false);
  expect(light['--c-surface']).toBe('#ffffff');
  expect(light['--c-on-surface']).toBe('#111111');
  expect(light['--c-primary']).toBe('#1d4ed8');
  const dark = computeLook(styleOf(leeg), settings({ mode: 'dark' }), false);
  expect(dark['--c-surface']).toBe('#0d0d0f');
  expect(dark['--c-on-surface']).toBe('#f5f5f5');
});

test('a base colour chosen on the device or the house sets only the accent', () => {
  const tokens = computeLook(styleOf(leeg), settings({ seed: '#a6422a' }), false);
  expect(tokens['--c-primary']).toBe('#a6422a');
  expect(tokens['--c-surface']).toBe('#ffffff');
});

test('the knobs do nothing on the empty base', () => {
  const knobbed = { ...leeg, knobs: { roundness: 'very-round' as const, strength: 'vivid' as const, surfaces: 'outlined' as const } };
  expect(computeLook(styleOf(knobbed), settings(), false)).toEqual(computeLook(styleOf(leeg), settings(), false));
});

test('danger stays red on the empty base', () => {
  const tokens = computeLook(styleOf(leeg), settings(), false);
  const rustig = computeLook(styleOf(BUILT_IN[0]!), settings(), false);
  for (const name of ['--c-error', '--c-on-error', '--c-error-container', '--c-on-error-container', '--tile-alert-bg']) expect(tokens[name]).toBe(rustig[name]);
});

const SECTION_COLOURS = [...rustigExpressive.color.presets.map((preset) => preset.seed), '#ffeb3b', '#00e5ff', '#ffffff', '#000000', '#808080', '#ff00ff'];

test('every text of the empty base is legible, in light and dark and in every section colour', () => {
  for (const mode of ['light', 'dark'] as const) {
    const page = computeLook(styleOf(leeg), settings({ mode }), false);
    for (const result of legibility(page)) expect([mode, result.id, result.ok]).toEqual([mode, result.id, true]);
    for (const seed of SECTION_COLOURS) {
      const section = { ...page, ...sectionLook(styleOf(leeg), seed, mode) };
      expect(section['--c-primary']).toBe(seed);
      for (const result of legibility(section)) expect([mode, seed, result.id, result.ok]).toEqual([mode, seed, result.id, true]);
    }
  }
});

test('Rustig keeps its wave', () => {
  expect(computeLook(styleOf(BUILT_IN[0]!), settings(), false)['--hero-wave-scale']).toBe('1');
});
