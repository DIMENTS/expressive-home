import { expect, test } from 'vitest';
import { can, missingFeatures } from '../../src/homey/permissions';

test('a broader scope covers a narrower one', () => {
  expect(can(['homey'], 'homey.device.control')).toBe(true);
  expect(can(['homey.device'], 'homey.device.readonly')).toBe(true);
  expect(can(['homey.device.readonly'], 'homey.device.control')).toBe(false);
  expect(can([], 'homey.zone.readonly')).toBe(false);
});
test('a prefix only counts at a dot boundary', () => {
  expect(can(['homey.dev'], 'homey.device.readonly')).toBe(false);
  expect(can(['homey.device.readonly'], 'homey.device.readonly')).toBe(true);
});
test('missing features follow from the scopes', () => {
  expect(missingFeatures(['homey'])).toEqual([]);
  expect(missingFeatures(['homey.device.readonly', 'homey.zone.readonly'])).toEqual(['controlDevices', 'readFlows', 'startFlows', 'readInsights', 'readSystem']);
});
