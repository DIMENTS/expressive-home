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

const power = (value: number | null, id = 'measure_power'): Capability => num(id, value, { units: 'W' });
const energy = (value: number | null, id = 'meter_power'): Capability => num(id, value, { units: 'kWh' });
const battery = (value: number | null): Capability => num('measure_battery', value, { units: '%', min: 0, max: 100 });
const flag = (id: string, value: boolean | null): Capability => bool(id, value, { setable: false });
const VACUUM = ['cleaning', 'spot_cleaning', 'docked', 'charging', 'stopped'];
const RUNS = ['stopped', 'running', 'paused', 'error'];
const PLUGGED = ['plugged_in_charging', 'plugged_in_discharging', 'plugged_in_paused', 'plugged_in', 'plugged_out'];

/** Fans and air purifiers. */
export const fans = {
  /** Speed, swinging and mode by the standard. */
  standing: device({ id: 'fan', name: 'Ventilator', deviceClass: 'fan', caps: [bool('onoff', true), part('fan_speed', 0.6), bool('oscillating', true), choice('fan_mode', ['auto', 'on', 'off'], 'on'), temperature(22)] }),
  /** An older app: dim is the speed, counted to 100. */
  dimmed: device({ id: 'mi', name: 'Tafelventilator', deviceClass: 'fan', caps: [bool('onoff', false), part('dim', 40, 100)] }),
  /** An air purifier with many readings. */
  purifier: device({ id: 'purifier', name: 'Luchtreiniger', deviceClass: 'airpurifier', caps: [bool('onoff', true), part('fan_speed', 0.3), num('measure_pm25', 8), num('measure_humidity', 41, { units: '%' }), temperature(21)] }),
  /** Only on and off: stays a switch. */
  plain: device({ id: 'plainfan', name: 'Badkamer', deviceClass: 'fan', caps: [bool('onoff', true), power(9)] }),
  /** A fan heater: a target makes it climate. */
  heater: device({ id: 'duux', name: 'Kachel', deviceClass: 'fan', caps: [bool('onoff', true), part('fan_speed', 0.5), target(21), temperature(19)] }),
};

/** Robot vacuum cleaners. */
export const vacuums = {
  /** By the standard. */
  full: device({ id: 'robot', name: 'Robotstofzuiger', deviceClass: 'vacuumcleaner', caps: [choice('vacuumcleaner_state', VACUUM, 'docked'), choice('vacuumcleaner_job_mode', ['off', 'normal', 'high', 'turbo', 'mop', 'auto'], 'normal'), flag('docked', true), battery(100), flag('alarm_bin_full', false), flag('alarm_stuck', false), part('volume_set', 0.5)] }),
  /** Only onoff starts and stops it, as six of thirteen apps do. */
  onoff: device({ id: 'roborock', name: 'Stofzuiger', deviceClass: 'vacuumcleaner', caps: [bool('onoff', false), battery(12), part('dim', 0.5), bool('onoff.findme', false)] }),
  /** Another class, with only its state. */
  other: device({ id: 'neato', name: 'Neato', deviceClass: 'other', caps: [choice('vacuumcleaner_state', VACUUM, 'cleaning'), battery(64), flag('alarm_motion', false)] }),
  /** Stuck while cleaning. */
  stuck: device({ id: 'stuck', name: 'Boven', deviceClass: 'vacuumcleaner', caps: [choice('vacuumcleaner_state', VACUUM, 'stopped'), battery(40), flag('alarm_stuck', true), flag('alarm_bin_full', true)] }),
};

