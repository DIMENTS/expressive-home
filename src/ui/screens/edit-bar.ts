import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import type { MenuGroup } from '../parts/menu';
import { richText } from '../parts/rich-text';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/button';
import '../parts/icon';
import '../parts/note';
import './section-menu';

/**
 * The bar at the top of a dashboard while editing: what is being edited, "Ongedaan maken", the menu of
 * the dashboard and "Klaar". It stays in view while scrolling. While the Overzicht is automatic a note under it says
 * what the first change does.
 */
export class MhEditBar extends LitElement {
  static override properties = {
    t: { attribute: false },
    boardName: { type: String },
    canUndo: { type: Boolean },
    firstTime: { type: Boolean },
    menu: { attribute: false },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare boardName: string;
  declare canUndo: boolean;
  declare firstTime: boolean;
  /** The menu of the dashboard (5.9). */
  declare menu: MenuGroup[];

  constructor() {
    super();
    this.t = dutch;
    this.boardName = '';
    this.canUndo = false;
    this.firstTime = false;
    this.menu = [];
  }

  static override styles = [sharedStyles, css`
    :host { display: contents; }
    .bar {
      position: sticky; top: var(--space-8); z-index: var(--layer-edit-bar); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-8) var(--space-12);
      min-height: var(--edit-bar-height); margin: 0 0 var(--space-16); padding: var(--space-8) var(--space-8) var(--space-8) var(--space-20);
      border-radius: var(--edit-bar-radius); background: var(--edit-bar-bg); color: var(--edit-bar-fg); box-shadow: var(--shadow-overlay);
      --icon-size: var(--icon-l);
      /* what is inside the bar takes its colour */
      --button-text-fg: var(--edit-bar-fg); --section-menu-trigger-fg: var(--edit-bar-fg);
    }
    .title { flex: 1 1 0; min-width: min(100%, calc(var(--edit-bar-height) * 3)); display: grid; }
    .title b { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); overflow-wrap: anywhere; }
    .title span { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); }
    mh-note { margin: 0 0 var(--space-16); }
  `];

  private emit(type: 'undo' | 'done' | 'board-action', detail?: { id: string }): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** "Ongedaan maken" has the focus; when there is nothing left to undo, it goes to "Klaar". */
  private undoFocused = false;

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('canUndo') || this.canUndo || !this.undoFocused) return;
    this.undoFocused = false;
    [...this.shadowRoot!.querySelectorAll('mh-button')].at(-1)?.focus();
  }

  /** The arrows go from button to button, as in every toolbar; those in the open menu are the menu's. */
  private onKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const path = event.composedPath();
    if (step === 0 || path.some((node) => node instanceof Element && node.localName === 'mh-menu')) return;
    const buttons = [...(this.shadowRoot?.querySelectorAll<HTMLElement & { disabled?: boolean }>('mh-button, mh-section-menu') ?? [])].filter((b) => !b.disabled);
    const at = buttons.findIndex((b) => path.includes(b));
    if (at === -1) return;
    event.preventDefault();
    buttons[(at + step + buttons.length) % buttons.length]?.focus();
  }

  override render() {
    const t = this.t;
    return html`<div class="bar" role="toolbar" aria-label=${t('edit.toolbar')} @keydown=${(e: KeyboardEvent) => this.onKey(e)}>
        <mh-icon name="edit" filled></mh-icon>
        <div class="title"><b>${t('edit.title', { name: this.boardName })}</b><span>${t('edit.hint')}</span></div>
        <mh-button variant="text" ?disabled=${!this.canUndo} @click=${() => this.emit('undo')} @focusin=${() => { this.undoFocused = true; }} @focusout=${() => { this.undoFocused = false; }}><mh-icon name="undo"></mh-icon>${t('edit.undo')}</mh-button>
        ${this.menu.length > 0 ? html`<mh-section-menu label=${this.boardName} .t=${t} .groups=${this.menu}
          @toggle=${(e: Event) => e.stopPropagation()}
          @select=${(e: CustomEvent<{ id: string }>) => { e.stopPropagation(); this.emit('board-action', { id: e.detail.id }); }}></mh-section-menu>` : nothing}
        <mh-button @click=${() => this.emit('done')}>${t('edit.done')}</mh-button>
      </div>
      ${this.firstTime ? html`<mh-note icon="info">${richText(t('edit.firstTime'))}</mh-note>` : nothing}`;
  }
}

if (!customElements.get('mh-edit-bar')) customElements.define('mh-edit-bar', MhEditBar);

declare global {
  interface HTMLElementTagNameMap { 'mh-edit-bar': MhEditBar }
}
