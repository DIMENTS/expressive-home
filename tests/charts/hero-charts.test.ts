import { expect, test } from 'vitest';
import type { HistorySource } from '../../src/homey/client';
import { heroSourceOf } from '../../src/charts/hero-charts';

test('when Homey keeps a value itself and the app recorded it too, the log of Homey counts', () => {
  const ref = { deviceId: 'd', capabilityId: 'measure_power' };
  const recorded: HistorySource = { log: 'homey:app:app.expressive.home:rec_1', kind: 'recorded', type: 'number', ...ref };
  const device: HistorySource = { log: 'homey:device:d:measure_power', kind: 'device', type: 'number', ...ref };
  expect(heroSourceOf([recorded, device], ref)).toBe(device);
  expect(heroSourceOf([recorded], ref)).toBe(recorded);
  expect(heroSourceOf([device], null)).toBeNull();
});
