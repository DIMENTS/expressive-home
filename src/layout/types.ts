import type { CapRef, SectionLayoutKind, TileSize, TileSpec } from '../dashboard/types';

/** The column a section stands in. */
export type Column = 'left' | 'right';

/** The id of the Overzicht: the one dashboard that always exists and the only one that can be automatic. */
export const OVERVIEW_ID = 'overview';

/** The screen with the rooms, and a room: open as a dashboard is, but never stored; no dashboard can have such an id. */
export const ROOMS_ID = 'view:rooms';
const ROOM = 'room:';
export const roomBoardId = (roomId: string): string => `${ROOM}${roomId}`;
/** The room of such an id, or null. */
export const roomOfBoard = (boardId: string): string | null => (boardId.startsWith(ROOM) ? boardId.slice(ROOM.length) : null);

/**
 * A tile as it is stored. `source`: the whole device (or flow), or one value of it.
 * `size` is the truth; a spec gets it when the tile is drawn.
 */
export interface TileLayout { id: string; spec: TileSpec; size: TileSize; label: string | null; icon: string | null; source: 'device' | 'value' }

export type HeroValueRef = CapRef | { net: true };

/** An own hero; at most LIMITS.heroStats stats. */
export interface HeroChoice { main: CapRef; line: CapRef | null; stats: HeroValueRef[]; name: string | null }

export interface SectionLayout {
  /** 'type:<kind>' for a section of the app, 'own:<id>' for an own one, 'hero:main' or 'hero:<dashboard-id>' for a hero. */
  id: string;
  kind: SectionLayoutKind | 'hero';
  column: Column;
  /** The owner's own; null follows the app. */
  name: string | null;
  icon: string | null;
  /** Always empty for the hero. */
  tiles: TileLayout[];
  /** Hero only; null is "Automatisch". */
  hero: HeroChoice | null;
  /** The room it was made of, or NO_ROOM: for its temperature, and for what comes into that room. */
  zone?: string;
}

/** `sections` null: automatic (Overzicht only). The sections of one column stand in the order of the list. */
/** What the chart in the hero of a dashboard shows. */
export type HeroChart = 'battery' | 'solar' | 'solar-use';
export const HERO_CHARTS: readonly HeroChart[] = ['battery', 'solar', 'solar-use'];
/** `chart`: the chart in its hero; absent is none, so dashboards from before stay as they were. */
export interface DashboardLayout { id: string; name: string | null; icon: string | null; sections: SectionLayout[] | null; chart?: HeroChart }

/** Everything the owner arranged for one Homey. */
export interface HubLayout {
  /** In the order of the rail; always holds the Overzicht. */
  dashboards: DashboardLayout[];
  /** The device ids and flowRef ids the app knows: anything else on the hub is new. */
  known: string[];
  /** The last known name of every device, flow and value the layout refers to, for the notices. */
  names: Record<string, string>;
  /** The automatic Overzicht has a section per room; absent: per kind of device. */
  grouping?: 'zone';
  /** The screen with the rooms is hidden; absent: it is there. */
  rooms?: false;
}

/** The limits of what is stored. */
export const LIMITS = { dashboards: 20, sectionsPerDashboard: 40, tilesPerDashboard: 1000, heroStats: 4, nameLength: 60 } as const;

export const flowRef = (flowId: string): string => `flow:${flowId}`;
export const valueRef = (deviceId: string, capabilityId: string): string => `${deviceId}/${capabilityId}`;
export const heroSectionId = (dashboardId: string): string => (dashboardId === OVERVIEW_ID ? 'hero:main' : `hero:${dashboardId}`);

/** One automatic Overzicht; the app knows nothing yet. */
export function defaultHubLayout(): HubLayout {
  return { dashboards: [{ id: OVERVIEW_ID, name: null, icon: null, sections: null }], known: [], names: {} };
}
