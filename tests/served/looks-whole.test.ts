import { afterEach, expect, test } from 'vitest';
import type { ThemeFile } from '../../src/theme/look';
import { bed, closeBeds, device, until } from './bed';

afterEach(closeBeds);

const avond: ThemeFile = { format: 1, id: 't-aaaaaaaaaaaaaaaa', name: 'Avondlicht', maker: '', base: 'glas', seed: '#6750a4', userSeed: false, knobs: { roundness: 'very-round' }, app: '1.1.0' };

test('the laptop chooses a theme for the house: the phone that may only use follows it at once', async () => {
  const b = await bed();
  const laptop = device(b);
  const phone = device(b);
  await laptop.pair('edit');
  await phone.pair('use');
  expect(phone.look()).toBe('rustig - auto');
  expect(laptop.controller.setHouse({ theme: 'glas', mode: 'dark' })).toBe(true);
  await until('the phone shows Glas', () => phone.look() === 'glas - dark');
  expect(b.looks.get().house).toEqual({ theme: 'glas', seed: null, mode: 'dark' });
});

test('the phone that may only use changes nothing of the house', async () => {
  const b = await bed();
  const phone = device(b);
  await phone.pair('use');
  expect([phone.controller.setHouse({ theme: 'glas' }), phone.controller.saveTheme(avond), phone.controller.setBoardTheme('overview', 'glas')]).toEqual([false, false, false]);
  expect(phone.controller.setDeviceLook({ theme: 'glas', followStyle: false })).toBe(false);
  expect(b.looks.get().revision).toBe(0);
});

test('a theme of the house and a dashboard with a theme of its own reach every device, also after a restart of the page', async () => {
  const b = await bed();
  const laptop = device(b);
  const tablet = device(b);
  await laptop.pair('edit');
  await tablet.pair('use');
  laptop.controller.saveTheme(avond);
  laptop.controller.setBoardTheme('overview', avond.id);
  await until('the tablet shows the dashboard in Avondlicht', () => tablet.look('overview') === `${avond.id} #6750a4 auto`);
  // the next page on that tablet knows before the hub answers
  const again = device(b, {}, Object.fromEntries(tablet.values));
  expect(again.look('overview')).toBe(`${avond.id} #6750a4 auto`);
});

test('a change while the wifi is away waits, is shown, and reaches the others when it is back', async () => {
  const b = await bed();
  const laptop = device(b);
  const phone = device(b);
  await laptop.pair('edit');
  await phone.pair('use');
  laptop.leave();
  laptop.controller.setHouse({ theme: 'helder' });
  expect(laptop.look()).toBe('helder - auto');
  await until('the change waits', () => laptop.looksWaiting() === 1);
  laptop.comeBack();
  await until('the phone shows Helder', () => phone.look() === 'helder - auto', 8000);
});

test('the rescue: every device follows the house again, which is Rustig', async () => {
  const b = await bed();
  const laptop = device(b);
  await laptop.pair('edit');
  laptop.controller.setDeviceLook({ theme: 'uitbundig', followStyle: false, seed: '#a6422a' });
  laptop.controller.setHouse({ theme: 'glas' });
  await until('the hub has Glas', () => b.looks.get().house.theme === 'glas');
  expect(laptop.look()).toBe('uitbundig #a6422a auto');
  b.looks.reset();
  await until('the laptop is in Rustig', () => laptop.look() === 'rustig - auto');
});

test('the rescue also reaches a device that was away when it was pressed', async () => {
  const b = await bed();
  const laptop = device(b);
  await laptop.pair('edit');
  laptop.controller.setDeviceLook({ theme: 'uitbundig', followStyle: false, seed: '#a6422a' });
  expect(laptop.look()).toBe('uitbundig #a6422a auto');
  laptop.leave();
  await until('the laptop lost the stream', () => !laptop.link.up());
  b.looks.reset();
  laptop.comeBack();
  await until('the laptop is in Rustig', () => laptop.look() === 'rustig - auto', 8000);
});

test('the rescue also reaches a page that was closed; a page that sees the house for the first time keeps its own choice', async () => {
  const b = await bed();
  // a rescue from before this browser was paired is not for it
  b.looks.reset();
  const laptop = device(b);
  await laptop.pair('edit');
  laptop.controller.setDeviceLook({ theme: 'uitbundig', followStyle: false, seed: '#a6422a' });
  const known = () => JSON.parse(laptop.values.get('dashboard.looks') ?? '{}').hub?.revision === b.looks.get().revision;
  await until('the laptop knows the looks of the house', known);
  expect(laptop.look()).toBe('uitbundig #a6422a auto');
  // the page is closed, and the owner rescues meanwhile
  laptop.leave();
  const kept = Object.fromEntries(laptop.values);
  b.looks.reset();
  const again = device(b, {}, kept);
  again.take(laptop);
  expect(again.look()).toBe('uitbundig #a6422a auto');
  await again.controller.start();
  await until('the page that opens again is in Rustig', () => again.look() === 'rustig - auto');
  laptop.comeBack();
});

test('a change of the house that waited, and light or dark from a flow meanwhile: both stay', async () => {
  const b = await bed();
  const laptop = device(b);
  const phone = device(b);
  await laptop.pair('edit');
  await phone.pair('use');
  laptop.leave();
  laptop.controller.setHouse({ theme: 'glas' });
  await until('the change waits', () => laptop.looksWaiting() === 1);
  // a flow card on the hub, while the laptop is away
  b.looks.setHouseMode('dark');
  laptop.comeBack();
  await until('the hub has both', () => b.looks.get().house.theme === 'glas', 8000);
  expect(b.looks.get().house).toEqual({ theme: 'glas', seed: null, mode: 'dark' });
  await until('the phone shows both', () => phone.look() === 'glas - dark');
  await until('the laptop shows both', () => laptop.look() === 'glas - dark');
});

test('a device that is unpaired forgets the looks of the house and keeps its own choice', async () => {
  const b = await bed();
  const laptop = device(b);
  const tablet = device(b);
  await laptop.pair('edit');
  await tablet.pair('edit');
  const stored = (page: typeof laptop) => JSON.parse(page.values.get('dashboard.looks') ?? '{}');
  for (const page of [laptop, tablet]) page.controller.setDeviceLook({ helder: true });
  laptop.controller.setHouse({ theme: 'glas' });
  await until('both know the house', () => [laptop, tablet].every((page) => stored(page).hub?.house.theme === 'glas'));
  // by itself
  await laptop.controller.disconnect();
  expect(stored(laptop)).toMatchObject({ role: null, hub: null, rescue: null, device: { helder: true } });
  // taken away by the owner: the tablet is the one that is left
  expect(b.pairing.list()).toHaveLength(1);
  b.pairing.remove(b.pairing.list()[0]!.id);
  await until('the tablet forgot the house', () => stored(tablet).hub === null);
  expect(stored(tablet)).toMatchObject({ role: null, rescue: null, device: { helder: true } });
});
