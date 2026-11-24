import type { CapabilityValue, Device, RawHomey } from '../homey/types';
import type { Language } from '../i18n/index';
import type { Life, LifeHub } from './mock-client';

// The example house: an invented home with the kinds of devices, and the shapes of them, that apps on a Homey have.

/** In Dutch and in English. */
type Words = readonly [nl: string, en: string];
interface RawCap { id: string; title: Words; type: 'boolean' | 'number' | 'enum' | 'string'; value: CapabilityValue | Words; getable?: boolean; setable?: boolean; units?: string; min?: number; max?: number; step?: number; decimals?: number; when?: readonly [yes: Words, no: Words]; options?: readonly (readonly [id: string, title: Words])[] }
interface RawDevice { id: string; room: string; name: Words; class: string; caps: RawCap[]; energy?: { cumulative?: boolean; homeBattery?: boolean } }

const ONOFF: Words = ['Aan/uit', 'On/off'];
const onoff = (value: boolean): RawCap => ({ id: 'onoff', title: ONOFF, type: 'boolean', setable: true, value });
const part = (id: string, title: Words, value: number): RawCap => ({ id, title, type: 'number', setable: true, min: 0, max: 1, step: 0.01, decimals: 2, units: '%', value });
const dim = (value: number): RawCap => part('dim', ['Helderheid', 'Brightness'], value);
const reading = (id: string, title: Words, units: string, value: number, decimals = 1): RawCap => ({ id, title, type: 'number', units, decimals, value });
const power = (value: number): RawCap => reading('measure_power', ['Vermogen', 'Power'], 'W', value, 0);
const temperature = (value: number): RawCap => reading('measure_temperature', ['Temperatuur', 'Temperature'], '°C', value);
const humidity = (value: number): RawCap => reading('measure_humidity', ['Luchtvochtigheid', 'Humidity'], '%', value, 0);
const battery = (value: number): RawCap => reading('measure_battery', ['Batterij', 'Battery'], '%', value, 0);
const alarm = (id: string, title: Words, when: readonly [Words, Words], value = false): RawCap => ({ id, title, type: 'boolean', value, when });
const contact = (value = false): RawCap => alarm('alarm_contact', ['Contact', 'Contact'], [['Open', 'Open'], ['Dicht', 'Closed']], value);
const motion = (value = false): RawCap => alarm('alarm_motion', ['Beweging', 'Motion'], [['Beweging', 'Motion'], ['Rustig', 'Quiet']], value);
const press = (id: string, title: Words): RawCap => ({ id, title, type: 'boolean', getable: false, setable: true, value: null });
const target = (value: number, min = 5, max = 30, step = 0.5): RawCap => ({ id: 'target_temperature', title: ['Doeltemperatuur', 'Target temperature'], type: 'number', setable: true, units: '°C', min, max, step, decimals: 1, value });
const choice = (id: string, title: Words, options: readonly (readonly [string, Words])[], value: string): RawCap => ({ id, title, type: 'enum', setable: true, options, value });
const mode = (value: string): RawCap => choice('thermostat_mode', ['Stand', 'Mode'], [['auto', ['Automatisch', 'Automatic']], ['heat', ['Verwarmen', 'Heat']], ['cool', ['Koelen', 'Cool']], ['off', ['Uit', 'Off']]], value);
const coverState = (value = 'idle'): RawCap => choice('windowcoverings_state', ['Beweging', 'Movement'], [['up', ['Omhoog', 'Up']], ['idle', ['Stil', 'Idle']], ['down', ['Omlaag', 'Down']]], value);
const coverSet = (value: number): RawCap => part('windowcoverings_set', ['Positie', 'Position'], value);
const locked = (value: boolean): RawCap => ({ id: 'locked', title: ['Op slot', 'Locked'], type: 'boolean', setable: true, value });
const volume = (value: number): RawCap => part('volume_set', ['Volume', 'Volume'], value);
const mute = (): RawCap => ({ id: 'volume_mute', title: ['Gedempt', 'Muted'], type: 'boolean', setable: true, value: false });
const playing = (value: boolean): RawCap => ({ id: 'speaker_playing', title: ['Speelt', 'Playing'], type: 'boolean', setable: true, value });
const text = (id: string, title: Words, value: Words | string): RawCap => ({ id, title, type: 'string', value });
const skip = (): RawCap[] => [press('speaker_prev', ['Vorige', 'Previous']), press('speaker_next', ['Volgende', 'Next'])];

