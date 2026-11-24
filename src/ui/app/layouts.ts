import { tilesFor } from '../../dashboard/classify';
import { generateDashboard } from '../../dashboard/generate';
import { sectionId, type Dashboard, type Grouping, type SectionKind, type TileSpec } from '../../dashboard/types';
import { hubChoices } from '../../storage/layout-normalize';
import type { HomeySnapshot } from '../../homey/types';
import { boardFromDashboard, boardFromLayout, drawnTiles, type BoardView } from '../../layout/board';
import { applyEdit, newLayoutId, type LayoutEdit } from '../../layout/edit';
import { countDropped, layoutFileName, readLayoutFile, writeLayoutFile } from '../../layout/file';
import { everythingOn, freezeOverview } from '../../layout/freeze';
import { tileRefs } from '../../layout/refs';
import { reconcile, type GoneItem, type NewItem } from '../../layout/reconcile';
import { defaultHubLayout, OVERVIEW_ID, roomOfBoard, ROOMS_ID, type DashboardLayout, type HubLayout, type SectionLayout, type TileLayout } from '../../layout/types';
import { createUndoStack } from '../../layout/undo';
import { roomDashboard } from '../../rooms/rooms';
import { hasRooms, roomIdOf } from '../../rooms/zones';
import type { ThemeSettings } from '../../theme/types';
import { isLeftKind } from '../model/layout';

/** What the screen shows of the layouts. */
export interface LayoutState {
  /** The automatic dashboard of what the store has now. */
  dashboard: Dashboard | null;
  /** Of the hub in use; defaultHubLayout() when none is stored. */
  layout: HubLayout;
  /** The dashboard that is open; at the start the first in the rail. */
  boardId: string;
  board: BoardView | null;
  editing: boolean;
  /** There are rooms to speak of, and whether the screen with them is there. */
  hasRooms: boolean;
  roomsShown: boolean;
  canUndo: boolean;
  /** The number of the step that undo takes back now; null without one. */
  undoId: number | null;
  /** Empty while editing; news also while the Overzicht is automatic. */
  news: NewItem[];
  gone: GoneItem[];
}

export interface Appearance { theme: ThemeSettings; sectionSeeds: Record<string, string> }

export type ImportResult = { ok: false; reason: 'file' | 'offline' } | { ok: true; dropped: number; otherHub: boolean };

export interface LayoutsDeps {
  snapshot(): HomeySnapshot | null;
  locale(): string;
  appearance(): Appearance;
  /** Puts the theme and the colours back, or those of a file. */
  setAppearance(appearance: Appearance): void;
  /** The stored layout of a hub, when there is one. */
  stored(hubId: string): HubLayout | undefined;
  /** Keeps the layout of a hub; saving itself is the caller's. */
  store(hubId: string, layout: HubLayout): void;
  /** The dashboard this device starts with, when one was chosen. */
  startBoard(): string | null;
  /** The state changed. */
  publish(): void;
}

/** A step that can be undone: the layout before it and, after loading a file, the theme and colours before it. */
interface Step { id: number; layout: HubLayout; appearance: Appearance | null }

/** Edits of the sections of a dashboard: on the automatic Overzicht they freeze it first. */
const arranges = (edit: LayoutEdit): edit is Extract<LayoutEdit, { dashboardId: string }> =>
  'dashboardId' in edit && edit.type !== 'set-dashboard' && edit.type !== 'move-dashboard' && edit.type !== 'remove-dashboard';

/** A layout with the choices for the hub of another. */
function withChoices({ grouping: _grouping, rooms: _rooms, ...rest }: HubLayout, from: { grouping?: HubLayout['grouping'] | undefined; rooms?: HubLayout['rooms'] | undefined }): HubLayout {
  return { ...rest, ...hubChoices({ ...from }) };
}

/**
 * The layouts in the app controller: the layout of the hub in use, the dashboard that is open, the
 * edit mode and undo, and what the hub and the layout make of each other. Every change is kept at once.
 */
