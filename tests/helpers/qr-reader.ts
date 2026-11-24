// Reads a QR code back, the way a camera does after it found the squares. It shares nothing with the maker of the codes:
// it checks every block with Reed-Solomon, and throws when something is not as the standard says.

/** Of versions 1 to 6 at level M: the blocks, the data words per block and the check words per block. */
const BLOCKS: Record<number, [count: number, data: number, check: number]> = { 1: [1, 16, 10], 2: [1, 28, 16], 3: [1, 44, 26], 4: [2, 32, 18], 5: [2, 43, 24], 6: [4, 27, 16] };
const FORMATS = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];
const MASKS: ((y: number, x: number) => boolean)[] = [
  (y, x) => (y + x) % 2 === 0, (y) => y % 2 === 0, (_y, x) => x % 3 === 0, (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0, (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0, (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

/** Multiplying in the field of 256, bit by bit. */
function times(a: number, b: number): number {
  let result = 0;
  for (let [x, y] = [a, b]; y > 0; y >>= 1) {
    if (y & 1) result ^= x;
    x = x & 0x80 ? (x << 1) ^ 0x11d : x << 1;
  }
  return result;
}

/** Whether a block is whole: it is zero at every root of its generator. */
function whole(words: number[], check: number): boolean {
  let root = 1;
  for (let i = 0; i < check; i += 1) {
    if (words.reduce((sum, word) => times(sum, root) ^ word, 0) !== 0) return false;
    root = times(root, 2);
  }
  return true;
}

/** Whether a square belongs to the pattern and not to the data. */
function fixed(size: number, y: number, x: number): boolean {
  const corner = (cy: number, cx: number): boolean => y >= cy && y < cy + 9 && x >= cx && x < cx + 9;
  if (y === 6 || x === 6 || corner(0, 0) || (y < 9 && x >= size - 8) || (x < 9 && y >= size - 8)) return true;
  return size > 21 && Math.abs(y - (size - 7)) <= 2 && Math.abs(x - (size - 7)) <= 2;
}

/** The mask of a code, from its format; both copies of the format have to agree. */
export function maskOf(rows: readonly string[]): number {
  const size = rows.length;
  const at = (y: number, x: number): number => Number(rows[y]![x]);
  let [first, second] = [0, 0];
  for (let i = 0; i < 15; i += 1) {
    // bit 14 first
    first = (first << 1) | (i < 6 ? at(8, i) : i === 6 ? at(8, 7) : i === 7 ? at(8, 8) : i === 8 ? at(7, 8) : at(14 - i, 8));
    second = (second << 1) | (i < 7 ? at(size - 1 - i, 8) : at(8, size - 15 + i));
  }
  if (first !== second) throw new Error('The two formats differ');
  const mask = FORMATS.indexOf(first);
  if (mask < 0) throw new Error('Not a format of level M');
  return mask;
}

export function readQr(rows: readonly string[]): string {
  const size = rows.length;
  const version = (size - 17) / 4;
  const blocks = BLOCKS[version];
  if (!blocks || rows.some((row) => row.length !== size || /[^01]/.test(row))) throw new Error('Not a code');
  const dark = (y: number, x: number): boolean => rows[y]![x] === '1';
  for (const [y, x] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
    for (let dy = -1; dy < 8; dy += 1) for (let dx = -1; dx < 8; dx += 1) {
      const [py, px] = [y + dy, x + dx];
      if (py < 0 || px < 0 || py >= size || px >= size) continue;
      const ring = Math.max(Math.abs(dy - 3), Math.abs(dx - 3));
      if (dark(py, px) !== (ring !== 2 && ring !== 4)) throw new Error(`No corner at ${y},${x}`);
    }
  }
  for (let i = 8; i < size - 8; i += 1) if (dark(6, i) !== (i % 2 === 0) || dark(i, 6) !== (i % 2 === 0)) throw new Error('No timing');
  if (size > 21) {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      if (dark(size - 7 + dy, size - 7 + dx) !== (Math.max(Math.abs(dy), Math.abs(dx)) !== 1)) throw new Error('No alignment');
    }
  }
  if (!dark(size - 8, 8)) throw new Error('No dark square');
  const mask = MASKS[maskOf(rows)]!;

  const bits: number[] = [];
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      const y = up ? size - 1 - step : step;
      for (const x of [right, right - 1]) if (!fixed(size, y, x)) bits.push(Number(dark(y, x) !== mask(y, x)));
    }
    up = !up;
  }
  const [count, data, check] = blocks;
  const words = Array.from({ length: count * (data + check) }, (_, i) => Number.parseInt(bits.slice(i * 8, i * 8 + 8).join(''), 2));
  const read: number[] = [];
  for (let b = 0; b < count; b += 1) {
    const own = Array.from({ length: data }, (_, i) => words[i * count + b]!);
    const proof = Array.from({ length: check }, (_, i) => words[data * count + i * count + b]!);
    if (!whole([...own, ...proof], check)) throw new Error(`Block ${b} is broken`);
    read.push(...own);
  }
  const stream = read.map((word) => word.toString(2).padStart(8, '0')).join('');
  if (stream.slice(0, 4) !== '0100') throw new Error('Not bytes');
  const length = Number.parseInt(stream.slice(4, 12), 2);
  const bytes = Array.from({ length }, (_, i) => Number.parseInt(stream.slice(12 + i * 8, 20 + i * 8), 2));
  return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
}
