import { expect, test } from 'vitest';
import { cap, device, snapshot } from '../helpers/build';
import { generateDashboard } from '../../src/dashboard/generate';
import { bare, battery, climate, dimLamp, dish, meter, motion, plainLamp, plug, remote, solar, tank } from './samples';

const all = snapshot([dimLamp, plainLamp, plug, climate, motion, tank, dish, remote, bare, battery, solar, meter], {
  flows: [{ id: 'f2', name: 'Slaapstand', kind: 'advanced', startable: true }, { id: 'f1', name: 'Alles uit', kind: 'flow', startable: true }, { id: 'f3', name: 'Uit', kind: 'flow', startable: false }],
});
test('sections follow the fixed order and empty ones are left out', () => {
  const d = generateDashboard(all, { grouping: 'type' });
  expect(d.sections.map((s) => s.kind)).toEqual(['lights', 'switches', 'climate', 'water', 'security', 'other', 'flows']);
  expect(d.sections[0]).toMatchObject({ titleKey: 'section.lights' });
  expect(generateDashboard(snapshot([plug]), { grouping: 'type' }).sections.map((s) => s.kind)).toEqual(['switches']);
});
test('wide tiles come first, then by name', () => {
  const d = generateDashboard(all, { grouping: 'type' });
  expect(d.sections[0]?.tiles.map((t) => t.kind)).toEqual(['light', 'switch']);
});
test('every device is in the hero or in exactly one section', () => {
  const d = generateDashboard(all, { grouping: 'type' });
  const where = new Map<string, string[]>();
  for (const id of d.hero?.deviceIds ?? []) where.set(id, ['hero']);
  for (const s of d.sections) {
    const ids = new Set(s.tiles.flatMap((t) => ('deviceId' in t ? [t.deviceId] : [])));
    for (const id of ids) where.set(id, [...(where.get(id) ?? []), s.kind]);
  }
  expect([...where.keys()].sort()).toEqual(Object.keys(all.devices).sort());
  expect([...where.values()].every((places) => places.length === 1)).toBe(true);
});
test('only startable flows, sorted by name', () => {
  const flows = generateDashboard(all, { grouping: 'type' }).sections.at(-1);
  expect(flows?.tiles).toEqual([
    { kind: 'flow', id: 'flow:f1', flowId: 'f1', flowKind: 'flow', size: 'single' },
    { kind: 'flow', id: 'flow:f2', flowId: 'f2', flowKind: 'advanced', size: 'single' },
  ]);
});
test('an empty Homey gives an empty dashboard', () => {
  expect(generateDashboard(snapshot([]), { grouping: 'type' })).toEqual({ hero: null, sections: [] });
});
test('sections carry an id that is unique within the dashboard', () => {
  const ids = generateDashboard(all, { grouping: 'type' }).sections.map((s) => s.id);
  expect(ids).toContain('type:lights');
  expect(new Set(ids).size).toBe(ids.length);
});

test('the generator sorts names with the given locale', () => {
  const plug = (id: string, name: string) => device({ id, name, deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: false })] });
  const both = snapshot([plug('a', 'Zolder'), plug('b', 'Ätherkast')]);
  const names = (locale?: string) => generateDashboard(both, { grouping: 'type', ...(locale ? { locale } : {}) }).sections[0]!.tiles.map((tile) => ('deviceId' in tile ? tile.deviceId : ''));
  // Dutch and English sort Ä with A; Swedish puts it after Z.
  expect(names()).toEqual(['b', 'a']);
  expect(names('en')).toEqual(['b', 'a']);
  expect(names('sv')).toEqual(['a', 'b']);
});

test('the generator still gives the sizes of part 1', () => {
  const tiles = generateDashboard(all, { grouping: 'type' }).sections.flatMap((s) => s.tiles);
  expect(new Set(tiles.map((tile) => tile.kind))).toEqual(new Set(['light', 'switch', 'sensor', 'tank', 'generic', 'multi', 'button', 'flow']));
  for (const tile of tiles) expect([tile.kind, tile.size]).toEqual([tile.kind, tile.kind === 'light' || tile.kind === 'multi' ? 'wide' : 'single']);
});

test('buttons come before the other flows; without a key they are the only ones', () => {
  const button = (name: string) => ({ id: `button:${name.toLowerCase()}`, name, kind: 'flow' as const, startable: true });
  const hub = { ...all, flows: [...all.flows, button('Zonsondergang'), button('Film')] };
  const ids = (snapshot: typeof hub, grouping: 'type' | 'zone') => generateDashboard(snapshot, { grouping }).sections.find((s) => s.kind === 'flows')?.tiles.map((tile) => tile.id);
  for (const grouping of ['type', 'zone'] as const) {
    expect(ids(hub, grouping)).toEqual(['flow:button:film', 'flow:button:zonsondergang', 'flow:f1', 'flow:f2']);
    expect(ids({ ...hub, flowAccess: 'none' }, grouping)).toEqual(['flow:button:film', 'flow:button:zonsondergang']);
    expect(ids({ ...hub, flowAccess: 'refused' }, grouping)).toHaveLength(4);
    expect(ids({ ...all, flowAccess: 'none' }, grouping)).toBeUndefined();
  }
});
