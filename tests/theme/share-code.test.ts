import { expect, test } from 'vitest';
import { KNOB_VALUES, type ThemeFile } from '../../src/theme/look';
import { fromFileText, fromShareCode, toFileText, toShareCode } from '../../src/theme/share-code';
import { LIMITS_LOOKS, newThemeId } from '../../src/theme/theme-file';

const theme = (more: Partial<ThemeFile> = {}): ThemeFile => ({
  format: 1, id: 't-0123456789abcdef', name: 'Avondlicht ☾ — Zee', maker: 'noorderlicht', base: 'glas', seed: '#3a5ba9', userSeed: false,
  knobs: { roundness: 'very-round', strength: 'vivid' }, app: '1.1.0', ...more,
});

test('a code starts with its format and has only letters, digits and a few signs', () => {
  const code = toShareCode(theme());
  expect(code).toMatch(/^EH1\.[A-Za-z0-9_-]+\.[0-9a-z]+$/);
});

test('a code and a file give back the same theme', () => {
  expect(fromShareCode(toShareCode(theme()))).toEqual({ ok: true, file: theme(), dropped: [] });
  expect(fromFileText(toFileText(theme()))).toEqual({ ok: true, file: theme(), dropped: [] });
});

test('a pasted code may have spaces and line breaks in it', () => {
  const code = toShareCode(theme());
  const pasted = `  ${code.slice(0, 20)}\n ${code.slice(20, 40)}\r\n${code.slice(40)}  `;
  expect(fromShareCode(pasted)).toEqual({ ok: true, file: theme(), dropped: [] });
});

test('half a code, or a code with one sign changed, is refused', () => {
  const code = toShareCode(theme());
  for (let cut = 1; cut < code.length; cut += 1) expect(fromShareCode(code.slice(0, cut)).ok).toBe(false);
  for (let at = 0; at < code.length; at += 1) {
    const changed = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1);
    if (changed !== code) expect(fromShareCode(changed).ok, `at ${at}`).toBe(false);
  }
  expect(fromShareCode(code.slice(0, -2))).toEqual({ ok: false, reason: 'damaged' });
});

test('a later format of code is too new, and what is no code at all is no theme', () => {
  expect(fromShareCode(toShareCode(theme()).replace(/^EH1/, 'EH2'))).toEqual({ ok: false, reason: 'too-new' });
  expect(fromShareCode('hello')).toEqual({ ok: false, reason: 'not-a-theme' });
  expect(fromFileText('{"format":')).toEqual({ ok: false, reason: 'not-a-theme' });
  expect(fromFileText('x'.repeat(LIMITS_LOOKS.fileBytes + 1))).toEqual({ ok: false, reason: 'too-big' });
});

test('a thousand random themes survive the trip', () => {
  let state = 11;
  const random = (): number => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!;
  for (let i = 0; i < 1000; i += 1) {
    const knobs: Record<string, unknown> = {};
    for (const [key, values] of Object.entries(KNOB_VALUES)) if (random() < 0.5) knobs[key] = pick(values as readonly unknown[]);
    const file = theme({ id: newThemeId(), name: String.fromCodePoint(...Array.from({ length: 1 + Math.floor(random() * 20) }, () => 0x41 + Math.floor(random() * 0x2000))).replace(/\s+/g, ' ').trim().slice(0, 60), base: pick(['rustig', 'uitbundig', 'glas', 'helder'] as const), knobs });
    const back = fromShareCode(toShareCode(file));
    expect(back.ok && back.file.knobs).toEqual(file.knobs);
    expect(back.ok && back.file.base).toBe(file.base);
  }
});
