import { parseWidgetFile, type WidgetFile } from './widget-file';

/** The own widgets of one house, with a number that goes up with every change. */
export interface WidgetsDoc { revision: number; widgets: WidgetFile[] }

export type WidgetOp = { add: WidgetFile } | { remove: string };

export const MAX_WIDGETS = 12;
const MAX_OPS = 20;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const emptyWidgetsDoc = (): WidgetsDoc => ({ revision: 0, widgets: [] });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The list after the operations: an added widget replaces one with its id in its place, or comes last while there is room. */
export function applyWidgetOps(doc: WidgetsDoc, ops: readonly WidgetOp[]): WidgetsDoc {
  let widgets = doc.widgets;
  for (const op of ops) {
    if ('remove' in op) {
      widgets = widgets.filter((widget) => widget.id !== op.remove);
    } else if (widgets.some((widget) => widget.id === op.add.id)) {
      widgets = widgets.map((widget) => (widget.id === op.add.id ? op.add : widget));
    } else if (widgets.length < MAX_WIDGETS) {
      widgets = [...widgets, op.add];
    }
  }
  return widgets === doc.widgets ? doc : { ...doc, widgets };
}

/** Operations as they come from a device, every widget checked like a file; null when any of them is wrong. */
export function parseWidgetOps(raw: unknown): WidgetOp[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_OPS) return null;
  const ops: WidgetOp[] = [];
  for (const entry of raw) {
    if (isRecord(entry) && typeof entry['remove'] === 'string' && ID.test(entry['remove'])) {
      ops.push({ remove: entry['remove'] });
      continue;
    }
    const parsed = isRecord(entry) ? parseWidgetFile(entry['add']) : null;
    if (!parsed?.ok) return null;
    ops.push({ add: parsed.widget });
  }
  return ops;
}

/** A stored list, every widget checked again; a broken or second one falls away. */
export function normalizeWidgetsDoc(raw: unknown): WidgetsDoc {
  if (!isRecord(raw)) return emptyWidgetsDoc();
  const revision = typeof raw['revision'] === 'number' && Number.isSafeInteger(raw['revision']) && raw['revision'] >= 0 ? raw['revision'] : 0;
  const seen = new Set<string>();
  const widgets = (Array.isArray(raw['widgets']) ? raw['widgets'] : []).flatMap((entry) => {
    const parsed = parseWidgetFile(entry);
    if (!parsed.ok || seen.has(parsed.widget.id)) return [];
    seen.add(parsed.widget.id);
    return [parsed.widget];
  }).slice(0, MAX_WIDGETS);
  return { revision, widgets };
}
