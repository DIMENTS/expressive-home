import { entryOf } from '../values/catalogue';
import { checkValue } from '../values/kinds';
import { MOVING, NARROW, SHADOW_BOUNDS, WIDE, type Spec } from './allowed';
import { CONTAINER_PARTS, PICTURE_PARTS, isPart, isRestPart, isState } from './parts';
import { tokenize, type Token } from './tokens';

/** Why something of own CSS was left out, with the line it was on. */
export interface CssMessage {
  line: number;
  kind: 'selector' | 'never' | 'not-allowed' | 'value' | 'at-rule' | 'syntax' | 'too-many' | 'important';
  /** The property, selector or at-rule it was about. */
  detail: string;
}

/** Own CSS as the page may use it: one sheet for the dashboard, one for the rest screen, and what was left out. */
export interface SanitizedCss { dashboard: string; rest: string; messages: CssMessage[] }

export interface SanitizeOptions {
  /** `wide` for the house's own CSS (or someone else's once allowed), `narrow` for someone else's. */
  list: 'wide' | 'narrow';
  /** The prefix of keyframes names, so they never meet the dashboard's own. */
  keyframes: string;
}

const HOST = 'mh-app';
const MAX_RULES = 400;
const MAX_VALUE = 400;
const MAX_PICTURE = 32_768;
const PSEUDO_CLASSES = new Set(['hover', 'active', 'focus-visible']);
const PSEUDO_ELEMENTS = new Set(['before', 'after']);
const SAFE_IDENT = /^-?[a-z_][a-z0-9_-]*$/i;
const FAMILY_STRING = /^[A-Za-z0-9 _-]{1,64}$/;
const PICTURE = /^data:image\/(png|jpeg|gif|webp|avif|svg\+xml)(;base64)?,[A-Za-z0-9+/=%._~-]*$/;
const MEDIA_WORDS = new Set(['and', 'not', 'only', 'screen', 'all', 'prefers-color-scheme', 'light', 'dark', 'min-width', 'max-width', 'width', 'min-height', 'max-height', 'height',
  'orientation', 'portrait', 'landscape', 'prefers-contrast', 'more', 'less', 'no-preference', 'hover', 'none', 'pointer', 'fine', 'coarse']);
const COLOUR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch']);
const GRADIENTS = new Set(['linear-gradient', 'radial-gradient', 'conic-gradient', 'repeating-linear-gradient', 'repeating-radial-gradient', 'repeating-conic-gradient']);
const GRADIENT_WORDS = new Set(['to', 'left', 'right', 'top', 'bottom', 'center', 'circle', 'ellipse', 'at', 'from', 'in', 'closest-side', 'closest-corner', 'farthest-side', 'farthest-corner',
  'srgb', 'srgb-linear', 'oklab', 'oklch', 'lab', 'lch', 'hsl', 'hwb', 'display-p3', 'shorter', 'longer', 'increasing', 'decreasing', 'hue']);
const COLOUR_SPACES = new Set(['srgb', 'srgb-linear', 'oklab', 'oklch', 'lab', 'lch', 'hsl', 'hwb', 'display-p3', 'xyz', 'shorter', 'longer', 'increasing', 'decreasing', 'hue']);
const LENGTH_UNITS: Record<string, number> = { px: 1, em: 16, rem: 16, ch: 8, ex: 8 };
/** A factor of a unit, only for units of the list: `constructor` is no unit. */
const unitOf = (table: Record<string, number>, unit: string | undefined): number | undefined => (unit !== undefined && Object.hasOwn(table, unit) ? table[unit] : undefined);
const TIME_UNITS: Record<string, number> = { s: 1000, ms: 1 };
const ANGLE_UNITS = new Set(['deg', 'turn', 'rad', 'grad']);
const MAX_TIME_MS = 60_000;
const NAMED_COLOURS = new Set([
  'transparent', 'currentcolor', 'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey', 'silver', 'gold',
  'navy', 'teal', 'olive', 'maroon', 'lime', 'aqua', 'cyan', 'magenta', 'fuchsia', 'indigo', 'violet', 'coral', 'salmon', 'tomato', 'crimson', 'khaki',
  'beige', 'ivory', 'linen', 'lavender', 'plum', 'orchid', 'tan', 'chocolate', 'sienna', 'peru', 'wheat', 'snow', 'honeydew', 'mintcream', 'azure',
  'aliceblue', 'ghostwhite', 'whitesmoke', 'seashell', 'oldlace', 'floralwhite', 'cornsilk', 'lemonchiffon', 'darkgreen', 'darkblue', 'darkred',
  'darkgray', 'darkgrey', 'lightgray', 'lightgrey', 'dimgray', 'dimgrey', 'slategray', 'slategrey', 'steelblue', 'skyblue', 'royalblue', 'midnightblue',
  'forestgreen', 'seagreen', 'limegreen', 'springgreen', 'turquoise', 'firebrick', 'darkorange', 'goldenrod', 'rebeccapurple', 'hotpink', 'deeppink',
]);

