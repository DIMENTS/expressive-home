import { expect, test } from 'vitest';
import { cap, device } from '../helpers/build';
import { activeAlarms, alarmKind, dangerAlarms, findCapability, hasLowBattery, isHomeBattery, isMinor, isTank, mainValues, tankLevel } from '../../src/recognition/recognize';
import * as table from '../../src/recognition/table';

const victron = device({ caps: [cap('battery_soc', { value: 78 }), cap('time_to_go', { value: 3120 }), cap('measure_power', { value: -186 })] });
const sensor = device({ deviceClass: 'sensor', caps: [cap('measure_temperature', { value: 20.5 }), cap('measure_battery', { value: 12 }), cap('rssi', { value: -60 }), cap('lastseen_date', { type: 'string', value: 'x' })] });
const classBattery = device({ deviceClass: 'battery', caps: [cap('measure_battery', { value: 64 })] });

test('a home battery is a battery-class device or one with an app state of charge', () => {
  expect(isHomeBattery(victron)).toBe(true);
  expect(isHomeBattery(classBattery)).toBe(true);
  expect(isHomeBattery(sensor)).toBe(false);
  expect(isHomeBattery(device({ energy: { cumulative: false, homeBattery: true } }))).toBe(true);
});
test('state of charge prefers the app capability', () => {
  expect(findCapability(victron, 'battery.soc')?.id).toBe('battery_soc');
  expect(findCapability(classBattery, 'battery.soc')?.id).toBe('measure_battery');
  expect(findCapability(victron, 'battery.timeToGo')?.id).toBe('time_to_go');
  expect(findCapability(sensor, 'tank.level')).toBeUndefined();
});
test('main values are numeric, readable and not minor, in device order', () => {
  expect(mainValues(sensor).map((c) => c.id)).toEqual(['measure_temperature']);
  const multi = device({ caps: [cap('measure_temperature.outside', { value: 1 }), cap('onoff', { type: 'boolean', value: true }), cap('hidden', { getable: false, value: 2 })] });
  expect(mainValues(multi).map((c) => c.id)).toEqual(['measure_temperature.outside']);
});
test('low battery applies to battery-powered devices only', () => {
  expect(hasLowBattery(sensor)).toBe(true);
  expect(hasLowBattery(device({ caps: [cap('alarm_battery', { type: 'boolean', value: true })] }))).toBe(true);
  expect(hasLowBattery(device({ caps: [cap('measure_battery', { value: 15 })] }))).toBe(false);
  expect(hasLowBattery(classBattery)).toBe(false);
});
test('active alarms are true boolean alarm_* capabilities', () => {
  const d = device({ caps: [cap('alarm_generic', { type: 'boolean', value: true }), cap('alarm_motion', { type: 'boolean', value: false }), cap('alarm_x', { type: 'boolean', value: null })] });
  expect(activeAlarms(d).map((c) => c.id)).toEqual(['alarm_generic']);
});
test('a tank reports a level or a content volume', () => {
  expect(isTank(device({ caps: [cap('tank_level', { value: 64 })] }))).toBe(true);
  expect(isTank(device({ caps: [cap('measure_content_volume', { value: 58 })] }))).toBe(true);
  expect(isTank(victron)).toBe(false);
});

test('camper housekeeping capabilities are never main values', () => {
  for (const id of ['deviceGen2', 'deviceGen4', 'multiInputs', 'actionEvents', 'input_1']) {
    expect(mainValues(device({ caps: [cap(id, { value: 1 })] })), id).toEqual([]);
  }
});

test.each([['alarm_smoke', 'danger'], ['alarm_generic', 'danger'], ['alarm_battery', 'danger'], ['alarm_motion', 'activity'], ['presence', 'activity'],
  ['alarm_starlink_heating', 'status'], ['alarm_power', 'status'], ['alarm_live', 'status'], ['alarm_tank_missing', 'status']])('alarmKind(%s) is %s', (id, kind) => { expect(alarmKind(id)).toBe(kind); });

test('danger alarms are the true capabilities of the danger kind, sub-capabilities included', () => {
  const d = device({ caps: [
    cap('alarm_smoke', { type: 'boolean', value: true }), cap('alarm_water.kitchen', { type: 'boolean', value: true }), cap('alarm_co', { type: 'boolean', value: false }),
    cap('alarm_motion', { type: 'boolean', value: true }), cap('alarm_no_ac_input', { type: 'boolean', value: true }), cap('alarm_heat', { type: 'boolean', value: null }),
  ] });
  expect(dangerAlarms(d).map((c) => c.id)).toEqual(['alarm_smoke', 'alarm_water.kitchen']);
});

test.each([['input_1', true], ['input_12', true], ['input_voltage', false], ['input_', false], ['lastseen_x', true], ['rssi', true], ['measure_power', false]] as const)('isMinor(%s)', (id, minor) => {
  expect(isMinor(id)).toBe(minor);
});

test('the lists that classify devices live in the recognition table', () => {
  expect(table.SECURITY_CLASSES).toContain('lock');
  expect(table.SECURITY_ALARMS).toContain('alarm_contact');
  expect(table.CLIMATE_CLASSES).toContain('thermostat');
  expect(table.CLIMATE_VALUES).toContain('measure_temperature');
  expect(table.MINOR_CAPABILITIES).toContain('input_#');
  expect(table.MINOR_CAPABILITIES).not.toContain('input_*');
});

test('how full a tank is: its level, or else its content and its size', () => {
  const tank = (...caps: Parameters<typeof cap>[]) => device({ caps: caps.map(([id, part]) => cap(id, part)) });
  expect(tankLevel(tank(['tank_level', { value: 63.6 }]))).toBe(64);
  expect(tankLevel(tank(['tank_level', { value: 130 }]))).toBe(100);
  expect(tankLevel(tank(['tank_level', { value: -4 }]))).toBe(0);
  expect(tankLevel(tank(['measure_content_volume', { value: 9 }], ['tank_capacity', { value: 90 }]))).toBe(10);
  expect(tankLevel(tank(['tank_level', { value: null }], ['measure_content_volume', { value: 45 }], ['tank_capacity', { value: 90 }]))).toBe(50);
  for (const none of [tank(['tank_level', { value: null }]), tank(['tank_level', { value: Number.NaN }]), tank(['measure_content_volume', { value: 9 }], ['tank_capacity', { value: 0 }]), tank(['dim', { value: 3 }])]) expect(tankLevel(none)).toBeNull();
});
