import { LitElement, css, html, nothing } from 'lit';
import type { IconName } from '../icons/icons';
import { PHONE_MAX_PX } from '../breakpoints';
import { sharedStyles } from './shared-styles';
import './icon';

/** `lang`: the language of the label when it differs from the page's, such as "Nederlands" on an English page. */
export interface ChoiceOption { id: string; label: string; icon?: IconName; lang?: string; disabled?: boolean }

/**
 * The behaviour both choice parts share: a radio group with one tab stop. Arrow keys move and choose,
 * a click chooses, and a new choice is reported as `change` with { value }.
 */
export class ChoiceBase extends LitElement {
  static override properties = {
    options: { type: Array },
    value: { type: String },
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  declare options: ChoiceOption[];
  declare value: string;
  declare label: string;
  declare disabled: boolean;

  constructor() {
    super();
    this.options = [];
    this.value = '';
    this.label = '';
    this.disabled = false;
  }

  protected choose(id: string, focus = false): void {
    if (this.disabled || this.options.find((option) => option.id === id)?.disabled) return;
    if (focus) this.updateComplete.then(() => this.radio(id)?.focus());
    if (id === this.value) return;
    this.value = id;
    this.reportChange(id);
  }

  /** Reports a new choice; a subclass may name its detail differently. */
  protected reportChange(id: string): void {
    this.dispatchEvent(new CustomEvent('change', { detail: { value: id }, bubbles: true, composed: true }));
  }

  private radio(id: string): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`) ?? null;
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step !== 0) {
      event.preventDefault();
      const count = this.options.length;
      const next = Array.from({ length: count }, (_, i) => this.options[(index + step * (i + 1) + count * 2) % count]).find((option) => option && !option.disabled);
      if (next) this.choose(next.id, true);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      const option = this.options[index];
      if (option) this.choose(option.id);
    }
  }

  /** The index of the option that holds the tab stop: the chosen one, otherwise the first. */
  protected tabStop(): number {
    const chosen = this.options.findIndex((o) => o.id === this.value);
    return chosen === -1 ? 0 : chosen;
  }

  protected renderOption(option: ChoiceOption, index: number, inner: unknown) {
    const checked = option.id === this.value;
    return html`<span
      class="option hit" role="radio" data-id=${option.id} lang=${option.lang ?? nothing} aria-label=${option.label} aria-checked=${checked ? 'true' : 'false'}
      aria-disabled=${this.disabled || option.disabled ? 'true' : nothing} tabindex=${index === this.tabStop() && !this.disabled ? '0' : '-1'}
      @click=${() => this.choose(option.id)} @keydown=${(event: KeyboardEvent) => this.onKey(event, index)}
    >${inner}</span>`;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('[tabindex="0"]')?.focus(options);
  }
}

/** Connected choice buttons: one out of at most three short options, side by side. */
export class MhChoiceGroup extends ChoiceBase {
  static override styles = [sharedStyles, css`
    :host { display: block; }
    .group { display: flex; gap: var(--space-2); }
    .option {
      cursor: pointer; flex: 1 1 0; min-width: 0; min-height: var(--choice-height);
      display: inline-flex; align-items: center; justify-content: center; gap: var(--space-6); padding: 0 var(--space-8);
      background: var(--choice-bg); color: var(--choice-fg); border-radius: var(--choice-radius);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); white-space: nowrap;
      transition: border-radius var(--motion-spatial), background-color var(--motion-effects), color var(--motion-effects);
      --icon-size: var(--icon-s);
    }
    .option:first-child { border-top-left-radius: var(--choice-radius-on); border-bottom-left-radius: var(--choice-radius-on); }
    .option:last-child { border-top-right-radius: var(--choice-radius-on); border-bottom-right-radius: var(--choice-radius-on); }
    .option:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--choice-bg)); }
    .option[aria-checked="true"] { background: var(--choice-on-bg); color: var(--choice-on-fg); border-radius: var(--choice-radius-on); }
    :host([disabled]) .option, .option[aria-disabled="true"] { cursor: default; opacity: var(--state-disabled-content); }
    /* on a phone the icon stands above its text, so that has the room */
    @media (width < ${PHONE_MAX_PX}px) { .option { flex-direction: column; gap: var(--space-2); padding: var(--space-8) var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); white-space: normal; overflow-wrap: anywhere; hyphens: auto; text-align: center; } .option span { max-width: 100%; } }
  `];

  override render() {
    return html`<div class="group" role="radiogroup" aria-label=${this.label}>${this.options.map((option, index) => this.renderOption(option, index, html`
      ${option.icon ? html`<mh-icon name=${option.icon} ?filled=${option.id === this.value}></mh-icon>` : nothing}<span>${option.label}</span>`))}</div>`;
  }
}

if (!customElements.get('mh-choice-group')) customElements.define('mh-choice-group', MhChoiceGroup);

declare global {
  interface HTMLElementTagNameMap { 'mh-choice-group': MhChoiceGroup }
}
