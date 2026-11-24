import type { TileSpec } from '../../dashboard/types';
import type { CapabilityValue, Route } from '../../homey/types';
import type { Translate } from '../../i18n/index';
import type { Store } from '../../state/store';

/** What the dashboard needs to know about the connection and the key's rights. */
export interface DashboardStatus { route: Route | null; canControl: boolean; canStartFlows: boolean; demo: boolean;
  /** This device may only use the dashboard, not arrange it; undefined is the same as true. */
  canArrange?: boolean;
  /** The app on the hub served this page: there is no key and no other address. */
  served?: boolean }

/**
 * Every action the interface can ask for. Parts always call them; whether there is a connection or a
 * right to act is decided by the app controller, which then sends or explains why not.
 */
export interface UiActions {
  toggle(spec: Extract<TileSpec, { kind: 'light' | 'switch' }>): void;
  slide(deviceId: string, capabilityId: string, value: number, final: boolean): void;
  press(deviceId: string, capabilityId: string, quiet?: boolean): void;
  setCapability(deviceId: string, capabilityId: string, value: CapabilityValue): void;
  /** A lock, a door or an alarm: after holding, or after the answer to a question. Nothing else leads there. */
  guard(deviceId: string, capabilityId: string, value: CapabilityValue): void;
  /** All these lamps on, or off. */
  lamps(deviceIds: readonly string[], on: boolean): void;
  /** The target of a thermostat so many steps up or down; tapping adds up. */
  nudge(deviceId: string, steps: number): void;
  startFlow(flowId: string, kind: 'flow' | 'advanced'): Promise<boolean>;
  openDevice(deviceId: string): void;
}

/** What every tile and panel gets: the live state, the texts, the actions and the status. */
export interface UiContext {
  store: Store; t: Translate; actions: UiActions; status(): DashboardStatus;
  /** What a lock, a door or an alarm was told and did not answer yet. */
  busy(deviceId: string): { capabilityId: string; value: CapabilityValue } | null;
}
