import { expect, test } from 'vitest';
import { t } from '../../../src/i18n';
import { flowView, tileView } from '../../../src/ui/model/tile-view';
import type { DeviceTileSpec } from '../../../src/dashboard/types';
import type { Capability } from '../../../src/homey/types';
import { cap, device } from '../../helpers/build';

const lamp = (on: boolean, dim: number) => device({ id: 'l', name: 'Plafond', deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: on }), cap('dim', { setable: true, min: 0, max: 1, value: dim })] });
const lightSpec = { kind: 'light', id: 'l:light', deviceId: 'l', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' } as const;

test('a lamp that is on', () => {
  expect(tileView(lightSpec, lamp(true, 0.8), t)).toMatchObject({ name: 'Plafond', state: 'on', stateText: 'Aan · 80%', level: 80, tap: 'toggle', ariaLabel: 'Plafond, Aan · 80%' });
});
test('a lamp that is off remembers its level', () => {
  expect(tileView(lightSpec, lamp(false, 0.6), t)).toMatchObject({ state: 'off', stateText: 'Uit', level: 60 });
});
test('a lamp without an on/off capability is on when its level is above zero', () => {
  expect(tileView({ ...lightSpec, onoffCapabilityId: null }, lamp(false, 0.3), t).state).toBe('on');
  expect(tileView({ ...lightSpec, onoffCapabilityId: null }, lamp(false, 0), t).state).toBe('off');
});

test('a switch shows its detail value while on', () => {
  const plug = device({ id: 'p', name: 'Koelkast', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_power', { units: 'W', decimals: 2, value: 45.37 })] });
  const spec = { kind: 'switch', id: 'p:switch', deviceId: 'p', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: 'measure_power' } as const;
  expect(tileView(spec, plug, t)).toMatchObject({ stateText: 'Aan · 45 W', state: 'on', tap: 'toggle', icon: 'power' });
  expect(tileView({ ...spec, detailCapabilityId: null }, plug, t).stateText).toBe('Aan');
  const off = device({ id: 'p', name: 'Koelkast', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: false }), cap('measure_power', { units: 'W', value: 0 })] });
  expect(tileView(spec, off, t)).toMatchObject({ stateText: 'Uit', state: 'off' });
});
test('a switch whose detail value is missing shows only Aan', () => {
  const plug = device({ id: 'p', name: 'Pomp', deviceClass: 'socket', caps: [cap('onoff', { type: 'boolean', setable: true, value: true }), cap('measure_power', { units: 'W', value: null })] });
  expect(tileView({ kind: 'switch', id: 'p:switch', deviceId: 'p', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: 'measure_power' }, plug, t).stateText).toBe('Aan');
});

const climateCaps = [cap('measure_temperature', { title: 'Temperatuur', units: '°C', decimals: 1, value: 20.5 }), cap('measure_humidity', { title: 'Luchtvochtigheid', units: '%', value: 52 })];
const climate = device({ id: 'k', name: 'Klimaatsensor', deviceClass: 'sensor', caps: climateCaps });
const sensorSpec = { kind: 'sensor', id: 'k:measure_temperature', deviceId: 'k', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: true } as const;
test('a sensor shows its value and, when asked, the capability title', () => {
  expect(tileView(sensorSpec, climate, t)).toMatchObject({ value: { text: '20,5', unit: '°C' }, subText: 'Temperatuur', tap: 'open', state: 'neutral', icon: 'thermostat', ariaLabel: 'Klimaatsensor, Temperatuur 20,5 °C' });
  expect(tileView({ ...sensorSpec, showCapabilityTitle: false }, climate, t)).toMatchObject({ subText: '', ariaLabel: 'Klimaatsensor, 20,5 °C' });
});

