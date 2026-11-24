// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import type { MhStepper } from '../../../src/ui/parts/stepper';
import '../../../src/ui/parts/stepper';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const props = { value: '21,5', unit: '°', spoken: 'Woonkamer naar 21,5°', less: 'Woonkamer kouder', more: 'Woonkamer warmer' };
async function setup(extra: Record<string, unknown> = {}) {
  const element = await mount<MhStepper>('mh-stepper', { ...props, ...extra });
  const [less, more] = [...element.shadowRoot!.querySelectorAll('button')] as [HTMLButtonElement, HTMLButtonElement];
  return { element, less, more, steps: record<{ steps: number }>(element, 'step') };
}

test('it shows the value between a button for less and one for more', async () => {
  const s = await setup();
  expect(inside(s.element, '.value').textContent!.replace(/\s/g, '')).toBe('21,5°');
  expect([s.less.getAttribute('aria-label'), s.more.getAttribute('aria-label')]).toEqual(['Woonkamer kouder', 'Woonkamer warmer']);
});

test('every tap is one step', async () => {
  const s = await setup();
  s.more.click();
  s.more.click();
  s.less.click();
  expect(s.steps).toEqual([{ steps: 1 }, { steps: 1 }, { steps: -1 }]);
});

test('at the end of the range its button is off, without losing the focus', async () => {
  const s = await setup({ atMost: true });
  s.more.focus();
  s.more.click();
  expect([s.steps, s.more.getAttribute('aria-disabled'), s.less.getAttribute('aria-disabled')]).toEqual([[], 'true', 'false']);
  expect(s.element.shadowRoot!.activeElement).toBe(s.more);
  s.element.atMost = false;
  s.element.atLeast = true;
  await settle(s.element);
  s.less.click();
  s.more.click();
  expect(s.steps).toEqual([{ steps: 1 }]);
});

test('a value that is stepped to is said; one that comes by itself is not', async () => {
  const s = await setup();
  const said = () => inside(s.element, '[role="status"]').textContent;
  expect(said()).toBe('');
  s.element.value = '22';
  s.element.spoken = 'Woonkamer naar 22°';
  await settle(s.element);
  expect(said()).toBe('');
  s.more.click();
  s.element.value = '22,5';
  s.element.spoken = 'Woonkamer naar 22,5°';
  await settle(s.element);
  expect(said()).toBe('Woonkamer naar 22,5°');
  // the next one that comes by itself
  s.element.value = '18';
  s.element.spoken = 'Woonkamer naar 18°';
  await settle(s.element);
  expect(said()).toBe('');
});

test('a press on it is no press on what is around it', async () => {
  const s = await setup();
  const outside = vi.fn();
  for (const type of ['pointerdown', 'click']) document.body.addEventListener(type, outside);
  s.more.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  s.more.click();
  inside(s.element, '.value').click();
  for (const type of ['pointerdown', 'click']) document.body.removeEventListener(type, outside);
  expect(outside).not.toHaveBeenCalled();
});
