// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { BUILT_IN } from '../../../src/theme/look';
import { computeLook, styleOf } from '../../../src/theme/styles';
import '../../../src/ui/onboarding/mini-board';
import type { MhMiniBoard, MiniColumns } from '../../../src/ui/onboarding/mini-board';

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

const columns: MiniColumns = {
  left: [{ id: 'hero:main', kind: 'hero', icon: 'battery_5_bar', tiles: 0 }, { id: 'type:lights', kind: 'section', icon: 'lightbulb', tiles: 5 }],
  right: [{ id: 'type:climate', kind: 'section', icon: 'thermostat', tiles: 2 }],
};

async function board(props: Partial<MhMiniBoard> = {}) {
  const element = document.createElement('mh-mini-board') as MhMiniBoard;
  Object.assign(element, { file: BUILT_IN[2]!, seed: '#3a5ba9', mode: 'dark', density: 'comfortable', columns, label: 'Voorbeeld van je dashboard: Glas, Donker' }, props);
  document.body.append(element);
  await element.updateComplete;
  return element;
}

const blocks = (element: MhMiniBoard) => [...element.shadowRoot!.querySelectorAll<HTMLElement>('[data-block]')];

test('one picture for a screen reader, with what it shows; the blocks in their columns, at most four tiles each', async () => {
  const element = await board();
  const screen = element.shadowRoot!.querySelector('.screen')!;
  expect([screen.getAttribute('role'), screen.getAttribute('aria-label')]).toEqual(['img', 'Voorbeeld van je dashboard: Glas, Donker']);
  expect(blocks(element).map((block) => [block.dataset['block'], block.closest('.col')!.getAttribute('data-column')])).toEqual([
    ['hero:main', 'left'], ['type:lights', 'left'], ['type:climate', 'right'],
  ]);
  expect(blocks(element)[1]!.querySelectorAll('.tile')).toHaveLength(4);
  expect(blocks(element)[2]!.querySelectorAll('.tile')).toHaveLength(2);
  expect(blocks(element)[1]!.querySelector('mh-icon')!.getAttribute('name')).toBe('lightbulb');
});

test('it draws with the values of the theme it is given, and again when they change', async () => {
  const element = await board();
  const screen = element.shadowRoot!.querySelector<HTMLElement>('.screen')!;
  const glas = computeLook(styleOf(BUILT_IN[2]!), { seed: '#3a5ba9', mode: 'dark', density: 'comfortable' }, false);
  expect(screen.style.getPropertyValue('--page-bg')).toBe(glas['--page-bg']);
  element.file = BUILT_IN[3]!;
  element.mode = 'light';
  await element.updateComplete;
  const helder = computeLook(styleOf(BUILT_IN[3]!), { seed: '#3a5ba9', mode: 'light', density: 'comfortable' }, false);
  expect(screen.style.getPropertyValue('--c-primary')).toBe(helder['--c-primary']);
  expect(screen.style.getPropertyValue('--tile-outline-width')).toBe(helder['--tile-outline-width']);
  expect(element.getAttribute('density')).toBe('comfortable');
});

test('blocks that change place slide there from where they were, unless the system asks for less motion', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  const element = await board();
  // the block of the climate was 200 lower before the change than after it
  let measured = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = this.dataset['block'] === 'type:climate' ? (measured++ === 0 ? 200 : 0) : 100;
    return { top: at, left: 0, width: 10, height: 10, right: 10, bottom: at + 10, x: 0, y: at, toJSON: () => ({}) } as DOMRect;
  });
  element.columns = { left: [columns.right[0]!, ...columns.left], right: [] };
  await element.updateComplete;
  const moved = blocks(element).find((block) => block.dataset['block'] === 'type:climate')!;
  expect([moved.hasAttribute('data-moving'), moved.style.getPropertyValue('--_dy')]).toEqual([true, '200px']);
  expect(blocks(element).filter((block) => block.hasAttribute('data-moving'))).toHaveLength(1);
  await new Promise((done) => { requestAnimationFrame(() => requestAnimationFrame(() => done(null))); });
  expect(moved.hasAttribute('data-moving')).toBe(false);
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
  measured = 0;
  element.columns = columns;
  await element.updateComplete;
  expect(blocks(element).some((block) => block.hasAttribute('data-moving'))).toBe(false);
});

test('while it is being built every block and tile comes one after the other', async () => {
  const element = await board({ building: true });
  const arriving = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.arrive')];
  expect(arriving.length).toBeGreaterThan(5);
  expect(arriving.map((part) => part.style.getPropertyValue('--i'))).toEqual(arriving.map((_part, index) => String(index)));
  element.building = false;
  await element.updateComplete;
  expect(element.shadowRoot!.querySelectorAll('.arrive')).toHaveLength(0);
});
