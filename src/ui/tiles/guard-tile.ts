import { html, nothing } from 'lit';
import type { DeviceTileSpec, HouseKind } from '../../dashboard/types';
import type { Device } from '../../homey/types';
import { guardCommands, type GuardCommand } from '../model/guard-view';
import { askDanger } from '../parts/ask-danger';
import { ControlTileElement } from './control-tile';
import '../parts/hold-button';

/** A lock, a garage door or an alarm: where it is; wide with what it can be told. Nothing dangerous goes with one tap. */
export class MhGuardTile extends ControlTileElement<Extract<DeviceTileSpec, { kind: HouseKind }>> {
  private go({ capabilityId, value, current }: GuardCommand): void {
    if (!current) this.ctx.actions.guard(this.spec.deviceId, capabilityId, value);
  }

  protected override renderControls(device: Device) {
    const commands = guardCommands(device, this.ctx.t);
    if (commands.length === 0) return nothing;
    const busy = this.ctx.busy(device.id) !== null;
    const many = commands.length > 2;
    return html`<div class="line ${many ? 'joined' : ''}">${commands.map((command) => html`<mh-hold-button text=${command.text} short=${command.short} label=${command.label}
      icon=${many ? '' : command.icon} ?guarded=${command.guarded} ?busy=${busy} ?main=${many ? command.current : !command.guarded} pressed=${many ? String(command.current) : nothing}
      @go=${(event: Event) => { event.stopPropagation(); this.go(command); }}
      @ask=${(event: Event) => { event.stopPropagation(); askDanger(this, this.ctx, device.id, command.capabilityId, command.value); }}></mh-hold-button>`)}</div>`;
  }
}

if (!customElements.get('mh-guard-tile')) customElements.define('mh-guard-tile', MhGuardTile);
