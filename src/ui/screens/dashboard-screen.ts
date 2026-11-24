import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { rustigExpressive } from '../../theme/rustig-expressive';
import { repeat } from 'lit/directives/repeat.js';
import { sectionId, type Section, type SectionKind, type TileSpec } from '../../dashboard/types';
import { isButton } from '../../homey/buttons';
import { shownColumns, type Block, type BoardView } from '../../layout/board';
import type { LayoutEdit } from '../../layout/edit';
import type { GoneItem, NewItem } from '../../layout/reconcile';
import { OVERVIEW_ID, type Column, roomBoardId, ROOMS_ID } from '../../layout/types';
import type { Room } from '../../rooms/rooms';
import type { Mode, ShownDensity } from '../../theme/types';
import { ALARM_DANGER } from '../../recognition/table';
import type { UiContext } from '../app/context';
import { COLUMNS_MIN_PX, PHONE_MAX_PX } from '../breakpoints';
import { applySectionTheme } from '../apply-theme';
import { headerChips } from '../model/header-view';
import { sectionTitle, shownSectionIcon } from '../model/layout';
import type { Slot } from '../model/drop';
import { flowView, tileView } from '../model/tile-view';
import { pixels } from '../pixels';
import { attachDrag, type DragHost, type DropResult } from '../parts/drag';
import type { IconName } from '../icons/icons';
import { sharedStyles } from '../parts/shared-styles';
import { createTile } from '../tiles/registry';
import type { DimDetail } from '../tiles/light-tile';
import type { MenuGroup } from '../parts/menu';
import { addSlotStyles } from './add-slot';
import { moveToGroups, tileMenuGroups, type SectionAction, type SectionPlace } from './edit-menus';
import type { MhHero } from './hero';
import type { RailBoard } from './rail';
import type { DropPlace, MhSection, TileHost } from './section';
import '../parts/banner';
import '../parts/button';
import '../parts/dimmer';
import '../parts/empty-state';
import '../parts/menu';
import type { MhMenu } from '../parts/menu';
import './edit-bar';
import './header';
import './hero';
import './news-card';
import type { PlaceOption } from './news-card';
import './nav-bar';
import './rail';
import './room-card';
import './rooms-screen';
import './section';
import './skeleton';

/** How long a dimmer takes to shrink back to its tile (motion-effects). */
export const DIM_CLOSE_MS = 200;

/**
 * The dashboard screen: the rail, the bar at the top when the
 * connection is gone or back, the header, and then the skeleton, an empty state or the blocks of the open
 * dashboard (a BoardView) in two columns (7 to 5) from COLUMNS_MIN_PX wide. While editing, the edit bar is
 * at the top and every column ends with "Sectie toevoegen"; the menus of tiles and sections report `layout-edit`,
 * and a move is announced for screen readers. Tiles and sections can be dragged (8.4); this element is what the
 * dragging measures and shows its empty place on.
 */
