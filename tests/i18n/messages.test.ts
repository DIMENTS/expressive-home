import { expect, test } from 'vitest';
import { createSwitchableTranslate, createTranslate, resolveLanguage, t } from '../../src/i18n';
import { nl } from '../../src/i18n/nl';
import { en } from '../../src/i18n/en';
import type { MessageKey } from '../../src/i18n';

test('placeholders are filled and every message is a non-empty string', () => {
  expect(t('count.on', { n: 3 })).toBe('3 aan');
  for (const [key, text] of Object.entries(nl)) expect([key, typeof text === 'string' && text.length > 0]).toEqual([key, true]);
});

test('a placeholder without a value stays visible instead of vanishing', () => {
  expect(t('tile.more')).toBe('Meer over {name}');
});

test('the keys other tasks rely on carry their texts', () => {
  expect(t('tile.join', { a: 'Aan', b: '80%' })).toBe('Aan · 80%');
  expect(t('chip.alarm', { device: 'Rookmelder', alarm: 'Rook' })).toBe('Rookmelder · Rook');
  expect(t('notify.controlFailed', { name: 'Plafond' })).toBe('Plafond reageerde niet.');
  expect(t('tank.of', { volume: '58', capacity: '90' })).toBe('58 van 90 liter');
});

test('a translate function knows its language and locale', () => {
  expect([t.language, t.locale]).toEqual(['nl', 'nl-NL']);
  const english = createTranslate('en');
  expect([english.language, english.locale]).toEqual(['en', 'en-GB']);
});

test('resolveLanguage', () => {
  expect(resolveLanguage(null, ['nl-NL', 'en'])).toBe('nl');
  expect(resolveLanguage(null, ['nl-BE'])).toBe('nl');
  expect(resolveLanguage(null, ['NL'])).toBe('nl');
  expect(resolveLanguage(null, ['de-DE', 'nl'])).toBe('en');
  expect(resolveLanguage(null, [])).toBe('en');
  expect(resolveLanguage('nl', ['en-GB'])).toBe('nl');
  expect(resolveLanguage('en', ['nl-NL'])).toBe('en');
});

test('a switchable translate follows setLanguage', () => {
  const translate = createSwitchableTranslate('nl');
  expect([translate.language, translate.locale]).toEqual(['nl', 'nl-NL']);
  const same = translate;
  translate.setLanguage('en');
  expect(same).toBe(translate);
  expect([translate.language, translate.locale]).toEqual(['en', 'en-GB']);
  translate.setLanguage('nl');
  expect(translate('count.on', { n: 3 })).toBe('3 aan');
});

test('every key has the same placeholders in both languages', () => {
  for (const key of Object.keys(nl) as MessageKey[]) {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(names(en[key]), key).toEqual(names(nl[key]));
    expect(en[key].trim(), key).not.toBe('');
  }
  expect(Object.keys(en).sort()).toEqual(Object.keys(nl).sort());
});

test('bold parts stay balanced in English', () => {
  for (const [key, text] of Object.entries(en)) expect([key, (text.match(/\*\*/g) ?? []).length % 2]).toEqual([key, 0]);
});

test('English is a language of its own', () => {
  const english = createTranslate('en');
  expect(english('count.on', { n: 2 })).toBe('2 on');
  expect(english('hero.timeLeft', { duration: '2 days and 4 hours' })).toBe('About 2 days and 4 hours left');
  expect(english('settings.disconnectHelp')).toBe('Removes the key from this browser. Your theme and layout are kept.');
});
