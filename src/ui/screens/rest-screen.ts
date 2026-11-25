import { LitElement, css, html, nothing, svg, type PropertyValues } from 'lit';
import { heroDeviceIds } from '../../dashboard/hero';
import type { CapRef, HeroSpec } from '../../dashboard/types';
import { dayText, timeText } from '../../i18n/format';
import { alarmKind } from '../../recognition/recognize';
import type { Mode } from '../../theme/types';
import { defaultWall, emptyWallHub, type WallHub, type WallSettings } from '../../wall/settings';
import { RUSTIG_STYLE, applySectionTheme } from '../apply-theme';
import type { Style } from '../../theme/styles';
import type { UiContext } from '../app/context';
import { heroView, isWords } from '../model/hero-view';
import { attention, shiftAt, temperature, type AttentionItem } from '../model/rest-view';
import { sharedStyles } from '../parts/shared-styles';
import '../parts/icon';

/** The wave of the battery, in the units of the rest screen; its line has round ends. */
const WAVE = { height: 44, stroke: 14, length: 96, amplitude: 10, gap: 12, width: 1152 };
const END = WAVE.stroke / 2;

/** The wave from its left end to x, or '' when there is no room for it. */
function wavePath(x: number): string {
  const mid = WAVE.height / 2;
  const y = (at: number): string => (mid + WAVE.amplitude * Math.sin((at / WAVE.length) * Math.PI * 2)).toFixed(2);
  if (x <= END) return '';
  let d = `M${END} ${y(END)}`;
  for (let at = END + 2; at < x; at += 2) d += ` L${at} ${y(at)}`;
  return `${d} L${x} ${y(x)}`;
}

/** The name and what is the matter apart, so that a long name is cut and not the alarm. */
const itemText = (item: AttentionItem) => html`<span class="text">${item.name ? html`<span class="name"><span class="cut">${item.name}</span>${item.dot ? ' ·' : nothing}</span> ` : nothing}<span class="what">${item.what}</span></span>`;

/** The app works these out anew each time; the same again is no change. */
const differs = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/**
 * The rest screen of a wall tablet (wall tablet, 4.1 and 4.4): over everything while nobody touches it. By day the time,
 * two temperatures, what needs attention and the battery; at night only a faint clock, and alarms that matter. It only
 * draws: what wakes it is decided elsewhere. Nothing in it moves by itself.
 */
export class MhRestScreen extends LitElement {
  static override properties = {
    ctx: { attribute: false },
    hero: { attribute: false },
    heroSeed: { attribute: false },
    mode: { type: String },
    look: { attribute: false },
    battery: { attribute: false, hasChanged: differs },
    wall: { attribute: false },
    hub: { attribute: false, hasChanged: differs },
    now: { attribute: false },
    night: { type: Boolean },
    away: { type: Boolean },
    leaving: { type: Boolean, reflect: true },
  };

  declare ctx: UiContext;
  /** The hero of the dashboard this device starts with. */
  declare hero: HeroSpec | null;
  declare heroSeed: string | null;
  declare mode: Mode;
  declare look: Style;
  /** The state of charge of the large battery, to tell that it is almost empty. */
  declare battery: CapRef | null;
  declare wall: WallSettings;
  declare hub: WallHub;
  declare now: Date;
  declare night: boolean;
  /** The hub does not answer. */
  declare away: boolean;
  /** It was touched: it is there until the finger is lifted, but not to be seen. */
  declare leaving: boolean;
  private listening: (() => void)[] = [];
  /** What was told of the battery and the tanks; it stays until it is well past its limit. */
  private told: ReadonlySet<string> = new Set();
  private wide = WAVE.width;
  private resize: ResizeObserver | null = null;
  private watched: Element | null = null;

