import { isDangerous } from '../../controls/danger';
import { applianceOf, KEEP_ON_CLASSES } from '../../controls/appliance';
import { carOf } from '../../controls/car';
import { chargerOf } from '../../controls/charger';
import { guardOf, guardState, guardValue, type Guard, type GuardState } from '../../controls/guard';
import type { CapabilityValue, Device } from '../../homey/types';
import type { MessageKey, Translate } from '../../i18n/index';
import type { IconName } from '../icons/icons';

/** One thing a lock, a door or an alarm can be told. */
export interface GuardCommand {
  to: GuardState; capabilityId: string; value: CapabilityValue;
  /** Never with one tap. */
  guarded: boolean;
  /** It is there already. */
  current: boolean;
  icon: IconName; text: string; short: string; label: string;
}

const OTHER: Partial<Record<GuardState, GuardState>> = { locked: 'unlocked', unlocked: 'locked', closed: 'open', open: 'closed' };
const WORDS: Record<GuardState, { icon: IconName; text: MessageKey; hold: MessageKey | null; label: MessageKey; ask: MessageKey }> = {
  unlocked: { icon: 'lock_open', text: 'guard.unlock', hold: 'guard.hold.unlock', label: 'guard.label.unlock', ask: 'guard.ask.unlock' },
  locked: { icon: 'lock', text: 'guard.lock', hold: 'guard.hold.lock', label: 'guard.label.lock', ask: 'guard.ask.lock' },
  open: { icon: 'garage_home', text: 'guard.open', hold: 'guard.hold.open', label: 'guard.label.open', ask: 'guard.ask.open' },
  closed: { icon: 'garage_home', text: 'guard.close', hold: 'guard.hold.close', label: 'guard.label.close', ask: 'guard.ask.close' },
  disarmed: { icon: 'shield', text: 'guard.alarm.off', hold: null, label: 'guard.label.disarm', ask: 'guard.ask.disarm' },
  partially_armed: { icon: 'shield', text: 'guard.alarm.partly', hold: null, label: 'guard.label.partly', ask: 'guard.ask.partly' },
  armed: { icon: 'shield', text: 'guard.alarm.on', hold: null, label: 'guard.label.arm', ask: 'guard.ask.arm' },
};
const ALARM: readonly GuardState[] = ['disarmed', 'partially_armed', 'armed'];

/** The lock of a car: a lock like any other, but of something that is mainly something else. */
export function carLock(device: Device): Guard | null {
  const lock = carOf(device)?.lock ?? null;
  return lock ? { kind: 'lock', cap: lock, canSet: lock.setable } : null;
}

/** What it can be told now: a lock the other way than it is, an alarm everything it knows. */
export function guardCommands(device: Device, t: Translate, guard: Guard | null = guardOf(device)): GuardCommand[] {
  if (!guard?.canSet) return [];
  const said = guardState(guard);
  const { cap } = guard;
  const states: readonly GuardState[] = guard.kind === 'alarm' ? ALARM.filter((state) => cap.options.length === 0 || cap.options.some((option) => option.id === state))
    : said !== null ? [OTHER[said]!]
      : guard.kind === 'lock' ? ['unlocked', 'locked'] : ['open', 'closed'];
  return states.map((to) => {
    const value = guardValue(guard, to);
    const guarded = isDangerous(device, cap.id, value);
    const words = WORDS[to];
    const short = t(words.text);
    return {
      to, capabilityId: cap.id, value, guarded, current: to === said, icon: words.icon,
      text: guarded && words.hold ? t(words.hold) : short, short: guarded && words.hold ? short : '', label: t(words.label, { name: device.name }),
    };
  });
}

/** What is asked before something dangerous is done. */
export interface DangerQuestion { heading: string; text: string; ok: string }

export function dangerQuestion(device: Device, capabilityId: string, value: CapabilityValue, t: Translate): DangerQuestion {
  const guard = guardOf(device) ?? carLock(device);
  const baseId = device.capabilities[capabilityId]?.baseId;
  const switchedOff = value === false && (baseId === 'onoff' || baseId === 'evcharger_charging');
  if (switchedOff && chargerOf(device)) return { heading: t('charger.ask.stop', { name: device.name }), text: t('charger.ask.stopText'), ok: t('charger.stop') };
  if (switchedOff && baseId === 'onoff' && (KEEP_ON_CLASSES.includes(device.deviceClass) || applianceOf(device) !== null)) return { heading: t('appliance.ask.off', { name: device.name }), text: t('appliance.ask.offText'), ok: t('appliance.off') };
  const states: readonly GuardState[] = guard?.kind === 'alarm' ? ALARM : guard?.kind === 'lock' ? ['unlocked', 'locked'] : ['open', 'closed'];
  const to = guard?.cap.id === capabilityId ? states.find((state) => guardValue(guard, state) === value) : undefined;
  if (to) return { heading: t(WORDS[to].ask, { name: device.name }), text: t('guard.ask.text'), ok: t(WORDS[to].text) };
  const cap = device.capabilities[capabilityId];
  const option = cap?.options.find((o) => o.id === value)?.title ?? (typeof value === 'boolean' || value === null ? undefined : String(value));
  const title = cap?.title ?? capabilityId;
  return { heading: t('guard.ask.other', { name: device.name }), text: option ? t('guard.ask.otherTo', { title, value: option }) : t('guard.ask.otherText', { title }), ok: t('guard.ask.go') };
}
