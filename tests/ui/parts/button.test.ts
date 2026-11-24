// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/button';
import type { MhButton } from '../../../src/ui/parts/button';
import { inside, mount, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

test('a button fires click', async () => {
  const button = await mount<MhButton>('mh-button', {}, 'Verbinden');
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  inside(button, 'button').click();
  expect(clicked).toHaveBeenCalledTimes(1);
});

test('a busy or disabled button does not fire click', async () => {
  const button = await mount<MhButton>('mh-button', { busy: true }, 'Verbinden');
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  inside(button, 'button').click();
  button.click();
  button.busy = false;
  button.disabled = true;
  await settle(button);
  inside(button, 'button').click();
  button.click();
  expect(clicked).not.toHaveBeenCalled();
});

test('a busy button shows the loader and says it is busy', async () => {
  const button = await mount<MhButton>('mh-button', { busy: true }, 'Verbinden…');
  expect(button.shadowRoot!.querySelector('mh-loader')).not.toBeNull();
  expect(inside(button, 'button').getAttribute('aria-busy')).toBe('true');
});

test('an icon button has an accessible name', async () => {
  const button = await mount<MhButton>('mh-button', { variant: 'icon', label: 'Sluiten' }, '<mh-icon name="close"></mh-icon>');
  expect(inside(button, 'button').getAttribute('aria-label')).toBe('Sluiten');
});

test('a text button carries no name of its own: its text is the name', async () => {
  const button = await mount<MhButton>('mh-button', { variant: 'text' }, 'Annuleren');
  expect(inside(button, 'button').hasAttribute('aria-label')).toBe(false);
});

test('a small button keeps a touch target of at least 48', async () => {
  const button = await mount<MhButton>('mh-button', { variant: 'tonal', small: true }, 'Uitvoeren');
  expect(inside(button, 'button').classList.contains('hit')).toBe(true);
});