// ----- the tree: rules and their blocks -----

interface Rule { kind: 'at' | 'qualified'; name: string; prelude: Token[]; block: Token[] | null; line: number }

const closer: Record<string, string> = { '{': '}', '(': ')', '[': ']', function: ')' };

/** Tokens up to the end of a block that opened before `start`, balanced; returns the tokens and where it ends. */
function blockFrom(tokens: Token[], start: number): { inside: Token[]; end: number } {
  const stack: string[] = ['}'];
  let at = start;
  while (at < tokens.length) {
    const token = tokens[at]!;
    const close = closer[token.type];
    if (close) stack.push(close);
    else if (token.type === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return { inside: tokens.slice(start, at), end: at + 1 };
    }
    at += 1;
  }
  return { inside: tokens.slice(start), end: at };
}

function rulesOf(tokens: Token[], messages: CssMessage[]): Rule[] {
  const rules: Rule[] = [];
  let at = 0;
  while (at < tokens.length) {
    const token = tokens[at]!;
    if (token.type === 'space' || token.type === 'semicolon') { at += 1; continue; }
    if (token.type === '}') { messages.push({ line: token.line, kind: 'syntax', detail: '}' }); at += 1; continue; }
    const kind = token.type === 'at' ? 'at' : 'qualified';
    const prelude: Token[] = [];
    let block: Token[] | null = null;
    if (kind === 'at') at += 1;
    const stack: string[] = [];
    while (at < tokens.length) {
      const t = tokens[at]!;
      if (stack.length === 0 && t.type === '{') {
        const { inside, end } = blockFrom(tokens, at + 1);
        block = inside;
        at = end;
        break;
      }
      if (stack.length === 0 && t.type === 'semicolon' && kind === 'at') { at += 1; break; }
      const close = closer[t.type];
      if (close) stack.push(close);
      else if (t.type === stack.at(-1)) stack.pop();
      prelude.push(t);
      at += 1;
    }
    rules.push({ kind, name: kind === 'at' ? token.value.toLowerCase() : '', prelude, block, line: token.line });
  }
  return rules;
}

// ----- writing tokens anew -----

const trim = (tokens: Token[]): Token[] => {
  let start = 0;
  let end = tokens.length;
  while (start < end && tokens[start]!.type === 'space') start += 1;
  while (end > start && tokens[end - 1]!.type === 'space') end -= 1;
  return tokens.slice(start, end);
};

/** Splits at the commas outside brackets. */
function splitCommas(tokens: Token[]): Token[][] {
  const out: Token[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.type === '(' || token.type === 'function' || token.type === '[') depth += 1;
    else if (token.type === ')' || token.type === ']') depth -= 1;
    if (token.type === 'comma' && depth === 0) out.push([]);
    else out.at(-1)!.push(token);
  }
  return out.map(trim);
}

/** The arguments of a function at `at`: the tokens up to its closing bracket, and where that is. */
function argsOf(tokens: Token[], at: number): { args: Token[]; end: number } | null {
  let depth = 1;
  for (let i = at + 1; i < tokens.length; i += 1) {
    const type = tokens[i]!.type;
    if (type === 'function' || type === '(') depth += 1;
    else if (type === ')') {
      depth -= 1;
      if (depth === 0) return { args: tokens.slice(at + 1, i), end: i };
    }
  }
  return null;
}

