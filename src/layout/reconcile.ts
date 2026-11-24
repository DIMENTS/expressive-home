import { sectionFor } from '../dashboard/classify';
import type { SectionKind } from '../dashboard/types';
import { offeredFlows } from '../homey/flows';
import { missingFeatures } from '../homey/permissions';
import type { HomeySnapshot } from '../homey/types';
import { heroRefs, tileRefs, valueCapability } from './refs';
import { fitSize, followDevice, waitsForValue } from './tiles';
import { flowRef, OVERVIEW_ID, valueRef, type DashboardLayout, type HubLayout, type TileLayout } from './types';

export interface NewItem { ref: string; kind: 'device' | 'flow'; name: string; zoneName: string | null; suggest: SectionKind; /** The section of the Overzicht that is of its room. */ room?: { sectionId: string; name: string } }

/** Something a tile or an own hero stands on that is not on the hub; `boards` are dashboard ids, in the order of the rail. */
export interface GoneItem { ref: string; name: string; boards: string[]; heroFallback: boolean }

export interface Reconciliation { layout: HubLayout; news: NewItem[]; gone: GoneItem[]; changed: boolean }

const FLOW = flowRef('');

/** What the hub has of what a layout can stand on. A list the key may not read is empty without anything being gone. */
function hubView(snapshot: HomeySnapshot) {
  const missing = missingFeatures(snapshot.scopes);
  const flows = new Map(snapshot.flows.map((flow) => [flowRef(flow.id), flow]));
  const readable = (ref: string): boolean => !missing.includes(ref.startsWith(FLOW) ? 'readFlows' : 'readDevices');
  const nameOf = (ref: string): string | undefined => (ref.startsWith(FLOW) ? flows.get(ref)?.name : Object.hasOwn(snapshot.devices, ref) ? snapshot.devices[ref]?.name : undefined);
  return { readable, nameOf, isGone: (ref: string): boolean => readable(ref) && nameOf(ref) === undefined };
}

type HubView = ReturnType<typeof hubView>;

const tilesOf = (dashboard: DashboardLayout): TileLayout[] => (dashboard.sections ?? []).flatMap((s) => s.tiles);

/** A stored tile after its device changed; a tile whose device or value is gone stays as it is. */
function adaptedTile(tile: TileLayout, tiles: readonly TileLayout[], snapshot: HomeySnapshot): TileLayout {
  if (tile.spec.kind === 'flow' || waitsForValue(tile, tiles, snapshot.devices)) return tile;
  const spec = followDevice(tile, snapshot.devices[tile.spec.deviceId]);
  return spec === null || spec === tile.spec ? tile : { ...tile, spec, size: fitSize(spec.kind, tile.size) };
}

/** The value of a tile made from one value, when its device is there but the value is not. */
function goneValue(tile: TileLayout, snapshot: HomeySnapshot): string | null {
  if (tile.source !== 'value' || tile.spec.kind === 'flow') return null;
  const device = snapshot.devices[tile.spec.deviceId];
  const capability = valueCapability(tile);
  return device && capability !== null && !Object.hasOwn(device.capabilities, capability) ? valueRef(device.id, capability) : null;
}

function findGone(layout: HubLayout, snapshot: HomeySnapshot, hub: HubView, names: Record<string, string>, locale: string): GoneItem[] {
  const found = new Map<string, GoneItem>();
  const add = (ref: string, boardId: string, name: string, heroFallback = false): void => {
    const item = found.get(ref) ?? { ref, name, boards: [], heroFallback: false };
    found.set(ref, { ...item, boards: item.boards.includes(boardId) ? item.boards : [...item.boards, boardId], heroFallback: item.heroFallback || heroFallback });
  };
  for (const dashboard of layout.dashboards) {
    for (const tile of tilesOf(dashboard)) {
      const [base = ''] = tileRefs(tile);
      const value = goneValue(tile, snapshot);
      if (hub.isGone(base)) add(base, dashboard.id, names[base] ?? '');
      else if (value !== null) add(value, dashboard.id, `${names[base] ?? ''} · ${names[value] ?? valueCapability(tile) ?? ''}`);
    }
    for (const { hero } of dashboard.sections ?? []) {
      if (!hero) continue;
      for (const ref of heroRefs(hero)) if (hub.isGone(ref.deviceId)) add(ref.deviceId, dashboard.id, names[ref.deviceId] ?? '', ref === hero.main);
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, locale));
}

