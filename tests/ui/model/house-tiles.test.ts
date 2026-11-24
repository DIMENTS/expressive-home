import { expect, test } from 'vitest';
import type { DeviceTileSpec, HouseKind, Section } from '../../../src/dashboard/types';
import type { Device } from '../../../src/homey/types';
import { createTranslate } from '../../../src/i18n';
import { sectionCount } from '../../../src/ui/model/layout';
import { tileView } from '../../../src/ui/model/tile-view';
import { cap } from '../../helpers/build';
import { covers, guards, heating, media } from '../../helpers/devices';

// What the tiles of a house say, and when they are in colour.

const [nl, en] = [createTranslate('nl'), createTranslate('en')];
const spec = (kind: HouseKind, d: Device): DeviceTileSpec => ({ kind, id: 't', deviceId: d.id, size: 'single' });
const says = (kind: HouseKind, d: Device, busy: Parameters<typeof tileView>[3] = null) => [nl, en].map((t) => tileView(spec(kind, d), d, t, busy).stateText);
const seen = (kind: HouseKind, d: Device) => { const { icon, state, level, tap } = tileView(spec(kind, d), d, nl); return { icon, state, level, tap }; };
const withValue = (d: Device, id: string, value: unknown): Device => ({ ...d, capabilities: { ...d.capabilities, [id]: { ...d.capabilities[id]!, value: value as never } } });

test.each<[Device, string, string, string]>([
  [heating.ownMode, '20,5° · naar 21°', '20.5° · to 21°', 'on'], [heating.zone, '18,2° · naar 18°', '18.2° · to 18°', 'neutral'],
  [heating.valveBlind, 'Naar 19°', 'To 19°', 'on'], [heating.sauna, 'Uit · 21°', 'Off · 21°', 'off'], [heating.modeReadOnly, 'Uit · 23°', 'Off · 23°', 'off'],
  [heating.infrared, 'Naar 20°', 'To 20°', 'neutral'], [heating.airco, '24,1° · naar 22°', '24.1° · to 22°', 'on'],
  [withValue(heating.zone, 'target_temperature', null), '18,2°', '18.2°', 'neutral'],
  [withValue(withValue(heating.zone, 'target_temperature', null), 'measure_temperature', null), '', '', 'neutral'],
  [withValue(withValue(heating.sauna, 'measure_temperature', null), 'target_temperature', null), 'Uit', 'Off', 'off'],
])('%# heating says what it measures and where it goes', (d, dutch, english, state) => {
  expect([d.name, ...says('climate', d), seen('climate', d).state]).toEqual([d.name, dutch, english, state]);
});

test.each<[Device, string, string, string]>([
  [covers.setOnly, '60% open', '60% open', 'on'], [withValue(covers.setOnly, 'windowcoverings_set', 1), 'Open', 'Open', 'on'], [withValue(covers.setOnly, 'windowcoverings_set', 0), 'Dicht', 'Closed', 'off'],
  // not quite closed is not closed
  [withValue(covers.setOnly, 'windowcoverings_set', 0.004), '1% open', '1% open', 'on'], [withValue(covers.setOnly, 'windowcoverings_set', 0.997), '99% open', '99% open', 'on'],
  [covers.both, 'Gaat dicht…', 'Closing…', 'on'], [withValue(covers.both, 'windowcoverings_state', 'up'), 'Gaat open…', 'Opening…', 'on'],
  [covers.stateOnly, 'Stand onbekend', 'Position unknown', 'neutral'], [withValue(covers.stateOnly, 'windowcoverings_state', 'down'), 'Dicht', 'Closed', 'off'], [covers.noState, 'Stand onbekend', 'Position unknown', 'neutral'],
  [covers.closedOnly, 'Dicht', 'Closed', 'off'], [covers.hundred, '40% open', '40% open', 'on'],
  [covers.awning, 'Ingerold', 'Rolled in', 'off'], [withValue(covers.awning, 'windowcoverings_set', 0.6), '40% uitgerold', '40% out', 'on'], [withValue(covers.awning, 'windowcoverings_set', 0), 'Uitgerold', 'Rolled out', 'on'],
  [withValue(withValue(covers.awning, 'windowcoverings_set', 0.5), 'windowcoverings_state', 'down'), 'Rolt uit…', 'Rolling out…', 'on'],
  [withValue(withValue(covers.awning, 'windowcoverings_set', 0.5), 'windowcoverings_state', 'up'), 'Rolt in…', 'Rolling in…', 'on'],
])('%# a cover says where it is', (d, dutch, english, state) => {
  expect([d.name, ...says('cover', d), seen('cover', d).state]).toEqual([d.name, dutch, english, state]);
});

test.each<[Device, string, string, string]>([
  [media.full, 'Speelt: Nummer', 'Playing: Nummer', 'on'], [withValue(media.full, 'speaker_track', '  '), 'Speelt', 'Playing', 'on'], [withValue(media.full, 'speaker_playing', false), 'Gepauzeerd', 'Paused', 'neutral'],
  [media.bare, 'Gepauzeerd', 'Paused', 'neutral'], [media.tv, 'Aan · volume 18%', 'On · volume 18%', 'on'], [withValue(media.tv, 'volume_mute', true), 'Aan · gedempt', 'On · muted', 'on'], [withValue(media.tv, 'onoff', false), 'Uit', 'Off', 'off'],
  [media.tvButtons, 'Uit', 'Off', 'off'], [withValue(media.tvButtons, 'onoff', true), 'Aan', 'On', 'on'], [media.tvInfrared, '', '', 'neutral'],
  [withValue(media.tvNoPower, 'speaker_playing', null), 'Volume 50%', 'Volume 50%', 'neutral'],
])('%# music and television say what they do', (d, dutch, english, state) => {
  expect([d.name, ...says('media', d), seen('media', d).state]).toEqual([d.name, dutch, english, state]);
});

