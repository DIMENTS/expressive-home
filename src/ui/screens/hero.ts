import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { heroDeviceIds } from '../../dashboard/hero';
import { HERO_SECTION_ID, type HeroSpec } from '../../dashboard/types';
import { rustigExpressive } from '../../theme/rustig-expressive';
import type { Mode } from '../../theme/types';
import { RUSTIG_STYLE, applySectionTheme } from '../apply-theme';
import type { Style } from '../../theme/styles';
import { joinValue } from '../../i18n/format';
import type { UiContext } from '../app/context';
import { HERO_STACK_MAX_PX, HERO_STATS_ROW_PX, HERO_LABEL_ROW_PX, HERO_LABELS_ROW_PX, HERO_WORDS_ROW_PX, PHONE_MAX_PX } from '../breakpoints';
import { hasLongWord, heroView, isWords } from '../model/hero-view';
import { wavePath } from '../parts/banner';
import { sharedStyles } from '../parts/shared-styles';
import { themePixels } from '../theme-pixels';
import '../parts/icon';
import type { HistorySource } from '../../homey/client';
import type { HeroChart } from '../../layout/types';
import { heroChartsOf } from '../../charts/hero-charts';
import { layoutGroup, placeChanged, type SectionAction, type SectionPlace } from './edit-menus';
import { chosenSeed, colourGroups } from './section-menu';
import './section-menu';
import type { MhSectionMenu } from './section-menu';

// The geometry of the wavy progress line, in SVG units, which are pixels here; the sizes come from the theme.
const WAVE_LENGTH = themePixels('hero-wave-length');
const WAVE_AMPLITUDE = themePixels('hero-wave-amplitude');
const WAVE_GAP = themePixels('hero-wave-gap');
const WAVE_HEIGHT = themePixels('hero-wave-height');

/**
 * The hero: the one large number with its unit and line, for a battery the wavy progress line,
 * and up to four stats. The number and each stat with its own device open that device. The hero listens
 * to every device it reads from, also the ones that keep their own tile. While editing a tap on it
 * opens its settings, and a hero with nothing to show says so.
 */
export class MhHero extends LitElement {
  static override properties = {
    hero: { attribute: false },
    ctx: { attribute: false },
    stale: { type: Boolean, reflect: true },
    width: { state: true },
    seed: { attribute: false },
    mode: { type: String },
    look: { attribute: false },
    baseSeed: { attribute: false },
    menuOpen: { type: Boolean, reflect: true, attribute: 'menu-open' },
    sectionId: { type: String },
    editing: { type: Boolean, reflect: true },
    place: { attribute: false, hasChanged: placeChanged },
    chart: { attribute: false },
    sources: { state: true },
  };

  /** Null: nothing to show (drawn only while editing). */
  declare hero: HeroSpec | null;
  declare ctx: UiContext;
  declare stale: boolean;
  declare width: number;
  /** The id its colour and choice are kept under; every dashboard has its own hero. */
  declare sectionId: string;
  declare editing: boolean;
  /** Where the hero stands, for its menu while editing. */
  declare place: SectionPlace;
  /** The hero's own colour, saved under its section id, or null to follow the dashboard. */
  declare seed: string | null;
  declare mode: Mode;
  /** The style of the page, which a hero with its own colour keeps. */
  declare look: Style;
  /** The dashboard's colour, for the dot of "Zoals het dashboard". */
  declare baseSeed: string;
  /** The chart chosen for this hero; null for none. */
  declare chart: HeroChart | null;
  /** The logs with history of this hub, once known. */
  declare sources: HistorySource[];
  /** While the menu is open the hero lies above what follows it. */
  declare menuOpen: boolean;
  private listening: (() => void)[] = [];
  private resize: ResizeObserver | null = null;
  private watched: Element | null = null;

  constructor() {
    super();
    this.stale = false;
    this.width = 300;
    this.seed = null;
    this.mode = 'light';
    this.look = RUSTIG_STYLE;
    this.baseSeed = rustigExpressive.color.defaultSeed;
    this.menuOpen = false;
    this.sectionId = HERO_SECTION_ID;
    this.editing = false;
    this.place = { column: 'left', first: true, last: true };
    this.chart = null;
    this.sources = [];
  }

