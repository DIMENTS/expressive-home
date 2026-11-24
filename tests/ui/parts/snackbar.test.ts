// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/snackbar';
import '../../../src/ui/parts/banner';
import { SNACKBAR_ERROR_MS, SNACKBAR_MS, type MhSnackbar } from '../../../src/ui/parts/snackbar';
import type { MhBanner } from '../../../src/ui/parts/banner';
import { inside, mount, settle } from '../../helpers/mount';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

test('a new message replaces the one on screen', async () => {
  const bar = await mount<MhSnackbar>('mh-snackbar');
  bar.show({ text: 'Eerste' });
  bar.show({ text: 'Tweede' });
  await settle(bar);
  expect(bar.shadowRoot!.textContent).toContain('Tweede');
  expect(bar.shadowRoot!.textContent).not.toContain('Eerste');
});

test('a message disappears after four seconds, an error after six', async () => {
  expect([SNACKBAR_MS, SNACKBAR_ERROR_MS]).toEqual([4000, 6000]);
  const bar = await mount<MhSnackbar>('mh-snackbar');
  bar.show({ text: 'Uitgevoerd.' });
  vi.advanceTimersByTime(3999);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(true);
  vi.advanceTimersByTime(1);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(false);
  bar.show({ text: 'Plafond reageerde niet.', tone: 'error' });
  vi.advanceTimersByTime(5999);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(true);
  vi.advanceTimersByTime(1);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(false);
});

test('a replaced message does not cut the new one short', async () => {
  const bar = await mount<MhSnackbar>('mh-snackbar');
  bar.show({ text: 'A' });
  vi.advanceTimersByTime(3000);
  bar.show({ text: 'B' });
  vi.advanceTimersByTime(3999);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(true);
});

test('an error is announced at once and the action runs when pressed', async () => {
  const bar = await mount<MhSnackbar>('mh-snackbar');
  bar.show({ text: 'Fijn', icon: 'check_circle' });
  await settle(bar);
  expect(inside(bar, '.bar').getAttribute('role')).toBe('status');
  const run = vi.fn();
  bar.show({ text: 'Plafond reageerde niet.', tone: 'error', action: { label: 'Opnieuw', run } });
  await settle(bar);
  expect(inside(bar, '.bar').getAttribute('role')).toBe('alert');
  inside(inside(bar, 'mh-button'), 'button').click();
  expect(run).toHaveBeenCalledTimes(1);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(false);
});

test('the banner is an alert with its heading and text', async () => {
  const banner = await mount<MhBanner>('mh-banner', { heading: 'Geen verbinding met je Homey', text: 'We proberen het vanzelf opnieuw.' });
  const box = inside(banner, '.banner');
  expect(box.getAttribute('role')).toBe('alert');
  expect(box.textContent).toContain('Geen verbinding met je Homey');
  expect(box.textContent).toContain('We proberen het vanzelf opnieuw.');
});

test('an important message keeps its full time; the next one follows', async () => {
  const bar = await mount<MhSnackbar>('mh-snackbar');
  bar.show({ text: 'Bewaren lukt niet.', tone: 'error', important: true });
  bar.show({ text: 'Eerste daarna' });
  bar.show({ text: 'Tweede daarna' });
  await settle(bar);
  expect(bar.shadowRoot!.textContent).toContain('Bewaren lukt niet.');
  vi.advanceTimersByTime(SNACKBAR_ERROR_MS - 1);
  await settle(bar);
  expect(bar.shadowRoot!.textContent).toContain('Bewaren lukt niet.');
  vi.advanceTimersByTime(1);
  await settle(bar);
  // Only the newest waited.
  expect(bar.hasAttribute('open')).toBe(true);
  expect(bar.shadowRoot!.textContent).toContain('Tweede daarna');
  expect(bar.shadowRoot!.textContent).not.toContain('Eerste daarna');
  vi.advanceTimersByTime(SNACKBAR_MS);
  await settle(bar);
  expect(bar.hasAttribute('open')).toBe(false);
});

test('a normal message is still replaced at once', async () => {
  const bar = await mount<MhSnackbar>('mh-snackbar');
  bar.show({ text: 'Gewoon' });
  bar.show({ text: 'Belangrijk', important: true });
  await settle(bar);
  expect(bar.shadowRoot!.textContent).toContain('Belangrijk');
  expect(bar.shadowRoot!.textContent).not.toContain('Gewoon');
});
