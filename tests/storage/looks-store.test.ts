import { expect, test } from 'vitest';
import type { DeviceLook } from '../../src/theme/choose';
import type { ThemeFile } from '../../src/theme/look';
import { emptyLooksDoc, normalizeLooksDoc } from '../../src/theme/looks-doc';
import { LIMITS_LOOKS } from '../../src/theme/theme-file';
import { LOOKS_KEY, createLooksStore, emptyStoredLooks } from '../../src/storage/looks-store';

const memory = () => {
  const items = new Map<string, string>();
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
};
const theme = (id: string, more: Partial<ThemeFile> = {}): ThemeFile => ({ format: 1, id, name: id, maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '', ...more });
const device: DeviceLook = { followStyle: false, followMode: true, theme: 't-avondlicht000000', seed: '#3a5ba9', mode: 'dark', fromBefore: true, helder: false, ignoreBoards: true };

test('nothing stored: no device look yet, no own themes, nothing of a hub', () => {
  expect(createLooksStore(memory()).load()).toEqual(emptyStoredLooks());
  expect(emptyStoredLooks()).toEqual({ version: 1, role: null, device: null, own: { themes: [], boards: {} }, hub: null, rescue: null });
});

test('what is saved comes back, under its own key beside the settings of 1.0.0', () => {
  const storage = memory();
  const store = createLooksStore(storage);
  const looks = { version: 1 as const, role: 'use' as const, device, own: { themes: [theme('t-avondlicht000000')], boards: { overview: 't-avondlicht000000' } }, hub: { revision: 3, house: { theme: 'glas', seed: null, mode: 'auto' as const }, themes: [theme('t-zee0000000000000')], boards: { 'd-abc': 'uitbundig' }, rescue: 2 }, rescue: 2 };
  expect(store.save(looks)).toBe(true);
  expect([...storage.items.keys()]).toEqual([LOOKS_KEY]);
  expect(LOOKS_KEY).toBe('dashboard.looks');
  expect(createLooksStore(storage).load()).toEqual(looks);
});

test('damaged or strange content is read field by field; what is wrong is left out', () => {
  const storage = memory();
  storage.setItem(LOOKS_KEY, JSON.stringify({
    version: 1, role: 'boss', device: { ...device, seed: 'red', mode: 'night', theme: 'url(x)', helder: 'yes' },
    own: { themes: [theme('t-avondlicht000000'), theme('rustig'), theme('t-avondlicht000000'), { format: 9 }], boards: { overview: 't-avondlicht000000', '__proto__': 'glas', 'x y': 'glas', 'room:abc': 'glas', 'd-1': 'neon' } },
    hub: { revision: -4, house: { theme: 7, seed: '#zzzzzz', mode: 'dark' }, themes: 'none', boards: [], rescue: 1.5 }, rescue: 'many',
  }));
  const looks = createLooksStore(storage).load();
  expect(looks.role).toBeNull();
  expect(looks.device).toEqual({ ...device, seed: null, mode: 'auto', theme: 'rustig', helder: false });
  expect(looks.own.themes.map((file) => file.id)).toEqual(['t-avondlicht000000']);
  expect(looks.own.boards).toEqual({ overview: 't-avondlicht000000' });
  expect(looks.hub).toEqual({ ...emptyLooksDoc(), house: { theme: 'rustig', seed: null, mode: 'dark' } });
  expect(looks.rescue).toBe(0);
  // what was kept before the rescues were counted: as if nothing was seen
  storage.setItem(LOOKS_KEY, JSON.stringify({ version: 1, role: 'edit', device, own: {}, hub: null }));
  expect(createLooksStore(storage).load().rescue).toBeNull();
  storage.setItem(LOOKS_KEY, '{not json');
  expect(createLooksStore(storage).load()).toEqual(emptyStoredLooks());
  storage.setItem(LOOKS_KEY, JSON.stringify({ version: 2, device }));
  expect(createLooksStore(storage).load()).toEqual(emptyStoredLooks());
});

test('no more themes than the limit are kept', () => {
  const many = Array.from({ length: LIMITS_LOOKS.themes + 5 }, (_, i) => theme(`t-${String(i).padStart(16, '0')}`));
  expect(normalizeLooksDoc({ revision: 1, house: {}, themes: many, boards: {} }).themes).toHaveLength(LIMITS_LOOKS.themes);
});

test('a storage that refuses to write is told, without an error', () => {
  const refusing = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
  expect(createLooksStore(refusing).save(emptyStoredLooks())).toBe(false);
  const unreadable = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };
  expect(createLooksStore(unreadable).load()).toEqual(emptyStoredLooks());
});
