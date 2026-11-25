import { applyWidgetOps, normalizeWidgetsDoc, type WidgetOp, type WidgetsDoc } from '../widgets/widget-library';

/**
 * The own widgets of the house on the hub, apart from the layouts and with a number of their own: a page that saves
 * layouts never touches them, and their code does not travel with every change of a layout.
 */
export function createSharedWidgets(deps: { load(): unknown; save(doc: WidgetsDoc): void }) {
  let doc: WidgetsDoc = normalizeWidgetsDoc(deps.load());
  const listeners = new Set<(revision: number) => void>();

  return {
    get: (): WidgetsDoc => doc,
    apply(ops: readonly WidgetOp[]): WidgetsDoc {
      const next = applyWidgetOps(doc, ops);
      if (next === doc) return doc;
      doc = { ...next, revision: doc.revision + 1 };
      deps.save(doc);
      for (const listener of [...listeners]) listener(doc.revision);
      return doc;
    },
    subscribe(listener: (revision: number) => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type SharedWidgets = ReturnType<typeof createSharedWidgets>;
