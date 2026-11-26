import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { t as dutch, type MessageKey, type Translate } from '../../i18n';
import { DEFAULT_HOUSE, shownSeed, type DeviceLook, type HouseLook, type LookRole } from '../../theme/choose';
import { BUILT_IN, KNOB_VALUES, type KnobName, type Knobs, type ThemeFile } from '../../theme/look';
import { fromFileText, fromShareCode, toFileText, toShareCode, type FromCode } from '../../theme/share-code';
import { computeLook, styleOf } from '../../theme/styles';
import { LIMITS_LOOKS, newThemeId, valueCount } from '../../theme/theme-file';
import { themesBytes } from '../../theme/looks-doc';
import { rustigExpressive } from '../../theme/rustig-expressive';
import { dangerClear } from '../model/all-values';
import type { Density, Mode, ModePreference } from '../../theme/types';
import { lookChoice, lookTarget, lookWords, poorPlaces, themeName, themeNote, type LookTarget } from '../model/look-view';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import type { LookOption } from '../parts/look-picker';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/look-picker';
import '../parts/note';
import '../parts/sheet';
import '../parts/swatch-group';
import '../parts/switch';
import '../parts/text-field';
import './all-values';
import { cssLines } from '../../theme/css/lines';
import { allowCss } from '../../storage/looks-store';
import { safeStorage } from '../app/safe-storage';
import type { CssFrom } from '../../theme/looks-doc';
import { cssFakesAlarm } from '../../theme/css/fake-alarm';
import { GALLERY_TEXT, GALLERY_URL, galleryForm } from '../../app/links';

/** What the theme panel knows of this device's looks. */
export interface PanelLook {
  role: LookRole;
  device: DeviceLook;
  house: HouseLook | null;
  themes: readonly ThemeFile[];
  /** Where the CSS of each theme comes from; absent when none has CSS. */
  cssFrom?: Readonly<Record<string, CssFrom>>;
  /** The themes taken in from someone else. */
  takenIn?: readonly string[];
}

/** A change of the look, for this device or the whole house; only the fields that change. */
export interface LookChoose { target: LookTarget; theme?: string; seed?: string; mode?: ModePreference }

type View = { kind: 'main' } | { kind: 'adjust' } | { kind: 'all'; file: ThemeFile } | { kind: 'share'; id: string } | { kind: 'import' };

const modes = (t: Translate) => [
  { id: 'light', label: t('theme.mode.light'), icon: 'light_mode' as const },
  { id: 'dark', label: t('theme.mode.dark'), icon: 'dark_mode' as const },
  { id: 'auto', label: t('theme.mode.auto'), icon: 'brightness_auto' as const },
];
const densities = (t: Translate) => [
  { id: 'comfortable', label: t('theme.density.comfortable'), icon: 'view_agenda' as const },
  { id: 'compact', label: t('theme.density.compact'), icon: 'density_small' as const },
];
const KNOBS = Object.keys(KNOB_VALUES) as KnobName[];
/** The file name of a shared theme: its name in plain letters. */
const fileNameOf = (name: string): string => `${name.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'thema'}.expressive-theme.json`;

/**
 * The theme panel. On a device that may edit: the style, base colour, light or dark and roominess, for this device or
 * for the whole house, the simple editor, sharing and themes of others. On a device that may only use: what the house
 * shows, its own roominess and high contrast. In a browser with its own key and in the example house: all of it, for
 * this browser. It decides nothing itself: every choice is reported, and what is chosen comes back through `look`.
 */
export class MhThemePanel extends LitElement {
  static override properties = {
    t: { attribute: false },
    open: { type: Boolean },
    look: { attribute: false },
    density: { type: String },
    presets: { attribute: false },
    phone: { type: Boolean },
    safe: { type: Boolean },
    systemDark: { type: Boolean },
    sunDark: { attribute: false },
    boardTheme: { attribute: false },
    view: { state: true },
    draft: { state: true },
    draftName: { state: true },
    imported: { state: true },
    importText: { state: true },
    allowCss: { state: true },
    addAsNew: { state: true },
    told: { state: true },
    asking: { state: true },
  };