/** What the speaker plays, one after the other: title, artist, album and seconds. */
const SONGS: readonly { title: Words; artist: Words; album: Words; seconds: number }[] = [
  { title: ['Zonlicht op het water', 'Sunlight on the water'], artist: ['De Vuurtorens', 'The Lighthouses'], album: ['Kustlijn', 'Coastline'], seconds: 222 },
  { title: ['Langs de rivier', 'Along the river'], artist: ['Mila van Veen', 'Mila van Veen'], album: ['Onderweg', 'On the way'], seconds: 187 },
  { title: ['Nacht boven de stad', 'Night above the city'], artist: ['Kwartet Noord', 'North Quartet'], album: ['Blauw uur', 'Blue hour'], seconds: 254 },
  { title: ['Koffie om acht uur', 'Coffee at eight'], artist: ['De Buren', 'The Neighbours'], album: ['Zondag', 'Sunday'], seconds: 163 },
];

const ROOMS: readonly { id: string; name: Words; parent: string | null; icon: string }[] = [
  { id: 'home', name: ['Thuis', 'Home'], parent: null, icon: 'home' },
  { id: 'down', name: ['Beneden', 'Ground floor'], parent: 'home', icon: 'default' },
  { id: 'living', name: ['Woonkamer', 'Living room'], parent: 'down', icon: 'livingRoom' },
  { id: 'kitchen', name: ['Keuken', 'Kitchen'], parent: 'down', icon: 'kitchen' },
  { id: 'hall', name: ['Hal', 'Hall'], parent: 'down', icon: 'hallway' },
  { id: 'up', name: ['Boven', 'First floor'], parent: 'home', icon: 'default' },
  { id: 'bedroom', name: ['Slaapkamer', 'Bedroom'], parent: 'up', icon: 'bedroom' },
  { id: 'study', name: ['Werkkamer', 'Study'], parent: 'up', icon: 'office' },
  { id: 'bathroom', name: ['Badkamer', 'Bathroom'], parent: 'up', icon: 'bathroom' },
  { id: 'outside', name: ['Buiten', 'Outside'], parent: 'home', icon: 'default' },
  { id: 'garage', name: ['Garage', 'Garage'], parent: 'outside', icon: 'garage' },
  { id: 'garden', name: ['Tuin', 'Garden'], parent: 'outside', icon: 'garden' },
];

