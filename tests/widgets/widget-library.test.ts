import { expect, test } from 'vitest';
import { applyWidgetOps, emptyWidgetsDoc, MAX_WIDGETS, normalizeWidgetsDoc, parseWidgetOps } from '../../src/widgets/widget-library';
import { parseWidgetFile, type WidgetFile } from '../../src/widgets/widget-file';

const widget = (id: string, name = id): WidgetFile => {
  const parsed = parseWidgetFile({ format: 'expressive-home-widget', version: 1, id, name, html: '', css: '', js: '' });
  if (!parsed.ok) throw new Error('bad');
  return parsed.widget;
};

test('adding a widget puts it in the list; one with the same id replaces it in its place', () => {
  const one = applyWidgetOps(emptyWidgetsDoc(), [{ add: widget('a') }, { add: widget('b') }]);
  expect(one.widgets.map((w) => w.id)).toEqual(['a', 'b']);
  const two = applyWidgetOps(one, [{ add: widget('a', 'Nieuw') }]);
  expect(two.widgets.map((w) => [w.id, w.name.en])).toEqual([['a', 'Nieuw'], ['b', 'b']]);
});

test('removing takes it out; an unknown id changes nothing', () => {
  const doc = applyWidgetOps(emptyWidgetsDoc(), [{ add: widget('a') }]);
  expect(applyWidgetOps(doc, [{ remove: 'a' }]).widgets).toEqual([]);
  expect(applyWidgetOps(doc, [{ remove: 'x' }])).toEqual(doc);
});

test('a house has at most twelve own widgets', () => {
  const ops = Array.from({ length: MAX_WIDGETS + 2 }, (_, i) => ({ add: widget(`w${i}`) }));
  expect(applyWidgetOps(emptyWidgetsDoc(), ops).widgets).toHaveLength(MAX_WIDGETS);
});

test('operations from outside are checked; a bad widget refuses the lot', () => {
  expect(parseWidgetOps([{ add: widget('a') }, { remove: 'b' }])).toEqual([{ add: widget('a') }, { remove: 'b' }]);
  expect(parseWidgetOps([{ add: { format: 'x' } }])).toBeNull();
  expect(parseWidgetOps([{ remove: 'Bad Id' }])).toBeNull();
  expect(parseWidgetOps('x')).toBeNull();
  expect(parseWidgetOps(new Array(40).fill({ remove: 'a' }))).toBeNull();
});

test('a stored list is read back, what is broken falls away', () => {
  expect(normalizeWidgetsDoc({ revision: 3, widgets: [widget('a'), { format: 'x' }, widget('a')] })).toEqual({ revision: 3, widgets: [widget('a')] });
  expect(normalizeWidgetsDoc(null)).toEqual(emptyWidgetsDoc());
});
