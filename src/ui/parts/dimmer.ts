import { LitElement, css, html, type PropertyValues } from 'lit';
import type { Mode } from '../../theme/types';
import { applySectionTheme } from '../apply-theme';
import type { IconName } from '../icons/icons';
import type { DimBox } from '../model/dim-math';
import { pixels } from '../pixels';
import { sharedStyles } from './shared-styles';
import './icon';

/** The tile that the dimmer grows out of. */
export interface DimFrom { left: number; top: number; width: number; height: number }

/**
 * A lamp tile that was held, grown into a standing slider: the edge of the fill lies under the finger.
 * Only to see: the finger stays on the tile, and for a keyboard and a screen reader there is the window of the lamp.
 */
export class MhDimmer extends LitElement {
  static override properties = {
    box: { attribute: false },
    from: { attribute: false },
    level: { type: Number },
    percent: { type: Number },
    name: { type: String },
    icon: { type: String },
    seed: { attribute: false },
    mode: { type: String },
    closing: { type: Boolean, reflect: true },
  };

  declare box: DimBox;
  declare from: DimFrom;
  /** How far it is filled, 0 to 1. */
  declare level: number;
  /** What the lamp gets there: its steps can be larger than those of the finger. */
  declare percent: number;
  declare name: string;
  declare icon: IconName;
  /** The own colour of the section of the tile, or null for that of the dashboard. */
  declare seed: string | null;
  declare mode: Mode;
  /** The finger was lifted: it shrinks back to the tile. */
  declare closing: boolean;

  constructor() {
    super();
    this.box = { left: 0, top: 0, width: 0, height: 0, startLevel: 0, startY: 0 };
    this.from = { left: 0, top: 0, width: 0, height: 0 };
    this.level = 0;
    this.percent = 0;
    this.name = '';
    this.icon = 'lightbulb';
    this.seed = null;
    this.mode = 'light';
    this.closing = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: contents; }
    .scrim { position: fixed; inset: 0; z-index: var(--layer-dimmer); background: var(--dimmer-scrim); pointer-events: none; animation: show var(--motion-effects); }
    .dimmer {
      position: fixed; z-index: var(--layer-dimmer); left: var(--_left); top: var(--_top); width: var(--_width); height: var(--_height); overflow: hidden; pointer-events: none;
      border-radius: var(--dimmer-radius); background: var(--dimmer-bg); box-shadow: var(--shadow-overlay); animation: grow var(--motion-spatial);
    }
    :host([closing]) .scrim { animation: show var(--motion-effects) reverse forwards; }
    :host([closing]) .dimmer { animation: shrink var(--motion-effects) forwards; }
    /* gone at once, instead of standing still until it is taken away */
    @media (prefers-reduced-motion: reduce) { :host([closing]) .scrim, :host([closing]) .dimmer { visibility: hidden; } }
    @keyframes show { from { opacity: 0; } }
    @keyframes grow { from { left: var(--_from-left); top: var(--_from-top); width: var(--_from-width); height: var(--_from-height); border-radius: var(--tile-radius); } }
    @keyframes shrink { to { left: var(--_from-left); top: var(--_from-top); width: var(--_from-width); height: var(--_from-height); border-radius: var(--tile-radius); opacity: 0; } }
    .fill {
      position: absolute; left: 0; right: 0; bottom: 0; height: max(0px, calc(var(--_level) * 100% - var(--slider-gap) - var(--slider-handle-width) / 2)); overflow: hidden;
      border-radius: var(--slider-radius-inner) var(--slider-radius-inner) 0 0; background: var(--dimmer-fill);
    }
    .handle {
      position: absolute; left: var(--space-16); right: var(--space-16); bottom: calc(var(--_level) * 100% - var(--slider-handle-width) / 2); height: var(--slider-handle-width);
      border-radius: var(--slider-handle-width); background: var(--dimmer-fill);
    }
    /* the texts twice: on the track, and in the fill in its own colour, so they can be read at every level */
    .face { position: absolute; left: 0; right: 0; bottom: 0; height: var(--_height); padding: var(--space-20) var(--space-16) var(--space-16); display: flex; flex-direction: column; justify-content: space-between; color: var(--dimmer-fg); }
    .fill .face { color: var(--dimmer-fill-fg); }
    .value { font-size: var(--type-value-size); line-height: var(--type-value-line); font-weight: var(--weight-strong); letter-spacing: var(--tracking-display); }
    .unit { margin-left: var(--space-2); font-size: calc(var(--type-value-size) / 2); font-weight: var(--weight-medium); letter-spacing: 0; }
    .lamp { display: grid; gap: var(--space-6); min-width: 0; font-size: var(--type-label-l-size); line-height: var(--type-label-l-line); font-weight: var(--weight-strong); --icon-size: var(--icon-l); }
    .name { overflow: hidden; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  `];

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('seed') || changed.has('mode')) applySectionTheme(this, this.seed, this.mode);
    const element = this.shadowRoot?.querySelector<HTMLElement>('.dimmer');
    if (!element) return;
    const { box, from } = this;
    for (const [name, value] of Object.entries({
      '--_left': box.left, '--_top': box.top, '--_width': box.width, '--_height': box.height,
      '--_from-left': from.left, '--_from-top': from.top, '--_from-width': from.width, '--_from-height': from.height,
    })) element.style.setProperty(name, pixels(value));
    element.style.setProperty('--_level', String(this.level));
  }

  private face() {
    return html`<div class="face">
      <span class="value">${this.percent}<span class="unit">%</span></span>
      <span class="lamp"><mh-icon name=${this.icon} filled></mh-icon><span class="name">${this.name}</span></span>
    </div>`;
  }

  override render() {
    return html`<div class="scrim"></div>
      <div class="dimmer" aria-hidden="true">${this.face()}<div class="fill">${this.face()}</div><div class="handle"></div></div>`;
  }
}

if (!customElements.get('mh-dimmer')) customElements.define('mh-dimmer', MhDimmer);

declare global {
  interface HTMLElementTagNameMap { 'mh-dimmer': MhDimmer }
}
