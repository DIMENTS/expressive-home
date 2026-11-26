import { LitElement, css, html, nothing } from 'lit';
import type { IconName } from '../icons/icons';
import { sharedStyles } from './shared-styles';
import './icon';

/**
 * A label in the header: 36 high, fully round. Alert labels use the error container and a
 * filled icon. An interactive label is a button with a 48 high target; a plain one is text. With `iconOnly` it is a
 * round icon (a phone); `label` is then its name.
 */
export class MhChip extends LitElement {
  static override properties = {
    icon: { type: String },
    tone: { type: String, reflect: true },
    interactive: { type: Boolean, reflect: true },
    spinning: { type: Boolean, reflect: true },
    iconOnly: { type: Boolean, reflect: true, attribute: 'icon-only' },
    label: { type: String },
  };

  declare icon: IconName | '';
  declare tone: 'neutral' | 'alert';
  declare interactive: boolean;
  declare spinning: boolean;
  declare iconOnly: boolean;
  declare label: string;

  constructor() {
    super();
    this.icon = '';
    this.tone = 'neutral';
    this.interactive = false;
    this.spinning = false;
    this.iconOnly = false;
    this.label = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: inline-flex; }
    .chip {
      all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: var(--space-6);
      height: var(--chip-height); padding: 0 var(--space-14) 0 var(--space-10); border-radius: var(--chip-radius);
      background: var(--_bg); color: var(--_fg); --_bg: var(--chip-bg); --_fg: var(--chip-fg);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); white-space: nowrap;
      transition: background-color var(--motion-effects), color var(--motion-effects);
      --icon-size: var(--icon-s);
    }
    :host([tone="alert"]) .chip { --_bg: var(--chip-alert-bg); --_fg: var(--chip-alert-fg); }
    /* an alarm reads as an alarm whatever own CSS says */
    :host([tone="alert"]) .chip { background: var(--chip-alert-bg) !important; color: var(--chip-alert-fg) !important; text-shadow: none !important; }
    :host([icon-only]) .chip { justify-content: center; width: var(--chip-height); padding: 0; --icon-size: var(--icon-m); }
    button.chip { cursor: pointer; position: relative; }
    button.chip:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--_bg)); }
    button.chip:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    :host([spinning]) mh-icon { animation: spin var(--motion-spin) linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `];

  override render() {
    if (this.iconOnly) return html`<span class="chip" role="img" aria-label=${this.label} title=${this.label}><mh-icon name=${this.icon || nothing}></mh-icon></span>`;
    const inner = html`${this.icon ? html`<mh-icon name=${this.icon} ?filled=${this.tone === 'alert'}></mh-icon>` : nothing}<slot></slot>`;
    return this.interactive ? html`<button class="chip hit">${inner}</button>` : html`<span class="chip">${inner}</span>`;
  }
}

if (!customElements.get('mh-chip')) customElements.define('mh-chip', MhChip);

declare global {
  interface HTMLElementTagNameMap { 'mh-chip': MhChip }
}
