import { expect, test } from 'vitest';
import { computeTokens, sectionTokens } from '../../src/theme/engine';
import { BASES, BUILT_IN, KNOB_VALUES, RUSTIG_KNOBS, type KnobName, type Knobs, type ThemeFile } from '../../src/theme/look';
import { rustigExpressive } from '../../src/theme/rustig-expressive';
import { PROTECTED_NAMES, computeLook, dangerRoles, sectionLook, styleOf } from '../../src/theme/styles';
import type { ShownDensity, ShownSettings } from '../../src/theme/types';

const rustig = BUILT_IN[0]!;
const builtIn = (base: string): ThemeFile => BUILT_IN.find((file) => file.base === base)!;
const withKnobs = (knobs: Partial<Knobs>, base: ThemeFile = rustig): ThemeFile => ({ ...base, id: 't-0000000000000000', knobs });
const settings = (more: Partial<ShownSettings> = {}): ShownSettings => ({ seed: '#3b6939', mode: 'light', density: 'comfortable', ...more });
const DENSITIES: ShownDensity[] = ['comfortable', 'compact', 'phone'];

test('Rustig gives exactly the tokens of the dashboard as it was, for every colour, mode and density', () => {
  for (const { seed } of rustigExpressive.color.presets) {
    for (const mode of ['light', 'dark', 'auto'] as const) {
      for (const density of DENSITIES) {
        for (const dark of [false, true]) {
          expect(computeLook(styleOf(rustig), settings({ seed, mode, density }), dark)).toEqual(computeTokens(rustigExpressive, settings({ seed, mode, density }), dark));
        }
      }
    }
  }
});

test('Rustig gives exactly the section colours as they were', () => {
  for (const { seed } of rustigExpressive.color.presets) {
    for (const mode of ['light', 'dark'] as const) expect(sectionLook(styleOf(rustig), seed, mode)).toEqual(sectionTokens(rustigExpressive, seed, mode));
  }
});

test('the knobs of Rustig, set on purpose, change nothing either', () => {
  expect(computeLook(styleOf(withKnobs({ ...RUSTIG_KNOBS })), settings(), false)).toEqual(computeLook(styleOf(rustig), settings(), false));
});

const declared = new Set(Object.keys(computeTokens(rustigExpressive, settings(), false)));
/** What a style or knob may write: a colour, a size, a number, a reference, a mix or gradient of references, or a list of fonts. */
const VALUE = /^(#[0-9a-f]{6}|\d+(px)?|var\(--[a-z0-9-]+\)|color-mix\(in srgb, var\(--[a-z0-9-]+\)( \d+%)?, (transparent|var\(--[a-z0-9-]+\))\)|linear-gradient\(\d+deg(, var\(--[a-z0-9-]+\)( \d+%)?)+\)|("[A-Za-z ]+"|[A-Za-z-]+)(, ("[A-Za-z ]+"|[A-Za-z-]+))*)$/;

test('no style and no knob touches a protected name or a name Rustig does not declare', () => {
  const variants: ThemeFile[] = [...BUILT_IN];
  for (const base of BUILT_IN) {
    for (const [knob, values] of Object.entries(KNOB_VALUES)) for (const value of values) variants.push(withKnobs({ [knob]: value }, base));
  }
  for (const file of variants) {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = computeLook(styleOf(file), settings({ mode }), false);
      expect(Object.keys(tokens).sort()).toEqual([...declared].sort());
      const rustigTokens = computeLook(styleOf(rustig), settings({ mode }), false);
      for (const name of PROTECTED_NAMES) expect([file.base, file.knobs, name, tokens[name]]).toEqual([file.base, file.knobs, name, rustigTokens[name]]);
      expect(Object.entries(tokens).filter(([name]) => /^--c-(on-)?error/.test(name))).toEqual(Object.entries(dangerRoles('#3b6939', mode, styleOf(file).contrast)));
      for (const [name, value] of Object.entries(tokens)) {
        expect(value, name).not.toMatch(/url\(|[;{}]|expression|@import/i);
        if (value !== rustigTokens[name]) expect(value, name).toMatch(VALUE);
      }
    }
  }
});

test('every knob changes only what it is about', () => {
  const about: Record<KnobName, RegExp> = {
    roundness: /^--(shape-(xs|sm|md|lg|xl|2xl|full)|tile-radius-pressed)$/,
    strength: /^--c-/,
    contrast: /^--c-/,
    letter: /^--font-family$/,
    weight: /^--weight-(medium|strong)$/,
    surfaces: /^--(section|tile|chip|tile-icon|tile-cell|section-hero)-(bg|outline|outline-width)$/,
    background: /^--page-bg$/,
  };
  const before = computeLook(styleOf(rustig), settings(), false);
  for (const [knob, values] of Object.entries(KNOB_VALUES) as [KnobName, readonly unknown[]][]) {
    for (const value of values) {
      const after = computeLook(styleOf(withKnobs({ [knob]: value })), settings(), false);
      const changed = Object.keys(after).filter((name) => after[name] !== before[name]);
      if (value === RUSTIG_KNOBS[knob]) expect(changed).toEqual([]);
      else expect(changed.length, `${knob} ${String(value)}`).toBeGreaterThan(0);
      for (const name of changed) expect(name, `${knob} ${String(value)}`).toMatch(about[knob]);
    }
  }
});

test('each built-in style is its own: Uitbundig colours the tiles, Glas lets the page through, Helder draws lines', () => {
  const look = (base: string, mode: 'light' | 'dark' = 'light') => computeLook(styleOf(builtIn(base)), settings({ mode }), false);
  expect(look('uitbundig')['--tile-on-bg']).toBe('var(--c-primary)');
  expect(look('uitbundig')['--shape-xl']).not.toBe(look('rustig')['--shape-xl']);
  expect(look('uitbundig')['--c-primary']).not.toBe(look('rustig')['--c-primary']);
  expect(look('glas')['--page-bg']).toMatch(/^linear-gradient\(/);
  expect(look('glas')['--section-bg']).toMatch(/transparent\)$/);
  expect(look('helder')['--tile-outline-width']).not.toBe('0px');
  expect(look('helder')['--weight-strong']).toBe('800');
  for (const base of BASES) expect(look(base, 'dark')['--c-surface']).not.toBe(look(base)['--c-surface']);
});

test('a section re-declares a style’s own values that follow colour roles, so the tiles of a coloured section stay Uitbundig', () => {
  const section = sectionLook(styleOf(builtIn('uitbundig')), '#a6422a', 'light');
  expect(section['--tile-on-bg']).toBe('var(--c-primary)');
  expect(section['--c-primary']).toBe(computeLook(styleOf(builtIn('uitbundig')), settings({ seed: '#a6422a' }), false)['--c-primary']);
  expect(section['--c-error']).toBeUndefined();
});
