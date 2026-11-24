import { css, html } from 'lit';
import { ChoiceBase } from './choice-group';
import { sharedStyles } from './shared-styles';
import './icon';

/** Radio buttons: for more or longer options, one under the other; the chosen one in the primary colour. */
export class MhRadioList extends ChoiceBase {
  static override styles = [sharedStyles, css`
    :host { display: block; }
    .list { display: grid; grid-template-columns: minmax(0, 1fr); }
    .option {
      cursor: pointer; display: flex; align-items: center; gap: var(--space-12); min-height: var(--radio-height);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); border-radius: var(--shape-sm);
      --icon-size: var(--icon-l);
    }
    .option span { min-width: 0; overflow-wrap: anywhere; }
    .option mh-icon { flex: none; color: var(--c-outline); }
    .option[aria-checked="true"] mh-icon { color: var(--c-primary); }
    :host([disabled]) .option { cursor: default; opacity: var(--state-disabled-content); }
  `];

  override render() {
    return html`<div class="list" role="radiogroup" aria-label=${this.label}>${this.options.map((option, index) => {
      const checked = option.id === this.value;
      return this.renderOption(option, index, html`<mh-icon name=${checked ? 'radio_button_checked' : 'radio_button_unchecked'}></mh-icon><span>${option.label}</span>`);
    })}</div>`;
  }
}

if (!customElements.get('mh-radio-list')) customElements.define('mh-radio-list', MhRadioList);

declare global {
  interface HTMLElementTagNameMap { 'mh-radio-list': MhRadioList }
}
