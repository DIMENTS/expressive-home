import { LitElement, html, nothing } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import type { ThemeSettings } from '../../theme/types';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import '../parts/choice-group';
import '../parts/sheet';
import '../parts/swatch-group';

const modes = (t: Translate) => [
  { id: 'light', label: t('theme.mode.light'), icon: 'light_mode' as const },
  { id: 'dark', label: t('theme.mode.dark'), icon: 'dark_mode' as const },
  { id: 'auto', label: t('theme.mode.auto'), icon: 'brightness_auto' as const },
];
const densities = (t: Translate) => [
  { id: 'comfortable', label: t('theme.density.comfortable'), icon: 'view_agenda' as const },
  { id: 'compact', label: t('theme.density.compact'), icon: 'density_small' as const },
];

/**
 * The theme panel: base colour (five presets and a free colour), light, dark or automatic,
 * and comfortable or compact. Every choice is reported at once as the new settings (`change`).
 */
export class MhThemePanel extends LitElement {
  static override properties = {
    t: { attribute: false },
    open: { type: Boolean },
    theme: { attribute: false },
    presets: { attribute: false },
    phone: { type: Boolean },
  };

  /** The texts, in the language of the app; Dutch until the app sets it. */

  declare t: Translate;

  declare open: boolean;
  declare theme: ThemeSettings;
  declare presets: { id: string; seed: string }[];
  /** On a phone roomy or compact makes no difference. */
  declare phone: boolean;

  constructor() {
    super();
    this.t = dutch;
    this.open = false;
    this.theme = { seed: '', mode: 'auto', density: 'comfortable' };
    this.presets = [];
    this.phone = false;
  }

  static override styles = [sharedStyles, panelStyles];

  private report(change: Partial<ThemeSettings>): void {
    this.dispatchEvent(new CustomEvent('change', { detail: { ...this.theme, ...change }, bubbles: true, composed: true }));
  }

  override render() {
    return html`<mh-sheet .t=${this.t} ?open=${this.open} heading=${this.t('theme.title')} subheading=${this.t('theme.subtitle')} icon="palette"
      @close=${(e: Event) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true })); }}>
      <section><h3>${this.t('theme.seed')}</h3>
        <mh-swatch-group .t=${this.t} label=${this.t('theme.seed')} .presets=${this.presets} .value=${this.theme.seed}
          @change=${(e: CustomEvent<{ seed: string }>) => { e.stopPropagation(); this.report({ seed: e.detail.seed }); }}></mh-swatch-group></section>
      <section><h3>${this.t('theme.mode')}</h3>
        <mh-choice-group label=${this.t('theme.mode')} .options=${modes(this.t)} .value=${this.theme.mode}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.report({ mode: e.detail.value as ThemeSettings['mode'] }); }}></mh-choice-group></section>
      ${this.phone ? nothing : html`<section><h3>${this.t('theme.density')}</h3>
        <mh-choice-group label=${this.t('theme.density')} .options=${densities(this.t)} .value=${this.theme.density}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.report({ density: e.detail.value as ThemeSettings['density'] }); }}></mh-choice-group></section>`}
    </mh-sheet>`;
  }
}

if (!customElements.get('mh-theme-panel')) customElements.define('mh-theme-panel', MhThemePanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-theme-panel': MhThemePanel }
}
