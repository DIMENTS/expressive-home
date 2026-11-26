import { expect, test } from 'vitest';
import { applyLookOps as applyOld } from '../fixtures/v1-1/look-ops';
import { normalizeLooksDoc as normalizeOld } from '../fixtures/v1-1/looks-doc';
import { createLooksStore as createOldStore } from '../fixtures/v1-1/looks-store';
import { createSharedLooks as createOldHub } from '../fixtures/v1-1/shared-looks';
import { joinThemes, looksFromStore, looksToStore, shadowOf, splitThemes } from '../../src/theme/full-themes';
import type { ThemeFile } from '../../src/theme/look';
import { emptyLooksDoc, normalizeLooksDoc, type LooksDoc } from '../../src/theme/looks-doc';
import { FULL_LOOKS_KEY, LOOKS_KEY, createLooksStore, emptyStoredLooks } from '../../src/storage/looks-store';

const full: ThemeFile = {
  format: 2, id: 't-00000000000000aa', name: 'Strak', maker: 'x', base: 'leeg', seed: null, userSeed: true, knobs: {}, app: '1.2.0',
  values: { both: { 'tile-bg': '#ffffff' }, dark: { 'tile-bg': '#111111' } },
};
const plain: ThemeFile = { format: 1, id: 't-00000000000000bb', name: 'Zacht', maker: '', base: 'glas', seed: '#3a5ba9', userSeed: false, knobs: { strength: 'soft' }, app: '1.1.0' };
const doc = (): LooksDoc => ({ ...emptyLooksDoc(), revision: 4, themes: [plain, full], house: { theme: full.id, seed: null, mode: 'auto' }, boards: { main: full.id } });

test('the shadow of a theme is format 1 with the same id, name and knobs; the empty base becomes Rustig', () => {
  expect(shadowOf(full)).toEqual({ format: 1, id: full.id, name: 'Strak', maker: 'x', base: 'rustig', seed: null, userSeed: true, knobs: {}, app: '1.2.0' });
  expect(shadowOf(plain)).toEqual(plain);
});

test('split and join give back the same themes', () => {
  const { shadows, full: kept } = splitThemes([plain, full]);
  expect(shadows).toEqual([plain, shadowOf(full)]);
  expect(Object.keys(kept)).toEqual([full.id]);
  expect(joinThemes(shadows, kept)).toEqual([plain, full]);
});

test('a full theme without its shadow is gone; the name and knobs of the shadow win; a broken full theme leaves the shadow', () => {
  expect(joinThemes([plain], { [full.id]: full })).toEqual([plain]);
  const renamed = { ...shadowOf(full), name: 'Nieuw', knobs: { roundness: 'square' as const } };
  expect(joinThemes([renamed], { [full.id]: full })).toEqual([{ ...full, name: 'Nieuw', knobs: { roundness: 'square' } }]);
  expect(joinThemes([shadowOf(full)], { [full.id]: { nonsense: true } })).toEqual([shadowOf(full)]);
  const rebased = { ...shadowOf(full), base: 'uitbundig' as const };
  expect(joinThemes([rebased], { [full.id]: full })).toEqual([{ ...full, base: 'uitbundig' }]);
});

test('the looks of a hub go into two stores and come back whole', () => {
  const stored = looksToStore(doc());
  expect(stored.doc.themes).toEqual([plain, shadowOf(full)]);
  expect(normalizeLooksDoc(looksFromStore(stored.doc, stored.full))).toEqual(doc());
});

test('a hub of 1.1 keeps the theme, the house and the dashboard: going back loses nothing', () => {
  const stored = looksToStore(doc());
  const settings: Record<string, unknown> = { looks: JSON.parse(JSON.stringify(stored.doc)), full: JSON.parse(JSON.stringify(stored.full)) };
  // 1.1 starts, a flow changes light or dark, and 1.1 saves only what it knows
  const old = createOldHub({ load: () => settings['looks'], save: (saved) => { settings['looks'] = JSON.parse(JSON.stringify(saved)); } });
  expect(old.get().house.theme).toBe(full.id);
  old.setHouseMode('dark');
  expect(old.get().boards).toEqual({ main: full.id });
  // and 1.2 again
  const back = normalizeLooksDoc(looksFromStore(settings['looks'], settings['full']));
  expect(back.themes).toEqual([plain, full]);
  expect(back.house).toEqual({ theme: full.id, seed: null, mode: 'dark' });
});

test('what 1.1 does with the shadow, 1.2 follows: removed is removed, renamed is renamed', () => {
  const stored = looksToStore(doc());
  const removed = applyOld(normalizeOld(stored.doc), [{ remove: full.id }]);
  expect(normalizeLooksDoc(looksFromStore(removed, stored.full)).themes).toEqual([plain]);
  const renamed = applyOld(normalizeOld(stored.doc), [{ save: { ...shadowOf(full), name: 'Anders' } }]);
  expect(normalizeLooksDoc(looksFromStore(renamed, stored.full)).themes[1]).toEqual({ ...full, name: 'Anders' });
});

test('a browser keeps the full themes under a key of its own, which a tab of 1.1 never touches', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
  const looks = { ...emptyStoredLooks(), own: { themes: [plain, full], boards: { main: full.id } }, hub: doc() };
  expect(createLooksStore(storage).save(looks)).toBe(true);
  expect(memory.has(FULL_LOOKS_KEY)).toBe(true);
  expect(JSON.parse(memory.get(LOOKS_KEY)!).own.themes).toEqual([plain, shadowOf(full)]);
  // a tab of 1.1 that is still open reads and writes its own key again
  const old = createOldStore(storage);
  old.save({ ...old.load(), rescue: 3 });
  const back = createLooksStore(storage).load();
  expect(back.own.themes).toEqual([plain, full]);
  expect(back.hub!.themes).toEqual([plain, full]);
  expect(back.rescue).toBe(3);
});