  constructor() {
    super();
    this.hero = null;
    this.heroSeed = null;
    this.mode = 'light';
    this.look = RUSTIG_STYLE;
    this.battery = null;
    this.wall = defaultWall();
    this.hub = emptyWallHub();
    this.now = new Date();
    this.night = false;
    this.away = false;
    this.leaving = false;
  }

  static override styles = [sharedStyles, css`
    :host { position: fixed; inset: 0; z-index: var(--layer-rest); display: block; touch-action: none; user-select: none; -webkit-user-select: none; --_u: var(--rest-unit); --_clock: var(--rest-clock); }
    @media (orientation: portrait) { :host { --_u: var(--rest-unit-portrait); --_clock: var(--rest-clock-portrait); } }
    .screen { position: absolute; inset: 0; overflow: hidden; background: var(--rest-bg); color: var(--rest-fg); animation: show var(--motion-effects); transition: opacity var(--motion-effects); }
    :host([leaving]) .screen { opacity: 0; }
    @keyframes show { from { opacity: 0; } }
    .wake { all: unset; position: absolute; inset: 0; cursor: none; }
    .wake:focus-visible { outline: none; }
    .picture {
      position: absolute; display: flex; flex-direction: column; transform: translate(calc(var(--_x) * var(--rest-shift)), calc(var(--_y) * var(--rest-shift)));
      top: max(calc(var(--_u) * var(--rest-pad-top)), env(safe-area-inset-top)); bottom: max(calc(var(--_u) * var(--rest-pad-bottom)), env(safe-area-inset-bottom));
      left: max(calc(var(--_u) * var(--rest-pad-x)), env(safe-area-inset-left)); right: max(calc(var(--_u) * var(--rest-pad-x)), env(safe-area-inset-right));
    }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: calc(var(--_u) * var(--rest-gap) * 2); }
    .clock { font-size: calc(var(--_u) * var(--_clock)); line-height: var(--rest-clock-line); font-weight: var(--weight-strong); letter-spacing: var(--rest-tracking); font-variant-numeric: tabular-nums; white-space: nowrap; margin-left: calc(var(--_u) * var(--rest-clock-inset)); }
    .date { margin-top: calc(var(--_u) * var(--rest-gap) * 1.6); font-size: calc(var(--_u) * var(--rest-date)); line-height: var(--type-title-line); font-weight: var(--weight-medium); color: var(--rest-fg-muted); }
    .temps { display: grid; gap: calc(var(--_u) * var(--rest-gap) * 2); padding-top: calc(var(--_u) * var(--rest-gap)); }
    .temp, .stat { display: flex; align-items: center; gap: calc(var(--_u) * var(--rest-gap)); --icon-size: calc(var(--_u) * var(--rest-icon)); }
    .temp > mh-icon { color: var(--rest-fg-muted); }
    .temp b, .stat b { display: block; line-height: var(--type-value-line); font-weight: var(--weight-strong); letter-spacing: var(--tracking-display); white-space: nowrap; }
    .stat > div { min-width: 0; }
    .stat.long b { font-size: max(var(--type-label-s-size), calc(var(--_u) * var(--rest-line))); white-space: normal; }
    .stat.long b, .stat span, .line, .title, .number.long { overflow: hidden; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .temp b { font-size: calc(var(--_u) * var(--rest-temp)); }
    .stat b { font-size: calc(var(--_u) * var(--rest-stat)); }
    .temp span, .stat span { display: block; font-size: max(var(--type-label-s-size), calc(var(--_u) * var(--rest-label))); line-height: var(--type-label-s-line); color: var(--rest-fg-muted); overflow-wrap: anywhere; hyphens: auto; }
    .attention { flex: 1; min-height: 0; display: flex; align-items: center; align-content: center; gap: calc(var(--_u) * var(--rest-gap)); padding: calc(var(--_u) * var(--rest-gap)) 0; }
    .pill {
      display: inline-flex; align-items: center; gap: calc(var(--_u) * var(--rest-gap) * .8); min-width: 0; max-width: 100%; min-height: calc(var(--_u) * var(--rest-pill)); padding: 0 calc(var(--_u) * var(--rest-gap) * 1.6) 0 calc(var(--_u) * var(--rest-gap) * 1.2);
      border-radius: calc(var(--_u) * var(--rest-pill) / 2); font-size: max(var(--type-label-s-size), calc(var(--_u) * var(--rest-pill-text))); line-height: var(--type-title-line); font-weight: var(--weight-strong);
      background: var(--rest-warn-bg); color: var(--rest-warn-fg); --icon-size: calc(var(--_u) * var(--rest-pill-text) * 1.3);
    }
    /* name and what is the matter beside each other when they fit, otherwise under each other; a long name is cut */
    .text { display: flex; flex-wrap: wrap; column-gap: calc(var(--_u) * var(--rest-gap) * .4); min-width: 0; }
    .name { display: flex; min-width: 0; max-width: 100%; white-space: pre; }
    .cut { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .what { min-width: 0; max-width: 100%; overflow: hidden; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
    .pill.alarm { background: var(--rest-alarm-bg); color: var(--rest-alarm-fg); }
    .pill.more { flex: none; background: none; color: var(--rest-fg-muted); padding: 0; }
    .number.long { font-size: calc(var(--_u) * var(--rest-unit-text)); line-height: var(--type-value-line); letter-spacing: var(--tracking-display); white-space: normal; }
    .title { margin-bottom: calc(var(--_u) * var(--rest-gap)); font-size: calc(var(--_u) * var(--rest-line)); line-height: var(--type-title-line); font-weight: var(--weight-medium); color: var(--rest-fg-muted); overflow-wrap: anywhere; }
    .values { display: flex; flex-wrap: wrap; align-items: flex-end; gap: calc(var(--_u) * var(--rest-gap)) calc(var(--_u) * var(--rest-gap) * 1.75); margin-bottom: calc(var(--_u) * var(--rest-gap)); }
    .number { font-size: calc(var(--_u) * var(--rest-number)); line-height: var(--rest-number-line); font-weight: var(--weight-strong); letter-spacing: var(--rest-tracking); color: var(--rest-accent); white-space: nowrap; }
    .unit { margin-left: calc(var(--_u) * var(--rest-gap) * .4); font-size: calc(var(--_u) * var(--rest-unit-text)); font-weight: var(--weight-medium); letter-spacing: 0; }
    .line { max-width: calc(var(--_u) * var(--rest-line-width)); font-size: max(var(--type-label-s-size), calc(var(--_u) * var(--rest-line))); line-height: var(--type-title-line); color: var(--rest-fg-muted); }
    .stats { margin-left: auto; display: flex; flex-wrap: wrap; gap: calc(var(--_u) * var(--rest-gap)) calc(var(--_u) * var(--rest-gap) * 2.5); }
    .stat { max-width: calc(var(--_u) * var(--rest-stat-width)); }
    .stat > mh-icon { color: var(--rest-accent); flex: none; }
    .wave { display: block; width: 100%; height: calc(var(--_u) * var(--rest-wave-height)); overflow: visible; }
    path { fill: none; stroke-linecap: round; stroke-width: var(--rest-wave-stroke); }
    .active { stroke: var(--rest-accent); }
    .rest { stroke: var(--rest-wave-track); }
    .stale .number, .stale .temp b, .stale .stat b, .stale .stat > mh-icon { color: var(--rest-fg-muted); font-weight: var(--weight-medium); }
    .stale .active { stroke: var(--rest-stale-wave); }
    @media (orientation: portrait) {
      .attention { flex-wrap: wrap; }
      .top { flex-direction: column; gap: calc(var(--_u) * var(--rest-gap) * 3.5); }
      .temps { display: flex; gap: calc(var(--_u) * var(--rest-gap) * 4.5); padding: 0; }
      .stats { width: 100%; margin: calc(var(--_u) * var(--rest-gap)) 0; }
    }
    .screen.night { background: var(--rest-night-bg); color: var(--rest-night-fg); forced-color-adjust: none; }
    .night .picture { inset: 0; align-items: center; justify-content: center; gap: calc(var(--_u) * var(--rest-gap) * 2); transform: translate(calc(var(--_x) * var(--rest-night-shift-x)), calc(var(--_y) * var(--rest-night-shift-y))); }
    .night .clock { margin: 0; font-size: calc(var(--_u) * var(--rest-night-clock)); font-weight: var(--weight-regular); letter-spacing: var(--tracking-display); }
    .faint { display: flex; align-items: center; gap: calc(var(--_u) * var(--rest-gap)); max-width: calc(var(--_u) * var(--rest-night-width)); color: var(--rest-night-alarm); font-size: calc(var(--_u) * var(--rest-night-text)); line-height: var(--type-title-line); font-weight: var(--weight-strong); --icon-size: calc(var(--_u) * var(--rest-night-text) * 1.2); }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.listen();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.deafen();
    this.resize?.disconnect();
    this.resize = null;
    this.watched = null;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector<HTMLElement>('.wake')?.focus(options);
  }

  private deafen(): void {
    for (const stop of this.listening) stop();
    this.listening = [];
  }

  /** Hears of the devices it shows something of, and of those that can raise an alarm. */
  private listen(): void {
    this.deafen();
    if (!this.ctx || !this.isConnected) return;
    const { store } = this.ctx;
    const ids = new Set<string>([
      ...(this.hero ? heroDeviceIds(this.hero) : []),
      ...[this.battery, this.hub.inside, this.hub.outside].flatMap((ref) => (ref ? [ref.deviceId] : [])),
      ...Object.keys(this.hub.tanks),
      ...store.getDevices().filter((device) => Object.values(device.capabilities).some((cap) => alarmKind(cap.baseId) === 'danger')).map((device) => device.id),
    ]);
    const redraw = (): void => this.requestUpdate();
    this.listening = [
      store.subscribeStructure(() => {
        this.listen();
        redraw();
      }),
      ...[...ids].map((id) => store.subscribeDevice(id, redraw)),
    ];
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('ctx') || changed.has('hero') || changed.has('battery') || changed.has('hub')) this.listen();
  }

  protected override updated(changed: PropertyValues<this>): void {
    const { x, y } = shiftAt(Math.floor(this.now.getTime() / 60_000));
    this.style.setProperty('--_x', String(x));
    this.style.setProperty('--_y', String(y));
    const hero = this.shadowRoot?.querySelector<HTMLElement>('.hero');
    // a hero that comes back is drawn anew, without its colour
    if (hero && (changed.has('heroSeed') || changed.has('mode') || changed.has('look') || hero.dataset['seed'] === undefined)) {
      applySectionTheme(hero, this.heroSeed, this.mode, this.look);
      hero.dataset['seed'] = this.heroSeed ?? '';
    }
    this.watchWave();
  }

  /** The wave is drawn in units: how many there are follows from the size it gets. */
  private watchWave(): void {
    const wave = this.shadowRoot?.querySelector('svg.wave') ?? null;
    if (wave === this.watched || typeof ResizeObserver === 'undefined') return;
    this.resize?.disconnect();
    this.watched = wave;
    if (!wave) return;
    this.resize = new ResizeObserver(([entry]) => {
      const { width = 0, height = 0 } = entry?.contentRect ?? {};
      const wide = height > 0 ? Math.round((width / height) * WAVE.height) : 0;
      if (wide === 0 || wide === this.wide) return;
      this.wide = wide;
      this.requestUpdate();
    });
    this.resize.observe(wave);
  }

  private renderWave(progress: number) {
    const width = this.wide;
    const full = width - END;
    const end = progress >= 100 ? full : (width * progress) / 100;
    const active = wavePath(Math.min(end, full));
    const from = active === '' ? END : end + WAVE.gap + WAVE.stroke;
    return html`<svg class="wave" viewBox="0 0 ${width} ${WAVE.height}" preserveAspectRatio="none" aria-hidden="true">
      ${active === '' ? nothing : svg`<path class="active" d=${active}></path>`}
      ${from < full ? svg`<path class="rest" d="M${from} ${WAVE.height / 2} L${full} ${WAVE.height / 2}"></path>` : nothing}
    </svg>`;
  }

  private renderHero() {
    const { hero, ctx } = this;
    if (!hero) return nothing;
    const view = heroView(hero, (id) => ctx.store.getDevice(id), ctx.t);
    const long = isWords(view.number.text) ? 'long' : '';
    return html`<div class="hero">
      ${view.kind === 'battery' ? nothing : html`<div class="title">${view.title}</div>`}
      <div class="values">
        <div class="number ${long}">${view.number.text}${view.number.unit ? html`<span class="unit">${view.number.unit}</span>` : nothing}</div>
        ${view.line ? html`<div class="line">${view.line}</div>` : nothing}
        ${view.stats.length ? html`<div class="stats">${view.stats.map((stat) => html`<div class="stat ${isWords(stat.value) ? 'long' : ''}"><mh-icon name=${stat.icon}></mh-icon><div><b>${stat.value}</b> <span>${stat.label}</span></div></div>`)}</div>` : nothing}
      </div>
      ${view.progress !== null ? this.renderWave(view.progress) : nothing}
    </div>`;
  }

  private renderTemperatures() {
    const { ctx, hub } = this;
    const get = (id: string) => ctx.store.getDevice(id);
    const found = [
      { icon: 'home' as const, label: ctx.t('wall.inside'), value: temperature(hub.inside, get, ctx.t) },
      { icon: 'park' as const, label: ctx.t('wall.outside'), value: temperature(hub.outside, get, ctx.t) },
    ].filter((temp) => temp.value !== null);
    return found.length === 0 ? nothing : html`<div class="temps">${found.map((temp) => html`<div class="temp"><mh-icon name=${temp.icon}></mh-icon><div><b>${temp.value}</b> <span>${temp.label}</span></div></div>`)}</div>`;
  }

  override render() {
    const { ctx, night } = this;
    if (!ctx) return nothing;
    const { items, more, active } = attention({
      devices: ctx.store.getDevices(), away: this.away, lowBattery: this.wall.lowBattery, battery: this.battery, tanks: this.hub.tanks, night, before: this.told,
    }, ctx.t);
    this.told = active;
    const time = timeText(this.now, ctx.t);
    const rest = more > 0 ? ctx.t('rest.more', { n: more }) : '';
    const picture = night
      ? html`<div class="clock">${time}</div>
        ${items.map((item) => html`<div class="faint"><mh-icon name=${item.icon} filled></mh-icon>${itemText(item)}</div>`)}${rest ? html`<div class="faint more">${rest}</div>` : nothing}`
      : html`<div class="top"><div><div class="clock">${time}</div><div class="date">${dayText(this.now, ctx.t)}</div></div>${this.renderTemperatures()}</div>
        <div class="attention">${items.map((item) => html`<div class="pill ${item.tone}"><mh-icon name=${item.icon} filled></mh-icon>${itemText(item)}</div>`)}${rest ? html`<div class="pill more">${rest}</div>` : nothing}</div>
        ${this.renderHero()}`;
    return html`<div class="screen ${night ? 'night' : ''} ${!night && this.away ? 'stale' : ''}"><div class="picture" aria-hidden="true">${picture}</div></div>
      <button class="wake" aria-label=${ctx.t('rest.label')}></button>`;
  }
}

if (!customElements.get('mh-rest-screen')) customElements.define('mh-rest-screen', MhRestScreen);

declare global {
  interface HTMLElementTagNameMap { 'mh-rest-screen': MhRestScreen }
}
