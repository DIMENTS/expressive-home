import { isGuarded } from '../controls/danger';
import { houseKind, plainTilesFor, tilesFor } from '../dashboard/classify';
import { HOUSE_KINDS, isDeviceTile, type DeviceTileSpec, type TileSize, type TileSpec } from '../dashboard/types';
import type { Capability, Device } from '../homey/types';
import { isTank, mainValues } from '../recognition/recognize';
import { valueCapability } from './refs';
import type { TileLayout } from './types';

const caps = (device: Device): Capability[] => device.capabilityOrder.map((id) => device.capabilities[id]).filter((c): c is Capability => c !== undefined);

/** A capability by its id; only the device's own, never something inherited by the record. */
const capOf = (device: Device, id: string | null): Capability | undefined => (id !== null && Object.hasOwn(device.capabilities, id) ? device.capabilities[id] : undefined);

const dims = (device: Device): Capability[] => caps(device).filter((c) => c.baseId === 'dim' && c.setable);
const toggles = (device: Device): Capability[] => caps(device).filter((c) => c.baseId === 'onoff' && c.setable);

/** The size a kind can have: three values never fit in a narrow tile, a flow has one size. */
export function fitSize(kind: TileSpec['kind'], size: TileSize): TileSize {
  if (kind === 'multi') return 'wide';
  return kind === 'flow' ? 'single' : size;
}

/** A tile for one value, or null when the device does not have it. The id is the layout's. */
export function tileForValue(device: Device, capabilityId: string, id: string): DeviceTileSpec | null {
  const cap = capOf(device, capabilityId);
  if (!cap) return null;
  const common = { id, deviceId: device.id, size: 'single' as const };
  // what lets somebody in is never one tap away
  if (isGuarded(device, cap.id)) return { kind: 'generic', ...common, capabilityId };
  if (cap.baseId === 'button') return { kind: 'button', ...common, capabilityId };
  if (cap.type === 'boolean' && cap.setable) return { kind: 'switch', ...common, onoffCapabilityId: capabilityId, detailCapabilityId: null };
  if (cap.type === 'number' && cap.getable) return { kind: 'sensor', ...common, capabilityId, showCapabilityTitle: true };
  return { kind: 'generic', ...common, capabilityId };
}

/** The app's own first tile for a device, under another tile's id, with its size and look. `plain`: of one of its values. */
function appChoice(spec: DeviceTileSpec, device: Device, plain: boolean): DeviceTileSpec {
  const own = (plain ? plainTilesFor(device) : tilesFor(device))[0] as DeviceTileSpec;
  const { label, icon } = spec;
  return { ...own, id: spec.id, size: fitSize(own.kind, spec.size), ...(label === undefined ? {} : { label }), ...(icon === undefined ? {} : { icon }) };
}

function adapted(spec: DeviceTileSpec, device: Device): DeviceTileSpec {
  const has = (id: string | null): boolean => id === null || capOf(device, id) !== undefined;
  // a dashboard of the owner does not change by itself: what showed a value shows a value
  const own = (): DeviceTileSpec => appChoice(spec, device, !HOUSE_KINDS.some((kind) => kind === spec.kind));
  // except that nothing dangerous is one tap away
  const guardedOwn = (): DeviceTileSpec => appChoice(spec, device, false);
  switch (spec.kind) {
    case 'light': {
      const dim = dims(device).find((c) => c.id === spec.dimCapabilityId) ?? dims(device)[0];
      if (!dim) return own();
      const choice = toggles(device);
      const onoff = spec.onoffCapabilityId === null ? null : (choice.find((c) => c.id === spec.onoffCapabilityId) ?? choice.find((c) => c.id === 'onoff') ?? choice[0])?.id ?? null;
      return { ...spec, dimCapabilityId: dim.id, onoffCapabilityId: onoff };
    }
    case 'switch': {
      if (isGuarded(device, spec.onoffCapabilityId)) return guardedOwn();
      if (!capOf(device, spec.onoffCapabilityId)?.setable) return own();
      if (has(spec.detailCapabilityId)) return spec;
      const choice = own();
      return { ...spec, detailCapabilityId: choice.kind === 'switch' ? choice.detailCapabilityId : null };
    }
    case 'tank': {
      if (!isTank(device)) return own();
      if (has(spec.levelCapabilityId) && has(spec.volumeCapabilityId) && has(spec.capacityCapabilityId)) return spec;
      const choice = own();
      return choice.kind === 'tank' ? { ...spec, levelCapabilityId: choice.levelCapabilityId, volumeCapabilityId: choice.volumeCapabilityId, capacityCapabilityId: choice.capacityCapabilityId } : choice;
    }
    case 'multi': {
      const kept = spec.capabilityIds.filter(has);
      if (kept.length === spec.capabilityIds.length) return spec;
      const spare = mainValues(device).map((c) => c.id).filter((id) => !kept.includes(id));
      const filled = [...kept, ...spare].slice(0, spec.capabilityIds.length);
      return filled.length === spec.capabilityIds.length ? { ...spec, capabilityIds: filled } : own();
    }
    case 'button': return isGuarded(device, spec.capabilityId) ? guardedOwn() : has(spec.capabilityId) ? spec : own();
    case 'sensor': case 'generic': return has(spec.capabilityId) ? spec : own();
    case 'climate': case 'cover': case 'media': case 'guard': return houseKind(device) === spec.kind ? spec : own();
    // of a later version
    default: return spec;
  }
}

