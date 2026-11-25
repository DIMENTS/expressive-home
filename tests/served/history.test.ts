import { afterEach, expect, test } from 'vitest';
import type { HistorySource } from '../../src/homey/client';
import { createServedClient } from '../../src/served/client';
import { bed, closeBeds, device } from './bed';

// History on a paired device: through the routes of the app, as it reads Insights with its own session.

afterEach(closeBeds);

const power: HistorySource = { log: 'homey:device:device-5:measure_power', kind: 'device', type: 'number', deviceId: 'device-5', capabilityId: 'measure_power' };
const lamp: HistorySource = { log: 'homey:device:device-1:onoff', kind: 'device', type: 'boolean', deviceId: 'device-1', capabilityId: 'onoff' };

test('a device that may only use reads the logs, their points and the changes of on and off', async () => {
  const b = await bed();
  b.hub.listHistory.mockResolvedValue([power, lamp]);
  b.hub.readSeries.mockResolvedValue({ start: 0, end: 300_000, step: 300_000, updatesIn: 60_000, points: [{ at: 0, value: null }, { at: 300_000, value: 4 }] });
  b.hub.readSwitches.mockResolvedValue({ changes: [{ at: 7, on: true }] });
  const d = device(b);
  await d.pair('use');
  const client = createServedClient(d.link);
  expect(await client.listHistory()).toEqual([power, lamp]);
  expect(await client.readSeries(power, 'last7Days')).toEqual({ start: 0, end: 300_000, step: 300_000, updatesIn: 60_000, points: [{ at: 0, value: null }, { at: 300_000, value: 4 }] });
  expect(b.hub.readSeries).toHaveBeenCalledWith(power, 'last7Days');
  expect(await client.readSwitches(lamp)).toEqual({ changes: [{ at: 7, on: true }] });
});

test('what the app gives is checked; a log that is gone is none; a hub that refuses is an error', async () => {
  const b = await bed();
  b.hub.listHistory.mockResolvedValue([power, lamp, { log: 42 } as unknown as HistorySource]);
  b.hub.readSeries.mockResolvedValue({ start: 0, end: 1, step: 1, updatesIn: null, points: [{ at: 'x', value: 2 }, { at: 1, value: 'y' }] } as never);
  const d = device(b);
  await d.pair('use');
  const client = createServedClient(d.link);
  expect(await client.listHistory()).toEqual([power, lamp]);
  expect((await client.readSeries(power, 'today'))!.points).toEqual([{ at: 1, value: null }]);
  expect(await client.readSeries({ ...power, log: 'homey:device:x:y' }, 'today')).toBeNull();
  b.hub.readSwitches.mockRejectedValue(new Error('slow'));
  await expect(client.readSwitches(lamp)).rejects.toThrow();
});
