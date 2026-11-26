import { EMPTY_BASE, type ThemeCss, type ThemeFile } from './look';
import { isCssFrom, type CssFrom, type LooksDoc } from './looks-doc';
import { fileFormat, parseThemeFile } from './theme-file';

/**
 * A theme of format 2 is kept twice: whole, under a key that older versions never read, and as a shadow of format 1
 * in the place they do read. An older version thus sees an ordinary theme, shows it as well as it can, keeps a choice
 * of it for the house or a dashboard, and never drops it; this version lays the whole theme over its shadow again.
 */

/** CSS kept apart, under a key older versions never read: per theme its text and where it comes from. */
export interface StoredCss extends ThemeCss { from: CssFrom }

const withoutCss = (file: ThemeFile): ThemeFile => {
  const { css: _css, ...rest } = file;
  return rest;
};

/** The theme as an older version can hold it: format 1, without own values or CSS, with Rustig for the empty base. */
export function shadowOf(withCss: ThemeFile): ThemeFile {
  const file = withoutCss(withCss);
  if (fileFormat(file) === 1) {
    const { values: _values, ...plain } = file;
    return { ...plain, format: 1 };
  }
  const { values: _values, ...rest } = file;
  return { ...rest, format: 1, base: file.base === EMPTY_BASE ? 'rustig' : file.base };
}

/** The shadows in their order, and the whole themes of format 2 by id. */
export function splitThemes(themes: readonly ThemeFile[]): { shadows: ThemeFile[]; full: Record<string, ThemeFile> } {
  const full: Record<string, ThemeFile> = {};
  for (const file of themes.map(withoutCss)) if (fileFormat(file) === 2) full[file.id] = { ...file, format: 2 };
  return { shadows: themes.map(shadowOf), full };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The whole themes laid over their shadows. What an older version changed of a shadow wins: its name, maker, colour
 * and knobs, and its base when that is no longer the shadow of the whole one's. A whole theme without a shadow was
 * removed by an older version and stays gone; one that cannot be read leaves the shadow.
 */
export function joinThemes(shadows: readonly ThemeFile[], fullRaw: unknown): ThemeFile[] {
  const full = isRecord(fullRaw) ? fullRaw : {};
  return shadows.map((shadow) => {
    const raw = Object.hasOwn(full, shadow.id) ? full[shadow.id] : undefined;
    const parsed = raw === undefined ? null : parseThemeFile(raw);
    if (!parsed?.ok || parsed.file.id !== shadow.id || fileFormat(parsed.file) !== 2) return shadow;
    const whole = parsed.file;
    const base = shadow.base === shadowOf(whole).base ? whole.base : shadow.base;
    return { ...whole, format: 2, name: shadow.name, maker: shadow.maker, seed: shadow.seed, userSeed: shadow.userSeed, knobs: shadow.knobs, base };
  });
}

/** The CSS of the themes apart, with its origin. */
export function splitCss(themes: readonly ThemeFile[], from: Readonly<Record<string, CssFrom>> | undefined): Record<string, StoredCss> {
  return Object.fromEntries(themes.filter((file) => file.css !== undefined).map((file) => [file.id, { ...file.css!, from: from?.[file.id] ?? 'other' }]));
}

/** The CSS laid back on the themes that are there; CSS of a theme that is gone falls away. */
export function joinCss(themes: readonly ThemeFile[], cssRaw: unknown): { themes: ThemeFile[]; cssFrom: Record<string, CssFrom> } {
  const css = isRecord(cssRaw) ? cssRaw : {};
  const cssFrom: Record<string, CssFrom> = {};
  const joined = themes.map((file) => {
    const entry = Object.hasOwn(css, file.id) ? css[file.id] : undefined;
    if (!isRecord(entry) || typeof entry['text'] !== 'string' || typeof entry['version'] !== 'number' || !Number.isInteger(entry['version']) || entry['version'] < 1) return withoutCss(file);
    cssFrom[file.id] = isCssFrom(entry['from']) ? entry['from'] : 'other';
    return { ...file, format: 2 as const, css: { version: entry['version'], text: entry['text'] } };
  });
  return { themes: joined, cssFrom };
}

/** The looks of a hub as they are stored: the document older versions read, the whole themes, and the CSS, each apart. */
export function looksToStore(doc: LooksDoc): { doc: LooksDoc; full: Record<string, ThemeFile>; css: Record<string, StoredCss>; takenIn: string[] } {
  const { shadows, full } = splitThemes(doc.themes);
  const { cssFrom, takenIn = [], ...rest } = doc;
  return { doc: { ...rest, themes: shadows }, full, css: splitCss(doc.themes, cssFrom), takenIn };
}

/** The stored looks as one document again, to be normalized as usual. */
export function looksFromStore(docRaw: unknown, fullRaw: unknown, cssRaw?: unknown, takenInRaw?: unknown): unknown {
  if (!isRecord(docRaw) || !Array.isArray(docRaw['themes'])) return docRaw;
  const shadows = docRaw['themes'].flatMap((item) => {
    const parsed = parseThemeFile(item);
    return parsed.ok && isRecord(item) && item['id'] === parsed.file.id ? [parsed.file] : [];
  });
  const { themes, cssFrom } = joinCss(joinThemes(shadows, fullRaw), cssRaw);
  return { ...docRaw, themes, cssFrom, takenIn: takenInRaw };
}
