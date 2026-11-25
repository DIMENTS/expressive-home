import { applyWidgetOps, normalizeWidgetsDoc, type WidgetOp, type WidgetsDoc } from './widget-library';
import type { WidgetFile } from './widget-file';

/** What became of a change of the own widgets. */
export type WidgetChange = 'ok' | 'refused' | 'unreachable';

/** The own widgets of the open house, wherever they are kept. */
export interface WidgetLibrary {
  list(): WidgetFile[];
  change(ops: WidgetOp[]): Promise<WidgetChange>;
  /** Hears every change, also one made on another device or in another tab. */
  subscribe(listener: () => void): () => void;
}

interface LinkLike {
  on(type: 'open', listener: (value: { widgets?: number | null }) => void): () => void;
  on(type: 'widgets', listener: (value: { revision: number }) => void): () => void;
  request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown>;
}

const errorStatus = (error: unknown): number | null =>
  (typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null);

/** On a device served by the app on the hub: the widgets of the house, on the hub. */
export function createServedWidgets(link: LinkLike): WidgetLibrary {
  let doc: WidgetsDoc = { revision: -1, widgets: [] };
  const listeners = new Set<() => void>();
  const adopt = (next: WidgetsDoc): void => {
    if (next.revision === doc.revision && JSON.stringify(next) === JSON.stringify(doc)) return;
    doc = next;
    for (const listener of [...listeners]) listener();
  };
  const read = async (): Promise<void> => {
    try { adopt(normalizeWidgetsDoc(await link.request('GET', 'api/widgets'))); } catch { /* the next news reads again */ }
  };
  // a hub of an earlier version says nothing of widgets, and is not asked
  link.on('open', ({ widgets }) => { if (typeof widgets === 'number' && widgets !== doc.revision) void read(); });
  link.on('widgets', ({ revision }) => { if (revision !== doc.revision) void read(); });
  return {
    list: () => doc.widgets,
    async change(ops) {
      try {
        adopt(normalizeWidgetsDoc(await link.request('POST', 'api/widgets', { ops })));
        return 'ok';
      } catch (error) {
        const status = errorStatus(error);
        return status === 403 || status === 400 ? 'refused' : 'unreachable';
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const WIDGETS_KEY = 'dashboard.widgets';
const MAX_HUBS = 5;

type SimpleStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** In a browser with its own key: the widgets per hub, in this browser. */
export function createLocalWidgets(storage: SimpleStorage, hubId: () => string | null, target?: Pick<Window, 'addEventListener'>): WidgetLibrary {
  const listeners = new Set<() => void>();
  const all = (): Record<string, unknown> => {
    try {
      const raw: unknown = JSON.parse(storage.getItem(WIDGETS_KEY) ?? '{}');
      return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    } catch {
      return {};
    }
  };
  const docOf = (): WidgetsDoc => {
    const hub = hubId();
    return hub === null ? normalizeWidgetsDoc(null) : normalizeWidgetsDoc(Object.hasOwn(all(), hub) ? all()[hub] : null);
  };
  let cache: { hub: string | null; doc: WidgetsDoc } | null = null;
  const current = (): WidgetsDoc => {
    const hub = hubId();
    if (cache?.hub !== hub) cache = { hub, doc: docOf() };
    return cache.doc;
  };
  const tell = (): void => { for (const listener of [...listeners]) listener(); };
  target?.addEventListener('storage', (event) => { if ((event as StorageEvent).key === WIDGETS_KEY) { cache = null; tell(); } });
  return {
    list: () => current().widgets,
    async change(ops) {
      const hub = hubId();
      if (hub === null) return 'refused';
      const next = applyWidgetOps(current(), ops);
      const others = Object.entries(all()).filter(([id]) => id !== hub).slice(-(MAX_HUBS - 1));
      try {
        storage.setItem(WIDGETS_KEY, JSON.stringify(Object.fromEntries([...others, [hub, { ...next, revision: next.revision + 1 }]])));
      } catch {
        return 'refused';
      }
      cache = null;
      tell();
      return 'ok';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
