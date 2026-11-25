// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import { STARTING_KEY } from '../../../src/ui/tiles/own-widget';
import '../../../src/ui/tiles/own-widget';
import { parseWidgetFile } from '../../../src/widgets/widget-file';
import { mount } from '../../helpers/mount';
import { fakeContext } from '../../helpers/ui-context';

afterEach(() => { document.body.replaceChildren(); window.sessionStorage.clear(); });
const gauge = () => { const p = parseWidgetFile(JSON.parse(readFileSync('docs/widgets/gauge.widget.json', 'utf8'))); if (!p.ok) throw new Error('bad'); return p.widget; };
const spec = { kind: 'widget', id: 't-1', size: 'single', widget: 'own:gauge', settings: {} } as const;

test('a widget gets a sandboxed frame of the page next to the dashboard, and nothing more', async () => {
  const fake = fakeContext([]);
  const element = await mount<HTMLElement>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  await (element as unknown as { updateComplete: Promise<unknown> }).updateComplete;
  const frame = element.shadowRoot!.querySelector('iframe')!;
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.src).toMatch(/\/widget-frame\.html$/);
  expect(frame.title).toBe('Meter');
});

test('in the safe mode no frame is made', async () => {
  const fake = fakeContext([]);
  fake.ctx.widgets = { boards: () => [], openBoard: () => {}, safe: () => true };
  const element = await mount<HTMLElement>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  expect(element.shadowRoot!.querySelector('iframe')).toBeNull();
  expect(element.shadowRoot!.textContent).toContain('veilige stand');
});

test('a widget that was starting when the page went waits for "Opnieuw"', async () => {
  window.sessionStorage.setItem(STARTING_KEY, JSON.stringify(['t-1']));
  const fake = fakeContext([]);
  const element = await mount<HTMLElement>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  expect(element.shadowRoot!.querySelector('iframe')).toBeNull();
  expect(element.shadowRoot!.textContent).toContain('Opnieuw');
});

test('a widget that is taken off the page while it starts is no widget that hung it', async () => {
  const fake = fakeContext([]);
  const first = await mount<HTMLElement>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  first.remove();
  const again = await mount<HTMLElement>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  expect(again.shadowRoot!.querySelector('iframe')).not.toBeNull();
});

test('two widgets that start at once each keep their own mark', async () => {
  const fake = fakeContext([]);
  await mount<HTMLElement>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  await mount<HTMLElement>('mh-own-widget', { spec: { ...spec, id: 't-2' }, ctx: fake.ctx, widget: gauge() });
  expect(JSON.parse(window.sessionStorage.getItem(STARTING_KEY)!)).toEqual(['t-1', 't-2']);
});

test('the same widget read again does not start the frame anew', async () => {
  const fake = fakeContext([]);
  const element = await mount<HTMLElement & { widget: unknown; updateComplete: Promise<unknown> }>('mh-own-widget', { spec, ctx: fake.ctx, widget: gauge() });
  const frame = element.shadowRoot!.querySelector('iframe');
  element.widget = gauge();
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector('iframe')).toBe(frame);
});
