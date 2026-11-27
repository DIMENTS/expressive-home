// The shared documents of the house without any way of transport: the layouts, the looks and the own widgets, with the
// right to arrange and the limits. The server at home and the door from outside both go through this, so both keep to the
// same rules; how a request comes in, and how an answer goes back, is theirs.
import { parseLookOps } from '../theme/look-ops';
import type { LooksDoc } from '../theme/looks-doc';
import { parseWidgetOps } from '../widgets/widget-library';
import type { WidgetsDoc } from '../widgets/widget-library';
import type { Role } from './pairing';
import type { SharedDocument, SharedLayouts } from './shared-layouts';
import type { SharedLooks } from './shared-looks';
import type { SharedWidgets } from './shared-widgets';

/** Why a change was not made: no right to arrange, not a change that can be read, or too much in all. */
export type Refusal = { error: 'role' | 'bad' | 'too-big' };

export interface Revisions { layouts: number; looks: number; rescue: number; widgets: number }

export function createDocuments(deps: { layouts: SharedLayouts; looks: SharedLooks; widgets: SharedWidgets }) {
  return {
    revisions(): Revisions {
      const looks = deps.looks.get();
      return { layouts: deps.layouts.get().revision, looks: looks.revision, rescue: looks.rescue, widgets: deps.widgets.get().revision };
    },
    layouts: (): SharedDocument => deps.layouts.get(),
    looks: (): LooksDoc => deps.looks.get(),
    widgets: (): WidgetsDoc => deps.widgets.get(),
    /** Saves the layouts of a page that knew `base`; when another saved in between, the document of now comes back. */
    putLayouts(role: Role, body: Record<string, unknown>): { ok: boolean; doc: SharedDocument } | Refusal {
      if (role !== 'edit') return { error: 'role' };
      return deps.layouts.put(typeof body['base'] === 'number' ? body['base'] : -1, body);
    },
    looksOps(role: Role, raw: unknown): { doc: LooksDoc } | Refusal {
      if (role !== 'edit') return { error: 'role' };
      const ops = parseLookOps(raw);
      if (!ops) return { error: 'bad' };
      if (!deps.looks.fits(ops)) return { error: 'too-big' };
      return { doc: deps.looks.apply(ops) };
    },
    widgetsOps(role: Role, raw: unknown): { doc: WidgetsDoc } | Refusal {
      if (role !== 'edit') return { error: 'role' };
      const ops = parseWidgetOps(raw);
      if (!ops) return { error: 'bad' };
      return { doc: deps.widgets.apply(ops) };
    },
  };
}

export type Documents = ReturnType<typeof createDocuments>;