const DEVICES: readonly RawDevice[] = [
  // the living room
  { id: 'living-ceiling', room: 'living', name: ['Eettafel', 'Dining table'], class: 'light', caps: [onoff(true), dim(0.8)] },
  { id: 'living-reading', room: 'living', name: ['Leeslamp', 'Reading lamp'], class: 'light', caps: [onoff(true), dim(0.45), part('light_temperature', ['Kleurtemperatuur', 'Colour temperature'], 0.7)] },
  { id: 'living-mood', room: 'living', name: ['Sfeerlamp', 'Mood lamp'], class: 'light', caps: [onoff(false), dim(0.3), part('light_hue', ['Kleur', 'Colour'], 0.08), part('light_saturation', ['Verzadiging', 'Saturation'], 0.8)] },
  { id: 'living-thermostat', room: 'living', name: ['Thermostaat', 'Thermostat'], class: 'thermostat', caps: [temperature(20.5), target(21, 7, 30), choice('heating_programme', ['Programma', 'Programme'], [['schedule', ['Schema', 'Schedule']], ['away', ['Weg', 'Away']], ['manual', ['Handmatig', 'Manual']]], 'schedule')] },
  { id: 'living-curtain', room: 'living', name: ['Gordijn', 'Curtain'], class: 'curtain', caps: [coverState(), coverSet(1), battery(84)] },
  { id: 'living-blind', room: 'living', name: ['Rolgordijn', 'Roller blind'], class: 'blinds', caps: [coverSet(0.6), battery(61)] },
  { id: 'living-tv', room: 'living', name: ['Televisie', 'Television'], class: 'tv', caps: [onoff(true), { id: 'volume_set', title: ['Volume', 'Volume'], type: 'number', setable: true, min: 0, max: 100, step: 1, units: '%', value: 18 }, mute(), press('channel_up', ['Volgende zender', 'Next channel']), press('channel_down', ['Vorige zender', 'Previous channel']), choice('input_source', ['Ingang', 'Input'], [['hdmi1', ['HDMI 1', 'HDMI 1']], ['hdmi2', ['HDMI 2', 'HDMI 2']], ['tuner', ['Televisie', 'Tuner']]], 'hdmi1')] },
  { id: 'living-speaker', room: 'living', name: ['Muziek', 'Music'], class: 'speaker', caps: [playing(true), ...skip(), { id: 'speaker_shuffle', title: ['Willekeurig', 'Shuffle'], type: 'boolean', setable: true, value: false }, choice('speaker_repeat', ['Herhalen', 'Repeat'], [['none', ['Niet', 'Off']], ['track', ['Nummer', 'Track']], ['playlist', ['Afspeellijst', 'Playlist']]], 'none'), text('speaker_track', ['Nummer', 'Track'], SONGS[0]!.title), text('speaker_artist', ['Artiest', 'Artist'], SONGS[0]!.artist), text('speaker_album', ['Album', 'Album'], SONGS[0]!.album), reading('speaker_duration', ['Duur', 'Duration'], 's', SONGS[0]!.seconds, 0), reading('speaker_position', ['Plaats', 'Place'], 's', 94, 0), volume(0.32), mute()] },
  { id: 'living-motion', room: 'living', name: ['Bewegingssensor', 'Motion sensor'], class: 'sensor', caps: [motion(true), temperature(20.8), reading('measure_luminance', ['Lichtsterkte', 'Luminance'], 'lx', 210, 0), battery(72)] },
  { id: 'living-plug', room: 'living', name: ['Tv-meubel', 'TV cabinet'], class: 'socket', caps: [onoff(true), power(74)] },
  // the kitchen
  { id: 'kitchen-ceiling', room: 'kitchen', name: ['Keukenlamp', 'Kitchen lamp'], class: 'light', caps: [onoff(true), dim(1)] },
  { id: 'kitchen-counter', room: 'kitchen', name: ['Werkblad', 'Worktop'], class: 'light', caps: [onoff(false), dim(0.6)] },
  { id: 'kitchen-speaker', room: 'kitchen', name: ['Keukenradio', 'Kitchen radio'], class: 'speaker', caps: [playing(false), ...skip(), volume(0.2), mute()] },
  { id: 'kitchen-smoke', room: 'kitchen', name: ['Rookmelder', 'Smoke alarm'], class: 'sensor', caps: [alarm('alarm_smoke', ['Rookalarm', 'Smoke alarm'], [['Rook', 'Smoke'], ['Geen rook', 'No smoke']]), battery(91)] },
  { id: 'kitchen-fridge', room: 'kitchen', name: ['Koelkast', 'Fridge'], class: 'fridge', caps: [target(4, 2, 8, 1), temperature(4.2), contact()] },
  { id: 'kitchen-dishwasher', room: 'kitchen', name: ['Vaatwasser', 'Dishwasher'], class: 'socket', caps: [onoff(true), power(3)] },
  { id: 'kitchen-leak', room: 'kitchen', name: ['Lekmelder', 'Leak sensor'], class: 'sensor', caps: [alarm('alarm_water', ['Wateralarm', 'Water alarm'], [['Water', 'Water'], ['Droog', 'Dry']]), battery(13)] },
  // the hall
  { id: 'hall-lamp', room: 'hall', name: ['Hanglamp', 'Pendant lamp'], class: 'light', caps: [onoff(false), dim(0.5)] },
  { id: 'hall-lock', room: 'hall', name: ['Voordeur', 'Front door'], class: 'lock', caps: [locked(true), contact(), battery(58)] },
  { id: 'hall-alarm', room: 'hall', name: ['Huisalarm', 'House alarm'], class: 'homealarm', caps: [choice('homealarm_state', ['Alarmstand', 'Alarm state'], [['armed', ['Ingeschakeld', 'Armed']], ['disarmed', ['Uitgeschakeld', 'Disarmed']], ['partially_armed', ['Deels ingeschakeld', 'Partially armed']]], 'disarmed'), alarm('alarm_burglar', ['Inbraakalarm', 'Burglar alarm'], [['Inbraak', 'Burglary'], ['Niets', 'Nothing']])] },
  { id: 'hall-meter', room: 'hall', name: ['Slimme meter', 'Smart meter'], class: 'sensor', energy: { cumulative: true }, caps: [power(412), reading('meter_power', ['Energie', 'Energy'], 'kWh', 8412.6), reading('meter_gas', ['Gas', 'Gas'], 'm³', 2310.4)] },
  // the bedroom
  { id: 'bedroom-ceiling', room: 'bedroom', name: ['Slaapkamerlamp', 'Bedroom lamp'], class: 'light', caps: [onoff(false), dim(0.7)] },
  { id: 'bedroom-night', room: 'bedroom', name: ['Nachtlamp', 'Night lamp'], class: 'light', caps: [onoff(true), dim(0.15)] },
  { id: 'bedroom-shutter', room: 'bedroom', name: ['Rolluik', 'Shutter'], class: 'windowcoverings', caps: [coverState('down')] },
  { id: 'bedroom-valve', room: 'bedroom', name: ['Radiator', 'Radiator'], class: 'thermostat', caps: [target(17, 4, 28), battery(47)] },
  { id: 'bedroom-climate', room: 'bedroom', name: ['Klimaatsensor', 'Climate sensor'], class: 'sensor', caps: [temperature(17.6), humidity(52), battery(80)] },
  { id: 'bedroom-window', room: 'bedroom', name: ['Raam', 'Window'], class: 'sensor', caps: [contact(true), battery(66)] },
  { id: 'bedroom-tv', room: 'bedroom', name: ['Slaapkamer-tv', 'Bedroom TV'], class: 'tv', caps: [onoff(false), press('volume_up', ['Harder', 'Louder']), press('volume_down', ['Zachter', 'Softer']), press('channel_up', ['Volgende zender', 'Next channel']), press('channel_down', ['Vorige zender', 'Previous channel'])] },
  // the study
  { id: 'study-desk', room: 'study', name: ['Bureaulamp', 'Desk lamp'], class: 'light', caps: [onoff(false), dim(0.9)] },
  { id: 'study-airco', room: 'study', name: ['Airco', 'Air conditioner'], class: 'airconditioning', caps: [target(22, 10, 31, 1), mode('cool'), temperature(24.1), humidity(47)] },
  { id: 'study-blinds', room: 'study', name: ['Jaloezie', 'Venetian blind'], class: 'blinds', caps: [coverState(), coverSet(0.4), part('windowcoverings_tilt_set', ['Lamellen', 'Slats'], 0.25)] },
  { id: 'study-air', room: 'study', name: ['Luchtkwaliteit', 'Air quality'], class: 'sensor', caps: [reading('measure_co2', ['CO₂', 'CO₂'], 'ppm', 640, 0), temperature(23.8), humidity(46)] },
  // the bathroom
  { id: 'bathroom-mirror', room: 'bathroom', name: ['Spiegel', 'Mirror'], class: 'light', caps: [onoff(false), dim(0.75)] },
  { id: 'bathroom-zone', room: 'bathroom', name: ['Vloerverwarming', 'Underfloor heating'], class: 'thermostat', caps: [target(22), temperature(22.1), { id: 'onoff', title: ONOFF, type: 'boolean', setable: true, value: true }] },
  { id: 'bathroom-climate', room: 'bathroom', name: ['Vochtsensor', 'Humidity sensor'], class: 'sensor', caps: [humidity(63), temperature(22.3), battery(55)] },
  { id: 'bathroom-fan', room: 'bathroom', name: ['Ventilatie', 'Ventilation'], class: 'fan', caps: [onoff(true), power(9)] },
  // the garage
  { id: 'garage-door', room: 'garage', name: ['Garagedeur', 'Garage door'], class: 'garagedoor', caps: [{ id: 'garagedoor_closed', title: ['Gesloten', 'Closed'], type: 'boolean', setable: true, value: true }] },
  { id: 'garage-solar', room: 'garage', name: ['Zonnepanelen', 'Solar panels'], class: 'solarpanel', caps: [power(1840), reading('meter_power', ['Energie', 'Energy'], 'kWh', 5120.3)] },
  { id: 'garage-battery', room: 'garage', name: ['Thuisaccu', 'Home battery'], class: 'battery', energy: { homeBattery: true }, caps: [battery(76), power(620)] },
  { id: 'garage-charger', room: 'garage', name: ['Laadpaal', 'Charge point'], class: 'evcharger', caps: [{ id: 'evcharger_charging', title: ['Laadt op', 'Charging'], type: 'boolean', setable: true, value: false }, power(0), reading('meter_power', ['Energie', 'Energy'], 'kWh', 913.4)] },
  // the garden
  { id: 'garden-awning', room: 'garden', name: ['Zonwering', 'Awning'], class: 'sunshade', caps: [coverState(), coverSet(1)] },
  { id: 'garden-lights', room: 'garden', name: ['Tuinverlichting', 'Garden lights'], class: 'light', caps: [onoff(false)] },
  { id: 'garden-gate', room: 'garden', name: ['Poort', 'Gate'], class: 'sensor', caps: [{ id: 'locked', title: ['Op slot', 'Locked'], type: 'boolean', value: true }, battery(39)] },
  { id: 'garden-outside', room: 'garden', name: ['Buitensensor', 'Outside sensor'], class: 'sensor', caps: [temperature(11.4), humidity(78), battery(88)] },
];

