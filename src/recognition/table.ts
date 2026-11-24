export type Meaning = 'battery.soc' | 'battery.timeToGo' | 'shore.state' | 'tank.level' | 'tank.volume' | 'tank.capacity';

/** Capability base ids per meaning; the first one present on the device wins. */
export const MEANINGS: Record<Meaning, string[]> = {
  'battery.soc': ['battery_soc', 'measure_battery'],
  'battery.timeToGo': ['time_to_go'],
  'shore.state': ['ac_input_source'],
  'tank.level': ['tank_level'],
  'tank.volume': ['measure_content_volume'],
  'tank.capacity': ['tank_capacity'],
};

/** Base ids that never count as a main value. A trailing '*' is a prefix match; a trailing '#' stands for one or more digits. */
export const MINOR_CAPABILITIES = ['measure_battery', 'alarm_battery', 'rssi', 'lastseen_*', 'device_type', 'deviceGen*', 'multiInputs', 'actionEvents', 'input_#'];

/** The capabilities of a battery-powered device and of a home battery that recognition looks at. */
export const BATTERY = { homeSoc: 'battery_soc', level: 'measure_battery', alarm: 'alarm_battery' } as const;

/** Device classes and alarms that put a device in the security section. */
export const SECURITY_CLASSES = ['lock', 'homealarm', 'doorbell'];
export const SECURITY_ALARMS = ['presence', 'alarm_contact', 'alarm_motion', 'alarm_tamper', 'alarm_smoke', 'alarm_co', 'alarm_water'];
/** Device classes, and main values of a device that is no switch, that put it in the climate section. */
export const CLIMATE_CLASSES = ['thermostat', 'heater', 'fan', 'airconditioning'];
export const CLIMATE_VALUES = ['measure_temperature', 'measure_humidity', 'measure_co2', 'measure_pm25', 'measure_pressure', 'target_temperature'];

export const LOW_BATTERY_PERCENT = 15;

/**
 * Not everything the hub calls an alarm is one. Danger: Homey's standard alarms, red everywhere.
 * Activity: something happens, shown as "on" in the primary colour. Every other alarm_* flag is a status,
 * neutral, such as an app's own flags. The danger list may grow per Homey app.
 */
export const ALARM_DANGER = ['alarm_smoke', 'alarm_co', 'alarm_co2', 'alarm_fire', 'alarm_heat', 'alarm_water', 'alarm_tamper', 'alarm_generic', 'alarm_battery'];
export const ALARM_ACTIVITY = ['alarm_motion', 'alarm_contact', 'alarm_vibration', 'alarm_occupancy', 'alarm_presence', 'presence'];
