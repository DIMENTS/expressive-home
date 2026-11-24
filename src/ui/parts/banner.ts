import { LitElement, css, html, nothing } from 'lit';
import { themePixels } from '../theme-pixels';
import { sharedStyles } from './shared-styles';
import './icon';

/** A sine wave as an SVG path, from x = -wavelength to the length, around the line y. */
export function wavePath(length: number, wavelength: number, amplitude: number, y: number): string {
  let d = `M${-wavelength} ${y}`;
  for (let x = -wavelength + 2; x <= length + 2; x += 2) d += ` L${x.toFixed(1)} ${(y + amplitude * Math.sin((x / wavelength) * Math.PI * 2)).toFixed(2)}`;
  return d;
}

// The small moving wave of the bar, in SVG units (pixels); the sizes come from the theme. The path runs on
// beyond the box by more than one wavelength, so it can travel one wavelength and loop without a seam.
const BANNER_WAVE_WIDTH = themePixels('banner-wave-width');
const BANNER_WAVE_HEIGHT = themePixels('banner-wave-height');
const BANNER_WAVE_LENGTH = themePixels('banner-wave-length');
const BANNER_WAVE = wavePath(BANNER_WAVE_WIDTH + BANNER_WAVE_LENGTH * 1.5, BANNER_WAVE_LENGTH, themePixels('banner-wave-amplitude'), BANNER_WAVE_HEIGHT / 2);

/**
 * The bar at the top: while the connection is gone, on the error container with a small moving
 * wave and a "Nu proberen" button in the `action` slot; for 3 s "Weer verbonden" on the primary container.
 */
export class MhBanner extends LitElement {
  static override properties = {
    tone: { type: String, reflect: true },
    heading: { type: String },
    text: { type: String },
    icon: { type: String },
  };

  declare tone: 'error' | 'ok';
  declare heading: string;
  declare text: string;
  /** Another icon than that of its tone. */
  declare icon: string;

  constructor() {
    super();
    this.tone = 'error';
    this.heading = '';
    this.text = '';
    this.icon = '';
  }

  static override styles = [sharedStyles, css`
    :host { display: block; }
    .banner {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-12) var(--space-16);
      padding: var(--space-12) var(--space-12) var(--space-12) var(--space-20);
      border-radius: var(--banner-radius); background: var(--banner-bg); color: var(--banner-fg);
      transition: background-color var(--motion-effects), color var(--motion-effects);
      --icon-size: var(--icon-l);
    }
    :host([tone="ok"]) .banner { background: var(--banner-ok-bg); color: var(--banner-ok-fg); }
    .text { flex: 1 1 var(--banner-text-min); min-width: 0; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); }
    b { display: block; font-weight: var(--weight-strong); }
    .text span { font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); }
    .wave { flex: 0 0 var(--banner-wave-width); height: var(--banner-wave-height); overflow: hidden; }
    .wave path {
      fill: none; stroke: currentColor; stroke-width: var(--banner-wave-stroke); stroke-linecap: round;
      animation: shift var(--motion-banner-wave) linear infinite;
    }
    @keyframes shift { to { transform: translateX(var(--banner-wave-length)); } }
    ::slotted(mh-button) { --button-text-fg: currentColor; }
  `];

  override render() {
    const error = this.tone === 'error';
    return html`<div class="banner" role="alert">
      <mh-icon name=${this.icon || (error ? 'cloud_off' : 'check_circle')} filled></mh-icon>
      <div class="text"><b>${this.heading}</b><span>${this.text}</span></div>
      ${error ? html`<svg class="wave" viewBox="0 0 ${BANNER_WAVE_WIDTH} ${BANNER_WAVE_HEIGHT}" aria-hidden="true"><path d=${BANNER_WAVE}></path></svg>` : nothing}
      <slot name="action"></slot>
    </div>`;
  }
}

if (!customElements.get('mh-banner')) customElements.define('mh-banner', MhBanner);

declare global {
  interface HTMLElementTagNameMap { 'mh-banner': MhBanner }
}
