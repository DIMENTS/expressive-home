import type { TileSize, WidgetSettingValue, WidgetTileSpec } from '../dashboard/types';

/** What a widget tile can name: one of the app, an own one by its id, or a widget of an app on the hub. */
const REF = /^(?:clock|note|board|gauge|countdown|group|own:[a-z0-9][a-z0-9-]{0,39}|app:[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{0,79})$/;
const SETTING_KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

export const WIDGET_LIMITS = { settings: 12, text: 500 } as const;

export const isWidgetRef = (value: unknown): value is string => typeof value === 'string' && REF.test(value);

/** The id of an own widget a tile names, or null. */
export const ownWidgetId = (ref: string): string | null => (ref.startsWith('own:') ? ref.slice(4) : null);

function valueOf(raw: unknown): WidgetSettingValue | undefined {
  if (raw === null || typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') return [...raw].slice(0, WIDGET_LIMITS.text).join('');
  return undefined;
}

/** The settings of one placed widget: plain values only, under plain names, at most WIDGET_LIMITS.settings. */
export function normalizeWidgetSettings(raw: unknown): Record<string, WidgetSettingValue> {
  const settings: Record<string, WidgetSettingValue> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return settings;
  let count = 0;
  for (const [key, entry] of Object.entries(raw)) {
    if (count >= WIDGET_LIMITS.settings) break;
    const value = valueOf(entry);
    if (!SETTING_KEY.test(key) || value === undefined) continue;
    settings[key] = value;
    count += 1;
  }
  return settings;
}

/** A stored widget tile, or null when it names nothing a widget can be. */
export function widgetSpecOf(raw: Record<string, unknown>, id: string, size: TileSize): WidgetTileSpec | null {
  return isWidgetRef(raw['widget']) ? { kind: 'widget', id, size, widget: raw['widget'], settings: normalizeWidgetSettings(raw['settings']) } : null;
}