/** A setting of the theme a value may refer to: one that the editor can set, or a colour role it can set. */
function referable(name: string): boolean {
  const entry = entryOf(name);
  return entry !== undefined && entry.kind.kind !== 'fixed';
}

interface Context { spec: Spec; picture: boolean; keyframes: Set<string>; prefix: string; container: boolean; holdsTiles: boolean }

/** What only a part with text of its own may set: on a part that holds others it would add up over them. */
const TEXT_ONLY = new Set(['font-size']);
/** What takes room inside a part: on a part that holds tiles it would make them smaller, so only a tile itself may. */
const ROOM = /^(padding|gap|row-gap|column-gap|border|border-(top|right|bottom|left)|border-width|border-style|border-(top|right|bottom|left)-(width|style))$/;

const join = (pieces: string[]): string => pieces.join('').replace(/ {2,}/g, ' ').replace(/ ?, ?/g, ',').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

function length(token: Token, bounds: readonly [number, number] | undefined): string | null {
  const unit = token.unit ?? '';
  const factor = unitOf(LENGTH_UNITS, unit);
  if (factor === undefined || bounds === undefined || token.number === undefined) return null;
  const px = token.number * factor;
  return px >= bounds[0] && px <= bounds[1] ? token.value.toLowerCase() : null;
}

/** A colour on its own: a hex, a name, a role or setting of the theme, or a colour function of plain numbers. */
/** How deep colours may mix within one another. */
const MAX_MIX_DEPTH = 3;

function colour(tokens: Token[], ctx: Context, depth = 0): string | null {
  if (depth > MAX_MIX_DEPTH) return null;
  const parts = trim(tokens);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  if (parts.length === 1) {
    if (first.type === 'hash') return [3, 4, 6, 8].includes(first.value.length) && /^[0-9a-f]+$/i.test(first.value) ? `#${first.value.toLowerCase()}` : null;
    if (first.type === 'ident') {
      const lower = first.value.toLowerCase();
      return NAMED_COLOURS.has(lower) ? (lower === 'currentcolor' ? 'currentColor' : lower) : null;
    }
  }
  if (first.type !== 'function') return null;
  const found = argsOf(parts, 0);
  if (!found || found.end !== parts.length - 1) return null;
  const name = first.value.toLowerCase();
  if (name === 'var') return variable(found.args);
  if (COLOUR_FUNCTIONS.has(name)) {
    const out: string[] = [];
    for (const token of found.args) {
      if (token.type === 'space') out.push(' ');
      else if (token.type === 'comma') out.push(',');
      else if (token.type === 'delim' && token.value === '/') out.push('/');
      else if (token.type === 'number' || token.type === 'percentage') out.push(token.value);
      else if (token.type === 'dimension' && ANGLE_UNITS.has(token.unit ?? '')) out.push(token.value.toLowerCase());
      else if (token.type === 'ident' && token.value.toLowerCase() === 'none') out.push('none');
      else return null;
    }
    return `${name}(${join(out)})`;
  }
  if (name === 'color-mix') {
    const groups = splitCommas(found.args);
    if (groups.length !== 3) return null;
    const space = groups[0]!.filter((token) => token.type !== 'space');
    if (space[0]?.type !== 'ident' || space[0].value.toLowerCase() !== 'in' || !space.slice(1).every((token) => token.type === 'ident' && COLOUR_SPACES.has(token.value.toLowerCase()))) return null;
    const sides = groups.slice(1).map((group) => {
      const last = group.at(-1);
      if (last?.type === 'percentage' && last.number !== undefined && last.number >= 0 && last.number <= 100) {
        const own = colour(group.slice(0, -1), ctx, depth + 1);
        return own === null ? null : `${own} ${last.value}`;
      }
      return colour(group, ctx, depth + 1);
    });
    if (sides.some((side) => side === null)) return null;
    return `color-mix(in ${space.slice(1).map((token) => token.value.toLowerCase()).join(' ')},${sides.join(',')})`;
  }
  return null;
}