  static override styles = [sharedStyles, css`
    :host { display: block; min-width: 0; }
    :host([menu-open]) { position: relative; z-index: var(--layer-menu); }
    .grip {
      all: unset; box-sizing: border-box; position: relative; cursor: grab; touch-action: none; flex: none; display: grid; place-items: center;
      width: var(--icon-button-size); height: var(--icon-button-size); margin: calc(var(--space-8) * -1) 0 calc(var(--space-8) * -1) calc(var(--space-8) * -1);
      border-radius: var(--shape-full); color: inherit; --icon-size: var(--icon-m);
    }
    .grip:hover { background: color-mix(in srgb, currentColor var(--state-hover), transparent); }
    .grip:focus-visible { outline: var(--focus-width) solid currentColor; outline-offset: var(--focus-offset); }
    h2 { min-width: 0; margin: 0; font: inherit; }
    .title { overflow-wrap: anywhere; }
    :host([editing]) .grid { cursor: pointer; }
    .none { margin: 0; }
    .head > mh-section-menu { margin-left: auto; --section-menu-trigger-fg: var(--section-hero-fg); }
    section {
      container-type: inline-size; background: var(--section-hero-bg); color: var(--section-hero-fg);
      border-radius: var(--section-radius); padding: var(--section-pad); transition: opacity var(--motion-effects);
    }
    :host([stale]) section { opacity: var(--state-stale); }
    .head {
      display: flex; align-items: center; gap: var(--space-8); margin: 0 0 var(--section-title-gap);
      font-size: var(--hero-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); --icon-size: var(--hero-title-size);
    }
    .grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--space-24); align-items: end; }
    @container (width < ${HERO_STACK_MAX_PX}px) { .grid { grid-template-columns: minmax(0, 1fr); } }
    .main { all: unset; box-sizing: border-box; display: block; min-width: 0; cursor: pointer; border-radius: var(--shape-lg); }
    .main:focus-visible { outline: var(--focus-width) solid currentColor; outline-offset: var(--focus-offset); }
    .number { margin: 0; font-size: var(--hero-number-size); line-height: var(--type-hero-line); font-weight: var(--weight-strong); letter-spacing: var(--tracking-display); }
    /* a word instead of a number: smaller, over two lines, and never out of its block */
    .number.long { font-size: calc(var(--hero-number-size) / 3); line-height: var(--type-value-line); overflow-wrap: anywhere; hyphens: auto; }
    .unit { font-size: calc(var(--hero-number-size) * .42); font-weight: var(--weight-medium); letter-spacing: 0; margin-left: var(--space-4); }
    .line { margin: var(--space-10) 0 var(--space-16); font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); }
    svg { display: block; width: 100%; height: var(--hero-wave-height); overflow: visible; }
    path { fill: none; stroke-linecap: round; stroke-width: var(--hero-wave-stroke); }
    .active { stroke: var(--hero-wave-fg); animation: shift var(--motion-wave) linear infinite; }
    .rest { stroke: var(--hero-wave-track); }
    @keyframes shift { to { transform: translateX(var(--hero-wave-length)); } }
    .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tile-gap); }
    .stat {
      all: unset; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: var(--space-2); min-width: 0; padding: var(--hero-stat-pad);
      border-radius: var(--hero-stat-radius); background: var(--hero-stat-bg); --icon-size: var(--icon-m);
      transition: background-color var(--motion-effects), border-radius var(--motion-spatial), transform var(--motion-spatial);
    }
    button.stat { cursor: pointer; }
    button.stat:hover { background: color-mix(in srgb, currentColor var(--hero-stat-hover), transparent); }
    button.stat:active { transform: scale(var(--press-scale)); border-radius: var(--shape-md); }
    button.stat:focus-visible { outline: var(--focus-width) solid currentColor; outline-offset: var(--focus-offset); }
    .stat mh-icon { margin-bottom: var(--space-6); }
    .stat b { font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }
    .stat.long b { font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); }
    .stat span { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); }
    .stat b, .stat span { overflow-wrap: anywhere; hyphens: auto; }
    /* a phone: the number small, the stats in one row as long as they fit */
    @media (width < ${PHONE_MAX_PX}px) {
      .head { margin-bottom: 0; }
      .grid { gap: var(--space-12); }
      .line { margin: 0 0 var(--space-8); }
      .stats { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(min-content, 1fr); }
      /* the longest word there is room for; more of them stand two by two */
      .stat.long { min-width: var(--hero-stat-word); }
      .stats.words { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stat { gap: 0; align-content: start; --icon-size: var(--icon-s); }
      .stat mh-icon { margin-bottom: var(--space-4); }
      .stat b { font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); }
      .stat.long b { font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); }
      .stat span { font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); overflow: hidden; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
      @container (width < ${HERO_STATS_ROW_PX}px) { .stats { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @container (width < ${HERO_LABEL_ROW_PX}px) { .stats.label { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @container (width < ${HERO_LABELS_ROW_PX}px) { .stats.labels { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @container (width < ${HERO_WORDS_ROW_PX}px) { .stats.word { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const stop of this.listening) stop();
    this.listening = [];
    this.resize?.disconnect();
    this.resize = null;
  }

  private listen(): void {
    for (const stop of this.listening) stop();
    this.listening = [];
    if (!this.ctx || !this.hero || !this.isConnected) return;
    const redraw = () => this.requestUpdate();
    this.listening = [this.ctx.store.subscribeStructure(redraw), ...heroDeviceIds(this.hero).map((id) => this.ctx.store.subscribeDevice(id, redraw))];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('hero') || changed.has('ctx')) {
      this.listen();
      this.ctx?.history?.sources().then((sources) => { this.sources = sources; }, () => {});
    }
    // the chart is only loaded when one is chosen
    if (changed.has('chart') && this.chart !== null && !customElements.get('mh-hero-chart')) {
      void import('./hero-chart').then(() => this.requestUpdate(), () => {});
    }
    if (this.ctx) this.stale = this.ctx.status().route === null;
  }

  private onSelect(event: CustomEvent<{ group: string; id: string }>): void {
    event.stopPropagation();
    if (event.detail.group === 'chart') {
      const chart = event.detail.id === 'none' ? null : event.detail.id as HeroChart;
      this.dispatchEvent(new CustomEvent('hero-chart', { detail: { chart }, bubbles: true, composed: true }));
      return;
    }
    if (event.detail.group === 'layout') {
      this.dispatchEvent(new CustomEvent('section-action', { detail: { sectionId: this.sectionId, action: event.detail.id as SectionAction }, bubbles: true, composed: true }));
      return;
    }
    const seed = chosenSeed(event.detail);
    if (seed === undefined) return;
    this.dispatchEvent(new CustomEvent('section-seed', { detail: { sectionId: this.sectionId, seed }, bubbles: true, composed: true }));
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('seed') || changed.has('mode') || changed.has('look')) applySectionTheme(this, this.seed, this.mode, this.look);
    // The number's area is always there and the wave fills its width: a wave that goes and comes back
    // (another hero, a battery that appears) still gets the right width.
    const main = this.shadowRoot?.querySelector('.main');
    if (!main || typeof ResizeObserver === 'undefined') return;
    // a hero that has nothing to show draws another area, so the one that is watched can be gone
    if (this.resize && this.watched === main) return;
    this.resize?.disconnect();
    this.resize = new ResizeObserver(([entry]) => {
      const width = Math.round(entry?.contentRect.width ?? 0);
      if (width > 0 && width !== this.width) this.width = width;
    });
    this.resize.observe(main);
    this.watched = main;
  }

  private wave(progress: number) {
    const width = this.width;
    const end = (width * progress) / 100;
    const mid = WAVE_HEIGHT / 2;
    return html`<svg viewBox="0 0 ${width} ${WAVE_HEIGHT}" aria-hidden="true">
      <defs><clipPath id="clip"><rect x="0" y="-10" width=${end} height=${WAVE_HEIGHT * 2}></rect></clipPath></defs>
      <g clip-path="url(#clip)"><path class="active" d=${wavePath(end, WAVE_LENGTH, WAVE_AMPLITUDE, mid)}></path></g>
      <path class="rest" d="M${Math.min(width, end + WAVE_GAP)} ${mid} L${width} ${mid}"></path>
    </svg>`;
  }

  private openSettings(): void {
    this.dispatchEvent(new CustomEvent('open-hero', { detail: { sectionId: this.sectionId }, bubbles: true, composed: true }));
  }

  /** The focus goes to the menu button, where a moved hero is moved further. */
  focusMenu(): void {
    this.shadowRoot?.querySelector<MhSectionMenu>('mh-section-menu')?.focus();
  }

  private openMenu(): void {
    this.shadowRoot?.querySelector<MhSectionMenu>('mh-section-menu')?.toggle(true);
  }

  private renderTitle(title: string, icon: string) {
    const { ctx } = this;
    const colours = colourGroups(title, this.seed, this.baseSeed, ctx.t);
    const charts = heroChartsOf(this.hero, this.sources);
    const chartGroup = charts.length === 0 ? [] : [{ kind: 'items' as const, id: 'chart', title: ctx.t('chart.hero.group'), items: [
      { id: 'none', label: ctx.t('chart.hero.none'), checked: this.chart === null || !charts.includes(this.chart) },
      ...charts.map((chart) => ({ id: chart, label: ctx.t(chart === 'battery' ? 'chart.hero.battery' : chart === 'solar' ? 'chart.hero.solar' : 'chart.hero.solarUse'), checked: this.chart === chart })),
    ] }];
    const groups = this.editing ? [layoutGroup('hero', this.place, ctx.t), ...chartGroup, ...colours] : [...chartGroup, ...colours];
    return html`<div class="head">${this.editing ? html`<button class="grip hit" data-grip aria-label=${ctx.t('edit.grip', { name: title })} @click=${() => this.openMenu()}><mh-icon name="drag_indicator"></mh-icon></button>` : nothing}<mh-icon name=${icon} filled></mh-icon><h2 id="hero-title"><span class="title">${title}</span></h2>${ctx.status().canArrange === false ? nothing : html`<mh-section-menu
        label=${title} .t=${ctx.t} .groups=${groups}
        @select=${(e: CustomEvent<{ group: string; id: string }>) => this.onSelect(e)}
        @toggle=${(e: CustomEvent<{ open: boolean }>) => { e.stopPropagation(); this.menuOpen = e.detail.open; }}></mh-section-menu>`}</div>`;
  }

  override render() {
    const { ctx, editing } = this;
    if (!this.hero) {
      const title = ctx.t('hero.title');
      return html`<section aria-labelledby="hero-title">${this.renderTitle(title, 'battery_5_bar')}
        <button class="main" aria-label=${ctx.t('edit.hero.open', { name: title })} @click=${() => this.openSettings()}><p class="none">${ctx.t('hero.empty')}</p></button>
      </section>`;
    }
    const view = heroView(this.hero, (id) => ctx.store.getDevice(id), ctx.t);
    const words = view.stats.filter((stat) => isWords(stat.value)).length;
    const labels = view.stats.some((stat) => hasLongWord(stat.label)) ? 'labels' : view.stats.some((stat) => hasLongWord(stat.label, 9)) ? 'label' : '';
    const open = (deviceId: string) => { if (!editing) ctx.actions.openDevice(deviceId); };
    return html`<section aria-labelledby="hero-title">
      ${this.renderTitle(view.title, view.icon)}
      <div class="grid" @click=${() => { if (editing) this.openSettings(); }}>
        <button class="main" aria-label=${editing ? ctx.t('edit.hero.open', { name: view.title }) : ctx.t('hero.more', { name: view.title, value: joinValue(view.number) })} @click=${() => open(view.primaryDeviceId)}>
          <p class="number ${isWords(view.number.text) ? 'long' : ''}">${view.number.text}${view.number.unit ? html`<span class="unit">${view.number.unit}</span>` : nothing}</p>
          ${view.line ? html`<p class="line">${view.line}</p>` : nothing}
          ${view.progress !== null ? this.wave(view.progress) : nothing}
        </button>
        ${view.stats.length ? html`<div class="stats ${words > 1 ? 'words' : words === 1 ? 'word' : ''} ${labels}">${view.stats.map((stat) => {
          const inner = html`<mh-icon name=${stat.icon}></mh-icon><b>${stat.value}</b><span>${stat.label}</span>`;
          const deviceId = stat.deviceId;
          const kind = `stat ${isWords(stat.value) ? 'long' : ''}`;
          return deviceId && !editing ? html`<button class=${kind} @click=${() => open(deviceId)}>${inner}</button>` : html`<div class=${kind}>${inner}</div>`;
        })}</div>` : nothing}
      </div>
      ${this.chart && heroChartsOf(this.hero, this.sources).includes(this.chart) ? html`<mh-hero-chart .ctx=${ctx} .hero=${this.hero} chart=${this.chart} .sources=${this.sources} ?readable=${!editing}></mh-hero-chart>` : nothing}
    </section>`;
  }
}

if (!customElements.get('mh-hero')) customElements.define('mh-hero', MhHero);

declare global {
  interface HTMLElementTagNameMap { 'mh-hero': MhHero }
}
