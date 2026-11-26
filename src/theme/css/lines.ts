import { sanitizeCss } from './sanitize';

/** The lines of someone else's CSS that never work, and those that work only once it is allowed (1-based). */
export interface CssLines { never: Set<number>; notYet: Set<number> }

export function cssLines(text: string): CssLines {
  // a dropped !important leaves the rest of its line working
  const lineOf = (list: 'wide' | 'narrow') => new Set(sanitizeCss(text, { list, keyframes: 'k' }).messages.filter((message) => message.kind !== 'important').map((message) => message.line));
  const never = lineOf('wide');
  const notYet = new Set([...lineOf('narrow')].filter((line) => !never.has(line)));
  return { never, notYet };
}
