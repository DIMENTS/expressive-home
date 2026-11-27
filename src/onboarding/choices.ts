import { generateDashboard } from '../dashboard/generate';
import { HERO_SECTION_ID, type Grouping, type HeroSpec, type SectionLayoutKind } from '../dashboard/types';
import type { HomeySnapshot } from '../homey/types';
import { MODE_PREFERENCES, type Density, type ModePreference } from '../theme/types';

/** The screens of the first start after pairing, in order. */
export const STEPS = ['welcome', 'look', 'light', 'layout', 'first', 'build', 'practice'] as const;
export type StepId = (typeof STEPS)[number];

/** A widget that the first start can put on top. */
export type Extra = 'weather' | 'energy';
const EXTRAS: readonly Extra[] = ['weather', 'energy'];

/** What is chosen during the first start. */
export interface Choices {
  /** A built-in style, for the whole house. */
  theme: string;
  seed: string;
  mode: ModePreference;
  /** Of this device. */
  density: Density;
  grouping: Grouping;
  /** Whether the screen with the rooms is in the rail. */
  rooms: boolean;
  /** The sections of the automatic Overzicht (and the hero) that go on top, in this order. */
  first: string[];
  extras: Extra[];
}

/** The choices as the dashboard is without them. */
export const defaultChoices = (seed: string): Choices => ({ theme: 'rustig', seed, mode: 'auto', density: 'comfortable', grouping: 'type', rooms: true, first: [], extras: [] });

/** The steps there are: without rooms there is nothing to choose between per kind and per room. */
export function stepsFor({ hasRooms }: { hasRooms: boolean }): StepId[] {
  return STEPS.filter((step) => step !== 'layout' || hasRooms);
}

/** Something that can go on top: the hero (as energy) or a section of the automatic Overzicht. */
export interface FirstOption {
  id: string;
  kind: 'energy' | 'section';
  /** Of a section: its kind, its own name (a room's) and its icon; null follows the app. */
  sectionKind: SectionLayoutKind | null;
  name: string | null;
  icon: string | null;
  /** Of the hero: what it shows. */
  hero: HeroSpec['kind'] | null;
}

/** The hero and the sections of the automatic Overzicht with this grouping, in its order. */
export function firstOptions(snapshot: HomeySnapshot, grouping: Grouping, locale: string): FirstOption[] {
  const dashboard = generateDashboard(snapshot, { grouping, locale });
  const hero: FirstOption[] = dashboard.hero ? [{ id: HERO_SECTION_ID, kind: 'energy', sectionKind: null, name: null, icon: null, hero: dashboard.hero.kind }] : [];
  return [...hero, ...dashboard.sections.map((section): FirstOption => ({ id: section.id, kind: 'section', sectionKind: section.kind, name: section.name ?? null, icon: section.icon ?? null, hero: null }))];
}

/** Where a first start that is under way is, so a page that is loaded anew goes on there; `since`: when it began. */
export interface Progress { hub: string; step: StepId; choices: Choices; since: number }

/** A first start left for longer than this is not taken up again: others may have arranged the hub since. */
export const PROGRESS_DAYS = 1;
const DAY_MS = 86_400_000;

/** Where the page keeps it, in the browser of this device only. */
export const PROGRESS_KEY = 'dashboard.onboarding';

const MAX_TEXT = 200;
const MAX_FIRST = 40;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

function readChoices(raw: unknown): Choices | null {
  if (!isRecord(raw)) return null;
  const { theme, seed, mode, density, grouping, rooms, first, extras } = raw;
  if (!isText(theme, 60) || typeof seed !== 'string' || !/^#[0-9a-f]{6}$/i.test(seed)) return null;
  if (!(MODE_PREFERENCES as readonly unknown[]).includes(mode) || (density !== 'comfortable' && density !== 'compact')) return null;
  if ((grouping !== 'type' && grouping !== 'zone') || typeof rooms !== 'boolean') return null;
  if (!Array.isArray(first) || first.length > MAX_FIRST || !first.every((id) => isText(id))) return null;
  if (!Array.isArray(extras) || !extras.every((extra) => (EXTRAS as readonly unknown[]).includes(extra))) return null;
  return { theme, seed, mode: mode as ModePreference, density, grouping, rooms, first: [...new Set(first as string[])], extras: [...new Set(extras as Extra[])] };
}

/** What was kept, when it is whole, of this hub and not too old; null otherwise. */
export function readProgress(text: string | null, hub: string, now: number): Progress | null {
  if (text === null) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!isRecord(raw) || raw['hub'] !== hub || !(STEPS as readonly unknown[]).includes(raw['step'])) return null;
  const since = raw['since'];
  // a clock that was set back makes it as unknown as one that is too old
  if (typeof since !== 'number' || !Number.isFinite(since) || now < since || now - since > PROGRESS_DAYS * DAY_MS) return null;
  const choices = readChoices(raw['choices']);
  return choices ? { hub, step: raw['step'] as StepId, choices, since } : null;
}

export const writeProgress = (progress: Progress): string => JSON.stringify(progress);
