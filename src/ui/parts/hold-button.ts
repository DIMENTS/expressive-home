import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { HOLD_TEXT_MIN_PX } from '../breakpoints';
import { HELD_BUZZ_MS, HOLD_MOVE_PX, scrolledJustNow, watchScroll } from './hold-dim';
import { sharedStyles } from './shared-styles';
import './icon';

/** Held this long it does what it says. */
export const HOLD_GO_MS = 800;
/** In how many steps it fills meanwhile. */
export const HOLD_STEPS = 4;
/** A press shorter than this is a tap; a longer one that is not held to the end was broken off. */
export const TAP_MS = 350;
/** The click that ends a press comes at once; after this long another click is another click. */
const SWALLOW_MS = 100;

/**
 * A button for what nobody should do by accident. `guarded`: held to the end it reports `go`; a short tap, a key or a
 * screen reader reports `ask`, for a question first. Not guarded: a tap reports `go`.
 */
export class MhHoldButton extends LitElement {
  static override properties = {
    text: { type: String },
    short: { type: String },
    label: { type: String },
    icon: { type: String },
    guarded: { type: Boolean, reflect: true },
    busy: { type: Boolean, reflect: true },
    disabled: { type: Boolean, reflect: true },
    main: { type: Boolean, reflect: true },
    large: { type: Boolean, reflect: true },
    pressed: { type: String },
    holding: { type: Boolean, reflect: true },
  };

  declare text: string;
  /** Instead of the text where there is no room for it. */
  declare short: string;
  /** What it does, with the name of the device. */
  declare label: string;
  declare icon: string;
  declare guarded: boolean;
  /** It was told something and did not answer yet. */
  declare busy: boolean;
  /** It can be looked at. */
  declare disabled: boolean;
  /** In the main colour. */
  declare main: boolean;
  declare large: boolean;
  /** 'true' or 'false' for one of a few, of which one is so now. */
  declare pressed: string;
  declare holding: boolean;

  private press: { id: number; x: number; y: number; done: boolean } | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private filling: ReturnType<typeof setInterval> | null = null;
  /** The click that ends this press is not one. */
  private swallow = false;
  private forget: ReturnType<typeof setTimeout> | null = null;
  private stopScroll: (() => void) | null = null;

