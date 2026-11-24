import { sectionFor } from '../../dashboard/classify';
import type { CapRef } from '../../dashboard/types';
import type { Device, Zone } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import type { Translate } from '../../i18n/index';
import { dangerAlarms, isTank, tankLevel } from '../../recognition/recognize';
import { BATTERY } from '../../recognition/table';
import type { TankWatch } from '../../wall/settings';
import type { IconName } from '../icons/icons';

// What the rest screen of a wall tablet says (wall tablet, 4.1 and 4.3), without a screen.

/** Below this a battery is almost empty, below and above these a tank is almost empty and almost full. */
const BATTERY_LOW = 20;
const TANK_LOW = 15;
const TANK_HIGH = 90;
/** What was told stays until the value is this much past its limit, so nothing comes and goes around it. */
const MARGIN = 2;
const MOST = 3;
const MOST_AT_NIGHT = 2;

/** What is told: the name of what it is about (or ''), with a dot after it or not, and what is the matter. */
export interface AttentionItem { id: string; tone: 'alarm' | 'warn'; icon: IconName; name: string; dot: boolean; what: string; text: string }
export interface Attention { items: AttentionItem[]; more: number; active: Set<string> }

export interface AttentionInput {
  devices: Device[];
  /** The hub does not answer. */
  away: boolean;
  lowBattery: boolean;
  /** The state of charge of the large battery. */
  battery: CapRef | null;
  tanks: Record<string, TankWatch>;
  night: boolean;
  /** What was told of the battery and the tanks before this. */
  before: ReadonlySet<string>;
}

const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const nameOf = (device: Device, t: Translate): string => device.name.trim() || t('tile.unnamed');
const byName = (t: Translate) => (a: Device, b: Device): number => nameOf(a, t).localeCompare(nameOf(b, t), t.locale);
const percent = (value: number): string => joinValue({ text: String(value), unit: '%' });

function item(part: Omit<AttentionItem, 'text' | 'dot'> & { dot?: boolean }): AttentionItem {
  const { name, what, dot = false } = part;
  return { ...part, dot, text: name === '' ? what : `${name}${dot ? ' · ' : ' '}${what}` };
}

/** The tanks of the hub, by name. */
export const tanksOf = (devices: Device[], t: Translate): Device[] => devices.filter(isTank).sort(byName(t));

/** What needs attention: alarms, the hub that does not answer, the battery, and the tanks that are watched. At night only alarms. */
export function attention(input: AttentionInput, t: Translate): Attention {
  const { devices, battery, before, night } = input;
  const active = new Set<string>();
  const alarms: AttentionItem[] = [...devices].sort(byName(t)).flatMap((device) => dangerAlarms(device)
    .filter((alarm) => !night || alarm.baseId !== BATTERY.alarm)
    .map((alarm) => item({ id: `alarm:${device.id}:${alarm.id}`, tone: 'alarm', icon: 'warning', name: nameOf(device, t), dot: true, what: alarm.title })));
  const others: AttentionItem[] = [];
  if (input.away) others.push(item({ id: 'away', tone: 'alarm', icon: 'cloud_off', name: '', what: t('rest.away') }));

  const owner = input.lowBattery && battery ? devices.find((device) => device.id === battery.deviceId) : undefined;
  const charge = finite(owner?.capabilities[battery?.capabilityId ?? '']?.value);
  if (owner && charge !== null && Math.round(charge) < BATTERY_LOW + (before.has('battery') ? MARGIN : 0)) {
    active.add('battery');
    // when it raises an alarm itself, that says it already
    if (!dangerAlarms(owner).some((alarm) => alarm.baseId === BATTERY.alarm)) others.push(item({ id: 'battery', tone: 'warn', icon: 'battery_alert', name: '', what: t('rest.battery', { value: percent(Math.round(charge)) }) }));
  }

  for (const tank of tanksOf(devices, t)) {
    const watch = Object.hasOwn(input.tanks, tank.id) ? input.tanks[tank.id] : undefined;
    const level = tankLevel(tank);
    if (!watch || level === null) continue;
    const id = `tank:${tank.id}`;
    const margin = before.has(id) ? MARGIN : 0;
    if (watch === 'low' ? level >= TANK_LOW + margin : level <= TANK_HIGH - margin) continue;
    active.add(id);
    others.push(item({ id, tone: 'warn', icon: 'water_drop', name: nameOf(tank, t), what: t(watch === 'low' ? 'rest.tankLow' : 'rest.tankHigh', { value: percent(level) }) }));
  }

  const all = night ? alarms : [...alarms, ...others];
  const items = all.slice(0, night ? MOST_AT_NIGHT : MOST);
  return { items, more: all.length - items.length, active };
}

/** "21,4°"; null when there is nothing to say. */
export function temperature(ref: CapRef | null, getDevice: (id: string) => Device | undefined, t: Translate): string | null {
  const cap = ref ? getDevice(ref.deviceId)?.capabilities[ref.capabilityId] : undefined;
  return cap && finite(cap.value) !== null ? `${formatValue(cap, 'tile', t).text}°` : null;
}

export interface TemperatureSource { ref: CapRef; name: string; zone: string }

/** What can be chosen as the temperature inside or outside: what measures one and is no lamp or switch that only warms up. */
export function temperatureSources(devices: Device[], zones: Record<string, Zone>, t: Translate): TemperatureSource[] {
  const rank = (device: Device): number => (sectionFor(device) === 'climate' ? 0 : 1);
  return devices
    .filter((device) => !['lights', 'switches'].includes(sectionFor(device)))
    .sort((a, b) => rank(a) - rank(b) || byName(t)(a, b))
    .flatMap((device) => {
      const found = device.capabilityOrder.flatMap((id) => device.capabilities[id] ?? []).filter((cap) => cap.baseId === 'measure_temperature' && cap.type === 'number' && cap.getable);
      return found.map((cap): TemperatureSource => ({
        ref: { deviceId: device.id, capabilityId: cap.id },
        name: found.length > 1 ? `${nameOf(device, t)} · ${cap.title}` : nameOf(device, t),
        zone: (device.zoneId && zones[device.zoneId]?.name) || '',
      }));
    });
}

const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;

/** Where the picture stands in a minute, against burning in: a ring of eight places. */
export function shiftAt(minute: number): { x: number; y: number } {
  const [x, y] = RING[((minute % RING.length) + RING.length) % RING.length]!;
  return { x, y };
}
