import { css, html, nothing, type CSSResultGroup, type PropertyValues } from 'lit';
import type { DeviceTileSpec } from '../../dashboard/types';
import type { HistorySeries } from '../../homey/client';
import { formatValue, joinValue } from '../../i18n/format';
import { HISTORY_FRESH_MS } from '../app/history';
import { heroSourceOf } from '../../charts/hero-charts';
import { DeviceTileElement } from './tile-base';
import { valueStyles, valueTemplate } from './value-styles';

type SensorSpec = Extract<DeviceTileSpec, { kind: 'sensor' }>;

/**
 * The sensor tile: icon, the value large with its unit, the name and, for two tiles of one device, the reading's name.
 * With "Verloop achter de waarde", the last 24 hours lie behind it as a soft area; it reads them only while
 * it can be seen.
 */
export class MhSensorTile extends DeviceTileElement<SensorSpec> {
  static override properties = { ...DeviceTileElement.properties, trend: { state: true } };
  static override styles: CSSResultGroup = [DeviceTileElement.styles, valueStyles, css`
    .trend { position: absolute; left: 0; right: 0; bottom: 0; height: var(--chart-tile-share); overflow: hidden; border-radius: 0 0 var(--tile-radius) var(--tile-radius); }
    .tile:has(.trend) .face { position: relative; }
  `];

  /** The last 24 hours, once read. */
  declare trend: HistorySeries | null;
  /** In view now, as far as the observer says. */
  private visible = false;
  /** Whether the area belonged here at the last update. */
  private wanted = false;
  private watcher: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private asked = 0;

  constructor() {
    super();
    this.trend = null;
  }

  /** Whether the area belongs here: chosen, a tile and not a row (compact), with history to read. */
  private wantsTrend(): boolean {
    return this.spec?.trend === true && this.density !== 'compact' && !!this.ctx?.history;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = setInterval(() => { if (this.visible && document.visibilityState !== 'hidden') this.readTrend(); }, HISTORY_FRESH_MS);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unwatch();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private unwatch(): void {
    this.watcher?.disconnect();
    this.watcher = null;
    this.visible = false;
  }

  override updated(changed: PropertyValues<this>): void {
    super.updated?.(changed);
    const want = this.wantsTrend();
    const was = this.wanted;
    this.wanted = want;
    if (!want) {
      this.unwatch();
      if (this.trend !== null) this.trend = null;
      return;
    }
    if (typeof IntersectionObserver !== 'function') {
      this.visible = true;
      if (!was || changed.has('spec')) this.readTrend();
      return;
    }
    if (!this.watcher) {
      // read when it comes into view, and only then
      this.watcher = new IntersectionObserver((entries) => {
        const before = this.visible;
        this.visible = entries.some((entry) => entry.isIntersecting);
        if (this.visible && !before) this.readTrend();
      });
      this.watcher.observe(this);
      return;
    }
    if (changed.has('spec') && this.visible) this.readTrend();
  }

  private readTrend(): void {
    const history = this.ctx?.history;
    const spec = this.spec;
    if (!history || !this.wantsTrend()) return;
    const mine = ++this.asked;
    history.sources().then((all) => {
      const source = heroSourceOf(all, { deviceId: spec.deviceId, capabilityId: spec.capabilityId });
      return source ? history.series(source, 'last24Hours') : null;
    }).then((series) => {
      if (mine !== this.asked || !series) return;
      // the chart is only loaded once a tile has history to show
      void import('../parts/chart').then(() => { if (mine === this.asked) this.trend = series; }, () => {});
    }, () => {});
  }

  private live(): number | null {
    const value = this.ctx.store.getDevice(this.spec.deviceId)?.capabilities[this.spec.capabilityId]?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private formatter(): (value: number) => string {
    const cap = this.ctx.store.getDevice(this.spec.deviceId)?.capabilities[this.spec.capabilityId];
    return (value) => (cap ? joinValue(formatValue({ ...cap, value }, 'full', this.ctx.t)) : String(value));
  }

  protected override renderBehind() {
    if (!this.trend || !this.wantsTrend()) return nothing;
    const cap = this.ctx.store.getDevice(this.spec.deviceId)?.capabilities[this.spec.capabilityId];
    if (!cap) return nothing;
    return html`<mh-chart class="trend" variant="tile" .series=${this.trend} .kind=${{ baseId: cap.baseId, units: cap.units }} .t=${this.ctx.t}
      period="last24Hours" .now=${Date.now()} .nowValue=${this.live()} .format=${this.formatter()} .readable=${false} .times=${false}></mh-chart>`;
  }

  protected override ariaExtra(): string {
    if (!this.trend || !this.wantsTrend()) return '';
    const values = this.trend.points.flatMap((point) => (point.value === null ? [] : [point.value]));
    const live = this.live();
    if (live !== null) values.push(live);
    if (values.length === 0) return '';
    const format = this.formatter();
    return this.ctx.t('chart.tileSentence', { low: format(Math.min(...values)), high: format(Math.max(...values)) });
  }

  protected override renderHead() {
    const { view } = this;
    return html`<div class="head">
      <span class="icon"><mh-icon name=${view.icon}></mh-icon></span>
      <span class="text">${valueTemplate(view.value)}<span class="name">${view.name}</span>${this.renderState()}</span>
    </div>`;
  }

  protected override renderState() {
    const { view } = this;
    const text = view.stateText || view.subText;
    if (!text && !view.warn) return nothing;
    return html`<span class="state">${view.warn ? html`<mh-icon class="warn" name="battery_alert" filled></mh-icon>` : nothing}<span>${text}</span></span>`;
  }
}

if (!customElements.get('mh-sensor-tile')) customElements.define('mh-sensor-tile', MhSensorTile);
