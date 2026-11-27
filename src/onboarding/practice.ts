import type { DeviceTileSpec, HouseKind } from '../dashboard/types';
import type { Capability, CapabilityValue, Device, HomeySnapshot } from '../homey/types';
import type { Translate } from '../i18n';
import { createStore } from '../state/store';
import type { UiContext } from '../ui/app/context';

/** What can be practised. */
export type Exercise = 'tap' | 'dim' | 'lock';

/** The ids of the practice: never those of a hub, which are long and have no colon. */
const LAMP = 'practice:lamp';
const LOCK = 'practice:lock';

function cap(id: string, partial: Partial<Capability>): Capability {
  return {
    id, baseId: id, title: id, type: 'boolean', getable: true, setable: true, units: null, min: null, max: null,
    step: null, decimals: null, options: [], titleTrue: null, titleFalse: null, value: null, lastUpdated: null, ...partial,
  };
}

function device(id: string, name: string, deviceClass: string, caps: Capability[]): Device {
  return {
    id, name, zoneId: null, deviceClass, driverId: null, available: true, unavailableMessage: null,
    energy: { cumulative: false, homeBattery: false }, capabilityOrder: caps.map((c) => c.id), capabilities: Object.fromEntries(caps.map((c) => [c.id, c])),
  };
}

/**
 * A hub of the practice: a lamp and a lock that live in the memory of the page. The actions of its context change only
 * them; nothing of it can reach a hub, because it has none. Tells once of each exercise that was done.
 */
export function createPractice(t: Translate, schedule: (flush: () => void) => void) {
  const lampDevice = device(LAMP, t('onboarding.practice.lamp'), 'light', [
    cap('onoff', { value: false }), cap('dim', { type: 'number', min: 0, max: 1, units: '%', decimals: 2, value: 0.6 }),
  ]);
  const lockDevice = device(LOCK, t('onboarding.practice.lockName'), 'lock', [cap('locked', { value: true })]);
  const snapshot: HomeySnapshot = { homeyId: 'practice', softwareVersion: null, scopes: [], devices: { [LAMP]: lampDevice, [LOCK]: lockDevice }, zones: {}, flows: [] };
  const store = createStore(schedule);
  store.load(snapshot);
  const done: Record<Exercise, boolean> = { tap: false, dim: false, lock: false };
  let heard: (exercise: Exercise) => void = () => {};
  let opened: () => void = () => {};
  const did = (exercise: Exercise): void => {
    if (done[exercise]) return;
    done[exercise] = true;
    heard(exercise);
  };
  const set = (deviceId: string, capabilityId: string, value: CapabilityValue): void => {
    if (store.getDevice(deviceId)?.capabilities[capabilityId]) store.apply({ type: 'capability', deviceId, capabilityId, value, at: null });
  };
  const lamp: Extract<DeviceTileSpec, { kind: 'light' }> = { kind: 'light', id: `${LAMP}:light`, deviceId: LAMP, size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' };
  const lock: Extract<DeviceTileSpec, { kind: HouseKind }> = { kind: 'guard', id: `${LOCK}:guard`, deviceId: LOCK, size: 'wide' };
  const ctx: UiContext = {
    store, t, busy: () => null,
    status: () => ({ route: 'local', canControl: true, canStartFlows: false, demo: true }),
    actions: {
      toggle: (spec) => {
        if (spec.deviceId !== LAMP) return;
        set(LAMP, 'onoff', store.getDevice(LAMP)?.capabilities['onoff']?.value !== true);
        did('tap');
      },
      slide: (deviceId, capabilityId, value, final) => {
        if (deviceId !== LAMP || capabilityId !== 'dim') return;
        set(LAMP, 'dim', value);
        // as the hub does: a lamp that is dimmed is on
        set(LAMP, 'onoff', true);
        if (final) did('dim');
      },
      guard: (deviceId, capabilityId, value) => {
        if (deviceId !== LOCK || capabilityId !== 'locked') return;
        set(LOCK, 'locked', value);
        // unlocking is what asks for holding; locking again goes with one tap
        if (value === false) did('lock');
      },
      press: () => {}, setCapability: () => {}, lamps: () => {}, nudge: () => {},
      // there is no window of a device here: it is told what would open
      openDevice: () => opened(),
      startFlow: async () => false,
    },
  };
  return {
    ctx, lamp, lock,
    done: (): Record<Exercise, boolean> => ({ ...done }),
    onDone(listener: (exercise: Exercise) => void): void { heard = listener; },
    /** A tile asked for the window of its device. */
    onOpen(listener: () => void): void { opened = listener; },
  };
}

export type Practice = ReturnType<typeof createPractice>;
