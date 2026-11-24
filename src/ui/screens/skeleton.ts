import { LitElement, css, html } from 'lit';
import { COLUMNS_MIN_PX, TILE_GRID_WIDE_MIN_PX } from '../breakpoints';
import { sharedStyles } from '../parts/shared-styles';

/** The layout while loading: hero and sections as empty areas with pulsing tiles, in the dashboard's columns. */
export class MhSkeleton extends LitElement {
  static override styles = [sharedStyles, css`
    :host { display: block; }
    .cols { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: var(--section-gap); align-items: start; }
    @media (width < ${COLUMNS_MIN_PX}px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    .col { display: grid; gap: var(--section-gap); min-width: 0; }
    section { container-type: inline-size; background: var(--section-bg); border-radius: var(--section-radius); padding: var(--section-pad); }
    section.hero { background: var(--section-hero-bg); color: var(--section-hero-fg); }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--tile-gap); }
    @container (width < ${TILE_GRID_WIDE_MIN_PX}px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .block { border-radius: var(--tile-radius); background: var(--skeleton-bg); min-height: var(--tile-height); animation: pulse var(--motion-pulse) var(--easing-pulse) infinite; }
    .block.wide { grid-column: span 2; }
    .block.text { min-height: 0; height: var(--skeleton-text-height); width: 40%; border-radius: var(--shape-sm); margin-bottom: var(--section-title-gap); }
    .hero .block { background: var(--hero-stat-bg); }
    .hero .block.big { min-height: var(--skeleton-hero-height); }
    @keyframes pulse { 50% { opacity: var(--skeleton-pulse-opacity); } }
  `];

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('aria-hidden', 'true');
  }

  private section(count: number, wide: boolean) {
    return html`<section><div class="block text"></div><div class="tiles">${Array.from({ length: count }, () => html`<div class="block ${wide ? 'wide' : ''}"></div>`)}</div></section>`;
  }

  override render() {
    return html`<div class="cols">
      <div class="col"><section class="hero"><div class="block text"></div><div class="block big"></div></section>${this.section(4, true)}${this.section(4, false)}</div>
      <div class="col">${this.section(2, false)}${this.section(2, false)}${this.section(2, false)}</div>
    </div>`;
  }
}

if (!customElements.get('mh-skeleton')) customElements.define('mh-skeleton', MhSkeleton);

declare global {
  interface HTMLElementTagNameMap { 'mh-skeleton': MhSkeleton }
}
