import { expect, test } from 'vitest';
import { createSharedLooks as createOldHub } from '../fixtures/v1-2/shared-looks';
import { createLooksStore as createOldStore } from '../fixtures/v1-2/looks-store';
import { looksFromStore as oldFrom, looksToStore as oldTo } from '../fixtures/v1-2/full-themes';
import { looksFromStore, looksToStore } from '../../src/theme/full-themes';
import type { ThemeFile } from '../../src/theme/look';
import { applyLookOps, parseLookOps } from '../../src/theme/look-ops';
import { emptyLooksDoc, normalizeLooksDoc, withinTotal, type LooksDoc } from '../../src/theme/looks-doc';
import { CSS_LOOKS_KEY, createLooksStore, emptyStoredLooks } from '../../src/storage/looks-store';

const terminal: ThemeFile = { format: 2, id: 't-00000000000000c1', name: 'Terminal', maker: '', base: 'rustig', seed: null, userSeed: true, knobs: {}, app: '1.4.0', values: { both: { 'tile-bg': '#062010' } } };
const css = { version: 1, text: '::part(tile) { border-radius: 0 }' };
const doc = (): LooksDoc => applyLookOps({ ...emptyLooksDoc(), revision: 3 }, [{ save: terminal }, { css: { id: terminal.id, text: css.text, from: 'other' } }, { house: { theme: terminal.id } }]);

test('CSS goes with its own operation, with where it comes from; a save never touches it', () => {
  const first = doc();
  expect(first.themes[0]!.css).toEqual(css);
  expect(first.cssFrom).toEqual({ [terminal.id]: 'other' });
  // a save as a tab of 1.2 sends it, without CSS, keeps the CSS
  const saved = applyLookOps(first, [{ save: { ...terminal, name: 'Nieuw' } }]);
  expect(saved.themes[0]).toMatchObject({ name: 'Nieuw', css });
  // a save with CSS in it does not set it either
  expect(applyLookOps(first, [{ save: { ...terminal, css: { version: 1, text: 'x' } } }]).themes[0]!.css).toEqual(css);
  // changed in the editor of this house: from the house
  const house = applyLookOps(first, [{ css: { id: terminal.id, text: '::part(tile) { color: #7f7 }', from: 'house' } }]);
  expect([house.themes[0]!.css!.text, house.cssFrom]).toEqual(['::part(tile) { color: #7f7 }', { [terminal.id]: 'house' }]);
  // cleared, and removed with the theme
  expect(applyLookOps(first, [{ css: { id: terminal.id, text: null, from: 'house' } }]).themes[0]!.css).toBeUndefined();
  const removed = applyLookOps(first, [{ remove: terminal.id }]);
  expect([removed.themes, removed.cssFrom ?? {}]).toEqual([[], {}]);
  // CSS for a theme that is not there changes nothing
  expect(applyLookOps(first, [{ css: { id: 't-0000000000000999', text: 'x', from: 'house' } }])).toEqual(first);
});

test('the operation is checked: an own theme id, text or null, a known origin, within the limit', () => {
  expect(parseLookOps([{ css: { id: terminal.id, text: 'x', from: 'house' } }])).toHaveLength(1);
  for (const bad of [{ id: 'rustig', text: 'x', from: 'house' }, { id: terminal.id, text: 7, from: 'house' }, { id: terminal.id, text: 'x', from: 'me' }, { id: terminal.id, text: 'x'.repeat(70_000), from: 'house' }, { id: terminal.id, text: 'x', from: 'house', more: 1 }]) {
    expect([bad, parseLookOps([{ css: bad }])]).toEqual([bad, null]);
  }
});

test('the CSS counts in the limit of all themes together', () => {
  const big = applyLookOps(doc(), [{ css: { id: terminal.id, text: 'x'.repeat(60_000), from: 'house' } }]);
  expect(JSON.stringify(big.themes).length).toBeGreaterThan(60_000);
  expect(withinTotal(doc(), big)).toBe(true);
});

