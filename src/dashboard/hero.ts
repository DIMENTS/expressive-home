import type { Device, HomeySnapshot } from '../homey/types';
import { findCapability, firstByBaseId, isHomeBattery } from '../recognition/recognize';
import type { CapRef, HeroSpec, HeroStat } from './types';

const byName = (locale: string) => (a: Device, b: Device): number => a.name.localeCompare(b.name, locale);

/** Preference: battery class, then the energy flag, then by name. Needs a state of charge to show. */
function pickBattery(devices: Device[], locale: string): Device | undefined {
  const rank = (d: Device) => (d.deviceClass === 'battery' ? 0 : d.energy.homeBattery ? 1 : 2);
  return devices
    .filter((d) => isHomeBattery(d) && findCapability(d, 'battery.soc') !== undefined)
    .sort((a, b) => rank(a) - rank(b) || byName(locale)(a, b))[0];
}

export function pickHero(snapshot: HomeySnapshot, locale = 'nl'): HeroSpec | null {
  const devices = Object.values(snapshot.devices);
  const battery = pickBattery(devices, locale);
  const panel = devices.find((d) => d.deviceClass === 'solarpanel' && firstByBaseId(d, 'measure_power'));
  const meter = devices.find((d) => d.energy.cumulative && firstByBaseId(d, 'measure_power'));
  const solarPower = panel ? firstByBaseId(panel, 'measure_power') : undefined;
  const meterPower = meter ? firstByBaseId(meter, 'measure_power') : undefined;

  if (battery) {
    const soc = findCapability(battery, 'battery.soc');
    if (soc) {
      const timeToGo = findCapability(battery, 'battery.timeToGo');
      const shoreOwner = findCapability(battery, 'shore.state')
        ? battery
        : devices.filter((d) => d.id !== battery.id && findCapability(d, 'shore.state')).sort(byName(locale))[0];
      const shore = shoreOwner ? findCapability(shoreOwner, 'shore.state') : undefined;
      // Without a cumulative meter, a separate shore device (such as a charger) also supplies the consumption.
      let consumption = meter && meterPower ? { device: meter, cap: meterPower } : undefined;
      if (!consumption && shoreOwner && shoreOwner.id !== battery.id && shoreOwner.id !== panel?.id) {
        const power = shoreOwner.capabilityOrder.map((id) => shoreOwner.capabilities[id]).filter((c) => c?.baseId === 'measure_power');
        const best = power.find((c) => c?.id === 'measure_power') ?? power[0];
        if (best) consumption = { device: shoreOwner, cap: best };
      }
      const stats: HeroStat[] = [];
      if (panel && solarPower) stats.push({ role: 'solar', ref: { deviceId: panel.id, capabilityId: solarPower.id } });
      if (consumption) stats.push({ role: 'consumption', ref: { deviceId: consumption.device.id, capabilityId: consumption.cap.id } });
      if (shore && shoreOwner) stats.push({ role: 'shore', ref: { deviceId: shoreOwner.id, capabilityId: shore.id } });
      if (panel && solarPower && consumption) stats.push({ role: 'net' });
      return {
        kind: 'battery',
        deviceIds: panel && solarPower ? [battery.id, panel.id] : [battery.id],
        primary: { deviceId: battery.id, capabilityId: soc.id },
        timeToGo: timeToGo ? { deviceId: battery.id, capabilityId: timeToGo.id } : null,
        stats,
      };
    }
  }
  if (panel && solarPower) {
    return { kind: 'solar', deviceIds: [panel.id], primary: { deviceId: panel.id, capabilityId: solarPower.id }, timeToGo: null, stats: [] };
  }
  if (meter && meterPower) {
    return { kind: 'consumption', deviceIds: [], primary: { deviceId: meter.id, capabilityId: meterPower.id }, timeToGo: null, stats: [] };
  }
  return null;
}

/** Every device the hero reads a value from, once: also the ones that keep their own tile, such as the device behind consumption. */
export function heroDeviceIds(hero: HeroSpec): string[] {
  const ids = new Set<string>([...hero.deviceIds, hero.primary.deviceId]);
  if (hero.timeToGo) ids.add(hero.timeToGo.deviceId);
  for (const stat of hero.stats) if (stat.role !== 'net') ids.add(stat.ref.deviceId);
  if (hero.line) ids.add(hero.line.deviceId);
  if (hero.net) for (const ref of [hero.net.solar, hero.net.consumption]) ids.add(ref.deviceId);
  return [...ids];
}

/** The solar and consumption readings the automatic hero of this hub finds, or null when it lacks one. */
export function netSources(hero: HeroSpec | null): { solar: CapRef; consumption: CapRef } | null {
  const of = (role: 'solar' | 'consumption'): CapRef | undefined => hero?.stats.flatMap((stat) => (stat.role === role ? [stat.ref] : []))[0];
  const solar = of('solar');
  const consumption = of('consumption');
  return solar && consumption ? { solar, consumption } : null;
}
