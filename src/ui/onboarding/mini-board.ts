import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { applyTokens } from '../../theme/engine';
import type { ThemeFile } from '../../theme/look';
import { computeLook, styleOf } from '../../theme/styles';
import type { Mode, ShownDensity } from '../../theme/types';
import type { IconName } from '../icons/icons';
import { sharedStyles } from '../parts/shared-styles';
import { pixels } from '../pixels';
import '../parts/icon';

/** One block of the little dashboard: the hero, a section with so many tiles, or the section with the widgets of today. */
export interface MiniBlock { id: string; kind: 'hero' | 'section' | 'today'; icon: IconName; tiles: number }
export interface MiniColumns { left: MiniBlock[]; right: MiniBlock[] }

/** A section shows at most this many tiles: it is a picture, not a list. */
const MAX_TILES = 4;
/** Which tiles are on: every third, so each section shows both. */
const isOn = (index: number): boolean => index % 3 === 0;

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The little dashboard of the first start: abstract blocks (a hero, sections with an icon and tiles) drawn with the
 * real values of a theme, its colour, light or dark and density, so what is chosen is what is seen. Blocks that change
 * place slide there; while `building` everything arrives one after the other. One picture for a screen reader.
 */
export class MhMiniBoard extends LitElement {
  static override properties = {
    file: { attribute: false },
    seed: { type: String },
    mode: { type: String },
    density: { type: String, reflect: true },
    columns: { attribute: false },
    label: { type: String },
    building: { type: Boolean, reflect: true },
  };

  declare file: ThemeFile | null;
  declare seed: string;
  declare mode: Mode;
  declare density: ShownDensity;
  declare columns: MiniColumns;
  declare label: string;
  declare building: boolean;
  /** Where each block was before the columns changed. */
  private wasAt = new Map<string, DOMRect>();
  private drawn = '';

  constructor() {
    super();
    this.file = null;
    this.seed = '';
    this.mode = 'light';
    this.density = 'comfortable';
    this.columns = { left: [], right: [] };
    this.label = '';
    this.building = false;
  }

