import type { ThemeFile } from './look';
import { LIMITS_LOOKS, parseThemeFile, written, type ParsedTheme } from './theme-file';

const LATEST_CODE = 2;
const CODE = /^EH(\d+)\.([A-Za-z0-9_-]+)\.([0-9a-z]+)$/;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 of some bytes, as in zip files: a changed or missing letter is noticed. */
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
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A theme as a code to paste: its format, the theme in letters and digits, and a check number. */
export function toShareCode(file: ThemeFile): string {
  const shown = written(file);
  const bytes = new TextEncoder().encode(JSON.stringify(shown));
  return `EH${shown.format}.${toBase64Url(bytes)}.${crc32(bytes).toString(36)}`;
}

export type FromCode = ParsedTheme | { ok: false; reason: 'damaged' };

/** A pasted code back into a theme; spaces and line breaks in it do not matter, a changed or missing letter does. */
export function fromShareCode(text: string): FromCode {
  const code = text.replace(/\s+/g, '');
  if (code.length > LIMITS_LOOKS.fileBytes * 2) return { ok: false, reason: 'too-big' };
  const match = CODE.exec(code);
  if (!match) return { ok: false, reason: /^EH\d+\./.test(code) ? 'damaged' : 'not-a-theme' };
  const format = Number(match[1]);
  if (format > LATEST_CODE) return { ok: false, reason: 'too-new' };
  if (format !== 1 && format !== 2) return { ok: false, reason: 'not-a-theme' };
  const bytes = fromBase64Url(match[2]!);
  if (!bytes || crc32(bytes).toString(36) !== match[3] || toBase64Url(bytes) !== match[2]) return { ok: false, reason: 'damaged' };
  try {
    const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    // the format in the code and in the theme are one: a code of 1 never carries a theme of 2
    if (typeof raw === 'object' && raw !== null && (raw as Record<string, unknown>)['format'] !== format) return { ok: false, reason: 'damaged' };
    return parseThemeFile(raw);
  } catch {
    return { ok: false, reason: 'damaged' };
  }
}

/** A theme as the text of a file. */
export function toFileText(file: ThemeFile): string {
  return `${JSON.stringify(written(file), null, 2)}\n`;
}

/** The text of a file back into a theme. */
export function fromFileText(text: string): ParsedTheme {
  // a file is written with room (indented); the theme itself is measured without it
  if (text.length > LIMITS_LOOKS.fileBytes * 2) return { ok: false, reason: 'too-big' };
  try {
    return parseThemeFile(JSON.parse(text));
  } catch {
    return { ok: false, reason: 'not-a-theme' };
  }
}
