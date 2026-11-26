import { css, html, nothing, type CSSResultGroup, type PropertyValues } from 'lit';
import { applianceOf, applianceState } from '../../controls/appliance';
import { carOf, carState } from '../../controls/car';
import { chargerOf, chargerState } from '../../controls/charger';
import { fanOf, fanState } from '../../controls/fan';
import { vacuumCommands, vacuumOf, vacuumState } from '../../controls/vacuum';
import type { DeviceTileSpec, HouseKind } from '../../dashboard/types';
import type { Device } from '../../homey/types';
import { formatKwh } from '../../widgets/energy';
import { carLock, guardCommands } from '../model/guard-view';
import { applianceCommand, chargerCommand } from '../model/held-view';
import { controlButton, controlButtonIf } from './control-styles';
import { ControlTileElement } from './control-tile';
import { heldButton, meter, meterStyles } from './held';

type HouseSpec = Extract<DeviceTileSpec, { kind: HouseKind }>;

/** A tile with a bar: how far it is reaches the styles as --_level through the CSSOM. */
abstract class MeterTileElement extends ControlTileElement<HouseSpec> {
  static override styles: CSSResultGroup = [ControlTileElement.styles, meterStyles, css`
    .controls .session { flex: none; font-size: var(--type-label-m-size); line-height: var(--type-label-m-line); color: var(--_state); white-space: nowrap; }
    :host([density="compact"]) .controls .meter { display: none; }
  `];

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.style.setProperty('--_level', String(this.view.level ?? 0));
  }
}

/** A fan or an air purifier: on or off and how fast; wide with on and off, swinging and the speed. */
export class MhFanTile extends ControlTileElement<HouseSpec> {
  protected override renderControls(device: Device) {
    const fan = fanOf(device);
    if (!fan) return nothing;
    const { t } = this.ctx;
    const { on, speed, oscillating } = fanState(fan);
    const name = { name: device.name };
    return html`<div class="line">
      ${controlButtonIf(fan.onoff, () => ({ icon: 'power_settings_new', label: t('fan.label.power', name), run: () => this.command(fan.onoff!.id, on !== true), main: on === true }))}
      ${controlButtonIf(fan.oscillating, () => ({ icon: 'swap_horiz', label: t('fan.label.swing', name), run: () => this.command(fan.oscillating!.id, oscillating !== true), pressed: oscillating === true }))}
      ${fan.speed ? this.renderSlider({ cap: fan.speed, fraction: speed ?? 0, label: t('fan.label.speed', name), valueText: speed === null ? '' : `${Math.round(speed * 100)}%`, dimmed: on === false }) : nothing}
    </div>`;
  }
}

/** A robot vacuum cleaner: what it does and its battery; wide with start or pause and back to the dock. */
export class MhVacuumTile extends ControlTileElement<HouseSpec> {
  protected override renderControls(device: Device) {
    const vacuum = vacuumOf(device);
    if (!vacuum) return nothing;
    const { t } = this.ctx;
    const { go, pause, dock } = vacuumCommands(vacuum);
    const { stand } = vacuumState(vacuum);
    const cleaning = stand === 'cleaning' || stand === 'spot_cleaning';
    const first = cleaning ? pause : go;
    const name = { name: device.name };
    if (!first && !dock) return nothing;
    return html`<div class="line">
      ${controlButtonIf(first, () => ({ icon: cleaning ? 'pause' : 'play_arrow', label: t(cleaning ? 'vacuum.label.pause' : 'vacuum.label.go', name), run: () => this.command(first!.capabilityId, first!.value), main: true, filled: true }))}
      ${controlButtonIf(dock, () => ({ icon: 'home_pin', label: t('vacuum.label.dock', name), run: () => this.command(dock!.capabilityId, dock!.value), dim: stand === 'docked' || stand === 'charging' }))}
    </div>`;
  }
}

/** White goods: whether they run and how long still; wide with how far, and switched off only by holding. */
export class MhApplianceTile extends MeterTileElement {
  protected override renderControls(device: Device) {
    const appliance = applianceOf(device);
    if (!appliance) return nothing;
    const command = applianceCommand(device, this.ctx.t);
    const { progress } = applianceState(appliance);
    if (!command && progress === null) return nothing;
    return html`<div class="line">${progress !== null ? meter() : nothing}${command ? heldButton(this, this.ctx, device, command) : nothing}</div>`;
  }
}

/** A charge point: whether it charges and how hard; wide with charging or stopping, which is held. */
export class MhChargerTile extends MeterTileElement {
  protected override renderControls(device: Device) {
    const charger = chargerOf(device);
    if (!charger) return nothing;
    const { t } = this.ctx;
    const command = chargerCommand(device, t);
    const { session } = chargerState(charger);
    if (!command && session === null) return nothing;
    return html`<div class="line">${command ? heldButton(this, this.ctx, device, command) : nothing}
      ${session !== null && this.density !== 'compact' ? html`<span class="session">${t('charger.session', { n: formatKwh(session, t) })}</span>` : nothing}</div>`;
  }
}

/** A car: its battery and how far it goes; wide with the battery as a bar, and unlocked only by holding. */
export class MhCarTile extends MeterTileElement {
  protected override renderControls(device: Device) {
    const car = carOf(device);
    if (!car) return nothing;
    const commands = guardCommands(device, this.ctx.t, carLock(device));
    const { battery } = carState(car);
    if (battery === null && commands.length === 0) return nothing;
    return html`<div class="line">${battery !== null ? meter() : nothing}${commands.map((command) => heldButton(this, this.ctx, device, { ...command, main: !command.guarded }))}</div>`;
  }
}

for (const [tag, element] of [['mh-fan-tile', MhFanTile], ['mh-vacuum-tile', MhVacuumTile], ['mh-appliance-tile', MhApplianceTile], ['mh-charger-tile', MhChargerTile], ['mh-car-tile', MhCarTile]] as const) {
  if (!customElements.get(tag)) customElements.define(tag, element);
}
