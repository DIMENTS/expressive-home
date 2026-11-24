import { expect, test } from 'vitest';
import { layoutKey } from '../../src/state/layout-key';
import { cap, device } from '../helpers/build';

const lamp = () => device({ id: 'l1', name: 'Plafond', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('dim', { setable: true, min: 0, max: 1, value: 0.5 })] });

test('the layout key changes with the make-up, not with names or values', () => {
  const base = layoutKey(lamp());
  expect(layoutKey({ ...lamp(), name: 'Anders', zoneId: 'z9', available: false, unavailableMessage: 'weg' })).toBe(base);
  const valued = lamp();
  valued.capabilities['onoff']!.value = true;
  valued.capabilities['dim']!.lastUpdated = '2026-11-22T10:00:00.000Z';
  expect(layoutKey(valued)).toBe(base);
  expect(layoutKey({ ...lamp(), deviceClass: 'socket' })).not.toBe(base);
  expect(layoutKey({ ...lamp(), energy: { cumulative: true, homeBattery: false } })).not.toBe(base);
  const reordered = lamp();
  reordered.capabilityOrder = ['dim', 'onoff'];
  expect(layoutKey(reordered)).not.toBe(base);
  const more = device({ id: 'l1', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true }), cap('dim', { setable: true, min: 0, max: 1 }), cap('light_hue', { setable: true })] });
  expect(layoutKey(more)).not.toBe(base);
  for (const change of [{ setable: false }, { getable: false }, { min: 0.1 }, { max: 2 }, { units: '%' }, { type: 'string' as const }]) {
    const changed = lamp();
    changed.capabilities['dim'] = { ...changed.capabilities['dim']!, ...change };
    expect(layoutKey(changed), JSON.stringify(change)).not.toBe(base);
  }
});
