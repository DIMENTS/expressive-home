import { HOUSE_KINDS, SECTION_ORDER, type CapRef, type HouseKind, type SectionLayoutKind, type TileSpec } from '../dashboard/types';
import { isHomeyId } from '../homey/routes';
import { cleanName, valueCapability } from '../layout/refs';
import { fitSize } from '../layout/tiles';
import {
  defaultHubLayout, LIMITS, OVERVIEW_ID,
  type DashboardLayout, type HeroChoice, type HeroValueRef, type HubLayout, type SectionLayout, type TileLayout, HERO_CHARTS } from '../layout/types';
import { SECTION_ID } from './config';
import { widgetSpecOf } from '../widgets/widget-ref';

const MAX_HUBS = 5;
const MAX_KNOWN = 5000;
const MAX_ID_LENGTH = 200;
const MULTI_VALUES = 3;
const ICON = /^[a-z0-9_]{1,40}$/;
const DASHBOARD_ID = /^[a-z0-9-]{1,40}$/i;
const SECTION_KINDS: readonly (SectionLayoutKind | 'hero')[] = [...SECTION_ORDER, 'own', 'hero'];

type Obj = Record<string, unknown>;
const isRecord = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** An id of the hub or the layout: text of a sane length, and never a name every object has, such as `__proto__`. */
const idOf = (value: unknown): string | null =>
  (typeof value === 'string' && value !== '' && value.length <= MAX_ID_LENGTH && !(value in Object.prototype) ? value : null);
const iconOf = (value: unknown): string | null => (typeof value === 'string' && ICON.test(value) ? value : null);
const nameOf = (value: unknown): string | null => cleanName(typeof value === 'string' ? value : null);

function capRef(raw: unknown): CapRef | null {
  if (!isRecord(raw)) return null;
  const deviceId = idOf(raw['deviceId']);
  const capabilityId = idOf(raw['capabilityId']);
  return deviceId !== null && capabilityId !== null ? { deviceId, capabilityId } : null;
}

/** The spec of a known kind of tile with only its own fields, or null when one of them is missing. */
function specOf(raw: unknown, id: string): TileSpec | null {
  if (!isRecord(raw)) return null;
  const size = fitSize(raw['kind'] as TileSpec['kind'], raw['size'] === 'wide' ? 'wide' : 'single');
  if (raw['kind'] === 'flow') {
    const flowId = idOf(raw['flowId']);
    const flowKind = raw['flowKind'];
    return flowId !== null && (flowKind === 'flow' || flowKind === 'advanced') ? { kind: 'flow', id, flowId, flowKind, size: 'single' } : null;
  }
  if (raw['kind'] === 'widget') return widgetSpecOf(raw, id, size);
  const deviceId = idOf(raw['deviceId']);
  if (deviceId === null) return null;
  const common = { id, deviceId, size };
  const optional = (key: string): string | null => idOf(raw[key]);
  switch (raw['kind']) {
    case 'light': {
      const dimCapabilityId = idOf(raw['dimCapabilityId']);
      return dimCapabilityId === null ? null : { kind: 'light', ...common, onoffCapabilityId: optional('onoffCapabilityId'), dimCapabilityId };
    }
    case 'switch': {
      const onoffCapabilityId = idOf(raw['onoffCapabilityId']);
      return onoffCapabilityId === null ? null : { kind: 'switch', ...common, onoffCapabilityId, detailCapabilityId: optional('detailCapabilityId') };
    }
    case 'tank':
      return { kind: 'tank', ...common, levelCapabilityId: optional('levelCapabilityId'), volumeCapabilityId: optional('volumeCapabilityId'), capacityCapabilityId: optional('capacityCapabilityId') };
    case 'button': case 'sensor': {
      const capabilityId = idOf(raw['capabilityId']);
      if (capabilityId === null) return null;
      return raw['kind'] === 'button' ? { kind: 'button', ...common, capabilityId } : { kind: 'sensor', ...common, capabilityId, showCapabilityTitle: raw['showCapabilityTitle'] === true, ...(typeof raw['trend'] === 'boolean' ? { trend: raw['trend'] } : {}) };
    }
    case 'multi': {
      const capabilityIds = list(raw['capabilityIds']).map(idOf).filter((c): c is string => c !== null).slice(0, MULTI_VALUES);
      return capabilityIds.length === 0 ? null : { kind: 'multi', ...common, capabilityIds };
    }
    case 'generic': return { kind: 'generic', ...common, capabilityId: optional('capabilityId') };
    default: return HOUSE_KINDS.includes(raw['kind'] as HouseKind) ? { kind: raw['kind'] as HouseKind, ...common } : null;
  }
}

function tileOf(raw: unknown): TileLayout | null {
  if (!isRecord(raw)) return null;
  const id = idOf(raw['id']);
  const spec = id === null ? null : specOf(raw['spec'], id);
  if (id === null || spec === null) return null;
  const size = fitSize(spec.kind, raw['size'] === 'wide' ? 'wide' : 'single');
  const tile: TileLayout = { id, spec: { ...spec, size } as TileSpec, size, label: nameOf(raw['label']), icon: iconOf(raw['icon']), source: 'value' };
  return { ...tile, source: raw['source'] === 'value' && valueCapability(tile) !== null ? 'value' : 'device' };
}

