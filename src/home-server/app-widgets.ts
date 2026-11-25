// Widgets of other apps on the hub, shown on the dashboard through this app: their files come from the hub's own web
// server and are passed on under this app's address; what they ask of their own back end goes with the key that stays
// on the hub. Only ever the files and routes of one named widget: never anything else of the hub.

const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$/;
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
export type ApiMethod = (typeof METHODS)[number];

const plain = (id: string): boolean => ID.test(id) && !id.includes('..');

/** The app and widget a tile names, or null. */
export function parseAppRef(ref: string): { app: string; widget: string } | null {
  const match = /^app:([^/]+)\/([^/]+)$/.exec(ref);
  return match && plain(match[1]!) && plain(match[2]!) ? { app: match[1]!, widget: match[2]! } : null;
}

/** Plain path segments only: no dots of their own, no escapes, no empty parts. */
function segments(path: string): string[] | null {
  if (/[%\\?#]/.test(path)) return null;
  const parts = path.replace(/^\/+/, '').split('/');
  return parts.every((part) => SEGMENT.test(part) && part !== '..' && part !== '.') ? parts : null;
}

/** Where a file of a widget is on the hub's web server, or null when the path leaves that widget. */
export function filePath(app: string, widget: string, path: string): string | null {
  if (!plain(app) || !plain(widget)) return null;
  const parts = segments(path === '' ? 'index.html' : path);
  return parts && `/app/${app}/widgets/${widget}/${parts.join('/')}`;
}

/** Where a route of a widget's own back end is, or null; a query is read and written again, so it can only be a query. */
export function apiPath(app: string, widget: string, method: string, route: string): string | null {
  if (!plain(app) || !plain(widget) || !(METHODS as readonly string[]).includes(method)) return null;
  const at = route.indexOf('?');
  const path = at === -1 ? route : route.slice(0, at);
  // "/" (or nothing) is the root of the widget's back end
  const parts = path === '' || path === '/' ? [] : segments(path);
  if (!parts) return null;
  let query = '';
  if (at !== -1) {
    try {
      query = new URLSearchParams(route.slice(at + 1)).toString();
    } catch {
      return null;
    }
  }
  return `/api/app/${app}/widget/${widget}/api/${parts.join('/')}${query ? `?${query}` : ''}`;
}

/** The files Homey adds to the page of every widget: its message script, its widget script and its style, nothing else. */
const HOMEY_FILES = /^\/(?:js\/crossframe\.js|widgets\/(?:js|css|fonts|images)\/.+)$/;

/** A file Homey adds to every widget page, by its path on the hub; null for anything else of the hub. */
export function homeyFilePath(path: string): string | null {
  if (!HOMEY_FILES.test(path)) return null;
  const parts = segments(path);
  return parts && `/${parts.join('/')}`;
}

type Text = Partial<Record<'en' | 'nl', string>>;
/** One setting of a widget of an app, as its app describes it. */
export interface AppWidgetSetting { id: string; type: string; title: Text; value?: string | number | boolean | null; values?: { id: string; title: Text }[] }
export interface AppWidgetRow {
  ref: string; name: Text; app: string; height?: number; transparent?: boolean;
  settings?: AppWidgetSetting[];
  /** The widget asks for devices: one, or more. */
  devices?: { singular: boolean };
  /** Its texts, per language, as its app has them. */
  locales?: Record<string, unknown>;
}

const SETTING_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const LOCALES_SIZE = 64 * 1024;

function settingsOf(raw: unknown): AppWidgetSetting[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 20).flatMap((entry): AppWidgetSetting[] => {
    if (!isRecord(entry) || typeof entry['id'] !== 'string' || !SETTING_ID.test(entry['id']) || typeof entry['type'] !== 'string') return [];
    const value = entry['value'];
    const values = Array.isArray(entry['values'])
      ? entry['values'].flatMap((v) => (isRecord(v) && typeof v['id'] === 'string' ? [{ id: v['id'].slice(0, 80), title: nameOf(v['title'] ?? v['label']) }] : [])).slice(0, 40)
      : undefined;
    return [{
      // Homey calls it a label in a widget's own file
      id: entry['id'], type: entry['type'].slice(0, 20), title: nameOf(entry['title'] ?? entry['label']),
      ...(value === null || ['string', 'number', 'boolean'].includes(typeof value) ? { value: value as AppWidgetSetting['value'] } : {}),
      ...(values ? { values } : {}),
    }];
  });
}

/** Texts are plain objects of strings, not too big. */
function localesOf(raw: unknown): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  const text = JSON.stringify(raw);
  return text.length <= LOCALES_SIZE ? JSON.parse(text, (key, value: unknown) => (key === '__proto__' ? undefined : value)) as Record<string, unknown> : undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function nameOf(raw: unknown): AppWidgetRow['name'] {
  if (typeof raw === 'string') return { en: raw.slice(0, 60) };
  if (!isRecord(raw)) return {};
  const out: AppWidgetRow['name'] = {};
  for (const language of ['en', 'nl'] as const) if (typeof raw[language] === 'string') out[language] = (raw[language] as string).slice(0, 60);
  return out;
}

/** The list the hub gives (a record or a list of widgets with ids "homey:app:<app>:<widget>") as plain rows. */
export function normalizeAppWidgets(raw: unknown): AppWidgetRow[] {
  const entries = Array.isArray(raw) ? raw : isRecord(raw) ? Object.values(raw) : [];
  return entries.flatMap((entry): AppWidgetRow[] => {
    if (!isRecord(entry) || typeof entry['id'] !== 'string') return [];
    const match = /^homey:app:([^:]+):([^:]+)$/.exec(entry['id']);
    if (!match || !plain(match[1]!) || !plain(match[2]!)) return [];
    const height = typeof entry['height'] === 'number' && Number.isFinite(entry['height']) ? { height: entry['height'] } : {};
    const settings = settingsOf(entry['settings']);
    const locales = localesOf(entry['locales']);
    const devices = isRecord(entry['devices']) ? { devices: { singular: entry['devices']['singular'] === true } } : {};
    return [{
      ref: `app:${match[1]}/${match[2]}`, name: nameOf(entry['name']), app: match[1]!, ...height, ...devices,
      ...(typeof entry['transparent'] === 'boolean' ? { transparent: entry['transparent'] } : {}),
      ...(settings ? { settings } : {}), ...(locales ? { locales } : {}),
    }];
  }).slice(0, 200);
}

export interface AppWidgetsDeps {
  /** A request to the hub with the key that may do everything; null when there is no such key. */
  keyRequest(method: ApiMethod, path: string, body: unknown): Promise<{ status: number; body: unknown } | null>;
  /** A file of the hub's own web server. */
  fetchFile(path: string): Promise<{ status: number; type: string; body: Uint8Array } | null>;
}

export function createAppWidgets(deps: AppWidgetsDeps) {
  return {
    async list(): Promise<{ state: 'no-key' | 'refused' | 'unreachable' | 'ok'; widgets: AppWidgetRow[] }> {
      const answer = await deps.keyRequest('GET', '/api/manager/dashboards/appwidget', undefined).catch(() => undefined);
      if (answer === null) return { state: 'no-key', widgets: [] };
      if (answer === undefined) return { state: 'unreachable', widgets: [] };
      if (answer.status === 401 || answer.status === 403) return { state: 'refused', widgets: [] };
      if (answer.status >= 300) return { state: 'unreachable', widgets: [] };
      const rows = normalizeAppWidgets(answer.body);
      // a widget's texts are those of its app, in the language of the hub
      const texts = new Map<string, Record<string, unknown> | undefined>();
      for (const app of new Set(rows.filter((row) => !row.locales).map((row) => row.app))) {
        const read = await deps.keyRequest('GET', `/api/manager/apps/app/${encodeURIComponent(app)}/locale`, undefined).catch(() => null);
        texts.set(app, read && read.status === 200 ? localesOf(read.body) : undefined);
      }
      return { state: 'ok', widgets: rows.map((row) => (row.locales || !texts.get(row.app) ? row : { ...row, locales: texts.get(row.app)! })) };
    },
    async file(ref: string, path: string) {
      const named = parseAppRef(ref);
      const where = named && filePath(named.app, named.widget, path);
      return where ? deps.fetchFile(where) : null;
    },
    /** A file of Homey's own for the pages of widgets. */
    async homeyFile(path: string) {
      const where = homeyFilePath(path);
      return where ? deps.fetchFile(where) : null;
    },
    /**
     * The choices of a setting with a search list, as the widget's app gives them for what was typed: plain fields only
     * (a picture is left out), small enough to keep with the tile.
     */
    async autocomplete(ref: string, settingId: string, query: string): Promise<Record<string, string | number | boolean>[] | null> {
      const named = parseAppRef(ref);
      if (!named || !SETTING_ID.test(settingId)) return null;
      const id = encodeURIComponent(`homey:app:${named.app}:${named.widget}`);
      const search = new URLSearchParams({ settingId, query: query.slice(0, 100) }).toString();
      const answer = await deps.keyRequest('GET', `/api/manager/dashboards/appwidget/${id}/autocomplete?${search}`, undefined).catch(() => null);
      if (!answer || answer.status !== 200 || !Array.isArray(answer.body)) return null;
      return answer.body.slice(0, 30).flatMap((item): Record<string, string | number | boolean>[] => {
        if (!isRecord(item) || typeof item['name'] !== 'string') return [];
        const plain = Object.entries(item).filter((entry): entry is [string, string | number | boolean] =>
          SETTING_ID.test(entry[0]) && entry[0] !== 'image' && ['string', 'number', 'boolean'].includes(typeof entry[1]) && String(entry[1]).length <= 120);
        return [Object.fromEntries(plain)];
      });
    },
    async api(ref: string, method: string, route: string, body: unknown) {
      const named = parseAppRef(ref);
      const where = named && apiPath(named.app, named.widget, method, route);
      return where ? deps.keyRequest(method as ApiMethod, where, body) : null;
    },
  };
}

export type AppWidgets = ReturnType<typeof createAppWidgets>;
