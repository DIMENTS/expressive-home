import { css, html, nothing, svg, type CSSResultGroup, type PropertyDeclarations, type PropertyValues, type TemplateResult } from 'lit';
import type { WidgetTileSpec } from '../../dashboard/types';
import { clockView, nextTick } from '../../widgets/clock';
import { widgetIcon, widgetName } from '../../widgets/catalog';
import type { WidgetFile } from '../../widgets/widget-file';
import { ownWidgetId } from '../../widgets/widget-ref';
import './own-widget';
import { lampOn } from '../../rooms/rooms';
import { daysUntil, gaugeShare, groupIds } from '../../widgets/more';
import { formatValue } from '../../i18n/format';
import type { ReadState } from '../../widgets/live-reads';
import type { Weather } from '../../widgets/weather';
import type { EnergyPeriod } from '../../widgets/energy';
import { weatherFace, weatherStyles } from './weather-face';
import { energyFace, energyStyles } from './energy-face';
import type { EnergyReport } from '../../widgets/energy';

/** The length of the arc of the gauge, in its own units: half a circle of radius 64. */
const ARC = Math.PI * 64;
/** How much of a row a widget may need beyond its rows before it gets another one. */
const ROW_SLACK = 0.25;
import './app-widget';
import { ICONS, type IconName } from '../icons/icons';
import { deviceTileStyles, TileElement } from './tile-base';
import '../parts/icon';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
/** The period an energy widget shows; today unless another is chosen. */
const periodOf = (spec: WidgetTileSpec): EnergyPeriod => (spec.settings['period'] === 'week' || spec.settings['period'] === 'month' ? spec.settings['period'] : 'day');
/** The widgets that read something of the hub, and the setting that gives them a second row. */
const SECOND_ROW: Record<string, string> = { weather: 'days', energy: 'devices' };

/**
 * A widget on a dashboard: the clock, a note, a link to another dashboard, an own widget or one of another app.
 * It is a tile like the others: same shape, colours and sizes. While editing a tap opens its menu and does nothing else.
 */
export class MhWidgetTile extends TileElement<WidgetTileSpec> {
  static override properties: PropertyDeclarations = { now: { state: true } };

