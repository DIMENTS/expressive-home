import type { TileSpec } from '../../dashboard/types';
import { widgetIcon } from '../../widgets/catalog';
import { climateOf } from '../../controls/climate';
import { guardOf, guardState } from '../../controls/guard';
import type { Capability, Device } from '../../homey/types';
import type { IconName } from '../icons/icons';

// Icons follow the kind of device and capability, never the individual device;
// anything unknown gets a neutral icon. The builder may extend these tables.

/** By capability base id: what the reading or the alarm is about. */
const BY_CAPABILITY: Record<string, IconName> = {
  measure_temperature: 'thermostat', target_temperature: 'thermostat',
  measure_humidity: 'humidity_percentage',
  measure_co2: 'co2', measure_pm25: 'air', measure_pressure: 'air', measure_wind_strength: 'air',
  measure_power: 'bolt', meter_power: 'bolt', measure_voltage: 'electrical_services', measure_current: 'electrical_services',
  measure_battery: 'battery_5_bar', battery_soc: 'battery_5_bar',
  measure_luminance: 'light_mode', measure_water: 'water_drop', measure_content_volume: 'water_drop', tank_level: 'water_drop',
  presence: 'person', alarm_presence: 'person', alarm_occupancy: 'person',
  alarm_motion: 'sensors', alarm_vibration: 'sensors',
  alarm_contact: 'door_front',
  alarm_smoke: 'detector_smoke', alarm_co: 'detector_smoke', alarm_co2: 'detector_smoke', alarm_fire: 'detector_smoke', alarm_heat: 'detector_smoke',
  alarm_water: 'water_damage',
  alarm_tamper: 'shield', alarm_generic: 'warning', alarm_battery: 'battery_alert',
  onoff: 'toggle_on', button: 'touch_app',
};

/** By device class, when the capability says nothing. */
const BY_CLASS: Record<string, IconName> = {
  light: 'lightbulb', socket: 'power', lock: 'lock', heater: 'mode_heat', fan: 'mode_fan', thermostat: 'thermostat',
  airconditioning: 'mode_fan', remote: 'settings_remote', button: 'settings_remote', sensor: 'sensors', battery: 'battery_5_bar',
  solarpanel: 'solar_power', tv: 'live_tv', homealarm: 'shield', doorbell: 'touch_app', speaker: 'live_tv',
};

/** For a switch: a socket is a plug, a heater or fan keeps its own icon, everything else is a toggle. */
const SWITCH_BY_CLASS: Record<string, IconName> = { socket: 'power', light: 'lightbulb', heater: 'mode_heat', fan: 'mode_fan' };

/** Heating or cooling, as far as its mode tells. */
function climateIcon(device: Device): IconName {
  const mode = climateOf(device)?.mode?.value;
  if (device.deviceClass === 'airconditioning') return 'ac_unit';
  return typeof mode === 'string' && /^cool/i.test(mode) ? 'ac_unit' : 'mode_heat';
}

const COVER_BY_CLASS: Record<string, IconName> = { curtain: 'curtains', sunshade: 'roller_shades', shutterblinds: 'vertical_shades' };
const MEDIA_BY_CLASS: Record<string, IconName> = { tv: 'tv', settopbox: 'tv', gameconsole: 'tv' };
const APPLIANCE_ICONS: Record<string, IconName> = { dishwasher: 'dishwasher', fridge: 'kitchen', freezer: 'kitchen', fridge_and_freezer: 'kitchen' };

function guardIcon(device: Device): IconName {
  const guard = guardOf(device);
  if (guard?.kind === 'door') return 'garage_home';
  if (guard?.kind === 'alarm') return 'shield_lock';
  return guard && guardState(guard) === 'unlocked' ? 'lock_open' : 'lock';
}

const byCapability = (capabilityId: string | null | undefined): IconName | undefined => {
  if (!capabilityId) return undefined;
  const dot = capabilityId.indexOf('.');
  return BY_CAPABILITY[dot === -1 ? capabilityId : capabilityId.slice(0, dot)];
};

/** The icon of a tile. Never throws: a missing device or capability falls back to the spec and then to "category". */
export function iconFor(spec: TileSpec, device: Device | undefined): IconName {
  const byClass = device ? BY_CLASS[device.deviceClass] : undefined;
  switch (spec.kind) {
    case 'flow': return 'play_arrow';
    case 'widget': return widgetIcon(spec);
    case 'light': return 'lightbulb';
    case 'tank': return 'water_drop';
    case 'button': return 'touch_app';
    case 'switch': return (device && SWITCH_BY_CLASS[device.deviceClass]) ?? 'toggle_on';
    case 'climate': return device ? climateIcon(device) : 'thermostat';
    case 'cover': return (device && COVER_BY_CLASS[device.deviceClass]) ?? 'blinds';
    case 'media': return (device && MEDIA_BY_CLASS[device.deviceClass]) ?? 'speaker';
    case 'guard': return device ? guardIcon(device) : 'lock';
    case 'fan': return device?.deviceClass === 'airpurifier' ? 'air' : 'mode_fan';
    case 'vacuum': return 'cleaning_services';
    case 'appliance': return (device && APPLIANCE_ICONS[device.deviceClass]) ?? 'local_laundry_service';
    case 'charger': return 'ev_station';
    case 'car': return 'electric_car';
    case 'multi': return spec.capabilityIds[0]?.startsWith('measure_power') ? 'bolt' : 'devices_other';
    case 'sensor': return byCapability(spec.capabilityId) ?? byClass ?? 'category';
    case 'generic': return byCapability(spec.capabilityId) ?? byClass ?? 'category';
  }
}

/** The icon for a capability, as for its sensor tile; also used by the own hero and the lists of values. */
export function iconForCapability(capability: Capability, device: Device | undefined): IconName {
  return byCapability(capability.id) ?? (device ? BY_CLASS[device.deviceClass] : undefined) ?? 'category';
}
