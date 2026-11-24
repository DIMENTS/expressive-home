import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Section, TileSpec } from '../../dashboard/types';
import type { Device } from '../../homey/types';
import { roomIdOf } from '../../rooms/zones';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { Mode, ShownDensity } from '../../theme/types';
import type { UiContext } from '../app/context';
import { applySectionTheme } from '../apply-theme';
import { PHONE_MAX_PX, TILE_GRID_WIDE_MIN_PX } from '../breakpoints';
import type { Slot } from '../model/drop';
import { pixels } from '../pixels';
import { countsSomething, sectionCount, sectionTitle, shownSectionIcon } from '../model/layout';
import { sharedStyles } from '../parts/shared-styles';
import { createTile, tileTag } from '../tiles/registry';
import { addSlotStyles } from './add-slot';
import { layoutGroup, placeChanged, type SectionAction, type SectionPlace } from './edit-menus';
import '../parts/icon';
import { chosenSeed, colourGroups } from './section-menu';
import './section-menu';
import type { MhSectionMenu } from './section-menu';

export type TileHost = HTMLElement & { spec: TileSpec; ctx: UiContext; density: ShownDensity; editing: boolean };

/** The empty place of a dragged tile: the place among the other tiles, and the size of what is dragged. */
export interface DropPlace { index: number; wide: boolean; flow?: boolean; height: number }

/** Marks the empty place in the list of tiles. */
const PLACEHOLDER = Symbol('placeholder');

let headingSeq = 0;

/**
 * A section of the dashboard: title with its icon, the count when it holds lamps or switches, an optional
 * reason under the title, and the tile grid (four columns from 600 wide inside, otherwise two; flow
 * buttons always two side by side). Tiles keep their element while the section draws again. While editing
 * it has a grip before its title and ends with "Tegel toevoegen".
 */
export class MhSection extends LitElement {
  static override properties = {
    section: { attribute: false },
    ctx: { attribute: false },
    density: { type: String },
    note: { type: String },
    seed: { attribute: false },
    mode: { type: String },
    baseSeed: { attribute: false },
    menuOpen: { type: Boolean, reflect: true, attribute: 'menu-open' },
    editing: { type: Boolean, reflect: true },
    fixed: { type: Boolean },
    tileStore: { attribute: false },
    place: { attribute: false, hasChanged: placeChanged },
    dropAt: { attribute: false, hasChanged: placeChanged },
    dragged: { attribute: false },
    freshTiles: { attribute: false, hasChanged: placeChanged },
  };

  declare section: Section;
  declare ctx: UiContext;
  declare density: ShownDensity;
  /** A reason under the title, such as a missing right. */
  declare note: string;
  /** The section's own colour, or null to follow the dashboard. */
  declare seed: string | null;
  /** Light or dark as the dashboard shows it now, also when it follows the system. */
  declare mode: Mode;
  /** The dashboard's colour, for the dot of "Zoals het dashboard". */
  declare baseSeed: string;
  /** While the menu is open the section lies above its neighbours, so the menu floats over them. */
  declare menuOpen: boolean;
  declare editing: boolean;
  /** Of a room: nothing in it is arranged. */
  declare fixed: boolean;
  /** The tile elements by id; the dashboard shares one, so a tile keeps its element in another section. */
  declare tileStore: Map<string, TileHost> | null;
  /** Where the section stands, for its menu while editing. */
  declare place: SectionPlace;
  /** Where a dragged tile would land in this section; null: not here. */
  declare dropAt: DropPlace | null;
  /** The id of the tile that is dragged. */
  declare dragged: string | null;
  /** The tiles that were just added: they light up for a moment (5.4). */
  declare freshTiles: readonly string[];
  private ownTiles = new Map<string, TileHost>();
  private listening: (() => void)[] = [];
  private headingId = `section-${++headingSeq}`;

  constructor() {
    super();
    this.density = 'comfortable';
    this.note = '';
    this.seed = null;
    this.mode = 'light';
    this.baseSeed = rustigExpressive.color.defaultSeed;
    this.menuOpen = false;
    this.editing = false;
    this.fixed = false;
    this.tileStore = null;
    this.place = { column: 'left', first: true, last: true };
    this.dropAt = null;
    this.dragged = null;
    this.freshTiles = [];
  }

