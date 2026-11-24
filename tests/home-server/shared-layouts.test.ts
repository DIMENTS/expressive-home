import { expect, test } from 'vitest';
import { createSharedLayouts } from '../../src/home-server/shared-layouts';
import { board, hubLayout, overview, ownSection, sensorTile } from '../helpers/layout';

const ID = '5f2a00000000000000000c81';
const layouts = (name: string) => ({ [ID]: hubLayout([overview([ownSection('own:a', [sensorTile('t-1', 'device-13')])]), board('d-1', [], { name })]) });

function setup(stored: unknown = undefined) {
  let kept: unknown = stored;
  const shared = createSharedLayouts({ load: () => kept, save: (doc) => { kept = structuredClone(doc); } });
  return { shared, kept: () => kept, again: () => createSharedLayouts({ load: () => kept, save: () => {} }) };
}

test('it starts empty, and keeps what is put', () => {
  const s = setup();
  expect(s.shared.get()).toEqual({ revision: 0, layouts: {}, sectionSeeds: {} });
  const put = s.shared.put(0, { layouts: layouts('Buiten'), sectionSeeds: { 'type:lights': '#a6422a' } });
  expect(put).toMatchObject({ ok: true, doc: { revision: 1, layouts: layouts('Buiten'), sectionSeeds: { 'type:lights': '#a6422a' } } });
  expect(s.again().get()).toEqual(s.shared.get());
});

test('what is based on an older revision is refused, with what there is now', () => {
  const s = setup();
  s.shared.put(0, { layouts: layouts('Buiten'), sectionSeeds: {} });
  const late = s.shared.put(0, { layouts: layouts('Energie'), sectionSeeds: {} });
  expect(late).toMatchObject({ ok: false, doc: { revision: 1, layouts: layouts('Buiten') } });
  expect(s.shared.put(1, { layouts: layouts('Energie'), sectionSeeds: {} })).toMatchObject({ ok: true, doc: { revision: 2 } });
});

test('whoever listens hears of a new revision; the same again is none', () => {
  const s = setup();
  const heard: number[] = [];
  const stop = s.shared.subscribe((revision) => heard.push(revision));
  s.shared.put(0, { layouts: layouts('Buiten'), sectionSeeds: {} });
  expect(s.shared.put(1, { layouts: layouts('Buiten'), sectionSeeds: {} })).toMatchObject({ ok: true, doc: { revision: 1 } });
  stop();
  s.shared.put(1, { layouts: layouts('Energie'), sectionSeeds: {} });
  expect(heard).toEqual([1]);
});

test('what is put or was kept goes through the same checks as the storage of a browser', () => {
  const s = setup({ revision: 'x', layouts: { [ID]: { dashboards: [{ id: 'overview', sections: 'x' }] }, nonsense: 5 }, sectionSeeds: { __proto__: '#000000', 'type:water': 'blauw' } });
  expect(s.shared.get()).toMatchObject({ revision: 0, sectionSeeds: {} });
  expect(Object.keys(s.shared.get().layouts)).toEqual([ID]);
  const put = s.shared.put(0, { layouts: { [ID]: { dashboards: [{ id: 'overview', name: null, icon: null, sections: [{ id: 'own:a', kind: 'bom' }, { id: 'own:b', kind: 'own', column: 'left', name: '<b>x</b>', icon: null, tiles: [] }] }] } }, sectionSeeds: { 'type:lights': '#a6422a', x: '#000000' } });
  expect(put.doc.sectionSeeds).toEqual({ 'type:lights': '#a6422a' });
  expect(put.doc.layouts[ID]!.dashboards[0]!.sections!.map((x) => x.id)).toEqual(['own:b']);
  expect(s.shared.put(1, 'rubbish').doc.layouts).toEqual({});
});
