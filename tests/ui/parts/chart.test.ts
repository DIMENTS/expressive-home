// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import '../../../src/ui/parts/chart';
import type { MhChart } from '../../../src/ui/parts/chart';
import type { HistorySeries } from '../../../src/homey/client';
import { createTranslate } from '../../../src/i18n';
import { inside, key, mount, record, settle } from '../../helpers/mount';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const NOW = Date.parse('2026-11-25T14:20:00Z');
const STEP = 300_000;
/** A day of temperatures every five minutes, with one empty point an hour ago. */
const day = (): HistorySeries => {
  const points = Array.from({ length: 289 }, (_, i) => {
    const at = NOW - (288 - i) * STEP;
    return { at, value: i === 276 ? null : Math.round((20 + 2 * Math.sin(i / 40)) * 10) / 10 };
  });
  return { start: NOW - 24 * 3_600_000, end: NOW, step: STEP, updatesIn: null, points };
};
const base = () => ({
  series: day(), kind: { baseId: 'measure_temperature', units: '°C' }, period: 'last24Hours', zone: 'Europe/Amsterdam', name: 'Temperatuur',
  now: NOW, nowValue: 21.5, format: (value: number) => `${String(value).replace('.', ',')} °C`, t: createTranslate('nl'), area: true, variant: 'window',
});

test('without a series there is nothing: no drawing and no height', async () => {
  const chart = await mount<MhChart>('mh-chart', { ...base(), series: null });
  expect(chart.shadowRoot!.querySelector('svg')).toBeNull();
  expect(chart.hasAttribute('empty')).toBe(true);
});

test('a line, an area under it, times under it, and the dot of now', async () => {
  const chart = await mount<MhChart>('mh-chart', base());
  expect(chart.hasAttribute('empty')).toBe(false);
  expect(inside(chart, 'path.line').getAttribute('d')).toMatch(/^M/);
  expect(inside(chart, 'path.area').getAttribute('d')).toMatch(/Z$/);
  // the gap an hour ago breaks the line
  expect((inside(chart, 'path.line').getAttribute('d')!.match(/M/g) ?? []).length).toBe(2);
  expect([...chart.shadowRoot!.querySelectorAll('.times span')].map((span) => span.textContent)).toEqual(['18:00', '00:00', '06:00', '12:00', 'nu']);
  expect(chart.shadowRoot!.querySelector('.now')).not.toBeNull();
});

test('the chart is a sentence and a slider over time', async () => {
  const chart = await mount<MhChart>('mh-chart', base());
  const slider = inside(chart, '[role="slider"]');
  const described = inside(chart, `#${slider.getAttribute('aria-describedby')!}`);
  expect(described.textContent).toMatch(/^Temperatuur, laatste 24 uur: nu 21,5 °C, laagste [\d,]+ °C om \d\d:\d\d, hoogste [\d,]+ °C om \d\d:\d\d\.$/);
  expect(slider.getAttribute('aria-label')).toBe('Temperatuur');
  expect(slider.getAttribute('tabindex')).toBe('0');
});

test('keys read point by point, an hour with Page keys, the ends with Home and End; Escape stops only what it reads', async () => {
  const chart = await mount<MhChart>('mh-chart', base());
  const reads = record<{ reading: boolean }>(chart, 'chart-read');
  const slider = inside(chart, '[role="slider"]');
  expect(key(slider, 'Escape').defaultPrevented).toBe(false);
  key(slider, 'Home');
  await settle(chart);
  expect(slider.getAttribute('aria-valuetext')).toMatch(/^15:20, [\d,]+ °C$/);
  expect(inside(chart, '.tip').textContent!.trim()).toMatch(/^15:20 · [\d,]+ °C$/);
  key(slider, 'ArrowRight');
  await settle(chart);
  expect(slider.getAttribute('aria-valuetext')).toMatch(/^15:25, /);
  key(slider, 'PageUp');
  await settle(chart);
  expect(slider.getAttribute('aria-valuetext')).toMatch(/^16:25, /);
  key(slider, 'End');
  await settle(chart);
  expect(slider.getAttribute('aria-valuetext')).toBe('15:20, 21,5 °C');
  key(slider, 'Home');
  for (let i = 0; i < 276; i++) key(slider, 'ArrowRight');
  await settle(chart);
  expect(slider.getAttribute('aria-valuetext')).toBe('14:20, geen meting');
  const escape = key(slider, 'Escape');
  await settle(chart);
  expect(escape.defaultPrevented).toBe(true);
  expect(chart.shadowRoot!.querySelector('.tip')).toBeNull();
  expect(reads.at(-1)).toEqual({ reading: false });
  expect(reads[0]).toEqual({ reading: true });
});

test('a mouse reads where it points', async () => {
  const chart = await mount<MhChart>('mh-chart', base());
  const plot = inside(chart, '.plot');
  plot.getBoundingClientRect = () => ({ left: 0, width: 1000, right: 1000, top: 0, bottom: 150, height: 150, x: 0, y: 0, toJSON: () => ({}) });
  plot.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 10, pointerType: 'mouse', bubbles: true, composed: true }));
  await settle(chart);
  expect(inside(chart, '.tip').textContent).toMatch(/^15:20 · /);
  plot.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse', bubbles: true, composed: true }));
  await settle(chart);
  expect(chart.shadowRoot!.querySelector('.tip')).toBeNull();
});

test('on a tile only a soft area, nothing to read; while loading a calm placeholder; while editing no reading', async () => {
  const tile = await mount<MhChart>('mh-chart', { ...base(), variant: 'tile' });
  expect(tile.shadowRoot!.querySelector('path.line')).toBeNull();
  expect(tile.shadowRoot!.querySelector('[role="slider"]')).toBeNull();
  expect(inside(tile, 'svg').getAttribute('aria-hidden')).toBe('true');
  expect(tile.shadowRoot!.querySelector('.times')).toBeNull();
  const loading = await mount<MhChart>('mh-chart', { ...base(), series: null, loading: true });
  expect(loading.hasAttribute('empty')).toBe(false);
  expect(loading.shadowRoot!.querySelector('.loading')).not.toBeNull();
  const editing = await mount<MhChart>('mh-chart', { ...base(), readable: false });
  expect(editing.shadowRoot!.querySelector('[role="slider"]')).toBeNull();
});

test('a month and a year draw a plain line, without an area', async () => {
  const chart = await mount<MhChart>('mh-chart', { ...base(), period: 'last31Days', area: false });
  expect(chart.shadowRoot!.querySelector('path.area')).toBeNull();
  expect(chart.shadowRoot!.querySelector('path.line')).not.toBeNull();
});
