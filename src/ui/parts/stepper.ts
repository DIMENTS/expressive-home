import { LitElement, css, html, type PropertyValues } from 'lit';
import { sharedStyles } from './shared-styles';
import './icon';

/** A value with a button for less and one for more; it reports `step` with -1 or 1 and shows what it is given. */
export class MhStepper extends LitElement {
  static override properties = {
    value: { type: String },
    unit: { type: String },
    spoken: { type: String },
    less: { type: String },
    more: { type: String },
    atLeast: { type: Boolean },
    atMost: { type: Boolean },
    large: { type: Boolean, reflect: true },
    said: { state: true },
  };

  declare value: string;
  declare unit: string;
  /** The value as a screen reader says it after a step. */
  declare spoken: string;
  declare less: string;
  declare more: string;
  /** It cannot go lower, or higher. */
  declare atLeast: boolean;
  declare atMost: boolean;
  /** As at the top of a window. */
  declare large: boolean;
  declare said: string;
  private stepped = false;

  constructor() {
    super();
    this.value = '';
    this.unit = '';
    this.spoken = '';
    this.less = '';
    this.more = '';
    this.atLeast = false;
    this.atMost = false;
    this.large = false;
    this.said = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: block; min-width: 0; }
    .row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
    button {
      all: unset; box-sizing: border-box; width: var(--control-step-width); height: var(--control-height); display: grid; place-items: center; cursor: pointer;
      border-radius: var(--control-radius); background: var(--control-bg); touch-action: manipulation; user-select: none; -webkit-user-select: none;
      transition: background-color var(--motion-effects), border-radius var(--motion-spatial), opacity var(--motion-effects);
      --icon-size: var(--icon-m);
    }
    :host([large]) button { width: var(--control-large-height); height: var(--control-large-height); --icon-size: var(--icon-l); }
    :host([large]) .more { background: var(--control-main-bg); color: var(--control-main-fg); border-radius: var(--control-large-radius); }
    button:not([aria-disabled="true"]):hover { background: color-mix(in srgb, currentColor var(--control-hover), transparent); }
    :host([large]) .more:not([aria-disabled="true"]):hover { background: color-mix(in srgb, var(--control-main-fg) var(--state-hover), var(--control-main-bg)); }
    button:not([aria-disabled="true"]):active { border-radius: var(--control-radius-pressed); }
    button[aria-disabled="true"] { cursor: default; opacity: var(--state-disabled-content); }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .value {
      text-align: center; font-size: var(--control-value-size); line-height: var(--type-value-line); font-weight: var(--weight-strong);
      font-variant-numeric: tabular-nums; white-space: nowrap; cursor: default;
    }
    :host([large]) .value { font-size: var(--control-large-value-size); letter-spacing: var(--tracking-display); font-variant-numeric: normal; }
    .unit { font-size: var(--control-unit-size); }
  `];

  private step(steps: -1 | 1, atEnd: boolean): void {
    if (atEnd) return;
    this.stepped = true;
    this.dispatchEvent(new CustomEvent('step', { detail: { steps }, bubbles: true, composed: true }));
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('spoken')) return;
    this.said = this.stepped ? this.spoken : '';
    this.stepped = false;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('button')?.focus(options);
  }

  override render() {
    const stop = (event: Event): void => event.stopPropagation();
    const button = (kind: 'less' | 'more', icon: string, steps: -1 | 1, atEnd: boolean) => html`<button type="button" class="hit ${kind}" aria-label=${this[kind]}
      aria-disabled=${atEnd ? 'true' : 'false'} @click=${() => this.step(steps, atEnd)}><mh-icon name=${icon}></mh-icon></button>`;
    return html`<div class="row" @pointerdown=${stop} @click=${stop} @contextmenu=${stop}>
      ${button('less', 'remove', -1, this.atLeast)}<span class="value">${this.value}<span class="unit">${this.unit}</span></span>${button('more', 'add', 1, this.atMost)}
      <span class="unseen" role="status">${this.said}</span></div>`;
  }
}

if (!customElements.get('mh-stepper')) customElements.define('mh-stepper', MhStepper);

declare global {
  interface HTMLElementTagNameMap { 'mh-stepper': MhStepper }
}
