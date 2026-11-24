import { LitElement, css, html } from 'lit';
import { sharedStyles } from './shared-styles';

/**
 * A switch: 52 by 32, the thumb grows from 16 to 24 when on and to 28 while pressed.
 * Click, space and Enter toggle it; it reports `change` with { checked }.
 */
export class MhSwitch extends LitElement {
  static override properties = {
    checked: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    label: { type: String },
  };

  declare checked: boolean;
  declare disabled: boolean;
  declare label: string;

  constructor() {
    super();
    this.checked = false;
    this.disabled = false;
    this.label = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: inline-flex; flex: none; }
    [role="switch"] {
      position: relative; flex: none; width: var(--switch-width); height: var(--switch-height); border-radius: var(--shape-full); cursor: pointer;
      background: var(--switch-off-bg); box-shadow: inset 0 0 0 var(--switch-outline-width) var(--switch-off-outline);
      transition: background-color var(--motion-effects), box-shadow var(--motion-effects);
    }
    [role="switch"]::before {
      content: ""; position: absolute; top: 50%; left: calc(var(--switch-height) / 2);
      width: var(--switch-thumb-off); height: var(--switch-thumb-off); border-radius: 50%; background: var(--switch-off-thumb);
      transform: translate(-50%, -50%);
      transition: left var(--motion-spatial), width var(--motion-spatial), height var(--motion-spatial), background-color var(--motion-effects);
    }
    [aria-checked="true"] { background: var(--switch-on-bg); box-shadow: inset 0 0 0 var(--switch-outline-width) var(--switch-on-bg); }
    [aria-checked="true"]::before {
      left: calc(var(--switch-width) - var(--switch-height) / 2);
      width: var(--switch-thumb-on); height: var(--switch-thumb-on); background: var(--switch-on-thumb);
    }
    [role="switch"]:active::before { width: var(--switch-thumb-pressed); height: var(--switch-thumb-pressed); }
    [aria-disabled="true"] { cursor: default; opacity: var(--state-disabled-content); }
  `];

  private toggle(): void {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent('change', { detail: { checked: this.checked }, bubbles: true, composed: true }));
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    this.toggle();
  }

  override render() {
    return html`<span
      class="hit" role="switch" aria-checked=${this.checked ? 'true' : 'false'} aria-label=${this.label}
      aria-disabled=${this.disabled ? 'true' : 'false'} tabindex=${this.disabled ? '-1' : '0'}
      @click=${() => this.toggle()} @keydown=${(event: KeyboardEvent) => this.onKey(event)}
    ></span>`;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('[role="switch"]')?.focus(options);
  }
}

if (!customElements.get('mh-switch')) customElements.define('mh-switch', MhSwitch);

declare global {
  interface HTMLElementTagNameMap { 'mh-switch': MhSwitch }
}
