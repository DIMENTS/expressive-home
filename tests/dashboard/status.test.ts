import { expect, test } from 'vitest';
import { cap, device } from '../helpers/build';
import { statusLabels } from '../../src/dashboard/status';

const alarm = (id: string, on: boolean) => device({ id, name: id, caps: [cap('alarm_generic', { type: 'boolean', value: on })] });

test('the route label is always first', () => {
  expect(statusLabels([], null)).toEqual([{ kind: 'route', route: null }]);
  expect(statusLabels([alarm('a', false)], 'local')).toEqual([{ kind: 'route', route: 'local' }]);
});
test('at most three alarms, the rest is counted', () => {
  const labels = statusLabels(['a', 'b', 'c', 'd', 'e'].map((id) => alarm(id, true)), 'cloud');
  expect(labels).toEqual([
    { kind: 'route', route: 'cloud' },
    { kind: 'alarm', deviceId: 'a', capabilityId: 'alarm_generic' },
    { kind: 'alarm', deviceId: 'b', capabilityId: 'alarm_generic' },
    { kind: 'alarm', deviceId: 'c', capabilityId: 'alarm_generic' },
    { kind: 'more', count: 2 },
  ]);
});

test('only danger alarms become header labels', () => {
  const sensor = device({ id: 'm', name: 'Melder', caps: [cap('alarm_motion', { type: 'boolean', value: true }), cap('alarm_generic', { type: 'boolean', value: true }), cap('alarm_power.mains', { type: 'boolean', value: true })] });
  expect(statusLabels([sensor], 'local')).toEqual([{ kind: 'route', route: 'local' }, { kind: 'alarm', deviceId: 'm', capabilityId: 'alarm_generic' }]);
});
