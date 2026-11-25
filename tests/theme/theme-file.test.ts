import { expect, test } from 'vitest';
import { BASES, BUILT_IN, KNOB_VALUES, RUSTIG_KNOBS, type ThemeFile } from '../../src/theme/look';
import { LIMITS_LOOKS, isOwnThemeId, newThemeId, parseThemeFile, valueCount } from '../../src/theme/theme-file';

const own = (more: Partial<ThemeFile> = {}): ThemeFile => ({
  format: 1, id: 't-0123456789abcdef', name: 'Avondlicht', maker: 'noorderlicht', base: 'glas', seed: '#3a5ba9', userSeed: false,
  knobs: { roundness: 'very-round', strength: 'vivid' }, app: '1.1.0', ...more,
});

test('a sound theme comes back the same, with nothing dropped', () => {
  const result = parseThemeFile(JSON.parse(JSON.stringify(own())));
  expect(result).toEqual({ ok: true, file: own(), dropped: [] });
});

test('the four built-in styles are themes with fixed ids and Rustig has no knobs of its own', () => {
  expect(BUILT_IN.map((file) => file.id)).toEqual([...BASES]);
  expect(BUILT_IN.map((file) => file.base)).toEqual([...BASES]);
  expect(BUILT_IN[0]!.knobs).toEqual({});
  expect(RUSTIG_KNOBS).toEqual({ roundness: 'round', strength: 'normal', contrast: 'normal', letter: 'sans', weight: 600, surfaces: 'solid', background: 'plain' });
});

test('a new id is own, unique enough and never a built-in one', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newThemeId()));
  expect(ids.size).toBe(200);
  for (const id of ids) expect(isOwnThemeId(id)).toBe(true);
  for (const base of BASES) expect(isOwnThemeId(base)).toBe(false);
});

test('what is no theme at all is refused, and a later format or base is too new', () => {
  for (const raw of [null, 3, 'theme', [], {}, { format: '1' }, { format: 0 }, { format: 1 }]) {
    expect(parseThemeFile(raw)).toEqual({ ok: false, reason: 'not-a-theme' });
  }
  expect(parseThemeFile({ ...own(), format: 2 })).toEqual({ ok: false, reason: 'too-new' });
  expect(parseThemeFile({ ...own(), base: 'neon' })).toEqual({ ok: false, reason: 'too-new' });
});

test('a theme larger than the limit is refused', () => {
  expect(parseThemeFile({ ...own(), maker: 'x'.repeat(LIMITS_LOOKS.fileBytes) })).toEqual({ ok: false, reason: 'too-big' });
});

test('every wrong value falls away on its own and is named', () => {
  const result = parseThemeFile({
    ...own(), id: 'rustig', name: 42, maker: ['x'], seed: 'red', userSeed: 'yes', app: '<b>',
    knobs: { roundness: 'oval', strength: 'vivid', weight: 650, letter: 'url(x)', glow: 'on' }, values: { 'tile-bg': '#fff' },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(isOwnThemeId(result.file.id)).toBe(true);
  expect(result.file).toMatchObject({ name: '', maker: '', seed: null, userSeed: true, app: '', knobs: { strength: 'vivid' } });
  expect(result.dropped.sort()).toEqual(['app', 'id', 'knobs.glow', 'knobs.letter', 'knobs.roundness', 'knobs.weight', 'maker', 'name', 'seed', 'userSeed', 'values'].sort());
});

test('names are trimmed, cut to the limit and lose control characters', () => {
  const result = parseThemeFile({ ...own(), name: `  Zee\u0000 ${'a'.repeat(100)}  ` });
  expect(result.ok && result.file.name.length).toBe(LIMITS_LOOKS.nameLength);
  expect(result.ok && result.file.name.startsWith('Zee a')).toBe(true);
});

test('keys that could reach the prototype stay out', () => {
  const raw = JSON.parse(`{"format":1,"id":"t-0123456789abcdef","name":"x","maker":"","base":"rustig","seed":null,"userSeed":true,"app":"","knobs":{"__proto__":{"polluted":1},"constructor":"x"},"__proto__":{"polluted":1}}`);
  const result = parseThemeFile(raw);
  expect(result.ok).toBe(true);
  expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  expect(result.ok && Object.keys(result.file.knobs)).toEqual([]);
});

test('the number of values counts what the theme sets', () => {
  expect(valueCount(own())).toBe(3);
  expect(valueCount(BUILT_IN[0]!)).toBe(0);
});

test('a thousand random objects never throw and always give values in range', () => {
  let state = 7;
  const random = (): number => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  const junk = (): unknown => pick([null, true, -1, 1e308, '', 'x', '#123456', '}', ';', 'url(a)', [], {}, 600, 'round', 'glas']);
  for (let i = 0; i < 1000; i += 1) {
    const raw: Record<string, unknown> = { format: pick([1, 1, 1, 2, '1']), id: junk(), name: junk(), maker: junk(), base: pick([...BASES, 'neon', junk()]), seed: junk(), userSeed: junk(), app: junk(), knobs: {} };
    for (const key of [...Object.keys(KNOB_VALUES), 'glow']) if (random() < 0.5) (raw['knobs'] as Record<string, unknown>)[key] = pick([junk(), ...((KNOB_VALUES as Record<string, readonly unknown[]>)[key] ?? [])]);
    const result = parseThemeFile(raw);
    if (!result.ok) continue;
    expect(BASES).toContain(result.file.base);
    expect(result.file.seed === null || /^#[0-9a-f]{6}$/i.test(result.file.seed)).toBe(true);
    for (const [key, value] of Object.entries(result.file.knobs)) expect((KNOB_VALUES as Record<string, readonly unknown[]>)[key]).toContain(value);
    expect(typeof result.file.name === 'string' && typeof result.file.maker === 'string' && typeof result.file.userSeed === 'boolean').toBe(true);
  }
});
