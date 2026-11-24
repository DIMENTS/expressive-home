import { LitElement, css, html } from 'lit';
import { sharedStyles } from './shared-styles';

/**
 * The loading shape: it morphs between cookie, clover and flower while it turns.
 * 22 in a button, 56 on its own. With reduced motion it stands still as a cookie.
 */
export class MhLoader extends LitElement {
  static override properties = { size: { type: String, reflect: true } };
  declare size: 'small' | 'large';

  constructor() {
    super();
    this.size = 'small';
  }

  static override styles = [sharedStyles, css`
    :host { display: inline-block; flex: none; width: var(--loader-small); height: var(--loader-small); color: inherit; }
    :host([size="large"]) { width: var(--loader-large); height: var(--loader-large); color: var(--c-primary); }
    span {
      display: block; width: 100%; height: 100%; background: currentColor; clip-path: var(--shape-cookie);
      animation: morph var(--motion-loader) var(--easing-spatial) infinite, spin var(--motion-loader) linear infinite;
    }
    @keyframes morph { 0%, 100% { clip-path: var(--shape-cookie); } 33% { clip-path: var(--shape-clover); } 66% { clip-path: var(--shape-flower); } }
    @keyframes spin { to { transform: rotate(360deg); } }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('aria-hidden', 'true');
  }

  override render() {
    return html`<span></span>`;
  }
}

if (!customElements.get('mh-loader')) customElements.define('mh-loader', MhLoader);

declare global {
  interface HTMLElementTagNameMap { 'mh-loader': MhLoader }
}
