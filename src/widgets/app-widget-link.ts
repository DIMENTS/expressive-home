// The dashboard's side of the widgets of other apps: what the app on the hub answers, checked before it is used.

export type AppText = Partial<Record<'en' | 'nl', string>>;
export interface AppSetting { id: string; type: string; title: AppText; value?: string | number | boolean | null; values?: { id: string; title: AppText }[] }
export interface AppWidgetRow {
  ref: string; name: AppText; app: string; transparent?: boolean; settings?: AppSetting[]; devices?: { singular: boolean }; locales?: Record<string, unknown>;
}
type Rows = { state: string; widgets: AppWidgetRow[] };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const REF = /^app:[a-z0-9][a-z0-9._-]{0,79}\/[a-z0-9][a-z0-9._-]{0,79}$/;
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

const textOf = (raw: unknown): AppText => {
  const name = isRecord(raw) ? raw : {};
  return { ...(typeof name['en'] === 'string' ? { en: name['en'] } : {}), ...(typeof name['nl'] === 'string' ? { nl: name['nl'] } : {}) };
};

function settingOf(raw: unknown): AppSetting[] {
  if (!isRecord(raw) || typeof raw['id'] !== 'string' || !ID.test(raw['id']) || typeof raw['type'] !== 'string') return [];
  const value = raw['value'];
  return [{
    id: raw['id'], type: raw['type'], title: textOf(raw['title'] ?? raw['label']),
    ...(value === null || ['string', 'number', 'boolean'].includes(typeof value) ? { value: value as AppSetting['value'] } : {}),
    ...(Array.isArray(raw['values']) ? { values: raw['values'].flatMap((v) => (isRecord(v) && typeof v['id'] === 'string' ? [{ id: v['id'], title: textOf(v['title']) }] : [])) } : {}),
  }];
}

/** The list the app on the hub gives; nothing when it cannot be read. */
export async function appWidgetList(read: () => Promise<unknown>): Promise<Rows> {
  const raw = await read().catch(() => null);
  if (!isRecord(raw) || !Array.isArray(raw['widgets'])) return { state: 'unreachable', widgets: [] };
  const widgets = raw['widgets'].flatMap((row): AppWidgetRow[] => {
    if (!isRecord(row) || typeof row['ref'] !== 'string' || !REF.test(row['ref']) || typeof row['app'] !== 'string') return [];
    return [{
      ref: row['ref'], app: row['app'].slice(0, 80), name: textOf(row['name']),
      ...(typeof row['transparent'] === 'boolean' ? { transparent: row['transparent'] } : {}),
      ...(Array.isArray(row['settings']) ? { settings: row['settings'].flatMap(settingOf) } : {}),
      ...(isRecord(row['devices']) ? { devices: { singular: row['devices']['singular'] === true } } : {}),
      ...(isRecord(row['locales']) ? { locales: row['locales'] } : {}),
    }];
  });
  return { state: typeof raw['state'] === 'string' ? raw['state'] : 'unreachable', widgets };
}

/** A request of such a widget to its own back end; null when it was refused. */
export async function appWidgetCall(call: ((ref: string, method: string, route: string, body: unknown) => Promise<unknown>) | undefined,
  ref: string, method: string, path: string, body: unknown): Promise<{ status: number; body: unknown } | null> {
  if (!call) return null;
  const raw = await call(ref, method, path, body).catch(() => null);
  return isRecord(raw) && typeof raw['status'] === 'number' ? { status: raw['status'], body: raw['body'] } : null;
}

function parsedChoice(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The name of a choice from a search list, as it is kept; '' when there is none. */
export function choiceName(value: unknown): string {
  const parsed = parsedChoice(value);
  return isRecord(parsed) && typeof parsed['name'] === 'string' ? parsed['name'] : '';
}

/** The setting of a tile that holds the devices chosen for a widget of an app. */
export const APP_DEVICES = 'homeyDevices';

/**
 * What Homey's own script in the page of a widget asks for when it starts: its settings (the app's defaults, then this
 * tile's own), the devices chosen for it, its texts in the language of the dashboard, and light or dark.
 */
export function appInitialData(row: AppWidgetRow | undefined, settings: Record<string, unknown>, language: string, dark: boolean): Record<string, unknown> {
  const defaults = Object.fromEntries((row?.settings ?? []).filter((s) => s.value !== undefined).map((s) => [s.id, s.value]));
  const { [APP_DEVICES]: chosen, ...kept } = settings;
  // a choice from a search list is kept as text, and was an object
  const searched = new Set((row?.settings ?? []).filter((s) => s.type === 'autocomplete').map((s) => s.id));
  const own = Object.fromEntries(Object.entries(kept).map(([id, value]) => [id, searched.has(id) ? parsedChoice(value) : value]));
  const deviceIds = typeof chosen === 'string' ? chosen.split(',').filter((id) => id !== '') : [];
  const locales = row?.locales;
  // per language, or already the texts of one language
  const texts = locales && isRecord(locales[language]) ? locales[language] : locales && isRecord(locales['en']) ? locales['en'] : locales ?? {};
  return { settings: { ...defaults, ...own }, deviceIds, transparent: row?.transparent === true, locales: texts, language, devmode: false, fontScale: 1, isDarkMode: dark };
}

/** The choices of a setting with a search list, each with the text it is kept as (at most as long as a setting may be). */
export async function appWidgetSearch(search: (ref: string, setting: string, query: string) => Promise<unknown>, ref: string, setting: string, query: string):
  Promise<{ name: string; description?: string; value: string }[]> {
  const raw = await search(ref, setting, query).catch(() => null);
  const results = isRecord(raw) && Array.isArray(raw['results']) ? raw['results'] : [];
  return results.flatMap((item) => {
    if (!isRecord(item) || typeof item['name'] !== 'string') return [];
    const value = JSON.stringify(item);
    if (value.length > 500) return [];
    return [{ name: item['name'], ...(typeof item['description'] === 'string' ? { description: item['description'] } : {}), value }];
  });
}
