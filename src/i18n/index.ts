import { en } from './en';
import { nl } from './nl';

export type MessageKey = keyof typeof nl;
export type Language = 'nl' | 'en';

/** Looks up a text by key and fills its {name} placeholders; it knows its language and the locale for numbers and dates. */
export interface Translate {
  (key: MessageKey, params?: Record<string, string | number>): string;
  readonly language: Language;
  /** 'nl-NL' or 'en-GB'. */
  readonly locale: string;
}

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { nl, en };
const LOCALES: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB' };

/** A text with its placeholders filled; a placeholder without a value stays visible. */
function fill(messages: Record<MessageKey, string>, key: MessageKey, params?: Record<string, string | number>): string {
  const text = messages[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** A translate function for one language. */
export function createTranslate(language: Language): Translate {
  const translate = (key: MessageKey, params?: Record<string, string | number>) => fill(DICTIONARIES[language], key, params);
  return Object.assign(translate, { language, locale: LOCALES[language] });
}

/** A translate function whose language can change; the app passes it everywhere and calls setLanguage. */
export function createSwitchableTranslate(initial: Language): Translate & { setLanguage(language: Language): void } {
  let current = initial;
  const translate = (key: MessageKey, params?: Record<string, string | number>) => fill(DICTIONARIES[current], key, params);
  return Object.defineProperties(translate, {
    language: { get: () => current, enumerable: true },
    locale: { get: () => LOCALES[current], enumerable: true },
    setLanguage: { value: (language: Language) => { current = language; } },
  }) as Translate & { setLanguage(language: Language): void };
}

/** Dutch when the first browser language starts with 'nl', otherwise English; a saved choice wins. */
export function resolveLanguage(choice: Language | null, browserLanguages: readonly string[]): Language {
  if (choice) return choice;
  return browserLanguages[0]?.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

/** Dutch, for tests and the inspection page. */
export const t: Translate = createTranslate('nl');
