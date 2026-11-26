// Release 1.2.0 of this module, kept as it was: newer themes must survive the code that is already out there.
import { EMPTY_BASE, type ThemeFile } from '../../../src/theme/look';
import type { LooksDoc } from './looks-doc';
import { fileFormat, parseThemeFile } from './theme-file';

/**
 * A theme of format 2 is kept twice: whole, under a key that older versions never read, and as a shadow of format 1
 * in the place they do read. An older version thus sees an ordinary theme, shows it as well as it can, keeps a choice
 * of it for the house or a dashboard, and never drops it; this version lays the whole theme over its shadow again.
 */

/** The theme as an older version can hold it: format 1, without own values, with Rustig for the empty base. */
export function shadowOf(file: ThemeFile): ThemeFile {
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
  for (const file of themes) if (fileFormat(file) === 2) full[file.id] = { ...file, format: 2 };
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

/** The looks of a hub as they are stored: the document older versions read, and the whole themes apart. */
export function looksToStore(doc: LooksDoc): { doc: LooksDoc; full: Record<string, ThemeFile> } {
  const { shadows, full } = splitThemes(doc.themes);
  return { doc: { ...doc, themes: shadows }, full };
}

/** The stored looks as one document again, to be normalized as usual. */
export function looksFromStore(docRaw: unknown, fullRaw: unknown): unknown {
  if (!isRecord(docRaw) || !Array.isArray(docRaw['themes'])) return docRaw;
  const shadows = docRaw['themes'].flatMap((item) => {
    const parsed = parseThemeFile(item);
    return parsed.ok && isRecord(item) && item['id'] === parsed.file.id ? [parsed.file] : [];
  });
  return { ...docRaw, themes: joinThemes(shadows, fullRaw) };
}
