import { applianceOf } from '../../controls/appliance';
import { chargerCommands, chargerOf, chargerState } from '../../controls/charger';
import { isDangerous } from '../../controls/danger';
import { yesNo } from '../../controls/find';
import type { CapabilityValue, Device } from '../../homey/types';
import type { Translate } from '../../i18n/index';
import type { IconName } from '../icons/icons';

/** One thing that is held to be done when it cannot be undone, and tapped when it can. */
export interface HeldCommand { capabilityId: string; value: CapabilityValue; guarded: boolean; icon: IconName; text: string; short: string; label: string; main: boolean }

/** Switching white goods on, or holding to switch them off. */
export function applianceCommand(device: Device, t: Translate): HeldCommand | null {
  const onoff = applianceOf(device)?.onoff;
  if (!onoff?.setable) return null;
  const on = yesNo(onoff) === true;
  const guarded = isDangerous(device, onoff.id, !on);
  return {
    capabilityId: onoff.id, value: !on, guarded, icon: 'power_settings_new', main: !on,
    text: guarded ? t('appliance.hold.off') : t(on ? 'appliance.off' : 'appliance.on'), short: guarded ? t('appliance.off') : '',
    label: t(on ? 'appliance.label.off' : 'appliance.label.on', { name: device.name }),
  };
}

/** Charging with one tap, or holding to stop it. */
export function chargerCommand(device: Device, t: Translate): HeldCommand | null {
  const charger = chargerOf(device);
  if (!charger) return null;
  const { charging, stand } = chargerState(charger);
  const { start, stop } = chargerCommands(charger);
  // without a car there is nothing to charge
  const command = charging ? stop : stand === 'plugged_out' ? null : start;
  if (!command) return null;
  const guarded = isDangerous(device, command.capabilityId, command.value);
  return {
    ...command, guarded, icon: charging ? 'stop' : 'bolt', main: !charging,
    text: guarded ? t('charger.hold.stop') : t(charging ? 'charger.stop' : 'charger.start'), short: guarded ? t('charger.stop') : '',
    label: t(charging ? 'charger.label.stop' : 'charger.label.start', { name: device.name }),
  };
}