  constructor() {
    super();
    this.text = '';
    this.short = '';
    this.label = '';
    this.icon = '';
    this.guarded = false;
    this.busy = false;
    this.disabled = false;
    this.main = false;
    this.large = false;
    this.pressed = '';
    this.holding = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; min-width: 0; container-type: inline-size; }
    button {
      all: unset; box-sizing: border-box; position: relative; width: 100%; height: var(--control-height); padding: 0 var(--space-12);
      display: flex; align-items: center; justify-content: center; gap: var(--space-8); border-radius: var(--control-radius);
      background: var(--control-bg); color: inherit; cursor: pointer; touch-action: manipulation; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none;
      font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); font-weight: var(--weight-strong); white-space: nowrap;
      transition: background-color var(--motion-effects), opacity var(--motion-effects); --icon-size: var(--icon-m);
    }
    :host([large]) button { height: var(--control-large-height); border-radius: var(--control-large-radius); font-size: var(--type-label-l-size); --icon-size: var(--icon-l); }
    :host([main]) button { background: var(--control-main-bg); color: var(--control-main-fg); }
    button:hover { background: color-mix(in srgb, currentColor var(--state-hover), var(--_bg, var(--control-bg))); }
    :host([main]) button:hover { background: color-mix(in srgb, var(--control-main-fg) var(--state-hover), var(--control-main-bg)); }
    button:focus-visible { outline: var(--focus-width) solid var(--focus-color); outline-offset: var(--focus-offset); }
    :host([busy]) button, :host([disabled]) button { cursor: progress; opacity: var(--state-disabled-content); }
    :host([disabled]) button { cursor: default; }
    .fill { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; opacity: 0; }
    .fill::before {
      content: ""; position: absolute; inset: 0; width: calc(var(--_part, 0) * 100%); background: var(--control-fill);
    }
    :host([holding]) .fill { opacity: 1; }
    /* the next step begins where this one ends: together they are one movement */
    :host([holding]) .fill::before { transition: width var(--hold-step) linear; }
    mh-icon, .text { position: relative; }
    .text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .text.short { display: none; }
    @container (width < ${HOLD_TEXT_MIN_PX}px) {
      .text.long:has(+ .short) { display: none; }
      .text.short { display: block; }
    }
  `];

  private report(type: 'go' | 'ask'): void {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  }

  /** Ends the press; what follows of it is no click, unless it was a tap. */
  private release(tapped: boolean): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    if (this.filling !== null) clearInterval(this.filling);
    this.filling = null;
    window.removeEventListener('pointerdown', this.onOther, true);
    if (!this.press) return;
    this.press = null;
    if (!tapped) this.swallow = true;
    this.holding = false;
    this.style.setProperty('--_part', '0');
  }

  /** Another finger, anywhere. */
  private onOther = (event: PointerEvent): void => {
    if (this.press && event.pointerId !== this.press.id) this.release(false);
  };

  private onDown(event: PointerEvent): void {
    event.stopPropagation();
    if (this.press) return;
    this.swallow = false;
    if (this.forget !== null) clearTimeout(this.forget);
    if (!this.guarded || this.busy || this.disabled || event.button > 0 || event.isPrimary === false) return;
    if (event.pointerType !== 'mouse' && scrolledJustNow()) {
      this.swallow = true;
      return;
    }
    const press = { id: event.pointerId, x: event.clientX, y: event.clientY, done: false };
    this.press = press;
    this.holding = true;
    let step = 1;
    const fill = (): void => this.style.setProperty('--_part', String(Math.min(1, step / HOLD_STEPS)));
    fill();
    this.filling = setInterval(() => { step += 1; fill(); }, HOLD_GO_MS / HOLD_STEPS);
    this.timers = [
      setTimeout(() => { press.done = true; }, TAP_MS),
      setTimeout(() => {
        navigator.vibrate?.(HELD_BUZZ_MS);
        this.release(false);
        this.report('go');
      }, HOLD_GO_MS),
    ];
    window.addEventListener('pointerdown', this.onOther, true);
  }

  private onMove(event: PointerEvent): void {
    if (this.press?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - this.press.x, event.clientY - this.press.y) > HOLD_MOVE_PX) this.release(false);
  }

  private onUp(event: PointerEvent): void {
    if (this.press?.id === event.pointerId) this.release(event.type === 'pointerup' && !this.press.done);
    if (!this.swallow) return;
    if (this.forget !== null) clearTimeout(this.forget);
    this.forget = setTimeout(() => { this.swallow = false; }, SWALLOW_MS);
  }

  private onClick(event: Event): void {
    event.stopPropagation();
    const swallowed = this.swallow;
    this.swallow = false;
    if (swallowed || this.busy || this.disabled) return;
    this.report(this.guarded ? 'ask' : 'go');
  }

  private onKey(event: KeyboardEvent): void {
    this.swallow = false;
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  }

  private onMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  protected override updated(changed: PropertyValues<this>): void {
    // it does something else by now: not with this press
    if (changed.has('label') || changed.has('guarded') || changed.has('busy') || changed.has('disabled')) this.release(false);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.stopScroll ??= watchScroll();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.release(false);
    this.swallow = false;
    if (this.forget !== null) clearTimeout(this.forget);
    this.stopScroll?.();
    this.stopScroll = null;
  }

  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector('button')?.focus(options);
  }

  override render() {
    return html`<button type="button" class="hit" aria-label=${this.label || nothing} aria-pressed=${this.pressed || nothing} aria-disabled=${this.busy || this.disabled ? 'true' : nothing} aria-busy=${this.busy ? 'true' : nothing}
      @pointerdown=${(e: PointerEvent) => this.onDown(e)} @pointermove=${(e: PointerEvent) => this.onMove(e)} @pointerup=${(e: PointerEvent) => this.onUp(e)}
      @pointercancel=${(e: PointerEvent) => this.onUp(e)} @pointerleave=${(e: PointerEvent) => this.onUp(e)} @click=${(e: Event) => this.onClick(e)}
      @keydown=${(e: KeyboardEvent) => this.onKey(e)} @contextmenu=${(e: Event) => this.onMenu(e)}
    ><span class="fill"></span>${this.icon ? html`<mh-icon name=${this.icon} filled></mh-icon>` : nothing}<span class="text long">${this.text}</span>${this.short ? html`<span class="text short">${this.short}</span>` : nothing}</button>`;
  }
}

if (!customElements.get('mh-hold-button')) customElements.define('mh-hold-button', MhHoldButton);

declare global {
  interface HTMLElementTagNameMap { 'mh-hold-button': MhHoldButton }
}
