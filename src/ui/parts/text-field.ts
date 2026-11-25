import { LitElement, css, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import type { IconName } from '../icons/icons';
import { sharedStyles } from './shared-styles';
import './icon';

/**
 * A text field: label above, a 56 high box with an icon, help text below. The help text is
 * linked to the input and read out; an error marks the input invalid. The value is only ever a
 * property, never an attribute, so a key typed into a password field cannot leak into the markup.
 */
export class MhTextField extends LitElement {
  static override properties = {
    label: { type: String },
    value: { attribute: false },
    type: { type: String },
    placeholder: { type: String },
    icon: { type: String },
    help: { type: String },
    helpIcon: { type: String },
    state: { type: String, reflect: true },
    disabled: { type: Boolean, reflect: true },
    quiet: { type: Boolean },
    hideLabel: { type: Boolean },
    maxlength: { type: Number },
    digits: { type: Boolean },
    multiline: { type: Boolean },
  };

  declare label: string;
  declare value: string;
  declare type: 'text' | 'password' | 'search';
  declare placeholder: string;
  declare icon: IconName | '';
  declare help: string;
  /** An icon before an idle help text, such as the lock under the key field. */
  declare helpIcon: IconName | '';
  declare state: 'idle' | 'ok' | 'error';
  declare disabled: boolean;
  /** Without a visible label and help text, such as a search field; the label is still its name. */
  declare quiet: boolean;
  /** Without a visible label, such as under a heading that says the same; the label is still its name. */
  declare hideLabel: boolean;
  /** At most this many characters; 0 is no limit. */
  declare maxlength: number;
  /** A touch screen shows the keyboard of digits. */
  declare digits: boolean;
  /** More lines: a text area that grows with what is typed; Enter makes a new line. */
  declare multiline: boolean;

  constructor() {
    super();
    this.label = '';
    this.value = '';
    this.type = 'text';
    this.placeholder = '';
    this.icon = '';
    this.help = '';
    this.helpIcon = '';
    this.state = 'idle';
    this.disabled = false;
    this.quiet = false;
    this.hideLabel = false;
    this.maxlength = 0;
    this.digits = false;
    this.multiline = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6); }
    label { margin-left: var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-strong); color: var(--field-label-fg); }
    .box {
      display: flex; align-items: center; gap: var(--space-10); min-height: var(--field-height); padding: 0 var(--space-16); border-radius: var(--field-radius);
      background: var(--field-bg); color: var(--field-fg); box-shadow: inset 0 0 0 var(--field-outline-width) transparent;
      transition: box-shadow var(--motion-effects);
    }
    .box mh-icon { color: var(--field-label-fg); --icon-size: var(--icon-m); }
    textarea { all: unset; flex: 1; align-self: stretch; min-width: 0; padding: var(--space-14) 0; min-height: calc(var(--field-height) * 2); field-sizing: content; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); }
    textarea:focus-visible { outline: none; }
    input { all: unset; flex: 1; align-self: stretch; min-width: 0; text-overflow: ellipsis; font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); }
    /* the box around it has the ring */
    input:focus-visible { outline: none; }
    input::placeholder { color: var(--field-label-fg); }
    input::-webkit-search-cancel-button { appearance: none; }
    .box:focus-within { box-shadow: inset 0 0 0 var(--field-outline-width) var(--field-focus); }
    .help {
      display: flex; gap: var(--space-6); align-items: center; margin-left: var(--space-4);
      font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--field-label-fg);
      --icon-size: var(--icon-xs);
    }
    :host([state="ok"]) .help { color: var(--c-primary); }
    :host([state="error"]) .box { box-shadow: inset 0 0 0 var(--field-outline-width) var(--field-error); }
    :host([state="error"]) .help { color: var(--field-error); }
    :host([disabled]) { opacity: var(--state-disabled-content); }
  `];

  private onInput(event: Event): void {
    // the native event would also leave the shadow root; report one event with the value instead
    event.stopPropagation();
    this.value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.dispatchEvent(new CustomEvent('input', { detail: { value: this.value }, bubbles: true, composed: true }));
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.dispatchEvent(new CustomEvent('submit', { bubbles: true, composed: true }));
  }

  override render() {
    const helpIcon = this.state === 'error' ? 'error' : this.state === 'ok' ? 'check_circle' : this.helpIcon;
    return html`
      ${this.quiet || this.hideLabel ? nothing : html`<label for="input">${this.label}</label>`}
      <div class="box">
        ${this.icon ? html`<mh-icon name=${this.icon}></mh-icon>` : nothing}
        ${this.multiline ? html`<textarea id="input" .value=${live(this.value)} placeholder=${this.placeholder || nothing} spellcheck="true" ?disabled=${this.disabled}
          aria-label=${this.quiet || this.hideLabel ? this.label : nothing} maxlength=${this.maxlength > 0 ? this.maxlength : nothing} aria-describedby=${this.quiet ? nothing : 'help'}
          @input=${(event: Event) => this.onInput(event)}></textarea>` : html`<input id="input" type=${this.type} .value=${live(this.value)} placeholder=${this.placeholder || nothing}
          inputmode=${this.digits ? 'numeric' : nothing} autocomplete="off" spellcheck="false" autocapitalize="off" ?disabled=${this.disabled}
          aria-label=${this.quiet || this.hideLabel ? this.label : nothing} maxlength=${this.maxlength > 0 ? this.maxlength : nothing} aria-describedby=${this.quiet ? nothing : 'help'} aria-invalid=${this.state === 'error' ? 'true' : 'false'}
          @input=${(event: Event) => this.onInput(event)} @keydown=${(event: KeyboardEvent) => this.onKey(event)}>`}
      </div>
      ${this.quiet ? nothing : html`<div class="help" id="help" aria-live="polite">${helpIcon ? html`<mh-icon name=${helpIcon} filled></mh-icon>` : nothing}<span>${this.help}</span></div>`}`;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('input, textarea')?.focus(options);
  }
}

if (!customElements.get('mh-text-field')) customElements.define('mh-text-field', MhTextField);

declare global {
  interface HTMLElementTagNameMap { 'mh-text-field': MhTextField }
}
