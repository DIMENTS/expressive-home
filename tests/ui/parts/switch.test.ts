// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/switch';
import type { MhSwitch } from '../../../src/ui/parts/switch';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

test('a switch toggles with a click and with the space bar and reports the new state', async () => {
  const sw = await mount<MhSwitch>('mh-switch', { label: 'Aan' });
  const changes = record<{ checked: boolean }>(sw, 'change');
  const control = inside(sw, '[role="switch"]');
  expect(control.getAttribute('aria-checked')).toBe('false');
  expect(control.getAttribute('aria-label')).toBe('Aan');
  control.click();
  await settle(sw);
  expect(control.getAttribute('aria-checked')).toBe('true');
  const space = key(control, ' ');
  await settle(sw);
  expect(space.defaultPrevented).toBe(true);
  expect(control.getAttribute('aria-checked')).toBe('false');
  expect(changes).toEqual([{ checked: true }, { checked: false }]);
});

test('a disabled switch does nothing', async () => {
  const sw = await mount<MhSwitch>('mh-switch', { label: 'Aan', disabled: true });
  const changes = record(sw, 'change');
  const control = inside(sw, '[role="switch"]');
  control.click();
  key(control, ' ');
  await settle(sw);
  expect(changes).toEqual([]);
  expect(control.getAttribute('aria-disabled')).toBe('true');
  expect(control.getAttribute('tabindex')).toBe('-1');
});

test('a switch follows a new checked value from outside', async () => {
  const sw = await mount<MhSwitch>('mh-switch', { label: 'Aan' });
  sw.checked = true;
  await settle(sw);
  expect(inside(sw, '[role="switch"]').getAttribute('aria-checked')).toBe('true');
});
