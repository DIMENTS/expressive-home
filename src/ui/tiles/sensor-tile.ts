import { html, nothing, type CSSResultGroup } from 'lit';
import type { DeviceTileSpec } from '../../dashboard/types';
import { DeviceTileElement } from './tile-base';
import { valueStyles, valueTemplate } from './value-styles';

/** The sensor tile: icon, the value large with its unit, the name and, for two tiles of one device, the reading's name. */
export class MhSensorTile extends DeviceTileElement<Extract<DeviceTileSpec, { kind: 'sensor' }>> {
  static override styles: CSSResultGroup = [DeviceTileElement.styles, valueStyles];

  protected override renderHead() {
    const { view } = this;
    return html`<div class="head">
      <span class="icon"><mh-icon name=${view.icon}></mh-icon></span>
      <span class="text">${valueTemplate(view.value)}<span class="name">${view.name}</span>${this.renderState()}</span>
    </div>`;
  }

  protected override renderState() {
    const { view } = this;
    const text = view.stateText || view.subText;
    if (!text && !view.warn) return nothing;
    return html`<span class="state">${view.warn ? html`<mh-icon class="warn" name="battery_alert" filled></mh-icon>` : nothing}<span>${text}</span></span>`;
  }
}

if (!customElements.get('mh-sensor-tile')) customElements.define('mh-sensor-tile', MhSensorTile);
