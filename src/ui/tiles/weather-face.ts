import { css, html, nothing, type TemplateResult } from 'lit';
import type { Translate } from '../../i18n/index';
import type { ReadState } from '../../widgets/live-reads';
import { daysAfter, formatDegrees, hoursAfter, weatherAge, weatherIconName, weatherSentence, weatherState, type Weather, type WeatherPoint } from '../../widgets/weather';
import '../parts/icon';

/** How many hours and days a wide widget shows. */
export const WEATHER_HOURS = 4;
export const WEATHER_DAYS = 5;

export interface WeatherFaceOptions {
  /** As it is shown: on a phone no tile is wide. */
  wide: boolean;
  /** The second row with the coming days. */
  days: boolean;
  /** One line, as every tile is when compact. */
  compact: boolean;
  now: number;
}

export const weatherStyles = css`
  .weather { gap: var(--space-2); min-width: 0; }
  .weather .now { display: flex; align-items: center; gap: var(--space-8); --icon-size: var(--widget-weather-icon-size); }
  .weather mh-icon { color: var(--widget-weather-icon); }
  .weather .temp { font-size: var(--type-value-size); line-height: var(--type-value-line); font-weight: var(--weight-medium); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .weather .sky, .weather .range, .weather .when-old, .weather .none { font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); color: var(--_state); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .weather .top { display: flex; align-items: center; gap: var(--space-16); min-width: 0; }
  .weather .main { display: grid; gap: var(--space-2); flex: none; min-width: 0; }
  .weather ul { list-style: none; margin: 0; padding: 0; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--space-4); flex: 1; min-width: 0;
    --icon-size: var(--widget-weather-small-icon-size); }
  .weather li { display: grid; justify-items: center; gap: var(--space-2); font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--_state); }
  .weather li .deg, .weather li .hi { color: var(--_fg); font-weight: var(--weight-strong); }
  .weather .days { margin-top: var(--tile-pad); padding-top: var(--space-8); border-top: var(--widget-weather-rule-width) solid var(--widget-weather-rule); }
  .weather.line { flex-direction: row; align-items: center; justify-content: flex-start; gap: var(--space-8); --icon-size: var(--widget-weather-small-icon-size); }
  .weather.line .temp { font-size: var(--type-title-size); line-height: var(--type-title-line); }
`;

const clock = (t: Translate, time: number): string => new Intl.DateTimeFormat(t.locale, { hour: '2-digit', minute: '2-digit' }).format(time);
const weekday = (t: Translate, time: number, width: 'short' | 'long'): string => new Intl.DateTimeFormat(t.locale, { weekday: width }).format(time);
const sky = (point: Pick<WeatherPoint, 'icon' | 'known'>, t: Translate): string => weatherState({ ...point, state: null }, t);
const say = (t: Translate, value: number | null): string => {
  if (value === null) return '–';
  const n = Math.round(value) || 0;
  return t(Math.abs(n) === 1 ? 'weather.degree.one' : 'weather.degree.other', { n });
};

function range(weather: Weather, t: Translate): TemplateResult | typeof nothing {
  if (weather.max === null || weather.min === null) return nothing;
  return html`<span class="range" aria-hidden="true">↑ ${formatDegrees(weather.max, t)} · ↓ ${formatDegrees(weather.min, t)}</span>`;
}

/** The weather on a tile: now; wide also the hours; with days a second row. Read out as one sentence and two lists. */
export function weatherFace(state: ReadState<Weather> | null, t: Translate, options: WeatherFaceOptions): TemplateResult {
  const weather = state?.value ?? null;
  const age = weatherAge(weather, options.now);
  if (!weather || age === 'gone') {
    const loading = (!state || (state.at === null && state.error === null));
    const refused = !loading && state.error === 'no-right' && !weather;
    const text = loading ? t('weather.loading') : refused ? t('weather.noRight') : t('weather.none');
    // on the tile the reason in short, on one line: the tile keeps its height
    const short = refused ? t('weather.noRightShort') : t('weather.noneShort');
    return html`<div class="face weather${options.compact ? ' line' : ''}" role="img" aria-label=${text}>
      <span class="now" aria-hidden="true"><mh-icon name="cloud"></mh-icon><span class="temp">–</span></span>${loading ? nothing : html`<span class="none" aria-hidden="true">${short}</span>`}</div>`;
  }
  const label = weatherSentence(weather, t);
  const icon = html`<mh-icon name=${weatherIconName(weather.icon)}></mh-icon>`;
  const old = age === 'old' && weather.at !== null ? html`<span class="when-old" aria-hidden="true">${t('weather.at', { time: clock(t, weather.at) })}</span>` : nothing;
  if (options.compact) {
    return html`<div class="face weather line" role="img" aria-label=${label}>${icon}<span class="temp" aria-hidden="true">${formatDegrees(weather.temperature, t)}</span>
      <span class="sky" aria-hidden="true">${weatherState(weather, t)}</span>${options.wide ? html`${range(weather, t)}${old}` : nothing}</div>`;
  }
  const main = html`<div class="main"><span class="now" aria-hidden="true">${icon}<span class="temp">${formatDegrees(weather.temperature, t)}</span></span>
    <span class="sky" aria-hidden="true">${weatherState(weather, t)}</span>${old === nothing ? range(weather, t) : old}</div>`;
  if (!options.wide) return html`<div class="face weather" role="group" aria-label=${label}>${main}</div>`;
  const hours = hoursAfter(weather, options.now, WEATHER_HOURS);
  const days = options.days ? daysAfter(weather, options.now, WEATHER_DAYS) : [];
  return html`<div class="face weather" role="group" aria-label=${label}>
    <div class="top">${main}
      ${hours.length > 0 ? html`<ul class="hours" aria-label=${t('weather.hoursLabel')}>${hours.map((point) => html`<li aria-label=${t('weather.hourSay', { when: clock(t, point.time), temp: say(t, point.temperature), sky: sky(point, t).toLocaleLowerCase(t.locale) })}>
        <span class="when" aria-hidden="true">${clock(t, point.time)}</span><mh-icon name=${weatherIconName(point.icon)} aria-hidden="true"></mh-icon><span class="deg" aria-hidden="true">${formatDegrees(point.temperature, t)}</span></li>`)}</ul>` : nothing}
    </div>
    ${days.length > 0 ? html`<ul class="days" aria-label=${t('weather.daysLabel')}>${days.map((point) => html`<li aria-label=${t('weather.daySay', { when: weekday(t, point.time, 'long'), max: say(t, point.max), min: say(t, point.min), sky: sky(point, t).toLocaleLowerCase(t.locale) })}>
      <span class="when" aria-hidden="true">${weekday(t, point.time, 'short')}</span><mh-icon name=${weatherIconName(point.icon)} aria-hidden="true"></mh-icon><span aria-hidden="true"><span class="hi">${formatDegrees(point.max, t)}</span> ${formatDegrees(point.min, t)}</span></li>`)}</ul>` : nothing}
  </div>`;
}
