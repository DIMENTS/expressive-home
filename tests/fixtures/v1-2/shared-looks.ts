// Release 1.2.0 of this module, kept as it was: newer themes must survive the code that is already out there.
import { createTranslate, type Language, type MessageKey } from '../../../src/i18n';
import { DEFAULT_HOUSE } from '../../../src/theme/choose';
import { BUILT_IN, isBase } from '../../../src/theme/look';
import { applyLookOps, type LookOp } from './look-ops';
import { normalizeLooksDoc, withinTotal, type LooksDoc } from './looks-doc';
import type { ModePreference } from '../../../src/theme/types';

/** A theme to choose in a flow card. */
export interface ThemeChoice { id: string; name: string }

/**
 * The looks of the house on the hub: the house's theme, the themes of the house and the dashboards with a theme of their
 * own. Kept apart from the layouts, with a number of their own, so a page of 1.0.0 that saves layouts never touches them.
 * Changes come as operations that the hub applies itself: two devices that change something at once both get their way.
 */
export function createSharedLooks(deps: { load(): unknown; save(doc: LooksDoc): void }) {
  let doc: LooksDoc = normalizeLooksDoc(deps.load());
  const listeners = new Set<(revision: number, reset: boolean) => void>();

  function commit(next: LooksDoc, reset = false): LooksDoc {
    if (!reset && JSON.stringify(next) === JSON.stringify(doc)) return doc;
    doc = { ...next, revision: doc.revision + 1 };
    deps.save(doc);
    for (const listener of [...listeners]) listener(doc.revision, reset);
    return doc;
  }

  return {
    get: (): LooksDoc => doc,
    apply: (ops: readonly LookOp[]): LooksDoc => commit(applyLookOps(doc, ops)),
    /** Whether these changes keep all themes together within the limit. */
    fits: (ops: readonly LookOp[]): boolean => withinTotal(doc, applyLookOps(doc, ops)),
    /** The built-in styles and the house's themes whose name holds what was typed, named in the language of the hub. */
    choices(query: string, language: Language = 'en'): ThemeChoice[] {
      const t = createTranslate(language);
      const wanted = query.trim().toLowerCase();
      return [...BUILT_IN, ...doc.themes]
        .map((file) => ({ id: file.id, name: isBase(file.id) ? t(`theme.style.${file.id}` as MessageKey) : file.name || t('theme.unnamed') }))
        .filter((choice) => choice.name.toLowerCase().includes(wanted));
    },
    /** False when that theme is not there (any more). */
    setHouseTheme(id: string): boolean {
      if (![...BUILT_IN, ...doc.themes].some((file) => file.id === id)) return false;
      commit(applyLookOps(doc, [{ house: { theme: id } }]));
      return true;
    },
    setHouseMode(mode: ModePreference): void {
      commit(applyLookOps(doc, [{ house: { mode } }]));
    },
    /**
     * "Alle apparaten weer in Rustig": the house and the dashboards; the number of rescues goes up, so every device
     * follows the house again as soon as it sees it, also one that is away or closed now.
     */
    reset(): LooksDoc {
      return commit({ ...doc, house: { ...DEFAULT_HOUSE }, boards: {}, rescue: doc.rescue + 1 }, true);
    },
    subscribe(listener: (revision: number, reset: boolean) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type SharedLooks = ReturnType<typeof createSharedLooks>;