const tank = (caps: Capability[]) => device({ id: 't', name: 'Schoon water', deviceClass: 'other', caps });
const tankSpec = { kind: 'tank', id: 't:tank', deviceId: 't', size: 'single', levelCapabilityId: 'tank_level', volumeCapabilityId: 'measure_content_volume', capacityCapabilityId: 'tank_capacity' } as const;
test('a tank shows its level and "58 van 90 liter"', () => {
  const full = tank([cap('tank_level', { units: '%', value: 64 }), cap('measure_content_volume', { units: 'L', value: 58 }), cap('tank_capacity', { units: 'L', value: 90 })]);
  expect(tileView(tankSpec, full, t)).toMatchObject({ level: 64, value: { text: '64', unit: '%' }, subText: '58 van 90 liter', tap: 'open', icon: 'water_drop' });
  const volumeOnly = tank([cap('tank_level', { units: '%', value: 64 }), cap('measure_content_volume', { units: 'L', value: 58 })]);
  expect(tileView({ ...tankSpec, capacityCapabilityId: null }, volumeOnly, t).subText).toBe('58 L');
  const levelOnly = tank([cap('tank_level', { units: '%', value: 64 })]);
  expect(tileView({ ...tankSpec, volumeCapabilityId: null, capacityCapabilityId: null }, levelOnly, t).subText).toBe('');
});
test('a tank without a level works it out from volume and capacity', () => {
  const noLevel = tank([cap('measure_content_volume', { units: 'L', value: 45 }), cap('tank_capacity', { units: 'L', value: 90 })]);
  expect(tileView({ ...tankSpec, levelCapabilityId: null }, noLevel, t)).toMatchObject({ level: 50, value: { text: '50', unit: '%' } });
  expect(tileView({ ...tankSpec, levelCapabilityId: null, capacityCapabilityId: null }, noLevel, t)).toMatchObject({ level: null, value: { text: '–', unit: '' } });
});

test('a multi-value tile shows a status and three cells with their titles', () => {
  const starlink = device({ id: 's', name: 'Starlink', deviceClass: 'other', caps: [
    cap('download', { title: 'Download', units: 'Mbit/s', value: 182.4 }), cap('status', { type: 'string', title: 'Status', value: 'Online' }),
    cap('upload', { title: 'Upload', units: 'Mbit/s', value: 21 }), cap('latency', { title: 'Vertraging', units: 'ms', value: 34 }),
  ] });
  const view = tileView({ kind: 'multi', id: 's:multi', deviceId: 's', size: 'wide', capabilityIds: ['download', 'upload', 'latency'] }, starlink, t);
  expect(view).toMatchObject({ stateText: 'Online', tap: 'open', state: 'neutral', icon: 'devices_other' });
  expect(view.cells).toEqual([
    { value: { text: '182', unit: 'Mbit/s' }, label: 'Download' }, { value: { text: '21', unit: 'Mbit/s' }, label: 'Upload' }, { value: { text: '34', unit: 'ms' }, label: 'Vertraging' },
  ]);
  expect(view.ariaLabel).toBe('Starlink, Online, Download 182 Mbit/s, Upload 21 Mbit/s, Vertraging 34 ms');
});
test('a multi-value tile keeps a cell with a dash when its capability vanished', () => {
  const view = tileView({ kind: 'multi', id: 's:multi', deviceId: 's', size: 'wide', capabilityIds: ['a', 'gone'] }, device({ id: 's', caps: [cap('a', { title: 'A', value: 1 })] }), t);
  expect(view.cells).toEqual([{ value: { text: '1', unit: '' }, label: 'A' }, { value: { text: '–', unit: '' }, label: '' }]);
});

const generic = (id: string, value: boolean | null, extra: Partial<Capability> = {}) => device({ id: 'g', name: 'Melder', deviceClass: 'sensor', caps: [cap(id, { type: 'boolean', value, ...extra })] });
const genericSpec = (capabilityId: string | null): DeviceTileSpec => ({ kind: 'generic', id: 'g:generic', deviceId: 'g', size: 'single', capabilityId });
test('a generic tile on an alarm is neutral, on or danger', () => {
  expect(tileView(genericSpec('alarm_contact'), generic('alarm_contact', true, { titleTrue: 'Open', titleFalse: 'Dicht' }), t)).toMatchObject({ state: 'on', stateText: 'Open', icon: 'door_front' });
  expect(tileView(genericSpec('alarm_smoke'), generic('alarm_smoke', true), t)).toMatchObject({ state: 'danger', stateText: 'Ja', icon: 'detector_smoke' });
  expect(tileView(genericSpec('alarm_smoke'), generic('alarm_smoke', false), t)).toMatchObject({ state: 'neutral', stateText: 'Nee' });
  expect(tileView(genericSpec('alarm_no_ac_input'), generic('alarm_no_ac_input', true), t).state).toBe('neutral');
});
test('a generic tile without a capability shows only the name', () => {
  expect(tileView(genericSpec(null), device({ id: 'g', name: 'Kaal', deviceClass: 'other', caps: [] }), t)).toMatchObject({ stateText: '', ariaLabel: 'Kaal', tap: 'open' });
});