const FLOWS: readonly Words[] = [['Goedemorgen', 'Good morning'], ['Welterusten', 'Good night'], ['Film kijken', 'Watch a film'], ['Iedereen weg', 'Everyone out']];

/** The house as a hub tells of it, with its names in this language; a fresh copy each time. */
export function houseRaw(language: Language): RawHomey {
  const say = (words: Words): string => words[language === 'nl' ? 0 : 1];
  const value = (v: RawCap['value']): CapabilityValue => (Array.isArray(v) ? say(v as unknown as Words) : v as CapabilityValue);
  const at = new Date(Date.now() - 3_600_000).toISOString();
  const cap = (c: RawCap): Record<string, unknown> => ({
    id: c.id, title: say(c.title), type: c.type, getable: c.getable ?? true, setable: c.setable ?? false, value: value(c.value), lastUpdated: at,
    units: c.units ?? null, min: c.min ?? null, max: c.max ?? null, step: c.step ?? null, decimals: c.decimals ?? null, titleTrue: c.when ? say(c.when[0]) : null, titleFalse: c.when ? say(c.when[1]) : null,
    ...(c.options ? { values: c.options.map(([id, title]) => ({ id, title: say(title) })) } : {}),
  });
  return {
    homeyId: 'example-house', softwareVersion: null, scopes: ['homey'],
    devices: Object.fromEntries(DEVICES.map((d) => [d.id, {
      id: d.id, name: say(d.name), zone: d.room, class: d.class, driverId: 'homey:app:example:device', available: true,
      capabilities: d.caps.map((c) => c.id), capabilitiesObj: Object.fromEntries(d.caps.map((c) => [c.id, cap(c)])), energyObj: d.energy ?? {},
    }])),
    zones: Object.fromEntries(ROOMS.map((room, order) => [room.id, { id: room.id, name: say(room.name), parent: room.parent, icon: room.icon, order }])),
    flows: Object.fromEntries(FLOWS.map((name, i) => [`flow-${i}`, { id: `flow-${i}`, name: say(name), enabled: true, triggerable: true }])),
    advancedFlows: {},
  };
}

