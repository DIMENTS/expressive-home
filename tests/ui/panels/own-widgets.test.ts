// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/own-widgets';
import { t } from '../../../src/i18n';
import { parseWidgetFile, toWidgetCode } from '../../../src/widgets/widget-file';
import { inside, mount, record, settle } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });
const gauge = () => { const p = parseWidgetFile(JSON.parse(readFileSync('docs/widgets/gauge.widget.json', 'utf8'))); if (!p.ok) throw new Error('bad'); return p.widget; };

test('a pasted code shows what the widget may do before it is taken in', async () => {
  const part = await mount<HTMLElement & { stand: unknown }>('mh-own-widgets', { t, widgets: [], stand: { kind: 'import' } });
  const field = inside(part, 'mh-text-field');
  field.dispatchEvent(new CustomEvent('input', { detail: { value: toWidgetCode(gauge()) } }));
  await settle(part as never);
  const text = part.shadowRoot!.textContent!.replace(/\s+/g, ' ');
  expect(text).toContain('Wat deze widget mag');
  expect(text).toContain('(1)');
  expect(text).toContain('Geen andere apparaten');
  const installs = record<{ widget: { id: string } }>(part, 'install-widget');
  [...part.shadowRoot!.querySelectorAll<HTMLElement>('mh-button')].find((b) => b.textContent!.trim() === 'Toevoegen')!.click();
  expect(installs.map((i) => i.widget.id)).toEqual(['gauge']);
});

test('a damaged code is refused with a reason, and nothing can be added', async () => {
  const part = await mount<HTMLElement>('mh-own-widgets', { t, widgets: [], stand: { kind: 'import' } });
  inside(part, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: 'EW1.abc.def' } }));
  await settle(part as never);
  expect(inside(part, 'mh-note[tone="error"]').textContent).toContain('beschadigd');
});

test('the list places a widget with the plus; nothing is placed by itself', async () => {
  const part = await mount<HTMLElement>('mh-own-widgets', { t, widgets: [gauge()], stand: { kind: 'list' } });
  const places = record<{ widget: { id: string } }>(part, 'place-widget');
  expect(places).toEqual([]);
  inside(part, '[data-own="gauge"] mh-button.add').click();
  expect(places.map((p) => p.widget.id)).toEqual(['gauge']);
});
