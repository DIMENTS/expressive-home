// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/dimmer';
import type { MhDimmer } from '../../../src/ui/parts/dimmer';
import { colorTokens } from '../../../src/theme/engine';
import { inside, mount, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const box = { left: 16, top: 335, width: 168, height: 236, startLevel: 0.64, startY: 420 };
const from = { left: 20, top: 400, width: 160, height: 60 };
const dimmer = (props: Record<string, unknown> = {}) => mount<MhDimmer>('mh-dimmer', { box, from, level: 0.64, percent: 64, name: 'Keuken', icon: 'lightbulb', seed: null, mode: 'light', ...props });
const style = (host: MhDimmer, name: string) => inside(host, '.dimmer').style.getPropertyValue(name);

test('it stands where it was told, filled to the level, with the level and the name', async () => {
  const host = await dimmer();
  expect(['--_left', '--_top', '--_width', '--_height', '--_level'].map((name) => style(host, name))).toEqual(['16px', '335px', '168px', '236px', '0.64']);
  expect(['--_from-left', '--_from-top', '--_from-width', '--_from-height'].map((name) => style(host, name))).toEqual(['20px', '400px', '160px', '60px']);
  expect([...host.shadowRoot!.querySelectorAll('.value')].map((v) => v.textContent!.replace(/\s+/g, ''))).toEqual(['64%', '64%']);
  expect([...host.shadowRoot!.querySelectorAll('.name')].map((v) => v.textContent)).toEqual(['Keuken', 'Keuken']);
  host.level = 0.07;
  host.percent = 7;
  await settle(host);
  expect([style(host, '--_level'), inside(host, '.value').textContent!.replace(/\s+/g, '')]).toEqual(['0.07', '7%']);
});

test('it is only to see: the slider in the window of the lamp is the one for a screen reader', async () => {
  const host = await dimmer();
  expect(inside(host, '.dimmer').getAttribute('aria-hidden')).toBe('true');
});

test('it has the colour of its section', async () => {
  const host = await dimmer({ seed: '#3a5ba9' });
  expect([host.style.getPropertyValue('--c-primary'), host.hasAttribute('data-own-seed')]).toEqual([colorTokens('#3a5ba9', 'light', 0)['--c-primary'], true]);
});
