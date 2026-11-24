import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// What the Homey App Store shows of the app, held to what it asks of it.

const read = (path: string): string => readFileSync(`homey-app/${path}`, 'utf8').replaceAll('\r\n', '\n');
const manifest = JSON.parse(read('app.json')) as {
  version: string; description: Record<string, string>; name: Record<string, string>; tags: Record<string, string[]>; category: string; permissions: string[]; platforms: string[]; brandColor: string; images: Record<string, string>;
};
const LANGUAGES = ['en', 'nl'] as const;
const readme = { en: read('README.txt'), nl: read('README.nl.txt') };

test('the description is one line that says what the app is for', () => {
  for (const language of LANGUAGES) {
    const text = manifest.description[language]!;
    expect(text).not.toMatch(/expressive|homey|[.!]$|\n/i);
    expect(text.length).toBeGreaterThan(20);
    expect(text.length).toBeLessThan(80);
    // not once more in the text below it
    expect(readme[language].toLowerCase()).not.toContain(text.toLowerCase());
  }
  expect(Object.keys(manifest.description)).toEqual([...LANGUAGES]);
});

test('the text is one or two short paragraphs, without an address, a list or marks', () => {
  for (const language of LANGUAGES) {
    const paragraphs = readme[language].trim().split(/\n{2,}/);
    expect(paragraphs.length).toBeLessThanOrEqual(2);
    expect(readme[language].length).toBeLessThan(900);
    expect(readme[language]).not.toMatch(/https?:|www\.|\.(?:com|app|nl)\b|^[-*#>]|\*\*|\x60|\[.*\]\(/m);
  }
});

test('the version is the same everywhere, and the store is told what is new in both languages', () => {
  const versions = ['app.json', 'package.json', 'package-lock.json', '../package.json', '../package-lock.json'].map((path) => (JSON.parse(read(path)) as { version: string }).version);
  expect(new Set(versions)).toEqual(new Set([manifest.version]));
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  const news = (JSON.parse(read('.homeychangelog.json')) as Record<string, Record<string, string>>)[manifest.version]!;
  for (const language of LANGUAGES) expect(news[language]!.length).toBeGreaterThan(10);
});

test.each([['small', 250, 175], ['large', 500, 350], ['xlarge', 1000, 700]] as const)('the picture %s is %i by %i', (name, width, height) => {
  const file = readFileSync(`homey-app${manifest.images[name]}`);
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([width, height]);
  // a real picture, no flat shapes
  expect(file.length).toBeGreaterThan(width * height * 0.1);
});

test('the icon is a drawing on a canvas of 960, without a background', () => {
  const icon = read('assets/icon.svg');
  expect(icon).toMatch(/viewBox="0 0 960 960"/);
  expect(icon).not.toMatch(/<image|gradient|<style|<rect[^>]*width="(?:960|100%)"/i);
});

test('the app asks for what it needs, where it may be asked', () => {
  expect([manifest.category, manifest.permissions, manifest.platforms]).toEqual(['tools', ['homey:manager:api'], ['local']]);
  for (const language of LANGUAGES) expect(manifest.tags[language]!.length).toBeGreaterThan(2);
  expect(existsSync('homey-app/.homeyignore')).toBe(true);
});

test('the text ends with what it runs on', () => {
  expect(readme.en.trim().endsWith('For Homey Pro.')).toBe(true);
  expect(readme.nl.trim().endsWith('Voor Homey Pro.')).toBe(true);
});
