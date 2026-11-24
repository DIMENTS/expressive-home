import { expect, test } from 'vitest';
import { t } from '../../../src/i18n';
import { headerChips } from '../../../src/ui/model/header-view';
import { cap, device } from '../../helpers/build';

const alarmed = (name: string) => device({ id: name.toLowerCase(), name, caps: [cap('alarm_generic', { type: 'boolean', title: 'Algemeen alarm', value: true })] });
const base = { route: 'local' as const, connecting: false, canControl: true, demo: false };

test('the route chip comes first, then at most three danger alarms and a counter', () => {
  const devices = ['Echo', 'Bravo', 'Delta', 'Alfa', 'Charlie'].map(alarmed);
  expect(headerChips({ ...base, devices }, t)).toEqual([
    { kind: 'route', route: 'local', connecting: false },
    { kind: 'alarm', deviceId: 'alfa', text: 'Alfa · Algemeen alarm' },
    { kind: 'alarm', deviceId: 'bravo', text: 'Bravo · Algemeen alarm' },
    { kind: 'alarm', deviceId: 'charlie', text: 'Charlie · Algemeen alarm' },
    { kind: 'more', count: 2 },
  ]);
});

test('activity and status flags make no chip', () => {
  const devices = [device({ id: 'm', name: 'Melder', caps: [cap('alarm_motion', { type: 'boolean', value: true }), cap('alarm_no_ac_input', { type: 'boolean', value: true })] })];
  expect(headerChips({ ...base, devices }, t)).toEqual([{ kind: 'route', route: 'local', connecting: false }]);
});

test('read-only and demo chips follow the alarms', () => {
  const chips = headerChips({ ...base, devices: [alarmed('Alfa')], canControl: false, demo: true }, t);
  expect(chips.map((c) => c.kind)).toEqual(['route', 'alarm', 'readonly', 'demo']);
});

test('while connecting the route chip says so', () => {
  expect(headerChips({ ...base, route: null, connecting: true, devices: [] }, t)[0]).toEqual({ kind: 'route', route: null, connecting: true });
});
