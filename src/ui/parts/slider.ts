import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { SLIDER_SEND_MS, createThrottle } from '../model/slider-math';
import { HELD_BUZZ_MS, observeHoldDim, SWIPE_PX } from './hold-dim';
import { sharedStyles } from './shared-styles';

const clean = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 1e6) / 1e6;

/** What scrolls the page: a mouse does not. */
const isFinger = (event: PointerEvent): boolean => event.pointerType === 'touch' || event.pointerType === 'pen';

/**
 * The slider: a thick track with a gap on either side of a thin handle. It works in
 * fractions from 0 to 1; the tile or panel turns them into values. While dragged it reports `slide` at
 * most every SLIDER_SEND_MS; on release and on every key it reports `commit`. The touch target is 48 high.
 */
export class MhSlider extends LitElement {
  static override properties = {
    fraction: { type: Number },
    label: { type: String },
    valueText: { type: String },
    variant: { type: String, reflect: true },
    step: { type: Number },
    disabled: { type: Boolean, reflect: true },
    dimmed: { type: Boolean, reflect: true },
    dragging: { type: Boolean, reflect: true },
    gripped: { type: Boolean, reflect: true },
    held: { state: true },
  };

  declare fraction: number;
  declare label: string;
  declare valueText: string;
  declare variant: 'plain' | 'hue' | 'temperature';
  /** One key step, as a fraction of the range. */
  declare step: number;
  declare disabled: boolean;
  /** Grey and half transparent, as on a lamp that is off; dragging still works. */
  declare dimmed: boolean;
  declare dragging: boolean;
  /** A finger holds it; it shows that. */
  declare gripped: boolean;
  /** The position under the pointer while dragging; a value from outside does not move the handle meanwhile. */
  declare held: number | null;

  /** Where the finger that holds it began, and the value then. */
  private grip: { x: number; from: number; width: number; moving: boolean; sent: boolean } | null = null;
  private stopHold: (() => void) | null = null;

  /** Runs from a key until SLIDER_SEND_MS after the last key, when the final value is reported. */
  private keyTimer: ReturnType<typeof setTimeout> | null = null;
  /** When a key last sent a value during the current run of keys. */
  private keySentAt = Number.NEGATIVE_INFINITY;

  private throttle = createThrottle((fraction) => this.emit('slide', fraction), SLIDER_SEND_MS, {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });

