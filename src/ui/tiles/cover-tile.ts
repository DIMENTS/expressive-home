import { html, nothing, type PropertyValues } from 'lit';
import { coverCommands, coverOf, coverState, type CoverCommand } from '../../controls/cover';
import type { DeviceTileSpec, HouseKind } from '../../dashboard/types';
import type { Device } from '../../homey/types';
import { coverNames, coverText, coverWait } from '../model/cover-view';
import { controlButton, controlButtonIf } from './control-styles';
import { ControlTileElement } from './control-tile';

/** A curtain, a blind or an awning: how far it is open; wide with up, stop and down, and where it can be put. */
export class MhCoverTile extends ControlTileElement<Extract<DeviceTileSpec, { kind: HouseKind }>> {
  private arrives: ReturnType<typeof setTimeout> | null = null;

  /** It can be there without saying so. */
  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.stopWaiting();
    const wait = coverWait(this.ctx.store.getDevice(this.spec.deviceId));
    if (wait !== null) this.arrives = setTimeout(() => this.requestUpdate(), wait);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopWaiting();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.hasUpdated) this.requestUpdate();
  }

  private stopWaiting(): void {
    if (this.arrives !== null) clearTimeout(this.arrives);
    this.arrives = null;
  }

  protected override renderControls(device: Device) {
    const cover = coverOf(device);
    if (!cover) return nothing;
    const { t } = this.ctx;
    const { part } = coverState(cover);
    const names = coverNames(device, cover, t);
    const { up, stop, down } = coverCommands(cover);
    const run = ({ capabilityId, value }: CoverCommand) => () => this.command(capabilityId, value);
    // what is at its end already: still there for who wants to be sure
    const [atUp, atDown] = cover.awning ? [part === 0, part === 1] : [part === 1, part === 0];
    const known = cover.set !== null;
    return html`<div class="line">
      ${controlButton({ icon: 'keyboard_arrow_up', label: names.up, run: run(up), dim: known && atUp })}
      ${controlButtonIf(stop, () => ({ icon: 'stop', label: names.stop, run: run(stop!), filled: true }))}
      ${controlButton({ icon: 'keyboard_arrow_down', label: names.down, run: run(down), dim: known && atDown })}
      ${cover.set ? this.renderSlider({ cap: cover.set, fraction: part ?? 0, label: names.position, valueText: coverText(part, cover.awning, t), dimmed: !part, turned: cover.awning }) : nothing}
    </div>`;
  }
}

if (!customElements.get('mh-cover-tile')) customElements.define('mh-cover-tile', MhCoverTile);
