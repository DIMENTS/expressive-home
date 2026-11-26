import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import { t as dutch, type MessageKey, type Translate } from '../../i18n';
import { EMPTY_BASE, type ThemeFile, type ThemeValues, type ValueLayer } from '../../theme/look';
import { coloursOf, TEXT_PAIRS } from '../../theme/legible';
import { cssFakesAlarm } from '../../theme/css/fake-alarm';
import { PART_NAMES } from '../../theme/css/parts';
import { sanitizeCss } from '../../theme/css/sanitize';
import type { CssFrom } from '../../theme/looks-doc';
import { rustigExpressive } from '../../theme/rustig-expressive';
import { PHONE_MAX_PX } from '../breakpoints';
import { computeLook, styleOf } from '../../theme/styles';
import { LIMITS_LOOKS, valueCount, written } from '../../theme/theme-file';
import type { Mode } from '../../theme/types';
import { GROUPS, entryOf, type Entry, type Group } from '../../theme/values/catalogue';
import { SETTABLE_ROLES } from '../../theme/values/kinds';
import {
  createSteps, dangerClear, fixPoor, fractionOf, ownValue, poorList, setValue, shownRows, valueAt, wordsOf,
} from '../model/all-values';
import { sharedStyles } from '../parts/shared-styles';
import { panelStyles } from './panel-styles';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/note';
import '../parts/slider';
import '../parts/switch';
import '../parts/text-field';

/** What the editor reports: a try-out to show, a theme to keep, or nothing kept. */
export interface ValuesSave { file: ThemeFile; poor: number; cssFrom: CssFrom; takenIn: boolean }

const ROLE_WORDS = new Map(SETTABLE_ROLES.map((role) => [`c-${role}`, `values.role.c-${role}`]));
const MOTION_GROUP: Group = 'motion';

/** A colour as the browser reads it, for the little swatch: the first colour a value can show. */
function swatchOf(value: string | undefined, tokens: Record<string, string>): string {
  const colour = value === undefined ? null : coloursOf(value, tokens)?.[0];
  if (!colour) return 'transparent';
  const channel = (v: number): number => Math.round(v * 255);
  return `rgb(${channel(colour.r)} ${channel(colour.g)} ${channel(colour.b)} / ${Math.round(colour.a * 1000) / 1000})`;
}

/** The size of a text as a person reads it: kB with one decimal. */
const sizeText = (bytes: number): string => `${(bytes / 1024).toFixed(1)} kB`;

/**
 * "Alle waarden": every value of a theme, for light, dark or both. Starts from a theme with what was adjusted; a
 * try-out until it is saved. The panel draws in Rustig, whatever is changed: the dashboard beside it shows the try-out.
 * Reports `values-preview` with { file } at every change, `look-save` with { file, poor } and `values-discard`.
 */
export class MhAllValues extends LitElement {
  static override properties = {
    t: { attribute: false },
    file: { attribute: false },
    seed: { type: String },
    mode: { type: String },
    startName: { type: String },
    cssFrom: { type: String },
    takenIn: { type: Boolean },
    otherBytes: { type: Number },
    full: { type: Boolean },
    draft: { state: true },
    layer: { state: true },
    query: { state: true },
    group: { state: true },
    rest: { state: true },
    picking: { state: true },
    told: { state: true },
    name: { state: true },
    reduced: { state: true },
    typing: { state: true },
    step: { state: true },
    cssText: { state: true },
  };

  declare t: Translate;
  /** The theme it starts from. */
  declare file: ThemeFile;
  /** The base colour the theme is shown in. */
  declare seed: string;
  /** Light or dark as the device shows it now. */
  declare mode: Mode;
  /** The name of the theme it starts from, for the line at the top. */
  declare startName: string;
  /** Where the CSS of the theme it starts from comes from; written here, it is the house's. */
  declare cssFrom: CssFrom;
  /** It starts from someone else's theme: what is saved is someone else's too. */
  declare takenIn: boolean;
  /** All values, or the step for own CSS. */
  declare step: 'values' | 'css';
  /** The CSS as typed: it counts after a pause. */
  declare cssText: string;
  private cssEdited = false;
  private cssTimer: ReturnType<typeof setTimeout> | null = null;
  /** The field being typed in and its text, kept as typed while the value it stands for is shown on the page. */
  declare typing: { field: string; text: string } | null;
  /** What the other themes of the house or this browser take together, for the limit of all together. */
  declare otherBytes: number;
  /** As many themes as there may be already. */
  declare full: boolean;
  declare draft: ThemeFile;
  declare layer: ValueLayer;
  declare query: string;
  declare group: Group | null;
  declare rest: boolean;
  /** The colour whose picker is open. */
  declare picking: string | null;
  /** What just changed, for a screen reader. */
  declare told: string;
  declare name: string;
  declare reduced: boolean;

