import { expect, test } from 'vitest';
import { fromWidgetCode, parseWidgetFile, toWidgetCode, widgetText, WIDGET_FILE_LIMIT } from '../../src/widgets/widget-file';

const good = () => ({
  format: 'expressive-home-widget', version: 1, id: 'gauge', name: { en: 'Gauge', nl: 'Meter' }, description: 'A value on a dial', icon: 'speed',
  widgetVersion: '1.0.0', sizes: ['single'],
  settings: [
    { id: 'device', type: 'device', title: { en: 'Device', nl: 'Apparaat' } },
    { id: 'capability', type: 'capability', device: 'device', title: 'Value' },
    { id: 'min', type: 'number', title: 'Lowest', default: 0 },
    { id: 'look', type: 'dropdown', title: 'Look', values: [{ id: 'arc', title: 'Arc' }, { id: 'bar', title: { nl: 'Balk', en: 'Bar' } }], default: 'arc' },
  ],
  html: '<div class="dial"></div>', css: '.dial { color: var(--c-primary); }', js: 'function onHomeyReady(Homey) { Homey.ready(); }',
  texts: { en: { none: 'No value' }, nl: { none: 'Geen waarde' } },
});

test('a good file comes back whole, with every text in both languages where it was given', () => {
  const parsed = parseWidgetFile(good());
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const w = parsed.widget;
  expect(w.id).toBe('gauge');
  expect(widgetText(w.name, 'nl')).toBe('Meter');
  expect(widgetText(w.description, 'nl')).toBe('A value on a dial');
  expect(w.sizes).toEqual(['single']);
  expect(w.settings.map((s) => s.type)).toEqual(['device', 'capability', 'number', 'dropdown']);
  expect(w.settings[3]!.values).toEqual([{ id: 'arc', title: { en: 'Arc' } }, { id: 'bar', title: { nl: 'Balk', en: 'Bar' } }]);
  expect(w.texts['nl']).toEqual({ none: 'Geen waarde' });
});

test.each([
  ['no object', 'x', 'not-a-widget'],
  ['another format', { ...good(), format: 'expressive-home-theme' }, 'not-a-widget'],
  ['a newer version', { ...good(), version: 2 }, 'too-new'],
  ['a bad id', { ...good(), id: 'Not An Id' }, 'bad-field'],
  ['the id of an object', { ...good(), id: '__proto__' }, 'bad-field'],
  ['no name', { ...good(), name: '' }, 'bad-field'],
  ['no code', { ...good(), js: 5 }, 'bad-field'],
  ['a setting of an unknown type', { ...good(), settings: [{ id: 'x', type: 'camera', title: 'X' }] }, 'bad-field'],
  ['a value of a device that is not there', { ...good(), settings: [{ id: 'c', type: 'capability', device: 'nope', title: 'X' }] }, 'bad-field'],
  ['too many settings', { ...good(), settings: Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, type: 'text', title: 'X' })) }, 'bad-field'],
  ['too big', { ...good(), js: 'x'.repeat(WIDGET_FILE_LIMIT) }, 'too-big'],
])('%s is refused', (_, raw, reason) => {
  expect(parseWidgetFile(raw)).toEqual({ ok: false, reason });
});

test('sizes that make no sense fall back to both', () => {
  const parsed = parseWidgetFile({ ...good(), sizes: ['huge'] });
  expect(parsed.ok && parsed.widget.sizes).toEqual(['single', 'wide']);
});

test('a widget goes into a code and comes back the same; a changed letter is noticed', () => {
  const parsed = parseWidgetFile(good());
  if (!parsed.ok) throw new Error('not ok');
  const code = toWidgetCode(parsed.widget);
  expect(code.startsWith('EW1.')).toBe(true);
  expect(fromWidgetCode(`  ${code.slice(0, 30)}\n${code.slice(30)} `)).toEqual(parsed);
  const broken = `${code.slice(0, 20)}${code[20] === 'A' ? 'B' : 'A'}${code.slice(21)}`;
  expect(fromWidgetCode(broken)).toEqual({ ok: false, reason: 'damaged' });
  expect(fromWidgetCode('EW9.abc.1')).toEqual({ ok: false, reason: 'too-new' });
  expect(fromWidgetCode('hello')).toEqual({ ok: false, reason: 'not-a-widget' });
});

test('the text of a file is read the same way', () => {
  expect(fromWidgetCode(JSON.stringify(good())).ok).toBe(true);
});
