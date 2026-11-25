import type { TileSize, WidgetSettingValue } from '../dashboard/types';
import type { SettingType } from './settings';

export const WIDGET_FILE_FORMAT = 'expressive-home-widget';
/** The most a widget file may be, in characters of its JSON. */
export const WIDGET_FILE_LIMIT = 100_000;
const MAX_SETTINGS = 12;
const MAX_VALUES = 30;
const MAX_TEXTS = 200;
const NAME = 60;
const ABOUT = 200;

/** A text in the languages the maker gave; at least one. */
export type WidgetText = Partial<Record<'en' | 'nl', string>>;

export interface WidgetSettingFile {
  id: string;
  type: SettingType;
  title: WidgetText;
  default?: WidgetSettingValue;
  values?: { id: string; title: WidgetText }[];
  min?: number;
  max?: number;
  device?: string;
}

/** An own widget as it is kept and shared. */
export interface WidgetFile {
  format: typeof WIDGET_FILE_FORMAT;
  version: 1;
  id: string;
  name: WidgetText;
  description: WidgetText;
  icon: string | null;
  widgetVersion: string;
  sizes: TileSize[];
  settings: WidgetSettingFile[];
  html: string;
  css: string;
  js: string;
  texts: Record<string, Record<string, string>>;
}

export type ParsedWidget = { ok: true; widget: WidgetFile } | { ok: false; reason: 'not-a-widget' | 'too-new' | 'too-big' | 'bad-field' | 'damaged' };

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;
const ICON = /^[a-z0-9_]{1,40}$/;
const VERSION = /^[0-9A-Za-z.+-]{1,20}$/;
const TYPES: readonly SettingType[] = ['text', 'textarea', 'number', 'checkbox', 'dropdown', 'device', 'capability', 'flow'];

type Obj = Record<string, unknown>;
const isRecord = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);

class Bad extends Error {}
const bad = (): never => { throw new Bad(); };

/** A text in one or both languages; a plain string counts for both. */
function textOf(raw: unknown, length: number, required: boolean): WidgetText {
  const cut = (value: string): string => [...value.trim()].slice(0, length).join('');
  if (typeof raw === 'string') {
    const text = cut(raw);
    return text === '' ? (required ? bad() : {}) : { en: text };
  }
  const out: WidgetText = {};
  if (isRecord(raw)) {
    for (const language of ['en', 'nl'] as const) {
      const value = raw[language];
      if (typeof value === 'string' && cut(value) !== '') out[language] = cut(value);
    }
  }
  return required && Object.keys(out).length === 0 ? bad() : out;
}

/** A text in the language asked for, else the other one. */
export const widgetText = (text: WidgetText, language: string): string => (language === 'nl' ? text.nl ?? text.en : text.en ?? text.nl) ?? '';

function plainValue(raw: unknown): WidgetSettingValue | undefined {
  if (raw === null || typeof raw === 'boolean' || typeof raw === 'string') return typeof raw === 'string' ? raw.slice(0, 500) : raw;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function settingOf(raw: unknown, devices: Set<string>, seen: Set<string>): WidgetSettingFile {
  if (!isRecord(raw)) return bad();
  const id = raw['id'];
  const type = raw['type'] as SettingType;
  if (typeof id !== 'string' || !KEY.test(id) || seen.has(id) || !TYPES.includes(type)) return bad();
  seen.add(id as string);
  const setting: WidgetSettingFile = { id, type, title: textOf(raw['title'], NAME, true) };
  const fallback = plainValue(raw['default']);
  if (fallback !== undefined) setting.default = fallback;
  if (type === 'number') {
    if (typeof raw['min'] === 'number' && Number.isFinite(raw['min'])) setting.min = raw['min'];
    if (typeof raw['max'] === 'number' && Number.isFinite(raw['max'])) setting.max = raw['max'];
  }
  if (type === 'dropdown') {
    const values = Array.isArray(raw['values']) ? raw['values'] : bad();
    if (values.length === 0 || values.length > MAX_VALUES) bad();
    setting.values = values.map((value) => {
      if (!isRecord(value) || typeof value['id'] !== 'string' || value['id'] === '' || value['id'].length > 40) return bad();
      return { id: value['id'], title: textOf(value['title'], NAME, true) };
    });
  }
  if (type === 'device') devices.add(id);
  if (type === 'capability') {
    if (typeof raw['device'] !== 'string' || !devices.has(raw['device'])) bad();
    setting.device = raw['device'] as string;
  }
  return setting;
}

function textsOf(raw: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!isRecord(raw)) return out;
  for (const language of ['en', 'nl']) {
    const entries = isRecord(raw[language]) ? Object.entries(raw[language] as Obj) : [];
    const kept = entries.filter((entry): entry is [string, string] => KEY.test(entry[0]) && typeof entry[1] === 'string').slice(0, MAX_TEXTS);
    if (kept.length > 0) out[language] = Object.fromEntries(kept.map(([key, value]) => [key, value.slice(0, ABOUT * 5)]));
  }
  return out;
}

