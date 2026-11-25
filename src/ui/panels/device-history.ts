import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type { HistoryPeriod, HistorySeries, HistorySource, HistorySwitches } from '../../homey/client';
import type { Device } from '../../homey/types';
import { formatValue, joinValue } from '../../i18n/format';
import { momentText, periodWord } from '../../charts/say';
import type { UiContext } from '../app/context';
import { HISTORY_FRESH_MS } from '../app/history';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/chart';
import '../parts/choice-group';
import '../parts/onoff-strip';

const PERIODS: { id: HistoryPeriod; key: 'chart.day' | 'chart.week' | 'chart.month' | 'chart.year' }[] = [
  { id: 'last24Hours', key: 'chart.day' }, { id: 'last7Days', key: 'chart.week' }, { id: 'last31Days', key: 'chart.month' }, { id: 'year', key: 'chart.year' },
];
/** Periods with an area under the line; a month and a year are a plain line. */
const WITH_AREA: readonly HistoryPeriod[] = ['last24Hours', 'last7Days'];

/**
 * The group Verloop of the device window: the history of one value over a day, a week, a month or a year, and the
 * strips of what can be on or off. It reads when it opens, when the period changes, and every five minutes while the
 * page is seen. A failure takes nothing away.
 */
export class MhDeviceHistory extends LitElement {
  static override properties = {
    ctx: { attribute: false }, device: { attribute: false }, source: { attribute: false }, switchSources: { attribute: false }, readable: { type: Boolean },
    period: { state: true }, series: { state: true }, loading: { state: true }, switches: { state: true },
  };

  declare ctx: UiContext;
  declare device: Device;
  /** The value with numbers whose history is shown; null for none. */
  declare source: HistorySource | null;
  /** The yes/no values with history. */
  declare switchSources: HistorySource[];
  declare readable: boolean;
  declare period: HistoryPeriod;
  declare series: HistorySeries | null;
  declare loading: boolean;
  declare switches: Record<string, HistorySwitches>;

  private asked = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.source = null;
    this.switchSources = [];
    this.readable = true;
    this.period = 'last24Hours';
    this.series = null;
    this.loading = false;
    this.switches = {};
  }

  static override styles = [sharedStyles, css`
    :host { display: grid; gap: var(--space-8); }
    .card { display: grid; gap: var(--space-12); padding: var(--space-16); border-radius: var(--sheet-row-radius); background: var(--sheet-row-bg); }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-8); flex-wrap: wrap; }
    .head b { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); }
    .head span { color: var(--chart-label-fg); font-size: var(--type-label-m-size); font-variant-numeric: tabular-nums; }
    .note { color: var(--chart-label-fg); font-size: var(--type-body-s-size); line-height: var(--type-body-s-line); margin: 0; }
    mh-chart { margin-top: var(--space-24); }
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
    if (changed.has('source') && changed.get('source')?.log !== this.source?.log) {
      this.series = null;
      this.read();
    } else if (changed.has('period')) {
      this.read();
    }
    if (changed.has('switchSources')) this.readSwitches();
  }

  /** Reads the history of the chosen value; what was shown stays until something new is there. */
  private read(): void {
    const { source, period } = this;
    const history = this.ctx?.history;
    if (!source || !history) return;
    const mine = ++this.asked;
    this.loading = this.series === null;
    history.series(source, period).then((series) => {
      if (mine !== this.asked) return;
      this.series = series;
      this.loading = false;
    }, () => {
      if (mine === this.asked) this.loading = false;
    });
  }

  private readSwitches(): void {
    const history = this.ctx?.history;
    if (!history) return;
    for (const source of this.switchSources) {
      history.switches(source).then((found) => {
        if (found) this.switches = { ...this.switches, [source.log]: found };
      }, () => {});
    }
  }

  private format(capabilityId: string): (value: number) => string {
    const cap = this.device.capabilities[capabilityId];
    return (value) => (cap ? joinValue(formatValue({ ...cap, value }, 'full', this.ctx.t)) : String(value));
  }

  private renderNumbers(source: HistorySource) {
    const { t } = this.ctx;
    const cap = this.device.capabilities[source.capabilityId];
    if (!cap) return nothing;
    const format = this.format(source.capabilityId);
    const values = (this.series?.points ?? []).flatMap((point) => (point.value === null ? [] : [point.value]));
    const live = typeof cap.value === 'number' && Number.isFinite(cap.value) ? cap.value : null;
    const all = live === null ? values : [...values, live];
    const range = all.length > 0 ? t('chart.range', { low: format(Math.min(...all)), high: format(Math.max(...all)) }) : '';
    const firstMeasured = this.series?.points.find((point) => point.value !== null)?.at ?? null;
    const late = this.series && firstMeasured !== null && firstMeasured - this.series.start > this.series.step * 2;
    const nothingMeasured = this.series !== null && values.length === 0;
    return html`<div class="card">
      <div class="head"><b>${cap.title} · ${periodWord(this.period, t)}</b><span>${range}</span></div>
      ${nothingMeasured ? html`<p class="note">${t('chart.noneInPeriod')}</p>` : nothing}
      <mh-chart variant="window" .series=${nothingMeasured ? null : this.series} ?loading=${this.loading} .kind=${{ baseId: cap.baseId, units: cap.units }}
        .format=${format} .t=${t} period=${this.period} name=${cap.title} .now=${Date.now()} .nowValue=${live} ?area=${WITH_AREA.includes(this.period)}
        ?readable=${this.readable}></mh-chart>
      ${late ? html`<p class="note">${t('chart.measuredSince', { since: momentText('last31Days', firstMeasured!, undefined, t) })}</p>` : nothing}
      <mh-choice-group label=${t('chart.periods')} .options=${PERIODS.map((p) => ({ id: p.id, label: t(p.key) }))} value=${this.period}
        @change=${(event: CustomEvent<{ value: HistoryPeriod }>) => { event.stopPropagation(); this.period = event.detail.value; }}></mh-choice-group>
    </div>`;
  }

  private renderSwitches(source: HistorySource) {
    const { t } = this.ctx;
    const found = this.switches[source.log];
    const cap = this.device.capabilities[source.capabilityId];
    if (!found || !cap) return nothing;
    return html`<div class="card">
      <div class="head"><b>${this.switchSources.length > 1 ? cap.title : t(cap.baseId === 'alarm_contact' ? 'chart.openClosed' : cap.baseId === 'alarm_motion' ? 'chart.motionTitle' : 'chart.onOff')}</b></div>
      <mh-onoff-strip .switches=${found} .t=${t} .nowOn=${typeof cap.value === 'boolean' ? cap.value : null} .now=${Date.now()}
        name=${cap.title} baseId=${cap.baseId}></mh-onoff-strip>
    </div>`;
  }

  override render() {
    if (!this.ctx || !this.device) return nothing;
    return html`${this.source ? this.renderNumbers(this.source) : nothing}${this.switchSources.map((source) => this.renderSwitches(source))}`;
  }
}

if (!customElements.get('mh-device-history')) customElements.define('mh-device-history', MhDeviceHistory);

declare global {
  interface HTMLElementTagNameMap { 'mh-device-history': MhDeviceHistory }
}