function variable(args: Token[]): string | null {
  const inside = trim(args);
  if (inside.length !== 1 || inside[0]!.type !== 'ident') return null;
  const name = inside[0]!.value;
  return name.startsWith('--') && SAFE_IDENT.test(name.slice(2)) && referable(name.slice(2)) ? `var(${name})` : null;
}

function picture(token: Token, tokens: Token[], at: number): { text: string; end: number } | null {
  if (token.type === 'url') return PICTURE.test(token.value) ? { text: `url("${token.value}")`, end: at } : null;
  if (token.type === 'function' && token.value.toLowerCase() === 'url') {
    const found = argsOf(tokens, at);
    const inside = found ? trim(found.args) : [];
    if (!found || inside.length !== 1 || inside[0]!.type !== 'string' || !PICTURE.test(inside[0]!.value)) return null;
    return { text: `url("${inside[0]!.value}")`, end: found.end };
  }
  return null;
}

function gradient(args: Token[], ctx: Context): string | null {
  const out: string[] = [];
  for (const group of splitCommas(args)) {
    const pieces: string[] = [];
    let at = 0;
    while (at < group.length) {
      const token = group[at]!;
      if (token.type === 'space') { pieces.push(' '); at += 1; continue; }
      if (token.type === 'ident' && GRADIENT_WORDS.has(token.value.toLowerCase())) { pieces.push(token.value.toLowerCase()); at += 1; continue; }
      if (token.type === 'dimension' && ANGLE_UNITS.has(token.unit ?? '')) { pieces.push(token.value.toLowerCase()); at += 1; continue; }
      if (token.type === 'percentage' || (token.type === 'number' && token.number === 0)) { pieces.push(token.value); at += 1; continue; }
      if (token.type === 'dimension') {
        const own = length(token, [-2000, 2000]);
        if (own === null) return null;
        pieces.push(own); at += 1; continue;
      }
      // a colour: a single token, or a function with its arguments
      const end = token.type === 'function' ? argsOf(group, at)?.end ?? -1 : at;
      if (end < 0) return null;
      const own = colour(group.slice(at, end + 1), ctx);
      if (own === null) return null;
      pieces.push(own);
      at = end + 1;
    }
    out.push(join(pieces));
  }
  return out.join(',');
}

function shadow(groups: Token[][], ctx: Context): string | null {
  const out: string[] = [];
  const box = ctx.spec.shadow === 'box';
  for (const group of groups) {
    if (group.length === 1 && group[0]!.type === 'ident' && group[0]!.value.toLowerCase() === 'none') { out.push('none'); continue; }
    const lengths: string[] = [];
    const values: number[] = [];
    let tint: string | null = null;
    let inset = false;
    let at = 0;
    while (at < group.length) {
      const token = group[at]!;
      if (token.type === 'space') { at += 1; continue; }
      if (box && token.type === 'ident' && token.value.toLowerCase() === 'inset' && !inset) { inset = true; at += 1; continue; }
      if ((token.type === 'dimension' && unitOf(LENGTH_UNITS, token.unit) !== undefined) || (token.type === 'number' && token.number === 0)) {
        values.push((token.number ?? 0) * (unitOf(LENGTH_UNITS, token.unit) ?? 1));
        lengths.push(token.type === 'number' ? '0' : token.value.toLowerCase());
        at += 1;
        continue;
      }
      if (tint !== null) return null;
      const end = token.type === 'function' ? argsOf(group, at)?.end ?? -1 : at;
      if (end < 0) return null;
      tint = colour(group.slice(at, end + 1), ctx);
      if (tint === null) return null;
      at = end + 1;
    }
    const most = box ? 4 : 3;
    if (lengths.length < 2 || lengths.length > most) return null;
    const [x, y, blur = 0, spread = 0] = values as [number, number, number?, number?];
    if (Math.abs(x) > SHADOW_BOUNDS.offset || Math.abs(y) > SHADOW_BOUNDS.offset || blur < 0 || blur > SHADOW_BOUNDS.blur || Math.abs(spread) > SHADOW_BOUNDS.spread) return null;
    out.push([inset ? 'inset' : '', ...lengths, tint ?? ''].filter(Boolean).join(' '));
  }
  return out.join(',');
}

