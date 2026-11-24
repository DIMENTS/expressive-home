import { LitElement, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t as dutch, type Translate } from '../../i18n';
import { LIMITS, ROOMS_ID } from '../../layout/types';
import type { IconName } from '../icons/icons';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/icon';

/** Where a tap in the rail goes: a dashboard, or a panel. */
export type RailTarget = `board:${string}` | 'theme' | 'settings';

/** A dashboard in the rail; `badge` is the dot for something new on the hub. */
export interface RailBoard { id: string; name: string; icon: IconName; badge: boolean }

/**
 * The navigation rail: the dashboards at the top, and "Nieuw" under them while editing;
 * "Bewerken" (a toggle), "Thema" and "Instellingen" at the bottom. The open dashboard has the indicator and a filled
 * icon; Thema and Instellingen have it while their panel is open. More than six dashboards scroll.
 */
export class MhRail extends LitElement {
  static override properties = {
    t: { attribute: false },
    boards: { attribute: false },
    activeBoard: { type: String },
    panel: { type: String },
    editing: { type: Boolean },
    editBlocked: { type: Boolean },
    useOnly: { type: Boolean },
  };
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare boards: RailBoard[];
  declare activeBoard: string;
  declare panel: 'none' | 'theme' | 'settings';
  declare editing: boolean;
  /** There is no dashboard to edit yet. */
  declare editBlocked: boolean;
  /** This device may not arrange the dashboards: there is no "Bewerken". */
  declare useOnly: boolean;

  constructor() {
    super();
    this.t = dutch;
    this.boards = [];
    this.activeBoard = '';
    this.panel = 'none';
    this.editing = false;
    this.editBlocked = false;
    this.useOnly = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    nav {
      position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; gap: var(--space-16);
      padding: max(var(--space-32), env(safe-area-inset-top)) 0 max(var(--space-24), env(safe-area-inset-bottom));
    }
    .boards {
      flex: 0 1 auto; display: flex; flex-direction: column; align-items: center; gap: var(--space-12); min-height: var(--rail-item-height);
      max-height: calc(6 * (var(--rail-item-height) + var(--space-12)) + var(--space-8)); overflow-y: auto; overscroll-behavior: contain;
      margin: calc(var(--space-4) * -1) 0; padding: var(--space-4);
    }
    .grow { flex: 1; }
    button {
      all: unset; box-sizing: border-box; cursor: pointer; flex: none; display: grid; justify-items: center; align-content: center; gap: var(--space-4);
      min-width: var(--rail-item-min-width); min-height: var(--rail-item-height); border-radius: var(--shape-lg);
      font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); font-weight: var(--weight-strong); color: var(--rail-item-fg);
      --icon-size: var(--icon-l);
    }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .indicator {
      position: relative; width: var(--rail-indicator-width); height: var(--rail-indicator-height); border-radius: var(--rail-indicator-radius);
      display: grid; place-items: center; transition: background-color var(--motion-effects), color var(--motion-effects);
    }
    button:hover .indicator { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    button:disabled { cursor: default; opacity: var(--state-disabled-content); }
    button:disabled:hover .indicator { background: none; }
    button.active { color: var(--rail-item-active-fg); }
    button.active .indicator { background: var(--rail-indicator-bg); color: var(--rail-indicator-fg); }
    .new .indicator { border: var(--add-slot-border-width) dashed var(--add-slot-border); }
    .badge {
      position: absolute; top: var(--space-2); right: var(--space-12); width: var(--rail-badge-size); height: var(--rail-badge-size);
      border-radius: 50%; background: var(--rail-badge-bg);
    }
    .name { max-width: calc(var(--rail-width) - var(--space-12)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `];

  private emit(type: 'navigate' | 'toggle-edit' | 'new-board', detail?: { to: RailTarget }): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  private face(icon: IconName, name: string, active: boolean, badge = false) {
    return html`<span class="indicator"><mh-icon name=${icon} ?filled=${active}></mh-icon>${badge ? html`<span class="badge"></span>` : nothing}</span><span class="name">${name}</span>`;
  }

  private board(board: RailBoard) {
    const active = board.id === this.activeBoard && (this.panel === 'none' || this.editing);
    return html`<button class=${active ? 'active' : ''} aria-current=${active ? 'page' : 'false'} title=${board.name}
      aria-label=${board.badge ? this.t('nav.news', { name: board.name }) : nothing}
      @click=${() => this.emit('navigate', { to: `board:${board.id}` })}>${this.face(board.icon, board.name, active, board.badge)}</button>`;
  }

  private panelItem(to: 'theme' | 'settings', icon: IconName, name: string) {
    const active = this.panel === to;
    return html`<button class=${active ? 'active' : ''} aria-current=${active ? 'page' : 'false'} @click=${() => this.emit('navigate', { to })}>${this.face(icon, name, active)}</button>`;
  }

  /** The focus goes to "Bewerken". */
  focusEdit(): void {
    this.shadowRoot?.querySelector<HTMLElement>('.edit')?.focus();
  }

  override render() {
    const t = this.t;
    const editing = this.editing && this.panel === 'none';
    return html`<nav aria-label=${t('nav.label')}>
      <div class="boards">${repeat(this.boards, (board) => board.id, (board) => this.board(board))}</div>
      ${this.editing && this.boards.filter((board) => board.id !== ROOMS_ID).length < LIMITS.dashboards ? html`<button class="new" @click=${() => this.emit('new-board')}>${this.face('add', t('nav.newBoard'), false)}</button>` : nothing}
      <span class="grow"></span>
      ${this.useOnly ? nothing : html`<button class="edit ${editing ? 'active' : ''}" ?disabled=${this.editBlocked} aria-pressed=${this.editing ? 'true' : 'false'} @click=${() => this.emit('toggle-edit')}>${this.face('edit', t('nav.edit'), editing)}</button>`}
      ${this.panelItem('theme', 'palette', t('nav.theme'))}${this.panelItem('settings', 'settings', t('nav.settings'))}
    </nav>`;
  }
}

if (!customElements.get('mh-rail')) customElements.define('mh-rail', MhRail);

declare global {
  interface HTMLElementTagNameMap { 'mh-rail': MhRail }
}