/** Washing machines, dryers, dishwashers and fridges. */
export const appliances = {
  /** By the standard, with a remaining time in minutes of the app's own. */
  washer: device({ id: 'washer', name: 'Wasmachine', deviceClass: 'washer', caps: [choice('operational_state', RUNS, 'running', { setable: false }), num('progress', 60, { units: '%', min: 0, max: 100 }), choice('laundry_washer_program', ['normal', 'auto', 'quick', 'heavy', 'whites'], 'normal', { setable: false }), num('remaining_time', 42, { units: 'min' }), bool('onoff', true), power(450), flag('alarm_contact', false)] }),
  /** A plug that says it is a dishwasher. */
  plug: device({ id: 'plugdish', name: 'Vaatwasser', deviceClass: 'dishwasher', caps: [bool('onoff', true), power(1850), energy(312.4)] }),
  /** Remaining time in seconds, under another name. */
  dryer: device({ id: 'dryer', name: 'Droger', deviceClass: 'dryer', caps: [choice('operational_state', RUNS, 'paused', { setable: false }), num('measure_remaining_time', 1500, { units: 's' }), press('button.start'), press('button.cancel')] }),
  /** Only whether it runs. */
  running: device({ id: 'dish', name: 'Vaatwasser', deviceClass: 'dishwasher', caps: [flag('alarm_running', false), flag('alarm_door_fault', false)] }),
  /** Another class, with its state and a program. */
  other: device({ id: 'bosch', name: 'Wasdroger', deviceClass: 'other', caps: [choice('operational_state', RUNS, 'error', { setable: false }), choice('laundry_dryer_dryness', ['low', 'normal', 'extra', 'max'], 'normal')] }),
  /** A fridge on a plug. */
  fridge: device({ id: 'fridge', name: 'Koelkast', deviceClass: 'fridge', caps: [bool('onoff', true), power(85)] }),
  /** A heat pump with a state of its own is no washing machine. */
  heatPump: device({ id: 'pump', name: 'Warmtepomp', deviceClass: 'heatpump', caps: [choice('operational_state', RUNS, 'running', { setable: false }), temperature(45)] }),
};

/** Charge points for a car. */
export const chargers = {
  /** By the standard, with a session and a power to aim at. */
  full: device({ id: 'zaptec', name: 'Laadpaal', deviceClass: 'evcharger', energy: { cumulative: false, homeBattery: false, evCharger: true }, caps: [bool('evcharger_charging', true), choice('evcharger_charging_state', PLUGGED, 'plugged_in_charging', { setable: false }), power(11040), energy(12.4, 'meter_power.session'), energy(913.4), num('target_power', 11000, { setable: true, min: 0, max: 22000, units: 'W' }), flag('alarm_generic.car_connected', true)] }),
  /** Only onoff, without a flag. */
  onoff: device({ id: 'chargeamps', name: 'Lader', deviceClass: 'evcharger', caps: [bool('onoff', false), power(0)] }),
  /** Another class, with its state. */
  other: device({ id: 'easee', name: 'Easee', deviceClass: 'other', caps: [choice('evcharger_charging_state', PLUGGED, 'plugged_in', { setable: false }), power(0)] }),
  /** A plug that says it is a charge point. */
  plug: device({ id: 'plugcharge', name: 'Stopcontact garage', deviceClass: 'evcharger', caps: [bool('onoff', true), power(2300)] }),
};

/** Cars. */
export const cars = {
  /** Battery, range in km, charging, lock, and climate, windows and a trunk that are no climate, cover or switch. */
  tesla: device({ id: 'tesla', name: 'Auto', deviceClass: 'car', energy: { cumulative: false, homeBattery: false, electricCar: true }, caps: [battery(64), num('measure_distance.range', 240, { units: 'km' }), choice('ev_charging_state', PLUGGED, 'plugged_in', { setable: false }), bool('locked', true), target(20, { min: 15, max: 28 }), temperature(9), bool('windowcoverings_closed', true), bool('onoff.trunk', false), bool('onoff.charge_port', false), press('button.homelink'), bool('speaker_playing', false), flag('alarm_generic.valet_mode', true)] }),
  /** A vehicle with its own range. */
  kia: device({ id: 'kia', name: 'Niro', deviceClass: 'vehicle', caps: [battery(81), num('measure_range', 312, { units: 'km' }), bool('locked', false), bool('evcharger_charging', false)] }),
  /** Another class: only the charging state of a car tells. */
  other: device({ id: 'xpeng', name: 'Xpeng', deviceClass: 'other', caps: [battery(23), choice('ev_charging_state', PLUGGED, 'plugged_in_charging', { setable: false }), num('range', 98, { units: 'km' })] }),
};
