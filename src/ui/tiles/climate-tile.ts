import { html, nothing } from 'lit';
import { climateOf, climateState } from '../../controls/climate';
import type { DeviceTileSpec, HouseKind } from '../../dashboard/types';
import type { Device } from '../../homey/types';
import { targetView } from '../model/climate-view';
import { ControlTileElement } from './control-tile';
import '../parts/stepper';

/** Heating and cooling: what it measures and where it goes; wide with − and +. */
export class MhClimateTile extends ControlTileElement<Extract<DeviceTileSpec, { kind: HouseKind }>> {
  protected override renderControls(device: Device) {
    const climate = climateOf(device);
    if (!climate) return nothing;
    const { value, unit, spoken, less, more, atLeast, atMost } = targetView(device, climate.target, climateState(climate).target, this.ctx.t);
    return html`<div class="line"><mh-stepper value=${value} unit=${unit} spoken=${spoken} less=${less} more=${more} ?atLeast=${atLeast} ?atMost=${atMost}
      @step=${(event: CustomEvent<{ steps: number }>) => { event.stopPropagation(); this.ctx.actions.nudge(device.id, event.detail.steps); }}></mh-stepper></div>`;
  }
}

if (!customElements.get('mh-climate-tile')) customElements.define('mh-climate-tile', MhClimateTile);
