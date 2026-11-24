import { expect, test } from 'vitest';
import camperRaw from '../../src/mock/fixtures/camper.raw.json';
import { toSnapshot } from '../../src/homey/map';
import type { RawHomey } from '../../src/homey/types';
import { generateDashboard } from '../../src/dashboard/generate';

const snap = toSnapshot(camperRaw as unknown as RawHomey);

test('the camper dashboard has a battery hero and every device exactly once', () => {
  const d = generateDashboard(snap, { grouping: 'type' });
  expect(d.hero?.kind).toBe('battery');
  const seen = new Map<string, number>();
  for (const id of d.hero?.deviceIds ?? []) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const s of d.sections) {
    for (const id of new Set(s.tiles.flatMap((t) => ('deviceId' in t ? [t.deviceId] : [])))) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  expect(Object.keys(snap.devices)).toHaveLength(27);
  expect([...seen.keys()].sort()).toEqual(Object.keys(snap.devices).sort());
  expect([...seen.values()].every((n) => n === 1)).toBe(true);
});

test('the camper dashboard matches the stored snapshot', () => {
  expect(generateDashboard(snap, { grouping: 'type' })).toMatchSnapshot();
});

test('the camper hero shows solar, consumption, shore and net, and there is a security section', () => {
  const d = generateDashboard(snap, { grouping: 'type' });
  expect(d.hero?.stats.map((s) => s.role)).toEqual(['solar', 'consumption', 'shore', 'net']);
  expect(d.sections.map((s) => s.kind)).toContain('security');
});