  static override styles = [sharedStyles, css`
    :host { display: block; width: 100%; max-width: var(--onboarding-board-max); }
    .screen {
      display: grid; grid-template-columns: 7fr 5fr; gap: var(--space-8); align-items: start; padding: var(--space-10);
      border-radius: var(--mini-board-radius); background: var(--page-bg); color: var(--page-fg); font-family: var(--font-family);
      box-shadow: var(--shadow-overlay); overflow: hidden;
      transition: background-color var(--motion-effects), color var(--motion-effects), border-radius var(--motion-spatial);
    }
    :host([density="phone"]) .screen { grid-template-columns: minmax(0, 1fr); }
    .col { display: grid; gap: var(--space-8); align-content: start; min-width: 0; }
    .block { transition: transform var(--motion-spatial); }
    .block[data-moving] { transform: translate(var(--_dx, 0), var(--_dy, 0)); transition: none; }
    .hero {
      display: grid; align-content: end; gap: var(--space-6); min-height: var(--mini-hero-height); padding: var(--space-10);
      border-radius: var(--section-radius); background: var(--section-hero-bg); color: var(--section-hero-fg);
      box-shadow: inset 0 0 0 var(--section-outline-width) var(--section-outline);
      transition: background-color var(--motion-effects), color var(--motion-effects), border-radius var(--motion-spatial);
    }
    .number { width: 40%; height: var(--mini-tile-compact); border-radius: var(--shape-full); background: currentColor; }
    .line { height: var(--mini-mark-height); border-radius: var(--shape-full); background: color-mix(in srgb, currentColor var(--look-preview-mark), transparent); }
    .section {
      display: grid; gap: var(--space-6); padding: var(--space-8); border-radius: var(--section-radius); background: var(--section-bg); color: var(--section-fg);
      box-shadow: inset 0 0 0 var(--section-outline-width) var(--section-outline);
      transition: background-color var(--motion-effects), color var(--motion-effects), border-radius var(--motion-spatial);
    }
    .head { display: flex; align-items: center; gap: var(--space-6); }
    .head mh-icon { --icon-size: var(--mini-icon-box); color: var(--section-title-icon-fg); }
    .title { width: 45%; height: var(--mini-mark-height); border-radius: var(--shape-full); background: color-mix(in srgb, currentColor var(--look-preview-mark), transparent); }
    .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
    :host([density="compact"]) .tiles { grid-template-columns: repeat(3, 1fr); }
    .tile {
      display: flex; align-items: center; gap: var(--space-4); min-width: 0; height: var(--mini-tile-height); padding: 0 var(--space-6);
      border-radius: var(--tile-radius); background: var(--tile-bg); color: var(--tile-fg); box-shadow: inset 0 0 0 var(--tile-outline-width) var(--tile-outline);
      transition: background-color var(--motion-effects), border-radius var(--motion-spatial), height var(--motion-spatial);
    }
    :host([density="compact"]) .tile { height: var(--mini-tile-compact); }
    .tile.on { background: var(--tile-on-bg); color: var(--tile-on-fg); }
    .tile.wide { grid-column: 1 / -1; }
    .dot { flex: none; width: var(--mini-dot-size); height: var(--mini-dot-size); border-radius: var(--shape-full); background: var(--tile-icon-bg); }
    .on .dot { background: var(--tile-icon-on-bg); clip-path: var(--shape-cookie); }
    .mark { flex: 1; height: var(--mini-mark-height); border-radius: var(--shape-full); background: color-mix(in srgb, currentColor var(--look-preview-mark), transparent); }
    .today mh-icon { --icon-size: var(--mini-icon-box); }
    .arrive { animation: arrive var(--motion-spatial) both; animation-delay: calc(var(--i, 0) * var(--onboarding-stagger)); }
    @keyframes arrive { from { opacity: 0; transform: translateY(var(--onboarding-rise)) scale(var(--onboarding-arrive-scale)); } }
  `];

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.wasAt.clear();
    if (!changed.has('columns') || !this.hasUpdated || reducedMotion()) return;
    for (const block of this.blocks()) this.wasAt.set(block.dataset['block']!, block.getBoundingClientRect());
  }

  protected override updated(changed: PropertyValues<this>): void {
    const screen = this.shadowRoot?.querySelector<HTMLElement>('.screen');
    const key = `${JSON.stringify(this.file)} ${this.seed} ${this.mode} ${this.density}`;
    if (screen && this.file && key !== this.drawn) {
      applyTokens(screen, computeLook(styleOf(this.file), { seed: this.seed, mode: this.mode, density: this.density }, false));
      this.drawn = key;
    }
    if (changed.has('columns')) this.slide();
    if (changed.has('building')) this.number();
  }

  private blocks(): HTMLElement[] {
    return [...(this.shadowRoot?.querySelectorAll<HTMLElement>('[data-block]') ?? [])];
  }

  /** From where it was to where it is: first put back where it was, then let go of it in the next frame. */
  private slide(): void {
    if (this.wasAt.size === 0) return;
    const moving: HTMLElement[] = [];
    for (const block of this.blocks()) {
      const was = this.wasAt.get(block.dataset['block']!);
      if (!was) continue;
      const now = block.getBoundingClientRect();
      const [dx, dy] = [was.left - now.left, was.top - now.top];
      if (dx === 0 && dy === 0) continue;
      block.style.setProperty('--_dx', pixels(dx));
      block.style.setProperty('--_dy', pixels(dy));
      block.setAttribute('data-moving', '');
      moving.push(block);
    }
    this.wasAt.clear();
    if (moving.length === 0) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const block of moving) block.removeAttribute('data-moving'); }));
  }

  /** Every part that arrives gets its place in the row, so it comes after the one before it. */
  private number(): void {
    this.shadowRoot?.querySelectorAll<HTMLElement>('.arrive').forEach((part, index) => part.style.setProperty('--i', String(index)));
  }

  private renderBlock(block: MiniBlock) {
    const arrive = this.building ? 'arrive' : '';
    if (block.kind === 'hero') {
      return html`<div class="block hero ${arrive}" data-block=${block.id}><span class="number"></span><span class="line"></span></div>`;
    }
    const today = block.kind === 'today';
    const count = Math.min(Math.max(block.tiles, today ? 1 : 0), MAX_TILES);
    return html`<div class="block section ${today ? 'today' : ''} ${arrive}" data-block=${block.id}>
      <div class="head"><mh-icon name=${block.icon}></mh-icon><span class="title"></span></div>
      <div class="tiles">${Array.from({ length: count }, (_tile, index) => html`<div class="tile ${today ? 'wide' : ''} ${!today && isOn(index) ? 'on' : ''} ${arrive}">
        ${today ? html`<mh-icon name=${index === 0 ? block.icon : 'bolt'}></mh-icon>` : html`<span class="dot"></span>`}<span class="mark"></span></div>`)}</div>
    </div>`;
  }

  override render() {
    const { left, right } = this.columns;
    const single = this.density === 'phone';
    const column = (side: 'left' | 'right', blocks: MiniBlock[]) => html`<div class="col" data-column=${side}>${repeat(blocks, (block) => block.id, (block) => this.renderBlock(block))}</div>`;
    return html`<div class="screen" role="img" aria-label=${this.label}>
      ${single ? column('left', [...left, ...right]) : html`${column('left', left)}${right.length > 0 ? column('right', right) : nothing}`}
    </div>`;
  }
}

if (!customElements.get('mh-mini-board')) customElements.define('mh-mini-board', MhMiniBoard);

declare global {
  interface HTMLElementTagNameMap { 'mh-mini-board': MhMiniBoard }
}
