import { expect, test } from 'vitest';
import { createDocuments } from '../../src/home-server/documents';
import { createSharedLayouts } from '../../src/home-server/shared-layouts';
import { createSharedLooks } from '../../src/home-server/shared-looks';
import { createSharedWidgets } from '../../src/home-server/shared-widgets';

// The shared documents of the house without any way of transport: what the server at home and the door from outside
// both do with them, so both keep to the same rules.

function house() {
  const layouts = createSharedLayouts({ load: () => undefined, save: () => {} });
  const looks = createSharedLooks({ load: () => undefined, save: () => {} });
  const widgets = createSharedWidgets({ load: () => undefined, save: () => {} });
  return { layouts, looks, widgets, documents: createDocuments({ layouts, looks, widgets }) };
}

test('it tells the three documents and their revisions', () => {
  const { documents } = house();
  expect(documents.revisions()).toEqual({ layouts: 0, looks: 0, rescue: 0, widgets: 0 });
  expect(documents.layouts()).toMatchObject({ revision: 0 });
  expect(documents.looks()).toMatchObject({ revision: 0, themes: [] });
  expect(documents.widgets()).toMatchObject({ revision: 0 });
});

test('only a device that may arrange saves a layout, from the revision it knows; a stale one gets the document of now', () => {
  const { documents } = house();
  expect(documents.putLayouts('use', { base: 0, layouts: {} })).toEqual({ error: 'role' });
  const first = documents.putLayouts('edit', { base: 0, layouts: {}, sectionSeeds: { 'type:lights': '#3b6939' } });
  expect(first).toMatchObject({ ok: true, doc: { revision: 1 } });
  expect(documents.putLayouts('edit', { base: 0, layouts: {} })).toMatchObject({ ok: false, doc: { revision: 1 } });
  expect(documents.putLayouts('edit', { layouts: {} })).toMatchObject({ ok: false });
});

test('changes of looks are checked, must fit, and need the right to arrange', () => {
  const { documents } = house();
  const ops = [{ house: { theme: 'rustig', seed: '#a6422a', mode: 'dark' } }];
  expect(documents.looksOps('use', ops)).toEqual({ error: 'role' });
  expect(documents.looksOps('edit', 'no list')).toEqual({ error: 'bad' });
  expect(documents.looksOps('edit', ops)).toMatchObject({ doc: { revision: 1, house: { seed: '#a6422a', mode: 'dark' } } });
  // themes just under the limit of one each: twenty together are more than all may be
  const strak = { format: 2, id: 't-bbbbbbbbbbbbbbbb', name: 'Strak', maker: '', base: 'leeg', seed: null, userSeed: true, knobs: {}, app: '1.2.0', values: { both: { 'tile-bg': '#ffffff' } } };
  const big = (n: number) => ({ ...strak, id: `t-${String(n).padStart(16, '0')}`, values: { both: Object.fromEntries(Array.from({ length: 300 }, (_, k) => [`x${k}`, 'a'.repeat(190)])) } });
  const many = Array.from({ length: 20 }, (_, n) => ({ save: big(n) }));
  expect(documents.looksOps('edit', many)).toEqual({ error: 'too-big' });
});

test('changes of own widgets are checked and need the right to arrange', () => {
  const { documents } = house();
  expect(documents.widgetsOps('use', [{ remove: 'w-1' }])).toEqual({ error: 'role' });
  expect(documents.widgetsOps('edit', [{ nonsense: 1 }])).toEqual({ error: 'bad' });
  expect(documents.widgetsOps('edit', [{ remove: 'w-1' }])).toMatchObject({ doc: { revision: expect.any(Number) } });
});
