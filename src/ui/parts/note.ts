import { LitElement, css, html, nothing } from 'lit';
import type { IconName } from '../icons/icons';
import { sharedStyles } from './shared-styles';
import './icon';

/** A lasting explanation or limit: an icon and a line of text, as an error on the error container, as good news on the primary one. */
export class MhNote extends LitElement {
  static override properties = {
    icon: { type: String },
    tone: { type: String, reflect: true },
  };

  declare icon: IconName | '';
  declare tone: 'neutral' | 'error' | 'ok';

  constructor() {
    super();
    this.icon = '';
    this.tone = 'neutral';
  }

  static override styles = [sharedStyles, css`
    :host {
      display: flex; gap: var(--space-12); align-items: flex-start; padding: var(--space-12) var(--space-16);
      border-radius: var(--note-radius); background: var(--note-bg); color: var(--note-fg);
      font-size: var(--type-label-m-size); line-height: var(--type-body-l-line);
    }
    :host([tone="error"]) { background: var(--banner-bg); color: var(--banner-fg); }
    :host([tone="ok"]) { background: var(--banner-ok-bg); color: var(--banner-ok-fg); }
    mh-icon { --icon-size: var(--icon-m); margin-top: var(--space-2); }
    ::slotted(b), ::slotted(strong) { font-weight: var(--weight-strong); }
  `];

  override render() {
    return html`${this.icon ? html`<mh-icon name=${this.icon} ?filled=${this.tone !== 'neutral'}></mh-icon>` : nothing}<div><slot></slot></div>`;
  }
}

if (!customElements.get('mh-note')) customElements.define('mh-note', MhNote);

declare global {
  interface HTMLElementTagNameMap { 'mh-note': MhNote }
}
