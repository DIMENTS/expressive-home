import { css, html, nothing, svg, type TemplateResult } from 'lit';
import type { MessageKey, Translate } from '../../i18n/index';
import type { ReadState } from '../../widgets/live-reads';
import { batteryNet, energyEmpty, energySentence, formatKwh, formatSigned, topDevices, type EnergyPeriod, type EnergyReport, type EnergySlot } from '../../widgets/energy';
import { BARS_VIEW, barsOf, peakOf } from '../../charts/bars';
import '../parts/icon';

export interface EnergyFaceOptions {
  period: EnergyPeriod;
  /** As it is shown: on a phone no tile is wide. */
  wide: boolean;
  /** The second row with the largest devices. */
  devices: boolean;
  compact: boolean;
  /** The name of a device the dashboard knows. */
  nameOf(id: string): string | undefined;
}

export const energyStyles = css`
  .energy { gap: var(--space-2); min-width: 0; }
  .energy .now { display: flex; align-items: baseline; gap: var(--space-4); }
  .energy .now mh-icon { --icon-size: var(--widget-energy-icon-size); color: var(--widget-energy-icon); align-self: center; }
  .energy .kwh { font-size: var(--type-value-size); line-height: var(--type-value-line); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; }
  .energy .unit, .energy .used, .energy .extra, .energy .none { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); color: var(--_state); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .energy .top { display: flex; align-items: center; gap: var(--space-16); min-width: 0; }
  .energy .main { display: grid; gap: var(--space-2); flex: none; min-width: 0; }
  .energy svg { flex: 1; min-width: 0; height: var(--widget-energy-chart-height); display: block; }
  .energy .sun { fill: var(--widget-energy-sun); }
  .energy .use { fill: var(--widget-energy-use); }
  .energy .axis { fill: var(--widget-energy-axis); }
  .energy .devices { list-style: none; margin: var(--tile-pad) 0 0; padding: var(--space-8) 0 0; display: grid; gap: var(--space-2);
    border-top: var(--widget-weather-rule-width) solid var(--widget-weather-rule); }
  .energy .devices li { display: grid; grid-template-columns: minmax(0, var(--widget-energy-name-width)) 1fr auto; gap: var(--space-10); align-items: center;
    font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); }
  .energy .devices .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .energy .devices .track { height: var(--widget-energy-device-bar-height); border-radius: var(--shape-full); overflow: hidden; }
  .energy .devices .track svg { display: block; width: 100%; height: 100%; }
  .energy .devices .track .use { fill: var(--widget-energy-device-bar); }
  .energy .devices .num { color: var(--_state); font-variant-numeric: tabular-nums; }
  .energy.line { flex-direction: row; align-items: center; justify-content: flex-start; gap: var(--space-8); }
  .energy.line .kwh { font-size: var(--type-title-size); line-height: var(--type-title-line); }
`;

const when = (t: Translate, slot: EnergySlot, period: EnergyPeriod): string => {
  if (slot.time === null) return slot.key;
  return period === 'day' ? new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit' }).format(slot.time)
    : new Intl.DateTimeFormat(t.locale, period === 'week' ? { weekday: 'long' } : { weekday: 'long', day: 'numeric' }).format(slot.time);
};

/** The peaks of the bars in words, for a screen reader. */
function chartSentence(report: EnergyReport, period: EnergyPeriod, t: Translate): string {
  const { use, sun } = peakOf(report.slots);
  const at = period === 'day' ? 'At' : 'On';
  const parts = [
    use ? t(`energy.peakUse${at}` as MessageKey, { when: when(t, report.slots[use.index]!, period) }) : '',
    sun ? t(`energy.peakSun${at}` as MessageKey, { when: when(t, report.slots[sun.index]!, period) }) : '',
  ];
  return parts.join('').replace(/^, /, '');
}

/** What else there is beside use: sun, battery, the grid in and out; only what the hub knows. */
function more(report: EnergyReport, t: Translate): string {
  const { totals } = report;
  const battery = batteryNet(totals);
  return [
    totals.generated === null ? null : t('energy.sun', { n: formatKwh(totals.generated, t) }),
    battery === null ? null : t('energy.battery', { n: formatSigned(battery, t) }),
    totals.imported === null ? null : t('energy.imported', { n: formatKwh(totals.imported, t) }),
    totals.exported === null ? null : t('energy.exported', { n: formatKwh(totals.exported, t) }),
  ].filter((part): part is string => part !== null).join(' · ');
}

