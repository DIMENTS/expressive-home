// The check that keeps fixed visual values out of components.
/** @typedef {'colour' | 'length' | 'angle' | 'time' | 'easing' | 'type' | 'opacity' | 'radius' | 'layer' | 'transform' | 'interpolated'} Reason */
// Components take every colour, size, radius, type value and duration from theme variables;
// this module finds the declarations that do not.

const INTERPOLATED = '__interpolated__';

/**
 * The contents of every css`…` template in a TypeScript source, with each ${…} replaced by `__interpolated__`:
 * an inserted constant is a fixed value too, except in the condition of @media and @container (which is not checked).
 * @param {string} source
 * @returns {string[]}
 */
export function extractCss(source) {
  const found = [];
  const start = /\bcss`/g;
  let match;
  while ((match = start.exec(source)) !== null) {
    let i = match.index + match[0].length;
    let text = '';
    while (i < source.length && source[i] !== '`') {
      if (source[i] === '\\') { text += source.slice(i, i + 2); i += 2; continue; }
      if (source[i] === '$' && source[i + 1] === '{') {
        let depth = 1;
        i += 2;
        while (i < source.length && depth > 0) {
          if (source[i] === '{') depth += 1;
          else if (source[i] === '}') depth -= 1;
          i += 1;
        }
        text += INTERPOLATED;
        continue;
      }
      text += source[i];
      i += 1;
    }
    found.push(text);
    start.lastIndex = i + 1;
  }
  return found;
}

