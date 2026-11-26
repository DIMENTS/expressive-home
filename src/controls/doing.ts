import type { Device } from '../homey/types';
import { applianceOf, applianceState } from './appliance';
import { carOf, carState } from './car';
import { chargerOf, chargerState } from './charger';
import { vacuumOf, vacuumState } from './vacuum';

/** White goods that run, or a vacuum cleaner that cleans. A plug does not say whether it runs. */
export function isBusy(device: Device): boolean {
  const appliance = applianceOf(device);
  if (appliance) return applianceState(appliance).stand === 'running';
  const vacuum = vacuumOf(device);
  const stand = vacuum ? vacuumState(vacuum).stand : null;
  return stand === 'cleaning' || stand === 'spot_cleaning';
}

/** A charge point or a car that charges. */
export function isCharging(device: Device): boolean {
  const charger = chargerOf(device);
  if (charger) return chargerState(charger).charging === true;
  const car = carOf(device);
  return car !== null && carState(car).charging === true;
}

/** Whether a car says it is unlocked. */
export const carUnlocked = (device: Device): boolean => { const car = carOf(device); return car !== null && carState(car).locked === false; };
