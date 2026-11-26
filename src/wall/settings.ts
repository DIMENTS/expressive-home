import type { CapRef } from '../dashboard/types';
import { isHomeyId } from '../homey/routes';
import { defaultScreen, NIGHT_SCREENS, REST_BRIGHTNESS, type NightScreen, type RestBrightness, type ScreenSettings } from './screen';

// What is set up for a wall tablet: a rest screen when nobody is there, and the night. It belongs to one device.

/** After how many minutes without a touch the rest screen comes. */
export const REST_AFTER = [1, 2, 5, 10] as const;
export type RestAfter = (typeof REST_AFTER)[number];

/** The fixed times of the night, on the clock of the device ("22:30"). */
export interface NightTimes { on: boolean; from: string; to: string }

/** What a tank is watched for. */
export type TankWatch = 'low' | 'high';

/** What belongs to one hub: the sensors of the two temperatures, and the tanks (by device) that are watched. */
export interface WallHub { inside: CapRef | null; outside: CapRef | null; tanks: Record<string, TankWatch> }

export interface WallSettings {
  on: boolean;
  after: RestAfter;
  night: NightTimes;
  /** Whether an almost empty battery is told. */
  lowBattery: boolean;
  /** By the id of the hub; the one that changed last goes last. */
  hubs: Record<string, WallHub>;
  /** The light of the screen, where Fully Kiosk lets the page reach it. */
  screen: ScreenSettings;
}

const MAX_HUBS = 5;
const MAX_TANKS = 100;
const MAX_ID = 200;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const defaultWall = (): WallSettings => ({ on: false, after: 2, night: { on: true, from: '22:30', to: '07:30' }, lowBattery: true, hubs: {}, screen: defaultScreen() });
export const emptyWallHub = (): WallHub => ({ inside: null, outside: null, tanks: {} });

/** Whether a text is a time of day as it is kept. */
export const isTime = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_ID;

function normalizeRef(raw: unknown): CapRef | null {
  if (!isRecord(raw)) return null;
  const { deviceId, capabilityId } = raw;
  return isId(deviceId) && isId(capabilityId) ? { deviceId, capabilityId } : null;
}

function normalizeHub(raw: Record<string, unknown>): WallHub {
  const tanks = isRecord(raw['tanks']) ? Object.entries(raw['tanks']) : [];
  return {
    inside: normalizeRef(raw['inside']),
    outside: normalizeRef(raw['outside']),
    tanks: Object.fromEntries(tanks.filter((entry): entry is [string, TankWatch] => isId(entry[0]) && entry[0] !== '__proto__' && (entry[1] === 'low' || entry[1] === 'high')).slice(0, MAX_TANKS)),
  };
}

/** What was kept, field by field; what is missing or wrong is the default. */
export function normalizeWall(raw: unknown): WallSettings {
  const wall = defaultWall();
  if (!isRecord(raw)) return wall;
  if (typeof raw['on'] === 'boolean') wall.on = raw['on'];
  if (REST_AFTER.includes(raw['after'] as RestAfter)) wall.after = raw['after'] as RestAfter;
  if (typeof raw['lowBattery'] === 'boolean') wall.lowBattery = raw['lowBattery'];
  const night = raw['night'];
  if (isRecord(night)) {
    if (typeof night['on'] === 'boolean') wall.night.on = night['on'];
    if (isTime(night['from'])) wall.night.from = night['from'];
    if (isTime(night['to'])) wall.night.to = night['to'];
  }
  const screen = raw['screen'];
  if (isRecord(screen)) {
    if (REST_BRIGHTNESS.includes(screen['rest'] as RestBrightness)) wall.screen.rest = screen['rest'] as RestBrightness;
    if (NIGHT_SCREENS.includes(screen['night'] as NightScreen)) wall.screen.night = screen['night'] as NightScreen;
  }
  if (isRecord(raw['hubs'])) {
    const hubs = Object.entries(raw['hubs']).flatMap(([id, hub]): [string, WallHub][] => (isHomeyId(id) && isRecord(hub) ? [[id.toLowerCase(), normalizeHub(hub)]] : []));
    wall.hubs = Object.fromEntries(hubs.slice(-MAX_HUBS));
  }
  return wall;
}

/** What was chosen for a hub; nothing when there is none. */
export function wallHubOf(wall: WallSettings, hubId: string | null): WallHub {
  const id = hubId?.toLowerCase() ?? '';
  return Object.hasOwn(wall.hubs, id) ? wall.hubs[id]! : emptyWallHub();
}

/** The settings with other choices for one hub. */
export function withWallHub(wall: WallSettings, hubId: string, hub: WallHub): WallSettings {
  const id = hubId.toLowerCase();
  const others = Object.entries(wall.hubs).filter(([other]) => other !== id);
  return { ...wall, hubs: Object.fromEntries([...others, [id, hub]].slice(-MAX_HUBS)) };
}
