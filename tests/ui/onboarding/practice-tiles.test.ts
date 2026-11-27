// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import { createPractice } from '../../../src/onboarding/practice';
import { BUILT_IN } from '../../../src/theme/look';
import '../../../src/ui/onboarding/practice-tiles';
import type { MhPracticeTiles } from '../../../src/ui/onboarding/practice-tiles';
import type { MhHoldButton } from '../../../src/ui/parts/hold-button';
import { record } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

async function tiles(density: 'comfortable' | 'phone' = 'comfortable') {
  const practice = createPractice(createTranslate('nl'), (flush) => flush());
  const element = document.createElement('mh-practice-tiles') as MhPracticeTiles;
  Object.assign(element, { practice, density, file: BUILT_IN[1]!, seed: '#a6422a', mode: 'light' });
  document.body.append(element);
  await element.updateComplete;
  await new Promise((done) => { setTimeout(done, 0); });
  return { element, practice };
}

const tile = (element: MhPracticeTiles, tag: string) => element.shadowRoot!.querySelector<HTMLElement & { updateComplete: Promise<unknown> }>(tag)!;

test('the real tiles of a lamp and a lock, with the hub of the practice, in the chosen look', async () => {
  const { element, practice } = await tiles();
  const lamp = tile(element, 'mh-light-tile') as unknown as HTMLElement & { ctx: unknown; spec: unknown };
  const lock = tile(element, 'mh-guard-tile') as unknown as HTMLElement & { ctx: unknown; spec: unknown };
  expect([lamp.ctx, lamp.spec, lock.ctx, lock.spec]).toEqual([practice.ctx, practice.lamp, practice.ctx, practice.lock]);
  const area = element.shadowRoot!.querySelector<HTMLElement>('.area')!;
  expect(area.style.getPropertyValue('--c-primary')).not.toBe('');
});

test('a tap on the lamp is done; a short tap on the lock never asks the app: the question comes here, against the practice', async () => {
  const { element, practice } = await tiles();
  const asked = record(document, 'confirm-danger');
  const told = record(element, 'practice-ask');
  tile(element, 'mh-light-tile').shadowRoot!.querySelector<HTMLElement>('.tile')!.click();
  expect(practice.done().tap).toBe(true);
  const lock = tile(element, 'mh-guard-tile');
  await lock.updateComplete;
  const unlock = lock.shadowRoot!.querySelector<MhHoldButton>('mh-hold-button')!;
  unlock.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
  await element.updateComplete;
  expect([asked.length, told.length, practice.done().lock]).toEqual([0, 1, false]);
  const dialog = element.shadowRoot!.querySelector<HTMLElement & { open: boolean; heading: string }>('mh-dialog')!;
  expect([dialog.open, dialog.heading]).toEqual([true, 'Oefenslot ontgrendelen?']);
  const [cancel, ok] = [...dialog.querySelectorAll<HTMLElement>('mh-button')];
  // the tap after the one that asked does not answer it
  ok!.click();
  expect(practice.done().lock).toBe(false);
  await new Promise((done) => { setTimeout(done, 650); });
  cancel!.click();
  await element.updateComplete;
  expect([dialog.open, practice.done().lock]).toEqual([false, false]);
  unlock.dispatchEvent(new CustomEvent('ask', { bubbles: true, composed: true }));
  await element.updateComplete;
  await new Promise((done) => { setTimeout(done, 650); });
  ok!.click();
  await element.updateComplete;
  expect([dialog.open, practice.done().lock]).toEqual([false, true]);
});

test('holding the lock does it at once', async () => {
  const { element, practice } = await tiles();
  const lock = tile(element, 'mh-guard-tile');
  await lock.updateComplete;
  lock.shadowRoot!.querySelector<MhHoldButton>('mh-hold-button')!.dispatchEvent(new CustomEvent('go', { bubbles: true, composed: true }));
  expect(practice.done().lock).toBe(true);
});

test('a tile that asks for the window of its device is told about, not opened', async () => {
  const { element, practice } = await tiles();
  const told = record(element, 'practice-open');
  practice.ctx.actions.openDevice(practice.lamp.deviceId);
  expect(told).toHaveLength(1);
});

test('the hint of the slider and the menu of a tile stay inside; the hint is passed on as its own', async () => {
  const { element } = await tiles();
  const hints = record(document, 'hold-hint');
  const menus = record(document, 'tile-menu');
  const told = record(element, 'practice-hint');
  const lamp = tile(element, 'mh-light-tile');
  lamp.dispatchEvent(new CustomEvent('hold-hint', { bubbles: true, composed: true }));
  lamp.dispatchEvent(new CustomEvent('tile-menu', { bubbles: true, composed: true, detail: { tileId: 'x' } }));
  expect([hints.length, menus.length, told.length]).toEqual([0, 0, 1]);
});

test('on a phone the lamp is held and dimmed in the dimmer, as on the dashboard', async () => {
  const { element } = await tiles('phone');
  vi.useFakeTimers();
  const lamp = tile(element, 'mh-light-tile');
  const detail = { phase: 'start', tileId: 'x', box: { left: 0, top: 0, width: 10, height: 10 }, from: { left: 0, top: 0, width: 10, height: 10 }, level: 0.5, percent: 50, name: 'Oefenlamp', icon: 'lightbulb' };
  lamp.dispatchEvent(new CustomEvent('dim', { bubbles: true, composed: true, detail }));
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector('mh-dimmer')).not.toBeNull();
  lamp.dispatchEvent(new CustomEvent('dim', { bubbles: true, composed: true, detail: { ...detail, phase: 'end' } }));
  vi.advanceTimersByTime(1000);
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector('mh-dimmer')).toBeNull();
  vi.useRealTimers();
});

test('on a phone the lamp has the size of a phone, but the lock keeps its button: a narrow lock tile has none to hold', async () => {
  const { element } = await tiles('phone');
  const lamp = tile(element, 'mh-light-tile') as unknown as HTMLElement & { density: string };
  const lock = tile(element, 'mh-guard-tile') as unknown as HTMLElement & { density: string; updateComplete: Promise<unknown> };
  await lock.updateComplete;
  expect([lamp.density, lock.density]).toEqual(['phone', 'comfortable']);
  expect(lock.shadowRoot!.querySelector('mh-hold-button')).not.toBeNull();
});
