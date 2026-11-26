import { expect, test } from 'vitest';
import { applyLookOps, parseLookOps } from '../../src/theme/look-ops';
import { emptyLooksDoc, normalizeLooksDoc, type LooksDoc } from '../../src/theme/looks-doc';
import { looksFromStore, looksToStore } from '../../src/theme/full-themes';
import type { ThemeFile } from '../../src/theme/look';

// A theme taken in from someone else is remembered as such, in the house's looks, apart from what older versions read.
const theme = (id: string): ThemeFile => ({ format: 1, id, name: 'Zee', maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '1.4.0' });
const a = 't-aaaaaaaaaaaaaaaa';
const b = 't-bbbbbbbbbbbbbbbb';
const doc = (): LooksDoc => applyLookOps({ ...emptyLooksDoc(), revision: 1 }, [{ save: theme(a) }, { save: theme(b) }]);

test('the operation is checked: an own theme id and on or off, nothing else', () => {
  expect(parseLookOps([{ takenIn: { id: a, on: true } }])).toEqual([{ takenIn: { id: a, on: true } }]);
  for (const bad of [{ takenIn: { id: 'glas', on: true } }, { takenIn: { id: a, on: 'yes' } }, { takenIn: { id: a } }, { takenIn: { id: a, on: true, more: 1 } }, { takenIn: true }]) {
    expect([bad, parseLookOps([bad])]).toEqual([bad, null]);
  }
});

test('a theme is marked and unmarked; a theme that is not there is not; removing the theme removes the mark', () => {
  let next = applyLookOps(doc(), [{ takenIn: { id: a, on: true } }, { takenIn: { id: 't-cccccccccccccccc', on: true } }]);
  expect(next.takenIn).toEqual([a]);
  next = applyLookOps(next, [{ takenIn: { id: a, on: true } }, { takenIn: { id: b, on: true } }]);
  expect(next.takenIn).toEqual([a, b]);
  next = applyLookOps(next, [{ takenIn: { id: b, on: false } }]);
  expect(next.takenIn).toEqual([a]);
  next = applyLookOps(next, [{ remove: a }]);
  expect(next.takenIn).toBeUndefined();
});

test('normalized: only themes that are there, once each', () => {
  const raw = { ...doc(), takenIn: [a, a, 't-cccccccccccccccc', 'glas', 3] };
  expect(normalizeLooksDoc(raw).takenIn).toEqual([a]);
  expect(normalizeLooksDoc({ ...doc(), takenIn: 'x' }).takenIn).toBeUndefined();
});

test('stored apart from the document older versions read, and read back', () => {
  const marked = applyLookOps(doc(), [{ takenIn: { id: a, on: true } }]);
  const stored = looksToStore(marked);
  expect(stored.doc).not.toHaveProperty('takenIn');
  expect(stored.takenIn).toEqual([a]);
  expect(normalizeLooksDoc(looksFromStore(stored.doc, stored.full, stored.css, stored.takenIn)).takenIn).toEqual([a]);
  // an older version wrote the document again without it: the mark stays
  expect(normalizeLooksDoc(looksFromStore(JSON.parse(JSON.stringify(stored.doc)), stored.full, stored.css, stored.takenIn)).takenIn).toEqual([a]);
  expect(normalizeLooksDoc(looksFromStore(stored.doc, stored.full, stored.css)).takenIn).toBeUndefined();
});
