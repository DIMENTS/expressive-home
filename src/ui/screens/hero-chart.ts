import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type { CapRef, HeroSpec } from '../../dashboard/types';
import { heroRefOf as refOf, heroSourceOf as sourceOf } from '../../charts/hero-charts';
import type { HistoryPeriod, HistorySeries, HistorySource } from '../../homey/client';
import { formatValue, joinValue } from '../../i18n/format';
import type { HeroChart } from '../../layout/types';
import { momentText } from '../../charts/say';
import type { UiContext } from '../app/context';
import { HISTORY_FRESH_MS } from '../app/history';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/chart';
import { CHART_PARTS } from '../part-names';

const HOUR_MS = 3_600_000;
/** With less than this many hours of points per five minutes, the battery shows the hourly points of the week. */
export const BATTERY_FILLED_MS = 12 * HOUR_MS;

/** The span the points of a series really cover. */
const filledSpan = (series: HistorySeries | null): number => {
  const filled = (series?.points ?? []).filter((point) => point.value !== null);
  return filled.length < 2 ? 0 : filled.at(-1)!.at - filled[0]!.at;
};

/**
 * The chart in the hero: the battery of the last 24 hours, the sun of today, or the sun and the use. It is read by
 * holding and swiping or with a mouse; a tap opens the device, as on the hero. The corner says the lowest or the peak.
 */
export class MhHeroChart extends LitElement {
  static override properties = {
    ctx: { attribute: false }, hero: { attribute: false }, chart: { type: String }, sources: { attribute: false }, readable: { type: Boolean },
    main: { state: true }, second: { state: true }, reading: { state: true },
  };

  declare ctx: UiContext;
  declare hero: HeroSpec;
  declare chart: HeroChart;
  declare sources: HistorySource[];
  declare readable: boolean;
  declare main: HistorySeries | null;
  declare second: HistorySeries | null;
  declare reading: boolean;

  private asked = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.sources = [];
    this.readable = true;
    this.main = null;
    this.second = null;
    this.reading = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; margin-top: var(--chart-gap); }
    .top { display: flex; justify-content: flex-end; gap: var(--space-12); min-height: calc(var(--type-label-m-size) * var(--type-label-m-line)); margin-bottom: var(--space-8);
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-variant-numeric: tabular-nums; }
    .key { display: inline-flex; align-items: center; gap: var(--space-6); }
    .key::before { content: ""; width: var(--chart-now-size); height: var(--chart-line-width); border-radius: var(--shape-full); background: var(--hero-chart-line); }
    .key.second::before { background: var(--hero-chart-line-2); }
    /* a tap opens the device, as on the hero; with keys the number of the hero does that, and the chart is a slider */
    .open { display: block; cursor: pointer; border-radius: var(--shape-md); }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => { if (document.visibilityState !== 'hidden') this.read(); }, HISTORY_FRESH_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('chart') || changed.has('sources') || changed.has('hero')) {
      if (changed.has('chart')) { this.main = null; this.second = null; }
      this.read();
    }
  }

  private read(): void {
    const history = this.ctx?.history;
    if (!history || !this.hero) return;
    const mine = ++this.asked;
    const chart = this.chart;
    const battery = sourceOf(this.sources, refOf(this.hero, 'battery'));
    const solar = sourceOf(this.sources, refOf(this.hero, 'solar'));
    const use = sourceOf(this.sources, refOf(this.hero, 'consumption'));
    const done = (main: HistorySeries | null, second: HistorySeries | null = null): void => {
      if (mine !== this.asked) return;
      this.main = main;
      this.second = second;
    };
    if (chart === 'battery' && battery) {
      void history.series(battery, 'last24Hours').then(async (day) => {
        if (filledSpan(day) >= BATTERY_FILLED_MS) return day;
        // too little per five minutes: the hourly points of the week, cut at 24 hours
        const week = await history.series(battery, 'last7Days');
        if (!week) return day;
        const from = Date.now() - 24 * HOUR_MS;
        return { ...week, start: from, points: week.points.filter((point) => point.at >= from) };
      }).then((series) => done(series), () => {});
    } else if (chart === 'solar' && solar) {
      void history.series(solar, 'today').then((series) => done(series), () => {});
    } else if (chart === 'solar-use' && solar && use) {
      void Promise.all([history.series(solar, 'today'), history.series(use, 'today')]).then(([a, b]) => done(a, b), () => {});
    } else {
      done(null);
    }
  }

  private capRef(): CapRef | null {
    return refOf(this.hero, this.chart === 'battery' ? 'battery' : 'solar');
  }

  private format(): (value: number) => string {
    const ref = this.capRef();
    const cap = ref ? this.ctx.store.getDevice(ref.deviceId)?.capabilities[ref.capabilityId] : undefined;
    return (value) => (cap ? joinValue(formatValue({ ...cap, value }, 'tile', this.ctx.t)) : String(value));
  }

  private corner() {
    const { t } = this.ctx;
    if (this.chart === 'solar-use') {
      return html`<span class="key">${t('hero.solar')}</span><span class="key second">${t('hero.consumption')}</span>`;
    }
    const values = (this.main?.points ?? []).filter((point) => point.value !== null) as { at: number; value: number }[];
    if (values.length === 0) return nothing;
    const pick = this.chart === 'battery' ? values.reduce((a, b) => (b.value < a.value ? b : a)) : values.reduce((a, b) => (b.value > a.value ? b : a));
    return html`<span class="corner">${t(this.chart === 'battery' ? 'chart.lowestAt' : 'chart.peakAt', { value: this.format()(pick.value), at: momentText('last24Hours', pick.at, undefined, t) })}</span>`;
  }

  override render() {
    if (!this.main || !this.ctx) return nothing;
    const ref = this.capRef();
    const cap = ref ? this.ctx.store.getDevice(ref.deviceId)?.capabilities[ref.capabilityId] : undefined;
    const live = typeof cap?.value === 'number' && Number.isFinite(cap.value) ? cap.value : null;
    const period: HistoryPeriod = this.chart === 'battery' ? 'last24Hours' : 'today';
    const end = period === 'today' ? new Date(this.main.start).setHours(24, 0, 0, 0) : this.main.end;
    const name = this.chart === 'battery' ? this.ctx.t('hero.battery') : this.ctx.t('hero.solar');
    return html`
      <div class="top">${this.reading ? nothing : this.corner()}</div>
      <div class="open"
        @click=${() => { if (ref && this.readable) this.ctx.actions.openDevice(ref.deviceId); }}>
        <mh-chart exportparts=${CHART_PARTS} variant="hero" .series=${{ ...this.main, end: Math.max(end, this.main.end) }} .second=${this.second} .kind=${{ baseId: cap?.baseId ?? '', units: cap?.units ?? null }}
          .format=${this.format()} .t=${this.ctx.t} period=${period} name=${name} .now=${Date.now()} .nowValue=${live} area ?readable=${this.readable}
          @chart-read=${(event: CustomEvent<{ reading: boolean }>) => { this.reading = event.detail.reading; }}></mh-chart>
      </div>`;
  }
}

if (!customElements.get('mh-hero-chart')) customElements.define('mh-hero-chart', MhHeroChart);

declare global {
  interface HTMLElementTagNameMap { 'mh-hero-chart': MhHeroChart }
}