function heroOf(raw: unknown): HeroChoice | null {
  const main = isRecord(raw) ? capRef(raw['main']) : null;
  if (!isRecord(raw) || main === null) return null;
  const stats = list(raw['stats']).flatMap((stat): HeroValueRef[] => {
    if (isRecord(stat) && stat['net'] === true) return [{ net: true }];
    const ref = capRef(stat);
    return ref ? [ref] : [];
  });
  return { main, line: capRef(raw['line']), stats: stats.slice(0, LIMITS.heroStats), name: nameOf(raw['name']) };
}

/** Ids already seen in this layout: a second one falls away. */
interface Seen { sections: Set<string>; tiles: Set<string> }

const firstTime = (seen: Set<string>, id: string): boolean => !seen.has(id) && seen.add(id).has(id);

function sectionOf(raw: unknown, seen: Seen, room: number): SectionLayout | null {
  if (!isRecord(raw)) return null;
  const id = idOf(raw['id']);
  const kind = raw['kind'] as SectionLayout['kind'];
  if (id === null || !SECTION_ID.test(id) || !SECTION_KINDS.includes(kind) || !firstTime(seen.sections, id)) return null;
  const tiles = kind === 'hero' ? [] : list(raw['tiles']).map(tileOf).filter((tile): tile is TileLayout => tile !== null && firstTime(seen.tiles, tile.id)).slice(0, room);
  return {
    id, kind, column: raw['column'] === 'right' ? 'right' : 'left', name: nameOf(raw['name']), icon: iconOf(raw['icon']), tiles,
    hero: kind === 'hero' ? heroOf(raw['hero']) : null, ...(kind === 'own' && idOf(raw['zone']) !== null ? { zone: idOf(raw['zone'])! } : {}),
  };
}

function sectionsOf(raw: unknown[], seen: Seen): SectionLayout[] {
  const sections: SectionLayout[] = [];
  let room: number = LIMITS.tilesPerDashboard;
  let hasHero = false;
  for (const entry of raw) {
    if (sections.length >= LIMITS.sectionsPerDashboard) break;
    const section = sectionOf(entry, seen, room);
    if (!section || (section.kind === 'hero' && hasHero)) continue;
    hasHero ||= section.kind === 'hero';
    room -= section.tiles.length;
    sections.push(section);
  }
  return sections;
}

function dashboardOf(raw: unknown, ids: Set<string>, seen: Seen): DashboardLayout | null {
  if (!isRecord(raw)) return null;
  const id = idOf(raw['id']);
  if (id === null || !DASHBOARD_ID.test(id) || !firstTime(ids, id)) return null;
  const sections = Array.isArray(raw['sections']) ? sectionsOf(raw['sections'], seen) : id === OVERVIEW_ID ? null : [];
  const chart = HERO_CHARTS.find((one) => one === raw['chart']);
  return { id, name: nameOf(raw['name']), icon: iconOf(raw['icon']), sections, ...(chart ? { chart } : {}) };
}

/** The dashboards of a stored layout or a file: what is wrong falls away, the Overzicht always exists. Null when it is no list. */
export function normalizeDashboards(raw: unknown): DashboardLayout[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = new Set<string>();
  const seen: Seen = { sections: new Set(), tiles: new Set() };
  const all: DashboardLayout[] = [];
  let own = 0;
  for (const entry of raw) {
    const isOverview = isRecord(entry) && entry['id'] === OVERVIEW_ID;
    if (!isOverview && own >= LIMITS.dashboards - 1) continue;
    const dashboard = dashboardOf(entry, ids, seen);
    if (!dashboard) continue;
    if (!isOverview) own += 1;
    all.push(dashboard);
  }
  return ids.has(OVERVIEW_ID) ? all : [...defaultHubLayout().dashboards, ...all];
}

/** What is chosen for the whole hub; absent as long as nothing is. */
export const hubChoices = (raw: Record<string, unknown>): Pick<HubLayout, 'grouping' | 'rooms'> =>
  ({ ...(raw['grouping'] === 'zone' ? { grouping: 'zone' } : {}), ...(raw['rooms'] === false ? { rooms: false } : {}) });

/** A stored layout, checked field by field: what is wrong falls away, the Overzicht always exists. Null when nothing usable is left. */
export function normalizeHubLayout(raw: unknown): HubLayout | null {
  const dashboards = isRecord(raw) ? normalizeDashboards(raw['dashboards']) : null;
  if (!isRecord(raw) || dashboards === null) return null;
  const known = [...new Set(list(raw['known']).map(idOf).filter((ref): ref is string => ref !== null))].slice(0, MAX_KNOWN);
  const names = Object.entries(isRecord(raw['names']) ? raw['names'] : {})
    .filter((entry): entry is [string, string] => idOf(entry[0]) !== null && typeof entry[1] === 'string')
    .slice(0, MAX_KNOWN)
    .map(([ref, name]): [string, string] => [ref, name.slice(0, MAX_ID_LENGTH)]);
  return { dashboards, known, names: Object.fromEntries(names), ...hubChoices(raw) };
}

/** The stored layouts per Homey id; the last ones count, because the hub in use is always written last. */
export function normalizeLayouts(raw: unknown): Record<string, HubLayout> {
  if (!isRecord(raw)) return {};
  const layouts = Object.entries(raw).flatMap(([homeyId, value]): [string, HubLayout][] => {
    const layout = isHomeyId(homeyId) ? normalizeHubLayout(value) : null;
    return layout ? [[homeyId, layout]] : [];
  });
  return Object.fromEntries(layouts.slice(-MAX_HUBS));
}