  declare t: Translate;
  declare open: boolean;
  declare look: PanelLook;
  declare density: Density;
  declare presets: { id: string; seed: string }[];
  /** On a phone roomy or compact makes no difference. */
  declare phone: boolean;
  /** Opened with `#veilig`: the page shows Rustig whatever was chosen. */
  declare safe: boolean;
  declare systemDark: boolean;
  /** Whether it is dark outside at the hub, by its weather; null when that is not known. */
  declare sunDark: boolean | null;
  /** The theme of its own that the open dashboard shows; null when it shows the look chosen here. */
  declare boardTheme: string | null;
  declare view: View;
  /** The theme being adjusted, shown on the dashboard while the editor is open. */
  declare draft: ThemeFile | null;
  declare draftName: string;
  declare imported: FromCode | null;
  declare importText: string;
  /** Someone else's CSS of the theme being taken in is allowed in full on this device. */
  declare allowCss: boolean;
  declare addAsNew: boolean;
  /** A short line of what just happened, in the view that did it. */
  declare told: string;
  /** Removing the shared theme is being asked. */
  declare asking: boolean;

  constructor() {
    super();
    this.t = dutch;
    this.open = false;
    this.look = { role: 'own', device: { followStyle: false, followMode: false, theme: 'rustig', seed: null, mode: 'auto', fromBefore: false, helder: false, ignoreBoards: false }, house: null, themes: BUILT_IN };
    this.density = 'comfortable';
    this.presets = [];
    this.phone = false;
    this.safe = false;
    this.systemDark = false;
    this.sunDark = null;
    this.boardTheme = null;
    this.view = { kind: 'main' };
    this.draft = null;
    this.draftName = '';
    this.imported = null;
    this.importText = '';
    this.allowCss = false;
    this.addAsNew = false;
    this.told = '';
    this.asking = false;
  }

  static override styles = [sharedStyles, panelStyles, css`
    .stack { display: grid; gap: var(--space-20); }
    .actions { display: grid; gap: var(--space-8); }
    .follows { display: grid; gap: var(--space-6); margin-top: var(--space-10); }
    .follows .label { margin: 0 var(--space-4); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--c-on-surface-variant); }
    .help { margin: var(--space-8) var(--space-4) 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .line { margin: var(--space-8) var(--space-4) 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .code {
      margin: 0; padding: var(--space-12) var(--space-14); border-radius: var(--sheet-cell-radius); background: var(--sheet-row-bg);
      font-family: var(--share-code-font); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line);
      overflow-wrap: anywhere; -webkit-user-select: all; user-select: all; color: var(--c-on-surface-variant);
    }
    .css-code {
      display: grid; padding: var(--space-10) 0; border-radius: var(--sheet-cell-radius); background: var(--sheet-row-bg); overflow-x: auto;
      font-family: var(--share-code-font); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line);
    }
    .css-line { display: flex; gap: var(--space-12); white-space: pre; }
    .css-line .num { flex: none; width: var(--space-32); text-align: end; color: var(--c-outline); }
    .css-line.not-yet .text { text-decoration: line-through; color: var(--c-on-surface-variant); }
    .css-line.never .text { text-decoration: line-through; color: var(--field-error); }
    .theme-row { cursor: pointer; }
    .gallery { display: grid; gap: var(--space-4); }
    .gallery p { margin: 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .gallery .address { font-family: var(--share-code-font); overflow-wrap: anywhere; }
    .link {
      display: flex; align-items: center; justify-content: center; gap: var(--space-8); min-height: var(--button-height); min-width: var(--target-min);
      padding: 0 var(--space-16); border-radius: var(--button-radius); color: var(--button-text-fg); text-decoration: none; text-align: center;
      font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); --icon-size: var(--icon-m);
      transition: background-color var(--motion-effects);
    }
    .link:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .link:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .theme-row:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--sheet-row-bg)); }
  `];

  private emit(type: string, detail: unknown = null): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  protected override updated(changed: PropertyValues<this>): void {
    // closing the panel ends what was open in it; an adjustment that was not saved is gone
    if (changed.has('open') && !this.open && changed.get('open') === true) this.leave();
  }

  private leave(): void {
    if (this.draft) this.emit('look-preview', { file: null });
    this.view = { kind: 'main' };
    this.draft = null;
    this.imported = null;
    this.importText = '';
    this.told = '';
    this.asking = false;
  }

