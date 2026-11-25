import type { HubLayout } from '../layout/types';
import { normalizeLayouts } from '../storage/layout-normalize';
import { keepWidgets, knowsWidgets } from '../layout/keep-widgets';
import { normalizeSectionSeeds } from '../storage/local-store';

/** What every paired device shares: the dashboards and the colours per section, with the number of this version. */
export interface SharedDocument { revision: number; layouts: Record<string, HubLayout>; sectionSeeds: Record<string, string> }

export type PutResult = { ok: boolean; doc: SharedDocument };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The layout version that section colours are read as: they are kept by section id. */
const SEEDS_VERSION = 3;

const contents = (raw: unknown): Omit<SharedDocument, 'revision'> => {
  const record = isRecord(raw) ? raw : {};
  return { layouts: normalizeLayouts(record['layouts']), sectionSeeds: normalizeSectionSeeds(record['sectionSeeds'], SEEDS_VERSION) };
};

/**
 * The layouts on the hub. A device saves on the revision it has; when another device saved in the meantime
 * it is refused and gets what there is now. What comes in goes through the checks of the storage of a browser.
 */
export function createSharedLayouts(deps: { load(): unknown; save(doc: SharedDocument): void }) {
  const stored = deps.load();
  const revision = isRecord(stored) && typeof stored['revision'] === 'number' && Number.isSafeInteger(stored['revision']) && stored['revision'] > 0 ? stored['revision'] : 0;
  let doc: SharedDocument = { revision, ...contents(stored) };
  const listeners = new Set<(revision: number) => void>();

  return {
    get: (): SharedDocument => doc,
    put(base: number, raw: unknown): PutResult {
      if (base !== doc.revision) return { ok: false, doc };
      const read = contents(raw);
      // a page of a version without widgets never drops them
      const next = knowsWidgets(raw) ? read : { ...read, layouts: keepWidgets(read.layouts, doc.layouts) };
      if (JSON.stringify([next.layouts, next.sectionSeeds]) === JSON.stringify([doc.layouts, doc.sectionSeeds])) return { ok: true, doc };
      doc = { revision: doc.revision + 1, ...next };
      deps.save(doc);
      for (const listener of [...listeners]) listener(doc.revision);
      return { ok: true, doc };
    },
    /** Hears of every new revision. */
    subscribe(listener: (revision: number) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type SharedLayouts = ReturnType<typeof createSharedLayouts>;
