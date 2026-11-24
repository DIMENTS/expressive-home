import type { Capability, Device } from '../../src/homey/types';
import { cap, device } from './build';

// Devices as real apps on a Homey build them (names of capabilities, ranges and what is missing), with made-up values.

const bool = (id: string, value: boolean | null = null, partial: Partial<Capability> = {}): Capability => cap(id, { type: 'boolean', setable: true, value, ...partial });
const num = (id: string, value: number | null, partial: Partial<Capability> = {}): Capability => cap(id, { value, ...partial });
const choice = (id: string, ids: string[], value: string | null, partial: Partial<Capability> = {}): Capability =>
  cap(id, { type: 'enum', setable: true, value, options: ids.map((option) => ({ id: option, title: option })), ...partial });
const text = (id: string, value: string | null): Capability => cap(id, { type: 'string', value });
const press = (id: string): Capability => cap(id, { type: 'boolean', getable: false, setable: true });
const target = (value: number | null, partial: Partial<Capability> = {}, id = 'target_temperature'): Capability => num(id, value, { setable: true, min: 4, max: 35, units: '°C', ...partial });
const temperature = (value: number | null): Capability => num('measure_temperature', value, { units: '°C' });
const part = (id: string, value: number | null, max = 1): Capability => num(id, value, { setable: true, min: 0, max, units: '%' });

/** Heating and cooling. */
export const heating = {
  /** A radiator valve that does not measure. */
  valveBlind: device({ id: 'valve', name: 'Badkamer', deviceClass: 'thermostat', caps: [target(19, { min: 4, max: 28, step: 0.5 }), num('measure_battery', 80)] }),
  /** A zone without mode and without a range of its own. */
  zone: device({ id: 'zone', name: 'Zolder', deviceClass: 'thermostat', caps: [bool('alarm_battery', false, { setable: false }), target(18, { min: null, max: null }), temperature(18.2)] }),
  /** A mode of the app itself. */
  ownMode: device({ id: 'own', name: 'Woonkamer', deviceClass: 'thermostat', caps: [temperature(20.5), target(21, { min: 7, max: 30 }), choice('netatmo_thermostat_mode', ['schedule', 'away', 'hg', 'manual'], 'schedule')] }),
  /** Steps of a tenth. */
  tenths: device({ id: 'tenths', name: 'Keuken', deviceClass: 'thermostat', caps: [choice('thermostat_mode', ['auto', 'heat', 'off'], 'heat'), temperature(19.4), target(20, { min: null, max: 30, step: 0.1 })] }),
  /** Modes that Homey does not know. */
  oddModes: device({ id: 'odd', name: 'Vloer', deviceClass: 'thermostat', caps: [temperature(22), target(23), choice('thermostat_mode', ['heat', 'cool', 'eco', 'holiday'], 'eco')] }),
  sauna: device({ id: 'sauna', name: 'Sauna', deviceClass: 'thermostat', caps: [choice('thermostat_mode', ['heat', 'off'], 'off'), target(80, { min: 40, max: 110, step: 1 }), temperature(21)] }),
  /** More zones on one device. */
  zones: device({ id: 'zones', name: 'Warmtepomp', deviceClass: 'thermostat', caps: [bool('onoff', true), temperature(20), target(45, { min: 40, max: 60, step: 1 }, 'target_temperature.tank_water'), target(20.5, { min: 10, max: 30 }), target(19, { min: 10, max: 30 }, 'target_temperature.zone2'), choice('thermostat_mode', ['auto', 'heat', 'cool'], 'auto')] }),
  /** An air conditioner without onoff. */
  airco: device({ id: 'airco', name: 'Werkkamer', deviceClass: 'airconditioning', caps: [bool('se_onoff', true), target(22, { min: 10, max: 31, step: 1 }), choice('thermostat_mode', ['auto', 'heat', 'cool', 'off'], 'cool'), temperature(24.1), num('measure_humidity', 47, { units: '%' })] }),
  /** Its mode can only be read. */
  modeReadOnly: device({ id: 'ro', name: 'Slaapkamer', deviceClass: 'airconditioning', caps: [temperature(23), target(21, { min: 10, max: 33, step: 0.5 }), bool('onoff', false), choice('thermostat_mode', ['auto', 'heat', 'cool', 'off'], 'cool', { setable: false })] }),
  /** Infrared: it never says whether it is on. */
  infrared: device({ id: 'ir', name: 'Airco', deviceClass: 'thermostat', caps: [bool('onoff', null, { getable: false }), target(20, { min: 16, max: 31, step: 1 }), choice('thermostat_mode', ['auto', 'cool', 'heat'], null)] }),
  /** A child lock. */
  childLock: device({ id: 'child', name: 'Hal', deviceClass: 'thermostat', caps: [bool('locked', true), target(19), temperature(19)] }),
  /** Only parts of something else. */
  gateway: device({ id: 'gateway', name: 'Ketel', deviceClass: 'other', caps: [num('measure_temperature.room', 20), target(20.5, { min: 1, max: 30, step: 0.1 }, 'target_temperature.room')] }),
  fridge: device({ id: 'fridge', name: 'Koelkast', deviceClass: 'fridge', caps: [target(4, { min: 2, max: 8 }), temperature(4.1)] }),
  /** A text where a number belongs. */
  asText: device({ id: 'astext', name: 'Oven', deviceClass: 'other', caps: [text('target_temperature', '180')] }),
};

