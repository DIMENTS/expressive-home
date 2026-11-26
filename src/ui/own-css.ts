import { sanitizeCss } from '../theme/css/sanitize';
import type { LookRole } from '../theme/choose';
import type { ThemeFile } from '../theme/look';
import type { CssFrom } from '../theme/looks-doc';

/** The two sheets of own CSS: one for the dashboard, one for the rest screen. */
export interface OwnCss { dashboard: string; rest: string }

export interface OwnCssInput {
  /** The theme the dashboard shows (a dashboard's own, or the device's or the house's). */
  shown: ThemeFile;
  /** The theme of the device and the house, which the rest screen follows. */
  resting: ThemeFile;
  /** Where the CSS of each theme comes from. */
  cssFrom: Readonly<Record<string, CssFrom>>;
  /** Whether this device allowed exactly this CSS of someone else in full. */
  allowed: (id: string, text: string) => boolean;
  role: LookRole;
  /** `#veilig` or Helder: no own CSS at all. */
  off: boolean;
}

const NONE: OwnCss = { dashboard: '', rest: '' };

/** A short name for a theme's keyframes, so that those of two themes never meet. */
const keyframesOf = (id: string): string => `k${id.replace(/[^a-z0-9]/g, '').slice(-8)}`;

/** What was read last: the page asks again at every change of the theme, the CSS seldom changes. */
const read = new Map<string, ReturnType<typeof sanitizeCss>>();
const REMEMBERED = 8;

function sanitized(file: ThemeFile, input: OwnCssInput) {
  const text = file.css?.text ?? '';
  if (text.trim() === '') return null;
  // the house's own CSS, or someone else's that this device (one that may edit, or a browser of its own) allowed
  const wide = input.cssFrom[file.id] === 'house' || (input.role !== 'use' && input.allowed(file.id, text));
  const key = `${wide ? 'w' : 'n'}${keyframesOf(file.id)}\u0000${text}`;
  let out = read.get(key);
  if (!out) {
    out = sanitizeCss(text, { list: wide ? 'wide' : 'narrow', keyframes: keyframesOf(file.id) });
    if (read.size >= REMEMBERED) read.delete(read.keys().next().value!);
    read.set(key, out);
  }
  return out;
}

/** What the page shows of own CSS: the dashboard from the theme it shows, the rest screen from the device and the house. */
export function ownCss(input: OwnCssInput): OwnCss {
  if (input.off) return NONE;
  return { dashboard: sanitized(input.shown, input)?.dashboard ?? '', rest: sanitized(input.resting, input)?.rest ?? '' };
}

/** The two sheets on a document, after the ones it has; created once, and filled again when the CSS changes. */
export function ownCssSheets(document: Document): (css: OwnCss) => void {
  const make = (): CSSStyleSheet | null => {
    try {
      return new CSSStyleSheet();
    } catch {
      return null;
    }
  };
  const dashboard = make();
  const rest = make();
  if (!dashboard || !rest || !('adoptedStyleSheets' in document)) return () => {};
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, dashboard, rest];
  let last: OwnCss = NONE;
  return (css) => {
    if (css.dashboard !== last.dashboard) dashboard.replaceSync(css.dashboard);
    if (css.rest !== last.rest) rest.replaceSync(css.rest);
    last = css;
  };
}
