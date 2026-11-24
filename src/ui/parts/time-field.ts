import { LitElement, css, html } from 'lit';
import { live } from 'lit/directives/live.js';
import { isTime } from '../../wall/settings';
import { sharedStyles } from './shared-styles';

/** A time of day ("22:30") with its name before it; another one is reported as `change` with { value }, what is no time is not. */
export class MhTimeField extends LitElement {
  static override properties = {
    label: { type: String },
    value: { type: String },
  };

  declare label: string;
  declare value: string;

  constructor() {
    super();
    this.label = '';
    this.value = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-4) var(--space-8); min-width: 0; }
    label { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
    input {
      all: unset; box-sizing: border-box; min-width: 0; min-height: var(--target-min); padding: 0 var(--space-12); border-radius: var(--shape-md);
      background: var(--field-bg); color: var(--field-fg); box-shadow: inset 0 0 0 var(--field-outline-width) transparent; font-size: var(--type-body-l-size); line-height: var(--type-body-l-line);
      font-variant-numeric: tabular-nums; transition: box-shadow var(--motion-effects);
    }
    input:focus-within, input:focus { box-shadow: inset 0 0 0 var(--field-outline-width) var(--field-focus); }
  `];

  private onChange(event: Event): void {
    event.stopPropagation();
    const { value } = event.target as HTMLInputElement;
    if (!isTime(value) || value === this.value) return;
    this.value = value;
    this.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true, composed: true }));
  }

  override render() {
    return html`<label for="input">${this.label}</label>
      <input id="input" type="time" required .value=${live(this.value)} @input=${(e: Event) => e.stopPropagation()} @change=${(e: Event) => this.onChange(e)} @blur=${() => this.requestUpdate()}>`;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('input')?.focus(options);
  }
}

if (!customElements.get('mh-time-field')) customElements.define('mh-time-field', MhTimeField);

declare global {
  interface HTMLElementTagNameMap { 'mh-time-field': MhTimeField }
}
