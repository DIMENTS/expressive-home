import { LitElement, css, html } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ICONS, type IconName } from '../icons/icons';
import { stillStyles } from './shared-styles';

/**
 * An icon from the bundled set. Both variants lie on top of each other, so switching between
 * outlined and filled is a short cross-fade. The size comes from --icon-size (default --icon-l).
 * Always hidden from screen readers: the meaning is carried by text next to it.
 */
export class MhIcon extends LitElement {
  static override properties = {
    name: { type: String },
    filled: { type: Boolean, reflect: true },
  };

  declare name: IconName | string;
  declare filled: boolean;

  constructor() {
    super();
    this.name = 'info';
    this.filled = false;
  }

  static override styles = [stillStyles, css`
    :host {
      display: inline-grid; flex: none; vertical-align: middle;
      width: var(--icon-size, var(--icon-l)); height: var(--icon-size, var(--icon-l));
    }
    span { grid-area: 1 / 1; display: grid; transition: opacity var(--motion-effects); }
    svg { width: 100%; height: 100%; fill: currentColor; }
    .fill, :host([filled]) .outline { opacity: 0; }
    :host([filled]) .fill { opacity: 1; }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('aria-hidden', 'true');
  }

  override render() {
    const icon = ICONS[this.name as IconName] ?? ICONS.info;
    return html`<span class="outline">${unsafeHTML(icon.outline)}</span><span class="fill">${unsafeHTML(icon.fill)}</span>`;
  }
}

if (!customElements.get('mh-icon')) customElements.define('mh-icon', MhIcon);

declare global {
  interface HTMLElementTagNameMap { 'mh-icon': MhIcon }
}
