import { css, html, nothing, type PropertyValues } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { MessageKey } from '../../i18n/index';
import { ChoiceBase } from './choice-group';
import { sharedStyles } from './shared-styles';
import './icon';

/**
 * Colour swatches: the presets as radio buttons (a circle; the chosen one a cookie with a tick),
 * and a last rainbow swatch that opens the system's colour picker. Reports `change` with { seed }.
 */
export class MhSwatchGroup extends ChoiceBase {
  static override properties = {
    t: { attribute: false },
    ...ChoiceBase.properties,
    presets: { attribute: false },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */

  declare t: Translate;

  declare presets: { id: string; seed: string }[];

  constructor() {
    super();
    this.t = dutch;
    this.presets = [];
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .swatches, .group { display: flex; flex-wrap: wrap; gap: var(--space-4); }
    .option, .custom {
      all: unset; box-sizing: border-box; position: relative; cursor: pointer; width: var(--target-min); height: var(--target-min);
      display: grid; place-items: center; border-radius: 50%;
    }
    .option:focus-visible, .custom:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    i {
      width: var(--swatch-size); height: var(--swatch-size); display: grid; place-items: center; background: var(--_seed); clip-path: var(--shape-circle);
      transition: clip-path var(--motion-spatial), width var(--motion-spatial), height var(--motion-spatial);
      --icon-size: var(--icon-m);
    }
    mh-icon { color: var(--c-surface-container-lowest); opacity: 0; transition: opacity var(--motion-effects); }
    [aria-checked="true"] i, .custom.chosen i { width: var(--swatch-size-chosen); height: var(--swatch-size-chosen); clip-path: var(--shape-cookie); }
    [aria-checked="true"] mh-icon, .custom mh-icon { opacity: 1; }
    .custom i { background: var(--ramp-swatch); }
    input { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
    @media (prefers-reduced-motion: reduce) {
      [aria-checked="true"] i, .custom.chosen i { clip-path: var(--shape-circle); }
    }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('presets') || changed.has('t')) {
      this.options = this.presets.map((p) => ({ id: p.seed, label: this.t(`theme.seed.${p.id}` as MessageKey) }));
    }
  }

  protected override updated(): void {
    // each swatch's colour goes in through the CSSOM: the content security policy allows no style attribute
    for (const swatch of this.shadowRoot?.querySelectorAll<HTMLElement>('[data-id]') ?? []) swatch.style.setProperty('--_seed', swatch.dataset['id'] ?? '');
  }

  protected override reportChange(seed: string): void {
    this.dispatchEvent(new CustomEvent('change', { detail: { seed }, bubbles: true, composed: true }));
  }

  private openPicker(): void {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('input[type="color"]');
    if (!input) return;
    input.value = /^#[0-9a-f]{6}$/i.test(this.value) ? this.value : rustigExpressive.color.defaultSeed;
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch { /* fall back to a click */ }
    }
    input.click();
  }

  private onPick(event: Event): void {
    event.stopPropagation();
    const seed = (event.target as HTMLInputElement).value;
    if (!/^#[0-9a-f]{6}$/i.test(seed) || seed === this.value) return;
    this.value = seed;
    this.reportChange(seed);
  }

  override render() {
    const custom = this.value !== '' && !this.options.some((o) => o.id === this.value);
    return html`<div class="swatches">
      <div class="group" role="radiogroup" aria-label=${this.label}>${this.options.map((option, index) => this.renderOption(option, index, html`<i><mh-icon name="check" filled></mh-icon></i>`))}</div>
      <button class="custom ${custom ? 'chosen' : ''}" aria-label=${this.t('theme.seed.custom')} @click=${() => this.openPicker()}>
        <i><mh-icon name=${custom ? 'check' : 'colorize'} filled></mh-icon></i>
      </button>
      <input type="color" tabindex="-1" aria-hidden="true" @input=${(e: Event) => this.onPick(e)} @change=${(e: Event) => e.stopPropagation()}>
    </div>${nothing}`;
  }
}

if (!customElements.get('mh-swatch-group')) customElements.define('mh-swatch-group', MhSwatchGroup);

declare global {
  interface HTMLElementTagNameMap { 'mh-swatch-group': MhSwatchGroup }
}