/** A value as the property allows it, written anew; null when anything in it is not allowed. */
function value(tokens: Token[], ctx: Context): string | null {
  const { spec } = ctx;
  const parts = trim(tokens);
  if (parts.length === 0) return null;
  if (spec.shadow) return shadow(splitCommas(parts), ctx);
  if (spec.pieces.includes('empty-string')) return parts.length === 1 && parts[0]!.type === 'string' && parts[0]!.value === '' ? '""' : null;
  const out: string[] = [];
  let at = 0;
  let times = 0;
  while (at < parts.length) {
    const token = parts[at]!;
    const has = (piece: Parameters<typeof spec.pieces.includes>[0]): boolean => spec.pieces.includes(piece);
    switch (token.type) {
      case 'space': out.push(' '); at += 1; continue;
      case 'comma': if (!spec.list) return null; out.push(','); times = 0; at += 1; continue;
      case 'delim': if (!spec.slash || token.value !== '/') return null; out.push(' / '); at += 1; continue;
      case 'hash': {
        const own = has('colour') ? colour([token], ctx) : null;
        if (own === null) return null;
        out.push(own); at += 1; continue;
      }
      case 'ident': {
        const lower = token.value.toLowerCase();
        if (spec.keywords?.includes(lower)) out.push(lower);
        else if (has('colour') && NAMED_COLOURS.has(lower)) out.push(colour([token], ctx)!);
        else if (has('family') && SAFE_IDENT.test(token.value)) out.push(token.value);
        else if (spec.animation && ctx.keyframes.has(lower)) out.push(`${ctx.prefix}-${lower}`);
        else if (spec.transition && MOVING.includes(lower)) out.push(lower);
        else return null;
        at += 1; continue;
      }
      case 'string': {
        if (!has('family') || !FAMILY_STRING.test(token.value)) return null;
        out.push(`"${token.value}"`); at += 1; continue;
      }
      case 'number': {
        const n = token.number!;
        if (has('number') && spec.number && n >= spec.number[0] && n <= spec.number[1]) out.push(token.value);
        else if (n === 0 && has('length') && spec.length && spec.length[0] <= 0 && spec.length[1] >= 0) out.push('0');
        else return null;
        at += 1; continue;
      }
      case 'percentage': {
        const n = token.number!;
        if (!has('percentage') || !spec.percentage || n < spec.percentage[0] || n > spec.percentage[1]) return null;
        out.push(token.value); at += 1; continue;
      }
      case 'dimension': {
        const unit = token.unit ?? '';
        if (has('time') && unitOf(TIME_UNITS, unit) !== undefined) {
          const ms = token.number! * unitOf(TIME_UNITS, unit)!;
          if (ms < 0 || ms > (spec.maxTime ?? MAX_TIME_MS)) return null;
          times += 1;
          if (spec.oneTime && times > 1) return null;
          out.push(token.value.toLowerCase());
        } else if (spec.em) {
          if ((unit !== 'em' && unit !== 'rem') || token.number! < spec.em[0] || token.number! > spec.em[1]) return null;
          out.push(token.value.toLowerCase());
        } else {
          const own = has('length') ? length(token, spec.length) : null;
          if (own === null) return null;
          out.push(own);
        }
        at += 1; continue;
      }
      case 'url': case 'function': {
        if (has('picture') && ctx.picture) {
          const found = picture(token, parts, at);
          if (found) { out.push(found.text); at = found.end + 1; continue; }
        }
        if (token.type === 'url') return null;
        const name = token.value.toLowerCase();
        const found = argsOf(parts, at);
        if (!found) return null;
        let own: string | null = null;
        if (has('gradient') && GRADIENTS.has(name)) {
          const inside = gradient(found.args, ctx);
          own = inside === null ? null : `${name}(${inside})`;
        } else if (has('colour')) own = colour(parts.slice(at, found.end + 1), ctx);
        if (own === null) return null;
        out.push(own);
        at = found.end + 1;
        continue;
      }
      default:
        return null;
    }
  }
  const text = join(out);
  return text.length <= (text.includes('url(') ? MAX_PICTURE : MAX_VALUE) ? text : null;
}

