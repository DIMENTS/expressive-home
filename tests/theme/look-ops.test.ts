import { expect, test } from 'vitest';
import type { ThemeFile } from '../../src/theme/look';
import { applyLookOps, parseLookOps } from '../../src/theme/look-ops';
import { LIMITS } from '../../src/layout/types';
import { emptyLooksDoc, normalizeBoards } from '../../src/theme/looks-doc';
import { LIMITS_LOOKS } from '../../src/theme/theme-file';

const theme = (id: string, more: Partial<ThemeFile> = {}): ThemeFile => ({ format: 1, id, name: id, maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '', ...more });
const A = 't-aaaaaaaaaaaaaaaa';
const B = 't-bbbbbbbbbbbbbbbb';

test('operations from a device are checked: what is no operation stops all of them', () => {
  expect(parseLookOps([{ house: { theme: 'glas', seed: '#3A5BA9', mode: 'dark' } }, { save: theme(A) }, { remove: B }, { board: 'overview', theme: A }, { board: 'd-1', theme: null }])).toEqual([
    { house: { theme: 'glas', seed: '#3a5ba9', mode: 'dark' } }, { save: theme(A) }, { remove: B }, { board: 'overview', theme: A }, { board: 'd-1', theme: null },
  ]);
  for (const bad of [null, {}, 'x', [{}], [{ save: { format: 9 } }], [{ save: theme('rustig') }], [{ remove: 'rustig' }], [{ board: 'room:1', theme: 'glas' }], [{ board: 'd-1', theme: 'neon' }], [{ house: 'glas' }], [{ reset: true }], Array.from({ length: 21 }, () => ({ remove: A }))]) {
    expect(parseLookOps(bad)).toBeNull();
  }
});

test('the house, a theme, a dashboard: applied in order', () => {
  const doc = applyLookOps(emptyLooksDoc(), [{ save: theme(A) }, { house: { theme: A, seed: null, mode: 'auto' } }, { board: 'overview', theme: 'uitbundig' }]);
  expect(doc).toEqual({ revision: 0, house: { theme: A, seed: null, mode: 'auto' }, themes: [theme(A)], boards: { overview: 'uitbundig' }, rescue: 0 });
  expect(applyLookOps(doc, [{ save: theme(A, { name: 'Zee' }) }]).themes).toEqual([theme(A, { name: 'Zee' })]);
});

test('a theme that does not exist is never chosen; what else changes of the house does', () => {
  const doc = applyLookOps(emptyLooksDoc(), [{ house: { theme: B, seed: null, mode: 'dark' } }, { board: 'overview', theme: B }]);
  expect(doc).toEqual({ ...emptyLooksDoc(), house: { theme: 'rustig', seed: null, mode: 'dark' } });
});

test('a change of the house names only what changes: what another device or a flow changed meanwhile stays', () => {
  expect(parseLookOps([{ house: { mode: 'dark' } }, { house: { seed: '#3A5BA9' } }, { house: { seed: null, theme: 'glas' } }])).toEqual([
    { house: { mode: 'dark' } }, { house: { seed: '#3a5ba9' } }, { house: { seed: null, theme: 'glas' } },
  ]);
  for (const bad of [{}, { mode: 'night' }, { seed: 'red' }, { theme: 'neon' }, { theme: 'glas', colour: '#ffffff' }, { mode: undefined }]) {
    expect([bad, parseLookOps([{ house: bad }])]).toEqual([bad, null]);
  }
  const before = { ...emptyLooksDoc(), house: { theme: 'glas', seed: '#a6422a', mode: 'auto' as const } };
  expect(applyLookOps(before, [{ house: { mode: 'dark' } }]).house).toEqual({ theme: 'glas', seed: '#a6422a', mode: 'dark' });
  expect(applyLookOps(before, [{ house: { theme: 'uitbundig' } }, { house: { seed: null } }]).house).toEqual({ theme: 'uitbundig', seed: null, mode: 'auto' });
});

test('removing a theme that is in use: the house goes back to Rustig and the dashboards to the house', () => {
  const doc = applyLookOps(emptyLooksDoc(), [{ save: theme(A) }, { house: { theme: A, seed: '#a6422a', mode: 'dark' } }, { board: 'overview', theme: A }, { board: 'd-1', theme: 'glas' }]);
  expect(applyLookOps(doc, [{ remove: A }])).toEqual({ revision: 0, house: { theme: 'rustig', seed: '#a6422a', mode: 'dark' }, themes: [], boards: { 'd-1': 'glas' }, rescue: 0 });
});

test('no more themes than the limit; a theme that is there already is replaced', () => {
  let doc = emptyLooksDoc();
  for (let i = 0; i < LIMITS_LOOKS.themes + 3; i += 1) doc = applyLookOps(doc, [{ save: theme(`t-${String(i).padStart(16, '0')}`) }]);
  expect(doc.themes).toHaveLength(LIMITS_LOOKS.themes);
});

test('the original is never changed', () => {
  const doc = emptyLooksDoc();
  applyLookOps(doc, [{ save: theme(A) }, { house: { theme: A, seed: null, mode: 'dark' } }]);
  expect(doc).toEqual(emptyLooksDoc());
});

test('no more dashboards with a theme of their own than there can be dashboards: a new one takes the place of the oldest', () => {
  let doc = emptyLooksDoc();
  for (let i = 0; i < LIMITS.dashboards + 2; i += 1) doc = applyLookOps(doc, [{ board: `d-${i}`, theme: 'glas' }]);
  expect(Object.keys(doc.boards)).toEqual(Array.from({ length: LIMITS.dashboards }, (_, i) => `d-${i + 2}`));
  const changed = applyLookOps(doc, [{ board: 'd-5', theme: 'uitbundig' }]);
  expect([Object.keys(changed.boards).length, changed.boards['d-5'], changed.boards['d-2']]).toEqual([LIMITS.dashboards, 'uitbundig', 'glas']);
  const many = Object.fromEntries(Array.from({ length: LIMITS.dashboards + 10 }, (_, i) => [`d-${i}`, 'glas']));
  expect(Object.keys(normalizeBoards(many))).toEqual(Array.from({ length: LIMITS.dashboards }, (_, i) => `d-${i + 10}`));
});
