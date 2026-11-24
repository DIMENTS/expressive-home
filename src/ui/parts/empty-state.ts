import { LitElement, css, html } from 'lit';
import type { IconName } from '../icons/icons';
import { sharedStyles } from './shared-styles';
import './icon';

/**
 * The empty state: a cookie of 120 on the primary container with a large icon, a heading
 * and one paragraph; buttons go in the `actions` slot.
 */
export class MhEmptyState extends LitElement {
  static override properties = {
    icon: { type: String },
    heading: { type: String },
  };

  declare icon: IconName;
  declare heading: string;

  constructor() {
    super();
    this.icon = 'devices_other';
    this.heading = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: grid; justify-items: center; gap: var(--space-12); padding: var(--empty-pad) var(--space-24); text-align: center; }
    .art {
      width: var(--empty-art-size); height: var(--empty-art-size); display: grid; place-items: center; margin-bottom: var(--space-12);
      background: var(--c-primary-container); color: var(--c-on-primary-container); clip-path: var(--shape-cookie);
      --icon-size: var(--empty-icon-size);
    }
    h2 {
      margin: 0; font-size: var(--type-value-size); line-height: var(--type-value-line); font-weight: var(--weight-strong);
      letter-spacing: var(--tracking-display);
    }
    p { margin: 0; max-width: var(--empty-text-width); color: var(--c-on-surface-variant); }
    .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-12); }
  `];

  override render() {
    return html`<div class="art"><mh-icon name=${this.icon} filled></mh-icon></div>
      <h2>${this.heading}</h2><p><slot></slot></p><div class="actions"><slot name="actions"></slot></div>`;
  }
}

if (!customElements.get('mh-empty-state')) customElements.define('mh-empty-state', MhEmptyState);

declare global {
  interface HTMLElementTagNameMap { 'mh-empty-state': MhEmptyState }
}