  constructor() {
    super();
    this.fraction = 0;
    this.label = '';
    this.valueText = '';
    this.variant = 'plain';
    this.step = 0.01;
    this.disabled = false;
    this.dimmed = false;
    this.dragging = false;
    this.gripped = false;
    this.held = null;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; --_fill: var(--slider-fill); --_track: var(--slider-track); }
    :host([dimmed]) { --_fill: var(--slider-off-fill); --_track: var(--slider-off-track); }
    :host([dimmed]) .slider { opacity: var(--slider-off-opacity); }
    .slider {
      position: relative; width: 100%; height: var(--slider-height); touch-action: pan-y pinch-zoom; cursor: ew-resize;
      -webkit-touch-callout: none; user-select: none; -webkit-user-select: none;
      transition: opacity var(--motion-effects), transform var(--motion-effects);
    }
    .slider::before { content: ""; position: absolute; inset: calc((var(--target-min) - var(--slider-height)) / -2) 0; }
    .fill, .rest { position: absolute; top: 0; bottom: 0; transition: background-color var(--motion-effects); }
    .fill {
      left: 0; width: max(0px, calc(var(--_v) * 1% - var(--slider-gap))); background: var(--_fill);
      border-radius: var(--slider-radius) var(--slider-radius-inner) var(--slider-radius-inner) var(--slider-radius);
    }
    .rest {
      left: min(100%, calc(var(--_v) * 1% + var(--slider-gap))); right: 0; background: var(--_track);
      border-radius: var(--slider-radius-inner) var(--slider-radius) var(--slider-radius) var(--slider-radius-inner);
    }
    .handle {
      position: absolute; left: calc(var(--_v) * 1% - var(--slider-handle-width) / 2); width: var(--slider-handle-width);
      top: calc(var(--slider-handle-overshoot) * -1); bottom: calc(var(--slider-handle-overshoot) * -1);
      border-radius: calc(var(--slider-handle-width) / 2); background: var(--_fill);
      transition: width var(--motion-effects), left var(--motion-effects), background-color var(--motion-effects);
    }
    :host([gripped]) .slider { transform: scaleY(var(--slider-grip-scale)); }
    :host([dragging]) .handle {
      width: var(--slider-handle-width-dragging); left: calc(var(--_v) * 1% - var(--slider-handle-width-dragging) / 2); transition: none;
    }
    :host([variant="hue"]) .slider, :host([variant="temperature"]) .slider { border-radius: var(--slider-radius); }
    :host([variant="hue"]) .slider { background: var(--ramp-hue); }
    :host([variant="temperature"]) .slider { background: var(--ramp-temperature); }
    :host([variant="hue"]) .fill, :host([variant="hue"]) .rest, :host([variant="temperature"]) .fill, :host([variant="temperature"]) .rest { display: none; }
    :host([variant="hue"]) .handle, :host([variant="temperature"]) .handle {
      width: var(--slider-ramp-handle-width); left: calc(var(--_v) * 1% - var(--slider-ramp-handle-width) / 2);
      background: var(--c-on-surface); box-shadow: 0 0 0 var(--slider-ramp-ring) var(--sheet-row-bg); border-radius: var(--shape-xs);
    }
    :host([disabled]) .slider { cursor: default; opacity: var(--state-disabled-content); }
  `];

  private emit(type: 'slide' | 'commit', fraction: number): void {
    this.dispatchEvent(new CustomEvent(type, { detail: { fraction }, bubbles: true, composed: true }));
  }

  private snap(value: number): number {
    const step = this.step > 0 ? this.step : 0.01;
    return clean(Math.round(clean(value) / step) * step);
  }

  private fractionAt(event: PointerEvent): number {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return rect.width > 0 ? this.snap((event.clientX - rect.left) / rect.width) : this.fraction;
  }

  /**
   * A finger scrolls over it as over everything else; held still first, it goes along with the finger from where it
   * was. A mouse takes it at once.
   */
  private watchHold(): void {
    this.stopHold?.();
    this.stopHold = observeHoldDim(this.renderRoot.querySelector<HTMLElement>('.slider')!, {
      enabled: () => !this.disabled, canDim: () => !this.disabled && !this.inert, accepts: isFinger, yields: true,
      start: (x) => {
        this.grip = { x, from: this.fraction, width: this.renderRoot.querySelector('.slider')!.getBoundingClientRect().width, moving: false, sent: false };
        this.held = this.fraction;
        this.dragging = true;
        this.gripped = true;
        navigator.vibrate?.(HELD_BUZZ_MS);
      },
      move: (x) => {
        const { grip } = this;
        if (!grip || grip.width <= 0) return;
        // what it took to be a swipe does not count: it does not jump
        if (!grip.moving) grip.x += Math.sign(x - grip.x) * SWIPE_PX;
        grip.moving = true;
        const snapped = this.snap(grip.from + (x - grip.x) / grip.width);
        const next = snapped === this.snap(grip.from) ? grip.from : snapped;
        if (next === this.held) return;
        grip.sent = true;
        this.held = next;
        this.throttle.push(next);
      },
      end: () => {
        const { grip, held } = this;
        if (!grip) return;
        this.grip = null;
        this.held = null;
        this.dragging = false;
        this.gripped = false;
        this.throttle.cancel();
        if (!grip.sent || held === null) return;
        this.fraction = held;
        this.emit('commit', held);
      },
      open: () => {},
      missed: () => this.dispatchEvent(new CustomEvent('hold-hint', { bubbles: true, composed: true })),
    }, 'x');
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.watchHold();
  }

  protected override firstUpdated(): void {
    this.watchHold();
  }

  private onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    if (this.disabled || isFinger(event) || event.button > 0) return;
    const target = event.currentTarget as HTMLElement;
    try { target.setPointerCapture(event.pointerId); } catch { /* not every environment supports capture */ }
    this.dragging = true;
    this.held = this.fractionAt(event);
    this.throttle.push(this.held);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging || this.grip || isFinger(event)) return;
    this.held = this.fractionAt(event);
    this.throttle.push(this.held);
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.dragging || this.grip || isFinger(event)) return;
    this.dragging = false;
    this.fraction = event.type === 'pointerup' ? this.fractionAt(event) : (this.held ?? this.fraction);
    this.held = null;
    this.throttle.cancel();
    this.emit('commit', this.fraction);
  }

  private onKey(event: KeyboardEvent): void {
    if (this.disabled) return;
    const big = event.shiftKey ? 10 : 1;
    // A run of keys holds its own position, like a drag: a value from outside meanwhile does not move it back.
    const from = this.held ?? this.fraction;
    const moves: Record<string, () => number> = {
      ArrowRight: () => from + this.step * big, ArrowUp: () => from + this.step * big,
      ArrowLeft: () => from - this.step * big, ArrowDown: () => from - this.step * big,
      PageUp: () => from + this.step * 10, PageDown: () => from - this.step * 10,
      Home: () => 0, End: () => 1,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const next = this.snap(move());
    this.held = next;
    this.fraction = next;
    // Keys follow the same interval as dragging: a value goes out at most every SLIDER_SEND_MS (the first key of
    // a run at once), and the final value SLIDER_SEND_MS after the last key, never sooner after the last send.
    const now = Date.now();
    if (now - this.keySentAt >= SLIDER_SEND_MS) {
      this.keySentAt = now;
      this.emit('slide', next);
    }
    if (this.keyTimer !== null) clearTimeout(this.keyTimer);
    this.keyTimer = setTimeout(() => {
      this.keyTimer = null;
      const final = this.held ?? this.fraction;
      this.held = null;
      this.fraction = final;
      this.keySentAt = Number.NEGATIVE_INFINITY;
      this.emit('commit', final);
    }, SLIDER_SEND_MS);
  }

  protected override updated(changed: PropertyValues<this>): void {
    // the position goes in through the CSSOM: the content security policy allows no style attribute
    if (changed.has('fraction') || changed.has('held')) this.style.setProperty('--_v', String(clean(this.position()) * 100));
  }

  private position(): number {
    return this.held ?? this.fraction;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopHold?.();
    this.stopHold = null;
    this.dragging = false;
    this.throttle.cancel();
    if (this.keyTimer !== null) clearTimeout(this.keyTimer);
    this.keyTimer = null;
    this.held = null;
  }

  override render() {
    return html`<div class="slider" part=${this.dimmed ? 'slider off' : 'slider on'} role="slider" aria-label=${this.label} aria-valuemin="0" aria-valuemax="100"
      aria-valuenow=${Math.round(clean(this.position()) * 100)} aria-valuetext=${this.valueText || nothing}
      aria-disabled=${this.disabled ? 'true' : 'false'} tabindex=${this.disabled ? '-1' : '0'}
      @pointerdown=${(e: PointerEvent) => this.onPointerDown(e)} @pointermove=${(e: PointerEvent) => this.onPointerMove(e)}
      @pointerup=${(e: PointerEvent) => this.onPointerEnd(e)} @pointercancel=${(e: PointerEvent) => this.onPointerEnd(e)} @lostpointercapture=${(e: PointerEvent) => this.onPointerEnd(e)}
      @click=${(e: Event) => e.stopPropagation()} @keydown=${(e: KeyboardEvent) => this.onKey(e)}
    ><span class="fill" part="slider-fill"></span><span class="rest" part="slider-track"></span><span class="handle"></span></div>`;
  }
}

if (!customElements.get('mh-slider')) customElements.define('mh-slider', MhSlider);

declare global {
  interface HTMLElementTagNameMap { 'mh-slider': MhSlider }
}
