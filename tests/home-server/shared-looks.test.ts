import { expect, test } from 'vitest';
import { createSharedLooks } from '../../src/home-server/shared-looks';
import type { ThemeFile } from '../../src/theme/look';
import { emptyLooksDoc, type LooksDoc } from '../../src/theme/looks-doc';

const A = 't-aaaaaaaaaaaaaaaa';
const theme = (id: string, name = id): ThemeFile => ({ format: 1, id, name, maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '' });

function bed(stored?: unknown) {
  const saved: LooksDoc[] = [];
  const looks = createSharedLooks({ load: () => stored, save: (doc) => { saved.push(doc); } });
  const heard: [number, boolean][] = [];
  looks.subscribe((revision, reset) => heard.push([revision, reset]));
  return { looks, saved, heard };
}

test('a hub without looks starts with Rustig for the house, and keeps what it had through a restart', () => {
  expect(bed().looks.get()).toEqual(emptyLooksDoc());
  const kept = { ...emptyLooksDoc(), revision: 4, themes: [theme(A)], house: { theme: A, seed: null, mode: 'dark' } };
  expect(bed(kept).looks.get()).toEqual(kept);
  expect(bed({ revision: 'x', house: 7 }).looks.get()).toEqual(emptyLooksDoc());
});

test('each change that changes something gets a new number, is kept and told', () => {
  const { looks, saved, heard } = bed();
  looks.apply([{ save: theme(A) }]);
  looks.apply([{ save: theme(A) }]);
  looks.apply([{ house: { theme: A, seed: null, mode: 'auto' } }]);
  expect(looks.get().revision).toBe(2);
  expect(saved.map((doc) => doc.revision)).toEqual([1, 2]);
  expect(heard).toEqual([[1, false], [2, false]]);
});

test('flow cards: the themes to choose from, a theme for the house by id, light or dark for the house', () => {
  const { looks } = bed();
  looks.apply([{ save: theme(A, 'Avondlicht') }]);
  expect(looks.choices('').map((choice) => choice.id)).toEqual(['rustig', 'uitbundig', 'glas', 'helder', A]);
  expect(looks.choices('avond').map((choice) => choice.name)).toEqual(['Avondlicht']);
  // in the language of the hub, and a theme without a name is never empty
  const B = 't-bbbbbbbbbbbbbbbb';
  looks.apply([{ save: theme(B, '') }]);
  expect(looks.choices('').map((choice) => choice.name)).toEqual(['Calm', 'Vivid', 'Glass', 'Clear', 'Avondlicht', 'Untitled theme']);
  expect(looks.choices('', 'nl').map((choice) => choice.name)).toEqual(['Rustig', 'Uitbundig', 'Glas', 'Helder', 'Avondlicht', 'Naamloos thema']);
  expect([looks.choices('glass').map((choice) => choice.id), looks.choices('naamloos', 'nl').map((choice) => choice.id)]).toEqual([['glas'], [B]]);
  expect(looks.setHouseTheme(A)).toBe(true);
  expect(looks.get().house.theme).toBe(A);
  expect(looks.setHouseTheme('t-gone000000000000')).toBe(false);
  looks.setHouseMode('dark');
  expect(looks.get().house).toMatchObject({ theme: A, mode: 'dark' });
});

test('the rescue puts the house and every dashboard in Rustig, keeps the themes, and is told as such', () => {
  const { looks, heard } = bed();
  looks.apply([{ save: theme(A) }, { house: { theme: A, seed: '#a6422a', mode: 'dark' } }, { board: 'overview', theme: A }]);
  looks.reset();
  expect(looks.get()).toMatchObject({ house: { theme: 'rustig', seed: null, mode: 'auto' }, boards: {}, themes: [theme(A)], rescue: 1 });
  expect(heard.at(-1)).toEqual([looks.get().revision, true]);
  // counted, also when nothing else changed, and kept through a restart
  looks.reset();
  expect(looks.get().rescue).toBe(2);
  expect(bed(looks.get()).looks.get().rescue).toBe(2);
  expect(bed({ ...looks.get(), rescue: -1 }).looks.get().rescue).toBe(0);
});
