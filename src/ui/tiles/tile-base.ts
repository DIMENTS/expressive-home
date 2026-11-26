import { LitElement, css, html, nothing, type CSSResultGroup, type PropertyDeclarations, type PropertyValues, type TemplateResult } from 'lit';
import type { DeviceTileSpec, TileSpec } from '../../dashboard/types';
import type { ShownDensity } from '../../theme/types';
import type { UiContext } from '../app/context';
import { tileView, type TileState, type TileView } from '../model/tile-view';
import { observeLongPress } from '../parts/long-press';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/icon';
import { tileStatePart } from '../part-names';

/**
 * What every tile shares: its spec, the context, the density, and the attributes `state`, `wide`,
 * `density`, `stale` (no route) and `editing` that the styles read. A tile listens to the store only while it is
 * on the page, and redraws at most once per store flush.
 */
export abstract class TileElement<S extends TileSpec = TileSpec> extends LitElement {
  static override properties: PropertyDeclarations = {
    spec: { attribute: false },
    ctx: { attribute: false },
    density: { type: String, reflect: true },
    state: { type: String, reflect: true },
    wide: { type: Boolean, reflect: true },
    stale: { type: Boolean, reflect: true },
    editing: { type: Boolean, reflect: true },
  };

  declare spec: S;
  declare ctx: UiContext;
  declare density: ShownDensity;
  declare state: TileState;
  declare wide: boolean;
  declare stale: boolean;
  /** In the edit mode: a tap opens the tile's menu and switches nothing. */
  declare editing: boolean;
  private listening: (() => void)[] = [];

  constructor() {
    super();
    this.density = 'comfortable';
    this.state = 'neutral';
    this.wide = false;
    this.stale = false;
    this.editing = false;
  }

