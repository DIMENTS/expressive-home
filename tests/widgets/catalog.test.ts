import { expect, test } from 'vitest';
import { t } from '../../src/i18n';
import { BUILT_IN_WIDGETS, builtInWidget, widgetIcon, widgetName } from '../../src/widgets/catalog';
import type { WidgetTileSpec } from '../../src/dashboard/types';

const spec = (widget: string, settings: WidgetTileSpec['settings'] = {}): WidgetTileSpec => ({ kind: 'widget', id: 't-1', size: 'single', widget, settings });

test('the app has a clock, a note, a link, a gauge, a countdown and a group button', () => {
  expect(BUILT_IN_WIDGETS.map((w) => w.id)).toEqual(['clock', 'note', 'board', 'gauge', 'countdown', 'group']);
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
