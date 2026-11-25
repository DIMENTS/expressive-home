import { expect, test } from 'vitest';
import { DEFAULT_HOUSE, chooseLook, deviceAfterUpdate, followHouse, shownSeed, type DeviceLook, type HouseLook } from '../../src/theme/choose';
import { BUILT_IN, type ThemeFile } from '../../src/theme/look';

const avond: ThemeFile = { format: 1, id: 't-avondlicht00000', name: 'Avondlicht', maker: '', base: 'glas', seed: '#6750a4', userSeed: false, knobs: {}, app: '' };
const zacht: ThemeFile = { format: 1, id: 't-zacht0000000000', name: 'Zacht', maker: '', base: 'rustig', seed: null, userSeed: true, knobs: { strength: 'soft' }, app: '' };
const themes = [...BUILT_IN, avond, zacht];
const house: HouseLook = { theme: 'uitbundig', seed: '#a6422a', mode: 'dark' };
const device = (more: Partial<DeviceLook> = {}): DeviceLook => ({
  followStyle: false, followMode: false, theme: 'glas', seed: '#3a5ba9', mode: 'light', fromBefore: false, helder: false, ignoreBoards: false, ...more,
});
const pick = (result: ReturnType<typeof chooseLook>) => [result.file.id, result.seed, result.mode, result.why];

test('a device that may edit shows its own choice, field by field, or the house', () => {
  expect(pick(chooseLook({ role: 'edit', device: device(), house, board: null, themes }))).toEqual(['glas', '#3a5ba9', 'light', 'device']);
  expect(pick(chooseLook({ role: 'edit', device: device({ followStyle: true }), house, board: null, themes }))).toEqual(['uitbundig', '#a6422a', 'light', 'house']);
  expect(pick(chooseLook({ role: 'edit', device: device({ followMode: true }), house, board: null, themes }))).toEqual(['glas', '#3a5ba9', 'dark', 'device']);
  expect(pick(chooseLook({ role: 'edit', device: device({ followStyle: true, followMode: true }), house, board: null, themes }))).toEqual(['uitbundig', '#a6422a', 'dark', 'house']);
});

test('a device that may only use follows the house in style, colour and light or dark, whatever it has stored', () => {
  expect(pick(chooseLook({ role: 'use', device: device(), house, board: null, themes }))).toEqual(['uitbundig', '#a6422a', 'dark', 'house']);
});

test('what a device that may only use chose before the update stays, until it follows the house', () => {
  const before = device({ fromBefore: true, theme: 'rustig', followMode: true });
  expect(pick(chooseLook({ role: 'use', device: before, house, board: null, themes }))).toEqual(['rustig', '#3a5ba9', 'dark', 'device']);
  expect(pick(chooseLook({ role: 'use', device: followHouse(before), house, board: null, themes }))).toEqual(['uitbundig', '#a6422a', 'dark', 'house']);
  expect(followHouse(before)).toMatchObject({ fromBefore: false, followStyle: true, followMode: true });
});

test('a dashboard with a theme of its own decides the style, unless the device ignores it or has Helder on', () => {
  for (const role of ['edit', 'use'] as const) {
    expect(pick(chooseLook({ role, device: device({ followStyle: true, followMode: true }), house, board: 't-avondlicht00000', themes }))).toEqual(['t-avondlicht00000', '#6750a4', 'dark', 'board']);
  }
  expect(pick(chooseLook({ role: 'edit', device: device({ ignoreBoards: true }), house, board: 't-avondlicht00000', themes }))).toEqual(['glas', '#3a5ba9', 'light', 'device']);
  expect(chooseLook({ role: 'use', device: device({ helder: true }), house, board: 't-avondlicht00000', themes }).file.id).toBe('helder');
});

test('a dashboard theme that keeps the user’s colour takes the colour of the device or the house', () => {
  expect(pick(chooseLook({ role: 'edit', device: device(), house, board: 't-zacht0000000000', themes }))).toEqual(['t-zacht0000000000', '#3a5ba9', 'light', 'board']);
  expect(pick(chooseLook({ role: 'use', device: device(), house, board: 't-zacht0000000000', themes }))).toEqual(['t-zacht0000000000', '#a6422a', 'dark', 'board']);
});

