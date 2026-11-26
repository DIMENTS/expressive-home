import { expect, test } from 'vitest';
import { createLooksStore, emptyStoredLooks, type StoredLooks } from '../../../src/storage/looks-store';
import type { LookRole } from '../../../src/theme/choose';
import type { ThemeFile } from '../../../src/theme/look';
import { emptyLooksDoc } from '../../../src/theme/looks-doc';
import { LIMITS_LOOKS } from '../../../src/theme/theme-file';
import type { ThemeSettings } from '../../../src/theme/types';
import { createLooks } from '../../../src/ui/app/looks';

const avond: ThemeFile = { format: 1, id: 't-avondlicht000000', name: 'Avondlicht', maker: '', base: 'glas', seed: null, userSeed: true, knobs: {}, app: '' };

function bed(options: { role?: LookRole | null; theme?: Partial<ThemeSettings>; stored?: StoredLooks; demo?: boolean } = {}) {
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: () => {} };
  if (options.stored) createLooksStore(storage).save(options.stored);
  let role: LookRole | null = options.role === undefined ? 'own' : options.role;
  let theme: ThemeSettings = { seed: '#3b6939', mode: 'auto', density: 'comfortable', ...options.theme };
  let published = 0;
  const looks = createLooks({
    store: createLooksStore(storage), role: () => role, theme: () => theme, setTheme: (next) => { theme = next; },
    publish: () => { published += 1; }, demo: () => options.demo ?? false,
  });
  // as the controller does once its state is there
  looks.roleChanged();
  const stored = () => createLooksStore(storage).load();
  return { looks, stored, setRole: (next: LookRole | null) => { role = next; looks.roleChanged(); }, theme: () => theme, setTheme: (next: ThemeSettings) => { theme = next; }, published: () => published };
}

const shown = (looks: ReturnType<typeof createLooks>, board: string | null = null) => {
  const chosen = looks.chosen(board);
  return [chosen.file.id, chosen.seed, chosen.mode];
};

test('the first start after the update looks exactly as before, for every kind of device', () => {
  for (const role of ['own', 'edit', 'use'] as const) {
    for (const theme of [{ seed: '#3b6939', mode: 'auto' as const }, { seed: '#a6422a', mode: 'dark' as const }]) {
      const { looks, stored } = bed({ role, theme });
      const [id, seed, mode] = shown(looks);
      expect([role, id, seed ?? '#3b6939', mode]).toEqual([role, 'rustig', theme.seed, theme.mode]);
      expect(stored().device).not.toBeNull();
      expect(stored().role).toBe(role === 'own' ? null : role);
    }
  }
});

test('before the hub says what this device may, it looks as before and nothing is decided', () => {
  const { looks, stored, setRole } = bed({ role: null, theme: { seed: '#a6422a', mode: 'dark' } });
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
  expect(stored().device).toBeNull();
  setRole('use');
  expect(stored().device).toMatchObject({ fromBefore: true, followStyle: false, followMode: false });
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
});

test('a device that may only use cannot choose a style, colour or light or dark, only Helder', () => {
  const { looks, stored } = bed({ role: 'use' });
  expect(looks.setDevice({ theme: 'glas', followStyle: false })).toBe(false);
  expect(looks.setDevice({ mode: 'dark', followMode: false })).toBe(false);
  expect(looks.setDevice({ helder: true })).toBe(true);
  expect(stored().device).toMatchObject({ helder: true, followStyle: true, theme: 'rustig' });
  expect(looks.chosen(null).file.id).toBe('helder');
});

test('a device that may only use, with its own choice from before, can step over to the house, and not back', () => {
  const { looks, stored } = bed({ role: 'use', theme: { seed: '#a6422a', mode: 'dark' } });
  looks.adoptHub({ ...emptyLooksDoc(), revision: 2, house: { theme: 'glas', seed: '#3a5ba9', mode: 'light' } });
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
  looks.followHouse();
  expect(shown(looks)).toEqual(['glas', '#3a5ba9', 'light']);
  expect(stored().device).toMatchObject({ fromBefore: false });
  expect(looks.setDevice({ followStyle: false })).toBe(false);
});

