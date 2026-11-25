// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { BUILT_IN } from '../../../src/theme/look';
import { computeLook, styleOf } from '../../../src/theme/styles';
import { applyThemeTo } from '../../../src/ui/apply-theme';
import '../../../src/ui/parts/look-picker';
import type { LookOption, MhLookPicker } from '../../../src/ui/parts/look-picker';

afterEach(() => { document.body.innerHTML = ''; });

const options = (): LookOption[] => BUILT_IN.map((file) => ({ id: file.id, label: file.name, note: 'Ingebouwd', file, seed: '#3a5ba9', mode: 'light' }));

async function picker(value = 'rustig') {
  applyThemeTo(document.documentElement, { seed: '#3b6939', mode: 'light', density: 'comfortable' }, false);
  const element = document.createElement('mh-look-picker') as MhLookPicker;
  element.options = options();
  element.value = value;
  element.label = 'Stijl';
  document.body.append(element);
  await element.updateComplete;
  return element;
}

const radios = (element: MhLookPicker) => [...element.shadowRoot!.querySelectorAll<HTMLElement>('[role="radio"]')];

test('one radio per theme, with its name and note, in a group with a name', async () => {
  const element = await picker('glas');
  expect(element.shadowRoot!.querySelector('[role="radiogroup"]')!.getAttribute('aria-label')).toBe('Stijl');
  expect(radios(element).map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('aria-checked'), radio.tabIndex])).toEqual([
    ['Rustig, Ingebouwd', 'false', -1], ['Uitbundig, Ingebouwd', 'false', -1], ['Glas, Ingebouwd', 'true', 0], ['Helder, Ingebouwd', 'false', -1],
  ]);
});

test('each little dashboard is drawn with the values of its own theme, not those of the page', async () => {
  const element = await picker();
  const previews = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.preview')];
  expect(previews).toHaveLength(4);
  for (const [index, file] of BUILT_IN.entries()) {
    const tokens = computeLook(styleOf(file), { seed: '#3a5ba9', mode: 'light', density: 'comfortable' }, false);
    for (const name of ['--tile-on-bg', '--page-bg', '--c-primary', '--shape-md', '--section-outline-width']) expect([file.id, name, previews[index]!.style.getPropertyValue(name)]).toEqual([file.id, name, tokens[name]]);
    expect(previews[index]!.getAttribute('aria-hidden')).toBe('true');
  }
  expect(document.documentElement.style.getPropertyValue('--tile-on-bg')).toBe('var(--c-primary-container)');
});

test('arrow keys move and choose, a click chooses, and the choice is told', async () => {
  const element = await picker();
  const told: string[] = [];
  element.addEventListener('change', (event) => told.push((event as CustomEvent<{ value: string }>).detail.value));
  radios(element)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await element.updateComplete;
  radios(element)[3]!.click();
  await element.updateComplete;
  expect(told).toEqual(['uitbundig', 'helder']);
  expect(radios(element)[3]!.getAttribute('aria-checked')).toBe('true');
});

test('a new colour or light and dark redraws the little dashboards', async () => {
  const element = await picker();
  element.options = options().map((option) => ({ ...option, mode: 'dark' }));
  await element.updateComplete;
  const dark = computeLook(styleOf(BUILT_IN[0]!), { seed: '#3a5ba9', mode: 'dark', density: 'comfortable' }, false);
  expect(element.shadowRoot!.querySelector<HTMLElement>('.preview')!.style.getPropertyValue('--c-surface')).toBe(dark['--c-surface']);
});
