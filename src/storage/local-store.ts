import { SECTION_ORDER, sectionId, type SectionKind } from '../dashboard/types';
import { isHomeyId, isIPv4 } from '../homey/routes';
import { LIMITS } from '../layout/types';
import { isValidSeed } from '../theme/engine';
import { MODE_PREFERENCES, type ThemeSettings } from '../theme/types';
import { normalizeWall } from '../wall/settings';
import { createDefaultConfig, SECTION_ID, type AppConfig, type ConfigStore } from './config';
import { normalizeLayouts } from './layout-normalize';

export const STORAGE_KEY = 'dashboard.config';

const MODES: readonly ThemeSettings['mode'][] = MODE_PREFERENCES;
const DENSITIES: ThemeSettings['density'][] = ['comfortable', 'compact'];
/** One for every section there can be. */
const MAX_SECTION_SEEDS = LIMITS.dashboards * LIMITS.sectionsPerDashboard;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The theme, field by field; what is missing or wrong is the default. */
export function normalizeTheme(raw: unknown): ThemeSettings {
  const theme = createDefaultConfig().theme;
  if (!isRecord(raw)) return theme;
  const { seed, mode, density } = raw;
  if (typeof seed === 'string' && isValidSeed(seed)) theme.seed = seed;
  if (MODES.includes(mode as ThemeSettings['mode'])) theme.mode = mode as ThemeSettings['mode'];
  if (DENSITIES.includes(density as ThemeSettings['density'])) theme.density = density as ThemeSettings['density'];
  return theme;
}

/** The colours per section id; version 1 stored them per kind of section, which becomes the id when grouped by type. */
export function normalizeSectionSeeds(raw: unknown, version: number): Record<string, string> {
  if (!isRecord(raw)) return {};
  const seeds: [string, string][] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || !isValidSeed(value)) continue;
    if (version === 1) {
      if ((SECTION_ORDER as string[]).includes(key)) seeds.push([sectionId('type', key as SectionKind), value]);
    } else if (SECTION_ID.test(key)) {
      seeds.push([key, value]);
    }
  }
  return Object.fromEntries(seeds.slice(0, MAX_SECTION_SEEDS));
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The shape of the id of a dashboard. */
const BOARD_ID = /^[a-z0-9:_-]{1,60}$/i;

/** Validates every field on its own; anything missing or invalid becomes its default. */
function normalize(raw: unknown): AppConfig {
  const config = createDefaultConfig();
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2 && raw.version !== 3)) return config;

  if (isRecord(raw.connection)) {
    const { homeyId, localAddress } = raw.connection;
    config.connection = {
      // Both become part of a hostname, so only the exact shapes are kept.
      homeyId: typeof homeyId === 'string' && isHomeyId(homeyId) ? homeyId : null,
      localAddress: typeof localAddress === 'string' && isIPv4(localAddress) ? localAddress : null,
      apiKey: nonEmptyString(raw.connection.apiKey),
    };
  }

  config.theme = normalizeTheme(raw.theme);
  config.sectionSeeds = normalizeSectionSeeds(raw.sectionSeeds, raw.version);
  if (raw.version === 3) config.layouts = normalizeLayouts(raw.layouts);
  if (typeof raw.startBoard === 'string' && BOARD_ID.test(raw.startBoard)) config.startBoard = raw.startBoard;
  if (raw.language === 'nl' || raw.language === 'en') config.language = raw.language;
  config.wall = normalizeWall(raw.wall);
  return config;
}

export function createLocalConfigStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): ConfigStore & Required<Pick<ConfigStore, 'peek'>> {
  function read(): AppConfig {
    try {
      const text = storage.getItem(STORAGE_KEY);
      if (text === null) return createDefaultConfig();
      return normalize(JSON.parse(text));
    } catch {
      return createDefaultConfig();
    }
  }

  const load = async (): Promise<AppConfig> => read();

  async function save(config: AppConfig): Promise<void> {
    storage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  async function clearConnection(): Promise<AppConfig> {
    const config = await load();
    config.connection = { homeyId: null, localAddress: null, apiKey: null };
    await save(config);
    return config;
  }

  return {
    load, save, clearConnection,
    peek() {
      const { theme, language, startBoard, wall } = read();
      return { theme, language, startBoard, wall };
    },
  };
}