test('a button tile presses', () => {
  const bell = device({ id: 'b', name: 'Deurbel', deviceClass: 'button', caps: [cap('button', { type: 'boolean', setable: true, getable: false })] });
  expect(tileView({ kind: 'button', id: 'b:button', deviceId: 'b', size: 'single', capabilityId: 'button' }, bell, t)).toMatchObject({ stateText: 'Indrukken', tap: 'press', icon: 'touch_app' });
});

test('a low battery warns and fills an empty state line', () => {
  const remote = device({ id: 'g', name: 'Afstandsbediening', deviceClass: 'remote', caps: [cap('measure_battery', { units: '%', value: 9 })] });
  expect(tileView(genericSpec(null), remote, t)).toMatchObject({ warn: true, stateText: 'Batterij bijna leeg' });
  const sensor = device({ id: 'k', name: 'Klimaatsensor', deviceClass: 'sensor', caps: [...climateCaps, cap('alarm_battery', { type: 'boolean', value: true })] });
  expect(tileView(sensorSpec, sensor, t)).toMatchObject({ warn: true, subText: 'Temperatuur' });
});
test('a low battery is also read out, never only shown as an icon', () => {
  const sensor = device({ id: 'k', name: 'Klimaatsensor', deviceClass: 'sensor', caps: [...climateCaps, cap('alarm_battery', { type: 'boolean', value: true })] });
  expect(tileView(sensorSpec, sensor, t).ariaLabel).toBe('Klimaatsensor, Temperatuur 20,5 °C, Batterij bijna leeg');
  const remote = device({ id: 'g', name: 'Afstandsbediening', deviceClass: 'remote', caps: [cap('measure_battery', { units: '%', value: 9 })] });
  expect(tileView(genericSpec(null), remote, t).ariaLabel).toBe('Afstandsbediening, Batterij bijna leeg');
});

test('an unavailable device shows the reason of the hub and only opens', () => {
  const gone = { ...lamp(true, 0.5), available: false, unavailableMessage: 'Apparaat is offline' };
  expect(tileView(lightSpec, gone, t)).toMatchObject({ state: 'unavailable', stateText: 'Apparaat is offline', tap: 'open', icon: 'link_off', ariaLabel: 'Plafond, Apparaat is offline' });
  expect(tileView(lightSpec, { ...gone, unavailableMessage: null }, t).stateText).toBe('Niet bereikbaar');
});

test('missing things never throw', () => {
  expect(tileView(lightSpec, undefined, t)).toMatchObject({ name: 'Apparaat verdwenen', state: 'unavailable', tap: 'open' });
  expect(tileView(lightSpec, device({ id: 'l', name: '', deviceClass: 'light', caps: [] }), t)).toMatchObject({ name: 'Naamloos apparaat', stateText: 'Uit', level: null });
  expect(tileView(sensorSpec, device({ id: 'k', name: 'Leeg', caps: [cap('measure_temperature', { units: '°C', value: null })] }), t)).toMatchObject({ value: { text: '–', unit: '' } });
  expect(tileView(sensorSpec, device({ id: 'k', name: 'Weg', caps: [] }), t)).toMatchObject({ value: { text: '–', unit: '' }, subText: '' });
  expect(tileView(lightSpec, lamp(true, Number.NaN), t)).toMatchObject({ stateText: 'Aan', level: null });
});

test('a flow tile carries its name', () => {
  const spec = { kind: 'flow', id: 'f:flow', flowId: 'f', flowKind: 'flow', size: 'single' } as const;
  expect(flowView(spec, { id: 'f', name: 'Alles uit', kind: 'flow', startable: true }, t)).toEqual({ name: 'Alles uit', ariaLabel: 'Alles uit' });
  expect(flowView(spec, undefined, t).name).toBe('Flow verdwenen');
  expect(flowView(spec, { id: 'f', name: ' ', kind: 'flow', startable: true }, t).name).toBe('Naamloze flow');
});