test.each<[Device, string, string, string]>([
  [guards.lock, 'Op slot', 'Locked', 'off'], [guards.custom, 'Van slot', 'Unlocked', 'on'], [withValue(guards.lock, 'locked', null), 'Stand onbekend', 'Position unknown', 'neutral'],
  [guards.garage, 'Dicht', 'Closed', 'off'], [withValue(guards.garage, 'garagedoor_closed', false), 'Open', 'Open', 'on'],
  [guards.alarm, 'Uit', 'Off', 'off'], [guards.alarmAsSensor, 'Ingeschakeld', 'Armed', 'on'], [withValue(guards.alarm, 'homealarm_state', 'partially_armed'), 'Deels ingeschakeld', 'Partly armed', 'on'],
])('%# a lock, a door and an alarm say where they are', (d, dutch, english, state) => {
  expect([d.name, ...says('guard', d), seen('guard', d).state]).toEqual([d.name, dutch, english, state]);
});

test('what they were told is said until they answer', () => {
  const told = (d: Device, capabilityId: string, value: unknown) => says('guard', d, { capabilityId, value: value as never });
  expect([told(guards.lock, 'locked', false), told(guards.lock, 'locked', true), told(guards.garage, 'garagedoor_closed', false), told(guards.garage, 'garagedoor_closed', true), told(guards.alarm, 'homealarm_state', 'armed'), told(guards.withLatch, 'open', true)]).toEqual([
    ['Ontgrendelt…', 'Unlocking…'], ['Vergrendelt…', 'Locking…'], ['Gaat open…', 'Opening…'], ['Gaat dicht…', 'Closing…'], ['Bezig…', 'Working…'], ['Bezig…', 'Working…'],
  ]);
});

test('an alarm that goes off is red and says which; an empty battery is not one', () => {
  const alarm = { ...guards.alarm, capabilities: { ...guards.alarm.capabilities, alarm_fire: cap('alarm_fire', { type: 'boolean', title: 'Brand', value: true }) } };
  expect([says('guard', alarm)[0], seen('guard', alarm)]).toEqual(['Brand · Uit', { icon: 'shield_lock', state: 'danger', level: null, tap: 'open' }]);
  const empty = withValue(guards.lock, 'alarm_battery', true);
  expect([says('guard', empty)[0], seen('guard', empty).state, tileView(spec('guard', empty), empty, nl).warn]).toEqual(['Op slot', 'off', true]);
});

test('every tile opens its window, has an icon of its kind and a name with what it says', () => {
  expect([seen('climate', heating.ownMode).icon, seen('climate', heating.airco).icon, seen('cover', covers.setOnly).icon, seen('cover', covers.withSwitch).icon, seen('cover', covers.awning).icon, seen('media', media.full).icon, seen('media', media.tv).icon,
    seen('guard', guards.lock).icon, seen('guard', guards.custom).icon, seen('guard', guards.garage).icon, seen('guard', guards.alarm).icon])
    .toEqual(['mode_heat', 'ac_unit', 'blinds', 'curtains', 'roller_shades', 'speaker', 'tv', 'lock', 'lock_open', 'garage_home', 'shield_lock']);
  expect([seen('cover', covers.setOnly), seen('media', media.full)]).toEqual([{ icon: 'blinds', state: 'on', level: 60, tap: 'open' }, { icon: 'speaker', state: 'on', level: 32, tap: 'open' }]);
  expect(tileView(spec('climate', heating.ownMode), heating.ownMode, nl).ariaLabel).toBe('Woonkamer, 20,5° · naar 21°');
});

test('a device that cannot be reached says that, and one that is gone too', () => {
  const away = { ...guards.lock, available: false, unavailableMessage: 'Buiten bereik' };
  expect(tileView(spec('guard', away), away, nl)).toMatchObject({ state: 'unavailable', stateText: 'Buiten bereik', icon: 'link_off', tap: 'open' });
  expect(tileView(spec('media', media.full), undefined, nl)).toMatchObject({ state: 'unavailable' });
  // it became something else and the tile does not know yet
  for (const kind of ['climate', 'cover', 'media', 'guard'] as const) expect(tileView(spec(kind, heating.fridge), { ...heating.fridge, capabilities: {}, capabilityOrder: [] }, nl).stateText).toBe('');
});

test('a section counts what is open, plays or is unlocked', () => {
  const all = [...Object.values(covers), ...Object.values(media), ...Object.values(guards)];
  const count = (kind: Section['kind'], specs: DeviceTileSpec[], t = nl) => sectionCount({ id: 's', kind, titleKey: 'section.other', tiles: specs }, (id) => all.find((d) => d.id === id), t);
  expect([count('covers', [spec('cover', covers.setOnly), spec('cover', covers.closedOnly), spec('cover', covers.both), spec('cover', covers.awning)]), count('covers', [spec('cover', covers.closedOnly)])]).toEqual(['2 open', '']);
  expect([count('media', [spec('media', media.full), spec('media', media.bare), spec('media', media.tv)]), count('media', [spec('media', media.bare)])]).toEqual(['1 speelt', '']);
  const open = { ...guards.garage, id: 'garage' };
  expect([count('security', [spec('guard', guards.lock), spec('guard', guards.custom)]), count('security', [spec('guard', guards.custom)], en), count('security', [spec('guard', open)])]).toEqual(['1 van slot', '1 unlocked', '']);
});
