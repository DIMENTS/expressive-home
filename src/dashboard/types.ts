export type SectionKind = 'lights' | 'switches' | 'climate' | 'covers' | 'media' | 'water' | 'security' | 'other' | 'flows';
export const SECTION_ORDER: SectionKind[] = ['lights', 'switches', 'climate', 'covers', 'media', 'water', 'security', 'other', 'flows'];
export interface CapRef { deviceId: string; capabilityId: string }
export type TileSize = 'single' | 'wide';
/** What every tile can carry: an own name and icon; absent or null follows the hub and the app. */
type TileLook = { label?: string | null; icon?: string | null };
/** A tile of a device of a house: it looks up what the device can do every time, so it holds only the device. */
export type HouseKind = 'climate' | 'cover' | 'media' | 'guard';
export const HOUSE_KINDS: readonly HouseKind[] = ['climate', 'cover', 'media', 'guard'];
export type TileSpec =
  | TileLook & { kind: 'light'; id: string; deviceId: string; size: TileSize; onoffCapabilityId: string | null; dimCapabilityId: string }
  | TileLook & { kind: 'switch'; id: string; deviceId: string; size: TileSize; onoffCapabilityId: string; detailCapabilityId: string | null }
  | TileLook & { kind: 'tank'; id: string; deviceId: string; size: TileSize; levelCapabilityId: string | null; volumeCapabilityId: string | null; capacityCapabilityId: string | null }
  | TileLook & { kind: 'button'; id: string; deviceId: string; size: TileSize; capabilityId: string }
  | TileLook & { kind: 'sensor'; id: string; deviceId: string; size: TileSize; capabilityId: string; showCapabilityTitle: boolean }
  | TileLook & { kind: 'multi'; id: string; deviceId: string; size: TileSize; capabilityIds: string[] }
  | TileLook & { kind: 'generic'; id: string; deviceId: string; size: TileSize; capabilityId: string | null }
  | TileLook & { kind: HouseKind; id: string; deviceId: string; size: TileSize }
  | TileLook & { kind: 'flow'; id: string; flowId: string; flowKind: 'flow' | 'advanced'; size: 'single' };
const KINDS: readonly string[] = ['light', 'switch', 'tank', 'button', 'sensor', 'multi', 'generic', 'flow', ...HOUSE_KINDS];
/** Another version of the app can have stored a kind that this one does not draw. */
export const isKnownKind = (kind: string): boolean => KINDS.includes(kind);
export type DeviceTileSpec = Exclude<TileSpec, { kind: 'flow' }>;
export type FlowTileSpec = Extract<TileSpec, { kind: 'flow' }>;
/** The room of devices that are in none. */
export const NO_ROOM = 'none';
/** `id` is unique within a dashboard, also when the same kind of section later appears once per zone. */
export type SectionLayoutKind = SectionKind | 'own';
/** `name` and `icon` are the owner's own; absent or null follows the app. */
export interface Section {
  id: string; kind: SectionLayoutKind; titleKey: string; tiles: TileSpec[]; name?: string | null; icon?: string | null;
  /** The room it is of, or NO_ROOM; absent for a section of nothing but its tiles. */
  zone?: string;
}
/** Whether a section is of one kind of device or of one room. */
export type Grouping = 'type' | 'zone';
/** What the section of a room is called when it has no name. */
export const roomTitleKey = (zoneId: string): string => (zoneId === NO_ROOM ? 'rooms.none' : 'rooms.unnamed');
/** The identity of the section of a room. */
export const zoneSectionId = (zoneId: string): string => `own:zone:${zoneId.replace(/[^a-z0-9_-]/gi, '_')}`;
/** The identity of a section when the dashboard is grouped by type. */
export function sectionId(grouping: 'type', kind: SectionKind): string {
  return `${grouping}:${kind}`;
}
export type HeroStat = { role: 'solar' | 'consumption' | 'shore'; ref: CapRef } | { role: 'net' } | { role: 'value'; ref: CapRef };
export interface HeroSpec {
  kind: 'battery' | 'solar' | 'consumption' | 'own';
  deviceIds: string[]; primary: CapRef; timeToGo: CapRef | null; stats: HeroStat[];
  /** Own hero: the line under the number, its name, and the sources of "Netto laden". */
  line?: CapRef | null; name?: string | null; net?: { solar: CapRef; consumption: CapRef } | null;
}
/** The fixed section id of the hero, for its own colour; it cannot clash with a section of a kind. */
export const HERO_SECTION_ID = 'hero:main';
export interface Dashboard { hero: HeroSpec | null; sections: Section[] }
/** `locale` sorts names in the language of the app; Dutch when absent. */
export interface GenerateOptions { grouping: Grouping; locale?: string }