  private get target(): LookTarget { return lookTarget(this.look.role, this.look.device); }
  private get choice() { return lookChoice(this.look.role, this.look.device, this.look.house); }
  private get shownMode(): Mode {
    const mode = this.choice.mode;
    if (mode === 'sun' && this.sunDark !== null) return this.sunDark ? 'dark' : 'light';
    return mode === 'auto' || mode === 'sun' ? (this.systemDark ? 'dark' : 'light') : mode;
  }

  private option(file: ThemeFile): LookOption {
    return { id: file.id, label: themeName(file, this.t), note: themeNote(file, this.look.role, this.t), file, seed: shownSeed(file, this.choice.seed) ?? this.choice.seed, mode: this.shownMode };
  }

  private choose(change: Omit<LookChoose, 'target'>): void {
    this.emit('look-choose', { target: this.target, ...change } satisfies LookChoose);
  }

  override render() {
    const t = this.t;
    const view = this.view;
    const sub = view.kind !== 'main';
    const heading = view.kind === 'all' ? t('theme.allValues') : view.kind === 'adjust' ? t('theme.adjust') : view.kind === 'import' ? t('theme.fromOther') : view.kind === 'share' ? t('theme.share', { name: this.nameOf(view.id) }) : t('theme.title');
    return html`<mh-sheet .t=${t} ?open=${this.open} heading=${heading} ?wide=${view.kind === 'all'} icon=${view.kind === 'adjust' || view.kind === 'all' ? 'tune' : view.kind === 'share' ? 'share' : view.kind === 'import' ? 'download' : 'palette'} ?back=${sub}
      @back=${(e: Event) => { e.stopPropagation(); this.back(); }}
      @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${view.kind === 'all' ? this.renderAll(view.file) : view.kind === 'adjust' ? this.renderAdjust() : view.kind === 'share' ? this.renderShare(view.id) : view.kind === 'import' ? this.renderImport() : this.renderMain()}
    </mh-sheet>`;
  }

  private back(): void {
    if (this.view.kind === 'adjust' || this.view.kind === 'all') this.emit('look-preview', { file: null });
    this.draft = null;
    this.imported = null;
    this.importText = '';
    this.told = '';
    this.asking = false;
    this.view = { kind: 'main' };
  }

  private nameOf(id: string): string {
    const file = this.look.themes.find((item) => item.id === id);
    return file ? themeName(file, this.t) : '';
  }

  // ----- the panel itself -----

