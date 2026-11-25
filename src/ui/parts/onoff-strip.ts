import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import type { HistorySwitches } from '../../homey/client';
import type { Translate } from '../../i18n';
import { formatDuration } from '../../i18n/format';
import { momentText, stateWords, switchesSentence } from '../../charts/say';
import { stripsFrom, type DayStrip, type Stretch } from '../../charts/strips';
import { startOfDay } from '../../charts/times';
import { sharedStyles } from './shared-styles';

/** The hours under the strips. */
const HOURS = [0, 6, 12, 18, 24];
const DAY_MS = 86_400_000;

let made = 0;

interface Item { day: DayStrip; stretch: Stretch }

/**
 * When something was on (or open, or saw motion): a strip per day, newest first, with only what is known. A tap on a
 * row, or the arrows, pick a stretch and say from when to when; it is a sentence for screen readers.
 */
export class MhOnoffStrip extends LitElement {
  static override properties = {
    switches: { attribute: false }, t: { attribute: false }, nowOn: { attribute: false },
    now: { type: Number }, zone: { type: String }, name: { type: String }, baseId: { type: String },
    empty: { type: Boolean, reflect: true }, picked: { state: true },
  };

  declare switches: HistorySwitches | null;
  declare t: Translate;
  /** The state of now, from the device itself; null when it is not known. */
  declare nowOn: boolean | null;
  declare now: number;
  declare zone: string | undefined;
  declare name: string;
  declare baseId: string;
  declare empty: boolean;
  /** The stretch that is picked, by its place in time; null when none is. */
  declare picked: number | null;

  private readonly sentenceId = `strip-${made += 1}`;
  private days: DayStrip[] = [];
  private items: Item[] = [];
  private since: number | null = null;
  private count = 0;

