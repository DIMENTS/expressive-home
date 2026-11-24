// A QR code of a short text (ISO/IEC 18004): bytes, level M, versions 1 to 6. An address with a code fits easily,
// and nothing of it goes to anyone else to be drawn.

/** Per version: the blocks, the data words per block and the check words per block. */
const VERSIONS: readonly [count: number, data: number, check: number][] = [[1, 16, 10], [1, 28, 16], [1, 44, 26], [2, 32, 18], [2, 43, 24], [4, 27, 16]];
/** The mode and the length before the text. */
const HEAD_BITS = 12;
const FORMAT_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  EXP[i + 255] = x;
  LOG[x] = i;
  x = x < 128 ? x * 2 : (x * 2) ^ 0x11d;
}
const multiply = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

/** The check words of a block (Reed-Solomon). */
function checkWords(data: readonly number[], count: number): number[] {
  let generator = [1];
  for (let i = 0; i < count; i += 1) {
    const next = [...generator, 0];
    generator.forEach((factor, at) => { next[at + 1]! ^= multiply(factor, EXP[i]!); });
    generator = next;
  }
  const rest = [...data, ...Array<number>(count).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const lead = rest[i]!;
    if (lead !== 0) generator.forEach((factor, at) => { rest[i + at]! ^= multiply(factor, lead); });
  }
  return rest.slice(data.length);
}

/** The words of a text in the order in which they are drawn. */
function wordsOf(bytes: Uint8Array, [count, data, check]: readonly [number, number, number]): number[] {
  let bits = `0100${bytes.length.toString(2).padStart(8, '0')}${[...bytes].map((byte) => byte.toString(2).padStart(8, '0')).join('')}`;
  bits += '0'.repeat(Math.min(4, count * data * 8 - bits.length));
  bits += '0'.repeat((8 - (bits.length % 8)) % 8);
  const words = (bits.match(/.{8}/g) ?? []).map((word) => Number.parseInt(word, 2));
  for (let i = 0; words.length < count * data; i += 1) words.push(i % 2 === 0 ? 0xec : 0x11);
  const blocks = Array.from({ length: count }, (_, b) => words.slice(b * data, (b + 1) * data));
  const checks = blocks.map((block) => checkWords(block, check));
  return [
    ...Array.from({ length: data }, (_, i) => blocks.map((block) => block[i]!)).flat(),
    ...Array.from({ length: check }, (_, i) => checks.map((block) => block[i]!)).flat(),
  ];
}

const MASKS: readonly ((y: number, x: number) => boolean)[] = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (_y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/** The fifteen bits that tell the level (M, which is 00) and the mask. */
function formatOf(mask: number): number {
  let rest = mask << 10;
  for (let bit = 14; bit >= 10; bit -= 1) if ((rest >> bit) & 1) rest ^= FORMAT_GENERATOR << (bit - 10);
  return ((mask << 10) | rest) ^ FORMAT_MASK;
}

type Grid = (boolean | null)[][];

/** What is the same in every code of a size; null: room for the text. */
function pattern(size: number, mask: number): Grid {
  const grid: Grid = Array.from({ length: size }, () => Array<boolean | null>(size).fill(null));
  const put = (y: number, x: number, dark: boolean): void => { if (y >= 0 && x >= 0 && y < size && x < size) grid[y]![x] = dark; };
  for (let i = 0; i < size; i += 1) {
    put(6, i, i % 2 === 0);
    put(i, 6, i % 2 === 0);
  }
  for (const [cy, cx] of [[3, 3], [3, size - 4], [size - 4, 3]] as const) {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const ring = Math.max(Math.abs(dy), Math.abs(dx));
      put(cy + dy, cx + dx, ring !== 2 && ring !== 4);
    }
  }
  if (size > 21) {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) put(size - 7 + dy, size - 7 + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
  }
  const format = formatOf(mask);
  for (let i = 0; i < 15; i += 1) {
    const dark = ((format >> i) & 1) === 1;
    // once around the corner at the top left, once along the two others
    if (i < 6) put(i, 8, dark);
    else if (i < 8) put(i + 1, 8, dark);
    else if (i === 8) put(8, 7, dark);
    else put(8, 14 - i, dark);
    if (i < 8) put(8, size - 1 - i, dark);
    else put(size - 15 + i, 8, dark);
  }
  put(size - 8, 8, true);
  return grid;
}

/** How hard a code is to read; the lowest is chosen. */
function penalty(rows: readonly string[]): number {
  const size = rows.length;
  const columns = Array.from({ length: size }, (_, x) => rows.map((row) => row[x]!).join(''));
  let total = 0;
  for (const line of [...rows, ...columns]) {
    for (const run of line.match(/0{5,}|1{5,}/g) ?? []) total += run.length - 2;
    for (let i = 0; i + 11 <= size; i += 1) if (/^(?:10111010000|00001011101)$/.test(line.slice(i, i + 11))) total += 40;
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const here = rows[y]![x]!;
    if (here === '1') dark += 1;
    if (y + 1 < size && x + 1 < size && rows[y]![x + 1] === here && rows[y + 1]![x] === here && rows[y + 1]![x + 1] === here) total += 3;
  }
  return total + Math.floor(Math.abs((dark / (size * size)) * 20 - 10)) * 10;
}

/** The code with one of the eight masks. */
export function qrWithMask(text: string, mask: number): string[] {
  const bytes = new TextEncoder().encode(text);
  const version = VERSIONS.findIndex(([count, data]) => count * data * 8 - HEAD_BITS >= bytes.length * 8);
  if (version < 0) throw new RangeError('Too long for a code');
  const size = 21 + version * 4;
  const bits = wordsOf(bytes, VERSIONS[version]!).map((word) => word.toString(2).padStart(8, '0')).join('');
  const grid = pattern(size, mask);
  let at = 0;
  // in pairs of columns from the right, up and down in turn, past the column of the timing
  for (let pair = 0, right = size - 1; right > 0; pair += 1, right -= right === 8 ? 3 : 2) {
    for (let step = 0; step < size; step += 1) {
      const y = pair % 2 === 0 ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (grid[y]![x] !== null) continue;
        // a few squares remain when all bits are drawn
        grid[y]![x] = (bits[at] === '1') !== MASKS[mask]!(y, x);
        at += 1;
      }
    }
  }
  return grid.map((row) => row.map((dark) => (dark ? '1' : '0')).join(''));
}

/** The rows of the code, `1` for a dark square; the light edge of four squares around it is not in it. */
export function qrCode(text: string): string[] {
  return MASKS.map((_, mask) => qrWithMask(text, mask)).reduce((best, rows) => (penalty(rows) < penalty(best) ? rows : best));
}
