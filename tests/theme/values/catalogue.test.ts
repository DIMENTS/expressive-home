import { expect, test } from 'vitest';
import { en } from '../../../src/i18n/en';
import { nl } from '../../../src/i18n/nl';
import { BASE_COMPONENTS, PROTECTED_NAMES } from '../../../src/theme/bases';
import { KNOB_VALUES, RUSTIG_KNOBS, type Knobs } from '../../../src/theme/look';
import { knobComponents, knobSystem } from '../../../src/theme/knobs';
import { rustigExpressive } from '../../../src/theme/rustig-expressive';
import { CATALOGUE, GROUPS, LISTED_NAMES, entryOf } from '../../../src/theme/values/catalogue';
import { checkValue } from '../../../src/theme/values/kinds';

test('the catalogue knows every value of the dashboard, once', () => {
  const names = CATALOGUE.map((entry) => entry.name);
  expect(new Set(names).size).toBe(names.length);
  for (const name of [...Object.keys(rustigExpressive.system), ...Object.keys(rustigExpressive.components), ...Object.keys(rustigExpressive.density.phone)]) {
    expect(names).toContain(name);
  }
  expect(names.filter((name) => name.startsWith('c-'))).toHaveLength(29);
});

test('the list holds about 150 names, none of them fixed, each with words in both languages', () => {
  expect(LISTED_NAMES.length).toBeGreaterThanOrEqual(140);
  expect(LISTED_NAMES.length).toBeLessThanOrEqual(160);
  const texts = [nl, en] as Record<string, string>[];
  for (const name of LISTED_NAMES) {
    const entry = entryOf(name)!;
    expect([name, entry.listed, entry.kind.kind === 'fixed']).toEqual([name, true, false]);
    for (const language of texts) {
      expect([name, typeof language[`values.part.${entry.words![0]}`]]).toEqual([name, 'string']);
      expect([name, typeof language[`values.role.${entry.words![1]}`]]).toEqual([name, 'string']);
    }
  }
  for (const group of GROUPS) for (const language of texts) expect([group, typeof language[`values.group.${group}`]]).toEqual([group, 'string']);
});

test('nothing protected, no error role and nothing against burn-in can be set', () => {
  for (const name of [...PROTECTED_NAMES.map((full) => full.slice(2)), 'c-error', 'c-on-error', 'c-error-container', 'c-on-error-container', 'rest-night-shift-x', 'rest-night-shift-y', 'motion-drift', 'ramp-hue', 'ramp-temperature', 'rest-warn-bg', 'rest-warn-fg']) {
    expect([name, entryOf(name)?.kind.kind ?? 'fixed']).toEqual([name, 'fixed']);
  }
});

test('a value referring to a density value is not set on its own, the density value is', () => {
  expect(entryOf('tile-pad')!.kind.kind).toBe('fixed');
  expect(entryOf('density-tile-pad')!.kind.kind).toBe('sizes');
});

test('every text the built-in styles and their knobs write is accepted by its own kind', () => {
  const written: [string, string][] = [];
  const add = (values: Record<string, string>): void => { for (const entry of Object.entries(values)) written.push(entry); };
  add(rustigExpressive.system);
  add(rustigExpressive.components);
  for (const density of Object.values(rustigExpressive.density)) add(density);
  for (const values of Object.values(BASE_COMPONENTS)) add(values);
  for (const knob of Object.keys(KNOB_VALUES) as (keyof Knobs)[]) {
    for (const value of KNOB_VALUES[knob]) {
      const knobs = { ...RUSTIG_KNOBS, [knob]: value } as Knobs;
      add(knobSystem(knobs));
      add(knobComponents(knobs));
    }
  }
  for (const [name, value] of written) {
    const entry = entryOf(name)!;
    if (entry.kind.kind === 'fixed') continue;
    expect([name, checkValue(entry.kind, value)]).toEqual([name, value]);
  }
});

test('the ranges hold the large and small values Rustig has itself', () => {
  expect(checkValue(entryOf('page-max-width')!.kind, '1560px')).toBe('1560px');
  expect(checkValue(entryOf('sheet-width')!.kind, '420px')).toBe('420px');
  expect(checkValue(entryOf('connect-art-offset')!.kind, '-56px')).toBe('-56px');
  expect(checkValue(entryOf('rest-pad-x')!.kind, '64')).toBe('64');
  expect(checkValue(entryOf('motion-wave')!.kind, '1.8s')).toBe('1.8s');
  expect(checkValue(entryOf('press-scale')!.kind, '0.5')).toBeNull();
});

test('the groups of names', () => {
  expect(entryOf('c-primary')!.group).toBe('colour');
  expect(entryOf('tile-on-bg')!.group).toBe('tiles');
  expect(entryOf('section-hero-bg')!.group).toBe('hero');
  expect(entryOf('density-tile-pad')!.group).toBe('space');
  expect(entryOf('chart-line')!.group).toBe('charts');
  expect(entryOf('button-filled-bg')!.group).toBe('buttons');
});

test('the empty base writes its own values with kinds that hold them, so any theme can choose them', () => {
  expect(checkValue(entryOf('hero-wave-scale')!.kind, '0')).toBe('0');
  expect(checkValue(entryOf('font-family')!.kind, 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif')).not.toBeNull();
  expect(checkValue(entryOf('shape-xl')!.kind, '0px')).toBe('0px');
});