// ----- selectors -----

interface Selector { text: string; rest: boolean; picture: boolean; container: boolean; holdsTiles: boolean }

function selector(tokens: Token[]): Selector | null {
  // spaces only inside ::part(); anywhere else they would be a combinator
  const raw = trim(tokens);
  let at = 0;
  const take = (type: Token['type'], value?: string): Token | null => {
    const token = raw[at];
    if (!token || token.type !== type || (value !== undefined && token.value.toLowerCase() !== value)) return null;
    at += 1;
    return token;
  };
  if (!take('colon') || !take('colon') || !take('function', 'part')) return null;
  const names: string[] = [];
  while (at < raw.length && raw[at]!.type !== ')') {
    const token = raw[at]!;
    if (token.type === 'ident') names.push(token.value.toLowerCase());
    else if (token.type !== 'space') return null;
    at += 1;
  }
  if (!take(')')) return null;
  let pseudo = '';
  if (raw[at]?.type === 'colon' && raw[at + 1]?.type === 'ident') {
    const name = raw[at + 1]!.value.toLowerCase();
    if (!PSEUDO_CLASSES.has(name)) return null;
    pseudo += `:${name}`;
    at += 2;
  }
  if (raw[at]?.type === 'colon' && raw[at + 1]?.type === 'colon' && raw[at + 2]?.type === 'ident') {
    const name = raw[at + 2]!.value.toLowerCase();
    if (!PSEUDO_ELEMENTS.has(name)) return null;
    pseudo += `::${name}`;
    at += 3;
  }
  if (at !== raw.length) return null;
  if (names.length === 0 || !names.every((name) => isPart(name) || isState(name))) return null;
  const own = names.filter(isPart);
  if (own.length !== 1) return null;
  const container = CONTAINER_PARTS.includes(own[0]!);
  // decoration only on a part with text or an icon: on one that holds others it would push them away
  if (container && pseudo.includes('::')) return null;
  return { text: `${HOST}::part(${names.join(' ')})${pseudo}`, rest: isRestPart(own[0]!), picture: PICTURE_PARTS.includes(own[0]!), container, holdsTiles: container && own[0] !== 'tile' };
}

// ----- declarations -----

interface Written { normal: string[]; motion: string[] }

