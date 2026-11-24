// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/chip';
import type { MhChip } from '../../../src/ui/parts/chip';
import { mount } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

test('an interactive chip is a button, a plain chip is not', async () => {
  const plain = await mount<MhChip>('mh-chip', { icon: 'home' }, 'Lokaal verbonden');
  expect(plain.shadowRoot!.querySelector('button')).toBeNull();
  const alarm = await mount<MhChip>('mh-chip', { icon: 'warning', tone: 'alert', interactive: true }, 'Rookmelder · Rook');
  const clicked = vi.fn();
  alarm.addEventListener('click', clicked);
  alarm.shadowRoot!.querySelector('button')!.click();
  expect(clicked).toHaveBeenCalledTimes(1);
});

test('an alert chip has a filled icon, a neutral one an outlined icon', async () => {
  const alert = await mount<MhChip>('mh-chip', { icon: 'cloud_off', tone: 'alert' }, 'Geen verbinding');
  const neutral = await mount<MhChip>('mh-chip', { icon: 'home' }, 'Lokaal verbonden');
  expect(alert.shadowRoot!.querySelector('mh-icon')!.hasAttribute('filled')).toBe(true);
  expect(neutral.shadowRoot!.querySelector('mh-icon')!.hasAttribute('filled')).toBe(false);
});

test('a chip can be its icon only; its text is then its name', async () => {
  const chip = await mount<MhChip>('mh-chip', { icon: 'home', iconOnly: true, label: 'Lokaal verbonden' });
  const face = chip.shadowRoot!.querySelector('.chip')!;
  expect([face.getAttribute('role'), face.getAttribute('aria-label'), face.getAttribute('title'), face.textContent!.trim()]).toEqual(['img', 'Lokaal verbonden', 'Lokaal verbonden', '']);
  expect(chip.hasAttribute('iconOnly') || chip.hasAttribute('icon-only')).toBe(true);
});
