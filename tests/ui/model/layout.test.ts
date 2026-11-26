import { expect, test } from 'vitest';
import camperRaw from '../../../src/mock/fixtures/camper.raw.json';
import { toSnapshot } from '../../../src/homey/map';
import type { RawHomey } from '../../../src/homey/types';
import { generateDashboard } from '../../../src/dashboard/generate';
import { SECTION_ORDER, sectionId, type Section, type SectionKind } from '../../../src/dashboard/types';
import { t } from '../../../src/i18n';
import { sectionCount, sectionIcon, splitColumns } from '../../../src/ui/model/layout';
import { cap, device } from '../../helpers/build';

const camperSnapshot = toSnapshot(camperRaw as unknown as RawHomey);
const kinds = (list: Section[]) => list.map((s) => s.kind);
const section = (kind: SectionKind, tiles: Section['tiles'] = []): Section => ({ id: sectionId('type', kind), kind, titleKey: `section.${kind}`, tiles });

test('lights and switches go left, the rest right', () => {
  const all = generateDashboard(camperSnapshot, { grouping: 'type' }).sections;
  const { left, right, single } = splitColumns(all, true);
  expect(kinds(left)).toEqual(['lights', 'switches']);
  expect(kinds(right)).toEqual(['climate', 'water', 'security', 'other', 'flows']);
  expect(single).toBe(false);
});

test('when one side would be empty everything goes into one column, in the fixed order', () => {
  expect(splitColumns([section('flows'), section('climate')], false)).toEqual({ left: [section('climate'), section('flows')], right: [], single: true });
  expect(splitColumns([section('lights')], true)).toMatchObject({ single: true, right: [] });
  expect(splitColumns([section('lights'), section('climate')], false)).toMatchObject({ single: false });
  expect(splitColumns([section('climate')], true)).toMatchObject({ single: false, left: [], right: [section('climate')] });
});

test('the count line', () => {
  const lamp = (id: string, on: boolean) => device({ id, name: id, deviceClass: 'light', caps: [cap('onoff', { type: 'boolean', setable: true, value: on }), cap('dim', { setable: true, min: 0, max: 1, value: 0.5 })] });
  const devices = new Map(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => [id, lamp(id, i < 3)]));
  const tiles = [...devices.keys()].map((id) => ({ kind: 'light', id: `${id}:light`, deviceId: id, size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' }) as const);
  expect(sectionCount(section('lights', tiles), (id) => devices.get(id), t)).toBe('3 aan');
  const allOff = new Map([...devices].map(([id]) => [id, lamp(id, false)]));
  expect(sectionCount(section('lights', tiles), (id) => allOff.get(id), t)).toBe('Alles uit');
  expect(sectionCount(section('climate'), () => undefined, t)).toBe('');
  expect(sectionCount(section('lights', tiles), () => undefined, t)).toBe('Alles uit');
});

test('every kind of section has its icon', () => {
  expect(SECTION_ORDER.map(sectionIcon)).toEqual(['lightbulb', 'power', 'thermostat', 'blinds', 'speaker', 'local_laundry_service', 'ev_station', 'water_drop', 'shield', 'category', 'play_circle']);
});
