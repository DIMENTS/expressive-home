import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import { PHONE_MAX_PX } from '../breakpoints';
import type { IconName } from '../icons/icons';
import { phoneMedia } from '../phone';
import { trapFocus } from './focus-trap';
import { sharedStyles } from './shared-styles';
import { observeSheetDrag } from './sheet-drag';
import './button';
import './icon';

/**
 * The floating panel on the right, for the device window, the theme and the settings.
 * A modal dialog named after its heading: focus moves in and stays in, Escape, the close button and a
 * tap on the scrim ask to close (`close`), and focus returns to where it was. The parent sets `open`. On a phone
 * it comes from below, over the whole width, and can be swept down by its top.
 */
export class MhSheet extends LitElement {
  static override properties = {
    t: { attribute: false },
    open: { type: Boolean, reflect: true },
    heading: { type: String },
    subheading: { type: String },
    icon: { type: String },
    iconOn: { type: Boolean },
    back: { type: Boolean },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */

  declare t: Translate;

  declare open: boolean;
  declare heading: string;
  declare subheading: string;
  declare icon: IconName | '';
  /** The icon box in colour and in the cookie shape, for a device that is on. */
  declare iconOn: boolean;
  /** A second stand of the panel: a button back, reported as `back`. */
  declare back: boolean;
  private releaseFocus: (() => void) | null = null;
  private narrow = phoneMedia();
  private stopDrag: (() => void) | null = null;

  constructor() {
    super();
    this.t = dutch;
    this.open = false;
    this.heading = '';
    this.subheading = '';
    this.icon = '';
    this.iconOn = false;
    this.back = false;
    this.addEventListener('keydown', (event) => {
      if (this.open && event.key === 'Escape') {
        event.preventDefault();
        this.requestClose();
      }
    });
  }

  static override styles = [sharedStyles, css`
    :host { display: contents; }
    .scrim {
      position: fixed; inset: 0; z-index: var(--layer-sheet-scrim); background: var(--scrim); opacity: 0; pointer-events: none;
      transition: opacity var(--motion-effects);
    }
    :host([open]) .scrim { opacity: 1; pointer-events: auto; }
    .panel {
      position: fixed; z-index: var(--layer-sheet); top: max(var(--sheet-margin), env(safe-area-inset-top)); right: max(var(--sheet-margin), env(safe-area-inset-right)); bottom: max(var(--sheet-margin), env(safe-area-inset-bottom));
      width: min(var(--sheet-width), calc(100vw - 2 * var(--sheet-margin))); display: flex; flex-direction: column; overflow: hidden;
      background: var(--sheet-bg); color: var(--sheet-fg); border-radius: var(--sheet-radius); box-shadow: var(--shadow-overlay);
      transform: translateX(calc(100% + 2 * var(--sheet-margin) + env(safe-area-inset-right))); visibility: hidden;
      transition: transform var(--motion-spatial), visibility 0s linear var(--duration-spatial);
      outline: none;
    }
    :host([open]) .panel { transform: none; visibility: visible; transition: transform var(--motion-spatial), visibility 0s; }
    .head { display: flex; align-items: center; gap: var(--space-12); padding: var(--space-20) var(--space-16) var(--space-12) var(--space-20); }
    .icon-box {
      flex: none; width: var(--sheet-icon-box); height: var(--sheet-icon-box); display: grid; place-items: center;
      background: var(--c-surface-container-high); color: var(--tile-icon-fg); clip-path: var(--shape-circle);
      transition: background-color var(--motion-effects), color var(--motion-effects), clip-path var(--motion-spatial);
    }
    .icon-box.on { background: var(--tile-icon-on-bg); color: var(--tile-icon-on-fg); clip-path: var(--shape-cookie); }
    @media (prefers-reduced-motion: reduce) {
      .icon-box.on { clip-path: var(--shape-circle); }
    }
    .grab { display: none; }
    .titles { flex: 1; min-width: 0; }
    h2 {
      margin: 0; font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sub { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .body { overflow: auto; padding: var(--space-4) var(--space-20) var(--space-24); display: grid; gap: var(--space-20); align-content: start; flex: 1; }
    @media (width < ${PHONE_MAX_PX}px) {
      .panel {
        top: auto; left: 0; right: 0; bottom: 0; width: auto; max-height: var(--sheet-phone-height); padding-bottom: env(safe-area-inset-bottom);
        border-radius: var(--sheet-radius) var(--sheet-radius) 0 0; transform: translateY(100%);
        /* the overshoot of its movement lifts it off the edge: it goes on below the window */
        box-shadow: 0 var(--space-40) 0 var(--sheet-bg), var(--shadow-overlay);
      }
      :host([open]) .panel { transform: translateY(var(--_drag, 0)); }
      .panel[data-dragging] { transition: none; }
      .top { touch-action: none; cursor: grab; }
      .grab { display: block; width: var(--sheet-grab-width); height: var(--sheet-grab-height); margin: var(--space-10) auto 0; border-radius: var(--shape-full); background: var(--sheet-grab-fg); }
      .head { padding-top: var(--space-12); }
      .body { grid-template-columns: minmax(0, 1fr); overscroll-behavior: contain; }
    }
  `];

  /** When what had the focus was taken away, it goes to the panel, so Escape and Tab keep working. */
  keepFocus(): void {
    const active = document.activeElement;
    if (this.open && (active === null || active === document.body)) this.shadowRoot?.querySelector<HTMLElement>('.panel')?.focus();
  }

  private requestClose(): void {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  protected override updated(changed: PropertyValues<this>): void {
    // another stand: what had the focus is gone, so it goes to the panel and Escape keeps working
    if (this.open && changed.has('back') && !changed.has('open')) this.shadowRoot!.querySelector<HTMLElement>('.panel')?.focus();
    if (!changed.has('open')) return;
    if (this.open) {
      this.releaseFocus = trapFocus(this.shadowRoot!, this);
      this.shadowRoot!.querySelector<HTMLElement>('.panel')?.focus();
    } else if (this.releaseFocus) {
      this.releaseFocus();
      this.releaseFocus = null;
    }
  }

  protected override firstUpdated(): void {
    this.watchDrag();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.watchDrag();
  }

  private watchDrag(): void {
    const panel = this.shadowRoot?.querySelector<HTMLElement>('.panel');
    const top = this.shadowRoot?.querySelector<HTMLElement>('.top');
    if (panel && top) this.stopDrag ??= observeSheetDrag(top, panel, () => this.requestClose(), () => this.open && (this.narrow?.matches ?? false));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopDrag?.();
    this.stopDrag = null;
    this.releaseFocus?.();
    this.releaseFocus = null;
  }

  override render() {
    return html`
      <div class="scrim" @click=${() => this.requestClose()}></div>
      <aside class="panel" role="dialog" aria-modal="true" aria-labelledby="title" tabindex="-1" ?inert=${!this.open}>
        <div class="top"><div class="grab" aria-hidden="true"></div><div class="head">
          ${this.back ? html`<mh-button variant="icon" label=${this.t('picker.back')} @click=${() => this.dispatchEvent(new CustomEvent('back', { bubbles: true, composed: true }))}><mh-icon name="arrow_back"></mh-icon></mh-button>` : nothing}
          ${this.icon ? html`<span class="icon-box ${this.iconOn ? 'on' : ''}"><mh-icon name=${this.icon} ?filled=${this.iconOn}></mh-icon></span>` : nothing}
          <div class="titles"><h2 id="title">${this.heading}</h2>${this.subheading ? html`<div class="sub">${this.subheading}</div>` : nothing}</div>
          <mh-button variant="icon" label=${this.t('panel.close')} @click=${() => this.requestClose()}><mh-icon name="close"></mh-icon></mh-button>
        </div></div>
        <div class="body"><slot></slot></div>
      </aside>`;
  }
}

if (!customElements.get('mh-sheet')) customElements.define('mh-sheet', MhSheet);

declare global {
  interface HTMLElementTagNameMap { 'mh-sheet': MhSheet }
}
