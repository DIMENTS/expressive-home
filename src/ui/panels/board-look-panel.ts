import { LitElement, css, html, nothing } from 'lit';
import { t as dutch, type Translate } from '../../i18n';
import { shownSeed, type LookRole } from '../../theme/choose';
import { BUILT_IN, type ThemeFile } from '../../theme/look';
import type { Mode } from '../../theme/types';
import { themeName, themeNote } from '../model/look-view';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import '../parts/choice-group';
import '../parts/look-picker';
import '../parts/sheet';

/**
 * The look of one dashboard: like the house, or a theme of its own for every device that opens it. Reports
 * `board-theme` with { theme: an id, or null for like the house }.
 */
export class MhBoardLookPanel extends LitElement {
  static override properties = {
    t: { attribute: false },
    open: { type: Boolean },
    name: { type: String },
    theme: { attribute: false },
    themes: { attribute: false },
    role: { type: String },
    seed: { type: String },
    mode: { type: String },
  };

  declare t: Translate;
  declare open: boolean;
  declare name: string;
  /** The theme of this dashboard; null: like the house. */
  declare theme: string | null;
  declare themes: readonly ThemeFile[];
  declare role: LookRole;
  declare seed: string;
  declare mode: Mode;

  constructor() {
    super();
    this.t = dutch;
    this.open = false;
    this.name = '';
    this.theme = null;
    this.themes = BUILT_IN;
    this.role = 'edit';
    this.seed = '';
    this.mode = 'light';
  }

  static override styles = [sharedStyles, panelStyles, css`
    .stack { display: grid; gap: var(--space-20); }
    .line { margin: var(--space-8) var(--space-4) 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  `];

  private tell(theme: string | null): void {
    this.dispatchEvent(new CustomEvent('board-theme', { detail: { theme }, bubbles: true, composed: true }));
  }

  override render() {
    const t = this.t;
    const like = this.role === 'own' ? t('boardLook.likeOthers') : t('boardLook.likeHouse');
    return html`<mh-sheet .t=${t} ?open=${this.open} heading=${t('boardLook.title', { name: this.name })} icon="palette"
      @close=${(e: Event) => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true })); }}>
      <div class="stack"><section><h3>${t('boardLook.look')}</h3>
        <mh-choice-group label=${t('boardLook.look')} .value=${this.theme === null ? 'house' : 'own'}
          .options=${[{ id: 'house', label: like, icon: 'home' as const }, { id: 'own', label: t('boardLook.own'), icon: 'palette' as const }]}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.tell(e.detail.value === 'house' ? null : this.theme ?? 'rustig'); }}></mh-choice-group>
        <p class="line">${t(this.role === 'own' ? 'boardLook.helpOwn' : 'boardLook.help')}</p></section>
      ${this.theme === null ? nothing : html`<section><h3>${t('theme.style')}</h3>
        <mh-look-picker label=${t('theme.style')} .value=${this.theme}
          .options=${this.themes.map((file) => ({ id: file.id, label: themeName(file, t), note: themeNote(file, this.role, t), file, seed: shownSeed(file, this.seed) ?? this.seed, mode: this.mode }))}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.tell(e.detail.value); }}></mh-look-picker></section>`}
      </div></mh-sheet>`;
  }
}

if (!customElements.get('mh-board-look-panel')) customElements.define('mh-board-look-panel', MhBoardLookPanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-board-look-panel': MhBoardLookPanel }
}
