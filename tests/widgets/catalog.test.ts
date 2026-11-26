import { expect, test } from 'vitest';
import { t } from '../../src/i18n';
import { BUILT_IN_WIDGETS, builtInWidget, widgetIcon, widgetName } from '../../src/widgets/catalog';
import type { WidgetTileSpec } from '../../src/dashboard/types';

const spec = (widget: string, settings: WidgetTileSpec['settings'] = {}): WidgetTileSpec => ({ kind: 'widget', id: 't-1', size: 'single', widget, settings });

test('the app has a clock, a note, a link, a gauge, a countdown, a group button, the weather and the energy', () => {
  expect(BUILT_IN_WIDGETS.map((w) => w.id)).toEqual(['clock', 'note', 'board', 'gauge', 'countdown', 'group', 'weather', 'energy']);
  expect(builtInWidget('clock')?.icon).toBe('schedule');
  expect(builtInWidget('own:x')).toBeUndefined();
});

test('a widget is called by its own name, else by its title, else by its kind', () => {
  expect(widgetName(spec('clock'), t)).toBe('Klok');
  expect(widgetName(spec('note', { title: 'Boodschappen' }), t)).toBe('Boodschappen');
  expect(widgetName({ ...spec('note', { title: 'Boodschappen' }), label: 'Lijst' }, t)).toBe('Lijst');
  expect(widgetName(spec('own:gauge'), t, () => 'Meter')).toBe('Meter');
  expect(widgetName(spec('own:gone'), t)).toBe('Widget');
});

test('every widget has an icon', () => {
  expect(widgetIcon(spec('note'))).toBe('sticky_note_2');
  expect(widgetIcon(spec('board'))).toBe('arrow_forward');
  expect(widgetIcon(spec('own:x'), () => 'schedule')).toBe('schedule');
  expect(widgetIcon(spec('own:x'), () => 'not-an-icon')).toBe('widgets');
});

test('the weather and the energy are widgets of the app, wide first, and need nothing before they work', async () => {
  const { builtInSettings, wantsSettings } = await import('../../src/widgets/settings');
  const { isWidgetRef } = await import('../../src/widgets/widget-ref');
  const { createTranslate } = await import('../../src/i18n');
  const t = createTranslate('nl');
  expect(builtInWidget('weather')).toMatchObject({ icon: 'partly_cloudy_day', name: 'widget.weather', sizes: ['wide', 'single'] });
  expect(builtInWidget('energy')).toMatchObject({ icon: 'bolt', name: 'widget.energy', sizes: ['wide', 'single'] });
  expect([isWidgetRef('weather'), isWidgetRef('energy')]).toEqual([true, true]);
  expect([wantsSettings('weather'), wantsSettings('energy')]).toEqual([false, false]);
  expect(builtInSettings('weather', t)).toEqual([{ id: 'days', type: 'checkbox', title: 'Ook de komende dagen (breed)', default: false }]);
  expect(builtInSettings('energy', t)).toEqual([
    { id: 'period', type: 'dropdown', title: 'Periode', default: 'day', values: [{ id: 'day', title: 'Vandaag' }, { id: 'week', title: 'Deze week' }, { id: 'month', title: 'Deze maand' }] },
    { id: 'devices', type: 'checkbox', title: 'Ook per apparaat (breed)', default: false },
  ]);
});