  private renderMain() {
    const t = this.t;
    const { role } = this.look;
    if (role === 'use') return this.renderUse();
    const choice = this.choice;
    const board = this.boardTheme === null ? undefined : this.look.themes.find((file) => file.id === this.boardTheme);
    return html`<div class="stack">
      ${this.safe ? html`<mh-note icon="info">${t('theme.safe')}</mh-note>` : nothing}
      ${board ? html`<mh-note icon="info">${t('theme.boardOwn', { name: themeName(board, t) })}</mh-note>` : nothing}
      <section><h3>${t('theme.style')}</h3>
        <mh-look-picker label=${t('theme.style')} .options=${this.look.themes.map((file) => this.option(file))} .value=${choice.theme}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.choose({ theme: e.detail.value }); }}></mh-look-picker></section>
      <section><h3>${t('theme.seed')}</h3>
        <mh-swatch-group .t=${t} label=${t('theme.seed')} .presets=${this.presets} .value=${choice.seed}
          @change=${(e: CustomEvent<{ seed: string }>) => { e.stopPropagation(); this.choose({ seed: e.detail.seed }); }}></mh-swatch-group></section>
      <section><h3>${t('theme.mode')}</h3>
        <mh-choice-group label=${t('theme.mode')} .options=${modes(t)} .value=${choice.mode === 'sun' ? 'auto' : choice.mode}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.choose({ mode: e.detail.value as ModePreference }); }}></mh-choice-group>
        ${choice.mode === 'auto' || choice.mode === 'sun' ? html`<div class="follows"><span class="label">${t('theme.mode.follows')}</span>
          <mh-choice-group label=${t('theme.mode.follows')} .options=${[{ id: 'auto', label: t('theme.mode.followDevice'), icon: 'tablet' as const }, { id: 'sun', label: t('theme.mode.followSun'), icon: 'sunny' as const }]} .value=${choice.mode}
            @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); if (e.detail.value === 'auto' || e.detail.value === 'sun') this.choose({ mode: e.detail.value }); }}></mh-choice-group></div>` : nothing}
        ${choice.mode === 'sun' && this.sunDark === null ? html`<p class="help">${t('theme.mode.sunUnknown')}</p>` : nothing}</section>
      ${this.renderDensity()}
      ${role === 'edit' ? this.renderForWho() : nothing}
      <div class="actions">
        <mh-button variant="tonal" block @click=${() => this.startAdjust()}><mh-icon name="tune"></mh-icon>${t('theme.adjust')}</mh-button>
        <mh-button variant="text" block @click=${() => this.startAll()}><mh-icon name="code"></mh-icon>${t('theme.allValues')}</mh-button>
      </div>
      ${this.renderThemes()}
      ${role === 'edit' ? this.renderBoardsSwitch() : nothing}
      <div class="actions">
        <mh-button variant="text" block @click=${() => { this.view = { kind: 'import' }; }}><mh-icon name="download"></mh-icon>${t('theme.fromOther')}</mh-button>
      </div>
    </div>`;
  }

  private renderDensity() {
    const t = this.t;
    if (this.phone) return nothing;
    return html`<section><h3>${t('theme.density')}</h3>
      <mh-choice-group label=${t('theme.density')} .options=${densities(t)} .value=${this.density}
        @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.emit('density', { density: e.detail.value as Density }); }}></mh-choice-group></section>`;
  }

  private renderForWho() {
    const t = this.t;
    const house = this.look.house ?? DEFAULT_HOUSE;
    const note = this.target === 'house' ? t('theme.forWho.houseNote') : t('theme.forWho.deviceNote', { look: lookWords(house.theme, house.mode, this.look.themes, t) });
    return html`<section><h3>${t('theme.forWho')}</h3>
      <mh-choice-group label=${t('theme.forWho')} .options=${[{ id: 'device', label: t('theme.forWho.device'), icon: 'devices' as const }, { id: 'house', label: t('theme.forWho.house'), icon: 'home' as const }]} .value=${this.target}
        @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.emit('look-target', { target: e.detail.value as LookTarget }); }}></mh-choice-group>
      <p class="line">${note}</p>
      ${this.target === 'device' ? html`<mh-button variant="text" @click=${() => this.emit('follow-house')}>${t('theme.followAgain')}</mh-button>` : nothing}
    </section>`;
  }

  private renderBoardsSwitch() {
    const t = this.t;
    const { device } = this.look;
    return html`<div class="rows"><div class="row"><span class="label">${t('theme.boards')}<small>${t('theme.boardsHelp')}</small></span>
      <mh-switch label=${t('theme.boards')} ?checked=${!device.ignoreBoards} @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.emit('device-look', { ignoreBoards: !e.detail.checked }); }}></mh-switch></div></div>`;
  }

  private renderThemes() {
    const t = this.t;
    const own = this.look.themes.filter((file) => !BUILT_IN.some((built) => built.id === file.id));
    if (own.length === 0) return nothing;
    return html`<section><h3>${t(this.look.role === 'own' ? 'theme.themes' : 'theme.themesHouse')}</h3><div class="rows">
      ${own.map((file) => html`<button class="row theme-row hit" @click=${() => { this.view = { kind: 'share', id: file.id }; this.told = ''; this.asking = false; }}>
        <mh-icon name="share"></mh-icon><span class="label">${themeName(file, t)}<small>${themeNote(file, this.look.role, t)}</small></span><mh-icon name="chevron_right"></mh-icon></button>`)}
    </div></section>`;
  }

  private renderUse() {
    const t = this.t;
    const { device, house, themes } = this.look;
    const choice = this.choice;
    const file = themes.find((item) => item.id === choice.theme) ?? BUILT_IN[0]!;
    return html`<div class="stack">
      ${device.fromBefore
        ? html`<mh-note icon="history" tone="ok">${t('theme.fromBefore', { look: lookWords(choice.theme, choice.mode, themes, t) })}</mh-note>
          <mh-button block @click=${() => this.emit('follow-house')}><mh-icon name="home"></mh-icon>${t('theme.followFromNow')}</mh-button>`
        : html`<mh-note icon="lock">${t('theme.useOnly')}</mh-note>`}
      <section><h3>${t('theme.style')}</h3>
        <mh-look-picker disabled label=${t('theme.style')} .options=${[this.option(file)]} .value=${file.id}></mh-look-picker>
        ${house && !device.fromBefore ? html`<p class="line">${lookWords(house.theme, house.mode, themes, t)}</p>` : nothing}</section>
      ${this.renderDensity()}
      <div class="rows"><div class="row"><mh-icon name="contrast"></mh-icon><span class="label">${t('theme.helder')}<small>${t('theme.helderHelp')}</small></span>
        <mh-switch label=${t('theme.helder')} ?checked=${device.helder} @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.emit('device-look', { helder: e.detail.checked }); }}></mh-switch></div></div>
    </div>`;
  }

  // ----- adjusting -----

  /** "Alle waarden": a try-out from the theme shown now, with what it sets and its knobs, until it is saved. */
  private startAll(): void {
    const base = this.look.themes.find((file) => file.id === this.choice.theme) ?? BUILT_IN[0]!;
    const file: ThemeFile = { ...base, format: 2, id: newThemeId(), name: '', maker: '', knobs: { ...base.knobs }, values: base.values ?? {}, app: __APP_VERSION__ };
    this.draftTakenIn = this.isTaken(base);
    this.view = { kind: 'all', file };
    this.emit('look-preview', { file, cssFrom: this.cssFromOf(base) });
  }

  private renderAll(file: ThemeFile) {
    const own = this.look.themes.filter((item) => !BUILT_IN.includes(item));
    const base = this.look.themes.find((item) => item.id === this.choice.theme) ?? BUILT_IN[0]!;
    return html`<mh-all-values .t=${this.t} .file=${file} startName=${themeName(base, this.t)} seed=${shownSeed(file, this.choice.seed) ?? this.choice.seed ?? rustigExpressive.color.defaultSeed} mode=${this.shownMode}
      .otherBytes=${themesBytes(own)} ?full=${this.full}
      cssFrom=${this.cssFromOf(base)} .takenIn=${this.draftTakenIn}
      @values-preview=${(e: CustomEvent<{ file: ThemeFile; cssFrom?: string }>) => { e.stopPropagation(); this.emit('look-preview', { file: e.detail.file, cssFrom: e.detail.cssFrom }); }}
      @values-discard=${(e: Event) => { e.stopPropagation(); this.back(); }}
      @look-save=${() => { this.emit('look-preview', { file: null }); this.view = { kind: 'main' }; }}></mh-all-values>`;
  }

  /** Where the CSS of the theme being adjusted or tried out comes from: that of the theme it starts from. */
  private draftCssFrom: CssFrom = 'house';

  private cssFromOf(file: ThemeFile): CssFrom {
    return this.look.cssFrom?.[file.id] ?? 'house';
  }

  /** Someone else's theme: taken in, with CSS of someone else, or with a maker (from the gallery); a copy of one is too. */
  private isTaken(file: ThemeFile): boolean {
    if (BUILT_IN.some((built) => built.id === file.id)) return false;
    return file.maker !== '' || this.look.cssFrom?.[file.id] === 'other' || (this.look.takenIn ?? []).includes(file.id);
  }

  /** Whether the theme being adjusted, or tried out in Alle waarden, started from someone else's; fixed when it starts. */
  private draftTakenIn = false;

  private startAdjust(): void {
    const base = this.look.themes.find((file) => file.id === this.choice.theme) ?? BUILT_IN[0]!;
    this.draftCssFrom = this.cssFromOf(base);
    this.draftTakenIn = this.isTaken(base);
    this.draft = { ...base, id: newThemeId(), name: '', maker: '', knobs: { ...styleOf(base).knobs }, app: __APP_VERSION__ };
    this.draftName = '';
    this.view = { kind: 'adjust' };
    this.emit('look-preview', { file: this.draft, cssFrom: this.draftCssFrom });
  }

  private setKnob(name: KnobName, value: string): void {
    if (!this.draft) return;
    const allowed = KNOB_VALUES[name] as readonly (string | number)[];
    const chosen = allowed.find((item) => String(item) === value);
    if (chosen === undefined) return;
    this.draft = { ...this.draft, knobs: { ...this.draft.knobs, [name]: chosen } as Partial<Knobs> };
    this.emit('look-preview', { file: this.draft, cssFrom: this.draftCssFrom });
  }

  /** In the colour the theme is shown in; light and dark both count: the house can be either, and so can this device. */
  private poorPlaces(file: ThemeFile): number {
    return poorPlaces(file, shownSeed(file, this.choice.seed) ?? this.choice.seed);
  }

  private renderAdjust() {
    const t = this.t;
    const draft = this.draft;
    if (!draft) return nothing;
    const knobs = styleOf(draft).knobs;
    const poor = this.poorPlaces(draft);
    const base = this.look.themes.find((file) => file.id === this.choice.theme) ?? BUILT_IN[0]!;
    return html`<div class="stack">
      <p class="line">${t('adjust.lead', { name: themeName(base, t) })}</p>
      ${KNOBS.map((name) => html`<section><h3>${t(`adjust.${name}` as MessageKey)}</h3>
        <mh-choice-group label=${t(`adjust.${name}` as MessageKey)} .value=${String(knobs[name])}
          .options=${(KNOB_VALUES[name] as readonly (string | number)[]).map((value) => ({ id: String(value), label: typeof value === 'number' ? String(value) : t(`adjust.${name}.${value}` as MessageKey) }))}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.setKnob(name, e.detail.value); }}></mh-choice-group></section>`)}
      ${poor > 0 ? html`<mh-note icon="visibility" tone="error">${t('adjust.poor', { count: poor })}
        <mh-button variant="text" @click=${() => this.setKnob('contrast', 'highest')}>${t('adjust.fix')}</mh-button></mh-note>` : nothing}
      <mh-text-field label=${t('adjust.name')} .value=${this.draftName} placeholder=${t('adjust.defaultName')} maxlength=${LIMITS_LOOKS.nameLength}
        @input=${(e: CustomEvent<{ value: string }> | InputEvent) => { this.draftName = (e as CustomEvent<{ value: string }>).detail?.value ?? (e.target as HTMLInputElement).value ?? ''; }}></mh-text-field>
      ${this.full ? html`<mh-note icon="warning" tone="error">${t('import.full')}</mh-note>` : nothing}
      <div class="actions">
        ${this.full ? nothing : html`<mh-button block @click=${() => this.saveDraft()}>${t('adjust.save')}</mh-button>`}
        <mh-button variant="text" block @click=${() => this.back()}>${t('adjust.discard')}</mh-button>
      </div>
    </div>`;
  }

  /** As many themes as there may be: a new one cannot be kept. */
  private get full(): boolean {
    return this.look.themes.length - BUILT_IN.length >= LIMITS_LOOKS.themes;
  }

  private saveDraft(): void {
    if (!this.draft || this.full) return;
    const file: ThemeFile = { ...this.draft, name: this.draftName.trim().slice(0, LIMITS_LOOKS.nameLength) || this.t('adjust.defaultName') };
    this.emit('look-save', { file, poor: this.poorPlaces(file), cssFrom: this.draftCssFrom, takenIn: this.draftTakenIn });
    this.emit('look-preview', { file: null });
    this.draft = null;
    this.view = { kind: 'main' };
  }

  // ----- sharing -----

  private renderShare(id: string) {
    const t = this.t;
    const file = this.look.themes.find((item) => item.id === id);
    if (!file) return nothing;
    const code = toShareCode(file);
    return html`<div class="stack">
      <p class="line">${t('share.lead')}</p>
      <section><h3>${t('share.code')}</h3><p class="code">${code}</p></section>
      <div class="actions">
        <mh-button block @click=${() => { void this.copy(code); }}><mh-icon name="content_copy"></mh-icon>${t('share.copy')}</mh-button>
        <mh-button variant="tonal" block @click=${() => this.download(file)}><mh-icon name="download"></mh-icon>${t('share.file')}</mh-button>
      </div>
      ${this.renderSend(file, code)}
      ${this.told ? html`<mh-note icon="check" tone="ok">${this.told}</mh-note>` : nothing}
      ${this.look.role === 'use' ? nothing : this.asking
        ? html`<mh-note icon="warning" tone="error">${t('share.removeAsk')}</mh-note>
          <div class="actions"><mh-button variant="danger" block @click=${() => { this.emit('look-remove', { id }); this.back(); }}><mh-icon name="delete"></mh-icon>${t('share.removeYes')}</mh-button>
          <mh-button variant="text" block @click=${() => { this.asking = false; }}>${t('section.dialog.cancel')}</mh-button></div>`
        : html`<mh-button variant="text" block @click=${() => { this.asking = true; }}><mh-icon name="delete"></mh-icon>${t('share.remove')}</mh-button>`}
    </div>`;
  }

  /**
   * "Insturen bij de galerij": only for a theme made in this house, never a built-in style or one taken in from someone
   * else (no one sends in a theme of another under their own name), and not on a device that may only use.
   */
  private renderSend(file: ThemeFile, code: string) {
    const t = this.t;
    if (this.look.role === 'use' || BUILT_IN.some((built) => built.id === file.id) || this.isTaken(file)) return nothing;
    const form = galleryForm(themeName(file, t), code);
    if (form.kind === 'too-big') return html`<mh-note icon="info">${t('gallery.tooBig')}</mh-note>`;
    // a long code goes on the clipboard; where the browser has none (an address without https) it is copied above by hand
    const clipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';
    const copy = form.kind === 'name-only' && clipboard ? () => { void this.copy(code, 'gallery.copied'); } : null;
    const lead = form.kind === 'filled' ? 'gallery.sendLead' : clipboard ? 'gallery.sendLeadLong' : 'gallery.sendLeadManual';
    return html`<div class="gallery">
      ${this.galleryLink(form.url, t('gallery.send'), copy)}
      <p>${t(lead)}</p>
    </div>`;
  }

  /** A link to the gallery: a real link, opened in a new tab, that takes nothing along to it. */
  private galleryLink(url: string, label: string, onClick: (() => void) | null = null) {
    return html`<a class="link" href=${url} target="_blank" rel="noopener noreferrer" @click=${() => onClick?.()}>${label}<span class="unseen">${this.t('gallery.newTab')}</span><mh-icon name="open_in_new"></mh-icon></a>`;
  }

  /** The code on the clipboard; where the browser has no clipboard (an address without https) the code is selected to copy by hand. */
  private async copy(code: string, told: MessageKey = 'share.copied'): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.told = this.t(told);
    } catch {
      const text = this.shadowRoot?.querySelector('.code');
      const range = document.createRange();
      if (text) {
        range.selectNodeContents(text);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  private download(file: ThemeFile): void {
    const name = fileNameOf(themeName(file, this.t));
    const url = URL.createObjectURL(new Blob([toFileText(file)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    // the browser needs the address until the download has begun
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    this.told = this.t('share.saved', { file: name });
  }

  // ----- a theme of someone else -----

  private check(text: string, file = false): void {
    this.importText = file ? '' : text;
    this.imported = text.trim() === '' ? null : file ? fromFileText(text) : fromShareCode(text);
    this.addAsNew = false;
  }

  private onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0];
    input.value = '';
    if (!chosen) return;
    if (chosen.size > LIMITS_LOOKS.fileBytes * 2) { this.imported = { ok: false, reason: 'too-big' }; return; }
    const reader = new FileReader();
    reader.onload = () => this.check(typeof reader.result === 'string' ? reader.result : '', true);
    reader.onerror = () => { this.imported = { ok: false, reason: 'not-a-theme' }; };
    reader.readAsText(chosen);
  }

  private renderImport() {
    const t = this.t;
    const result = this.imported;
    return html`<div class="stack">
      <mh-text-field label=${t('import.paste')} .value=${this.importText} icon="content_copy"
        @input=${(e: CustomEvent<{ value: string }> | InputEvent) => this.check((e as CustomEvent<{ value: string }>).detail?.value ?? (e.target as HTMLInputElement).value ?? '')}></mh-text-field>
      <mh-button variant="tonal" block @click=${() => this.shadowRoot?.querySelector<HTMLInputElement>('input[type="file"]')?.click()}><mh-icon name="upload"></mh-icon>${t('import.chooseFile')}</mh-button>
      <input type="file" accept=".json,application/json" hidden tabindex="-1" aria-hidden="true" @change=${(e: Event) => { e.stopPropagation(); this.onFile(e); }}>
      ${result === null ? nothing : result.ok ? this.renderChecked(result.file, result.dropped.length) : html`<mh-note icon="error" tone="error">${t(({ 'damaged': 'import.damaged', 'not-a-theme': 'import.notTheme', 'too-new': 'import.tooNew', 'too-big': 'import.tooBig' } as const)[result.reason])}</mh-note>`}
      <section class="row stack gallery"><span class="label">${t('gallery.more')}</span>
        <p>${t('gallery.moreLead')}</p>
        <p class="address">${GALLERY_TEXT}</p>
        ${this.galleryLink(GALLERY_URL, t('gallery.open'))}
      </section>
    </div>`;
  }

  private renderChecked(file: ThemeFile, dropped: number) {
    const t = this.t;
    const poor = this.poorPlaces(file);
    const known = this.look.themes.some((item) => item.id === file.id);
    const full = (!known || this.addAsNew) && this.full;
    return html`<mh-look-picker disabled label=${t('theme.fromOther')} .options=${[this.option(file)]} .value=${file.id}></mh-look-picker>
      <mh-note icon="verified_user">${t('import.checked', { count: valueCount(file), dropped })} ${poor > 0 ? t('import.poor', { count: poor }) : t('import.legible')}</mh-note>
      ${file.css?.text.trim() ? this.renderImportedCss(file, file.css.text) : nothing}
      ${dangerClear(file, shownSeed(file, this.choice.seed) ?? this.choice.seed ?? rustigExpressive.color.defaultSeed) ? nothing : html`<mh-note icon="warning">${t('values.danger')}</mh-note>`}
      ${known ? html`<section><h3>${t('import.same')}</h3><mh-choice-group label=${t('import.same')} .value=${this.addAsNew ? 'add' : 'replace'}
        .options=${[{ id: 'replace', label: t('import.replace') }, { id: 'add', label: t('import.add') }]}
        @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.addAsNew = e.detail.value === 'add'; }}></mh-choice-group></section>` : nothing}
      ${full ? html`<mh-note icon="warning" tone="error">${t('import.full')}</mh-note>` : html`<mh-button block @click=${() => this.saveImported(file)}>${t('import.save')}</mh-button>`}`;
  }

  /** The CSS of a theme from someone else, read only: what waits for permission struck through grey, what never works red. */
  private renderImportedCss(file: ThemeFile, text: string) {
    const t = this.t;
    const { never, notYet } = cssLines(text);
    const tokens = computeLook(styleOf(file), { seed: shownSeed(file, this.choice.seed) ?? this.choice.seed ?? rustigExpressive.color.defaultSeed, mode: this.shownMode, density: 'comfortable' }, false);
    const lines = text.split('\n');
    const mayAllow = this.look.role !== 'use';
    return html`<mh-note icon="code">${t('import.css', { count: lines.length })}</mh-note>
      ${cssFakesAlarm(text, tokens) ? html`<mh-note icon="warning">${t('css.fake')}</mh-note>` : nothing}
      <div class="css-code" role="group" aria-label=${t('css.label')}>${lines.map((line, index) => {
        const status = never.has(index + 1) ? 'never' : notYet.has(index + 1) ? 'not-yet' : '';
        return html`<div class=${status ? `css-line ${status}` : 'css-line'}><span class="num" aria-hidden="true">${index + 1}</span><span class="text">${line}</span>${status
          ? html`<span class="unseen">, ${t(status === 'never' ? 'import.cssNever' : 'import.cssNotYet')}</span>` : nothing}</div>`;
      })}</div>
      ${mayAllow ? html`<div class="row"><span class="label">${t('import.cssAllow')}</span>
        <mh-switch label=${t('import.cssAllow')} ?checked=${this.allowCss} @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.allowCss = e.detail.checked; }}></mh-switch></div>` : nothing}`;
  }

  private saveImported(file: ThemeFile): void {
    const keep = this.addAsNew ? { ...file, id: newThemeId() } : file;
    if (keep.css?.text) allowCss(safeStorage(() => window.localStorage), keep.id, keep.css.text, this.allowCss && this.look.role !== 'use');
    this.emit('look-save', { file: keep, poor: this.poorPlaces(keep), cssFrom: 'other', takenIn: true });
    this.back();
  }
}

if (!customElements.get('mh-theme-panel')) customElements.define('mh-theme-panel', MhThemePanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-theme-panel': MhThemePanel }
}