test('a device with its own choice from before that may edit for a while follows the house once it may only use again', () => {
  const { looks, stored, setRole } = bed({ role: 'use', theme: { seed: '#a6422a', mode: 'dark' } });
  looks.adoptHub({ ...emptyLooksDoc(), revision: 1, house: { theme: 'glas', seed: '#3a5ba9', mode: 'light' } });
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
  setRole('edit');
  expect(stored().device).toMatchObject({ fromBefore: false });
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
  setRole('use');
  expect(shown(looks)).toEqual(['glas', '#3a5ba9', 'light']);
  // what it had is kept for when it may edit again
  setRole('edit');
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
});

test('a device of its own (own key, example house) chooses everything, and its colour and mode stay in the old settings too', () => {
  const { looks, theme, stored } = bed({ role: 'own' });
  expect(looks.state().house).toBeNull();
  expect(looks.setDevice({ theme: 'uitbundig', seed: '#6750a4', mode: 'dark' })).toBe(true);
  expect(shown(looks)).toEqual(['uitbundig', '#6750a4', 'dark']);
  expect(theme()).toMatchObject({ seed: '#6750a4', mode: 'dark', density: 'comfortable' });
  expect(looks.saveTheme(avond)).toBe(true);
  expect(looks.setBoardTheme('overview', avond.id)).toBe(true);
  expect(shown(looks, 'overview')).toEqual(['t-avondlicht000000', '#6750a4', 'dark']);
  expect(stored().own).toEqual({ themes: [avond], boards: { overview: avond.id } });
  expect(looks.removeTheme(avond.id)).toBe(true);
  expect(stored().own).toEqual({ themes: [], boards: {} });
  expect(shown(looks, 'overview')).toEqual(['uitbundig', '#6750a4', 'dark']);
});

test('the example house keeps no themes of its own when it is left', () => {
  const { looks, stored } = bed({ role: 'own', demo: true });
  looks.saveTheme(avond);
  expect(looks.state().themes.map((file) => file.id)).toContain(avond.id);
  expect(stored().own.themes).toEqual([]);
  looks.leaveDemo();
  expect(looks.state().themes.map((file) => file.id)).not.toContain(avond.id);
});

test('what was last heard of the hub is used at once on the next start', () => {
  const doc = { ...emptyLooksDoc(), revision: 5, house: { theme: 'glas', seed: null, mode: 'dark' as const }, themes: [avond], boards: { overview: avond.id } };
  const first = bed({ role: 'edit' });
  first.looks.adoptHub(doc);
  const again = bed({ role: null, stored: first.stored() });
  expect(again.looks.state().role).toBe('edit');
  expect(shown(again.looks)).toEqual(['glas', null, 'dark']);
  expect(shown(again.looks, 'overview')).toEqual([avond.id, null, 'dark']);
});

test('nothing is stored when nothing changes, and every change is published', () => {
  const { looks, published } = bed({ role: 'edit' });
  const before = published();
  looks.setDevice({ helder: true });
  expect(published()).toBe(before + 1);
  expect(emptyStoredLooks().version).toBe(1);
});

test('a page of 1.0.0 in another tab changes the colour or light or dark: this device takes it over', () => {
  const { looks, stored, setTheme } = bed({ role: 'own' });
  setTheme({ seed: '#a6422a', mode: 'dark', density: 'compact' });
  looks.reload();
  expect(shown(looks)).toEqual(['rustig', '#a6422a', 'dark']);
  expect(stored().device).toMatchObject({ seed: '#a6422a', mode: 'dark' });
});