  /** The store keys this tile listens to; a device tile listens to its device. */
  protected abstract deviceIds(): string[];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopListening();
  }

  private listen(): void {
    this.stopListening();
    if (!this.ctx || !this.spec || !this.isConnected) return;
    const redraw = () => this.requestUpdate();
    this.listening = [this.ctx.store.subscribeStructure(redraw), ...this.deviceIds().map((id) => this.ctx.store.subscribeDevice(id, redraw))];
  }

  /** Reports that the menu of this tile is asked for. */
  protected openMenu(): void {
    this.dispatchEvent(new CustomEvent('tile-menu', { detail: { tileId: this.spec.id }, bubbles: true, composed: true }));
  }

  /** Puts the focus on the part of the tile that can be operated. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('.face, button')?.focus(options);
  }

  private stopListening(): void {
    for (const stop of this.listening) stop();
    this.listening = [];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('spec') || changed.has('ctx')) this.listen();
    // two beside each other on a phone, except where more values stand in a row
    if (this.spec) this.wide = this.spec.size === 'wide' && (this.density !== 'phone' || this.spec.kind === 'multi');
    if (this.ctx) this.stale = this.ctx.status().route === null;
  }

  static override styles: CSSResultGroup = [sharedStyles, css`
    :host { display: block; min-width: 0; }
    :host([wide]) { grid-column: span 2; }
  `];
}

/** The styles every device tile shares, in both densities. */
export const deviceTileStyles = css`
  .tile {
    --_bg: var(--tile-bg); --_fg: var(--tile-fg); --_state: var(--tile-state-fg);
    position: relative; display: flex; flex-direction: column; gap: var(--space-10); min-width: 0; height: 100%;
    min-height: var(--tile-height); padding: var(--tile-pad); border-radius: var(--tile-radius);
    background: var(--_bg); color: var(--_fg); -webkit-user-select: none; user-select: none; text-align: left; cursor: pointer;
    box-shadow: inset 0 0 0 var(--tile-outline-width) var(--tile-outline);
    transition: background-color var(--motion-effects), color var(--motion-effects), opacity var(--motion-effects),
      border-radius var(--motion-spatial), transform var(--motion-spatial);
  }
  :host([state="on"]) .tile {
    --_bg: var(--tile-on-bg); --_fg: var(--tile-on-fg); --_state: var(--tile-on-fg);
    --slider-fill: var(--tile-on-slider-fill); --slider-track: var(--tile-on-slider-track);
  }
  :host([state="danger"]) .tile { --_bg: var(--tile-alert-bg); --_fg: var(--tile-alert-fg); --_state: var(--tile-alert-fg); }
  /* an alarm reads as an alarm whatever own CSS says: from inside, !important wins over ::part() from outside */
  :host([state="danger"]) .tile {
    background: var(--tile-alert-bg) !important; background-image: none !important; color: var(--tile-alert-fg) !important;
    text-shadow: none !important; box-shadow: inset 0 0 0 var(--tile-outline-width) var(--tile-outline) !important; border: 0 none !important;
    padding: var(--tile-pad) !important;
    /* a transition wins over !important: the alarm keeps its own, never one that makes the old colour linger */
    transition: background-color var(--motion-effects), color var(--motion-effects), opacity var(--motion-effects), border-radius var(--motion-spatial), transform var(--motion-spatial) !important;
  }
  :host([state="danger"]) .tile:hover { background: color-mix(in srgb, var(--tile-alert-fg) var(--state-hover), var(--tile-alert-bg)) !important; }
  :host([state="danger"]) .tile::before, :host([state="danger"]) .tile::after { content: none !important; }
  :host([state="danger"]) .name, :host([state="danger"]) .state { color: var(--tile-alert-fg) !important; text-shadow: none !important; transition: none !important; }
  :host([state="danger"]) .name { font-size: var(--type-label-l-size) !important; }
  :host([state="danger"]) .state { font-size: var(--type-body-s-size) !important; }
  :host([state="unavailable"]) .tile { --_bg: var(--tile-unavailable-bg); }
  :host([stale]) .tile { opacity: var(--state-stale); cursor: default; }
  .tile:hover { background: color-mix(in srgb, var(--_fg) var(--state-hover), var(--_bg)); }
  .tile:active:not(:has(mh-slider:active, .more:active, .controls:active)) { transform: scale(var(--press-scale)); border-radius: var(--tile-radius-pressed); }
  .tile:has(.face:focus-visible) { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
  .face { display: flex; flex-direction: column; flex: 1; min-width: 0; outline: none; }
  :host([wide]) .face { flex: 0 0 auto; }

  .head { display: flex; flex-direction: column; justify-content: space-between; gap: var(--space-10); flex: 1; min-width: 0; }
  :host([wide]) .head { flex-direction: row; align-items: center; justify-content: flex-start; flex: 0 0 auto; }
  .icon {
    flex: none; width: var(--tile-icon-box); height: var(--tile-icon-box); display: grid; place-items: center;
    background: var(--tile-icon-bg); color: var(--tile-icon-fg); clip-path: var(--shape-circle);
    transition: background-color var(--motion-effects), color var(--motion-effects), clip-path var(--motion-spatial);
    --icon-size: var(--icon-l);
  }
  :host([state="on"]) .icon { background: var(--tile-icon-on-bg); color: var(--tile-icon-on-fg); clip-path: var(--shape-cookie); }
  :host([state="danger"]) .icon {
    background: var(--tile-icon-alert-bg) !important; color: var(--tile-icon-alert-fg) !important; clip-path: var(--shape-cookie);
    box-shadow: none !important; border: 0 none !important;
    transition: background-color var(--motion-effects), color var(--motion-effects), clip-path var(--motion-spatial) !important;
  }
  :host([state="unavailable"]) .icon {
    background: transparent; clip-path: none; border-radius: 50%; box-shadow: inset 0 0 0 var(--tile-unavailable-ring) var(--c-outline-variant);
  }
  :host([state="unavailable"]) .icon, :host([state="unavailable"]) .name { opacity: var(--tile-unavailable-opacity); }
  .text { display: grid; gap: var(--space-2); min-width: 0; }
  .name {
    font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .state {
    display: flex; align-items: center; gap: var(--space-4); min-width: 0;
    font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--_state); white-space: nowrap;
  }
  .state span { overflow: hidden; text-overflow: ellipsis; }
  .warn { color: var(--tile-badge-fg); --icon-size: var(--icon-xs); }

  .more {
    all: unset; box-sizing: border-box; position: absolute; top: var(--space-6); right: var(--space-6);
    width: var(--tile-more-size); height: var(--tile-more-size); display: grid; place-items: center;
    border-radius: var(--shape-full); color: var(--_state); cursor: pointer; opacity: 0;
    transition: opacity var(--motion-effects), background-color var(--motion-effects);
    --icon-size: var(--icon-m);
  }
  .grip { position: absolute; top: var(--space-8); right: var(--space-8); display: grid; color: var(--edit-handle-fg); --icon-size: var(--icon-m); touch-action: none; }
  :host([editing]) .tile { box-shadow: inset 0 0 0 var(--edit-ring-width) var(--edit-tile-ring); cursor: grab; }
  :host([editing][state="on"]) .grip, :host([editing][state="danger"]) .grip { color: var(--_fg); }
  :host([editing]) mh-slider { pointer-events: none; }
  :host([editing]) .head { padding-right: calc(var(--icon-m) + var(--space-4)); }
  :host([editing][density="compact"]) .head { padding-right: 0; }
  :host([editing][density="compact"]) .tile { padding-right: calc(var(--icon-m) + var(--space-16)); }
  :host([density="compact"]) .grip { top: 50%; transform: translateY(-50%); }
  .more:hover { background: color-mix(in srgb, currentColor var(--state-pressed), transparent); }
  .tile:hover .more, .more:focus-visible { opacity: 1; }
  .more:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }

  :host([density="compact"]) .tile { flex-direction: row; align-items: center; }
  :host([density="compact"]) .face { flex: 1 1 0; }
  :host([density="compact"][wide]) .face { flex: 0 0 var(--tile-wide-face-basis); }
  /* a wide tile with nothing beside its head: the head takes the whole width */
  :host([wide]) .tile:not(.light, .multi, .tank, :has(.controls)) .face { flex: 1 1 0; justify-content: center; }
  :host([density="compact"]) .head { flex-direction: row; align-items: center; justify-content: flex-start; flex: 1 1 0; }
  :host([density="compact"]) .icon { --icon-size: var(--icon-m); }
  :host([density="compact"]) .more { top: 50%; right: var(--space-4); transform: translateY(-50%); }

  /* a phone: a row of two, the icon beside the name */
  :host([density="phone"]) .tile { flex-direction: row; align-items: center; }
  :host([density="phone"]) .face { flex: 1 1 0; }
  :host([density="phone"]) .head { flex-direction: row; align-items: center; justify-content: flex-start; flex: 1 1 0; }
  :host([density="phone"]) .icon { --icon-size: var(--icon-m); }
  :host([density="phone"]) .text { gap: 0; }
  :host([density="phone"]) .name {
    font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); white-space: normal; overflow-wrap: anywhere; hyphens: auto;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  }
  :host([density="phone"]) .state { font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); white-space: normal; }
  :host([density="phone"]) .state span { overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  /* holding opens the window; only the keyboard still needs the button, and a finger must not hit it unseen */
  :host([density="phone"]) .more { top: 50%; right: var(--space-4); transform: translateY(-50%); pointer-events: none; }
  :host([density="phone"]) .more:focus-visible { pointer-events: auto; }
  :host([density="phone"]) .tile:hover .more:not(:focus-visible) { opacity: 0; }

  @media (prefers-reduced-motion: reduce) {
    :host([state="on"]) .icon, :host([state="danger"]) .icon { clip-path: var(--shape-circle); }
  }
`;