/** The house does something this often. */
export const LIFE_MS = 500;
/** How much a cover moves meanwhile. */
const COVER_STEP = 0.05;
/** How long a lock and a garage door take. */
const LOCK_TICKS = 2;
const DOOR_TICKS = 8;
/** A second, and how often a temperature changes. */
const SECOND_TICKS = 1000 / LIFE_MS;
const WARM_TICKS = 10;

const round = (value: number, digits: number): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** How the example house answers: a lock takes a moment, a curtain moves bit by bit, music goes on. */
export function houseLife(): Life {
  const later = new Map<string, { ticks: number; deviceId: string; capabilityId: string; value: CapabilityValue }>();
  /** Where covers are going. */
  const going = new Map<string, number>();
  let ticks = 0;
  let song = 0;
  const has = (device: Device | undefined, id: string): boolean => device !== undefined && Object.hasOwn(device.capabilities, id);
  const english = (hub: LifeHub, id: string): boolean => hub.devices[id]?.capabilities['speaker_track']?.title === 'Track';

  function play(hub: LifeHub, id: string, by: number): void {
    song = (song + by + SONGS.length) % SONGS.length;
    const next = SONGS[song]!;
    const i = english(hub, id) ? 1 : 0;
    hub.report(id, 'speaker_track', next.title[i]);
    hub.report(id, 'speaker_artist', next.artist[i]);
    hub.report(id, 'speaker_album', next.album[i]);
    hub.report(id, 'speaker_duration', next.seconds);
    hub.report(id, 'speaker_position', 0);
  }

  function moveCovers(hub: LifeHub): void {
    for (const [id, to] of [...going]) {
      const at = hub.devices[id]?.capabilities['windowcoverings_set']?.value;
      if (typeof at !== 'number') { going.delete(id); continue; }
      const next = round(Math.abs(to - at) <= COVER_STEP ? to : at + Math.sign(to - at) * COVER_STEP, 3);
      if (next !== at) hub.report(id, 'windowcoverings_set', next);
      if (next !== to) continue;
      going.delete(id);
      hub.report(id, 'windowcoverings_state', 'idle');
    }
  }

  return {
    everyMs: LIFE_MS,
    set(hub, deviceId, capabilityId, value) {
      const device = hub.devices[deviceId];
      switch (capabilityId) {
        case 'locked': later.set(deviceId, { ticks: LOCK_TICKS, deviceId, capabilityId, value }); return true;
        case 'garagedoor_closed': later.set(deviceId, { ticks: DOOR_TICKS, deviceId, capabilityId, value }); return true;
        case 'windowcoverings_state': {
          if (!has(device, 'windowcoverings_set')) return false;
          if (value === 'idle') going.delete(deviceId);
          else going.set(deviceId, value === 'up' ? 1 : 0);
          return false;
        }
        case 'windowcoverings_set': {
          if (!has(device, 'windowcoverings_state') || typeof value !== 'number') return false;
          const at = device!.capabilities['windowcoverings_set']!.value;
          going.set(deviceId, value);
          if (typeof at === 'number' && at !== value) hub.report(deviceId, 'windowcoverings_state', value > at ? 'up' : 'down');
          return true;
        }
        case 'speaker_next': if (has(device, 'speaker_track')) play(hub, deviceId, 1); return true;
        case 'speaker_prev': if (has(device, 'speaker_track')) play(hub, deviceId, -1); return true;
        default: return false;
      }
    },
    tick(hub) {
      ticks += 1;
      for (const [id, wait] of [...later]) {
        wait.ticks -= 1;
        if (wait.ticks > 0) continue;
        later.delete(id);
        hub.report(wait.deviceId, wait.capabilityId, wait.value);
      }
      moveCovers(hub);
      for (const device of Object.values(hub.devices)) {
        const cap = (id: string) => device.capabilities[id];
        const position = cap('speaker_position')?.value;
        if (ticks % SECOND_TICKS === 0 && typeof position === 'number' && cap('speaker_playing')?.value === true) {
          const length = cap('speaker_duration')?.value;
          if (typeof length === 'number' && position + 1 >= length) play(hub, device.id, 1);
          else hub.report(device.id, 'speaker_position', position + 1);
        }
        const [measured, wanted] = [cap('measure_temperature')?.value, cap('target_temperature')?.value];
        if (ticks % WARM_TICKS === 0 && device.deviceClass !== 'fridge' && typeof measured === 'number' && typeof wanted === 'number' && cap('onoff')?.value !== false && cap('thermostat_mode')?.value !== 'off' && Math.abs(wanted - measured) >= 0.1) {
          hub.report(device.id, 'measure_temperature', round(measured + Math.sign(wanted - measured) * 0.1, 1));
        }
      }
    },
  };
}
