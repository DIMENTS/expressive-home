import { LitElement, css, html, nothing, svg, type PropertyValues } from 'lit';
import type { HistoryPeriod, HistorySeries } from '../../homey/client';
import type { Translate } from '../../i18n';
import { areaPath, linePath } from '../../charts/path';
import { reduce } from '../../charts/reduce';
import { momentText, seriesSentence } from '../../charts/say';
import { scaleFor, type Scale } from '../../charts/scale';
import { timesFor, type Tick } from '../../charts/times';
import { HELD_BUZZ_MS, observeHoldDim } from './hold-dim';
import { sharedStyles } from './shared-styles';

type Point = HistorySeries['points'][number];

/** The drawing is made in this box and stretched to the element; lines keep their width. */
const BOX = { width: 1000, height: 100 };
/** Without knowing its width, a chart draws as many points as this many pixels can hold. */
const FALLBACK_WIDTH = 600;
/** After lifting a finger the tip stays this long. */
export const TIP_STAYS_MS = 3000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** How far Page Up and Page Down go, per period. */
const PAGE: Record<HistoryPeriod, number> = { today: HOUR_MS, last24Hours: HOUR_MS, last7Days: DAY_MS, last31Days: 7 * DAY_MS, year: 30 * DAY_MS };

let made = 0;

/**
 * A chart of the history of one value: a line (and an area under it), a few times underneath and a dot for now.
 * In a window or the hero it can be read: with a mouse by pointing, with a finger by a tap or by holding and swiping,
 * and with keys as a slider over time; it is a sentence for screen readers. On a tile it is only a soft area.
 * Without a series it is nothing at all.
 */
export class MhChart extends LitElement {
  static override properties = {
    series: { attribute: false }, second: { attribute: false }, kind: { attribute: false }, format: { attribute: false }, t: { attribute: false },
    period: { type: String }, zone: { type: String }, name: { type: String }, now: { type: Number }, nowValue: { attribute: false },
    area: { type: Boolean }, loading: { type: Boolean }, readable: { type: Boolean }, times: { type: Boolean },
    variant: { type: String, reflect: true }, empty: { type: Boolean, reflect: true },
    reading: { state: true },
  };

  declare series: HistorySeries | null;
  /** A second line, such as the use beside the sun in the hero; read along with the first. */
  declare second: HistorySeries | null;
  declare kind: { baseId: string; units: string | null };
  declare format: (value: number) => string;
  declare t: Translate;
  declare period: HistoryPeriod;
  /** The time zone of the hub; the device's without it. */
  declare zone: string | undefined;
  declare name: string;
  /** The moment of now: the right edge. */
  declare now: number;
  /** The live value of now: the last point is this one, not the last one of the history. */
  declare nowValue: number | null;
  /** An area under the line. */
  declare area: boolean;
  declare loading: boolean;
  /** False while editing: nothing to read then. */
  declare readable: boolean;
  /** The times under it. */
  declare times: boolean;
  declare variant: 'window' | 'hero' | 'tile';
  declare empty: boolean;
  /** The point that is read now, by its index; null when nothing is read. */
  declare reading: number | null;

  private readonly sentenceId = `chart-${made += 1}`;
  private width = FALLBACK_WIDTH;
  private resize: ResizeObserver | null = null;
  private stopHold: (() => void) | null = null;
  private tipTimer: ReturnType<typeof setTimeout> | null = null;
  /** The points as drawn, with the live value at the end. */
  private drawn: Point[] = [];

  constructor() {
    super();
    this.series = null;
    this.second = null;
    this.kind = { baseId: '', units: null };
    this.format = (value) => String(value);
    this.period = 'last24Hours';
    this.zone = undefined;
    this.name = '';
    this.now = Date.now();
    this.nowValue = null;
    this.area = true;
    this.loading = false;
    this.readable = true;
    this.times = true;
    this.variant = 'window';
    this.empty = true;
    this.reading = null;
  }

