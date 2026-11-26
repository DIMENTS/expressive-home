// The light of the screen of a wall tablet, where the kiosk app Fully Kiosk lets a page reach it: dimmed while the rest
// screen is there, nearly off at night, and as it was once somebody is there again. A web page alone cannot.

/** How bright the rest screen is: a part of the brightness, or not dimmed. */
export type RestBrightness = 'none' | 50 | 25 | 10;
/** The screen at night: nearly off, or as the rest screen of the day. */
export type NightScreen = 'dim' | 'none';
export interface ScreenSettings { rest: RestBrightness; night: NightScreen }

/** Nothing is dimmed until it is chosen: a tablet that had the kiosk app before stays as it was. */
export const defaultScreen = (): ScreenSettings => ({ rest: 'none', night: 'none' });
export const REST_BRIGHTNESS: readonly RestBrightness[] = ['none', 50, 25, 10];
export const NIGHT_SCREENS: readonly NightScreen[] = ['dim', 'none'];

/** In the steps of Fully, 0 to 255; nearly off is the lowest step that still shows something. */
export const SCREEN_LEVELS = { 50: 128, 25: 64, 10: 26, dim: 1 } as const;
/** What Fully takes for "the brightness the tablet itself chooses". */
const OWN_CHOICE = -1;

/** What the dashboard asks of Fully Kiosk; it gives a page more, which is not used. */
export interface FullyScreen {
  getScreenBrightness(): number;
  setScreenBrightness(level: number): void;
}

/** Fully Kiosk with its JavaScript interface on, or null: anything else gets nothing of this. */
export function fullyOf(target: Window): FullyScreen | null {
  try {
    const fully = (target as unknown as { fully?: Partial<FullyScreen> }).fully;
    return typeof fully?.getScreenBrightness === 'function' && typeof fully.setScreenBrightness === 'function' ? fully as FullyScreen : null;
  } catch {
    return null;
  }
}

/** What the screen should be: a brightness, or as it was (null). */
export interface ScreenWanted { level: number | null }

const restLevel = (rest: RestBrightness): number | null => (rest === 'none' ? null : SCREEN_LEVELS[rest]);

/**
 * What the screen should be now. Having a look dims as the real thing would. Danger at night lights it as the rest screen
 * of the day, so the alarm can be seen; so does somebody who uses it at night, who is not dazzled.
 */
export function screenWanted(shown: 'none' | 'rest' | 'preview', look: 'day' | 'night', settings: ScreenSettings, danger: boolean): ScreenWanted {
  const day = restLevel(settings.rest);
  // used at night: a quarter at the most, whatever the rest screen of the day is
  if (shown === 'none') return { level: look === 'night' && settings.night === 'dim' ? day ?? SCREEN_LEVELS[25] : null };
  if (look === 'day' || settings.night === 'none' || (shown === 'rest' && danger)) return { level: day };
  return { level: SCREEN_LEVELS.dim };
}

/** Where the brightness of before is kept, so that it comes back also after the page loaded anew while dimmed. */
export interface KeptBrightness { get(): string | null; set(value: string | null): void }

/**
 * Tells Fully only what changed. Every call is best effort: an old version, a tablet that does not allow it or a missing
 * licence of Fully throws, and then nothing else happens.
 */
export function createScreen(deps: { fully: FullyScreen | null; kept: KeptBrightness }) {
  const { fully, kept } = deps;
  const safely = <T>(call: () => T): T | undefined => { try { return call(); } catch { return undefined; } };
  const isLevel = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= OWN_CHOICE && value <= 255;
  const stored = Number(safely(() => kept.get()) ?? Number.NaN);
  /** The brightness of before, as long as the dashboard changed it. */
  let before: number | null = isLevel(stored) ? stored : null;
  /** What it told last. */
  let level: number | null = null;
  /** Whether what the tablet had at the start was looked at. */
  let looked = before !== null;
  const OWN_LEVELS: readonly number[] = Object.values(SCREEN_LEVELS);

  return {
    apply(wanted: ScreenWanted): void {
      if (!fully) return;
      if (!looked && wanted.level === null) {
        looked = true;
        // dimmed by a page before whose brightness of before was lost (storage wiped, another address): the tablet chooses again
        const now = safely(() => fully.getScreenBrightness());
        if (isLevel(now) && OWN_LEVELS.includes(now)) safely(() => fully.setScreenBrightness(OWN_CHOICE));
        return;
      }
      looked = true;
      if (wanted.level === null) {
        if (before === null) return;
        const back = before;
        safely(() => fully.setScreenBrightness(back));
        [before, level] = [null, null];
        safely(() => kept.set(null));
        return;
      }
      if (before === null) {
        // exactly one of the dashboard's own levels may be left by a page before: then the tablet chooses
        const now = safely(() => fully.getScreenBrightness());
        before = isLevel(now) && !OWN_LEVELS.includes(now) ? now : OWN_CHOICE;
        safely(() => kept.set(String(before)));
      }
      // never brighter than it was
      const next = before >= 0 ? Math.min(wanted.level, before) : wanted.level;
      const first = level === null;
      if (next !== level && !(first && next === before)) safely(() => fully.setScreenBrightness(next));
      level = next;
    },
  };
}