/** A widget file, checked field by field; whatever is not right refuses the whole file. */
export function parseWidgetFile(raw: unknown): ParsedWidget {
  if (!isRecord(raw) || raw['format'] !== WIDGET_FILE_FORMAT) return { ok: false, reason: 'not-a-widget' };
  if (typeof raw['version'] === 'number' && raw['version'] > 1) return { ok: false, reason: 'too-new' };
  if (raw['version'] !== 1) return { ok: false, reason: 'not-a-widget' };
  if (JSON.stringify(raw).length > WIDGET_FILE_LIMIT) return { ok: false, reason: 'too-big' };
  try {
    const id = raw['id'];
    if (typeof id !== 'string' || !ID.test(id)) bad();
    for (const key of ['html', 'css', 'js']) if (typeof raw[key] !== 'string') bad();
    const settings = raw['settings'] === undefined ? [] : Array.isArray(raw['settings']) ? raw['settings'] : bad();
    if (settings.length > MAX_SETTINGS) bad();
    const devices = new Set<string>();
    const seen = new Set<string>();
    const sizes = (Array.isArray(raw['sizes']) ? raw['sizes'] : []).filter((size): size is TileSize => size === 'single' || size === 'wide');
    const widget: WidgetFile = {
      format: WIDGET_FILE_FORMAT, version: 1, id: id as string,
      name: textOf(raw['name'], NAME, true), description: textOf(raw['description'], ABOUT, false),
      icon: typeof raw['icon'] === 'string' && ICON.test(raw['icon']) ? raw['icon'] : null,
      widgetVersion: typeof raw['widgetVersion'] === 'string' && VERSION.test(raw['widgetVersion']) ? raw['widgetVersion'] : '',
      sizes: sizes.length > 0 ? [...new Set(sizes)] : ['single', 'wide'],
      settings: settings.map((setting) => settingOf(setting, devices, seen)),
      html: raw['html'] as string, css: raw['css'] as string, js: raw['js'] as string,
      texts: textsOf(raw['texts']),
    };
    return { ok: true, widget };
  } catch (error) {
    if (error instanceof Bad) return { ok: false, reason: 'bad-field' };
    throw error;
  }
}

const PREFIX = 'EW1';
const CODE = /^EW(\d+)\.([A-Za-z0-9_-]+)\.([0-9a-z]+)$/;
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A widget as a code to paste: its format, the file in letters and digits, and a check number. */
export function toWidgetCode(widget: WidgetFile): string {
  const bytes = new TextEncoder().encode(JSON.stringify(widget));
  return `${PREFIX}.${toBase64Url(bytes)}.${crc32(bytes).toString(36)}`;
}

/** A widget as the text of a file. */
export const toWidgetFileText = (widget: WidgetFile): string => `${JSON.stringify(widget, null, 2)}\n`;

/** A pasted code, or the text of a widget file, back into a widget; spaces and line breaks in a code do not matter. */
export function fromWidgetCode(input: string): ParsedWidget {
  const trimmed = input.trim();
  if (trimmed.length > WIDGET_FILE_LIMIT * 2) return { ok: false, reason: 'too-big' };
  if (trimmed.startsWith('{')) {
    try {
      return parseWidgetFile(JSON.parse(trimmed));
    } catch {
      return { ok: false, reason: 'damaged' };
    }
  }
  const code = trimmed.replace(/\s+/g, '');
  const match = CODE.exec(code);
  if (!match) return { ok: false, reason: /^EW\d+\./.test(code) ? 'damaged' : 'not-a-widget' };
  if (Number(match[1]) > 1) return { ok: false, reason: 'too-new' };
  const bytes = fromBase64Url(match[2]!);
  if (!bytes || crc32(bytes).toString(36) !== match[3] || toBase64Url(bytes) !== match[2]) return { ok: false, reason: 'damaged' };
  try {
    return parseWidgetFile(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return { ok: false, reason: 'damaged' };
  }
}