function declarations(block: Token[], list: Readonly<Record<string, Spec>>, base: Omit<Context, 'spec'>, messages: CssMessage[], only?: readonly string[]): Written {
  const written: Written = { normal: [], motion: [] };
  const pieces: Token[][] = [[]];
  let depth = 0;
  for (const token of block) {
    if (token.type === '{' || token.type === '(' || token.type === 'function' || token.type === '[') depth += 1;
    else if (token.type === '}' || token.type === ')' || token.type === ']') depth -= 1;
    if (token.type === 'semicolon' && depth === 0) pieces.push([]);
    else pieces.at(-1)!.push(token);
  }
  for (const raw of pieces) {
    const tokens = trim(raw);
    if (tokens.length === 0) continue;
    const line = tokens[0]!.line;
    if (tokens[0]!.type !== 'ident' || trim(tokens.slice(1))[0]?.type !== 'colon') {
      messages.push({ line, kind: 'syntax', detail: tokens[0]!.value });
      continue;
    }
    const name = tokens[0]!.value.toLowerCase();
    let rest = trim(trim(tokens.slice(1)).slice(1));
    // !important: left out, it would never win from what a part pins itself
    const bang = rest.findIndex((token) => token.type === 'delim' && token.value === '!');
    if (bang >= 0) {
      const after = trim(rest.slice(bang + 1));
      if (after.length === 1 && after[0]!.type === 'ident' && after[0]!.value.toLowerCase() === 'important') {
        messages.push({ line, kind: 'important', detail: name });
        rest = trim(rest.slice(0, bang));
      }
    }
    if (rest.some((token) => token.type === '{' || token.type === '}')) {
      messages.push({ line, kind: 'syntax', detail: name });
      continue;
    }
    if (name.startsWith('--') && list === NARROW) {
      messages.push({ line, kind: 'not-allowed', detail: name });
      continue;
    }
    if (name.startsWith('--')) {
      const entry = SAFE_IDENT.test(name.slice(2)) ? entryOf(name.slice(2)) : undefined;
      const text = rest.map((token) => (token.type === 'hash' ? `#${token.value}` : token.type === 'space' ? ' ' : token.type === 'function' ? `${token.value}(` : token.type === 'comma' ? ',' : token.value)).join('');
      const own = entry && entry.kind.kind !== 'fixed' && !only ? checkValue(entry.kind, text) : null;
      if (own === null) messages.push({ line, kind: entry && entry.kind.kind !== 'fixed' ? 'value' : 'never', detail: name });
      else written.normal.push(`${name}:${own}`);
      continue;
    }
    if (only && !only.includes(name)) {
      messages.push({ line, kind: 'never', detail: name });
      continue;
    }
    const spec = (base.container && TEXT_ONLY.has(name)) || (base.holdsTiles && ROOM.test(name)) ? undefined : list[name];
    if (!spec) {
      messages.push({ line, kind: WIDE[name] ? 'not-allowed' : 'never', detail: name });
      continue;
    }
    const own = value(rest, { ...base, spec });
    if (own === null) {
      messages.push({ line, kind: 'value', detail: name });
      continue;
    }
    (name.startsWith('animation') || name.startsWith('transition') ? written.motion : written.normal).push(`${name}:${own}`);
  }
  return written;
}

// ----- at-rules -----

function media(prelude: Token[]): string | null {
  const out: string[] = [];
  for (const token of trim(prelude)) {
    if (token.type === 'space') out.push(' ');
    else if (token.type === '(' || token.type === ')' || token.type === 'colon' || token.type === 'comma') out.push(token.type === 'colon' ? ':' : token.type === 'comma' ? ',' : token.type);
    else if (token.type === 'ident' && MEDIA_WORDS.has(token.value.toLowerCase())) out.push(token.value.toLowerCase());
    else if (token.type === 'dimension' && unitOf(LENGTH_UNITS, token.unit) !== undefined && token.number! >= 0 && token.number! <= 10_000) out.push(token.value.toLowerCase());
    else if (token.type === 'number' && token.number! >= 0 && token.number! <= 10_000) out.push(token.value);
    else return null;
  }
  const text = out.join('').replace(/ ?: ?/g, ':').replace(/\( /g, '(').replace(/ \)/g, ')').replace(/ {2,}/g, ' ').trim();
  return text.length > 0 ? text : null;
}

// ----- the whole -----

