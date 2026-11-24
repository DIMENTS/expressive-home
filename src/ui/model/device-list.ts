import { tilesFor } from '../../dashboard/classify';
import type { HeroSpec, TileSpec } from '../../dashboard/types';
import { isButton } from '../../homey/buttons';
import { offeredFlows } from '../../homey/flows';
import type { Capability, Device, HomeySnapshot, Zone } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import type { Translate } from '../../i18n/index';
import type { BoardView } from '../../layout/board';
import { isMinor } from '../../recognition/recognize';
import type { IconName } from '../icons/icons';
import { iconFor, iconForCapability } from './icon-for';
import { sectionTitle } from './layout';

/** `readable`: it has a value to show, unlike a button. */
export interface ValueRow { capabilityId: string; title: string; value: string; icon: IconName; numeric: boolean; readable: boolean }
/** `where` are the titles of the sections of this board that hold it. */
export interface DeviceRow { id: string; name: string; icon: IconName; where: string[]; inHero: boolean; zoneName: string | null; values: ValueRow[] }
export interface ZoneGroup { zoneId: string | null; name: string; devices: DeviceRow[] }
/** `button`: the button of a flow, on the app on the hub. */
export interface FlowRow { id: string; name: string; where: string[]; button: boolean }

const blocksOf = (board: BoardView) => [...board.left, ...board.right];

/** The titles of the sections with a tile that matches, each once, in the order of the board. */
function sectionsWith(board: BoardView, matches: (spec: TileSpec) => boolean, t: Translate): string[] {
  const titles = blocksOf(board).flatMap((block) => (block.type === 'section' && block.section.tiles.some(matches) ? [sectionTitle(block.section, t)] : []));
  return [...new Set(titles)];
}

/** The devices a hero stands for: of an automatic one those that have no tile of their own, of an own one all it shows. */
function shownInHero(hero: HeroSpec): string[] {
  if (hero.kind !== 'own') return hero.deviceIds;
  return [hero.primary.deviceId, ...(hero.line ? [hero.line.deviceId] : []), ...hero.stats.flatMap((stat) => (stat.role === 'value' ? [stat.ref.deviceId] : []))];
}

function valueRow(cap: Capability, device: Device, t: Translate): ValueRow {
  const button = cap.baseId === 'button';
  return {
    capabilityId: cap.id, title: cap.title, icon: iconForCapability(cap, device), numeric: cap.type === 'number' && cap.getable, readable: cap.getable && !button,
    value: button ? t('tile.press') : joinValue(formatValue(cap, 'tile', t)),
  };
}

/** Everything a device can show or do, its side details such as a battery level or signal strength last. */
function valuesOf(device: Device, t: Translate): ValueRow[] {
  const caps = device.capabilityOrder.map((id) => device.capabilities[id]).filter((c): c is Capability => c !== undefined && (c.getable || c.setable));
  return [...caps.filter((c) => !isMinor(c.baseId)), ...caps.filter((c) => isMinor(c.baseId))].map((c) => valueRow(c, device, t));
}

/** The rooms as a walk through their tree: each followed by its own rooms, by name. */
function zonesInOrder(zones: Record<string, Zone>, locale: string): Zone[] {
  const all = Object.values(zones).sort((a, b) => a.name.localeCompare(b.name, locale));
  const seen = new Set<string>();
  const walk = (zone: Zone): Zone[] => (seen.has(zone.id) ? [] : (seen.add(zone.id), [zone, ...all.filter((child) => child.parentId === zone.id).flatMap(walk)]));
  const roots = all.filter((zone) => zone.parentId === null || !(zone.parentId in zones));
  // rooms that only point at each other are no one's child: they come last
  return [...roots.flatMap(walk), ...all.flatMap(walk)];
}

/** The devices per room in the order of the tree of rooms, by name within a room; only those whose name matches. */
export function deviceList(snapshot: HomeySnapshot, board: BoardView, query: string, t: Translate): ZoneGroup[] {
  const words = query.trim().toLocaleLowerCase(t.locale);
  const heroes = new Set(blocksOf(board).flatMap((block) => (block.type === 'hero' && block.hero ? shownInHero(block.hero) : [])));
  const rows = (zoneId: string | null, zoneName: string | null): DeviceRow[] => Object.values(snapshot.devices)
    .filter((device) => (device.zoneId !== null && device.zoneId in snapshot.zones ? device.zoneId : null) === zoneId)
    .filter((device) => device.name.toLocaleLowerCase(t.locale).includes(words))
    .sort((a, b) => a.name.localeCompare(b.name, t.locale))
    .map((device) => ({
      id: device.id, name: device.name.trim() || t('tile.unnamed'), icon: iconFor(tilesFor(device)[0]!, device), zoneName, inHero: heroes.has(device.id),
      where: sectionsWith(board, (spec) => spec.kind !== 'flow' && spec.deviceId === device.id, t), values: valuesOf(device, t),
    }));
  return [
    ...zonesInOrder(snapshot.zones, t.locale).map((zone): ZoneGroup => ({ zoneId: zone.id, name: zone.name, devices: rows(zone.id, zone.name) })),
    { zoneId: null, name: t('add.noZone'), devices: rows(null, null) },
  ].filter((group) => group.devices.length > 0);
}

/** The flows to choose from, the buttons first. */
export function flowList(snapshot: HomeySnapshot, board: BoardView, t: Translate): FlowRow[] {
  return offeredFlows(snapshot)
    .map((flow) => ({ id: flow.id, button: isButton(flow.id), name: flow.name.trim() || t('flows.unnamed'), where: sectionsWith(board, (spec) => spec.kind === 'flow' && spec.flowId === flow.id, t) }))
    .sort((a, b) => Number(b.button) - Number(a.button) || a.name.localeCompare(b.name, t.locale));
}