function hubBed(role: LookRole) {
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: () => {} };
  const sent: unknown[] = [];
  let theme: ThemeSettings = { seed: '#3b6939', mode: 'auto', density: 'comfortable' };
  const looks = createLooks({ store: createLooksStore(storage), role: () => role, theme: () => theme, setTheme: (next) => { theme = next; }, publish: () => {}, demo: () => false, send: (ops) => sent.push(...ops) });
  looks.roleChanged();
  return { looks, sent };
}

test('a device that may edit changes the house: shown at once, and sent to the hub', () => {
  const { looks, sent } = hubBed('edit');
  expect(looks.saveTheme(avond)).toBe(true);
  expect(looks.setHouse({ theme: avond.id, mode: 'dark' })).toBe(true);
  expect(looks.setBoardTheme('overview', 'uitbundig')).toBe(true);
  expect(shown(looks)).toEqual([avond.id, null, 'dark']);
  expect(shown(looks, 'overview')).toEqual(['uitbundig', null, 'dark']);
  expect(sent).toEqual([{ save: avond }, { house: { theme: avond.id, mode: 'dark' } }, { board: 'overview', theme: 'uitbundig' }]);
  expect(looks.setHouse({ theme: 't-gone000000000000' })).toBe(false);
  expect(looks.removeTheme(avond.id)).toBe(true);
  expect(shown(looks)).toEqual(['rustig', null, 'dark']);
  // what does not change is not sent: the hub keeps what another device or a flow set meanwhile
  expect(looks.setHouse({ theme: 'rustig', seed: '#A6422A' })).toBe(true);
  expect(sent.at(-1)).toEqual({ house: { seed: '#a6422a' } });
});

test('a device that may only use changes nothing of the house, and sends nothing', () => {
  const { looks, sent } = hubBed('use');
  expect([looks.saveTheme(avond), looks.setHouse({ theme: 'glas' }), looks.setBoardTheme('overview', 'glas'), looks.removeTheme(avond.id)]).toEqual([false, false, false, false]);
  expect(sent).toEqual([]);
});

test('after the rescue a device follows the house again, also one that may edit', () => {
  const { looks } = hubBed('edit');
  looks.adoptHub({ ...emptyLooksDoc(), revision: 3, rescue: 2 });
  looks.setDevice({ theme: 'glas', followStyle: false, mode: 'dark', followMode: false, helder: true, ignoreBoards: true });
  looks.adoptHub({ ...emptyLooksDoc(), revision: 4, rescue: 2 });
  expect(looks.state().device).toMatchObject({ followStyle: false, followMode: false, ignoreBoards: true });
  looks.adoptHub({ ...emptyLooksDoc(), revision: 5, rescue: 3 });
  expect(looks.state().device).toMatchObject({ followStyle: true, followMode: true, helder: true, ignoreBoards: false });
});

test('a device that sees a house for the first time keeps its own choice, whatever number of rescues the house has', () => {
  const { looks } = hubBed('edit');
  looks.setDevice({ theme: 'glas', followStyle: false });
  looks.adoptHub({ ...emptyLooksDoc(), revision: 8, rescue: 4 });
  expect(looks.state().device).toMatchObject({ theme: 'glas', followStyle: false });
  looks.adoptHub({ ...emptyLooksDoc(), revision: 9, rescue: 5 });
  expect(looks.state().device).toMatchObject({ followStyle: true });
});

test('the rescue a device last saw is kept: it is rescued on the next start too, and only once', () => {
  const first = bed({ role: 'use', theme: { seed: '#a6422a', mode: 'dark' } });
  first.looks.adoptHub({ ...emptyLooksDoc(), revision: 1, rescue: 0 });
  expect(first.stored().device).toMatchObject({ fromBefore: true });
  const again = bed({ role: 'use', stored: first.stored() });
  again.looks.adoptHub({ ...emptyLooksDoc(), revision: 2, rescue: 1 });
  expect(again.stored()).toMatchObject({ rescue: 1, device: { fromBefore: false, followStyle: true, followMode: true } });
  again.looks.setDevice({ helder: true });
  again.looks.adoptHub({ ...emptyLooksDoc(), revision: 3, rescue: 1 });
  expect(again.stored().device).toMatchObject({ helder: true });
});

