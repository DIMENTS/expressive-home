import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { generateDashboard } from '../../dashboard/generate';
import type { HomeySnapshot } from '../../homey/types';
import type { MessageKey, Translate } from '../../i18n';
import { arrangeOverview } from '../../onboarding/arrange';
import { firstOptions, type Choices, type Extra, type FirstOption, type StepId } from '../../onboarding/choices';
import { createPractice, type Exercise, type Practice } from '../../onboarding/practice';
import { boardFromDashboard, type Block } from '../../layout/board';
import type { SectionLayout } from '../../layout/types';
import { applyTokens } from '../../theme/engine';
import { BUILT_IN, type ThemeFile } from '../../theme/look';
import { computeLook } from '../../theme/styles';
import type { Mode, ModePreference } from '../../theme/types';
import { RUSTIG_STYLE } from '../apply-theme';
import { CONNECT_STACK_MAX_PX, PHONE_MAX_PX } from '../breakpoints';
import type { IconName } from '../icons/icons';
import { isLibraryIcon } from '../icons/library';
import { sectionIcon } from '../model/layout';
import { ChoiceBase } from '../parts/choice-group';
import type { LookOption } from '../parts/look-picker';
import { richText } from '../parts/rich-text';
import { sharedStyles } from '../parts/shared-styles';
import type { MiniBlock, MiniColumns } from './mini-board';
import '../parts/button';
import '../parts/choice-group';
import '../parts/icon';
import '../parts/look-picker';
import '../parts/note';
import '../parts/radio-list';
import '../parts/swatch-group';
import '../parts/switch';
import './mini-board';
import './practice-tiles';

/** How long the dashboard is seen being made before it is ready. */
export const BUILD_MS = 1600;
/** The little dashboard shows at most this many blocks per column: it is a picture. */
const MAX_BLOCKS = 3;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const HERO_ICONS: Record<string, IconName> = { battery: 'battery_5_bar', solar: 'solar_power', consumption: 'bolt', own: 'bolt' };
const iconOf = (icon: string | null, fallback: IconName): IconName => (icon !== null && isLibraryIcon(icon) ? icon as IconName : fallback);

/** A stored section as a block of the little dashboard. */
function blockOfLayout(section: SectionLayout): MiniBlock {
  if (section.kind === 'hero') return { id: section.id, kind: 'hero', icon: 'bolt', tiles: 0 };
  const today = section.tiles.length > 0 && section.tiles.every((tile) => tile.spec.kind === 'widget');
  if (today) return { id: section.id, kind: 'today', icon: iconOf(section.icon, 'partly_cloudy_day'), tiles: section.tiles.length };
  return { id: section.id, kind: 'section', icon: iconOf(section.icon, sectionIcon(section.kind)), tiles: section.tiles.length };
}

/** A block of the automatic dashboard as a block of the little one. */
function blockOfBoard(block: Block): MiniBlock {
  if (block.type === 'hero') return { id: block.id, kind: 'hero', icon: HERO_ICONS[block.hero?.kind ?? 'own'] ?? 'bolt', tiles: 0 };
  return { id: block.section.id, kind: 'section', icon: iconOf(block.section.icon ?? null, sectionIcon(block.section.kind)), tiles: block.section.tiles.length };
}