/**
 * A tile for one device. It shows the head (icon, name, state) as a button for assistive technology,
 * the "Meer" button for the device window, and whatever the kind adds; a tap does what the view says.
 */
export abstract class DeviceTileElement<S extends DeviceTileSpec = DeviceTileSpec> extends TileElement<S> {
  protected view!: TileView;
  private stopLongPress: (() => void) | null = null;

  static override styles: CSSResultGroup = [TileElement.styles, deviceTileStyles];

  protected deviceIds(): string[] {
    return [this.spec.deviceId];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (this.spec && this.ctx) {
      this.view = tileView(this.spec, this.ctx.store.getDevice(this.spec.deviceId), this.ctx.t, this.ctx.busy(this.spec.deviceId));
      this.state = this.view.state;
    }
  }

  protected override firstUpdated(): void {
    this.hold();
  }

  /** Begins to watch, anew when it already did, for what holding the tile does. */
  protected hold(): void {
    this.stopLongPress?.();
    const box = this.shadowRoot?.querySelector<HTMLElement>('.tile');
    this.stopLongPress = box ? this.watchHold(box) : null;
  }

  /** What holding the tile does: it opens the window of its device. Returns how to stop. */
  protected watchHold(box: HTMLElement): () => void {
    return observeLongPress(box, () => this.openDevice(), () => !this.editing);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopLongPress?.();
    this.stopLongPress = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // reattached after a move: the long press needs its listeners again
    if (this.hasUpdated && !this.stopLongPress) this.hold();
  }

