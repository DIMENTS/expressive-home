// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/icon';
import type { MhIcon } from '../../../src/ui/parts/icon';

afterEach(() => { document.body.replaceChildren(); });

async function mount(name: string): Promise<MhIcon> {
  const icon = document.createElement('mh-icon') as MhIcon;
  icon.setAttribute('name', name);
  document.body.append(icon);
  await icon.updateComplete;
  return icon;
}

test('mh-icon shows the outline by default and the fill when asked', async () => {
  const icon = await mount('lightbulb');
  expect(icon.shadowRoot!.querySelectorAll('svg')).toHaveLength(2);
  expect(icon.hasAttribute('filled')).toBe(false);
  icon.filled = true;
  await icon.updateComplete;
  expect(icon.hasAttribute('filled')).toBe(true);
  expect(icon.getAttribute('aria-hidden')).toBe('true');
});

test('mh-icon is hidden from screen readers', async () => {
  const icon = await mount('home');
  expect(icon.getAttribute('aria-hidden')).toBe('true');
});

test('mh-icon follows a change of name', async () => {
  const icon = await mount('home');
  const before = icon.shadowRoot!.innerHTML;
  icon.name = 'cloud';
  await icon.updateComplete;
  expect(icon.shadowRoot!.innerHTML).not.toBe(before);
});

test('an unknown name shows the neutral icon instead of failing', async () => {
  const icon = await mount('no_such_icon');
  expect(icon.shadowRoot!.querySelectorAll('svg')).toHaveLength(2);
});
