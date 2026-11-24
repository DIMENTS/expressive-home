import { css, html, nothing, type CSSResultGroup } from 'lit';
import type { DeviceTileSpec } from '../../dashboard/types';
import { DeviceTileElement } from './tile-base';

/** The wide multi-value tile: icon beside name and status, then three cells with value and label; in compact the values sit on the right. */
export class MhMultiTile extends DeviceTileElement<Extract<DeviceTileSpec, { kind: 'multi' }>> {
  static override styles: CSSResultGroup = [DeviceTileElement.styles, css`
    .cells { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-8); }
    .cell {
      display: grid; align-content: start; gap: var(--space-2); min-width: 0; padding: var(--space-10) var(--space-12);
      border-radius: var(--tile-cell-radius); background: var(--tile-cell-bg);
    }
    b { --_size: var(--tile-value-small); font-size: var(--_size); line-height: var(--type-value-line); font-weight: var(--weight-strong); overflow-wrap: anywhere; }
    /* a unit that does not fit beside its value goes under it */
    b .unit { display: inline-block; font-size: calc(var(--_size) * .62); font-weight: var(--weight-medium); margin-left: var(--space-2); }
    .label {
      font-size: var(--type-label-s-size); line-height: var(--type-label-s-line); font-weight: var(--weight-regular); color: var(--_state);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* in a row: the values whole, then what they are called and the name, as far as there is room */
    :host([density="compact"][wide]) .face { flex: 1 1 var(--tile-wide-face-basis); min-width: var(--tile-icon-box); overflow: hidden; }
    :host([density="compact"]) .cells { display: flex; gap: var(--space-16); margin-left: auto; min-width: min-content; }
    :host([density="compact"]) .cell { min-width: min-content; padding: 0; background: none; text-align: right; }
    :host([density="compact"]) b { --_size: var(--type-label-l-size); white-space: nowrap; }
    :host([density="compact"]) .label { white-space: normal; word-break: break-all; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; }
    /* the cells under the name: beside it there is no room for what they are called */
    :host([density="phone"]) .tile { flex-direction: column; align-items: stretch; gap: var(--space-8); }
    :host([density="phone"]) .face { flex: 0 0 auto; }
    :host([density="phone"]) .cells { gap: var(--space-6); }
    :host([density="phone"]) .cell { padding: var(--space-6) var(--space-8); align-content: start; }
    :host([density="phone"]) b { --_size: var(--type-label-l-size); line-height: var(--type-label-l-line); white-space: normal; }
    :host([density="phone"]) b .unit { display: inline-block; }
    :host([density="phone"]) .label { white-space: normal; overflow-wrap: anywhere; hyphens: auto; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  `];

  protected override renderExtra() {
    return html`<div class="cells" aria-hidden="true">${this.view.cells.map((cell) => html`<div class="cell">
      <b>${cell.value.text}${cell.value.unit ? html`<span class="unit">${cell.value.unit}</span>` : nothing}</b><span class="label">${cell.label}</span>
    </div>`)}</div>`;
  }
}

if (!customElements.get('mh-multi-tile')) customElements.define('mh-multi-tile', MhMultiTile);
