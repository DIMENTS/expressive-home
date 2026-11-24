import { LitElement, css, html, nothing } from 'lit';
import { PHONE_MAX_PX } from '../breakpoints';
import { sharedStyles } from './shared-styles';
import './loader';

export type ButtonVariant = 'filled' | 'tonal' | 'text' | 'danger' | 'icon';

/**
 * A button: filled for the one main action, tonal in a row, text for a side action,
 * danger for "Verbinding verbreken", icon for close and "more". The text comes through the slot;
 * `label` is its accessible name when the text does not say enough, as for the icon variant. A disabled or busy button fires no click.
 */
export class MhButton extends LitElement {
  static override properties = {
    variant: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    busy: { type: Boolean, reflect: true },
    block: { type: Boolean, reflect: true },
    small: { type: Boolean, reflect: true },
    label: { type: String },
    expanded: { type: String },
  };

  declare variant: ButtonVariant;
  declare disabled: boolean;
  declare busy: boolean;
  /** Full width, as on the connect screen. */
  declare block: boolean;
  /** The lower button inside a panel row. */
  declare small: boolean;
  declare label: string;
  /** 'true' or 'false' when it opens and closes something. */
  declare expanded: string;

  constructor() {
    super();
    this.variant = 'filled';
    this.disabled = false;
    this.busy = false;
    this.block = false;
    this.small = false;
    this.label = '';
    this.expanded = '';
    // Swallow clicks while disabled or busy, also a click on the host itself.
    this.addEventListener('click', (event) => {
      if (this.disabled || this.busy) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true });
  }

  static override styles = [sharedStyles, css`
    :host { display: inline-flex; vertical-align: middle; }
    :host([block]) { display: flex; }
    button {
      all: unset; box-sizing: border-box; cursor: pointer; flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-8);
      min-height: var(--button-height); padding: 0 var(--space-24); border-radius: var(--button-radius);
      font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); white-space: nowrap;
      transition: border-radius var(--motion-spatial), transform var(--motion-spatial), background-color var(--motion-effects), opacity var(--motion-effects);
      --icon-size: var(--icon-m);
    }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    button:not(:disabled):active { border-radius: var(--button-radius-pressed); transform: scale(var(--press-scale)); }
    button:disabled { cursor: default; opacity: var(--state-disabled-content); }
    :host([busy]) button { cursor: progress; }
    /* a long text on a narrow phone takes two lines */
    @media (width < ${PHONE_MAX_PX}px) { :host([block]) button { white-space: normal; text-align: center; } }
    .filled { background: var(--button-filled-bg); color: var(--button-filled-fg); }
    .filled:not(:disabled):hover { background: color-mix(in srgb, var(--button-filled-fg) var(--state-hover), var(--button-filled-bg)); }
    .tonal { background: var(--button-tonal-bg); color: var(--button-tonal-fg); }
    .tonal:not(:disabled):hover { background: color-mix(in srgb, var(--button-tonal-fg) var(--state-hover), var(--button-tonal-bg)); }
    .text, .danger { color: var(--button-text-fg); padding: 0 var(--space-16); }
    .danger { color: var(--button-danger-fg); }
    .text:not(:disabled):hover, .danger:not(:disabled):hover, .icon:not(:disabled):hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .icon {
      position: relative; flex: none; width: var(--icon-button-size); height: var(--icon-button-size); min-height: 0; padding: 0;
      color: var(--c-on-surface-variant); --icon-size: var(--icon-l);
    }
    :host([small]) button { position: relative; min-height: var(--button-small-height); padding: 0 var(--space-16); font-size: var(--type-label-m-size); }
  `];

  override render() {
    const icon = this.variant === 'icon';
    return html`<button
      class="${this.variant}${icon || this.small ? ' hit' : ''}"
      ?disabled=${this.disabled || this.busy}
      aria-busy=${this.busy ? 'true' : nothing}
      aria-label=${this.label || nothing}
      aria-expanded=${this.expanded || nothing}
    >${this.busy ? html`<mh-loader size="small"></mh-loader>` : nothing}<slot></slot></button>`;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('button')?.focus(options);
  }
}

if (!customElements.get('mh-button')) customElements.define('mh-button', MhButton);

declare global {
  interface HTMLElementTagNameMap { 'mh-button': MhButton }
}