/** The layout choice: two cards, each with three icons of what its sections are about. */
export class MhLayoutPicker extends ChoiceBase {
  declare options: (LookOption extends never ? never : { id: string; label: string; note: string; icons: IconName[] })[];

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .group { display: grid; grid-template-columns: repeat(auto-fit, minmax(var(--onboarding-option-min), 1fr)); gap: var(--space-10); }
    .option {
      cursor: pointer; display: grid; gap: var(--space-10); align-content: start; padding: var(--space-16); border-radius: var(--look-card-radius);
      background: var(--look-card-bg); color: var(--look-card-fg); transition: box-shadow var(--motion-effects), background-color var(--motion-effects);
    }
    .option:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--look-card-bg)); }
    .option[aria-checked="true"] { box-shadow: inset 0 0 0 var(--look-card-ring) var(--c-primary); }
    .option:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .icons { display: flex; gap: var(--space-6); }
    .icons span {
      width: var(--icon-box, var(--next-icon-box)); height: var(--next-icon-box); display: grid; place-items: center; border-radius: var(--shape-full);
      background: var(--tile-icon-bg); color: var(--tile-icon-fg); --icon-size: var(--icon-m);
      transition: clip-path var(--motion-spatial), background-color var(--motion-effects);
    }
    .option[aria-checked="true"] .icons span { background: var(--tile-icon-on-bg); color: var(--tile-icon-on-fg); clip-path: var(--shape-cookie); }
    .name { font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
    .note { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--look-card-note-fg); }
    @media (prefers-reduced-motion: reduce) { .option[aria-checked="true"] .icons span { clip-path: var(--shape-circle); } }
  `];

  override render() {
    return html`<div class="group" role="radiogroup" aria-label=${this.label}>${this.options.map((option, index) => this.renderOption({ ...option, label: `${option.label}, ${option.note}` }, index, html`
      <div class="icons" aria-hidden="true">${option.icons.map((icon) => html`<span><mh-icon name=${icon}></mh-icon></span>`)}</div>
      <span class="name">${option.label}</span><span class="note">${option.note}</span>`))}</div>`;
  }
}

if (!customElements.get('mh-layout-picker')) customElements.define('mh-layout-picker', MhLayoutPicker);

/**
 * The first start of a hub, after this device paired: a welcome, the choices that make the first dashboard (each with a
 * little dashboard that moves along), the dashboard being made, and practising with tiles of a hub of its own. Held by
 * the app: every change of the step or of a choice is reported as `onboarding-change` { step, choices }, and the app
 * puts it back. `onboarding-skip` and `onboarding-finish` end it. Draws in Rustig, in the chosen colour and light or
 * dark; only the little dashboard and the practice tiles show the chosen style.
 */
export class MhOnboarding extends LitElement {
  static override properties = {
    t: { attribute: false },
    snapshot: { attribute: false },
    steps: { attribute: false },
    step: { type: String, reflect: true },
    choices: { attribute: false },
    presets: { attribute: false },
    extras: { attribute: false },
    phone: { type: Boolean, reflect: true },
    systemDark: { type: Boolean },
    sunDark: { attribute: false },
    touch: { type: Boolean },
    ready: { type: Boolean },
    built: { state: true },
    done: { state: true },
    asked: { state: true },
    hinted: { state: true },
    opened: { state: true },
    said: { state: true },
  };

  declare t: Translate;
  declare snapshot: HomeySnapshot | null;
  declare steps: StepId[];
  declare step: StepId;
  declare choices: Choices;
  declare presets: { id: string; seed: string }[];
  /** The widgets the hub can fill. */
  declare extras: Extra[];
  declare phone: boolean;
  declare systemDark: boolean;
  /** Whether it is dark at the hub, by its weather; null when that is not known. */
  declare sunDark: boolean | null;
  /** A finger, not a mouse: the words of the practice differ. */
  declare touch: boolean;
  /** The hub answered and this device may arrange: the choices can begin. */
  declare ready: boolean;
  /** The dashboard was made. */
  declare built: boolean;
  declare done: Record<Exercise, boolean>;
  /** The lock was tapped instead of held. */
  declare asked: boolean;
  /** The slider was tapped instead of held. */
  declare hinted: boolean;
  /** A tile asked for the window of its device. */
  declare opened: boolean;
  /** What the live line says of the practice. */
  declare said: string;
  /** The hub of the practice; made when the practice is first shown. */
  practice: Practice | null = null;
  private buildTimer: ReturnType<typeof setTimeout> | null = null;
  /** Going back: the content comes from the other side. */
  private back = false;
  private drawn = '';

  constructor() {
    super();
    this.snapshot = null;
    this.steps = [];
    this.step = 'welcome';
    this.presets = [];
    this.extras = [];
    this.phone = false;
    this.systemDark = false;
    this.sunDark = null;
    this.touch = false;
    this.ready = true;
    this.built = false;
    this.done = { tap: false, dim: false, lock: false };
    this.asked = false;
    this.hinted = false;
    this.opened = false;
    this.said = '';
  }

  static override styles = [sharedStyles, css`
    :host {
      display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; min-height: 100vh; box-sizing: border-box;
      padding: var(--space-32) max(var(--space-24), env(safe-area-inset-right)) var(--space-32) max(var(--space-24), env(safe-area-inset-left));
      background: var(--page-bg); color: var(--page-fg); font-family: var(--font-family);
      transition: background-color var(--motion-effects), color var(--motion-effects);
    }
    .card {
      width: 100%; max-width: var(--connect-max-width); display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      gap: var(--space-8); padding: var(--space-8); background: var(--section-bg); color: var(--section-fg); border-radius: var(--section-radius);
      transition: background-color var(--motion-effects);
    }
    .stage {
      position: relative; overflow: hidden; display: grid; place-items: center; min-height: var(--onboarding-stage-height); padding: var(--space-24);
      border-radius: var(--shape-xl); background: var(--section-hero-bg); color: var(--section-hero-fg);
      transition: background-color var(--motion-effects), color var(--motion-effects);
    }
    .drift {
      position: absolute; top: var(--connect-art-offset); right: var(--connect-art-offset); width: var(--connect-art-size); height: var(--connect-art-size);
      background: var(--connect-art-bg); clip-path: var(--shape-cookie); animation: spin var(--motion-drift) linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .stage > :not(.drift) { position: relative; }
    .art {
      width: var(--onboarding-art-size); height: var(--onboarding-art-size); display: grid; place-items: center;
      background: var(--c-primary); color: var(--c-on-primary); clip-path: var(--shape-circle); --icon-size: var(--onboarding-art-icon);
      animation: grow var(--motion-spatial) both; transition: clip-path var(--motion-spatial);
    }
    .art.shown { clip-path: var(--shape-cookie); }
    @keyframes grow { from { transform: scale(var(--onboarding-arrive-scale)); opacity: 0; } }
    .panel { display: grid; grid-template-rows: auto 1fr auto; gap: var(--space-20); min-height: var(--onboarding-panel-min); padding: var(--space-24) var(--space-24) var(--space-20) var(--space-20); min-width: 0; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-12); }
    .dots { display: flex; align-items: center; gap: var(--space-6); margin: 0; padding: 0; list-style: none; }
    .dots li {
      width: var(--onboarding-dot-size); height: var(--onboarding-dot-size); border-radius: var(--shape-full); background: var(--onboarding-todo-bg);
      transition: width var(--motion-spatial), height var(--motion-spatial), clip-path var(--motion-spatial), background-color var(--motion-effects);
    }
    .dots li.past { background: var(--c-primary); }
    .dots li[aria-current] { width: var(--onboarding-dot-current); height: var(--onboarding-dot-current); background: var(--c-primary); clip-path: var(--shape-cookie); }
    .content { display: grid; gap: var(--space-16); align-content: start; min-width: 0; animation: enter var(--motion-spatial) both; }
    :host([data-back]) .content { animation-name: enter-back; }
    @keyframes enter { from { opacity: 0; transform: translateX(var(--onboarding-shift)); } }
    @keyframes enter-back { from { opacity: 0; transform: translateX(calc(-1 * var(--onboarding-shift))); } }
    h1 {
      margin: 0; font-size: var(--type-greeting-size); line-height: var(--type-greeting-line); font-weight: var(--weight-strong); letter-spacing: var(--tracking-display);
      outline: none;
    }
    .lead { margin: 0; font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); color: var(--c-on-surface-variant); }
    .label { margin: var(--space-4) 0 0; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
    .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--space-8); }
    .actions .spacer { flex: 1; }
    .picks { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--onboarding-option-min), 1fr)); gap: var(--space-8); }
    .pick {
      all: unset; box-sizing: border-box; cursor: pointer; position: relative; display: flex; align-items: center; gap: var(--space-10);
      min-height: var(--onboarding-pick-height); padding: var(--space-8) var(--space-12); border-radius: var(--tile-radius);
      background: var(--tile-bg); color: var(--tile-fg); font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong);
      transition: background-color var(--motion-effects), color var(--motion-effects), transform var(--motion-spatial);
    }
    .pick:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--tile-bg)); }
    .pick:active { transform: scale(var(--press-scale)); }
    .pick:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .pick[aria-pressed="true"] { background: var(--tile-on-bg); color: var(--tile-on-fg); }
    .pick .icon {
      flex: none; width: var(--tile-icon-box); height: var(--tile-icon-box); display: grid; place-items: center; border-radius: var(--shape-full);
      background: var(--tile-icon-bg); color: var(--tile-icon-fg); --icon-size: var(--icon-m);
      transition: clip-path var(--motion-spatial), background-color var(--motion-effects), color var(--motion-effects);
    }
    .pick[aria-pressed="true"] .icon { background: var(--tile-icon-on-bg); color: var(--tile-icon-on-fg); clip-path: var(--shape-cookie); }
    .pick .name { min-width: 0; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
    .badge {
      position: absolute; top: calc(-1 * var(--space-6)); right: calc(-1 * var(--space-6)); width: var(--onboarding-badge-size); height: var(--onboarding-badge-size);
      display: grid; place-items: center; background: var(--c-primary); color: var(--c-on-primary); clip-path: var(--shape-cookie);
      font-size: var(--type-label-m-size); font-weight: var(--weight-strong); animation: grow var(--motion-spatial) both;
    }
    .extras { display: grid; gap: var(--space-4); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-12); min-height: var(--target-min); }
    .row span { display: grid; }
    .row small { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); color: var(--c-on-surface-variant); }
    .exercises { display: grid; gap: var(--space-10); margin: 0; padding: 0; list-style: none; }
    .summary { display: grid; gap: var(--space-6); margin: 0; padding: 0; list-style: none; }
    .summary li {
      display: flex; align-items: center; gap: var(--space-12); min-height: var(--next-icon-box); padding: var(--space-6) var(--space-12) var(--space-6) var(--space-6);
      border-radius: var(--tile-radius); background: var(--tile-bg); color: var(--tile-fg); font-size: var(--type-label-l-size); line-height: var(--type-label-l-line);
      animation: grow var(--motion-spatial) both;
    }
    .summary mh-icon {
      flex: none; width: var(--tile-icon-box); height: var(--tile-icon-box); display: grid; place-items: center; border-radius: var(--shape-full);
      background: var(--tile-icon-bg); color: var(--tile-icon-fg); --icon-size: var(--icon-m);
    }
    .exercise { display: flex; align-items: center; gap: var(--space-12); min-height: var(--target-min); font-size: var(--type-label-l-size); line-height: var(--type-body-l-line); }
    .check {
      flex: none; width: var(--onboarding-check-size); height: var(--onboarding-check-size); display: grid; place-items: center;
      background: var(--onboarding-todo-bg); color: var(--c-on-surface-variant); clip-path: var(--shape-circle); --icon-size: var(--icon-s);
      transition: clip-path var(--motion-spatial), background-color var(--motion-effects), color var(--motion-effects);
    }
    .exercise[data-done] .check { background: var(--onboarding-check-bg); color: var(--onboarding-check-fg); clip-path: var(--shape-cookie); }
    .exercise .number { font-weight: var(--weight-strong); }
    @media (prefers-reduced-motion: reduce) {
      .art.shown, .dots li[aria-current], .pick[aria-pressed="true"] .icon, .badge, .exercise[data-done] .check { clip-path: var(--shape-circle); }
    }
    @media (width < ${CONNECT_STACK_MAX_PX}px) {
      .card { grid-template-columns: minmax(0, 1fr); }
      .stage { min-height: var(--onboarding-stage-phone); }
      .panel { min-height: 0; }
    }
    @media (width < ${PHONE_MAX_PX}px) {
      :host { padding: max(var(--space-12), env(safe-area-inset-top)) var(--space-12) max(var(--space-12), env(safe-area-inset-bottom)); place-items: start stretch; }
      .stage { padding: var(--space-12); }
      .panel { padding: var(--space-16) var(--space-12) var(--space-12); gap: var(--space-16); }
      h1 { font-size: var(--header-title-size); }
      .actions { position: sticky; bottom: 0; padding-top: var(--space-8); background: var(--section-bg); }
    }
  `];

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopBuilding();
  }

  /** Puts the focus on the heading of the step, as when a screen opens. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('h1')?.focus(options);
  }

  private stopBuilding(): void {
    if (this.buildTimer !== null) clearTimeout(this.buildTimer);
    this.buildTimer = null;
  }

  /** Light or dark as it is shown now. */
  private get shownMode(): Mode {
    const { mode } = this.choices;
    if (mode === 'light' || mode === 'dark') return mode;
    if (mode === 'sun' && this.sunDark !== null) return this.sunDark ? 'dark' : 'light';
    return this.systemDark ? 'dark' : 'light';
  }

  private get file(): ThemeFile {
    return BUILT_IN.find((file) => file.id === this.choices.theme) ?? BUILT_IN[0]!;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('step')) {
      this.toggleAttribute('data-back', this.back);
      if (this.step === 'build') this.startBuilding();
      else this.stopBuilding();
      if (this.step === 'practice' && !this.practice) {
        const practice = createPractice(this.t, (flush) => { requestAnimationFrame(flush); });
        practice.onDone((exercise) => { this.done = practice.done(); this.said = this.t('onboarding.practice.told', { what: this.exerciseWords(exercise) }); });
        this.practice = practice;
        this.done = practice.done();
      }
      this.asked = false;
      this.hinted = false;
      this.opened = false;
    }
  }

  private startBuilding(): void {
    this.stopBuilding();
    this.built = reducedMotion();
    if (!this.built) this.buildTimer = setTimeout(() => { this.buildTimer = null; this.built = true; }, BUILD_MS);
  }

  protected override updated(changed: PropertyValues<this>): void {
    const key = `${this.choices.seed} ${this.shownMode} ${this.phone}`;
    if (key !== this.drawn) {
      applyTokens(this, computeLook(RUSTIG_STYLE, { seed: this.choices.seed, mode: this.shownMode, density: this.phone ? 'phone' : 'comfortable' }, false));
      this.drawn = key;
    }
    // the cookie of the welcome grows out of a circle
    if (changed.has('step') && this.step === 'welcome') requestAnimationFrame(() => this.shadowRoot?.querySelector('.art')?.classList.add('shown'));
    if (changed.has('step') && changed.get('step') !== undefined) this.shadowRoot?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  private change(next: { step?: StepId; choices?: Partial<Choices> }): void {
    const step = next.step ?? this.step;
    this.back = this.steps.indexOf(step) < this.steps.indexOf(this.step);
    const choices = { ...this.choices, ...next.choices };
    this.dispatchEvent(new CustomEvent('onboarding-change', { detail: { step, choices }, bubbles: true, composed: true }));
  }

  private go(delta: number): void {
    const next = this.steps[this.steps.indexOf(this.step) + delta];
    if (next) this.change({ step: next });
  }

  private emit(type: 'onboarding-skip' | 'onboarding-finish'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  // ----- the little dashboard -----

  private columns(): MiniColumns {
    const { snapshot } = this;
    if (!snapshot) return { left: [], right: [] };
    const locale = this.t.locale;
    const arranged = this.step === 'first' || this.step === 'build' || this.step === 'practice'
      ? arrangeOverview(snapshot, this.choices, { locale, today: this.t('onboarding.today'), newId: (prefix) => `${prefix}-preview` }) : null;
    let columns: MiniColumns;
    if (arranged) {
      columns = { left: arranged.sections.filter((s) => s.column === 'left').map(blockOfLayout), right: arranged.sections.filter((s) => s.column === 'right').map(blockOfLayout) };
    } else {
      const view = boardFromDashboard(generateDashboard(snapshot, { grouping: this.choices.grouping, locale }), 'preview');
      columns = { left: view.left.map(blockOfBoard), right: view.right.map(blockOfBoard) };
    }
    if (this.phone) return { left: [...columns.left, ...columns.right].slice(0, MAX_BLOCKS), right: [] };
    return { left: columns.left.slice(0, MAX_BLOCKS), right: columns.right.slice(0, MAX_BLOCKS) };
  }

  private modeName(mode: ModePreference): string {
    return this.t(mode === 'sun' ? 'theme.mode.sun' : `theme.mode.${mode}`);
  }

  private renderBoard() {
    const { t } = this;
    const file = this.file;
    const label = t('onboarding.preview', { style: t(`theme.style.${file.id}` as MessageKey), colour: this.colourName(), mode: t(`theme.mode.${this.shownMode}`) });
    return html`<mh-mini-board .file=${file} seed=${this.choices.seed} mode=${this.shownMode} density=${this.phone ? 'phone' : this.choices.density}
      .columns=${this.columns()} label=${label} ?building=${this.step === 'build' && !this.built}></mh-mini-board>`;
  }

  private renderStage() {
    if (this.step === 'welcome') return html`<div class="art" aria-hidden="true"><mh-icon name="check" filled></mh-icon></div>`;
    if (this.step === 'practice') {
      return html`<mh-practice-tiles .practice=${this.practice} density=${this.phone ? 'phone' : 'comfortable'} .file=${this.file} seed=${this.choices.seed} mode=${this.shownMode}
        @practice-ask=${() => { this.asked = true; }} @practice-hint=${() => { this.hinted = true; }} @practice-open=${() => { this.opened = true; }}></mh-practice-tiles>`;
    }
    return this.renderBoard();
  }

  // ----- the steps -----

  private heading(key: MessageKey, lead: MessageKey | null) {
    return html`<h1 tabindex="-1" aria-describedby="where">${this.t(key)}</h1>${lead ? html`<p class="lead">${this.t(lead)}</p>` : nothing}`;
  }

  private renderLook() {
    const { t } = this;
    const options: LookOption[] = BUILT_IN.map((file) => ({ id: file.id, label: t(`theme.style.${file.id}` as MessageKey), note: t(`onboarding.look.${file.id}` as MessageKey), file, seed: this.choices.seed, mode: this.shownMode }));
    return html`${this.heading('onboarding.look.title', 'onboarding.look.text')}
      <mh-look-picker .options=${options} value=${this.choices.theme} label=${t('theme.style')}
        @change=${(e: CustomEvent<{ value: string }>) => { e.stopPropagation(); this.change({ choices: { theme: e.detail.value } }); }}></mh-look-picker>
      <p class="label">${t('theme.seed')}</p>
      <mh-swatch-group .t=${t} label=${t('theme.seed')} .presets=${this.presets} .value=${this.choices.seed}
        @change=${(e: CustomEvent<{ seed: string }>) => { e.stopPropagation(); this.change({ choices: { seed: e.detail.seed } }); }}></mh-swatch-group>`;
  }

  private renderLight() {
    const { t } = this;
    const modes = (['auto', 'sun', 'light', 'dark'] as const).map((id) => ({ id, label: this.modeName(id) }));
    return html`${this.heading('onboarding.light.title', this.phone ? 'onboarding.light.textPhone' : 'onboarding.light.text')}
      <mh-radio-list .options=${modes} value=${this.choices.mode} label=${t('theme.mode')}
        @change=${(e: CustomEvent<{ value: ModePreference }>) => { e.stopPropagation(); this.change({ choices: { mode: e.detail.value } }); }}></mh-radio-list>
      ${this.choices.mode === 'sun' && this.sunDark === null ? html`<mh-note icon="info">${t('theme.mode.sunUnknown')}</mh-note>` : nothing}
      ${this.phone ? nothing : html`<p class="label">${t('theme.density')}</p>
        <mh-choice-group data-density label=${t('theme.density')} value=${this.choices.density} .options=${[
          { id: 'comfortable', label: t('theme.density.comfortable'), icon: 'view_agenda' }, { id: 'compact', label: t('theme.density.compact'), icon: 'density_small' },
        ]} @change=${(e: CustomEvent<{ value: 'comfortable' | 'compact' }>) => { e.stopPropagation(); this.change({ choices: { density: e.detail.value } }); }}></mh-choice-group>`}`;
  }

  private renderLayout() {
    const { t } = this;
    const rooms = this.snapshot ? firstOptions(this.snapshot, 'zone', t.locale).flatMap((option) => (option.icon && isLibraryIcon(option.icon) ? [option.icon as IconName] : [])) : [];
    const options = [
      { id: 'type', label: t('onboarding.layout.type'), note: t('onboarding.layout.typeText'), icons: ['lightbulb', 'thermostat', 'blinds'] as IconName[] },
      { id: 'zone', label: t('onboarding.layout.zone'), note: t('onboarding.layout.zoneText'), icons: [...new Set([...rooms, 'weekend', 'bed', 'countertops'] as IconName[])].slice(0, 3) },
    ];
    return html`${this.heading('onboarding.layout.title', 'onboarding.layout.text')}
      <mh-layout-picker .options=${options} value=${this.choices.grouping} label=${t('onboarding.layout.title')}
        @change=${(e: CustomEvent<{ value: 'type' | 'zone' }>) => { e.stopPropagation(); if (e.detail.value !== this.choices.grouping) this.change({ choices: { grouping: e.detail.value, first: [] } }); }}></mh-layout-picker>
      <div class="row"><span>${t('settings.roomsSwitch')}<small>${t('settings.roomsHelp')}</small></span>
        <mh-switch label=${t('settings.roomsSwitch')} ?checked=${this.choices.rooms}
          @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.change({ choices: { rooms: e.detail.checked } }); }}></mh-switch></div>`;
  }

  private optionName(option: FirstOption): string {
    // named after what the hero shows, so it is not mistaken for the widget of energy
    if (option.kind === 'energy') return option.hero && option.hero !== 'own' ? this.t(`hero.${option.hero}`) : this.t('onboarding.first.energy');
    if (option.name) return option.name;
    return option.sectionKind === 'own' ? this.t('rooms.none') : this.t(`section.${option.sectionKind}` as MessageKey);
  }

  private optionIcon(option: FirstOption): IconName {
    if (option.kind === 'energy') return HERO_ICONS[option.hero ?? 'own'] ?? 'bolt';
    return iconOf(option.icon, sectionIcon(option.sectionKind ?? 'other'));
  }

  private togglePick(id: string): void {
    const { first } = this.choices;
    this.change({ choices: { first: first.includes(id) ? first.filter((other) => other !== id) : [...first, id] } });
  }

  private toggleExtra(extra: Extra, on: boolean): void {
    const extras = on ? [...new Set([...this.choices.extras, extra])] : this.choices.extras.filter((other) => other !== extra);
    this.change({ choices: { extras: (['weather', 'energy'] as const).filter((one) => extras.includes(one)) } });
  }

  private renderFirst() {
    const { t } = this;
    const options = this.snapshot ? firstOptions(this.snapshot, this.choices.grouping, t.locale) : [];
    const extras = (['weather', 'energy'] as const).filter((extra) => this.extras.includes(extra));
    const words: Record<Extra, [MessageKey, MessageKey]> = { weather: ['onboarding.first.weather', 'onboarding.first.weatherHelp'], energy: ['onboarding.first.energyWidget', 'onboarding.first.energyWidgetHelp'] };
    return html`${this.heading('onboarding.first.title', this.choices.grouping === 'zone' ? 'onboarding.first.textRooms' : 'onboarding.first.text')}
      <div class="picks" role="group" aria-label=${t('onboarding.first.group')}>${options.map((option) => {
        const place = this.choices.first.indexOf(option.id) + 1;
        const name = this.optionName(option);
        return html`<button class="pick" data-pick=${option.id} aria-pressed=${place > 0 ? 'true' : 'false'} aria-label=${place > 0 ? t('onboarding.first.place', { name, n: place }) : name}
          @click=${() => this.togglePick(option.id)}><span class="icon" aria-hidden="true"><mh-icon name=${this.optionIcon(option)}></mh-icon></span><span class="name">${name}</span>
          ${place > 0 ? html`<span class="badge" aria-hidden="true">${place}</span>` : nothing}</button>`;
      })}</div>
      ${this.choices.first.length === 0 ? html`<p class="lead">${t('onboarding.first.none')}</p>` : nothing}
      ${extras.length === 0 ? nothing : html`<p class="label">${t('onboarding.first.extras')}</p><div class="extras">${extras.map((extra) => html`<div class="row">
        <span>${t(words[extra][0])}<small>${t(words[extra][1])}</small></span>
        <mh-switch label=${t(words[extra][0])} ?checked=${this.choices.extras.includes(extra)}
          @change=${(e: CustomEvent<{ checked: boolean }>) => { e.stopPropagation(); this.toggleExtra(extra, e.detail.checked); }}></mh-switch></div>`)}</div>`}`;
  }

  /** The name of the chosen colour: of a preset, or an own one. */
  private colourName(): string {
    const preset = this.presets.find((one) => one.seed.toLowerCase() === this.choices.seed.toLowerCase());
    return preset ? this.t(`theme.seed.${preset.id}` as MessageKey) : this.t('onboarding.summary.ownColour');
  }

  /** What was chosen, in short: the style and colour, light or dark, the grouping, what goes on top and what comes with it. */
  private renderSummary() {
    const { t, choices } = this;
    const colour = this.colourName();
    const options = this.snapshot ? firstOptions(this.snapshot, choices.grouping, t.locale) : [];
    const first = choices.first.flatMap((id) => options.filter((option) => option.id === id)).map((option) => this.optionName(option));
    const extras = choices.extras.filter((extra) => this.extras.includes(extra)).map((extra) => t(extra === 'weather' ? 'onboarding.first.weather' : 'onboarding.first.energyWidget'));
    const list = (names: string[]) => new Intl.ListFormat(t.locale, { type: 'conjunction' }).format(names);
    const lines: [IconName, string][] = [
      ['palette', `${t(`theme.style.${this.file.id}` as MessageKey)}, ${colour}`],
      [this.shownMode === 'dark' ? 'dark_mode' : 'light_mode', this.modeName(choices.mode)],
      [choices.grouping === 'zone' ? 'meeting_room' : 'category', t(choices.grouping === 'zone' ? 'onboarding.layout.zone' : 'onboarding.layout.type')],
      ...(first.length > 0 ? [['star', t('onboarding.summary.first', { names: list(first) })] as [IconName, string]] : []),
      ...(extras.length > 0 ? [['widgets', t('onboarding.summary.extras', { names: list(extras) })] as [IconName, string]] : []),
    ];
    return html`<ul class="summary" aria-label=${t('onboarding.summary.label')}>${lines.map(([icon, text]) => html`<li><mh-icon name=${icon}></mh-icon><span>${text}</span></li>`)}</ul>`;
  }

  private renderBuild() {
    if (!this.built) return html`${this.heading('onboarding.build.title', null)}`;
    return html`${this.heading('onboarding.build.done', 'onboarding.build.text')}${this.renderSummary()}`;
  }

  private exerciseWords(exercise: Exercise): string {
    const { t } = this;
    if (exercise === 'tap') return t('onboarding.practice.tap');
    if (exercise === 'dim') return t(this.phone ? 'onboarding.practice.dimPhone' : this.touch ? 'onboarding.practice.dimTouch' : 'onboarding.practice.dimPointer');
    return t(this.touch ? 'onboarding.practice.lock' : 'onboarding.practice.lockPointer');
  }

  private renderPractice() {
    const { t } = this;
    const all = this.done.tap && this.done.dim && this.done.lock;
    return html`${this.heading('onboarding.practice.title', 'onboarding.practice.text')}
      <ol class="exercises">${(['tap', 'dim', 'lock'] as const).map((exercise, index) => {
        const done = this.done[exercise];
        const words = this.exerciseWords(exercise);
        return html`<li class="exercise" ?data-done=${done}>
          <span class="check" aria-hidden="true">${done ? html`<mh-icon name="check"></mh-icon>` : html`<span class="number">${index + 1}</span>`}</span><span class="say">${words}</span>
          <span class="unseen">${t(done ? 'onboarding.practice.done' : 'onboarding.practice.todo')}</span></li>`;
      })}</ol>
      ${this.asked && !this.done.lock ? html`<mh-note icon="lock" role="status">${t('onboarding.practice.lockWhy')}</mh-note>` : nothing}
      ${this.hinted && !this.done.dim ? html`<mh-note icon="touch_app" role="status">${t(this.phone ? 'onboarding.practice.dimPhone' : 'onboarding.practice.dimTouch')}</mh-note>` : nothing}
      ${this.opened ? html`<mh-note icon="open_in_new" role="status">${t('onboarding.practice.open')}</mh-note>` : nothing}
      ${all ? html`<mh-note icon="check_circle" tone="ok" role="status">${t('onboarding.practice.allDone')}</mh-note>` : nothing}`;
  }

  private renderContent() {
    switch (this.step) {
      case 'welcome': return this.heading('onboarding.welcome.title', 'onboarding.welcome.text');
      case 'look': return this.renderLook();
      case 'light': return this.renderLight();
      case 'layout': return this.renderLayout();
      case 'first': return this.renderFirst();
      case 'build': return this.renderBuild();
      case 'practice': return this.renderPractice();
    }
  }

  private renderActions() {
    const { t } = this;
    if (this.step === 'welcome') return html`<mh-button ?busy=${!this.ready} @click=${() => { if (this.ready) this.go(1); }}>${t('onboarding.welcome.start')}</mh-button>`;
    if (this.step === 'build') {
      if (!this.built) return nothing;
      return html`<mh-button variant="text" @click=${() => this.emit('onboarding-finish')}>${t('onboarding.practice.finish')}</mh-button>
        <mh-button @click=${() => this.go(1)}>${t('onboarding.build.practice')}</mh-button>`;
    }
    if (this.step === 'practice') return html`<mh-button @click=${() => this.emit('onboarding-finish')}>${t('onboarding.practice.finish')}</mh-button>`;
    return html`<mh-button variant="text" @click=${() => this.go(-1)}>${t('onboarding.back')}</mh-button><span class="spacer"></span>
      <mh-button @click=${() => this.go(1)}>${t('onboarding.next')}</mh-button>`;
  }

  override render() {
    const { t } = this;
    const at = this.steps.indexOf(this.step);
    return html`<div class="card" role="region" aria-label=${t('onboarding.label')}>
      <div class="stage"><div class="drift" aria-hidden="true"></div>${this.renderStage()}</div>
      <div class="panel">
        <div class="top">
          <ol class="dots" aria-hidden="true">${this.steps.map((step, index) => html`<li data-step=${step} class=${index < at ? 'past' : ''} aria-current=${index === at ? 'step' : nothing}></li>`)}</ol>
          <mh-button variant="text" small @click=${() => this.emit('onboarding-skip')}>${t('onboarding.skip')}</mh-button>
        </div>
        ${keyed(this.step, html`<div class="content">${this.renderContent()}</div>`)}
        <div class="actions">${this.renderActions()}</div>
      </div>
      <p class="unseen" id="where">${t('onboarding.step', { n: at + 1, count: this.steps.length })}</p>
      <p class="unseen" aria-live="polite">${this.step === 'practice' ? this.said : ''}</p>
    </div>`;
  }
}

if (!customElements.get('mh-onboarding')) customElements.define('mh-onboarding', MhOnboarding);

declare global {
  interface HTMLElementTagNameMap { 'mh-onboarding': MhOnboarding; 'mh-layout-picker': MhLayoutPicker }
}