function findNews(layout: HubLayout, snapshot: HomeySnapshot, locale: string): NewItem[] {
  if (layout.dashboards.find((d) => d.id === OVERVIEW_ID)?.sections == null) return [];
  // what stands on the Overzicht is no news, whoever put it there
  const known = new Set([...layout.known, ...(layout.dashboards.find((d) => d.id === OVERVIEW_ID)?.sections ?? []).flatMap((s) => s.tiles.flatMap(tileRefs))]);
  const rooms = new Map((layout.dashboards.find((d) => d.id === OVERVIEW_ID)?.sections ?? []).flatMap(({ id, zone, name }): [string, { sectionId: string; name: string }][] => (zone !== undefined && name !== null ? [[zone, { sectionId: id, name }]] : [])));
  const devices = Object.values(snapshot.devices).map((device): NewItem => {
    const room = device.zoneId === null ? undefined : rooms.get(device.zoneId);
    return {
      ref: device.id, kind: 'device', name: device.name, zoneName: (device.zoneId !== null && snapshot.zones[device.zoneId]?.name) || null, suggest: sectionFor(device),
      ...(room ? { room } : {}),
    };
  });
  const flows = offeredFlows(snapshot).map((flow): NewItem =>
    ({ ref: flowRef(flow.id), kind: 'flow', name: flow.name, zoneName: null, suggest: 'flows' }));
  return [...devices, ...flows].filter((item) => !known.has(item.ref)).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Every device, flow and value the dashboards stand on, with the name the hub gives it now. */
function currentNames(layout: HubLayout, snapshot: HomeySnapshot, hub: HubView): Map<string, string | undefined> {
  const names = new Map<string, string | undefined>();
  for (const dashboard of layout.dashboards) {
    for (const tile of tilesOf(dashboard)) {
      const [base = '', value] = tileRefs(tile);
      names.set(base, hub.nameOf(base));
      if (value !== undefined && tile.spec.kind !== 'flow') names.set(value, snapshot.devices[tile.spec.deviceId]?.capabilities[valueCapability(tile) ?? '']?.title);
    }
    for (const { hero } of dashboard.sections ?? []) if (hero) for (const ref of heroRefs(hero)) names.set(ref.deviceId, hub.nameOf(ref.deviceId));
  }
  return names;
}

/**
 * What the hub and the stored layout make of each other: what is new (only while the Overzicht is an own
 * one), what is gone (it stays in the layout until forget-gone), and the layout with its tiles adapted to changed
 * devices, its names up to date and without what it no longer needs to know.
 */
export function reconcile(layout: HubLayout, snapshot: HomeySnapshot, locale: string): Reconciliation {
  const hub = hubView(snapshot);
  const adapted: HubLayout = {
    ...layout,
    dashboards: layout.dashboards.map((d) => ({ ...d, sections: d.sections && d.sections.map((s) => ({ ...s, tiles: s.tiles.map((tile) => adaptedTile(tile, s.tiles, snapshot)) })) })),
  };
  const referenced = currentNames(adapted, snapshot, hub);
  const known = layout.known.filter((ref) => referenced.has(ref) || !hub.isGone(ref));
  const names = Object.fromEntries([...new Set([...known, ...referenced.keys()])].flatMap((ref): [string, string][] => {
    const name = referenced.get(ref) ?? hub.nameOf(ref) ?? layout.names[ref];
    return name === undefined ? [] : [[ref, name]];
  }));
  const next = { ...adapted, known, names };
  const changed = !sameLayout(next, layout);
  const result = changed ? next : layout;
  return { layout: result, news: findNews(result, snapshot, locale), gone: findGone(result, snapshot, hub, names, locale), changed };
}

/** Whether two layouts hold the same; the order of the names does not count. */
function sameLayout(a: HubLayout, b: HubLayout): boolean {
  const plain = (layout: HubLayout): string => JSON.stringify([layout.dashboards, layout.known, layout.grouping, layout.rooms, Object.entries(layout.names).sort(([x], [y]) => (x < y ? -1 : 1))]);
  return plain(a) === plain(b);
}
