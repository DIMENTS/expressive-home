import { css, html, nothing, type CSSResultGroup, type PropertyValues } from 'lit';
import type { DeviceTileSpec } from '../../dashboard/types';
import { DeviceTileElement } from './tile-base';
import { valueStyles, valueTemplate } from './value-styles';

/**
 * The tank tile: the percentage large, the name, the content ("58 van 90 liter") and a bar.
 * In compact the level fills the whole tile. The level reaches the styles as --_level through the CSSOM.
 */
export class MhTankTile extends DeviceTileElement<Extract<DeviceTileSpec, { kind: 'tank' }>> {
  static override styles: CSSResultGroup = [DeviceTileElement.styles, valueStyles, css`
    .bar { position: relative; flex: none; height: var(--tank-bar-height); border-radius: var(--shape-full); background: var(--tank-track); overflow: hidden; }
    .bar i { position: absolute; inset: 0 auto 0 0; width: calc(var(--_level) * 1%); border-radius: var(--shape-full); background: var(--tank-fill); }
    :host([density="compact"]) .tile { background: linear-gradient(to right, var(--tank-compact-fill) calc(var(--_level) * 1%), var(--_bg) 0); }
    :host([density="compact"]) .bar { display: none; }
    :host([density="phone"]) .tile { flex-direction: column; align-items: stretch; gap: var(--space-8); }
    :host([density="phone"]) .bar { height: var(--space-8); }
  `];

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.style.setProperty('--_level', String(this.view.level ?? 0));
  }

  protected override renderHead() {
    const { view } = this;
    return html`<div class="head"><span class="text">${valueTemplate(view.value)}<span class="name">${view.name}</span>${this.renderState()}</span></div>`;
  }

  protected override renderState() {
    const { view } = this;
    const text = view.stateText || view.subText;
    if (!text && !view.warn) return nothing;
    return html`<span class="state">${view.warn ? html`<mh-icon class="warn" name="battery_alert" filled></mh-icon>` : nothing}<span>${text}</span></span>`;
  }

  protected override renderExtra() {
    return html`<div class="bar" aria-hidden="true"><i></i></div>`;
  }
}

if (!customElements.get('mh-tank-tile')) customElements.define('mh-tank-tile', MhTankTile);