/** Curtains, blinds and awnings. */
export const covers = {
  setOnly: device({ id: 'set', name: 'Rolgordijn', deviceClass: 'blinds', caps: [part('windowcoverings_set', 0.6)] }),
  stateOnly: device({ id: 'state', name: 'Gordijn', deviceClass: 'blinds', caps: [choice('windowcoverings_state', ['up', 'idle', 'down'], 'idle')] }),
  both: device({ id: 'both', name: 'Rolluik', deviceClass: 'windowcoverings', caps: [choice('windowcoverings_state', ['up', 'idle', 'down'], 'down'), part('windowcoverings_set', 0.25), part('windowcoverings_tilt_set', 0.5)] }),
  /** No state at the moment. */
  noState: device({ id: 'nostate', name: 'Rolluik voor', deviceClass: 'blinds', caps: [choice('windowcoverings_state', ['up', 'idle', 'down'], null), part('windowcoverings_set', null)] }),
  closedOnly: device({ id: 'closed', name: 'Luik', deviceClass: 'windowcoverings', caps: [bool('windowcoverings_closed', true)] }),
  hundred: device({ id: 'hundred', name: 'Screen', deviceClass: 'blinds', caps: [num('windowcoverings_set', 40, { setable: true, min: 0, max: 100, step: 1, units: '%' })] }),
  tiltOnly: device({ id: 'tilt', name: 'Lamellen', deviceClass: 'blinds', caps: [part('windowcoverings_tilt_set', 30, 100)] }),
  awning: device({ id: 'awning', name: 'Zonwering', deviceClass: 'sunshade', caps: [choice('windowcoverings_state', ['up', 'idle', 'down'], 'idle'), part('windowcoverings_set', 1)] }),
  twoMotors: device({ id: 'two', name: 'Plissé', deviceClass: 'blinds', caps: [part('windowcoverings_set.top', 1), part('windowcoverings_set.bottom', 0.2), choice('windowcoverings_state', ['up', 'idle', 'down'], 'idle')] }),
  /** A curtain that is also a switch. */
  withSwitch: device({ id: 'switch', name: 'Gordijn voor', deviceClass: 'curtain', caps: [bool('onoff', true), part('windowcoverings_set', 1), choice('windowcoverings_state', ['up', 'idle', 'down'], 'up')] }),
};

