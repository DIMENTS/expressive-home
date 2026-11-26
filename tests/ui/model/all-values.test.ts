import { expect, test } from 'vitest';
import { createTranslate, t } from '../../../src/i18n';
import { BUILT_IN, type ThemeFile } from '../../../src/theme/look';
import { entryOf } from '../../../src/theme/values/catalogue';
import {
  createSteps, fixPoor, fractionOf, ownValue, poorList, setValue, shownRows, valueAt, wordsOf,
} from '../../../src/ui/model/all-values';

const base: ThemeFile = { ...BUILT_IN[0]!, format: 2, id: 't-0000000000000009', values: {} };

test('the words of a listed value, and the technical name of the rest', () => {
  expect(wordsOf(entryOf('tile-on-bg')!, t)).toBe('Tegel aan: achtergrond');
  expect(wordsOf(entryOf('tile-on-bg')!, createTranslate('en'))).toBe('Tile on: background');
  expect(wordsOf(entryOf('tile-meta-gap') ?? entryOf('tile-more-size')!, t)).toBeNull();
});

test('the rows: the list by group, the rest only when asked, a search by words or name', () => {
  const tiles = shownRows({ group: 'tiles', query: '', rest: false, t });
  expect(tiles.every((entry) => entry.listed && entry.group === 'tiles')).toBe(true);
  expect(tiles.map((entry) => entry.name)).toContain('tile-on-bg');
  const all = shownRows({ group: 'tiles', query: '', rest: true, t });
  expect(all.length).toBeGreaterThan(tiles.length);
  const lastListed = all.map((entry) => entry.listed).lastIndexOf(true);
  expect(all.findIndex((entry) => !entry.listed)).toBeGreaterThan(lastListed);
  expect(shownRows({ group: null, query: 'tegel aan', rest: false, t }).map((entry) => entry.name)).toContain('tile-on-bg');
  expect(shownRows({ group: null, query: 'tile-on-bg', rest: false, t }).map((entry) => entry.name)).toEqual(['tile-on-bg']);
  expect(shownRows({ group: null, query: 'zzz', rest: true, t })).toEqual([]);
});

test('a value goes into the layer that is chosen, checked by its kind; nothing or a wrong value takes it out', () => {
  let values = setValue({}, 'both', 'tile-on-bg', '#7D4CFF');
  expect(values).toEqual({ both: { 'tile-on-bg': '#7d4cff' } });
  values = setValue(values, 'dark', 'tile-on-bg', '#111111');
  expect(ownValue(values, 'dark', 'tile-on-bg')).toBe('#111111');
  expect(ownValue(values, 'light', 'tile-on-bg')).toBeNull();
  expect(setValue(values, 'both', 'tile-on-bg', 'url(x)')).toBe(values);
  expect(setValue(values, 'both', 'tile-alert-bg', '#000000')).toBe(values);
  expect(setValue(values, 'dark', 'tile-on-bg', null)).toEqual({ both: { 'tile-on-bg': '#7d4cff' } });
});

test('a slider runs over the range of its kind and back', () => {
  const pad = entryOf('tile-outline-width')!.kind;
  expect(valueAt(pad, 0)).toBe('0px');
  expect(fractionOf(pad, valueAt(pad, 0.5)!)).toBeCloseTo(0.5, 1);
  const weight = entryOf('weight-strong')!.kind;
  expect(valueAt(weight, 1)).toBe('900');
  expect(valueAt(weight, 0.5)).toBe('500');
  expect(fractionOf(entryOf('tile-on-bg')!.kind, '#ffffff')).toBeNull();
});

test('undo and redo go step by step, and a new step after undo drops what could be redone', () => {
  const steps = createSteps<string>('a');
  steps.push('b');
  steps.push('c');
  expect(steps.undo()).toBe('b');
  expect(steps.undo()).toBe('a');
  expect(steps.undo()).toBeNull();
  expect(steps.redo()).toBe('b');
  steps.push('d');
  expect(steps.redo()).toBeNull();
  expect(steps.undo()).toBe('b');
  expect([steps.canUndo, steps.canRedo]).toEqual([true, true]);
});

test('what is hard to read is found in light and dark, and Kleur aanpassen makes it readable', () => {
  const file = { ...base, values: { dark: { 'tile-on-bg': '#ffffff' } } };
  const poor = poorList(file, '#3b6939');
  expect(poor).toContainEqual({ mode: 'dark', id: 'tile-on' });
  const fixed = { ...file, values: fixPoor(file, '#3b6939', poor) };
  expect(poorList(fixed, '#3b6939')).toEqual([]);
  expect(fixed.values.dark!['tile-on-fg']).toBe('#111111');
});
