import { LitElement, css, html, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t as dutch, type Translate } from '../../i18n';
import type { IconName } from '../icons/icons';
import type { MenuGroup } from '../parts/menu';
import { sharedStyles } from '../parts/shared-styles';
import { ROOMS_ID } from '../../layout/types';
import type { RailBoard, RailTarget } from './rail';
import '../parts/icon';
import '../parts/menu';

/**
 * The bar at the bottom of a phone, in the place of the rail: the dashboards, and "Meer" last, with the
 * theme and the settings. More dashboards than fit scroll beside "Meer"; the open one is brought into view. Reports
 * `navigate` as the rail does.
 */
export class MhNavBar extends LitElement {
  static override properties = {
    t: { attribute: false },
    boards: { attribute: false },
    activeBoard: { type: String },
    panel: { type: String },
    open: { state: true },
    tight: { state: true },
  };
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare boards: RailBoard[];
  declare activeBoard: string;
  declare panel: 'none' | 'theme' | 'settings';
  /** The menu of "Meer". */
  declare open: boolean;
  /** Not everything fits: the rooms stand in the menu. */
  declare tight: boolean;
  private resized: ResizeObserver | null = null;

  constructor() {
    super();
    this.t = dutch;
    this.boards = [];
    this.activeBoard = '';
    this.panel = 'none';
    this.open = false;
    this.tight = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    nav {
      position: fixed; z-index: var(--layer-nav-bar); left: 0; right: 0; bottom: 0; display: flex; align-items: stretch;
      padding: 0 var(--space-4) env(safe-area-inset-bottom); background: var(--nav-bar-bg); color: var(--rail-item-fg);
    }
    .boards { flex: 1; min-width: 0; display: flex; overflow-x: auto; overscroll-behavior: contain; scrollbar-width: none; }
    .boards::-webkit-scrollbar { display: none; }
    button {
      all: unset; box-sizing: border-box; cursor: pointer; flex: 1 0 auto; display: grid; justify-items: center; align-content: center; gap: var(--space-4);
      min-width: var(--nav-bar-item-min); max-width: var(--nav-bar-item-max); height: var(--nav-bar-height); padding: 0 var(--space-4); margin: 0 auto;
      font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); font-weight: var(--weight-strong); color: var(--rail-item-fg);
      -webkit-tap-highlight-color: transparent; --icon-size: var(--icon-l);
    }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: calc(-1 * var(--focus-width)); border-radius: var(--shape-lg); }
    .indicator {
      width: var(--rail-indicator-width); height: var(--rail-indicator-height); border-radius: var(--rail-indicator-radius);
      display: grid; place-items: center; transition: background-color var(--motion-effects), color var(--motion-effects);
    }
    button:hover .indicator { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    button.active { color: var(--rail-item-active-fg); }
    button.active .indicator { background: var(--rail-indicator-bg); color: var(--rail-indicator-fg); }
    .name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .more { position: relative; flex: none; display: flex; }
    .anchor { position: absolute; right: 0; bottom: 100%; z-index: var(--layer-menu); margin: 0 var(--space-4) var(--space-4) 0; color: var(--section-menu-fg); }
  `];

  private get rooms(): RailBoard | undefined {
    return this.boards.find((board) => board.id === ROOMS_ID);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === 'undefined') return;
    // another width: tried anew whether everything fits
    this.resized = new ResizeObserver(() => { this.tight = false; this.requestUpdate(); });
    this.resized.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resized?.disconnect();
    this.resized = null;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('boards') && changed.get('boards') !== undefined) this.tight = false;
  }

  /** When not everything fits, the rooms go to the menu; the dashboards scroll. */
  private measure(): void {
    const box = this.shadowRoot?.querySelector<HTMLElement>('.boards');
    if (box && this.rooms && !this.tight && box.scrollWidth > box.clientWidth + 1) this.tight = true;
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.measure();
    if (!changed.has('activeBoard') && !changed.has('boards')) return;
    const active = this.shadowRoot?.querySelector<HTMLElement>('.boards .open');
    if (changed.has('activeBoard')) active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private emit(to: RailTarget): void {
    this.dispatchEvent(new CustomEvent('navigate', { detail: { to }, bubbles: true, composed: true }));
  }

  private face(icon: IconName, name: string, active: boolean) {
    return html`<span class="indicator"><mh-icon name=${icon} ?filled=${active}></mh-icon></span><span class="name">${name}</span>`;
  }

  private board(board: RailBoard) {
    const open = board.id === this.activeBoard;
    const active = open && this.panel === 'none';
    return html`<button class="${open ? 'open' : ''} ${active ? 'active' : ''}" aria-current=${active ? 'page' : 'false'} title=${board.name}
      @click=${() => this.emit(`board:${board.id}`)}>${this.face(board.icon, board.name, active)}</button>`;
  }

  private groups(): MenuGroup[] {
    const { t } = this;
    const { rooms } = this;
    return [{ kind: 'items', id: 'more', title: '', items: [
      ...(rooms && this.tight ? [{ id: 'rooms', label: rooms.name, checked: null, icon: rooms.icon }] : []),
      { id: 'theme', label: t('nav.theme'), checked: null, icon: 'palette' },
      { id: 'settings', label: t('nav.settings'), checked: null, icon: 'settings' },
    ] }];
  }

  private get trigger(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>('.more > button') ?? null;
  }

  private onSelect(event: CustomEvent<{ id: string }>): void {
    event.stopPropagation();
    this.open = false;
    if (event.detail.id === 'rooms') this.emit(`board:${ROOMS_ID}`);
    if (event.detail.id === 'theme' || event.detail.id === 'settings') this.emit(event.detail.id);
  }

  private onClose(event: Event): void {
    event.stopPropagation();
    this.open = false;
    void this.updateComplete.then(() => this.trigger?.focus());
  }

  override render() {
    const { t } = this;
    const shown = this.tight ? this.boards.filter((board) => board.id !== ROOMS_ID) : this.boards;
    const more = this.panel !== 'none' || (this.tight && this.activeBoard === ROOMS_ID);
    return html`<nav aria-label=${t('nav.label')}>
      <div class="boards">${repeat(shown, (board) => board.id, (board) => this.board(board))}</div>
      <div class="more">
        <button class=${more ? 'active' : ''} aria-haspopup="menu" aria-expanded=${this.open ? 'true' : 'false'} @click=${() => { this.open = !this.open; }}>${this.face('more_vert', t('nav.more'), more)}</button>
        <div class="anchor"><mh-menu .t=${t} .open=${this.open} label=${t('nav.more')} .groups=${this.groups()} .anchor=${this.trigger}
          @select=${(e: CustomEvent<{ id: string }>) => this.onSelect(e)} @close=${(e: Event) => this.onClose(e)}></mh-menu></div>
      </div>
    </nav>`;
  }
}

if (!customElements.get('mh-nav-bar')) customElements.define('mh-nav-bar', MhNavBar);

declare global {
  interface HTMLElementTagNameMap { 'mh-nav-bar': MhNavBar }
}