test('a browser that refuses to keep anything: what was chosen stays while the page is open, also when it reads again', () => {
  const items = new Map<string, string>();
  let refuse = true;
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { if (refuse) throw new Error('full'); items.set(key, value); }, removeItem: () => {} };
  let theme: ThemeSettings = { seed: '#3b6939', mode: 'auto', density: 'comfortable' };
  const looks = createLooks({ store: createLooksStore(storage), role: () => 'own', theme: () => theme, setTheme: (next) => { theme = next; }, publish: () => {}, demo: () => false });
  looks.roleChanged();
  looks.setDevice({ theme: 'glas', seed: '#a6422a' });
  looks.reload();
  expect(shown(looks)).toEqual(['glas', '#a6422a', 'auto']);
  // once it keeps things again, what another tab stored is read as before
  refuse = false;
  looks.setDevice({ helder: false });
  const other = { ...createLooksStore(storage).load(), device: { ...createLooksStore(storage).load().device!, theme: 'uitbundig' } };
  createLooksStore(storage).save(other);
  looks.reload();
  expect(shown(looks)).toEqual(['uitbundig', '#a6422a', 'auto']);
});

test('a house with as many themes as there may be takes no new one, and still a change of one it has', () => {
  const { looks, sent } = hubBed('edit');
  const many = Array.from({ length: LIMITS_LOOKS.themes }, (_, i) => ({ ...avond, id: `t-${String(i).padStart(16, '0')}` }));
  looks.adoptHub({ ...emptyLooksDoc(), revision: 1, themes: many });
  expect(looks.saveTheme(avond)).toBe(false);
  expect(looks.saveTheme({ ...many[0]!, name: 'Zee' })).toBe(true);
  expect(sent).toEqual([{ save: { ...many[0]!, name: 'Zee' } }]);
});

test('a theme with CSS goes to the hub with the CSS and where it comes from; without, the CSS is cleared', () => {
  const { looks, sent } = hubBed('edit');
  const terminal: ThemeFile = { ...avond, format: 2, id: 't-terminal00000000', css: { version: 1, text: '::part(tile) { border-radius: 0 }' } };
  expect(looks.saveTheme(terminal, 'other')).toBe(true);
  expect(sent).toEqual([{ save: terminal }, { css: { id: terminal.id, text: terminal.css!.text, from: 'other' } }]);
  expect(looks.state().cssFrom).toEqual({ [terminal.id]: 'other' });
  expect(looks.state().themes.find((item) => item.id === terminal.id)!.css).toEqual(terminal.css);
  expect(looks.saveTheme({ ...terminal, css: undefined })).toBe(true);
  expect(sent.at(-1)).toEqual({ css: { id: terminal.id, text: null, from: 'house' } });
  expect(looks.state().cssFrom).toEqual({});
});

test('a browser of its own keeps the CSS of its themes and where it comes from', () => {
  const { looks, stored } = bed();
  const terminal: ThemeFile = { ...avond, format: 2, id: 't-terminal00000000', css: { version: 1, text: '::part(tile) { border-radius: 0 }' } };
  expect(looks.saveTheme(terminal)).toBe(true);
  expect(stored().own.cssFrom).toEqual({ [terminal.id]: 'house' });
  expect(stored().own.themes[0]!.css).toEqual(terminal.css);
});