function chart(report: EnergyReport): TemplateResult {
  const { bars, axis } = barsOf(report.slots);
  return html`<svg viewBox="0 0 ${BARS_VIEW.width} ${BARS_VIEW.height}" preserveAspectRatio="none" aria-hidden="true">
    ${bars.map((bar) => svg`${bar.up ? svg`<rect class="sun" x=${bar.x} y=${bar.up.y} width=${bar.width} height=${bar.up.height}></rect>` : nothing}${bar.down ? svg`<rect class="use" x=${bar.x} y=${bar.down.y} width=${bar.width} height=${bar.down.height}></rect>` : nothing}`)}
    <rect class="axis" x="0" y=${Math.max(0, axis - 0.5)} width=${BARS_VIEW.width} height="1"></rect></svg>`;
}

/** Energy on a tile: the use of the period; wide also the bars; with devices a second row. */
export function energyFace(state: ReadState<EnergyReport> | null, t: Translate, options: EnergyFaceOptions): TemplateResult {
  const report = state?.value ?? null;
  if (!report || energyEmpty(report)) {
    const loading = !state || (state.at === null && state.error === null);
    const why = loading ? 'loading' : state.error === 'no-right' && !report ? 'noRight' : state.error === 'none' ? 'none' : state.error === 'failed' && !report ? 'failed' : 'empty';
    // on the tile the reason in short, on one line: the tile keeps its height
    return html`<div class="face energy${options.compact ? ' line' : ''}" role="img" aria-label=${t(`energy.${why}` as MessageKey)}>
      <span class="now" aria-hidden="true"><mh-icon name="bolt"></mh-icon><span class="kwh">–</span></span>${loading ? nothing : html`<span class="none" aria-hidden="true">${t(`energy.${why}Short` as MessageKey)}</span>`}</div>`;
  }
  const label = energySentence(report, options.period, t);
  // narrow, only the period fits under the number; wide, the whole word
  const used = t(options.wide ? `energy.used.${options.period}` as MessageKey : `energy.period.${options.period}` as MessageKey);
  const extra = more(report, t);
  if (options.compact) {
    return html`<div class="face energy line" role="img" aria-label=${label}><mh-icon name="bolt" aria-hidden="true"></mh-icon>
      <span class="kwh" aria-hidden="true">${formatKwh(report.totals.consumed, t)}</span>${options.wide
        ? html`<span class="used" aria-hidden="true">${t('energy.unit')} ${used}${extra ? ` · ${extra}` : ''}</span>`
        : html`<span class="unit" aria-hidden="true">${t('energy.unit')}</span>`}</div>`;
  }
  const main = html`<div class="main" aria-hidden="true"><span class="now"><mh-icon name="bolt"></mh-icon><span class="kwh">${formatKwh(report.totals.consumed, t)}</span><span class="unit">${t('energy.unit')}</span></span>
    <span class="used">${used}</span>${extra ? html`<span class="extra">${extra}</span>` : nothing}</div>`;
  if (!options.wide) return html`<div class="face energy" role="group" aria-label=${label}>${main}</div>`;
  const said = chartSentence(report, options.period, t);
  const top = options.devices ? topDevices(report, options.nameOf) : null;
  const rows = top ? [...top.rows, ...(top.other !== null && top.other > 0 ? [{ id: '', name: t('energy.other'), consumed: top.other }] : [])] : [];
  const largest = Math.max(0, ...rows.map((row) => row.consumed));
  return html`<div class="face energy" role="group" aria-label=${label}>
    <div class="top">${main}${report.slots.length > 0 ? chart(report) : nothing}</div>${said ? html`<span class="unseen chart-say">${said}</span>` : nothing}
    ${rows.length > 0 ? html`<ul class="devices" aria-label=${t('energy.devicesLabel')}>${rows.map((row) => html`<li>
      <span class="name">${row.name}</span><span class="track" aria-hidden="true"><svg viewBox="0 0 100 1" preserveAspectRatio="none"><rect class="use" x="0" y="0" height="1" width=${largest > 0 ? (row.consumed / largest) * 100 : 0}></rect></svg></span><span class="num">${formatKwh(row.consumed, t)} ${t('energy.unit')}</span></li>`)}</ul>` : nothing}
  </div>`;
}
