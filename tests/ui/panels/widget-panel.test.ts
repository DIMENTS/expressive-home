// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import '../../../src/ui/panels/widget-panel';
import { t } from '../../../src/i18n';
import { builtInSettings } from '../../../src/widgets/settings';
import type { TileLayout } from '../../../src/layout/types';
import { inside, mount, record } from '../../helpers/mount';

afterEach(() => { document.body.replaceChildren(); });

const tile = (widget: string, settings: Record<string, string | number | boolean | null> = {}): TileLayout =>
  ({ id: 't-1', spec: { kind: 'widget', id: 't-1', size: 'single', widget, settings }, size: 'single', label: null, icon: null, source: 'device' });

const open = (widget: string, settings = {}) => mount<HTMLElement>('mh-widget-panel', {
  open: true, t, tile: tile(widget, settings), settings: builtInSettings(widget, t), sectionName: 'Woonkamer',
  picks: { boards: [{ id: 'd-1', name: 'Slaapkamer', icon: 'bed' }], devices: [], capabilities: () => [], flows: [] },
});

test('a note asks for a title, a text of more lines and the accent', async () => {
  const panel = await open('note', { title: 'Boodschappen' });
  const sheet = inside(panel, 'mh-sheet');
  const fields = panel.shadowRoot!.querySelectorAll('mh-text-field');
  expect(fields).toHaveLength(2);
  expect((fields[1] as HTMLElement & { multiline: boolean }).multiline).toBe(true);
  expect(sheet.getAttribute('heading')).toBe('Boodschappen');
  const seen = record<{ patch: { spec: { settings: Record<string, unknown> } }; typing?: boolean }>(panel, 'set-tile');
  fields[0]!.dispatchEvent(new CustomEvent('input', { detail: { value: 'Lijst' } }));
  expect(seen[0]!.patch.spec.settings).toEqual({ title: 'Lijst' });
  expect(seen[0]!.typing).toBe(true);
});

test('a link offers the dashboards to choose from', async () => {
  const panel = await open('board');
  const list = inside<HTMLElement & { options: { id: string; label: string }[] }>(panel, 'mh-radio-list');
  expect(list.options).toEqual([{ id: 'd-1', label: 'Slaapkamer' }]);
  const seen = record<{ patch: { spec: { settings: Record<string, unknown> } } }>(panel, 'set-tile');
  list.dispatchEvent(new CustomEvent('change', { detail: { value: 'd-1' } }));
  expect(seen[0]!.patch.spec.settings).toEqual({ board: 'd-1' });
});

test('the clock can show the date and the seconds, both switches', async () => {
  const panel = await open('clock');
  const switches = panel.shadowRoot!.querySelectorAll<HTMLElement & { checked: boolean }>('mh-switch');
  expect([...switches].map((s) => s.checked)).toEqual([true, false]);
});

test('removing is asked for with a button', async () => {
  const panel = await open('clock');
  const seen = record(panel, 'remove');
  inside(panel, 'mh-button[variant="danger"]').click();
  expect(seen).toHaveLength(1);
});

test('a setting with a search list searches as you type and keeps what is chosen', async () => {
  const asked: string[] = [];
  const panel = await mount<HTMLElement & { updateComplete: Promise<unknown> }>('mh-widget-panel', {
    open: true, t, tile: tile('app:com.example.twitch/channel', { channel: JSON.stringify({ name: 'Oud', id: '1' }) }),
    settings: [{ id: 'channel', type: 'autocomplete', title: 'Kanaal' }], sectionName: 'Woonkamer',
    picks: { boards: [], devices: [], switchable: [], capabilities: () => [], flows: [], search: async (setting: string, query: string) => { asked.push(`${setting}:${query}`); return [{ name: 'Kanaal een', description: 'live', value: JSON.stringify({ name: 'Kanaal een', id: '123' }) }]; } },
  });
  expect(panel.shadowRoot!.textContent).toContain('Oud');
  const seen = record<{ patch: { spec: { settings: Record<string, unknown> } } }>(panel, 'set-tile');
  inside(panel, 'mh-text-field').dispatchEvent(new CustomEvent('input', { detail: { value: 'kan' } }));
  await new Promise((done) => { setTimeout(done, 400); });
  await panel.updateComplete;
  expect(asked).toEqual(['channel:kan']);
  inside(panel, '[data-choice]').click();
  expect(seen[0]!.patch.spec.settings).toEqual({ channel: JSON.stringify({ name: 'Kanaal een', id: '123' }) });
});
