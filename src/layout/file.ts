import { missingFeatures } from '../homey/permissions';
import type { HomeySnapshot } from '../homey/types';
import { hubChoices, normalizeDashboards } from '../storage/layout-normalize';
import { normalizeSectionSeeds, normalizeTheme } from '../storage/local-store';
import type { ThemeSettings } from '../theme/types';
import { drawnTile } from './board';
import type { DashboardLayout, HubLayout, TileLayout } from './types';

export const LAYOUT_FILE_FORMAT = 'expressive-home-layout';
/** Under the name the app had before; still read. */
const EARLIER_FORMAT = 'material-homey-indeling';

/** What a layout file holds: never the connection or the key, and not what the app knows of one hub. */
export interface LayoutFile {
  format: typeof LAYOUT_FILE_FORMAT;
  version: 1;
  exportedAt: string;
  homeyId: string;
  theme: ThemeSettings;
  sectionSeeds: Record<string, string>;
  dashboards: DashboardLayout[];
  grouping?: 'zone';
  rooms?: false;
}

export function writeLayoutFile(
  input: { homeyId: string; theme: ThemeSettings; sectionSeeds: Record<string, string>; layout: HubLayout }, now: Date,
): string {
  const { seed, mode, density } = input.theme;
  const file: LayoutFile = {
    format: LAYOUT_FILE_FORMAT, version: 1, exportedAt: now.toISOString(), homeyId: input.homeyId,
    theme: { seed, mode, density }, sectionSeeds: { ...input.sectionSeeds }, dashboards: input.layout.dashboards, ...hubChoices({ ...input.layout }),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The file checked like stored data, or null when it is not a layout of this app. */
export function readLayoutFile(content: string): LayoutFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const file = raw as Record<string, unknown>;
  if ((file['format'] !== LAYOUT_FILE_FORMAT && file['format'] !== EARLIER_FORMAT) || file['version'] !== 1) return null;
  const dashboards = normalizeDashboards(file['dashboards']);
  if (dashboards === null) return null;
  return {
    format: LAYOUT_FILE_FORMAT, version: 1, exportedAt: text(file['exportedAt']), homeyId: text(file['homeyId']),
    theme: normalizeTheme(file['theme']), sectionSeeds: normalizeSectionSeeds(file['sectionSeeds'], 3), dashboards, ...hubChoices(file),
  };
}

/** "expressive-home-layout-2026-11-23.json", in local time. */
export function layoutFileName(now: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `expressive-home-layout-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`;
}

/** How many tiles of these dashboards this hub does not have; what the key may not read is not counted. */
export function countDropped(dashboards: DashboardLayout[], snapshot: HomeySnapshot): number {
  const missing = missingFeatures(snapshot.scopes);
  const readable = (tile: TileLayout): boolean => !missing.includes(tile.spec.kind === 'flow' ? 'readFlows' : 'readDevices');
  return dashboards.flatMap((d) => d.sections ?? []).flatMap((s) => s.tiles).filter((tile) => readable(tile) && drawnTile(tile, snapshot) === null).length;
}