  protected openDevice(): void {
    this.ctx.actions.openDevice(this.spec.deviceId);
  }

  /** What a tap, Enter or space does. */
  protected activate(): void {
    const { spec, ctx, view } = this;
    if (this.editing) this.openMenu();
    else if (view.tap === 'toggle' && (spec.kind === 'light' || spec.kind === 'switch')) ctx.actions.toggle(spec);
    else if (view.tap === 'press' && spec.kind === 'button') ctx.actions.press(spec.deviceId, spec.capabilityId);
    else this.openDevice();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.activate();
  }

  protected renderHead(): TemplateResult {
    const { view } = this;
    const filled = view.state === 'on' || view.state === 'danger';
    return html`<div class="head">
      <span class="icon" part=${`tile-icon ${tileStatePart(view.state)}`}><mh-icon name=${view.icon} ?filled=${filled}></mh-icon></span>
      <span class="text"><span class="name" part=${`tile-name ${tileStatePart(view.state)}`}>${view.name}</span>${this.renderState()}</span>
    </div>`;
  }

  protected renderState(): TemplateResult | typeof nothing {
    const { view } = this;
    if (!view.stateText && !view.warn) return nothing;
    return html`<span class="state" part=${`tile-state ${tileStatePart(view.state)}`}>${view.warn ? html`<mh-icon class="warn" name="battery_alert" filled></mh-icon>` : nothing}<span>${view.stateText}</span></span>`;
  }

  /** The part names of the tile: what it is and its state, for own CSS. */
  private partNames(): string {
    return ['tile', this.localName === 'mh-flow-tile' ? 'flow' : '', tileStatePart(this.view.state), this.wide ? 'wide' : ''].filter(Boolean).join(' ');
  }

  /** What lies behind the face, such as the history of a wide sensor tile. */
  protected renderBehind(): TemplateResult | typeof nothing {
    return nothing;
  }

  /** What a screen reader hears after the name and the state. */
  protected ariaExtra(): string {
    return '';
  }

  /** The part below or beside the head: a slider, cells or a bar. */
  protected renderExtra(): TemplateResult | typeof nothing {
    return nothing;
  }

  protected renderFace(): TemplateResult {
    return this.renderHead();
  }

  /** The name while editing: a sensor with its value, so two tiles of one device are told apart. */
  private get editName(): string {
    const { view } = this;
    return this.spec.kind === 'sensor' && view.subText ? this.ctx.t('tile.join', { a: view.name, b: view.subText }) : view.name;
  }

  override render() {
    const { view } = this;
    const editing = this.editing;
    const toggles = view.tap === 'toggle' && !editing;
    const extra = this.ariaExtra();
    return html`<div class="tile ${this.spec.kind}" part=${this.partNames()} @click=${() => this.activate()}>
      ${this.renderBehind()}
      <div class="face" role="button" tabindex="0" aria-label=${editing ? this.ctx.t('edit.tile.open', { name: this.editName }) : extra ? `${view.ariaLabel}, ${extra}` : view.ariaLabel}
        aria-pressed=${toggles ? (view.state === 'on' ? 'true' : 'false') : nothing}
        @keydown=${(event: KeyboardEvent) => this.onKey(event)}>${this.renderFace()}</div>
      ${this.renderExtra()}
      ${editing ? html`<span class="grip hit" data-grip><mh-icon name="drag_indicator"></mh-icon></span>` : html`<button class="more hit" aria-label=${this.ctx.t('tile.more', { name: view.name })}
        @pointerdown=${(event: Event) => event.stopPropagation()}
        @click=${(event: Event) => { event.stopPropagation(); this.openDevice(); }}><mh-icon name="more_vert"></mh-icon></button>`}
    </div>`;
  }
}