/** Every named colour of CSS (CSS Color 4); `transparent` and `currentColor` are allowed and not in it. */
const COLOUR_NAMES = [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black', 'blanchedalmond', 'blue', 'blueviolet', 'brown',
  'burlywood', 'cadetblue', 'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink', 'deepskyblue',
  'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lavenderblush',
  'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime',
  'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin',
  'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown',
  'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray',
  'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke',
  'yellow', 'yellowgreen',
];
// A name followed by "(" is a function (such as tan()), not a colour.
const COLOUR = new RegExp(String.raw`#[0-9a-f]{3,8}\b|(?<![\w-])(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(|(?<![\w-])(?:${COLOUR_NAMES.join('|')})(?![\w(-])`, 'i');
const LENGTH = /(?<![\w.-])-?(\d*\.?\d+)(?:px|rem|em|pt|ch|ex|vh|vw|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw|cqw|cqh|cqi|cqb|cqmin|cqmax)(?![\w-])/gi;
const ANGLE = /(?<![\w.-])-?(\d*\.?\d+)(?:deg|grad|rad|turn)(?![\w-])/gi;
const TIME = /(?<![\w.-])-?(\d*\.?\d+)(?:ms|s)(?![\w-])/gi;
const PERCENT = /(?<![\w.-])-?(\d*\.?\d+)%/g;
/** A number without a unit: not part of a word, a longer number or a percentage. */
const PLAIN_NUMBER = /(?<![\w.-])-?(\d*\.?\d+)(?![\w.%])/g;
const EASING = /cubic-bezier\(|steps\(|(?<![\w-])(?:ease|ease-in|ease-out|ease-in-out)(?![\w-])/i;
const TYPE_PROPERTIES = new Set(['font-weight', 'line-height', 'letter-spacing', 'font-family']);
/** Properties where a number without a unit is a visual amount (a scale, a brightness); only 0 and 1 are neutral. */
const AMOUNT_PROPERTIES = new Set(['transform', 'filter', 'backdrop-filter', 'scale']);
const isRadius = (property) => property === 'border-radius' || /^border-[\w-]*-radius$/.test(property);

/** True when one of the numbers the pattern finds is not zero. */
function hasNonZero(value, pattern) {
  for (const m of value.matchAll(pattern)) if (parseFloat(m[1]) !== 0) return true;
  return false;
}

/** The value with every var(…) reference, nested parentheses included, taken out. */
function withoutVariables(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    if (value.startsWith('var(', i)) {
      let depth = 0;
      for (; i < value.length; i += 1) {
        if (value[i] === '(') depth += 1;
        else if (value[i] === ')') { depth -= 1; if (depth === 0) break; }
      }
      continue;
    }
    out += value[i];
  }
  return out;
}

/** Why a declaration holds a fixed value, or null when it holds none. */
function reasonFor(property, rawValue) {
  // the names of variables are not values: --shape-2xl holds no length
  const value = rawValue.replace(/--[\w-]+/g, '');
  if (value.includes(INTERPOLATED)) return 'interpolated';
  if (COLOUR.test(value)) return 'colour';
  if (hasNonZero(value, LENGTH)) return 'length';
  if (hasNonZero(value, ANGLE)) return 'angle';
  if (hasNonZero(value, TIME)) return 'time';
  if (EASING.test(value)) return 'easing';
  // A percentage is fine for layout, but a radius or a flex share in percent is a fixed design choice.
  const percents = [...withoutVariables(rawValue).matchAll(PERCENT)].map((m) => parseFloat(m[1]));
  if (isRadius(property) && percents.some((n) => n !== 0)) return 'radius';
  if ((property === 'flex' || property === 'flex-basis') && percents.some((n) => n !== 0 && n !== 100)) return 'length';
  if (property === 'z-index' && [...withoutVariables(rawValue).matchAll(PLAIN_NUMBER)].some((m) => parseFloat(m[1]) !== 0)) return 'layer';
  if (AMOUNT_PROPERTIES.has(property)) {
    // A factor in calc() (twice the margin, half a size) is arithmetic, not a visual amount.
    const amountsOnly = withoutVariables(rawValue).replace(/\d*\.?\d+\s*[*/]|[*/]\s*\d*\.?\d+/g, '');
    const amounts = [...amountsOnly.matchAll(PLAIN_NUMBER)].map((m) => parseFloat(m[0]));
    if (amounts.some((n) => n !== 0 && n !== 1)) return 'transform';
  }
  if (TYPE_PROPERTIES.has(property)) {
    const rest = withoutVariables(rawValue).replace(/\b(?:inherit|normal|initial)\b/g, '').replace(/(?<![\w.])0(?![\w.])/g, '');
    if (rest.replace(/[\s,]/g, '') !== '') return 'type';
  }
  if (property === 'opacity') {
    const trimmed = rawValue.trim();
    if (trimmed !== '0' && trimmed !== '1' && /\d/.test(withoutVariables(trimmed))) return 'opacity';
  }
  return null;
}

/**
 * Every declaration in a piece of CSS that holds a fixed visual value. The conditions of @media and
 * @container are not checked: CSS cannot use variables there, and the breakpoints live in src/ui/breakpoints.ts.
 * @param {string} cssText
 * @returns {{ line: number; declaration: string; reason: Reason }[]}
 */
export function findFixedValues(cssText) {
  const text = cssText.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const found = [];
  let buffer = '';
  let bufferStart = 0;
  let line = 1;
  const flush = () => {
    const leading = buffer.match(/^\s*/)[0];
    const declaration = buffer.trim();
    const startLine = bufferStart + (leading.match(/\n/g)?.length ?? 0);
    buffer = '';
    const colon = declaration.indexOf(':');
    if (colon <= 0) return;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const reason = reasonFor(property, declaration.slice(colon + 1));
    if (reason) found.push({ line: startLine, declaration, reason });
  };
  for (const char of text) {
    if (buffer === '') bufferStart = line;
    if (char === '{') { buffer = ''; } // a selector or an at-rule condition: not a declaration
    else if (char === ';' || char === '}') flush();
    else buffer += char;
    if (char === '\n') line += 1;
  }
  flush();
  return found;
}

/** A unit right after a number or after an inserted expression: `12px`, `${WAVE}px`. */
const UNIT_IN_VALUE = /(?:\d|\})(?:px|rem|em|pt|ch|ex|vh|vw|vmin|vmax|dvh|cqw|cqh|cqi|cqb|ms|s|deg|turn|rad)(?![\w-])/;

/**
 * Every call that puts a value with a unit on an element through the CSSOM (`style.setProperty`). Such a
 * value is a fixed visual value as much as one in a stylesheet; a plain share or a seed carries no unit.
 * @param {string} source
 * @returns {{ line: number; call: string }[]}
 */
export function findFixedCssom(source) {
  const found = [];
  const call = /setProperty\(\s*(['"`])--[\w-]+\1\s*,\s*((?:[^()]|\([^()]*\))*)\)/g;
  for (const match of source.matchAll(call)) {
    if (!UNIT_IN_VALUE.test(match[2])) continue;
    found.push({ line: source.slice(0, match.index).split('\n').length, call: match[0] });
  }
  return found;
}
