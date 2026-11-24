import { expect, test } from 'vitest';
import camperRaw from '../../../src/mock/fixtures/camper.raw.json';
import { generateDashboard } from '../../../src/dashboard/generate';
import { toSnapshot } from '../../../src/homey/map';
import type { RawHomey } from '../../../src/homey/types';
import { demoRaw, simulationRate } from '../../../src/ui/app/demo';

test('the demo hub has the make-up of the camper and friendly names', () => {
  const raw = demoRaw();
  const names = Object.values(raw.devices).map((d) => (d as { name: string }).name);
  expect(names).toHaveLength(27);
  expect(names.some((n) => /^(Lamp|Stekker|Sensor|Apparaat|Knop|Accu|Zonnepaneel) \d+$/.test(n))).toBe(false);
  expect(new Set(names).size).toBe(27);
});

test('zones and flows have friendly names too', () => {
  const raw = demoRaw();
  for (const zone of Object.values(raw.zones)) expect((zone as { name: string }).name).not.toMatch(/^Zone \d+$/);
  for (const flow of [...Object.values(raw.flows), ...Object.values(raw.advancedFlows)]) expect((flow as { name: string }).name).not.toMatch(/Flow \d+$/);
});

test('the demo dashboard has the same sections and counts as the camper', () => {
  const sections = (raw: RawHomey) => generateDashboard(toSnapshot(raw), { grouping: 'type' }).sections.map((s) => `${s.kind}:${s.tiles.length}`);
  expect(sections(demoRaw())).toEqual(sections(camperRaw as unknown as RawHomey));
});

test('the fixture itself is left untouched', () => {
  demoRaw();
  expect(Object.values((camperRaw as unknown as RawHomey).devices).map((d) => (d as { name: string }).name)).toContain('Lamp 1');
});

test('the example hub reads how many reports a second to simulate from the address', () => {
  expect(simulationRate('?simulatie=17')).toBe(17);
  expect(simulationRate('?a=1&simulatie=2.5')).toBe(2.5);
  expect(simulationRate('')).toBeUndefined();
  expect(simulationRate('?simulatie=nee')).toBeUndefined();
  expect(simulationRate('?simulatie=0')).toBeUndefined();
  expect(simulationRate('?simulatie=-3')).toBeUndefined();
  // never more than a hundred a second
  expect(simulationRate('?simulatie=5000')).toBe(100);
});
