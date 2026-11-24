import type { HubLayout } from '../layout/types';
import type { ThemeSettings } from '../theme/types';
import { defaultWall, type WallSettings } from '../wall/settings';

/** A section id: a grouping, a colon and the rest. This shape also keeps keys such as `__proto__` out. */
export const SECTION_ID = /^[a-z]+:[a-z0-9:_-]+$/i;

export interface AppConfig {
  version: 3;
  connection: { homeyId: string | null; localAddress: string | null; apiKey: string | null };
  theme: ThemeSettings;
  /** A seed colour per section, keyed by section id (`type:lights`). */
  sectionSeeds: Record<string, string>;
  language: 'nl' | 'en' | null;
  /** What the owner arranged, per Homey id. */
  layouts: Record<string, HubLayout>;
  /** The dashboard this device starts with; null: the first. */
  startBoard: string | null;
  /** What is set up on this device for a wall tablet. */
  wall: WallSettings;
}

/** What belongs to this device. */
export type OwnConfig = Pick<AppConfig, 'theme' | 'language' | 'startBoard' | 'wall'>;

export interface ConfigStore {
  load(): Promise<AppConfig>;
  save(config: AppConfig): Promise<void>;
  clearConnection(): Promise<AppConfig>;
  /** What belongs to this device, at once: before anything is asked of a hub. */
  peek?(): OwnConfig;
}

/** Builds a fresh, mutable copy of the default configuration. */
export function createDefaultConfig(): AppConfig {
  return {
    version: 3,
    connection: { homeyId: null, localAddress: null, apiKey: null },
    theme: { seed: '#3b6939', mode: 'auto', density: 'comfortable' },
    sectionSeeds: {},
    language: null,
    layouts: {},
    startBoard: null,
    wall: defaultWall(),
  };
}

function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  }
  return Object.freeze(value);
}

export const DEFAULT_CONFIG: AppConfig = deepFreeze(createDefaultConfig());