  static override styles = [sharedStyles, addSlotStyles, css`
    :host { display: block; min-width: 0; }
    :host([menu-open]) { position: relative; z-index: var(--layer-menu); }
    section {
      container-type: inline-size; background: var(--section-bg); color: var(--section-fg); border-radius: var(--section-radius); padding: var(--section-pad);
      transition: background-color var(--motion-effects), color var(--motion-effects);
    }
    .head {
      display: flex; align-items: center; gap: var(--space-8); margin: 0 0 var(--section-title-gap);
      font-size: var(--section-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong);
      --icon-size: var(--section-title-size);
    }
    h2 { min-width: 0; margin: 0; font: inherit; }
    .head > mh-icon { color: var(--section-title-icon-fg); }
    :host([data-own-seed]) .head > mh-icon { color: var(--section-own-title-icon-fg); }
    .grip {
      all: unset; box-sizing: border-box; position: relative; cursor: grab; touch-action: none; flex: none; display: grid; place-items: center;
      width: var(--icon-button-size); height: var(--icon-button-size); margin: calc(var(--space-8) * -1) 0 calc(var(--space-8) * -1) calc(var(--space-8) * -1);
      border-radius: var(--shape-full); color: var(--edit-handle-fg); --icon-size: var(--icon-m);
    }
    .grip:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .grip:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .title { overflow-wrap: anywhere; }
    .head > mh-section-menu { margin-left: auto; }
    .count + mh-section-menu { margin-left: var(--space-4); }
    .count { margin-left: auto; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-medium); color: var(--section-count-fg); }
    .note {
      display: flex; align-items: center; gap: var(--space-8); margin: calc(var(--space-6) * -1) 0 var(--section-title-gap);
      font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--section-count-fg); --icon-size: var(--icon-s);
    }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--tile-gap); }
    /* a flow is half as wide as the section */
    .tiles > mh-flow-tile { grid-column: span 2; }
    .placeholder.wide, .placeholder.flow { grid-column: span 2; }
    .tiles > [data-fresh] { border-radius: var(--tile-radius); animation: arrive var(--motion-arrive) both; }
    @keyframes arrive { 0%, 60% { outline: var(--focus-width) solid var(--drop-border); } 100% { outline: var(--focus-width) solid transparent; } }
    .empty { grid-column: 1 / -1; margin: 0; padding: var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--section-count-fg); }
    @container (width < ${TILE_GRID_WIDE_MIN_PX}px) {
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tiles > mh-flow-tile, .placeholder.flow { grid-column: span 1; }
    }
    @media (width < ${PHONE_MAX_PX}px) {
      .title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
      .count { flex: none; }
    }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const stop of this.listening) stop();
    this.listening = [];
  }

  /** Everything in the room the section is of. */
  private inRoom(): Device[] {
    const { section } = this;
    if (section.zone === undefined) return [];
    const snapshot = this.ctx.store.getSnapshot();
    return snapshot ? Object.keys(snapshot.devices).flatMap((id) => this.ctx.store.getDevice(id) ?? []).filter((device) => roomIdOf(device, snapshot) === section.zone) : [];
  }

  /** A section whose head says something redraws when one of the devices it is about changes. */
  private listen(): void {
    for (const stop of this.listening) stop();
    this.listening = [];
    if (!this.ctx || !this.section || !this.isConnected) return;
    if (!countsSomething(this.section)) return;
    const ids = new Set([...this.section.tiles.flatMap((spec) => ('deviceId' in spec ? [spec.deviceId] : [])), ...this.inRoom().map((device) => device.id)]);
    this.listening = [...ids].map((id) => this.ctx.store.subscribeDevice(id, () => this.requestUpdate()));
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('section') || changed.has('ctx')) this.listen();
    if (changed.has('section')) {
      const ids = new Set(this.section.tiles.map((spec) => spec.id));
      for (const id of [...this.ownTiles.keys()]) if (!ids.has(id)) this.ownTiles.delete(id);
    }
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('seed') || changed.has('mode')) applySectionTheme(this, this.seed, this.mode);
    if (this.dropAt) this.shadowRoot?.querySelector<HTMLElement>('.placeholder')?.style.setProperty('--_height', pixels(this.dropAt.height));
  }

  /** The places of the tiles on the page, in order. */
  tileSlots(): Slot[] {
    return this.section.tiles.flatMap((spec) => {
      const tile = (this.tileStore ?? this.ownTiles).get(spec.id);
      if (!tile) return [];
      const { left, top, width, height } = tile.getBoundingClientRect();
      return [{ id: spec.id, left: left + window.scrollX, top: top + window.scrollY, width, height }];
    });
  }

  private onSelect(event: CustomEvent<{ group: string; id: string }>): void {
    event.stopPropagation();
    if (event.detail.group === 'layout') {
      this.emit('section-action', { action: event.detail.id as SectionAction });
      return;
    }
    const seed = chosenSeed(event.detail);
    if (seed === undefined) return;
    this.dispatchEvent(new CustomEvent('section-seed', { detail: { sectionId: this.section.id, seed }, bubbles: true, composed: true }));
  }

  private tileFor(spec: TileSpec): TileHost {
    const tiles = this.tileStore ?? this.ownTiles;
    let tile = tiles.get(spec.id);
    // a tile whose device changed can become another kind
    if (!tile || tile.localName !== tileTag(spec.kind)) {
      tile = createTile(spec, this.ctx, this.density) as TileHost;
      tiles.set(spec.id, tile);
    }
    if (tile.spec !== spec) tile.spec = spec;
    if (tile.ctx !== this.ctx) tile.ctx = this.ctx;
    if (tile.density !== this.density) tile.density = this.density;
    if (tile.editing !== this.editing) tile.editing = this.editing;
    tile.dataset['tileId'] = spec.id;
    tile.toggleAttribute('data-dragged', spec.id === this.dragged);
    tile.toggleAttribute('data-fresh', this.freshTiles.includes(spec.id));
    return tile;
  }

  /** The title: the owner's own name, otherwise that of the app in the language of the app. */
  get heading(): string {
    return sectionTitle(this.section, this.ctx.t);
  }

  private emit(type: 'open-add' | 'section-action', detail: { action?: SectionAction } = {}): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { sectionId: this.section.id, ...detail }, bubbles: true, composed: true }));
  }

  /** The focus goes to the menu button, where a moved section is moved further. */
  focusMenu(): void {
    this.shadowRoot?.querySelector<MhSectionMenu>('mh-section-menu')?.focus();
  }

  /** The focus goes to the place to add a tile: where a new section goes on, or one whose last tile is gone. */
  focusAdd(): void {
    this.shadowRoot?.querySelector<HTMLElement>('.add-slot')?.focus();
  }

  private openMenu(): void {
    const menu = this.shadowRoot?.querySelector<MhSectionMenu>('mh-section-menu');
    if (menu) menu.toggle(true);
  }

  private renderGrip() {
    if (!this.editing) return nothing;
    return html`<button class="grip hit" data-grip aria-label=${this.ctx.t('edit.grip', { name: this.heading })} @click=${() => this.openMenu()}><mh-icon name="drag_indicator"></mh-icon></button>`;
  }

  /** The tiles with the empty place between them; the dragged tile itself does not count. */
  private withPlaceholder(): (TileSpec | typeof PLACEHOLDER)[] {
    const { tiles } = this.section;
    if (!this.dropAt) return tiles;
    const before = tiles.filter((spec) => spec.id !== this.dragged)[this.dropAt.index];
    const at = before === undefined ? tiles.length : tiles.indexOf(before);
    return [...tiles.slice(0, at), PLACEHOLDER, ...tiles.slice(at)];
  }

  private renderTiles() {
    const { section, ctx, editing, dropAt } = this;
    const empty = section.tiles.length === 0 && !dropAt ? html`<p class="empty">${ctx.t(editing ? 'edit.sectionEmpty' : 'section.empty')}</p>` : nothing;
    const add = editing ? html`<button class="add-slot" @click=${() => this.emit('open-add')}><mh-icon name="add"></mh-icon>${ctx.t('edit.addTile')}</button>` : nothing;
    return html`<div class="tiles">${repeat(this.withPlaceholder(), (item) => (item === PLACEHOLDER ? item : item.id), (item) => (item === PLACEHOLDER
      ? html`<div class="placeholder ${dropAt?.wide ? 'wide' : ''} ${dropAt?.flow ? 'flow' : ''}"></div>` : this.tileFor(item)))}${empty}${add}</div>`;
  }

  override render() {
    const { section, ctx } = this;
    const count = sectionCount(section, (id) => ctx.store.getDevice(id), ctx.t, this.inRoom());
    const title = this.heading;
    const icon = shownSectionIcon(section);
    const colours = colourGroups(title, this.seed, this.baseSeed, ctx.t);
    const groups = this.editing ? [layoutGroup('section', this.place, ctx.t), ...colours] : colours;
    return html`<section aria-labelledby=${this.headingId}>
      <div class="head">${this.renderGrip()}<mh-icon name=${icon} filled></mh-icon><h2 id=${this.headingId}><span class="title">${title}</span></h2>${count ? html`<span class="count">${count}</span>` : nothing}${ctx.status().canArrange === false || this.fixed ? nothing : html`<mh-section-menu
        label=${title} .t=${ctx.t} .groups=${groups}
        @select=${(e: CustomEvent<{ group: string; id: string }>) => this.onSelect(e)}
        @toggle=${(e: CustomEvent<{ open: boolean }>) => { e.stopPropagation(); this.menuOpen = e.detail.open; }}></mh-section-menu>`}</div>
      ${this.note ? html`<p class="note"><mh-icon name="lock"></mh-icon>${this.note}</p>` : nothing}
      ${this.renderTiles()}
    </section>`;
  }
}

if (!customElements.get('mh-section')) customElements.define('mh-section', MhSection);

declare global {
  interface HTMLElementTagNameMap { 'mh-section': MhSection }
}