/**
 * A device tile after the device changed: what is still there stays, what is gone falls back to the app's
 * choice; a device that no longer suits the kind gets the app's first tile. Keeps the id, the size and the own look.
 * A tile with nothing to change stays the same object.
 */
export function adaptTile(spec: DeviceTileSpec, device: Device): DeviceTileSpec {
  const next = adapted(spec, device);
  return JSON.stringify(next) === JSON.stringify(spec) ? spec : next;
}

/**
 * The spec of a stored device tile after its device changed, still with the stored size; null when the device or the
 * tile's one value is gone. A value that became something else gives the tile for what it is now.
 */
export function followDevice(tile: TileLayout, device: Device | undefined): DeviceTileSpec | null {
  if (!device || !isDeviceTile(tile.spec)) return null;
  if (tile.source === 'device') return adaptTile(tile.spec, device);
  const capability = valueCapability(tile);
  const made = capability === null ? null : tileForValue(device, capability, tile.id);
  if (!made) return null;
  return made.kind === tile.spec.kind ? adaptTile(tile.spec, device) : made;
}

/**
 * A tile of a section whose value is gone, while the value it would fall back to already has a tile there: it waits,
 * hidden and as it was stored, for its value to come back. Otherwise a device that loses a value had the same tile
 * twice. Copies the owner made of one tile stay copies.
 */
export function waitsForValue(tile: TileLayout, tiles: readonly TileLayout[], devices: Record<string, Device>): boolean {
  const { spec } = tile;
  if (tile.source !== 'device' || spec.kind !== 'sensor') return false;
  const device = devices[spec.deviceId];
  const next = followDevice(tile, device);
  if (next?.kind !== 'sensor' || next.capabilityId === spec.capabilityId) return false;
  const at = tiles.indexOf(tile);
  return tiles.some((other, index) => {
    if (other.spec.kind !== 'sensor' || other.spec.deviceId !== spec.deviceId || other.spec.capabilityId === spec.capabilityId) return false;
    const shown = followDevice(other, device);
    return shown?.kind === 'sensor' && shown.capabilityId === next.capabilityId && (other.spec.capabilityId === next.capabilityId || index < at);
  });
}

/** The spec a stored device tile is drawn with now: with the layout's id, size and own look; null when it is gone. */
export function currentSpec(tile: TileLayout, device: Device | undefined): DeviceTileSpec | null {
  const spec = followDevice(tile, device);
  return spec && { ...spec, id: tile.id, size: fitSize(spec.kind, tile.size), label: tile.label, icon: tile.icon };
}

/** What "Tegel instellen" can choose for a tile; an empty list means the group is not shown. */
export interface TileChoices { slider: Capability[]; tap: Capability[]; main: Capability[]; detail: Capability[]; cells: Capability[] }

const several = (list: Capability[]): Capability[] => (list.length > 1 ? list : []);

export function tileChoices(spec: DeviceTileSpec, device: Device): TileChoices {
  const none: TileChoices = { slider: [], tap: [], main: [], detail: [], cells: [] };
  switch (spec.kind) {
    case 'light': return { ...none, slider: several(dims(device)), tap: several(toggles(device)) };
    case 'sensor': return { ...none, main: several(mainValues(device)) };
    case 'switch': return { ...none, detail: mainValues(device) };
    case 'multi': return { ...none, cells: mainValues(device) };
    default: return none;
  }
}