test('stored, the CSS has a key of its own, and comes back whole with its origin', () => {
  const stored = looksToStore(doc());
  expect(JSON.stringify(stored.doc)).not.toContain('border-radius');
  expect(JSON.stringify(stored.full)).not.toContain('border-radius');
  expect(stored.css).toEqual({ [terminal.id]: { ...css, from: 'other' } });
  expect(normalizeLooksDoc(looksFromStore(stored.doc, stored.full, stored.css))).toEqual(doc());
});

test('CSS of a theme that is gone falls away on loading', () => {
  const stored = looksToStore(doc());
  const back = normalizeLooksDoc(looksFromStore({ ...stored.doc, themes: [] }, stored.full, stored.css));
  expect([back.themes, back.cssFrom ?? {}]).toEqual([[], {}]);
});

test('a hub of 1.2 keeps the CSS: it never reads its key, and a change there loses nothing', () => {
  const stored = looksToStore(doc());
  const settings: Record<string, unknown> = { looks: structuredClone(stored.doc), full: structuredClone(stored.full), css: structuredClone(stored.css) };
  // a hub of 1.2 as it starts: its own two keys, never the third
  const old = createOldHub({ load: () => oldFrom(settings['looks'], settings['full']), save: (saved) => { const split = oldTo(saved); settings['looks'] = split.doc; settings['full'] = split.full; } });
  old.setHouseMode('dark');
  const back = normalizeLooksDoc(looksFromStore(settings['looks'], settings['full'], settings['css']));
  expect(back.themes[0]!.css).toEqual(css);
  expect(back.house.mode).toBe('dark');
});

test('a browser keeps the CSS under its own key, which a tab of 1.2 never touches', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
  const looks = { ...emptyStoredLooks(), own: { themes: [{ ...terminal, css }], boards: {}, cssFrom: { [terminal.id]: 'house' as const } }, hub: doc() };
  expect(createLooksStore(storage).save(looks)).toBe(true);
  expect(memory.has(CSS_LOOKS_KEY)).toBe(true);
  const old = createOldStore(storage);
  old.save({ ...old.load(), rescue: 5 });
  const back = createLooksStore(storage).load();
  expect(back.own.themes[0]!.css).toEqual(css);
  expect(back.own.cssFrom).toEqual({ [terminal.id]: 'house' });
  expect(back.hub!.themes[0]!.css).toEqual(css);
  expect(back.rescue).toBe(5);
});

test('this device remembers exactly which CSS of someone else it allowed', async () => {
  const { allowedCss, allowCss } = await import('../../src/storage/looks-store');
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); }, removeItem: (key: string) => { memory.delete(key); } };
  expect(allowedCss(storage, terminal.id, css.text)).toBe(false);
  allowCss(storage, terminal.id, css.text, true);
  expect(allowedCss(storage, terminal.id, css.text)).toBe(true);
  expect(allowedCss(storage, terminal.id, `${css.text} `)).toBe(false);
  allowCss(storage, terminal.id, css.text, false);
  expect(allowedCss(storage, terminal.id, css.text)).toBe(false);
});

test('CSS that makes the theme with it larger than a theme may be is not kept: the theme could not be taken in again', () => {
  const big = 'x'.repeat(45_000);
  const withValues = applyLookOps(emptyLooksDoc(), [{ save: { ...terminal, values: { both: Object.fromEntries(Array.from({ length: 500 }, (_, n) => [`n${n}`, 'y'.repeat(40)])) } } }]);
  const out = applyLookOps(withValues, [{ css: { id: terminal.id, text: big, from: 'house' } }]);
  expect(out.themes[0]!.css).toBeUndefined();
  // multi-byte letters count as the bytes they take
  expect(parseLookOps([{ css: { id: terminal.id, text: '€'.repeat(30_000), from: 'house' } }])).toBeNull();
});