  private steps = createSteps<ThemeFile>(null as unknown as ThemeFile);
  private started: ThemeFile | null = null;
  private motionQuery: MediaQueryList | null = null;
  private readonly onMotion = (): void => { this.reduced = this.motionQuery?.matches ?? false; };
  private readonly onKey = (event: KeyboardEvent): void => this.key(event);

  constructor() {
    super();
    this.t = dutch;
    this.seed = rustigExpressive.color.defaultSeed;
    this.startName = '';
    this.cssFrom = 'house';
    this.takenIn = false;
    this.step = 'values';
    this.cssText = '';
    this.typing = null;
    this.mode = 'light';
    this.otherBytes = 0;
    this.full = false;
    this.layer = 'both';
    this.query = '';
    this.group = 'colour';
    this.rest = false;
    this.picking = null;
    this.told = '';
    this.name = '';
    this.reduced = false;
  }

  static override styles = [sharedStyles, panelStyles, css`
    /* in the grid of the panel it takes the width it is given, never that of its longest value */
    :host { display: block; min-width: 0; }
    .stack > * { min-width: 0; }
    .stack { display: grid; gap: var(--space-20); }
    .lead, .count { margin: 0 var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .steps { display: flex; justify-content: flex-end; gap: var(--space-4); margin-top: calc(-1 * var(--space-12)); }
    .groups { display: flex; flex-wrap: wrap; gap: var(--space-8); }
    .group {
      all: unset; box-sizing: border-box; display: inline-flex; align-items: center; min-height: var(--target-min); padding: 0 var(--space-16);
      border-radius: var(--choice-radius); background: var(--choice-bg); color: var(--choice-fg); cursor: pointer;
      font-size: var(--type-label-l-size); font-weight: var(--weight-strong);
      transition: background-color var(--motion-effects), border-radius var(--motion-spatial);
    }
    .group[aria-pressed="true"] { background: var(--choice-on-bg); color: var(--choice-on-fg); border-radius: var(--choice-radius-on); }
    .group:focus-visible, .swatch:focus-visible, .role:focus-visible, .option:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    ul { list-style: none; margin: 0; padding: 0; }
    ul.rows { grid-template-columns: minmax(0, 1fr); }
    .row { flex-wrap: wrap; }
    .row .label code { display: block; font-family: var(--share-code-font); font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); font-weight: var(--weight-regular); color: var(--c-on-surface-variant); overflow-wrap: anywhere; }
    .row.changed .label > span { color: var(--c-primary); }
    .row .value { font-family: var(--share-code-font); max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
    .row .label { min-width: 0; }
    .row mh-slider { flex: 1 1 100%; }
    .row mh-text-field { flex: 1 1 100%; }
    .swatch {
      all: unset; box-sizing: border-box; display: inline-grid; place-items: center; width: var(--target-min); height: var(--target-min); cursor: pointer; border-radius: var(--shape-full);
    }
    .swatch i, .role i { display: block; width: var(--swatch-size); height: var(--swatch-size); border-radius: var(--shape-full); background: var(--swatch, transparent); box-shadow: inset 0 0 0 var(--section-menu-divider) var(--c-outline-variant); }
    .picker { flex: 1 1 100%; display: grid; gap: var(--space-12); padding: var(--space-14); border-radius: var(--sheet-cell-radius); background: var(--c-surface-container-highest); }
    .roles, .options { display: flex; flex-wrap: wrap; gap: var(--space-8); }
    .role, .option {
      all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: var(--space-8); min-height: var(--target-min); padding: 0 var(--space-12) 0 var(--space-8);
      border-radius: var(--shape-full); background: var(--sheet-bg); cursor: pointer; font-size: var(--type-label-m-size); font-weight: var(--weight-strong);
    }
    .option { padding: 0 var(--space-14); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role i { width: var(--icon-l); height: var(--icon-l); }
    .role[aria-pressed="true"], .option[aria-pressed="true"] { background: var(--choice-on-bg); color: var(--choice-on-fg); }
    .actions { display: grid; gap: var(--space-8); }
    .css {
      box-sizing: border-box; width: 100%; resize: vertical; border: none; border-radius: var(--field-radius); padding: var(--space-12) var(--space-14);
      background: var(--field-bg); color: var(--field-fg); font-family: var(--share-code-font); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line);
    }
    .css:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .messages { display: grid; gap: var(--space-4); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.motionQuery?.addEventListener?.('change', this.onMotion);
    this.onMotion();
    this.addEventListener('keydown', this.onKey);
  }

  /** Where the CSS of the try-out comes from now. */
  private get draftCssFrom(): CssFrom {
    return this.cssEdited ? 'house' : this.cssFrom;
  }

  override disconnectedCallback(): void {
    if (this.cssTimer !== null) clearTimeout(this.cssTimer);
    this.motionQuery?.removeEventListener?.('change', this.onMotion);
    this.removeEventListener('keydown', this.onKey);
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('file') && this.file && this.file !== this.started) {
      this.started = this.file;
      this.draft = { ...this.file, values: this.file.values ?? {} };
      this.steps = createSteps(this.draft);
      this.cssText = this.file.css?.text ?? '';
      this.cssEdited = false;
      this.step = 'values';
    }
  }

  protected override updated(): void {
    // the colour of each swatch through the CSSOM: the page allows no style attributes
    for (const swatch of this.renderRoot.querySelectorAll<HTMLElement>('i[data-colour]')) swatch.style.setProperty('--swatch', swatch.dataset['colour'] ?? 'transparent');
  }

  private emit(type: string, detail: unknown = null): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** A new state of the try-out: kept as a step, shown on the dashboard. */
  private change(next: ThemeFile, told = '', field: string | null = null): void {
    if (next === this.draft) return;
    this.draft = next;
    if (field !== null && field === this.lastField) this.steps.replace(next);
    else this.steps.push(next);
    this.lastField = field;
    this.told = told;
    this.emit('values-preview', { file: next, cssFrom: this.draftCssFrom });
  }

  private setOne(name: string, raw: string | null, field: string | null = null): void {
    if (field === null) this.typing = null;
    const values = setValue(this.draft.values ?? {}, this.layer, name, raw);
    if (values === this.draft.values) return;
    const entry = entryOf(name);
    const words = entry ? wordsOf(entry, this.t) ?? name : name;
    this.change({ ...this.draft, values }, this.t('values.changedTo', { name: words, value: raw ?? this.t('values.reset') }), field);
  }

  /** The field a step came from: typing on in it changes that step. */
  private lastField: string | null = null;

  /** What is typed counts as soon as it is a value of the kind; a number without a unit gets the unit of the kind. */
  private typed(entry: Entry, field: string, text: string): void {
    this.typing = { field, text };
    const kind = entry.kind;
    const unit = kind.kind === 'size' || kind.kind === 'sizes' ? kind.unit : kind.kind === 'corner' ? 'px' : '';
    const raw = unit && /^\s*-?[\d.]+\s*$/.test(text) ? `${text.trim()}${unit}` : text;
    if (raw.trim() === ownValue(this.draft.values, this.layer, entry.name)) return;
    this.setOne(entry.name, raw, field);
  }

  /** What a field shows: what is being typed in it, or the value. */
  private fieldText(field: string, shown: string): string {
    return this.typing?.field === field ? this.typing.text : shown;
  }

  private undo(): void {
    this.typing = null;
    this.lastField = null;
    const state = this.steps.undo();
    if (!state) return;
    this.draft = state;
    this.emit('values-preview', { file: state, cssFrom: this.draftCssFrom });
  }

  private redo(): void {
    this.typing = null;
    this.lastField = null;
    const state = this.steps.redo();
    if (!state) return;
    this.draft = state;
    this.emit('values-preview', { file: state, cssFrom: this.draftCssFrom });
  }

  private key(event: KeyboardEvent): void {
    const target = event.composedPath()[0];
    // a text field keeps its own undo
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
    else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); this.redo(); }
  }

  /** The tokens of the try-out in the mode that is changed (both: the mode of the device). */
  private tokens(): Record<string, string> {
    const mode = this.layer === 'both' ? this.mode : this.layer;
    return computeLook(styleOf(this.draft), { seed: this.seed, mode, density: 'comfortable' }, false);
  }

  override render() {
    if (!this.draft) return nothing;
    if (this.step === 'css') return this.renderCss();
    const t = this.t;
    const tokens = this.tokens();
    const rows = shownRows({ group: this.query.trim() ? null : this.group, query: this.query, rest: this.rest, t });
    const listed = rows.filter((entry) => entry.listed);
    const others = rows.filter((entry) => !entry.listed);
    const poor = this.measured().poor;
    const unused = this.unusedCount();
    return html`<div class="stack">
      <p class="lead">${t('values.lead', { name: this.startName || this.file.name || t('theme.style.rustig') })}</p>
      <div class="steps">
        <mh-button variant="icon" label=${t('values.undo')} ?disabled=${!this.steps.canUndo} @click=${() => this.undo()}><mh-icon name="undo"></mh-icon></mh-button>
        <mh-button variant="icon" label=${t('values.redo')} ?disabled=${!this.steps.canRedo} @click=${() => this.redo()}><mh-icon name="redo"></mh-icon></mh-button>
      </div>
      <section><h3>${t('values.start')}</h3>
        <mh-choice-group label=${t('values.start')} .value=${this.draft.base === EMPTY_BASE ? 'leeg' : 'theme'}
          .options=${[{ id: 'theme', label: t('values.start.theme') }, { id: 'leeg', label: t('values.start.leeg') }]}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.startFrom(e.detail.value); }}></mh-choice-group></section>
      <mh-text-field label=${t('values.search')} icon="search" .value=${this.query}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.query = e.detail?.value ?? ''; }}></mh-text-field>
      <section><h3>${t('values.layer')}</h3>
        <mh-choice-group label=${t('values.layer')} .value=${this.layer}
          .options=${[{ id: 'light', label: t('theme.mode.light') }, { id: 'dark', label: t('theme.mode.dark') }, { id: 'both', label: t('values.layer.both') }]}
          @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.layer = e.detail.value as ValueLayer; }}></mh-choice-group></section>
      <div class="groups" role="group" aria-label=${t('values.groups')}>
        ${GROUPS.filter((group) => group !== 'other' || this.rest).map((group) => html`<button class="group" aria-pressed=${this.group === group && !this.query.trim() ? 'true' : 'false'}
          @click=${() => { this.group = group; this.query = ''; }}>${t(`values.group.${group}` as MessageKey)}</button>`)}
      </div>
      ${this.group === MOTION_GROUP && this.reduced ? html`<mh-note icon="info">${t('values.motion')}</mh-note>` : nothing}
      ${rows.length === 0 ? html`<p class="lead">${t('values.none')}</p>` : nothing}
      <ul class="rows">${listed.map((entry) => this.renderRow(entry, tokens))}</ul>
      <div class="row"><span class="label">${t('values.rest')}</span>
        <mh-switch label=${t('values.rest')} ?checked=${this.rest} @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.rest = e.detail.checked; }}></mh-switch></div>
      ${others.length > 0 ? html`<section><h3>${t('values.restHeading')}</h3><ul class="rows">${others.map((entry) => this.renderRow(entry, tokens))}</ul></section>` : nothing}
      ${this.renderPoor(poor)}
      ${this.measured().danger ? nothing : html`<mh-note icon="warning">${t('values.danger')}</mh-note>`}
      ${unused > 0 ? html`<mh-note icon="info">${t('values.unused', { count: unused })}</mh-note>` : nothing}
      <section><h3>${t('css.advanced')}</h3>
        <mh-button variant="tonal" block @click=${() => { this.step = 'css'; }}><mh-icon name="code"></mh-icon>${t('css.button')}</mh-button></section>
      <mh-text-field label=${t('adjust.name')} .value=${this.name} placeholder=${t('adjust.defaultName')} maxlength=${LIMITS_LOOKS.nameLength}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.name = e.detail?.value ?? ''; }}></mh-text-field>
      <p class="count">${t('values.changed', { count: valueCount({ ...this.draft, seed: null, knobs: {} }) })}</p>
      ${this.renderSave()}
      <p class="unseen" aria-live="polite">${this.told}</p>
    </div>`;
  }

  /** What is hard to read and whether danger stands out: worked out once per state of the try-out, not per key. */
  private measuredFor: { draft: ThemeFile; seed: string; poor: { mode: Mode; id: string }[]; danger: boolean } | null = null;
  private measured(): { poor: { mode: Mode; id: string }[]; danger: boolean } {
    if (this.measuredFor?.draft !== this.draft || this.measuredFor.seed !== this.seed) {
      this.measuredFor = { draft: this.draft, seed: this.seed, poor: poorList(this.draft, this.seed), danger: dangerClear(this.draft, this.seed) };
    }
    return this.measuredFor;
  }

  /** CSS that was typed counts after this pause, so the dashboard does not draw again at every key. */
  private static readonly CSS_PAUSE_MS = 300;

  private typedCss(text: string): void {
    this.cssText = text;
    if (this.cssTimer !== null) clearTimeout(this.cssTimer);
    this.cssTimer = setTimeout(() => { this.cssTimer = null; this.applyCss(); }, MhAllValues.CSS_PAUSE_MS);
  }

  private applyCss(): void {
    const text = this.cssText;
    const { css: _old, ...rest } = this.draft;
    const next: ThemeFile = text.trim() === '' ? rest : { ...rest, format: 2, css: { version: 1, text } };
    if ((this.draft.css?.text ?? '') === (next.css?.text ?? '')) return;
    this.cssEdited = true;
    this.change(next, '', 'css');
  }

  /** Puts an empty rule for a part at the end of the CSS. */
  private insert(name: string): void {
    const before = this.cssText.trimEnd();
    this.typedCss(`${before}${before ? '\n\n' : ''}::part(${name}) {\n  \n}\n`);
  }

  private renderCss() {
    const t = this.t;
    const result = sanitizeCss(this.cssText, { list: 'wide', keyframes: 'k' });
    const fake = cssFakesAlarm(this.cssText, this.tokens());
    const phone = typeof matchMedia === 'function' && matchMedia(`(width < ${PHONE_MAX_PX}px)`).matches;
    return html`<div class="stack">
      <div><mh-button variant="text" @click=${() => { this.step = 'values'; }}><mh-icon name="arrow_back"></mh-icon>${t('css.back')}</mh-button></div>
      <p class="lead">${t('css.lead')}</p>
      ${phone ? html`<mh-note icon="info">${t('css.phone')}</mh-note>` : nothing}
      <textarea class="css" rows="14" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label=${t('css.label')} .value=${live(this.cssText)}
        @input=${(e: Event) => { e.stopPropagation(); this.typedCss((e.target as HTMLTextAreaElement).value); }}></textarea>
      ${fake ? html`<mh-note icon="warning">${t('css.fake')}</mh-note>` : nothing}
      <ul class="messages" aria-live="polite">${result.messages.length === 0 ? html`<li>${t('css.none')}</li>`
        : result.messages.map((message) => html`<li>${t('css.line', { line: message.line, detail: message.detail, reason: t(`css.reason.${message.kind}` as MessageKey) })}</li>`)}</ul>
      <section><h3>${t('css.parts')}</h3><p class="lead">${t('css.states')}</p>
        <ul class="rows">${PART_NAMES.map((name) => html`<li class="row"><span class="label"><span>${t(`css.part.${name}` as MessageKey)}</span><code>${name}</code></span>
          <mh-button variant="text" small label=${t('css.insertName', { name })} @click=${() => this.insert(name)}>${t('css.insert')}</mh-button></li>`)}</ul></section>
    </div>`;
  }

  /** Names a newer version wrote that this one does not know: kept, never used. */
  private unusedCount(): number {
    const values = this.draft.values ?? {};
    return Object.values(values).reduce((sum, layer) => sum + Object.keys(layer ?? {}).filter((name) => !entryOf(name)).length, 0);
  }

  private startFrom(choice: string): void {
    const base = choice === 'leeg' ? EMPTY_BASE : this.file.base === EMPTY_BASE ? 'rustig' : this.file.base;
    if (base === this.draft.base) return;
    this.change({ ...this.draft, base, format: 2 });
  }

  private renderRow(entry: Entry, tokens: Record<string, string>) {
    const t = this.t;
    const words = wordsOf(entry, t);
    const own = ownValue(this.draft.values, this.layer, entry.name);
    const shown = own ?? tokens[`--${entry.name}`] ?? '';
    const label = words ?? entry.name;
    return html`<li class="row ${own === null ? '' : 'changed'}">
      <div class="label"><span>${label}</span>${words ? html`<code>${entry.name}</code>` : nothing}</div>
      ${entry.kind.kind === 'colour' ? nothing : html`<span class="value">${entry.kind.kind === 'fixed' ? t('values.fixed') : shown}</span>`}
      ${entry.kind.kind === 'colour' ? html`<span class="value">${shown}</span>
        <button class="swatch" aria-expanded=${this.picking === entry.name ? 'true' : 'false'} aria-label=${t('values.pick', { name: label })}
          @click=${() => { this.picking = this.picking === entry.name ? null : entry.name; }}><i data-colour=${swatchOf(shown, tokens)}></i></button>` : nothing}
      ${own === null ? nothing : html`<mh-button variant="text" small label=${t('values.resetName', { name: label })} @click=${() => this.setOne(entry.name, null)}>
        <mh-icon name="restart_alt"></mh-icon>${t('values.reset')}</mh-button>`}
      ${this.renderControl(entry, label, shown, tokens)}
    </li>`;
  }

  private renderControl(entry: Entry, label: string, shown: string, tokens: Record<string, string>) {
    const t = this.t;
    const kind = entry.kind;
    if (kind.kind === 'fixed') return nothing;
    if (kind.kind === 'colour') return this.picking === entry.name ? this.renderPicker(entry, label, shown, tokens) : nothing;
    if (kind.kind === 'choice') {
      return html`<div class="options" role="group" aria-label=${label}>${kind.also.map((option) => html`<button class="option"
        aria-pressed=${option === shown ? 'true' : 'false'} @click=${() => this.setOne(entry.name, option)}>${option.split(',')[0]!.replace(/"/g, '')}</button>`)}</div>`;
    }
    const fraction = fractionOf(kind, shown);
    return html`${fraction === null ? nothing : html`<mh-slider label=${label} .fraction=${fraction} valueText=${shown}
        @commit=${(e: CustomEvent<{ fraction: number }>) => { e.stopPropagation(); const value = valueAt(kind, e.detail.fraction); if (value) this.setOne(entry.name, value); }}></mh-slider>`}
      <mh-text-field quiet label=${`${label}: ${t('values.value')}`} .value=${this.fieldText(entry.name, shown)}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.typed(entry, entry.name, e.detail?.value ?? ''); }}></mh-text-field>`;
  }

  private renderPicker(entry: Entry, label: string, shown: string, tokens: Record<string, string>) {
    const t = this.t;
    const plain = entry.kind.kind === 'colour' && entry.kind.plain === true;
    const colour = coloursOf(shown, tokens)?.[0] ?? null;
    const hex = /^#[0-9a-f]{6}/i.exec(shown)?.[0] ?? (colour ? `#${[colour.r, colour.g, colour.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}` : '#000000');
    const alpha = /^#[0-9a-f]{8}$/i.test(shown) ? parseInt(shown.slice(7, 9), 16) / 255 : 1;
    return html`<div class="picker">
      ${plain ? nothing : html`<h3>${t('values.roles')}</h3><div class="roles" role="group" aria-label=${t('values.roles')}>
        ${SETTABLE_ROLES.map((role) => `c-${role}`).map((role) => html`<button class="role" aria-pressed=${shown === `var(--${role})` ? 'true' : 'false'}
          @click=${() => this.setOne(entry.name, `var(--${role})`)}><i data-colour=${swatchOf(tokens[`--${role}`], tokens)}></i>${t(ROLE_WORDS.get(role) as MessageKey)}</button>`)}</div>`}
      <h3>${t('values.own')}</h3>
      <mh-text-field label=${`${label}: ${t('values.hex')}`} help=${t('values.hexHelp')} .value=${this.fieldText(`${entry.name}:hex`, hex)} maxlength=${9}
        @input=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.typed(entry, `${entry.name}:hex`, e.detail?.value ?? ''); }}></mh-text-field>
      <mh-slider label=${`${label}: ${t('values.alpha')}`} .fraction=${alpha} valueText=${`${Math.round(alpha * 100)}%`}
        @commit=${(e: CustomEvent<{ fraction: number }>) => { e.stopPropagation(); this.setOne(entry.name, withAlpha(hex, e.detail.fraction)); }}></mh-slider>
    </div>`;
  }

  private renderPoor(poor: readonly { mode: Mode; id: string }[]) {
    const t = this.t;
    if (poor.length === 0) return nothing;
    const first = poor[0]!;
    const pair = TEXT_PAIRS.find((item) => item.id === first.id);
    const entry = pair ? entryOf(pair.fg.slice(2)) : undefined;
    const name = entry ? wordsOf(entry, t) ?? entry.name : first.id;
    const text = poor.length === 1 ? t('values.poor', { mode: t(`theme.mode.${first.mode}` as MessageKey).toLowerCase(), name }) : t('values.poorMore', { count: poor.length });
    return html`<mh-note icon="visibility">${text}
      <mh-button variant="text" @click=${() => this.change({ ...this.draft, values: fixPoor(this.draft, this.seed, poor) })}>${t('adjust.fix')}</mh-button></mh-note>`;
  }

  private renderSave() {
    const t = this.t;
    const file = this.fileToSave();
    const bytes = new TextEncoder().encode(JSON.stringify(file)).length;
    const total = bytes + this.otherBytes;
    const tooBig = bytes > LIMITS_LOOKS.fileBytes ? { size: sizeText(bytes), limit: sizeText(LIMITS_LOOKS.fileBytes) }
      : total > LIMITS_LOOKS.totalBytes ? { size: sizeText(total), limit: sizeText(LIMITS_LOOKS.totalBytes) } : null;
    return html`${tooBig ? html`<mh-note icon="warning" tone="error">${t('values.tooBig', tooBig)}</mh-note>` : nothing}
      ${this.full ? html`<mh-note icon="warning" tone="error">${t('import.full')}</mh-note>` : nothing}
      <div class="actions">
        ${this.full || tooBig ? nothing : html`<mh-button block @click=${() => this.save()}>${t('adjust.save')}</mh-button>`}
        <mh-button variant="text" block @click=${() => this.emit('values-discard')}>${t('adjust.discard')}</mh-button>
      </div>`;
  }

  private fileToSave(): ThemeFile {
    return written({ ...this.draft, name: this.name.trim().slice(0, LIMITS_LOOKS.nameLength) || this.t('adjust.defaultName') });
  }

  private save(): void {
    const file = this.fileToSave();
    this.emit('look-save', { file, poor: new Set(poorList(file, this.seed).map((place) => place.id)).size, cssFrom: this.draftCssFrom, takenIn: this.takenIn } satisfies ValuesSave);
  }
}

/** A hex colour with see-through: fully solid stays six digits. */
function withAlpha(hex: string, alpha: number): string {
  const share = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return share === 255 ? hex.toLowerCase() : `${hex.toLowerCase()}${share.toString(16).padStart(2, '0')}`;
}

export type { ThemeValues };

if (!customElements.get('mh-all-values')) customElements.define('mh-all-values', MhAllValues);

declare global {
  interface HTMLElementTagNameMap { 'mh-all-values': MhAllValues }
}
