import { expect, test } from 'vitest';
import { ICON_NAMES } from '../../../src/ui/icons/icons';
import { ICON_LIBRARY, isLibraryIcon, searchIcons } from '../../../src/ui/icons/library';

const all = ICON_LIBRARY.flatMap((g) => g.icons);
const names = (groups: ReturnType<typeof searchIcons>) => groups.flatMap((g) => g.icons.map((i) => i.name));

test('the library has seven groups and about 120 icons, each one known to the icon set', () => {
  expect(ICON_LIBRARY.map((g) => g.group)).toEqual(['rooms', 'power', 'climate', 'security', 'media', 'outdoor', 'other']);
  expect(all.length).toBeGreaterThanOrEqual(115);
  expect(all.length).toBeLessThanOrEqual(125);
  expect(new Set(all.map((i) => i.name)).size).toBe(all.length);
  expect(all.filter((i) => !ICON_NAMES.includes(i.name))).toEqual([]);
});

test('every icon in the library has Dutch and English search words', () => {
  for (const icon of all) {
    expect([icon.name, icon.nl]).toEqual([icon.name, expect.stringMatching(/^[a-zà-ÿ0-9]+( [a-zà-ÿ0-9]+)*$/)]);
    expect([icon.name, icon.en]).toEqual([icon.name, expect.stringMatching(/^[a-z0-9]+( [a-z0-9]+)*$/)]);
  }
});

test('searching "water" finds water_drop, water, water_heater and water_pump', () => {
  for (const language of ['nl', 'en'] as const) {
    expect(names(searchIcons('water', language))).toEqual(expect.arrayContaining(['water_drop', 'water', 'water_heater', 'water_pump']));
  }
});

test('searching uses the words of the language given', () => {
  expect(names(searchIcons('slaapkamer', 'nl'))).toContain('bed');
  expect(names(searchIcons('slaapkamer', 'en'))).toEqual([]);
  expect(names(searchIcons('bedroom', 'en'))).toContain('bed');
});

test('searching is case-insensitive and also matches the icon name', () => {
  expect(names(searchIcons('  KEUKEN ', 'nl'))).toContain('kitchen');
  expect(names(searchIcons('Solar_Power', 'nl'))).toEqual(['solar_power']);
});

test('several words must all match', () => {
  expect(names(searchIcons('lamp groep', 'nl'))).toEqual(['light_group']);
});

test('an empty query gives every group; a query without a match gives none', () => {
  expect(searchIcons('', 'nl')).toEqual(ICON_LIBRARY.map((g) => ({ group: g.group, icons: [...g.icons] })));
  expect(searchIcons('   ', 'en')).toHaveLength(7);
  expect(searchIcons('zzzz', 'nl')).toEqual([]);
});

test('isLibraryIcon refuses a name outside the library', () => {
  expect(isLibraryIcon('water_pump')).toBe(true);
  expect(isLibraryIcon('close')).toBe(false);
  expect(isLibraryIcon('__proto__')).toBe(false);
  expect(isLibraryIcon('constructor')).toBe(false);
  expect(isLibraryIcon('does_not_exist')).toBe(false);
});
