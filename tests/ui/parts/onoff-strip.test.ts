// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/parts/onoff-strip';
import type { MhOnoffStrip } from '../../../src/ui/parts/onoff-strip';
import { createTranslate } from '../../../src/i18n';
import { inside, key, mount, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const at = (text: string): number => Date.parse(text);
const NOW = at('2026-11-25T17:00:00Z'); // 18:00 in Amsterdam
const changes = [
  { at: at('2026-11-24T06:05:00Z'), on: true },
  { at: at('2026-11-24T06:50:00Z'), on: false },
  { at: at('2026-11-25T06:05:00Z'), on: true },
  { at: at('2026-11-25T06:50:00Z'), on: false },
  { at: at('2026-11-25T16:02:00Z'), on: true },
];
const base = () => ({ switches: { changes }, nowOn: true, now: NOW, zone: 'Europe/Amsterdam', t: createTranslate('nl'), name: 'Sfeerlamp', baseId: 'onoff' });

test('without changes there is nothing', async () => {
  const strip = await mount<MhOnoffStrip>('mh-onoff-strip', { ...base(), switches: { changes: [] } });
  expect(strip.hasAttribute('empty')).toBe(true);
  expect(strip.shadowRoot!.querySelector('.row')).toBeNull();
});

test('a row per day, newest first, with what is on, a head that says since when, and times under it', async () => {
  const strip = await mount<MhOnoffStrip>('mh-onoff-strip', base());
  expect([...strip.shadowRoot!.querySelectorAll('.row .day')].map((d) => d.textContent)).toEqual(['Vandaag', 'Gisteren']);
  expect(strip.shadowRoot!.querySelectorAll('.row')[0]!.querySelectorAll('.on')).toHaveLength(2);
  expect(inside(strip, '.since').textContent).toBe('5 wisselingen sinds di 07:05');
  expect([...strip.shadowRoot!.querySelectorAll('.times span')].map((s) => s.textContent)).toEqual(['00:00', '06:00', '12:00', '18:00', '24:00']);
});

test('a sentence for screen readers, and arrows go from change to change', async () => {
  const strip = await mount<MhOnoffStrip>('mh-onoff-strip', base());
  const reader = inside(strip, '[role="slider"]');
  const sentence = inside(strip, `#${reader.getAttribute('aria-describedby')!}`).textContent;
  expect(sentence).toBe('Sfeerlamp, de laatste 5 keer aan of uit, sinds di 07:05. Vandaag 2 keer aan, samen 1 uur en 43 minuten. Nu aan sinds 17:02.');
  key(reader, 'End');
  await settle(strip);
  expect(reader.getAttribute('aria-valuetext')).toBe('Vandaag, aan van 17:02 tot nu');
  expect(inside(strip, '.picked').textContent).toBe('Aan 17:02 – nu');
  key(reader, 'ArrowLeft');
  await settle(strip);
  expect(reader.getAttribute('aria-valuetext')).toBe('Vandaag, uit van 07:50 tot 17:02');
  key(reader, 'Home');
  await settle(strip);
  expect(reader.getAttribute('aria-valuetext')).toBe('Gisteren, aan van 07:05 tot 07:50');
  expect(strip.shadowRoot!.querySelectorAll('.ring')).toHaveLength(1);
  const escape = key(reader, 'Escape');
  await settle(strip);
  expect(escape.defaultPrevented).toBe(true);
  expect(strip.shadowRoot!.querySelector('.ring')).toBeNull();
});

test('a tap on a row picks what is there; the whole row is the target', async () => {
  const strip = await mount<MhOnoffStrip>('mh-onoff-strip', base());
  const row = strip.shadowRoot!.querySelectorAll<HTMLElement>('.row')[1]!;
  const bar = row.querySelector<HTMLElement>('.bar')!;
  bar.getBoundingClientRect = () => ({ left: 0, width: 960, right: 960, top: 0, bottom: 12, height: 12, x: 0, y: 0, toJSON: () => ({}) });
  // 07:15 in Amsterdam, yesterday
  row.dispatchEvent(new MouseEvent('click', { clientX: 960 * (7.25 / 24), bubbles: true, composed: true }));
  await settle(strip);
  expect(inside(strip, '.picked').textContent).toBe('Aan 07:05 – 07:50');
});

test('one change is one change', async () => {
  const strip = await mount<MhOnoffStrip>('mh-onoff-strip', { ...base(), switches: { changes: [changes[4]!] } });
  expect(inside(strip, '.since').textContent).toBe('1 wisseling sinds wo 17:02');
});