export class MhDashboard extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    board: { attribute: false },
    boards: { attribute: false },
    rooms: { attribute: false },
    room: { attribute: false },
    boardName: { type: String },
    boardIcon: { type: String },
    boardMenu: { attribute: false },
    editing: { type: Boolean },
    canUndo: { type: Boolean },
    firstTime: { type: Boolean },
    phase: { type: String },
    emptyReason: { type: String },
    banner: { type: String },
    density: { type: String },
    connecting: { type: Boolean },
    activePanel: { type: String },
    sectionSeeds: { attribute: false },
    mode: { type: String },
    baseSeed: { attribute: false },
    freshTiles: { attribute: false },
    news: { attribute: false },
    gone: { attribute: false },
    nameOfBoard: { attribute: false },
    tileMenu: { state: true },
    drag: { state: true },
    dragging: { type: Boolean, reflect: true },
    announcement: { state: true },
    dim: { state: true },
  };

  declare ctx: UiContext;
  /** The open dashboard. */
  declare board: BoardView | null;
  /** Every dashboard, for the rail. */
  declare boards: RailBoard[];
  /** Every room, for the screen with them, and the room that is open. */
  declare rooms: Room[];
  declare room: Room | null;
  declare boardName: string;
  declare boardIcon: IconName;
  /** The menu of the dashboard in the edit bar. */
  declare boardMenu: MenuGroup[];
  declare editing: boolean;
  declare canUndo: boolean;
  /** The Overzicht is still automatic: the first change makes it an own one. */
  declare firstTime: boolean;
  declare phase: 'loading' | 'ready' | 'unreachable';
  declare emptyReason: 'none' | 'no-devices' | 'no-right';
  declare banner: 'none' | 'offline' | 'restored' | 'update';
  declare density: ShownDensity;
  declare connecting: boolean;
  declare activePanel: 'none' | 'theme' | 'settings';
  /** The own colour per section id; a section that is not in it follows the dashboard. */
  declare sectionSeeds: Record<string, string>;
  /** Light or dark as shown now, for the sections with their own palette. */
  declare mode: Mode;
  /** The dashboard's colour. */
  declare baseSeed: string;
  /** What is new on the hub and what is gone; shown on the Overzicht only, not while editing. */
  declare news: NewItem[];
  declare gone: GoneItem[];
  /** The name of a dashboard by its id, for the notices. */
  declare nameOfBoard: (id: string) => string;
  /** The tiles that were just added: they light up for a moment (5.4). */
  declare freshTiles: readonly string[];
  /** What is being dragged, its height, and where it would land. */
  declare drag: { kind: 'tile' | 'section'; id: string; height: number; target: DropResult | null } | null;
  declare dragging: boolean;
  private stopDrag: (() => void) | null = null;
  /** The tile whose menu is open; `to`: its list of sections to move to. */
  declare tileMenu: { tileId: string; to: boolean } | null;
  /** What a screen reader hears after a move. */
  declare announcement: string;
  /** The lamp tile that is held and dimmed. */
  declare dim: (DimDetail & { closing: boolean }) | null;
  private dimTimer: ReturnType<typeof setTimeout> | null = null;
  /** What was just moved: once it is drawn it is announced and, after a menu, gets the focus. */
  private moved: { kind: 'tile' | 'section'; id: string; focus: boolean } | null = null;
  /** The focus is in the edit bar. */
  private barFocused = false;
  /** The edit bar had the focus and goes: it moves to "Bewerken". */
  private leftBar = false;
  private listening: (() => void)[] = [];
  /** The elements of sections, heroes and tiles by id: they stay when they move. */
  private sections = new Map<string, MhSection>();
  private heroes = new Map<string, MhHero>();
  private tiles = new Map<string, TileHost>();

  constructor() {
    super();
    this.board = null;
    this.boards = [];
    this.rooms = [];
    this.room = null;
    this.boardName = '';
    this.boardIcon = 'dashboard';
    this.boardMenu = [];
    this.editing = false;
    this.canUndo = false;
    this.firstTime = false;
    this.tileMenu = null;
    this.announcement = '';
    this.dim = null;
    this.freshTiles = [];
    this.news = [];
    this.gone = [];
    this.nameOfBoard = () => '';
    this.drag = null;
    this.dragging = false;
    this.phase = 'loading';
    this.emptyReason = 'none';
    this.banner = 'none';
    this.density = 'comfortable';
    this.connecting = false;
    this.activePanel = 'none';
    this.sectionSeeds = {};
    this.mode = 'light';
    this.baseSeed = rustigExpressive.color.defaultSeed;
  }

  static override styles = [sharedStyles, addSlotStyles, css`
    :host { display: block; }
    /* the rest screen lies over it: nothing of it is drawn, and nothing in it moves */
    :host([resting]) { content-visibility: hidden; }
    .app { display: grid; grid-template-columns: var(--rail-width) minmax(0, 1fr); max-width: var(--page-max-width); margin: 0 auto; padding: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left); }
    main { padding: var(--page-pad) var(--page-pad) calc(var(--space-40) + var(--space-32)) var(--space-8); min-width: 0; outline: none; position: relative; }
    .col > .placeholder { border-radius: var(--section-radius); }
    :host([dragging]) { cursor: grabbing; user-select: none; }
    .lifted {
      position: fixed; z-index: var(--layer-drag); left: var(--_left); top: var(--_top); width: var(--_width); height: var(--_height); pointer-events: none;
      transform: translate(var(--_dx, 0), var(--_dy, 0)) scale(var(--drag-lift-scale)); border-radius: var(--tile-radius); box-shadow: var(--drag-shadow);
    }
    .lifted > * { width: 100%; height: 100%; }
    .lifted.bar {
      display: flex; align-items: center; gap: var(--space-8); padding: 0 var(--section-pad); border-radius: var(--section-radius); background: var(--section-bg); color: var(--section-fg);
      font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); --icon-size: var(--type-title-size);
    }
    .lifted.bar > * { width: auto; height: auto; }
    .lifted.bar > mh-icon { width: var(--icon-size); height: var(--icon-size); }
    @media (prefers-reduced-motion: reduce) { .lifted { transform: translate(var(--_dx, 0), var(--_dy, 0)); } }
    .menu-anchor { position: absolute; top: var(--_top); right: var(--_right); z-index: var(--layer-menu); margin-top: var(--space-4); }
    mh-banner { margin-bottom: var(--space-20); }
    .cols { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: var(--section-gap); align-items: start; }
    :host([editing]) .cols { user-select: none; }
    @media (width < ${COLUMNS_MIN_PX}px) {
      .cols { grid-template-columns: minmax(0, 1fr); }
      :host(:not([dragging])) .col.empty { display: none; }
    }
    @media (width < ${PHONE_MAX_PX}px) {
      .app { grid-template-columns: minmax(0, 1fr); }
      main { padding: max(var(--page-pad), env(safe-area-inset-top)) var(--page-pad) calc(var(--nav-bar-height) + env(safe-area-inset-bottom) + var(--space-24)); }
    }
    .col { display: grid; align-content: start; gap: var(--section-gap); min-width: 0; }
    .col > .add-slot { min-height: var(--edit-bar-height); border-radius: var(--section-radius); }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopListening();
    this.endDrag();
    this.endDim();
  }

  private stopListening(): void {
    for (const stop of this.listening) stop();
    this.listening = [];
  }

  /** The header's alarm labels must follow live changes: listen to the structure and to devices that can raise a danger alarm. */
  private listen(): void {
    this.stopListening();
    if (!this.ctx || !this.isConnected) return;
    const redraw = () => this.requestUpdate();
    const watched = this.ctx.store.getDevices()
      .filter((d) => d.capabilityOrder.some((id) => ALARM_DANGER.includes(d.capabilities[id]?.baseId ?? '')))
      .map((d) => this.ctx.store.subscribeDevice(d.id, redraw));
    this.listening = [this.ctx.store.subscribeStructure(() => { this.listen(); redraw(); }), ...watched];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('ctx')) this.listen();
    if (changed.has('editing')) {
      this.leftBar = !this.editing && this.barFocused;
      this.moved = null;
    }
    if (changed.has('board')) this.forgetGone();
    // the hub changed: what is dragged is not there any more
    if (this.drag && !(this.drag.kind === 'tile' ? this.findTile(this.drag.id) : this.placeOf(this.drag.id))) this.endDrag();
    if (this.dim && (changed.has('density') || !this.findTile(this.dim.tileId))) this.endDim();
    if (this.tileMenu && (!this.editing || !this.tiles.has(this.tileMenu.tileId))) this.tileMenu = null;
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('room') && this.room !== null && this.room.id === this.leftRoom) {
      void this.updateComplete.then(() => this.shadowRoot?.querySelector('mh-room-head')?.updateComplete).then(() => this.shadowRoot?.querySelector('mh-room-head')?.focus({ preventScroll: true }));
    }
    // left another way than back: the rooms begin at their start
    if (changed.has('board') && !this.goingBack && this.leftRoom !== null && this.room?.id !== this.leftRoom) this.leftRoom = null;
    if (changed.has('board') && this.board?.id === ROOMS_ID && this.goingBack && this.leftRoom !== null) {
      const id = this.leftRoom;
      this.leftRoom = null;
      this.goingBack = false;
      void this.updateComplete.then(() => this.shadowRoot?.querySelector('mh-rooms')?.updateComplete).then(() => this.shadowRoot?.querySelector('mh-rooms')?.focusRoom(id));
    }
    if (this.tileMenu) this.placeTileMenu(this.tileMenu.tileId);
    if (changed.has('board') && this.moved) void this.announceMove(this.moved);
    this.attachDrag();
    if (this.leftBar) {
      this.leftBar = false;
      this.barFocused = false;
      this.shadowRoot?.querySelector('mh-rail')?.focusEdit();
    }
    if (changed.has('freshTiles')) void this.showFresh();
  }

  /** A tile that was just added is brought into view. */
  private async showFresh(): Promise<void> {
    const id = this.freshTiles[0];
    if (id === undefined) return;
    await Promise.all([...this.sections.values()].map((section) => section.updateComplete));
    this.tiles.get(id)?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Dragging works only in the edit mode, on a board that is shown. */
  private attachDrag(): void {
    const wanted = this.editing && this.phase === 'ready' && this.board !== null;
    if (!wanted) this.endDrag();
    const main = this.shadowRoot?.querySelector<HTMLElement>('main');
    if (wanted && !this.stopDrag && main) this.stopDrag = attachDrag(main, this.dragHost, (result) => this.onDrop(result));
  }

  /** Ends a drag that is going on and stops listening; updated() listens again while editing. */
  private endDrag(): void {
    this.stopDrag?.();
    this.stopDrag = null;
  }

  private readonly dragHost: DragHost = {
    measure: () => {
      const slotOf = (id: string, element: Element): Slot => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return { id, left: left + window.scrollX, top: top + window.scrollY, width, height };
      };
      const columns = [...(this.shadowRoot?.querySelectorAll<HTMLElement>('.col') ?? [])].map((col) => ({
        column: col.dataset['column'] as Column, rect: slotOf(col.dataset['column'] ?? '', col),
        sections: [...col.children].flatMap((child) => (child instanceof HTMLElement && child.dataset['sectionId'] !== undefined ? [slotOf(child.dataset['sectionId'], child)] : [])),
      }));
      const sections = [...this.sections].filter(([, element]) => element.isConnected).map(([id, element]) => ({ id, rect: slotOf(id, element), tiles: element.tileSlots() }));
      return { sections, columns };
    },
    preview: (target) => {
      this.drag = this.drag && target ? { ...this.drag, target } : null;
      this.dragging = this.drag !== null;
    },
    lift: (kind, id) => this.lift(kind, id),
  };

  /** The floating copy: a new tile with the same spec, or the title bar of a section as wide as the section. */
  private lift(kind: 'tile' | 'section', id: string): HTMLElement {
    const copy = document.createElement('div');
    const found = kind === 'tile' ? this.findTile(id) : null;
    const sectionId = found?.section.id ?? id;
    const original = kind === 'tile' ? this.tiles.get(id) : this.sections.get(id) ?? this.heroes.get(id);
    const rect = original?.getBoundingClientRect();
    copy.className = kind === 'tile' ? 'lifted' : 'lifted bar';
    if (found) {
      const tile = createTile(found.spec, this.ctx, this.density) as TileHost;
      tile.editing = true;
      copy.append(tile);
    } else {
      const section = this.allSections().find((s) => s.id === id);
      const icon = document.createElement('mh-icon');
      icon.name = section ? shownSectionIcon(section) : 'battery_5_bar';
      icon.filled = true;
      const title = document.createElement('span');
      title.textContent = this.placeOf(id)?.title ?? '';
      copy.append(icon, title);
      copy.style.setProperty('--_height', 'var(--edit-bar-height)');
    }
    if (rect) {
      copy.style.setProperty('--_left', pixels(rect.left));
      copy.style.setProperty('--_top', pixels(rect.top));
      copy.style.setProperty('--_width', pixels(rect.width));
      if (kind === 'tile') copy.style.setProperty('--_height', pixels(rect.height));
    }
    applySectionTheme(copy, this.sectionSeeds[sectionId] ?? null, this.mode);
    this.shadowRoot?.append(copy);
    this.drag = { kind, id, height: rect?.height ?? 0, target: null };
    this.dragging = true;
    this.tileMenu = null;
    return copy;
  }

  private onDrop(result: DropResult): void {
    if (!this.board) return;
    const dashboardId = this.board.id;
    // where it already was: nothing changes, so there is nothing to say either
    const found = result.kind === 'tile' ? this.findTile(result.tileId) : null;
    if (result.kind === 'tile' && found?.section.id === result.toSectionId && found.index === result.index) return;
    const place = result.kind === 'section' ? this.placeOf(result.sectionId) : null;
    if (result.kind === 'section' && place?.column === result.column && place.index === result.index) return;
    if (result.kind === 'tile') {
      this.moved = { kind: 'tile', id: result.tileId, focus: false };
      this.edit({ type: 'move-tile', dashboardId, tileId: result.tileId, toSectionId: result.toSectionId, index: result.index });
    } else {
      this.moved = { kind: 'section', id: result.sectionId, focus: false };
      this.edit({ type: 'move-section', dashboardId, sectionId: result.sectionId, column: result.column, index: result.index });
    }
  }

  /** The empty place in a section, while a tile would land there. */
  private dropPlaceIn(sectionId: string): DropPlace | null {
    const { drag } = this;
    if (drag?.target?.kind !== 'tile' || drag.target.toSectionId !== sectionId) return null;
    const spec = this.findTile(drag.id)?.spec;
    return { index: drag.target.index, wide: spec?.size === 'wide', flow: spec?.kind === 'flow', height: drag.height };
  }

  /** The menu of a tile hangs under it, aligned to its right edge; the place goes in through the CSSOM. */
  private placeTileMenu(tileId: string): void {
    const anchor = this.shadowRoot?.querySelector<HTMLElement>('.menu-anchor');
    const tile = this.tiles.get(tileId)?.getBoundingClientRect();
    const main = this.shadowRoot?.querySelector('main')?.getBoundingClientRect();
    if (!anchor || !tile || !main) return;
    anchor.style.setProperty('--_top', pixels(tile.bottom - main.top));
    anchor.style.setProperty('--_right', pixels(main.right - tile.right));
  }

  /** Every section on the board, in both columns. */
  private allSections(): Section[] {
    return this.board ? [...this.board.left, ...this.board.right].flatMap((b) => (b.type === 'section' ? [b.section] : [])) : [];
  }

  private findTile(tileId: string): { spec: TileSpec; section: Section; index: number } | null {
    for (const section of this.allSections()) {
      const index = section.tiles.findIndex((spec) => spec.id === tileId);
      if (index !== -1) return { spec: section.tiles[index]!, section, index };
    }
    return null;
  }

  private tileName(spec: TileSpec): string {
    const { store, t } = this.ctx;
    if (spec.kind === 'flow') return flowView(spec, store.getSnapshot()?.flows.find((f) => f.id === spec.flowId), t).name;
    return tileView(spec, store.getDevice(spec.deviceId), t).name;
  }

  /** Where a section or hero stands in the columns as they are shown. */
  private placeOf(id: string): { column: Column; index: number; count: number; title: string } | null {
    if (!this.board) return null;
    for (const column of ['left', 'right'] as const) {
      const blocks = this.board[column];
      const index = blocks.findIndex((b) => (b.type === 'hero' ? b.id : b.section.id) === id);
      const block = blocks[index];
      if (block) return { column, index, count: blocks.length, title: block.type === 'section' ? sectionTitle(block.section, this.ctx.t) : this.ctx.t('hero.title') };
    }
    return null;
  }

  /** Says where the moved tile or section stands now, and puts the focus on it. */
  private async announceMove(moved: { kind: 'tile' | 'section'; id: string; focus: boolean }): Promise<void> {
    this.moved = null;
    const { t } = this.ctx;
    if (moved.kind === 'section') {
      const place = this.placeOf(moved.id);
      if (!place) return;
      this.announcement = t('edit.moved', { name: place.title, index: place.index + 1, count: place.count, section: t(`edit.column.${place.column}`) });
      if (!moved.focus) return;
      const element = this.sections.get(moved.id) ?? this.heroes.get(moved.id);
      await element?.updateComplete;
      element?.focusMenu();
      return;
    }
    const found = this.findTile(moved.id);
    if (!found) return;
    this.announcement = t('edit.moved', { name: this.tileName(found.spec), index: found.index + 1, count: found.section.tiles.length, section: sectionTitle(found.section, t) });
    if (!moved.focus) return;
    await this.sections.get(found.section.id)?.updateComplete;
    this.tiles.get(moved.id)?.focus();
  }

  /** Says something for screen readers; the same words again are said again. */
  announce(text: string): void {
    this.announcement = this.announcement === text ? `${text}\u00a0` : text;
  }

  /** The focus after something was taken away: the tile that stands there now, the last one, or the place to add. */
  async focusTileAt(sectionId: string, index: number): Promise<void> {
    await this.updateComplete;
    const section = this.sections.get(sectionId);
    await section?.updateComplete;
    const specs = this.allSections().find((s) => s.id === sectionId)?.tiles ?? [];
    const spec = specs[Math.min(index, specs.length - 1)];
    if (spec) this.tiles.get(spec.id)?.focus();
    else section?.focusAdd();
  }

  /** The focus on a new section (where its first tile goes) or the hero (its menu). */
  async focusSection(id: string): Promise<void> {
    await this.updateComplete;
    const section = this.sections.get(id);
    const hero = this.heroes.get(id);
    await (section ?? hero)?.updateComplete;
    section?.focusAdd();
    hero?.focusMenu();
  }

  /** The focus after a section was taken away: the menu of the one that stands there now, or the last of the column. */
  async focusSectionAt(column: Column, index: number): Promise<void> {
    await this.updateComplete;
    const blocks = this.board?.[column] ?? [];
    const block = blocks[Math.min(index, blocks.length - 1)];
    const element = block ? (block.type === 'hero' ? this.heroes.get(block.id) : this.sections.get(block.section.id)) : undefined;
    await element?.updateComplete;
    if (element) element.focusMenu();
    else this.shadowRoot?.querySelector<HTMLElement>(`.col[data-column="${column}"] .add-slot, mh-empty-state mh-button`)?.focus();
  }

  private edit(edit: LayoutEdit): void {
    this.dispatchEvent(new CustomEvent('layout-edit', { detail: { edit }, bubbles: true, composed: true }));
  }

  private onTileMenu(event: CustomEvent<{ tileId: string }>): void {
    event.stopPropagation();
    if (!this.editing) return;
    this.tileMenu = this.tileMenu?.tileId === event.detail.tileId ? null : { tileId: event.detail.tileId, to: false };
  }

  private async closeTileMenu(focus = true): Promise<void> {
    const tileId = this.tileMenu?.tileId;
    this.tileMenu = null;
    await this.updateComplete;
    if (focus && tileId !== undefined) this.tiles.get(tileId)?.focus();
  }

  private onTileChoice(event: CustomEvent<{ group: string; id: string }>): void {
    event.stopPropagation();
    const found = this.tileMenu ? this.findTile(this.tileMenu.tileId) : null;
    if (!found || !this.board) return;
    const { spec, section, index } = found;
    const dashboardId = this.board.id;
    const move = (toSectionId: string, to: number): void => {
      this.moved = { kind: 'tile', id: spec.id, focus: true };
      this.edit({ type: 'move-tile', dashboardId, tileId: spec.id, toSectionId, index: to });
    };
    const { group, id } = event.detail;
    if (group === 'move' && id === 'to') { this.tileMenu = { tileId: spec.id, to: true }; return; }
    if (group === 'back') { this.tileMenu = { tileId: spec.id, to: false }; return; }
    const stays = group === 'section' && id === section.id && index === section.tiles.length - 1;
    void this.closeTileMenu(group === 'size' || stays);
    if (stays) return;
    if (group === 'tile') this.emit('open-tile', { tileId: spec.id });
    else if (group === 'size') this.edit({ type: 'set-tile', dashboardId, tileId: spec.id, patch: { size: id === 'wide' ? 'wide' : 'single' } });
    else if (group === 'move') move(section.id, id === 'forward' ? index - 1 : index + 1);
    else if (group === 'section') move(id, this.allSections().find((s) => s.id === id)?.tiles.filter((other) => other.id !== spec.id).length ?? 0);
    else if (group === 'remove') this.edit({ type: 'remove-tile', dashboardId, tileId: spec.id });
  }

  private onSectionAction(event: CustomEvent<{ sectionId: string; action: SectionAction }>): void {
    event.stopPropagation();
    const { sectionId, action } = event.detail;
    const place = this.placeOf(sectionId);
    if (!place || !this.board) return;
    const move = (column: Column, index: number): void => {
      this.moved = { kind: 'section', id: sectionId, focus: true };
      this.edit({ type: 'move-section', dashboardId: this.board!.id, sectionId, column, index });
    };
    switch (action) {
      case 'rename': this.emit('open-section-dialog', { sectionId, column: place.column }); return;
      case 'settings': this.emit('open-hero', { sectionId }); return;
      case 'remove': this.emit('remove-section', { sectionId }); return;
      case 'up': move(place.column, place.index - 1); return;
      case 'down': move(place.column, place.index + 1); return;
      case 'other': move(place.column === 'left' ? 'right' : 'left', place.index); return;
    }
  }

  /** The sections of this dashboard, to put something new in. */
  private placeOptions(): PlaceOption[] {
    return this.allSections().map((section) => ({ id: section.id, title: sectionTitle(section, this.ctx.t), icon: shownSectionIcon(section) }));
  }

  /** The name of the section a kind of device goes to: as it stands on this dashboard, otherwise as the app calls it. */
  private readonly sectionNameOf = (kind: SectionKind): string => {
    const section = this.allSections().find((s) => s.id === sectionId('type', kind));
    return section ? sectionTitle(section, this.ctx.t) : this.ctx.t(`section.${kind}`);
  };

  /** The dimmer stands outside the sections: a section is the frame of what is fixed inside it. */
  private onDim(event: CustomEvent<DimDetail>): void {
    if (event.detail.phase !== 'start' && this.dim === null) return;
    if (this.dimTimer !== null) clearTimeout(this.dimTimer);
    this.dimTimer = null;
    const closing = event.detail.phase === 'end';
    this.dim = { ...event.detail, closing };
    if (closing) this.dimTimer = setTimeout(() => this.endDim(), DIM_CLOSE_MS);
  }

  private endDim(): void {
    if (this.dimTimer !== null) clearTimeout(this.dimTimer);
    this.dimTimer = null;
    this.dim = null;
  }

  private renderDim() {
    const { dim } = this;
    if (!dim) return nothing;
    const section = this.findTile(dim.tileId)?.section.id;
    return html`<mh-dimmer .box=${dim.box} .from=${dim.from} .level=${dim.level} .percent=${dim.percent} name=${dim.name} icon=${dim.icon} .seed=${(section === undefined ? undefined : this.sectionSeeds[section]) ?? null} mode=${this.mode} ?closing=${dim.closing}></mh-dimmer>`;
  }

  private get phone(): boolean {
    return this.density === 'phone';
  }

  /** Arranging is for a device that may, on a larger screen than a phone. */
  private get mayArrange(): boolean {
    return !this.phone && this.ctx.status().canArrange !== false;
  }

  private renderNews() {
    if (this.editing || !this.mayArrange || this.phase !== 'ready' || this.board?.id !== OVERVIEW_ID || this.news.length + this.gone.length === 0) return nothing;
    return html`<mh-news-card .t=${this.ctx.t} .news=${this.news} .gone=${this.gone} .sections=${this.placeOptions()} .sectionName=${this.sectionNameOf} .boardName=${this.nameOfBoard}></mh-news-card>`;
  }

  private renderTileMenu() {
    if (!this.editing) return nothing;
    const { t } = this.ctx;
    const found = this.tileMenu ? this.findTile(this.tileMenu.tileId) : null;
    const name = found ? this.tileName(found.spec) : '';
    const groups = !found ? [] : this.tileMenu?.to ? moveToGroups(this.allSections(), found.section.id, name, t)
      : tileMenuGroups(found.spec, name, { index: found.index, count: found.section.tiles.length }, t);
    return html`<div class="menu-anchor"><mh-menu class="tile-menu" .t=${t} .open=${found !== null} label=${t('menu.section', { name })} .groups=${groups}
      .anchor=${found ? this.tiles.get(found.spec.id) ?? null : null}
      @select=${(e: CustomEvent<{ group: string; id: string }>) => this.onTileChoice(e)}
      @close=${(e: Event) => { e.stopPropagation(); void this.closeTileMenu(); }}></mh-menu></div>`;
  }

  /** Lets go of the elements of sections, heroes and tiles that are not on the board any more. */
  private forgetGone(): void {
    const blocks = this.board ? [...this.board.left, ...this.board.right] : [];
    const keep = (map: Map<string, unknown>, ids: string[]): void => { for (const id of [...map.keys()]) if (!ids.includes(id)) map.delete(id); };
    keep(this.sections, blocks.flatMap((b) => (b.type === 'section' ? [b.section.id] : [])));
    keep(this.heroes, blocks.flatMap((b) => (b.type === 'hero' ? [b.id] : [])));
    keep(this.tiles, blocks.flatMap((b) => (b.type === 'section' ? b.section.tiles.map((spec) => spec.id) : [])));
  }

  /** Puts the focus at the start of the content, as when a screen opens; the next Tab reaches the first control. */
  closeMenus(): void {
    const walk = (root: ParentNode): void => {
      for (const element of root.querySelectorAll('*')) {
        if (element.localName === 'mh-menu') (element as MhMenu).dismiss();
        if (element.shadowRoot) walk(element.shadowRoot);
      }
    };
    if (this.shadowRoot) walk(this.shadowRoot);
  }

  focusContent(): void {
    this.shadowRoot?.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
  }

  private emit(type: 'retry' | 'reload' | 'change-connection' | 'toggle-edit' | 'add-hero' | 'open-section-dialog' | 'open-tile' | 'open-hero' | 'remove-section', detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private renderBanner() {
    const t = this.ctx.t;
    if (this.banner === 'offline') {
      return html`<mh-banner tone="error" heading=${t('banner.offline.title')} text=${t('banner.offline.text')}>
        <mh-button slot="action" variant="text" @click=${() => this.emit('retry')}>${t('banner.retry')}</mh-button>
      </mh-banner>`;
    }
    if (this.banner === 'update') {
      return html`<mh-banner tone="ok" icon="refresh" heading=${t('banner.update.title')} text=${t('banner.update.text')}>
        <mh-button slot="action" variant="text" @click=${() => this.emit('reload')}>${t('banner.update.action')}</mh-button>
      </mh-banner>`;
    }
    if (this.banner === 'restored') return html`<mh-banner tone="ok" heading=${t('banner.back.title')} text=${t('banner.back.text')}></mh-banner>`;
    return nothing;
  }

  /** Why flows in a section cannot be started. */
  private flowNote(tiles: readonly TileSpec[]): string {
    const { t, store } = this.ctx;
    const { canStartFlows, served } = this.ctx.status();
    const flows = tiles.flatMap((spec) => (spec.kind === 'flow' ? [spec.flowId] : []));
    const locked = !canStartFlows && flows.some((id) => !isButton(id));
    const off = flows.some((id) => isButton(id) && store.getSnapshot()?.flows.some((flow) => flow.id === id && !flow.startable));
    return [...(locked ? [t(!served ? 'flows.locked' : store.getSnapshot()?.flowAccess === 'refused' ? 'flows.refused' : 'flows.lockedServed')] : []), ...(off ? [t('flows.off')] : [])].join(' ');
  }

  /** The element of a block, with what it shows now. */
  private elementFor(block: Block, place: SectionPlace): HTMLElement {
    const id = block.type === 'hero' ? block.id : block.section.id;
    const seed = this.sectionSeeds[id] ?? null;
    const common = { ctx: this.ctx, seed, mode: this.mode, baseSeed: this.baseSeed, editing: this.editing, place };
    if (block.type === 'hero') {
      const hero = this.heroes.get(id) ?? document.createElement('mh-hero');
      this.heroes.set(id, hero);
      this.mark(hero, id);
      return Object.assign(hero, common, { hero: block.hero, sectionId: id });
    }
    const section = this.sections.get(id) ?? document.createElement('mh-section');
    this.sections.set(id, section);
    const note = this.flowNote(block.section.tiles);
    this.mark(section, id);
    const dragged = this.drag?.kind === 'tile' ? this.drag.id : null;
    return Object.assign(section, common, {
      section: block.section, fixed: this.room !== null, density: this.density, note, tileStore: this.tiles, dropAt: this.dropPlaceIn(id), dragged, freshTiles: this.freshTiles,
    });
  }

  /** Says which block an element is, for the dragging, and hides the one that is dragged. */
  private mark(element: HTMLElement, id: string): void {
    element.dataset['sectionId'] = id;
    element.toggleAttribute('data-dragged', this.drag?.kind === 'section' && this.drag.id === id);
  }

  /** The blocks of a column with the empty place of a dragged section between them; the dragged one does not count. */
  private withPlaceholder(column: Column, blocks: Block[]): (Block | 'placeholder')[] {
    const { drag } = this;
    if (drag?.target?.kind !== 'section' || drag.target.column !== column) return blocks;
    const idOf = (block: Block): string => (block.type === 'hero' ? block.id : block.section.id);
    const before = blocks.filter((block) => idOf(block) !== drag.id)[drag.target.index];
    const at = before === undefined ? blocks.length : blocks.indexOf(before);
    return [...blocks.slice(0, at), 'placeholder', ...blocks.slice(at)];
  }

  private renderColumn(column: Column, blocks: Block[]) {
    const add = this.editing ? html`<button class="add-slot" @click=${() => this.emit('open-section-dialog', { sectionId: null, column })}><mh-icon name="add"></mh-icon>${this.ctx.t('edit.addSection')}</button>` : nothing;
    return html`<div class="col ${blocks.length === 0 ? 'empty' : ''}" data-column=${column}>${repeat(this.withPlaceholder(column, blocks), (block) => (block === 'placeholder' ? block : block.type === 'hero' ? block.id : block.section.id), (block) => (block === 'placeholder'
      ? html`<div class="placeholder"></div>` : this.elementFor(block, { column, first: block === blocks[0], last: block === blocks.at(-1) })))}${add}</div>`;
  }

  /** A dashboard with nothing on it (5.9): while editing what to begin with, otherwise the way to the edit mode. */
  private renderEmptyBoard() {
    const { t } = this.ctx;
    const actions = this.editing
      ? html`<mh-button slot="actions" @click=${() => this.emit('open-section-dialog', { sectionId: null, column: 'left' })}><mh-icon name="add"></mh-icon>${t('board.empty.addSection')}</mh-button>
        <mh-button slot="actions" variant="tonal" @click=${() => this.emit('add-hero')}><mh-icon name="battery_5_bar"></mh-icon>${t('board.empty.addHero')}</mh-button>`
      : !this.mayArrange ? nothing : html`<mh-button slot="actions" @click=${() => this.emit('toggle-edit')}><mh-icon name="edit"></mh-icon>${t('board.empty.edit')}</mh-button>`;
    return html`<mh-empty-state icon=${this.boardIcon} heading=${t('board.empty.title', { name: this.boardName })}>${t(this.mayArrange ? 'board.empty.text' : 'board.empty.textUse')}${actions}</mh-empty-state>`;
  }

  /** The screen with the rooms, or a room: nothing there is a dashboard of the owner. */
  private get isRooms(): boolean {
    return this.board?.id === ROOMS_ID || this.room !== null;
  }

  private goTo(boardId: string): void {
    this.dispatchEvent(new CustomEvent('navigate', { detail: { to: `board:${boardId}` }, bubbles: true, composed: true }));
  }

  /** The room that was left: its card gets the focus when the rooms are there again. */
  private leftRoom: string | null = null;
  private goingBack = false;

  private openRoom(event: CustomEvent<{ id: string }>): void {
    event.stopPropagation();
    this.leftRoom = event.detail.id;
    this.goingBack = false;
    window.scrollTo?.(0, 0);
    this.goTo(roomBoardId(event.detail.id));
  }

  private renderContent() {
    const t = this.ctx.t;
    if (this.phase === 'loading') return html`<mh-skeleton></mh-skeleton>`;
    if (this.phase === 'unreachable') {
      return html`<mh-empty-state icon="cloud_off" heading=${t('empty.nostart.title')}>${t(this.ctx.status().served ? 'empty.nostart.servedText' : 'empty.nostart.text')}
        <mh-button slot="actions" @click=${() => this.emit('retry')}>${t('empty.nostart.retry')}</mh-button>
        ${this.ctx.status().served ? nothing : html`<mh-button slot="actions" variant="text" @click=${() => this.emit('change-connection')}>${t('empty.nostart.other')}</mh-button>`}
      </mh-empty-state>`;
    }
    if (this.emptyReason === 'no-right') return html`<mh-empty-state icon="lock" heading=${t('empty.noRead.title')}>${t('empty.noRead.text')}</mh-empty-state>`;
    if (this.emptyReason === 'no-devices' || !this.board) return html`<mh-empty-state icon="devices_other" heading=${t('empty.devices.title')}>${t('empty.devices.text')}</mh-empty-state>`;
    if (this.board.id === ROOMS_ID) return html`<mh-rooms .ctx=${this.ctx} .rooms=${this.rooms} @open-room=${(e: CustomEvent<{ id: string }>) => this.openRoom(e)}></mh-rooms>`;
    const { left, right } = shownColumns(this.board, this.editing);
    if (left.length + right.length === 0) return this.renderEmptyBoard();
    return html`<div class="cols" @tile-menu=${(e: CustomEvent<{ tileId: string }>) => this.onTileMenu(e)}
      @section-action=${(e: CustomEvent<{ sectionId: string; action: SectionAction }>) => this.onSectionAction(e)}>${this.renderColumn('left', left)}${this.renderColumn('right', right)}</div>`;
  }

  override render() {
    const status = this.ctx.status();
    const chips = headerChips({ devices: this.ctx.store.getDevices(), route: status.route, connecting: this.connecting, canControl: status.canControl, demo: status.demo }, this.ctx.t);
    const editing = this.editing && this.phase === 'ready';
    return html`<div class="app" @dim=${(e: CustomEvent<DimDetail>) => this.onDim(e)}>
      ${this.phone ? html`<mh-nav-bar .t=${this.ctx.t} .boards=${this.boards} activeBoard=${this.isRooms ? ROOMS_ID : this.board?.id ?? ''} panel=${this.activePanel}></mh-nav-bar>` : html`<mh-rail .t=${this.ctx.t} .boards=${this.boards} activeBoard=${this.isRooms ? ROOMS_ID : this.board?.id ?? ''} panel=${this.activePanel} ?editing=${editing} ?editBlocked=${this.phase !== 'ready' || this.isRooms} ?useOnly=${status.canArrange === false}></mh-rail>`}
      <main tabindex="-1">
        ${this.renderBanner()}
        ${editing ? html`<mh-edit-bar .t=${this.ctx.t} boardName=${this.boardName} ?canUndo=${this.canUndo} ?firstTime=${this.firstTime} .menu=${this.boardMenu}
          @focusin=${() => { this.barFocused = true; }} @focusout=${() => { this.barFocused = false; }}></mh-edit-bar>` : nothing}
        <mh-header .chips=${chips} .ctx=${this.ctx} ?phone=${this.phone}></mh-header>
        ${this.renderNews()}
        ${this.room && this.phase === 'ready' ? html`<mh-room-head .ctx=${this.ctx} .room=${this.room} @back=${(e: Event) => { e.stopPropagation(); this.goingBack = true; this.goTo(ROOMS_ID); }}></mh-room-head>` : nothing}
        ${this.renderContent()}
        ${this.renderTileMenu()}
        <p class="unseen" aria-live="polite">${this.announcement}</p>
      </main>
    </div>${this.renderDim()}`;
  }
}

if (!customElements.get('mh-dashboard')) customElements.define('mh-dashboard', MhDashboard);

declare global {
  interface HTMLElementTagNameMap { 'mh-dashboard': MhDashboard }
}