/** Own CSS read and written anew: only `::part()` rules with what the list allows; everything else is named and left out. */
export function sanitizeCss(text: string, options: SanitizeOptions): SanitizedCss {
  const messages: CssMessage[] = [];
  const list = options.list === 'wide' ? WIDE : NARROW;
  const rules = rulesOf(tokenize(text), messages);
  const keyframes = new Set(rules.filter((rule) => rule.kind === 'at' && rule.name === 'keyframes').map((rule) => trim(rule.prelude)[0]).filter((token): token is Token => token?.type === 'ident' && SAFE_IDENT.test(token.value)).map((token) => token.value.toLowerCase()));
  const base = { keyframes: options.list === 'wide' ? keyframes : new Set<string>(), prefix: options.keyframes };
  const dashboard: string[] = [];
  const rest: string[] = [];
  let count = 0;

  const styleRule = (rule: Rule, wrap: (css: string) => string): { dashboard: string[]; rest: string[] } => {
    const out = { dashboard: [] as string[], rest: [] as string[] };
    const selectors = splitCommas(rule.prelude).map((group) => {
      const own = selector(group);
      if (!own) messages.push({ line: group[0]?.line ?? rule.line, kind: 'selector', detail: group.map((token) => token.value).join('').slice(0, 60) });
      return own;
    }).filter((own): own is Selector => own !== null);
    if (selectors.length === 0 || rule.block === null) return out;
    let told = false;
    for (const place of ['dashboard', 'rest'] as const) {
      const chosen = selectors.filter((own) => own.rest === (place === 'rest'));
      if (chosen.length === 0) continue;
      const picture = chosen.every((own) => own.picture);
      const container = chosen.some((own) => own.container);
      const holdsTiles = chosen.some((own) => own.holdsTiles);
      // the same block for both sheets is told about once
      const written = declarations(rule.block, list, { ...base, picture, container, holdsTiles }, told ? [] : messages);
      told = true;
      const names = chosen.map((own) => own.text).join(',');
      if (written.normal.length > 0) out[place].push(wrap(`${names}{${written.normal.join(';')}}`));
      if (written.motion.length > 0) out[place].push(wrap(`@media (prefers-reduced-motion:no-preference){${names}{${written.motion.join(';')}}}`));
    }
    return out;
  };

  for (const rule of rules) {
    count += 1;
    if (count > MAX_RULES) {
      messages.push({ line: rule.line, kind: 'too-many', detail: String(MAX_RULES) });
      break;
    }
    if (rule.kind === 'qualified') {
      const out = styleRule(rule, (css) => css);
      dashboard.push(...out.dashboard);
      rest.push(...out.rest);
      continue;
    }
    if (rule.name === 'media' && rule.block !== null) {
      const condition = media(rule.prelude);
      if (condition === null) { messages.push({ line: rule.line, kind: 'at-rule', detail: '@media' }); continue; }
      const inner = rulesOf(rule.block, messages);
      const inside = { dashboard: [] as string[], rest: [] as string[] };
      for (const child of inner) {
        if (child.kind !== 'qualified') { messages.push({ line: child.line, kind: 'at-rule', detail: `@${child.name}` }); continue; }
        const out = styleRule(child, (css) => css);
        inside.dashboard.push(...out.dashboard);
        inside.rest.push(...out.rest);
      }
      if (inside.dashboard.length > 0) dashboard.push(`@media ${condition}{${inside.dashboard.join('')}}`);
      if (inside.rest.length > 0) rest.push(`@media ${condition}{${inside.rest.join('')}}`);
      continue;
    }
    if (rule.name === 'keyframes' && rule.block !== null && options.list === 'wide') {
      const name = trim(rule.prelude);
      if (name.length !== 1 || name[0]!.type !== 'ident' || !SAFE_IDENT.test(name[0]!.value)) { messages.push({ line: rule.line, kind: 'at-rule', detail: '@keyframes' }); continue; }
      const frames: string[] = [];
      for (const frame of rulesOf(rule.block, messages)) {
        const stops = splitCommas(frame.prelude).map((stop) => {
          const token = stop.length === 1 ? stop[0]! : null;
          if (token?.type === 'ident' && ['from', 'to'].includes(token.value.toLowerCase())) return token.value.toLowerCase();
          if (token?.type === 'percentage' && token.number! >= 0 && token.number! <= 100) return token.value;
          return null;
        });
        if (frame.kind !== 'qualified' || frame.block === null || stops.some((stop) => stop === null)) { messages.push({ line: frame.line, kind: 'syntax', detail: '@keyframes' }); continue; }
        const written = declarations(frame.block, list, { ...base, picture: false, container: false, holdsTiles: false }, messages, MOVING);
        if (written.normal.length > 0) frames.push(`${stops.join(',')}{${written.normal.join(';')}}`);
      }
      const css = `@keyframes ${options.keyframes}-${name[0]!.value.toLowerCase()}{${frames.join('')}}`;
      dashboard.push(css);
      rest.push(css);
      continue;
    }
    messages.push({ line: rule.line, kind: 'at-rule', detail: `@${rule.name}` });
  }
  // keyframes only where something moves
  const moving = (sheet: string[]): string[] => (sheet.some((css) => !css.startsWith('@keyframes')) ? sheet : []);
  return { dashboard: moving(dashboard).join('\n'), rest: moving(rest).join('\n'), messages };
}