test('removing a theme or choosing a theme for a dashboard keeps where the CSS of the other themes comes from', () => {
  const { looks, stored } = bed();
  const mine: ThemeFile = { ...avond, id: 't-mine000000000000', format: 2, css: { version: 1, text: '::part(tile) { color: #111111 }' } };
  const theirs: ThemeFile = { ...avond, id: 't-theirs0000000000', format: 2, css: { version: 1, text: '::part(tile) { color: #222222 }' } };
  expect(looks.saveTheme(mine, 'house')).toBe(true);
  expect(looks.saveTheme(theirs, 'other')).toBe(true);
  expect(looks.saveTheme(avond)).toBe(true);
  expect(looks.setBoardTheme('overview', mine.id)).toBe(true);
  expect(stored().own.cssFrom).toEqual({ [mine.id]: 'house', [theirs.id]: 'other' });
  expect(looks.removeTheme(avond.id)).toBe(true);
  expect(stored().own.cssFrom).toEqual({ [mine.id]: 'house', [theirs.id]: 'other' });
  expect(looks.removeTheme(theirs.id)).toBe(true);
  expect(stored().own.cssFrom).toEqual({ [mine.id]: 'house' });
});

// ----- themes taken in from someone else -----

function marksBed(role: LookRole, demo = false) {
  const items = new Map<string, string>();
  const storage = { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
  const calls: unknown[][] = [];
  let theme: ThemeSettings = { seed: '#3b6939', mode: 'auto', density: 'comfortable' };
  const make = () => createLooks({ store: createLooksStore(storage), role: () => role, theme: () => theme, setTheme: (next) => { theme = next; }, publish: () => {}, demo: () => demo, send: (ops) => calls.push(ops) });
  const looks = make();
  looks.roleChanged();
  return { looks, items, calls, again: () => { const next = make(); next.roleChanged(); return next; } };
}
const zee: ThemeFile = { ...avond, id: 't-zee0000000000000', name: 'Zee' };

test('in a browser of its own a theme taken in is remembered under a key of its own, and forgotten with the theme', () => {
  const { looks, items, again } = marksBed('own');
  expect(looks.saveTheme(zee, 'other', true)).toBe(true);
  expect(looks.saveTheme(avond)).toBe(true);
  expect(looks.state().takenIn).toEqual([zee.id]);
  expect(JSON.parse(items.get('dashboard.looks.takenIn')!)).toEqual({ own: [zee.id], hub: [] });
  expect(items.get('dashboard.looks')).not.toContain('takenIn');
  // a page of 1.3 writes dashboard.looks again with only what it knows: the mark stays
  items.set('dashboard.looks', JSON.stringify({ ...JSON.parse(items.get('dashboard.looks')!), own: { themes: JSON.parse(items.get('dashboard.looks')!).own.themes, boards: {} } }));
  expect(again().state().takenIn).toEqual([zee.id]);
  expect(looks.setBoardTheme('overview', zee.id)).toBe(true);
  expect(looks.state().takenIn).toEqual([zee.id]);
  // saving it again without the mark (an edit of its own) keeps it: only removing forgets
  expect(looks.saveTheme({ ...zee, name: 'Zee 2' })).toBe(true);
  expect(looks.state().takenIn).toEqual([zee.id]);
  expect(looks.removeTheme(zee.id)).toBe(true);
  expect(looks.state().takenIn).toEqual([]);
});

test('the example house remembers it while it is open, and keeps nothing', () => {
  const { looks, items } = marksBed('own', true);
  expect(looks.saveTheme(zee, 'other', true)).toBe(true);
  expect(looks.state().takenIn).toEqual([zee.id]);
  expect(items.get('dashboard.looks.takenIn')).toBeUndefined();
});

test('on a hub the mark goes in a send of its own after the save, so a hub of 1.3 that refuses it still keeps the theme', () => {
  const { looks, calls, again } = marksBed('edit');
  expect(looks.saveTheme(zee, 'other', true)).toBe(true);
  expect(calls).toEqual([[{ save: zee }], [{ takenIn: { id: zee.id, on: true } }]]);
  expect(looks.state().takenIn).toEqual([zee.id]);
  // what is known of the house is kept for the next start, apart
  expect(again().state().takenIn).toEqual([zee.id]);
  // without the mark nothing extra is sent
  calls.length = 0;
  expect(looks.saveTheme(avond)).toBe(true);
  expect(calls).toEqual([[{ save: avond }]]);
});