export function createLayouts(deps: LayoutsDeps) {
  /** Null: nothing is kept (the example hub, or no hub yet). */
  let hubId: string | null = null;
  let layout = defaultHubLayout();
  /** Nothing was stored yet, and nobody opened another dashboard: what comes begins where it should. */
  let provisional = false;
  let boardId: string = OVERVIEW_ID;
  let editing = false;
  let rooms = false;
  let dashboard: Dashboard | null = null;
  let board: BoardView | null = null;
  let news: NewItem[] = [];
  let gone: GoneItem[] = [];
  const undoSteps = createUndoStack<Step>();
  /** What the last step was part of: edits of one group, such as the letters of a name, are one step to undo. */
  let lastGroup: string | null = null;
  let stepIds = 0;

  const find = (id: string): DashboardLayout | undefined => layout.dashboards.find((d) => d.id === id);
  /** Where this device begins: the dashboard that was chosen for it, otherwise the first. */
  const first = (): string => {
    const start = deps.startBoard();
    return start !== null && canOpen(start) ? start : layout.dashboards[0]?.id ?? OVERVIEW_ID;
  };

  const roomsShown = (): boolean => layout.rooms !== false;
  /** A dashboard, the screen with the rooms, or a room. Before the hub answered nobody knows whether there are rooms. */
  function canOpen(id: string): boolean {
    if (find(id)) return true;
    const room = roomOfBoard(id);
    const snapshot = deps.snapshot();
    if ((id !== ROOMS_ID && room === null) || !roomsShown()) return false;
    if (!snapshot) return true;
    return hasRooms(snapshot) && (room === null || Object.values(snapshot.devices).some((device) => roomIdOf(device, snapshot) === room));
  }
  /** What stands there: never arranged by anyone, so made anew every time. */
  function viewOf(id: string, snapshot: HomeySnapshot): BoardView {
    const room = roomOfBoard(id);
    if (room === null) return { id, left: [], right: [] };
    const deviceIds = Object.values(snapshot.devices).filter((device) => roomIdOf(device, snapshot) === room).map((device) => device.id);
    return boardFromDashboard(roomDashboard({ deviceIds }, snapshot, deps.locale()), id);
  }
  const overviewIsOwn = (): boolean => find(OVERVIEW_ID)?.sections != null;

  /** The Overzicht as the app makes it: per kind of device, or per room. */
  const automatic = (snapshot: HomeySnapshot): Dashboard => generateDashboard(snapshot, { grouping: layout.grouping ?? 'type', locale: deps.locale() });

  function keep(next: HubLayout): void {
    layout = next;
    if (hubId !== null) deps.store(hubId, layout);
  }

  /**
   * Works out everything again from what the store has now; a layout the hub changed is kept. Not
   * `persist`: only here, for a layout of another tab. Two tabs that see the hub differently would else write to each
   * other without end.
   */
  function refresh(persist = true): void {
    const snapshot = deps.snapshot();
    rooms = snapshot !== null && hasRooms(snapshot);
    if (!canOpen(boardId)) boardId = roomOfBoard(boardId) !== null && canOpen(ROOMS_ID) ? ROOMS_ID : layout.dashboards[0]?.id ?? OVERVIEW_ID;
    if (!snapshot) {
      dashboard = null;
      board = null;
      news = [];
      gone = [];
      return;
    }
    dashboard = automatic(snapshot);
    const result = reconcile(layout, snapshot, deps.locale());
    if (result.changed && persist) keep(result.layout);
    else layout = result.layout;
    ({ news, gone } = result);
    const open = find(boardId);
    board = !open ? viewOf(boardId, snapshot) : open.sections === null ? boardFromDashboard(dashboard, open.id) : boardFromLayout(open, snapshot, deps.locale());
  }

  /** What is chosen for the whole hub; what stands as it would without a choice is not written down. */
  function choose(next: { [K in keyof HubLayout]: HubLayout[K] | undefined }): void {
    if (next.grouping === layout.grouping && next.rooms === layout.rooms) return;
    keep(withChoices(layout, next));
    refresh();
    deps.publish();
  }

  /** A new layout that can be undone; the same object is no change. */
  function commit(next: HubLayout, appearance: Appearance | null = null, group: string | null = null): void {
    if (next === layout) return;
    if (group === null || group !== lastGroup) undoSteps.push({ id: (stepIds += 1), layout, appearance });
    lastGroup = group;
    keep(next);
    refresh();
    deps.publish();
  }

  /** The layout with the Overzicht as an own one; as it is when it already is, or when there is nothing to freeze. */
  function frozen(): HubLayout {
    const snapshot = deps.snapshot();
    if (overviewIsOwn() || !snapshot) return layout;
    const { sections, known, names } = freezeOverview(automatic(snapshot), snapshot);
    return { ...layout, dashboards: layout.dashboards.map((d) => (d.id === OVERVIEW_ID ? { ...d, sections } : d)), known, names: { ...layout.names, ...names } };
  }

  /** A place among the tiles that are shown as a place among all tiles of the section: the hidden ones (6.2) keep theirs. */
  function placeAmongAll(base: HubLayout, change: Extract<LayoutEdit, { type: 'move-tile' }>): LayoutEdit {
    const snapshot = deps.snapshot();
    const target = base.dashboards.find((d) => d.id === change.dashboardId)?.sections?.find((s) => s.id === change.toSectionId);
    if (!snapshot || !target) return change;
    const others = target.tiles.filter((tile) => tile.id !== change.tileId);
    const before = drawnTiles(others, snapshot)[Math.max(0, change.index)]?.tile;
    return { ...change, index: before === undefined ? others.length : others.indexOf(before) };
  }

  function edit(change: LayoutEdit, group: string | null = null): void {
    const base = arranges(change) && change.dashboardId === OVERVIEW_ID ? frozen() : layout;
    const next = applyEdit(base, change.type === 'move-tile' ? placeAmongAll(base, change) : change);
    if (next !== base) commit(next, null, group);
  }

  /** The tiles the app itself would choose for something new, under ids of the layout. */
  function tilesForNew(ref: string, snapshot: HomeySnapshot): TileLayout[] {
    const item = news.find((n) => n.ref === ref);
    if (!item) return [];
    const device = item.kind === 'device' ? snapshot.devices[ref] : undefined;
    const flow = snapshot.flows.find((f) => item.kind === 'flow' && `flow:${f.id}` === ref);
    const specs: TileSpec[] = device ? tilesFor(device) : flow ? [{ kind: 'flow', id: ref, flowId: flow.id, flowKind: flow.kind, size: 'single' }] : [];
    return specs.map((spec) => {
      const id = newLayoutId('t');
      return { id, spec: { ...spec, id }, size: spec.size, label: null, icon: null, source: 'device' };
    });
  }

  /** The section of a kind on the Overzicht, made again in its usual column when it is gone. */
  function withSection(base: HubLayout, kind: SectionKind): HubLayout {
    const id = sectionId('type', kind);
    const section: SectionLayout = { id, kind, column: isLeftKind(kind) ? 'left' : 'right', name: null, icon: null, tiles: [], hero: null };
    return applyEdit(base, { type: 'add-section', dashboardId: OVERVIEW_ID, section, index: Infinity });
  }

  /** Puts something new on the Overzicht, in a section or (null) the suggested one. */
  function placeNew(ref: string, target: string | null, group: string | null = null): void {
    const snapshot = deps.snapshot();
    const item = news.find((n) => n.ref === ref);
    if (!snapshot || !item) return;
    const own = target ?? item.room?.sectionId ?? null;
    const base = own === null ? withSection(frozen(), item.suggest) : frozen();
    const placed = applyEdit(base, { type: 'add-tiles', dashboardId: OVERVIEW_ID, sectionId: own ?? sectionId('type', item.suggest), tiles: tilesForNew(ref, snapshot) });
    if (placed !== base) commit(applyEdit(placed, { type: 'know', refs: [ref] }), null, group);
  }

  function undo(): void {
    const step = undoSteps.pop();
    if (!step) return;
    lastGroup = null;
    const before = layout;
    // a file brought its own choices; otherwise they are not what is undone
    keep(step.appearance ? step.layout : withChoices(step.layout, layout));
    if (step.appearance) deps.setAppearance(step.appearance);
    // what is undone is seen: the dashboard it changes opens
    const changed = layout.dashboards.filter((d) => JSON.stringify(d) !== JSON.stringify(before.dashboards.find((other) => other.id === d.id)));
    if (changed.length > 0 && !changed.some((d) => d.id === boardId)) boardId = changed[0]!.id;
    refresh();
    deps.publish();
  }

  function importLayout(text: string): ImportResult {
    const file = readLayoutFile(text);
    const snapshot = deps.snapshot();
    if (!file) return { ok: false, reason: 'file' };
    if (!snapshot) return { ok: false, reason: 'offline' };
    const dropped = countDropped(file.dashboards, snapshot);
    const chosen = file.grouping === undefined && file.rooms === undefined ? layout : file;
    const read: HubLayout = withChoices({ dashboards: file.dashboards, ...everythingOn(snapshot) }, chosen);
    // What this hub does not have leaves at once, so it is not reported as gone as well.
    const away = reconcile(read, snapshot, deps.locale());
    const next = applyEdit(away.layout, { type: 'forget-gone', refs: away.gone.map((g) => g.ref) });
    const before = deps.appearance();
    deps.setAppearance({ theme: file.theme, sectionSeeds: file.sectionSeeds });
    boardId = next.dashboards[0]?.id ?? OVERVIEW_ID;
    editing = false;
    // what the file stands on is known too, also when it could not be chosen here
    const onBoards = next.dashboards.flatMap((d) => (d.sections ?? []).flatMap((section) => section.tiles.map((tile) => tileRefs(tile)[0]!)));
    commit({ ...next, known: [...new Set([...everythingOn(snapshot).known, ...onBoards])] }, before);
    return { ok: true, dropped, otherHub: hubId === null || file.homeyId.toLowerCase() !== hubId };
  }

  return {
    state: (): LayoutState => ({
      dashboard, layout, boardId, board, editing, hasRooms: rooms, roomsShown: roomsShown(), canUndo: undoSteps.size > 0, undoId: undoSteps.top?.id ?? null, news: editing ? [] : news, gone: editing ? [] : gone,
    }),
    refresh,
    edit, undo, placeNew, importLayout,
    /** The hub that is open now; null keeps nothing (the example hub). The same hub again keeps the edit mode and undo. */
    use(id: string | null): void {
      const next = id?.toLowerCase() ?? null;
      if (next === null || next !== hubId) {
        hubId = next;
        const stored = next === null ? undefined : deps.stored(next);
        provisional = next !== null && stored === undefined;
        layout = stored ?? defaultHubLayout();
        boardId = next === null ? layout.dashboards[0]?.id ?? OVERVIEW_ID : first();
        editing = false;
        undoSteps.clear();
        lastGroup = null;
      }
      refresh();
    },
    /**
     * The stored layout changed in another tab or on another device: taken over, what could be undone here is not any
     * more. With `always` a hub without a layout counts as one with the first.
     */
    adopt(always = false): void {
      const stored = hubId === null ? undefined : deps.stored(hubId) ?? (always ? defaultHubLayout() : undefined);
      if (!stored || JSON.stringify(stored) === JSON.stringify(layout)) return;
      const arranged = JSON.stringify([stored.dashboards, stored.grouping]) !== JSON.stringify([layout.dashboards, layout.grouping]);
      layout = stored;
      if (provisional) boardId = first();
      provisional = false;
      // only what the app keeps of names and devices: what can be undone here stays
      if (arranged) {
        undoSteps.clear();
        lastGroup = null;
      }
      refresh(false);
    },
    /** The dashboard is left: the edit mode ends. */
    leave(): void { editing = false; },
    openBoard(id: string): void {
      provisional = false;
      lastGroup = null;
      if (id === boardId || !canOpen(id)) return;
      boardId = id;
      editing = false;
      refresh();
      deps.publish();
    },
    /** The dashboard this device starts with; when its dashboards are still to come it stays to be seen which. */
    openStart(): void {
      const still = provisional;
      this.openBoard(first());
      provisional = still;
    },
    setEditing(on: boolean): void {
      lastGroup = null;
      if (on === editing || (on && !find(boardId))) return;
      editing = on;
      deps.publish();
    },
    /** The automatic Overzicht per kind of device, or per room. A setting: no step to undo. */
    setGrouping(grouping: Grouping): void { choose({ ...layout, grouping: grouping === 'zone' ? 'zone' : undefined }); },
    /** Whether the screen with the rooms is there. */
    setRooms(shown: boolean): void { choose({ ...layout, rooms: shown ? undefined : false }); },
    dismissNew(ref: string): void { commit(applyEdit(layout, { type: 'know', refs: [ref] })); },
    /** What is gone now: something can have come back since the notice was worked out. */
    acknowledgeGone(): void {
      refresh();
      commit(applyEdit(layout, { type: 'forget-gone', refs: gone.map((g) => g.ref) }));
      deps.publish();
    },
    resetOverview(): void {
      if (!overviewIsOwn()) return;
      commit({ ...layout, dashboards: layout.dashboards.map((d) => (d.id === OVERVIEW_ID ? { ...d, sections: null } : d)) });
    },
    /** Null when no hub is known yet: there is nothing to save. */
    exportLayout(now: Date): { fileName: string; text: string } | null {
      if (hubId === null && deps.snapshot() === null) return null;
      return { fileName: layoutFileName(now), text: writeLayoutFile({ homeyId: hubId ?? deps.snapshot()?.homeyId ?? '', ...deps.appearance(), layout }, now) };
    },
  };
}
