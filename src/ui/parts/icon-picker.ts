import { LitElement, css, html, nothing } from 'lit';
import { t as dutch, type MessageKey, type Translate } from '../../i18n';
import type { IconName } from '../icons/icons';
import { isLibraryIcon, searchIcons, type LibraryIcon } from '../icons/library';
import { sharedStyles } from './shared-styles';
import './icon';
import './text-field';

/**
 * The icon library: a search field, "Automatisch" first where the app can choose (only without a search),
 * and the icons in their seven groups. One choice, reported as `change` with { icon }; null is "Automatisch". The
 * arrow keys move through the icons, Home and End jump to the ends; Enter or a tap chooses.
 */
export class MhIconPicker extends LitElement {
  static override properties = {
    value: { attribute: false },
    auto: { attribute: false },
    t: { attribute: false },
    query: { state: true },
  };

  /** The chosen icon; null is "Automatisch". */
  declare value: string | null;
  /** The icon the app chooses itself; null: there is no "Automatisch". */
  declare auto: IconName | null;
  /** The texts, in the language of the app; Dutch until the app sets it. */
  declare t: Translate;
  declare query: string;
  /** The radio that holds the tab stop, by index over all that are shown. */
  private current = 0;
  /** While an icon has the focus, the tab stop stays with it. */
  private focusInside = false;

  constructor() {
    super();
    this.value = null;
    this.auto = null;
    this.t = dutch;
    this.query = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: grid; gap: var(--space-8); min-width: 0; }
    .results { min-width: 0; }
    .auto, .pick { all: unset; box-sizing: border-box; cursor: pointer; transition: background-color var(--motion-effects), border-radius var(--motion-spatial); }
    .auto {
      display: flex; align-items: center; gap: var(--space-12); width: 100%; min-height: var(--pick-row-height);
      padding: var(--space-4) var(--space-12) var(--space-4) var(--space-4); border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg);
      font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong);
    }
    .auto:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--sheet-row-bg)); }
    .auto[aria-checked="true"] { background: var(--icon-pick-on-bg); color: var(--icon-pick-on-fg); }
    .auto .grow { flex: 1; display: grid; }
    .auto small { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-regular); color: var(--c-on-surface-variant); }
    .auto[aria-checked="true"] small { color: inherit; }
    .auto .sample {
      flex: none; width: var(--icon-pick-size); height: var(--icon-pick-size); display: grid; place-items: center;
      border-radius: var(--shape-lg); background: var(--icon-pick-bg); color: var(--c-on-surface-variant);
    }
    .auto[aria-checked="true"] .sample { border-radius: var(--shape-full); background: var(--c-surface); }
    .auto > mh-icon { --icon-size: var(--icon-l); }
    .group {
      margin: var(--space-12) 0 var(--space-6) var(--space-4);
      font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); font-weight: var(--weight-strong); color: var(--c-on-surface-variant);
    }
    .picks { display: grid; grid-template-columns: repeat(auto-fill, var(--icon-pick-size)); gap: var(--space-4); }
    .pick {
      width: var(--icon-pick-size); height: var(--icon-pick-size); display: grid; place-items: center;
      border-radius: var(--shape-lg); background: var(--icon-pick-bg); color: var(--c-on-surface-variant); --icon-size: var(--icon-l);
    }
    .pick:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--icon-pick-bg)); }
    .pick[aria-checked="true"] { background: var(--icon-pick-on-bg); color: var(--icon-pick-on-fg); border-radius: var(--shape-full); }
    .auto:focus-visible, .pick:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: calc(-1 * var(--focus-width)); }
    .none { margin: var(--space-8) var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  `];

  private radios(): HTMLElement[] {
    return [...(this.shadowRoot?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
  }

  private choose(icon: string | null): void {
    this.value = icon;
    this.dispatchEvent(new CustomEvent('change', { detail: { icon }, bubbles: true, composed: true }));
  }

  private onSearch(event: CustomEvent<{ value: string }>): void {
    event.stopPropagation();
    this.query = event.detail.value;
    this.current = 0;
  }

  private onKey(event: KeyboardEvent): void {
    const radios = this.radios();
    const at = radios.indexOf(event.composedPath()[0] as HTMLElement);
    if (at === -1) return;
    const moves: Record<string, () => number> = {
      ArrowDown: () => at + 1, ArrowRight: () => at + 1, ArrowUp: () => at - 1, ArrowLeft: () => at - 1, Home: () => 0, End: () => radios.length - 1,
    };
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      radios[at]?.click();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.focusRadio((move() + radios.length) % radios.length);
  }

  private focusRadio(index: number): void {
    this.current = index;
    this.radios()[index]?.focus();
    this.requestUpdate();
  }

  protected override updated(): void {
    // one tab stop, set after drawing because only then every choice is known
    const radios = this.radios();
    if (!this.focusInside) {
      const chosen = radios.findIndex((radio) => radio.getAttribute('aria-checked') === 'true');
      this.current = chosen === -1 ? 0 : chosen;
    }
    radios.forEach((radio, index) => radio.setAttribute('tabindex', index === this.current ? '0' : '-1'));
  }

  private renderAuto() {
    if (this.auto === null || this.query.trim() !== '') return nothing;
    const checked = this.value === null;
    return html`<div class="auto" role="radio" aria-checked=${checked ? 'true' : 'false'} @click=${() => this.choose(null)}>
      <span class="sample"><mh-icon name=${this.auto} ?filled=${checked}></mh-icon></span>
      <span class="grow">${this.t('icons.auto')}<small>${this.t('icons.autoHint')}</small></span>
      ${checked ? html`<mh-icon name="check"></mh-icon>` : nothing}
    </div>`;
  }

  private renderIcon(icon: LibraryIcon) {
    const checked = icon.name === this.value;
    const name = icon[this.t.language];
    return html`<div class="pick" role="radio" data-icon=${icon.name} aria-checked=${checked ? 'true' : 'false'} aria-label=${name} title=${name}
      @click=${() => this.choose(icon.name)}><mh-icon name=${icon.name} ?filled=${checked}></mh-icon></div>`;
  }

  override render() {
    const found = searchIcons(this.query, this.t.language);
    const chosen = this.value !== null && isLibraryIcon(this.value) ? this.value : null;
    return html`<mh-text-field label=${this.t('icons.label')} placeholder=${this.t('icons.search')} icon="search" type="search" quiet .value=${this.query}
        @input=${(e: CustomEvent<{ value: string }>) => this.onSearch(e)}></mh-text-field>
      <div class="results" role="radiogroup" aria-label=${this.t('section.dialog.icon')} data-chosen=${chosen ?? nothing} @keydown=${(e: KeyboardEvent) => this.onKey(e)}
          @focusin=${() => { this.focusInside = true; }} @focusout=${() => { this.focusInside = false; }}>
        ${this.renderAuto()}
        ${found.map(({ group, icons }) => html`<p class="group" aria-hidden="true">${this.t(`icons.group.${group}` as MessageKey)}</p>
          <div class="picks">${icons.map((icon) => this.renderIcon(icon))}</div>`)}
      </div>
      <p class="none" role="status" ?hidden=${found.length > 0}>${found.length > 0 ? '' : this.t('icons.none')}</p>`;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('mh-text-field')?.focus(options);
  }
}

if (!customElements.get('mh-icon-picker')) customElements.define('mh-icon-picker', MhIconPicker);

declare global {
  interface HTMLElementTagNameMap { 'mh-icon-picker': MhIconPicker }
}
