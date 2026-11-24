import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { extractCss, findFixedCssom, findFixedValues } from '../../tools/fixed-values.mjs';
import { EXCEPTIONS } from '../../tools/fixed-values-exceptions.mjs';

/** Every TypeScript file under src/ui, also in subfolders. */
function uiFiles(): string[] {
  return readdirSync('src/ui', { recursive: true }).map(String).filter((file) => file.endsWith('.ts')).map((file) => `src/ui/${file.split('\\').join('/')}`);
}

/** Every finding in src/ui, in stylesheets and through the CSSOM, with its file. */
function findings(): { file: string; line: number; declaration: string; reason: string }[] {
  return uiFiles().flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    const inCss = extractCss(source).flatMap((css) => findFixedValues(css).map((f) => ({ file, ...f })));
    const inCssom = findFixedCssom(source).map((f) => ({ file, line: f.line, declaration: f.call, reason: 'cssom' }));
    return [...inCss, ...inCssom];
  });
}

const excepted = (f: { file: string; declaration: string }) => EXCEPTIONS.some((e) => e.file === f.file && e.declaration === f.declaration);

test('no component under src/ui holds a fixed visual value', () => {
  const found = findings().filter((f) => !excepted(f)).map((f) => `${f.file}:${f.line} ${f.declaration} (${f.reason})`);
  expect(found).toEqual([]);
});

test('every exception is still needed and gives a reason', () => {
  const all = findings();
  for (const exception of EXCEPTIONS) {
    expect(all.some((f) => f.file === exception.file && f.declaration === exception.declaration), `${exception.file}: ${exception.declaration}`).toBe(true);
    expect(exception.reason.length, exception.declaration).toBeGreaterThan(10);
  }
});

test('the check sees the files under src/ui', () => {
  expect(uiFiles()).toContain('src/ui/breakpoints.ts');
  expect(uiFiles().length).toBeGreaterThan(5);
});
