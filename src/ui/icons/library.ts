import type { Language } from '../../i18n/index';
import type { IconName } from './icons';

export type IconGroup = 'rooms' | 'power' | 'climate' | 'security' | 'media' | 'outdoor' | 'other';
/** An icon a section, dashboard or tile can get; `nl` and `en` are the search words, separated by spaces, lower case. */
export interface LibraryIcon { name: IconName; nl: string; en: string }

/** The icons for house and camper the owner can choose from, in seven groups. */
export const ICON_LIBRARY: readonly { group: IconGroup; icons: readonly LibraryIcon[] }[] = [
  {
    group: 'rooms',
    icons: [
      { name: 'home', nl: 'huis thuis', en: 'house home' },
      { name: 'weekend', nl: 'woonkamer bank zitkamer', en: 'living room sofa couch lounge' },
      { name: 'bed', nl: 'slaapkamer bed', en: 'bedroom bed' },
      { name: 'kitchen', nl: 'keuken koelkast', en: 'kitchen fridge' },
      { name: 'bathtub', nl: 'badkamer bad', en: 'bathroom bath' },
      { name: 'shower', nl: 'douche badkamer', en: 'shower bathroom' },
      { name: 'countertops', nl: 'keuken aanrecht', en: 'kitchen countertop' },
      { name: 'garage', nl: 'garage schuur', en: 'garage shed' },
      { name: 'deck', nl: 'terras buiten veranda', en: 'deck terrace outside veranda' },
      { name: 'yard', nl: 'tuin buiten', en: 'garden yard outside' },
      { name: 'roofing', nl: 'dak zolder', en: 'roof attic loft' },
      { name: 'stairs', nl: 'trap', en: 'stairs' },
      { name: 'door_front', nl: 'deur voordeur hal', en: 'door front door hall' },
      { name: 'meeting_room', nl: 'kamer kantoor', en: 'room office study' },
      { name: 'chair', nl: 'stoel zithoek', en: 'chair seating' },
      { name: 'table_restaurant', nl: 'tafel eettafel', en: 'table dining table' },
      { name: 'cottage', nl: 'huisje', en: 'cottage' },
      { name: 'cabin', nl: 'hut chalet', en: 'cabin chalet lodge' },
      { name: 'camping', nl: 'camping tent', en: 'camping tent campsite' },
      { name: 'rv_hookup', nl: 'camper caravan aansluiting', en: 'camper caravan hookup motorhome' },
      { name: 'airport_shuttle', nl: 'busje camper', en: 'van camper minibus' },
      { name: 'directions_car', nl: 'auto', en: 'car' },
      { name: 'sailing', nl: 'boot zeilen', en: 'boat sailing' },
      { name: 'anchor', nl: 'anker boot haven', en: 'anchor boat harbour' },
    ],
  },
  {
    group: 'power',
    icons: [
      { name: 'lightbulb', nl: 'lamp licht', en: 'lamp light bulb' },
      { name: 'emoji_objects', nl: 'lamp idee', en: 'lamp light idea' },
      { name: 'floor_lamp', nl: 'staande lamp vloerlamp', en: 'floor lamp standing lamp' },
      { name: 'table_lamp', nl: 'tafellamp bureaulamp', en: 'table lamp desk lamp' },
      { name: 'wall_lamp', nl: 'wandlamp', en: 'wall lamp sconce' },
      { name: 'light_group', nl: 'lampen groep', en: 'lights lamps group' },
      { name: 'highlight', nl: 'spot schijnwerper', en: 'spotlight floodlight' },
      { name: 'power', nl: 'stekker stopcontact', en: 'plug socket' },
      { name: 'outlet', nl: 'stopcontact', en: 'socket outlet' },
      { name: 'electrical_services', nl: 'elektra omvormer', en: 'electrics inverter' },
      { name: 'bolt', nl: 'stroom energie bliksem', en: 'electricity power energy lightning' },
      { name: 'power_settings_new', nl: 'aan uit', en: 'on off' },
      { name: 'toggle_on', nl: 'schakelaar', en: 'switch' },
      { name: 'battery_full', nl: 'accu batterij vol', en: 'battery full' },
      { name: 'battery_5_bar', nl: 'accu batterij', en: 'battery' },
      { name: 'solar_power', nl: 'zon zonnepaneel', en: 'sun solar panel' },
      { name: 'ev_station', nl: 'laadpaal auto laden', en: 'charging station car charging' },
      { name: 'charger', nl: 'lader opladen', en: 'charger charging' },
      { name: 'electric_meter', nl: 'meter verbruik', en: 'meter consumption' },
    ],
  },
  {
    group: 'climate',
    icons: [
      { name: 'thermostat', nl: 'temperatuur thermostaat', en: 'temperature thermostat' },
      { name: 'device_thermostat', nl: 'temperatuur', en: 'temperature thermometer' },
      { name: 'ac_unit', nl: 'airco koelen sneeuw', en: 'air conditioning cooling snow' },
      { name: 'mode_fan', nl: 'ventilator', en: 'fan ventilator' },
      { name: 'heat', nl: 'verwarming warmte', en: 'heating warmth' },
      { name: 'local_fire_department', nl: 'kachel vuur', en: 'stove fire' },
      { name: 'air', nl: 'lucht wind ventilatie', en: 'air wind ventilation' },
      { name: 'humidity_percentage', nl: 'vocht luchtvochtigheid', en: 'humidity moisture' },
      { name: 'water_drop', nl: 'water druppel', en: 'water drop' },
      { name: 'water', nl: 'water golven', en: 'water waves' },
      { name: 'waves', nl: 'golven', en: 'waves' },
      { name: 'water_heater', nl: 'boiler geiser warm water', en: 'boiler geyser hot water heater' },
      { name: 'water_pump', nl: 'waterpomp pomp', en: 'water pump' },
      { name: 'faucet', nl: 'kraan', en: 'tap faucet' },
      { name: 'propane_tank', nl: 'gas gasfles propaan', en: 'gas gas bottle propane' },
      { name: 'gas_meter', nl: 'gasmeter', en: 'gas meter' },
      { name: 'oil_barrel', nl: 'vat tank diesel', en: 'barrel tank diesel' },
    ],
  },
  {
    group: 'security',
    icons: [
      { name: 'shield', nl: 'beveiliging alarm', en: 'security alarm' },
      { name: 'lock', nl: 'slot dicht', en: 'lock locked' },
      { name: 'lock_open', nl: 'slot open', en: 'lock unlocked open' },
      { name: 'sensor_door', nl: 'deursensor', en: 'door sensor' },
      { name: 'blinds', nl: 'rolgordijn jaloezie', en: 'blinds' },
      { name: 'curtains', nl: 'gordijn', en: 'curtain' },
      { name: 'roller_shades', nl: 'zonwering', en: 'awning shade' },
      { name: 'garage_home', nl: 'garagedeur', en: 'garage door' },
      { name: 'sensor_window', nl: 'raamsensor raam', en: 'window sensor' },
      { name: 'sensors', nl: 'sensor', en: 'sensor' },
      { name: 'motion_sensor_active', nl: 'beweging bewegingssensor', en: 'motion motion sensor movement' },
      { name: 'videocam', nl: 'camera', en: 'camera' },
      { name: 'doorbell', nl: 'deurbel bel', en: 'doorbell bell' },
      { name: 'notifications', nl: 'melding bel', en: 'notification bell' },
      { name: 'warning', nl: 'waarschuwing', en: 'warning' },
      { name: 'detector_smoke', nl: 'rookmelder rook', en: 'smoke detector smoke alarm' },
      { name: 'detector_alarm', nl: 'melder alarm co', en: 'detector alarm co' },
      { name: 'person', nl: 'persoon iemand aanwezig', en: 'person someone present' },
      { name: 'group', nl: 'mensen gezin', en: 'people family' },
      { name: 'family_restroom', nl: 'gezin familie', en: 'family' },
      { name: 'pets', nl: 'huisdier hond kat', en: 'pet dog cat' },
    ],
  },
  {
    group: 'media',
    icons: [
      { name: 'tv', nl: 'tv televisie', en: 'tv television' },
      { name: 'live_tv', nl: 'tv livestream', en: 'tv livestream' },
      { name: 'speaker', nl: 'speaker luidspreker', en: 'speaker loudspeaker' },
      { name: 'music_note', nl: 'muziek', en: 'music' },
      { name: 'radio', nl: 'radio', en: 'radio' },
      { name: 'router', nl: 'router modem', en: 'router modem' },
      { name: 'wifi', nl: 'wifi internet', en: 'wifi internet' },
      { name: 'satellite_alt', nl: 'satelliet starlink', en: 'satellite starlink' },
      { name: 'cell_tower', nl: 'mast 4g 5g', en: 'mast tower 4g 5g' },
      { name: 'lan', nl: 'netwerk', en: 'network' },
      { name: 'devices', nl: 'apparaten', en: 'devices' },
      { name: 'computer', nl: 'computer laptop', en: 'computer laptop' },
      { name: 'mobile', nl: 'telefoon', en: 'phone mobile' },
    ],
  },
  {
    group: 'outdoor',
    icons: [
      { name: 'park', nl: 'park boom', en: 'park tree' },
      { name: 'forest', nl: 'bos', en: 'forest woods' },
      { name: 'grass', nl: 'gras', en: 'grass lawn' },
      { name: 'sunny', nl: 'zon zonnig', en: 'sun sunny' },
      { name: 'partly_cloudy_day', nl: 'bewolkt', en: 'cloudy' },
      { name: 'rainy', nl: 'regen', en: 'rain' },
      { name: 'umbrella', nl: 'paraplu luifel', en: 'umbrella awning' },
      { name: 'beach_access', nl: 'strand parasol', en: 'beach parasol' },
      { name: 'local_gas_station', nl: 'tankstation brandstof', en: 'petrol station fuel' },
      { name: 'navigation', nl: 'navigatie route', en: 'navigation route' },
      { name: 'explore', nl: 'kompas', en: 'compass' },
      { name: 'map', nl: 'kaart', en: 'map' },
    ],
  },
  {
    group: 'other',
    icons: [
      { name: 'view_agenda', nl: 'sectie', en: 'section' },
      { name: 'dashboard', nl: 'overzicht dashboard', en: 'overview dashboard' },
      { name: 'category', nl: 'overig', en: 'other' },
      { name: 'widgets', nl: 'onderdelen', en: 'widgets parts' },
      { name: 'star', nl: 'ster favoriet', en: 'star favourite' },
      { name: 'favorite', nl: 'hart favoriet', en: 'heart favourite' },
      { name: 'schedule', nl: 'tijd klok', en: 'time clock' },
      { name: 'alarm', nl: 'wekker', en: 'alarm clock' },
      { name: 'calendar_month', nl: 'kalender', en: 'calendar' },
      { name: 'local_cafe', nl: 'koffie', en: 'coffee cafe' },
      { name: 'coffee_maker', nl: 'koffiezetter', en: 'coffee maker' },
      { name: 'microwave', nl: 'magnetron', en: 'microwave' },
      { name: 'blender', nl: 'blender', en: 'blender' },
      { name: 'local_laundry_service', nl: 'wasmachine was', en: 'washing machine laundry' },
      { name: 'spa', nl: 'spa ontspannen', en: 'spa relax' },
      { name: 'fitness_center', nl: 'sport fitness', en: 'sport fitness gym' },
      { name: 'play_circle', nl: 'flow afspelen', en: 'flow play' },
      { name: 'tune', nl: 'instellingen', en: 'settings' },
    ],
  },
];

const NAMES: ReadonlySet<string> = new Set(ICON_LIBRARY.flatMap((g) => g.icons.map((icon) => icon.name)));

/** The groups with the icons whose name or words (in the language given) contain every word of the query; empty groups are left out. */
export function searchIcons(query: string, language: Language): { group: IconGroup; icons: LibraryIcon[] }[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ICON_LIBRARY
    .map(({ group, icons }) => ({ group, icons: icons.filter((icon) => words.every((word) => `${icon.name} ${icon[language]}`.includes(word))) }))
    .filter(({ icons }) => icons.length > 0);
}

export function isLibraryIcon(name: string): name is IconName {
  return NAMES.has(name);
}
