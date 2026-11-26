import { LitElement, css, html } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import { sharedStyles } from '../parts/shared-styles';
import { connectCardStyles } from './connect-card';
import '../parts/icon';

/**
 * What the app shows inside a frame of another website, in place of everything else: why it does not open there, and a
 * link that opens it in a tab of its own. The address is there as text too, for a frame that may not open a tab.
 */
export class MhFramedScreen extends LitElement {
  static override properties = {
    t: { attribute: false },
    address: { type: String },
  };

  /** The texts, in the language of the browser. */
  declare t: Translate;
  /** The address of this page. */
  declare address: string;

  constructor() {
    super();
    this.t = dutch;
    this.address = '';
  }

  static override styles = [sharedStyles, connectCardStyles, css`
    .open {
      display: flex; align-items: center; justify-content: center; gap: var(--space-8); min-height: var(--button-height); min-width: var(--target-min);
      padding: 0 var(--space-24); border-radius: var(--button-radius); background: var(--button-filled-bg); color: var(--button-filled-fg);
      text-decoration: none; text-align: center; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong);
      --icon-size: var(--icon-m); transition: border-radius var(--motion-spatial);
    }
    .open:hover { background: color-mix(in srgb, var(--button-filled-fg) var(--state-hover), var(--button-filled-bg)); }
    .open:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .open:active { border-radius: var(--button-radius-pressed); }
    .or { margin: 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .address { margin: 0; font-size: var(--type-label-l-size); line-height: var(--type-body-l-line); overflow-wrap: anywhere; user-select: all; }
  `];

  override render() {
    const { t } = this;
    return html`<div class="card">
      <div class="intro">
        <div class="art" aria-hidden="true"></div>
        <h1>${t('framed.title')}</h1>
        <p class="lead">${t('framed.lead')}</p>
      </div>
      <div class="form">
        <h2>${t('framed.heading')}</h2>
        <a class="open" href=${this.address} target="_blank" rel="noopener noreferrer">${t('framed.open')}<span class="unseen">${t('gallery.newTab')}</span><mh-icon name="open_in_new"></mh-icon></a>
        <p class="or">${t('framed.address')}</p>
        <p class="address">${this.address}</p>
      </div>
    </div>`;
  }
}

if (!customElements.get('mh-framed-screen')) customElements.define('mh-framed-screen', MhFramedScreen);

declare global {
  interface HTMLElementTagNameMap { 'mh-framed-screen': MhFramedScreen }
}
