import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { t as dutch, type MessageKey, type Translate } from '../../i18n';
import { DEFAULT_HOUSE, shownSeed, type DeviceLook, type HouseLook, type LookRole } from '../../theme/choose';
import { BUILT_IN, KNOB_VALUES, type KnobName, type Knobs, type ThemeFile } from '../../theme/look';
import { fromFileText, fromShareCode, toFileText, toShareCode, type FromCode } from '../../theme/share-code';
import { styleOf } from '../../theme/styles';
import { LIMITS_LOOKS, newThemeId, valueCount } from '../../theme/theme-file';
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

/** What the theme panel knows of this device's looks. */
export interface PanelLook {
  role: LookRole;
  device: DeviceLook;
  house: HouseLook | null;
  themes: readonly ThemeFile[];
}

/** A change of the look, for this device or the whole house; only the fields that change. */
export interface LookChoose { target: LookTarget; theme?: string; seed?: string; mode?: ModePreference }

type View = { kind: 'main' } | { kind: 'adjust' } | { kind: 'share'; id: string } | { kind: 'import' };

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
    boardTheme: { attribute: false },
    view: { state: true },
    draft: { state: true },
    draftName: { state: true },
    imported: { state: true },
    importText: { state: true },
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
  /** The theme of its own that the open dashboard shows; null when it shows the look chosen here. */
  declare boardTheme: string | null;
  declare view: View;
  /** The theme being adjusted, shown on the dashboard while the editor is open. */
  declare draft: ThemeFile | null;
  declare draftName: string;
  declare imported: FromCode | null;
  declare importText: string;
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
    this.boardTheme = null;
    this.view = { kind: 'main' };
    this.draft = null;
    this.draftName = '';
    this.imported = null;
    this.importText = '';
    this.addAsNew = false;
    this.told = '';
    this.asking = false;
  }

  static override styles = [sharedStyles, panelStyles, css`
    .stack { display: grid; gap: var(--space-20); }
    .actions { display: grid; gap: var(--space-8); }
    .line { margin: var(--space-8) var(--space-4) 0; font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .code {
      margin: 0; padding: var(--space-12) var(--space-14); border-radius: var(--sheet-cell-radius); background: var(--sheet-row-bg);
      font-family: var(--share-code-font); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line);
      overflow-wrap: anywhere; -webkit-user-select: all; user-select: all; color: var(--c-on-surface-variant);
    }
    .theme-row { cursor: pointer; }
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
    return mode === 'auto' ? (this.systemDark ? 'dark' : 'light') : mode;
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
    const heading = view.kind === 'adjust' ? t('theme.adjust') : view.kind === 'import' ? t('theme.fromOther') : view.kind === 'share' ? t('theme.share', { name: this.nameOf(view.id) }) : t('theme.title');
    return html`<mh-sheet .t=${t} ?open=${this.open} heading=${heading} icon=${view.kind === 'adjust' ? 'tune' : view.kind === 'share' ? 'share' : view.kind === 'import' ? 'download' : 'palette'} ?back=${sub}
      @back=${(e: Event) => { e.stopPropagation(); this.back(); }}
      @close=${(e: Event) => { e.stopPropagation(); this.emit('close'); }}>
      ${view.kind === 'adjust' ? this.renderAdjust() : view.kind === 'share' ? this.renderShare(view.id) : view.kind === 'import' ? this.renderImport() : this.renderMain()}
    </mh-sheet>`;
  }

  private back(): void {
    if (this.view.kind === 'adjust') this.emit('look-preview', { file: null });
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
        <mh-choice-group label=${t('theme.mode')} .options=${modes(t)} .value=${choice.mode}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.choose({ mode: e.detail.value as ModePreference }); }}></mh-choice-group></section>
      ${this.renderDensity()}
      ${role === 'edit' ? this.renderForWho() : nothing}
      <div class="actions">
        <mh-button variant="tonal" block @click=${() => this.startAdjust()}><mh-icon name="tune"></mh-icon>${t('theme.adjust')}</mh-button>
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

  private startAdjust(): void {
    const base = this.look.themes.find((file) => file.id === this.choice.theme) ?? BUILT_IN[0]!;
    this.draft = { ...base, id: newThemeId(), name: '', maker: '', knobs: { ...styleOf(base).knobs }, app: __APP_VERSION__ };
    this.draftName = '';
    this.view = { kind: 'adjust' };
    this.emit('look-preview', { file: this.draft });
  }

  private setKnob(name: KnobName, value: string): void {
    if (!this.draft) return;
    const allowed = KNOB_VALUES[name] as readonly (string | number)[];
    const chosen = allowed.find((item) => String(item) === value);
    if (chosen === undefined) return;
    this.draft = { ...this.draft, knobs: { ...this.draft.knobs, [name]: chosen } as Partial<Knobs> };
    this.emit('look-preview', { file: this.draft });
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
    this.emit('look-save', { file, poor: this.poorPlaces(file) });
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
      ${this.told ? html`<mh-note icon="check" tone="ok">${this.told}</mh-note>` : nothing}
      ${this.look.role === 'use' ? nothing : this.asking
        ? html`<mh-note icon="warning" tone="error">${t('share.removeAsk')}</mh-note>
          <div class="actions"><mh-button variant="danger" block @click=${() => { this.emit('look-remove', { id }); this.back(); }}><mh-icon name="delete"></mh-icon>${t('share.removeYes')}</mh-button>
          <mh-button variant="text" block @click=${() => { this.asking = false; }}>${t('section.dialog.cancel')}</mh-button></div>`
        : html`<mh-button variant="text" block @click=${() => { this.asking = true; }}><mh-icon name="delete"></mh-icon>${t('share.remove')}</mh-button>`}
    </div>`;
  }

  /** The code on the clipboard; where the browser has no clipboard (an address without https) the code is selected to copy by hand. */
  private async copy(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.told = this.t('share.copied');
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
    if (chosen.size > LIMITS_LOOKS.fileBytes) { this.imported = { ok: false, reason: 'too-big' }; return; }
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
    </div>`;
  }

  private renderChecked(file: ThemeFile, dropped: number) {
    const t = this.t;
    const poor = this.poorPlaces(file);
    const known = this.look.themes.some((item) => item.id === file.id);
    const full = (!known || this.addAsNew) && this.full;
    return html`<mh-look-picker disabled label=${t('theme.fromOther')} .options=${[this.option(file)]} .value=${file.id}></mh-look-picker>
      <mh-note icon="verified_user">${t('import.checked', { count: valueCount(file), dropped })} ${poor > 0 ? t('import.poor', { count: poor }) : t('import.legible')}</mh-note>
      ${known ? html`<section><h3>${t('import.same')}</h3><mh-choice-group label=${t('import.same')} .value=${this.addAsNew ? 'add' : 'replace'}
        .options=${[{ id: 'replace', label: t('import.replace') }, { id: 'add', label: t('import.add') }]}
        @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.addAsNew = e.detail.value === 'add'; }}></mh-choice-group></section>` : nothing}
      ${full ? html`<mh-note icon="warning" tone="error">${t('import.full')}</mh-note>` : html`<mh-button block @click=${() => this.saveImported(file)}>${t('import.save')}</mh-button>`}`;
  }

  private saveImported(file: ThemeFile): void {
    const keep = this.addAsNew ? { ...file, id: newThemeId() } : file;
    this.emit('look-save', { file: keep, poor: this.poorPlaces(keep) });
    this.back();
  }
}

if (!customElements.get('mh-theme-panel')) customElements.define('mh-theme-panel', MhThemePanel);

declare global {
  interface HTMLElementTagNameMap { 'mh-theme-panel': MhThemePanel }
}