  static override styles = [sharedStyles, css`
    /* the ring around the dot is the colour of what lies beneath */
    :host { display: block; position: relative; color: inherit; --_ring: var(--sheet-row-bg); }
    :host([variant='hero']) { --_ring: var(--section-hero-bg); }
    :host([empty]) { display: none; }
    .plot { position: relative; height: var(--chart-window-height); touch-action: pan-y; }
    :host([variant='hero']) .plot { height: var(--chart-height); }
    :host([variant='tile']) { pointer-events: none; }
    :host([variant='tile']) .plot { height: 100%; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    path { vector-effect: non-scaling-stroke; fill: none; }
    .line { stroke: var(--chart-line); stroke-width: var(--chart-line-width); stroke-linejoin: round; stroke-linecap: round; }
    .line.second { stroke: var(--chart-line-2); }
    .area { fill: var(--chart-area); stroke: none; }
    .base { stroke: var(--chart-baseline); stroke-width: var(--chart-cursor-width); }
    :host([variant='hero']) .line { stroke: var(--hero-chart-line); }
    :host([variant='hero']) .line.second { stroke: var(--hero-chart-line-2); }
    :host([variant='hero']) .area { fill: var(--hero-chart-area); }
    :host([variant='tile']) .area { fill: var(--chart-tile-area); }
    .now, .mark {
      position: absolute; left: var(--_x); top: var(--_y); width: var(--chart-now-size); height: var(--chart-now-size);
      transform: translate(-50%, -50%); border-radius: var(--shape-full); background: var(--chart-line);
      box-shadow: 0 0 0 var(--chart-now-ring) var(--_ring);
    }
    :host([variant='hero']) .now, :host([variant='hero']) .mark { background: var(--hero-chart-line); }
    .cursor { position: absolute; top: 0; bottom: 0; left: var(--_x); width: var(--chart-cursor-width); transform: translateX(-50%); background: var(--chart-cursor); }
    .tip {
      position: absolute; bottom: 100%; left: var(--_x); transform: translate(-50%, calc(-1 * var(--space-4)));
      padding: var(--space-4) var(--space-12); border-radius: var(--chart-tip-radius); background: var(--chart-tip-bg); color: var(--chart-tip-fg);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums;
    }
    .tip.left { transform: translate(0, calc(-1 * var(--space-4))); }
    .tip.right { transform: translate(-100%, calc(-1 * var(--space-4))); }
    .times { position: relative; height: calc(var(--type-label-s-size) * var(--type-label-s-line)); margin-top: var(--space-8); color: var(--chart-label-fg); font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); font-variant-numeric: tabular-nums; }
    .times span { position: absolute; left: var(--_x); transform: translateX(-50%); white-space: nowrap; }
    .times span:first-child { transform: none; }
    .times span:last-child { transform: translateX(-100%); }
    .reader { position: absolute; inset: 0; border-radius: var(--shape-md); }
    .loading { position: absolute; inset: 0; border-radius: var(--shape-md); background: var(--chart-area); animation: pulse var(--motion-pulse) var(--easing-pulse) infinite; }
    @keyframes pulse { 50% { opacity: var(--skeleton-pulse-opacity); } }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver === 'function') {
      this.resize = new ResizeObserver((entries) => {
        const width = Math.round(entries[0]?.contentRect.width ?? 0);
        if (width > 0 && width !== this.width) { this.width = width; this.requestUpdate(); }
      });
      this.resize.observe(this);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resize?.disconnect();
    this.resize = null;
    this.stopHold?.();
    this.stopHold = null;
    if (this.tipTimer !== null) clearTimeout(this.tipTimer);
  }

  /** The points as drawn: up to now from the history, then the live value. */
  private pointsOf(series: HistorySeries, live: number | null): Point[] {
    const before = series.points.filter((point) => point.at < this.now);
    return live === null ? before : [...before, { at: this.now, value: live }];
  }

  private canRead(): boolean {
    return this.variant !== 'tile' && this.readable && this.drawn.length > 0;
  }

  override willUpdate(changed: PropertyValues<this>): void {
    this.empty = this.series === null && !this.loading;
    if (changed.has('series') || changed.has('nowValue') || changed.has('now')) {
      this.drawn = this.series ? this.pointsOf(this.series, this.nowValue) : [];
      if (this.reading !== null && this.reading >= this.drawn.length) this.reading = null;
    }
    if (changed.has('readable') && !this.readable) this.reading = null;
  }

  override updated(changed: PropertyValues<this>): void {
    const reader = this.shadowRoot?.querySelector<HTMLElement>('.plot');
    if (reader && this.canRead() && !this.stopHold) {
      this.stopHold = observeHoldDim(reader, {
        enabled: () => this.canRead(),
        accepts: (event) => event.pointerType !== 'mouse',
        missed: () => {},
        canDim: () => true,
        start: (x) => { navigator.vibrate?.(HELD_BUZZ_MS); this.readX(x); },
        move: (x) => this.readX(x),
        end: () => this.letGo(),
        open: () => {},
      }, 'x');
    } else if ((!reader || !this.canRead()) && this.stopHold) {
      this.stopHold();
      this.stopHold = null;
    }
    if (changed.has('reading')) this.dispatchEvent(new CustomEvent('chart-read', { detail: { reading: this.reading !== null }, bubbles: true, composed: true }));
    // the places of the marks and the times, through the CSSOM
    for (const element of this.shadowRoot?.querySelectorAll<HTMLElement>('[data-x]') ?? []) {
      element.style.setProperty('--_x', `${element.dataset['x']}%`);
      if (element.dataset['y'] !== undefined) element.style.setProperty('--_y', `${element.dataset['y']}%`);
    }
  }

  /** Where a moment is, as a part of the width; and a value as a part of the height from the top. */
  private xOf(at: number): number {
    const series = this.series!;
    const span = Math.max(this.now, series.end) - series.start;
    return span > 0 ? Math.min(1, Math.max(0, (at - series.start) / span)) : 0;
  }

  private yOf(value: number, scale: Scale): number {
    const part = (Math.min(Math.max(value, scale.min), scale.max) - scale.min) / (scale.max - scale.min || 1);
    return 1 - part;
  }

  /** Reads the point under a place in the window. */
  private readX(clientX: number): void {
    if (!this.canRead()) return;
    const plot = this.shadowRoot?.querySelector<HTMLElement>('.plot');
    if (!plot) return;
    const box = plot.getBoundingClientRect();
    const part = box.width > 0 ? (clientX - box.left) / box.width : 1;
    const series = this.series!;
    const at = series.start + Math.min(1, Math.max(0, part)) * (Math.max(this.now, series.end) - series.start);
    this.readAt(at);
  }

  private readAt(at: number): void {
    let best = 0;
    this.drawn.forEach((point, i) => { if (Math.abs(point.at - at) < Math.abs(this.drawn[best]!.at - at)) best = i; });
    this.stopTipTimer();
    this.reading = best;
  }

  private stopTipTimer(): void {
    if (this.tipTimer !== null) clearTimeout(this.tipTimer);
    this.tipTimer = null;
  }

  /** A finger let go: the tip stays a moment. */
  private letGo(): void {
    this.stopTipTimer();
    this.tipTimer = setTimeout(() => { this.reading = null; this.tipTimer = null; }, TIP_STAYS_MS);
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.canRead()) return;
    const last = this.drawn.length - 1;
    const current = this.reading ?? last;
    let next: number | null = current;
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowDown': next = Math.max(0, (this.reading ?? last + 1) - 1); break;
      case 'ArrowRight': case 'ArrowUp': next = this.reading === null ? last : Math.min(last, current + 1); break;
      case 'PageUp': this.readAt(this.drawn[current]!.at + PAGE[this.period]); event.preventDefault(); return;
      case 'PageDown': this.readAt(this.drawn[current]!.at - PAGE[this.period]); event.preventDefault(); return;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      case 'Escape':
        // only what it reads stops; otherwise Escape is for the window around it
        if (this.reading === null) return;
        next = null;
        event.stopPropagation();
        break;
      default: return;
    }
    event.preventDefault();
    this.stopTipTimer();
    this.reading = next;
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.readX(event.clientX);
  }

  private onPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && this.tipTimer === null) this.reading = null;
  }

  /** A tap reads the nearest point; holding and swiping is done by the hold observer. */
  private onClick(event: MouseEvent): void {
    if (!this.canRead() || this.variant === 'hero') return;
    this.readX(event.clientX);
    this.letGo();
  }

  /** "14:20, 21,3 °C" for screen readers, "14:20 · 21,3 °C" in the tip. */
  private said(point: Point, joiner: string): string {
    const when = momentText(this.period, point.at, this.zone, this.t);
    return `${when}${joiner}${point.value === null ? this.t('chart.noMeasurement') : this.format(point.value)}`;
  }

  private sentence(): string {
    const values = this.drawn.filter((point) => point.value !== null) as { at: number; value: number }[];
    if (values.length === 0) return '';
    const low = values.reduce((a, b) => (b.value < a.value ? b : a));
    const high = values.reduce((a, b) => (b.value > a.value ? b : a));
    const moment = (at: number): string => momentText(this.period, at, this.zone, this.t);
    return seriesSentence({ name: this.name, period: this.period, now: this.format(values.at(-1)!.value), low: this.format(low.value), lowAt: moment(low.at), high: this.format(high.value), highAt: moment(high.at) }, this.t);
  }

  override render() {
    if (this.series === null) {
      return this.loading ? html`<div class="plot"><div class="loading"></div></div>${this.times && this.variant !== 'tile' ? html`<div class="times"></div>` : nothing}` : nothing;
    }
    const series = this.series;
    const all = [...this.drawn, ...(this.second?.points ?? [])].flatMap((point) => (point.value === null ? [] : [point.value]));
    const scale = scaleFor(this.kind, all);
    const end = Math.max(this.now, series.end);
    const shaped = (points: Point[]): HistorySeries => ({ ...series, end, points: reduce(points, this.width) });
    const main = shaped(this.drawn);
    const second = this.second ? shaped(this.pointsOf(this.second, null)) : null;
    const tile = this.variant === 'tile';
    const ticks: Tick[] = this.times && !tile ? timesFor(this.period, series.start, end, this.zone, this.t) : [];
    const last = this.drawn.at(-1);
    const read = this.reading === null ? null : this.drawn[this.reading] ?? null;
    const readX = read ? this.xOf(read.at) : 0;
    const canRead = this.canRead();
    const percent = (part: number): string => String(Math.round(part * 10000) / 100);
    return html`
      <div class="plot" @pointermove=${this.onPointerMove} @pointerleave=${this.onPointerLeave} @click=${this.onClick}>
        <svg part="chart" viewBox="0 0 ${BOX.width} ${BOX.height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          ${this.area || tile ? svg`<path class="area" part="chart-area" d=${areaPath(main, scale, BOX)}></path>` : nothing}
          ${scale.fromZero && !tile ? svg`<path class="base" d="M0 ${BOX.height}H${BOX.width}"></path>` : nothing}
          ${second ? svg`<path class="line second" part="chart-line" d=${linePath(second, scale, BOX)}></path>` : nothing}
          ${tile ? nothing : svg`<path class="line" part="chart-line" d=${linePath(main, scale, BOX)}></path>`}
        </svg>
        ${!tile && last && last.value !== null && read === null ? html`<span class="now" data-x=${percent(this.xOf(last.at))} data-y=${percent(this.yOf(last.value, scale))}></span>` : nothing}
        ${read ? html`
          <span class="cursor" data-x=${percent(readX)}></span>
          ${read.value === null ? nothing : html`<span class="mark" data-x=${percent(readX)} data-y=${percent(this.yOf(read.value, scale))}></span>`}
          <span class="tip ${readX < 0.15 ? 'left' : readX > 0.85 ? 'right' : ''}" data-x=${percent(readX)} aria-hidden="true">${this.said(read, ' · ')}</span>` : nothing}
        ${canRead ? html`<div class="reader" role="slider" tabindex="0" aria-label=${this.name} aria-describedby=${this.sentenceId}
          aria-valuemin="0" aria-valuemax=${this.drawn.length - 1} aria-valuenow=${this.reading ?? this.drawn.length - 1}
          aria-valuetext=${this.said(read ?? this.drawn.at(-1)!, ', ')} @keydown=${this.onKey} @blur=${() => { if (this.tipTimer === null) this.reading = null; }}></div>` : nothing}
      </div>
      ${ticks.length > 0 ? html`<div class="times" aria-hidden="true">${ticks.map((tick) => html`<span data-x=${percent(this.xOf(tick.at))}>${tick.label}</span>`)}</div>` : nothing}
      ${tile ? nothing : html`<span class="unseen" id=${this.sentenceId}>${this.sentence()}</span>`}
    `;
  }
}

customElements.define('mh-chart', MhChart);

declare global {
  interface HTMLElementTagNameMap { 'mh-chart': MhChart }
}