  declare now: Date;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.now = new Date();
  }

  static override styles: CSSResultGroup = [TileElement.styles, deviceTileStyles, weatherStyles, energyStyles, css`
    :host([hidden]) { display: none; }
    .tile { cursor: default; }
    :host([editing]) .tile { cursor: grab; }
    .tile:active { transform: none; border-radius: var(--tile-radius); }
    .face { justify-content: center; gap: var(--space-4); }
    button.face { all: unset; box-sizing: border-box; display: flex; flex-direction: column; flex: 1; min-width: 0; cursor: pointer; }
    button.face:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); border-radius: var(--tile-radius); }

    .time { font-size: var(--widget-clock-size); line-height: var(--type-greeting-line); font-weight: var(--weight-medium); letter-spacing: var(--tracking-display); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .date { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); color: var(--_state); }
    .clock-wide { display: flex; flex-direction: row; align-items: center; gap: var(--space-20); }
    .clock-wide .time { font-size: var(--widget-clock-wide-size); }
    .days { display: grid; gap: var(--space-2); min-width: 0; }
    .weekday { font-size: var(--type-title-size); line-height: var(--type-title-line); font-weight: var(--weight-strong); }

    .note { justify-content: flex-start; gap: var(--space-10); }
    .note .head { flex: 0 0 auto; flex-direction: row; align-items: center; justify-content: flex-start; }
    .note .text { font-size: var(--type-body-l-size); line-height: var(--type-body-l-line); white-space: pre-line; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--widget-note-lines); overflow: hidden; }
    :host([wide]) .note .text { -webkit-line-clamp: var(--widget-note-wide-lines); }
    .tile.accent { --_bg: var(--widget-note-accent-bg); --_fg: var(--widget-note-accent-fg); --_state: var(--widget-note-accent-fg); }
    .tile.accent .icon { background: var(--widget-note-accent-icon-bg); color: var(--widget-note-accent-icon-fg); }

    .link { justify-content: space-between; }
    .link .bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-10); min-width: 0; }
    .arrow { flex: none; width: var(--tile-icon-box); height: var(--tile-icon-box); display: grid; place-items: center; border-radius: var(--shape-full);
      background: var(--widget-link-arrow-bg); color: var(--widget-link-arrow-fg); --icon-size: var(--icon-l); }
    .tile:has(button.face:hover) { background: color-mix(in srgb, var(--_fg) var(--state-hover), var(--_bg)); }
    .own { padding: 0; overflow: hidden; outline: none; }
    .own:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    .gauge { align-items: center; justify-content: center; gap: var(--space-2); }
    .gauge svg { width: 100%; max-width: var(--widget-gauge-width); height: auto; display: block; }
    .gauge path { fill: none; stroke-width: var(--widget-gauge-stroke); stroke-linecap: round; }
    .gauge .track { stroke: var(--widget-gauge-track); }
    .gauge .fill { stroke: var(--widget-gauge-fill); transition: stroke-dashoffset var(--motion-spatial); }
    .gauge .reading { margin-top: calc(-1 * var(--widget-gauge-lift)); font-size: var(--type-value-size); line-height: var(--type-value-line); font-weight: var(--weight-strong); font-variant-numeric: tabular-nums; }
    .gauge .unit { font-size: var(--type-label-m-size); font-weight: var(--weight-medium); margin-left: var(--space-2); }
    .countdown { justify-content: space-between; gap: var(--space-10); }
    .countdown .head { flex: 0 0 auto; flex-direction: row; align-items: center; justify-content: flex-start; }
    .countdown .days { display: flex; align-items: baseline; gap: var(--space-8); flex-wrap: wrap; }
    button.face:disabled { cursor: default; opacity: var(--state-disabled-content); }
    @media (prefers-reduced-motion: reduce) { .gauge .fill { transition: none; } }
    .missing { box-shadow: inset 0 0 0 var(--edit-ring-width) var(--widget-missing-border); }

    /* on a phone and when compact, everything stands under each other, smaller */
    :host([density="compact"]) .note .text, :host([density="phone"]) .note .text { -webkit-line-clamp: 2; }
    :host([density="phone"]) .time { font-size: var(--type-value-size); }
    :host([density="phone"]) .date, :host([density="phone"]) .name { font-size: var(--type-label-m-size); }
    :host([density="phone"]) .gauge .reading { font-size: var(--type-title-size); margin-top: calc(-1 * var(--widget-gauge-lift) / 2); }
  `];

  /** The gauge follows its device, a group its devices. */
  protected deviceIds(): string[] {
    if (!this.spec) return [];
    if (this.spec.widget === 'gauge') return typeof this.spec.settings['device'] === 'string' ? [this.spec.settings['device']] : [];
    return this.spec.widget === 'group' ? groupIds(this.spec.settings['devices']) : [];
  }

  private get choice(): { seconds: boolean; date: boolean } {
    return { seconds: this.spec.settings['seconds'] === true, date: this.spec.settings['date'] !== false };
  }

  /** What the widget shows of the hub (the weather, a period of energy), and how to stop listening to it. */
  protected read: ReadState<unknown> | null = null;
  private watching: { key: string; stop(): void } | null = null;

  /** Listens to what the widget shows of the hub while it is on the page; another period is another source. */
  private watch(): void {
    const key = !this.isConnected || !this.spec || !this.ctx ? null
      : this.spec.widget === 'weather' ? 'weather' : this.spec.widget === 'energy' ? `energy:${periodOf(this.spec)}` : null;
    if (this.watching?.key === key) return;
    this.watching?.stop();
    this.watching = null;
    this.read = null;
    const source = key === null ? undefined : key === 'weather' ? this.ctx.widgets?.weather : this.ctx.widgets?.energy?.(periodOf(this.spec));
    if (!key || !source) return;
    const stop = (source as { listen(listener: (state: ReadState<unknown>) => void): () => void }).listen((state) => { this.read = state; this.requestUpdate(); });
    this.watching = { key, stop };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.watch();
    this.tick();
    this.addEventListener('widget-height', this.onHeight);
  }

  /**
   * A widget that asks for more height than a tile spans as many rows as it needs, so the tiles beside it stand under
   * each other instead of stretching. A little more than a row is still one row; from a quarter on, it is the next.
   */
  private readonly onHeight = (event: Event): void => {
    const px = (event as CustomEvent<{ px: number }>).detail?.px;
    if (typeof px !== 'number' || !Number.isFinite(px)) return;
    const style = getComputedStyle(this);
    const row = parseFloat(style.getPropertyValue('--tile-height'));
    const gap = parseFloat(style.getPropertyValue('--tile-gap')) || 0;
    if (!(row > 0)) return;
    const rows = Math.max(1, Math.ceil((px + gap) / (row + gap) - ROW_SLACK));
    if (rows > 1) this.style.setProperty('grid-row', `span ${rows}`);
    else this.style.removeProperty('grid-row');
    this.rows = rows;
    this.requestUpdate();
  };

  /** How many rows of tiles the widget asked for. */
  private rows = 1;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('widget-height', this.onHeight);
    this.watching?.stop();
    this.watching = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** The clock follows the clock of the device, to the minute (or the second). */
  private tick(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.spec || !['clock', 'countdown'].includes(this.spec.widget) || !this.isConnected) return;
    this.now = new Date();
    // a countdown changes at midnight
    const wait = this.spec.widget === 'clock' ? nextTick(this.now, this.choice.seconds)
      : new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate() + 1).getTime() - this.now.getTime();
    this.timer = setTimeout(() => this.tick(), wait);
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    this.watch();
    // the weather and the energy have a second row when wide and asked for; never when every tile is one line
    const second = this.spec ? SECOND_ROW[this.spec.widget] : undefined;
    if (second !== undefined) {
      const rows = this.spec.size === 'wide' && this.density !== 'compact' && this.spec.settings[second] === true ? 2 : 1;
      if (rows > 1) this.style.setProperty('grid-row', `span ${rows}`);
      else this.style.removeProperty('grid-row');
      this.rows = rows;
    }
    // on a phone a tall widget takes the whole width, as Homey shows widgets there; everything else follows under it
    if (this.spec && this.density === 'phone' && this.rows > 1) this.wide = true;
    if (changed.has('spec')) this.tick();
    if (this.spec && this.ctx && this.spec.widget === 'group') {
      const devices = groupIds(this.spec.settings['devices']).flatMap((id) => this.ctx.store.getDevice(id) ?? []);
      this.state = devices.some(lampOn) ? 'on' : 'neutral';
    }
    if (this.spec && this.ctx) {
      const gone = this.spec.widget === 'board' ? this.target() === undefined : ownWidgetId(this.spec.widget) !== null && this.ownWidget() === undefined;
      this.hidden = !this.editing && gone;
    }
  }

  /** The dashboard a link leads to, when it is there. */
  private target() {
    const id = text(this.spec.settings['board']);
    return this.ctx.widgets?.boards().find((board) => board.id === id);
  }

  private get name(): string {
    return widgetName(this.spec, this.ctx.t);
  }

  private editFace(content: TemplateResult, extraClass = ''): TemplateResult {
    return html`<div class="tile ${extraClass}"><button class="face" aria-label=${this.ctx.t('edit.tile.open', { name: this.name })} @click=${() => this.openMenu()}>${content}</button>
      <span class="grip hit" data-grip><mh-icon name="drag_indicator"></mh-icon></span></div>`;
  }

  private renderClock(): TemplateResult {
    const { t } = this.ctx;
    const view = clockView(this.now, t.locale, this.choice);
    // what is shown, not what is stored: on a phone no tile is wide
    const wide = this.wide;
    const body = wide
      ? html`<div class="face clock clock-wide" role="group" aria-label=${t('widget.clockLabel', { name: this.name, time: view.label })}>
          <span class="time" aria-hidden="true">${view.time}</span>${view.weekday ? html`<span class="days" aria-hidden="true"><span class="weekday">${view.weekday}</span><span class="date">${view.long}</span></span>` : nothing}</div>`
      : html`<div class="face clock" role="group" aria-label=${t('widget.clockLabel', { name: this.name, time: view.label })}>
          <span class="time" aria-hidden="true">${view.time}</span>${view.short ? html`<span class="date" aria-hidden="true">${view.short}</span>` : nothing}</div>`;
    return this.editing ? this.editFace(body) : html`<div class="tile">${body}</div>`;
  }

  private renderNote(): TemplateResult {
    const accent = this.spec.settings['accent'] === true;
    const body = html`<div class="face note" role="group" aria-label=${this.name}>
      <div class="head"><span class="icon"><mh-icon name=${widgetIcon(this.spec)} ?filled=${accent}></mh-icon></span><span class="name">${this.name}</span></div>
      ${text(this.spec.settings['text']) ? html`<div class="text">${text(this.spec.settings['text'])}</div>` : nothing}
    </div>`;
    return this.editing ? this.editFace(body, accent ? 'accent' : '') : html`<div class="tile ${accent ? 'accent' : ''}">${body}</div>`;
  }

  private renderLink(): TemplateResult {
    const { t } = this.ctx;
    const board = this.target();
    const name = this.spec.label ?? board?.name ?? t('widget.boardGone');
    const icon: IconName = this.spec.icon && Object.hasOwn(ICONS, this.spec.icon) ? this.spec.icon as IconName
      : board && Object.hasOwn(ICONS, board.icon) ? board.icon as IconName : 'dashboard';
    const content = html`<span class="icon"><mh-icon name=${icon}></mh-icon></span>
      <span class="bottom"><span class="text"><span class="name">${name}</span><span class="state">${t('widget.boardKind')}</span></span><span class="arrow"><mh-icon name="arrow_forward"></mh-icon></span></span>`;
    if (this.editing) return this.editFace(html`<span class="link face">${content}</span>`, board ? '' : 'missing');
    return html`<div class="tile"><button class="face link" aria-label=${t('widget.openBoard', { name })} @click=${() => { if (board) this.ctx.widgets?.openBoard(board.id); }}>${content}</button></div>`;
  }

  /** The file of the own widget this tile shows, when the house has it. */
  private ownWidget(): WidgetFile | undefined {
    const id = ownWidgetId(this.spec.widget);
    return id === null ? undefined : this.ctx.widgets?.own?.().find((widget) => widget.id === id);
  }

  private renderOwn(): TemplateResult {
    if (this.spec.widget.startsWith('app:')) {
      return html`<div class="tile own" tabindex="-1"><mh-app-widget .spec=${this.spec} .ctx=${this.ctx} ?editing=${this.editing} @cover-tap=${() => this.openMenu()}></mh-app-widget>
        ${this.editing ? html`<span class="grip hit" data-grip><mh-icon name="drag_indicator"></mh-icon></span>` : nothing}</div>`;
    }
    const widget = this.ownWidget();
    const { t } = this.ctx;
    if (!widget) {
      // only while editing, so it can be taken away
      return this.editFace(html`<span class="face"><span class="head"><span class="icon"><mh-icon name="widgets"></mh-icon></span>
        <span class="text"><span class="name">${widgetName(this.spec, t)}</span><span class="state">${t('widget.missing')}</span></span></span></span>`, 'missing');
    }
    return html`<div class="tile own" tabindex="-1"><mh-own-widget .spec=${this.spec} .ctx=${this.ctx} .widget=${widget} ?editing=${this.editing}
      @cover-tap=${() => this.openMenu()} @widget-leave=${() => this.renderRoot.querySelector<HTMLElement>('.own')?.focus()}></mh-own-widget>
      ${this.editing ? html`<span class="grip hit" data-grip><mh-icon name="drag_indicator"></mh-icon></span>` : nothing}</div>`;
  }

  private renderGauge(): TemplateResult {
    const { t } = this.ctx;
    const { settings } = this.spec;
    const device = typeof settings['device'] === 'string' ? this.ctx.store.getDevice(settings['device']) : undefined;
    const cap = device && typeof settings['capability'] === 'string' && Object.hasOwn(device.capabilities, settings['capability']) ? device.capabilities[settings['capability']] : undefined;
    const value = typeof cap?.value === 'number' ? cap.value : null;
    const min = typeof settings['min'] === 'number' ? settings['min'] : 0;
    const max = typeof settings['max'] === 'number' ? settings['max'] : 100;
    const share = gaugeShare(value, min, max) ?? 0;
    const shown = formatValue(cap, 'tile', t);
    const number = value === null ? '–' : shown.text;
    const name = this.spec.label ?? device?.name ?? t('widget.gauge.none');
    const label = value === null ? name : `${name}, ${number}${shown.unit ? ` ${shown.unit}` : ''}`;
    const body = html`<div class="face gauge" role="img" aria-label=${label}>
      <svg viewBox="0 0 150 84" aria-hidden="true">${svg`<path class="track" d="M11 76 A64 64 0 0 1 139 76"/><path class="fill" d="M11 76 A64 64 0 0 1 139 76" stroke-dasharray=${ARC} stroke-dashoffset=${ARC * (1 - share)}/>`}</svg>
      <span class="reading" aria-hidden="true"><span class="number">${number}</span>${value !== null && shown.unit ? html`<span class="unit">${shown.unit}</span>` : nothing}</span>
      <span class="date" aria-hidden="true">${name}</span></div>`;
    return this.editing ? this.editFace(body) : html`<div class="tile">${body}</div>`;
  }

  private renderCountdown(): TemplateResult {
    const { t } = this.ctx;
    const days = daysUntil(this.spec.settings['date'], this.now);
    const big = days === null ? '–' : days === 0 ? t('widget.countdown.today') : String(Math.abs(days));
    const line = days === null ? t('widget.countdown.none') : days === 0 ? '' : days === 1 ? t('widget.countdown.day') : days === -1 ? t('widget.countdown.agoOne')
      : days > 0 ? t('widget.countdown.days', { n: days }) : t('widget.countdown.ago', { n: -days });
    const body = html`<div class="face countdown" role="group" aria-label=${[this.name, days === 0 ? big : line].filter(Boolean).join(', ')}>
      <div class="head"><span class="icon"><mh-icon name="hourglass_top"></mh-icon></span><span class="name">${this.name}</span></div>
      <span class="days" aria-hidden="true"><span class="time">${days === null || days === 0 || Math.abs(days) <= 1 ? big : String(Math.abs(days))}</span>${line ? html`<span class="date">${line}</span>` : nothing}</span></div>`;
    return this.editing ? this.editFace(body) : html`<div class="tile">${body}</div>`;
  }

  private renderWeather(): TemplateResult {
    const body = weatherFace(this.read as ReadState<Weather> | null, this.ctx.t, { wide: this.wide, days: this.rows > 1, compact: this.density === 'compact', now: Date.now() });
    return this.editing ? this.editFace(body) : html`<div class="tile">${body}</div>`;
  }

  private renderEnergy(): TemplateResult {
    const body = energyFace(this.read as ReadState<EnergyReport> | null, this.ctx.t, {
      period: periodOf(this.spec), wide: this.wide, devices: this.rows > 1, compact: this.density === 'compact',
      nameOf: (id) => this.ctx.store.getDevice(id)?.name,
    });
    return this.editing ? this.editFace(body) : html`<div class="tile">${body}</div>`;
  }

  private renderGroup(): TemplateResult {
    const { t } = this.ctx;
    const ids = groupIds(this.spec.settings['devices']);
    const devices = ids.flatMap((id) => this.ctx.store.getDevice(id) ?? []);
    const on = devices.filter(lampOn).length;
    const anyOn = on > 0;
    const state = devices.length === 0 ? t('widget.group.none') : t('widget.group.count', { on, all: devices.length });
    const content = html`<div class="head"><span class="icon"><mh-icon name="light_group" ?filled=${anyOn}></mh-icon></span>
      <span class="text"><span class="name">${this.name}</span><span class="state">${state}</span></span></div>`;
    if (this.editing) return this.editFace(html`<span class="face">${content}</span>`);
    const disabled = devices.length === 0 || !this.ctx.status().canControl;
    return html`<div class="tile"><button class="face" ?disabled=${disabled} aria-pressed=${anyOn ? 'true' : 'false'}
      aria-label=${t('widget.group.label', { name: this.name, state, to: (anyOn ? t('tile.off') : t('tile.on')).toLowerCase() })}
      @click=${() => this.ctx.actions.lamps(devices.map((device) => device.id), !anyOn)}>${content}</button></div>`;
  }

  override render() {
    switch (this.spec.widget) {
      case 'clock': return this.renderClock();
      case 'gauge': return this.renderGauge();
      case 'countdown': return this.renderCountdown();
      case 'group': return this.renderGroup();
      case 'note': return this.renderNote();
      case 'board': return this.renderLink();
      case 'weather': return this.renderWeather();
      case 'energy': return this.renderEnergy();
      default: return this.renderOwn();
    }
  }
}

if (!customElements.get('mh-widget-tile')) customElements.define('mh-widget-tile', MhWidgetTile);
