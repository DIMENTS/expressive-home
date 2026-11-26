import type { AppWidgetRow } from '../../widgets/app-widget-link';
import type { WidgetFile } from '../../widgets/widget-file';
import type { TileSpec } from '../../dashboard/types';
import type { CapabilityValue, Route } from '../../homey/types';
import type { Translate } from '../../i18n/index';
import type { Store } from '../../state/store';
import type { HistoryAccess } from './history';
import type { LiveHandle, LiveListener } from '../../widgets/app-live';
import type { ReadSource } from '../../widgets/live-reads';
import type { Weather } from '../../widgets/weather';
import type { EnergyPeriod, EnergyReport } from '../../widgets/energy';

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

/** A dashboard a widget can lead to. */
export interface BoardChoice { id: string; name: string; icon: string }

/** What widgets need of the app around them; absent where there are no widgets (the gallery, a test). */
export interface WidgetContext {
  /** The dashboards there are, and the screen with the rooms when it is shown. */
  boards(): BoardChoice[];
  openBoard(id: string): void;
  /** The own widgets of the open house. */
  own?(): WidgetFile[];
  /** The widgets of other apps on the hub, through the app on the hub (a trial); absent without it. */
  apps?(): Promise<{ state: string; widgets: { ref: string; name: Partial<Record<'en' | 'nl', string>>; app: string }[] }>;
  /** What the list of the hub says of one widget of an app: its settings, devices and texts. */
  appRow?(ref: string): Promise<AppWidgetRow | undefined>;
  /** A request of such a widget to its own back end; null when it is refused. */
  appApi?(ref: string, method: string, path: string, body: unknown): Promise<{ status: number; body: unknown } | null>;
  /** The weather of the hub, shared by every tile and the rest screen. */
  weather?: ReadSource<Weather>;
  /** A period of Homey Energy, shared likewise. */
  energy?(period: EnergyPeriod): ReadSource<EnergyReport>;
  /** The live news of the app of such a widget; absent where there is none. */
  live?(ref: string, listener: LiveListener): LiveHandle;
  /** The page was opened with #veilig: own widgets stay off. */
  safe?(): boolean;
  /** The question of the dashboard for something dangerous a widget wants; true when it was answered yes. */
  ask?(deviceId: string, capabilityId: string, value: CapabilityValue, widgetName: string): Promise<boolean>;
}

/** What every tile and panel gets: the live state, the texts, the actions and the status. */
export interface UiContext {
  widgets?: WidgetContext;
  store: Store; t: Translate; actions: UiActions; status(): DashboardStatus;
  /** What a lock, a door or an alarm was told and did not answer yet. */
  busy(deviceId: string): { capabilityId: string; value: CapabilityValue } | null;
  /** History of the hub; without it there are no charts. */
  history?: HistoryAccess;
}
