// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { createTranslate } from '../../../src/i18n';
import '../../../src/ui/screens/framed-screen';
import { inside, mount } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const ADDRESS = 'https://example.org/expressive-home/';

test('the card says why, and opens the address in a tab of its own', async () => {
  const screen = await mount('mh-framed-screen', { t: createTranslate('nl'), address: ADDRESS });
  expect(inside(screen, 'h1').textContent).toBe('Open je dashboard in een eigen tabblad');
  expect(inside(screen, '.lead').textContent).toContain('Binnen een andere website opent het dashboard niet.');
  const link = inside<HTMLAnchorElement>(screen, 'a.open');
  expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual([ADDRESS, '_blank', 'noopener noreferrer']);
  expect(link.textContent!.replace(/\s+/g, ' ').trim()).toBe('Openen in een eigen tabblad, opent in een nieuw tabblad');
  expect(inside(screen, '.address').textContent).toBe(ADDRESS);
});

test('in English too', async () => {
  const screen = await mount('mh-framed-screen', { t: createTranslate('en'), address: ADDRESS });
  expect(inside(screen, 'h1').textContent).toBe('Open your dashboard in a tab of its own');
  expect(inside(screen, 'a.open').textContent!.replace(/\s+/g, ' ').trim()).toBe('Open in a tab of its own, opens in a new tab');
});