  constructor() {
    super();
    this.switches = null;
    this.nowOn = null;
    this.now = Date.now();
    this.zone = undefined;
    this.name = '';
    this.baseId = 'onoff';
    this.empty = true;
    this.picked = null;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    :host([empty]) { display: none; }
    .head { display: flex; justify-content: space-between; gap: var(--space-8); color: var(--chart-label-fg); font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); }
    .picked { color: inherit; font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-variant-numeric: tabular-nums; }
    .rows { position: relative; display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: var(--space-12); margin-top: var(--space-8); border-radius: var(--shape-md); }
    .row { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; min-height: var(--target-min); cursor: pointer; }
    .day { color: var(--chart-label-fg); font-size: var(--type-label-s-size); min-width: var(--target-min); }
    .bar { position: relative; height: var(--chart-band-height); }
    .bar span { position: absolute; top: 0; bottom: 0; left: var(--_from); width: var(--_width); }
    .bar .off { background: var(--chart-band-track); }
    .bar .on { background: var(--chart-band-on); border-radius: var(--shape-xs); }
    .bar .ring { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--chart-cursor-width); border-radius: var(--shape-xs); }
    .bar .end { width: var(--chart-cursor-width); background: var(--chart-label-fg); left: var(--_from); }
    .times { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; color: var(--chart-label-fg); font-size: var(--type-label-s-size); }
    .times div { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
    .times .gutter { min-width: var(--target-min); font-style: normal; }
    .reader { position: absolute; inset: 0; border-radius: var(--shape-md); pointer-events: none; }
  `];

  override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('switches') || changed.has('nowOn') || changed.has('now') || changed.has('zone') || changed.has('t')) {
      const found = this.switches && this.t ? stripsFrom(this.switches.changes, this.nowOn, this.now, this.zone, this.t) : { days: [], since: null, count: 0 };
      this.days = found.days;
      this.since = found.since;
      this.count = found.count;
      this.items = [...found.days].reverse().flatMap((day) => day.stretches.map((stretch) => ({ day, stretch })));
      if (this.picked !== null && this.picked >= this.items.length) this.picked = null;
    }
    this.empty = this.days.length === 0;
  }

  override updated(): void {
    for (const element of this.shadowRoot?.querySelectorAll<HTMLElement>('[data-from]') ?? []) {
      element.style.setProperty('--_from', `${element.dataset['from']}%`);
      element.style.setProperty('--_width', `${element.dataset['width']}%`);
    }
  }

  /** How long the day of a strip is on the clock: 23, 24 or 25 hours. */
  private lengthOf(day: DayStrip): number {
    return startOfDay(day.start + DAY_MS * 1.5, this.zone) - day.start;
  }

  private time(at: number): string {
    return momentText('last24Hours', at, this.zone, this.t);
  }

  private until(stretch: Stretch): string {
    return stretch.to >= this.now ? this.t('chart.now') : this.time(stretch.to);
  }

  private onKey(event: KeyboardEvent): void {
    if (this.items.length === 0) return;
    const last = this.items.length - 1;
    let next: number | null = this.picked;
    switch (event.key) {
      case 'ArrowLeft': case 'ArrowDown': next = this.picked === null ? last : Math.max(0, this.picked - 1); break;
      case 'ArrowRight': case 'ArrowUp': next = this.picked === null ? last : Math.min(last, this.picked + 1); break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      case 'Escape':
        if (this.picked === null) return;
        next = null;
        event.stopPropagation();
        break;
      default: return;
    }
    event.preventDefault();
    this.picked = next;
  }

  private onRow(day: DayStrip, event: MouseEvent): void {
    const bar = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.bar');
    const box = bar?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const at = day.start + Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * this.lengthOf(day);
    let best: number | null = null;
    this.items.forEach((item, i) => {
      if (item.day !== day) return;
      const distance = at < item.stretch.from ? item.stretch.from - at : at > item.stretch.to ? at - item.stretch.to : 0;
      const current = best === null ? Infinity : (() => { const s = this.items[best]!.stretch; return at < s.from ? s.from - at : at > s.to ? at - s.to : 0; })();
      if (distance < current) best = i;
    });
    this.picked = best;
  }

  private sentence(): string {
    if (this.since === null) return '';
    const today = this.days[0];
    const onToday = today ? today.stretches.filter((s) => s.on) : [];
    const startsToday = this.switches!.changes.filter((c) => c.on && today && c.at >= today.start && c.at <= this.now).length;
    const minutes = onToday.reduce((sum, s) => sum + (s.to - s.from), 0) / 60_000;
    const lastChange = this.switches!.changes.filter((c) => c.at <= this.now).at(-1);
    return switchesSentence({
      name: this.name, baseId: this.baseId, count: this.count, since: momentText('last7Days', this.since, this.zone, this.t),
      todayTimes: startsToday, todayDuration: formatDuration(minutes, this.t), nowOn: this.nowOn, nowSince: lastChange ? this.time(lastChange.at) : null,
    }, this.t);
  }

  override render() {
    if (this.days.length === 0) return nothing;
    const words = stateWords(this.baseId, this.t);
    const picked = this.picked === null ? null : this.items[this.picked]!;
    const percent = (part: number): string => String(Math.round(part * 10000) / 100);
    const said = (item: Item): string => this.t('chart.stretch.said', { day: item.day.label, state: (item.stretch.on ? words.on : words.off).toLowerCase(), from: this.time(item.stretch.from), to: this.until(item.stretch) });
    return html`
      <div class="head">
        ${picked ? html`<span class="picked" aria-hidden="true">${this.t('chart.stretch', { state: picked.stretch.on ? words.on : words.off, from: this.time(picked.stretch.from), to: this.until(picked.stretch) })}</span>` : html`<span></span>`}
        <span class="since">${this.t(this.count === 1 ? 'chart.switches.sinceOne' : 'chart.switches.since', { count: this.count, since: momentText('last7Days', this.since!, this.zone, this.t) })}</span>
      </div>
      <div class="rows">
        ${this.days.map((day) => {
          const length = this.lengthOf(day);
          return html`<div class="row" @click=${(event: MouseEvent) => this.onRow(day, event)}>
            <span class="day">${day.label}</span>
            <span class="bar">
              ${day.stretches.map((stretch) => html`<span class=${stretch.on ? 'on' : 'off'}
                data-from=${percent((stretch.from - day.start) / length)} data-width=${percent((stretch.to - stretch.from) / length)}></span>`)}
              ${picked?.day === day ? html`<span class="ring" data-from=${percent((picked.stretch.from - day.start) / length)} data-width=${percent((picked.stretch.to - picked.stretch.from) / length)}></span>` : nothing}
              ${day.end >= this.now ? html`<span class="end" data-from=${percent((day.end - day.start) / length)} data-width="0"></span>` : nothing}
            </span>
          </div>`;
        })}
        <div class="reader" role="slider" tabindex="0" aria-label=${this.name} aria-describedby=${this.sentenceId}
          aria-valuemin="0" aria-valuemax=${this.items.length - 1} aria-valuenow=${this.picked ?? this.items.length - 1}
          aria-valuetext=${said(picked ?? this.items.at(-1)!)} @keydown=${this.onKey}></div>
        <div class="times" aria-hidden="true"><i class="gutter"></i><div>${HOURS.map((hour) => html`<span>${String(hour).padStart(2, '0')}:00</span>`)}</div></div>
      </div>
      <span class="unseen" id=${this.sentenceId}>${this.sentence()}</span>
    `;
  }
}

customElements.define('mh-onoff-strip', MhOnoffStrip);

declare global {
  interface HTMLElementTagNameMap { 'mh-onoff-strip': MhOnoffStrip }
}