test('Helder is for every device: it keeps the colour and the light or dark it would have had', () => {
  expect(pick(chooseLook({ role: 'use', device: device({ helder: true }), house, board: null, themes }))).toEqual(['helder', '#a6422a', 'dark', 'house']);
  expect(pick(chooseLook({ role: 'edit', device: device({ helder: true }), house, board: null, themes }))).toEqual(['helder', '#3a5ba9', 'light', 'device']);
});

test('a theme that is gone falls through: dashboard, device, house, Rustig', () => {
  expect(pick(chooseLook({ role: 'edit', device: device({ theme: 't-gone000000000000' }), house, board: 't-gone000000000001', themes }))).toEqual(['uitbundig', '#a6422a', 'light', 'house']);
  expect(pick(chooseLook({ role: 'use', device: device(), house: { ...house, theme: 't-gone000000000000' }, board: null, themes }))).toEqual(['rustig', '#a6422a', 'dark', 'rustig']);
  expect(pick(chooseLook({ role: 'own', device: device({ theme: 't-gone000000000000' }), house: null, board: null, themes }))).toEqual(['rustig', '#3a5ba9', 'light', 'rustig']);
});

test('in a browser with its own key, or in the example house, there is no house: the device chooses everything', () => {
  expect(pick(chooseLook({ role: 'own', device: device({ followStyle: true, followMode: true }), house: null, board: null, themes }))).toEqual(['glas', '#3a5ba9', 'light', 'device']);
  expect(pick(chooseLook({ role: 'own', device: device(), house: null, board: 't-avondlicht00000', themes }))).toEqual(['t-avondlicht00000', '#6750a4', 'light', 'board']);
});

test('the house starts as Rustig, its own colour and automatic', () => {
  expect(DEFAULT_HOUSE).toEqual({ theme: 'rustig', seed: null, mode: 'auto' });
});

test('after the update every device looks exactly as before', () => {
  const plain = { seed: '#3b6939', mode: 'auto', density: 'comfortable' } as const;
  const coloured = { seed: '#a6422a', mode: 'dark', density: 'compact' } as const;
  for (const role of ['edit', 'use', 'own'] as const) {
    for (const before of [plain, coloured, { ...plain, mode: 'light' as const }, { ...coloured, mode: 'auto' as const }]) {
      const look = deviceAfterUpdate(before, role);
      const shown = chooseLook({ role, device: look, house: role === 'own' ? null : DEFAULT_HOUSE, board: null, themes });
      expect([role, before.seed, before.mode, shown.file.id, shown.seed ?? '#3b6939', shown.mode]).toEqual([role, before.seed, before.mode, 'rustig', before.seed, before.mode]);
    }
  }
  expect(deviceAfterUpdate(plain, 'edit')).toMatchObject({ followStyle: true, followMode: true, fromBefore: false });
  expect(deviceAfterUpdate(coloured, 'edit')).toMatchObject({ followStyle: false, followMode: false, fromBefore: false });
  expect(deviceAfterUpdate(coloured, 'use')).toMatchObject({ followStyle: false, followMode: false, fromBefore: true });
  expect(deviceAfterUpdate(plain, 'use')).toMatchObject({ followStyle: true, followMode: true, fromBefore: false });
});

test('a device whose role changes follows the house as a user, and gets its own choice back as an editor', () => {
  const own = device({ fromBefore: false });
  expect(chooseLook({ role: 'use', device: own, house, board: null, themes }).why).toBe('house');
  expect(chooseLook({ role: 'edit', device: own, house, board: null, themes }).why).toBe('device');
});

test('the colour a theme is shown in: its own when it keeps it, otherwise that of the device or the house', () => {
  const own: ThemeFile = { ...BUILT_IN[0]!, id: 't-aaaaaaaaaaaaaaaa', seed: '#6750a4', userSeed: false };
  expect([shownSeed(own, '#3a5ba9'), shownSeed({ ...own, userSeed: true }, '#3a5ba9'), shownSeed({ ...own, userSeed: true }, null), shownSeed(BUILT_IN[0]!, null)]).toEqual(['#6750a4', '#3a5ba9', '#6750a4', null]);
});