/** Locks, garage doors and alarms. */
export const guards = {
  lock: device({ id: 'lock', name: 'Voordeur', deviceClass: 'lock', caps: [bool('locked', true), bool('alarm_battery', false, { setable: false }), bool('alarm_contact', false, { setable: false })] }),
  custom: device({ id: 'custom', name: 'Achterdeur', deviceClass: 'lock', caps: [bool('locked.custom', false), choice('lock_unlock_open', ['open', 'unlocked', 'locked'], 'unlocked')] }),
  withLatch: device({ id: 'latch', name: 'Schuur', deviceClass: 'lock', caps: [bool('locked', true), press('open'), bool('charging', false, { setable: false })] }),
  asSensor: device({ id: 'assensor', name: 'Poort', deviceClass: 'sensor', caps: [bool('locked', true), bool('alarm_battery', false, { setable: false })] }),
  readOnly: device({ id: 'readonly', name: 'Kelder', deviceClass: 'lock', caps: [bool('locked', true, { setable: false })] }),
  lockMode: device({ id: 'mode', name: 'Kantoor', deviceClass: 'lock', caps: [bool('locked', true), choice('lock_mode', ['always_locked', 'always_unlocked', 'locked_until_unlock'], 'locked_until_unlock')] }),
  garage: device({ id: 'garage', name: 'Garage', deviceClass: 'garagedoor', caps: [bool('garagedoor_closed', true), choice('myq_door_state', ['open', 'closed'], 'closed', { setable: false })] }),
  garageBusy: device({ id: 'garage2', name: 'Garage links', deviceClass: 'garagedoor', caps: [bool('garagedoor_closed', true), bool('onoff', false), bool('onoff.light', false), part('windowcoverings_set', 0), bool('locked.remote', false), press('button.re_sync')] }),
  garageAsCover: device({ id: 'garage3', name: 'Garage rechts', deviceClass: 'garagedoor', caps: [choice('windowcoverings_state', ['up', 'idle', 'down'], 'down'), part('windowcoverings_set', 0)] }),
  alarm: device({ id: 'alarm', name: 'Alarm', deviceClass: 'homealarm', caps: [choice('homealarm_state', ['armed', 'disarmed', 'partially_armed'], 'disarmed'), bool('alarm_burglar', false, { setable: false }), bool('alarm_fire', false, { setable: false })] }),
  alarmAsSensor: device({ id: 'alarm2', name: 'Bewaking', deviceClass: 'sensor', caps: [choice('homealarm_state', ['armed', 'disarmed', 'partially_armed'], 'armed'), press('button')] }),
  car: device({ id: 'car', name: 'Auto', deviceClass: 'car', caps: [bool('locked', true), num('measure_battery', 70)] }),
};

/** Music and television. */
export const media = {
  full: device({ id: 'full', name: 'Keuken', deviceClass: 'speaker', caps: [text('speaker_album', 'Album'), text('speaker_artist', 'Artiest'), num('speaker_duration', 222), press('speaker_next'), bool('speaker_playing', true), num('speaker_position', 94), press('speaker_prev'), choice('speaker_repeat', ['none', 'track', 'playlist'], 'none'), part('volume_set', 0.32), bool('volume_mute', false), bool('speaker_shuffle', false), text('speaker_track', 'Nummer')] }),
  bare: device({ id: 'bare', name: 'Badkamer', deviceClass: 'speaker', caps: [bool('speaker_playing', false), press('speaker_prev'), press('speaker_next'), bool('volume_mute', false), part('volume_set', 0.1)] }),
  /** A speaker that cannot tell what it plays. */
  loudOnly: device({ id: 'loud', name: 'Soundbar', deviceClass: 'speaker', caps: [bool('onoff', true), part('volume_set', 0.2), press('volume_up'), press('volume_down'), bool('volume_mute', false)] }),
  tv: device({ id: 'tv', name: 'Televisie', deviceClass: 'tv', caps: [bool('onoff', true), num('volume_set', 18, { setable: true, min: 0, max: 100, step: 1, units: '%' }), press('channel_up'), press('channel_down'), press('volume_up'), press('volume_down'), bool('volume_mute', false)] }),
  tvButtons: device({ id: 'tvb', name: 'Tv boven', deviceClass: 'tv', caps: [bool('onoff', false), press('volume_up'), press('channel_up'), press('volume_down'), press('channel_down'), bool('volume_mute', null, { getable: false })] }),
  tvInfrared: device({ id: 'tvir', name: 'Tv gang', deviceClass: 'tv', caps: [bool('onoff', null, { getable: false }), press('volume_up'), press('volume_down')] }),
  tvNoPower: device({ id: 'tvn', name: 'Tv zolder', deviceClass: 'tv', caps: [bool('speaker_playing', true), part('volume_set', 0.5), bool('volume_mute', false)] }),
  receiver: device({ id: 'receiver', name: 'Versterker', deviceClass: 'other', caps: [bool('onoff', true), part('volume_set', 0.4), press('volume_up'), press('volume_down'), bool('volume_mute', false)] }),
  /** A plug that says it is a television: it can only be on or off. */
  plugAsTv: device({ id: 'plugtv', name: 'Stekker tv', deviceClass: 'tv', caps: [bool('onoff', true), num('measure_power', 45, { units: 'W' })] }),
};
