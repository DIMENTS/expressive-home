export type Route = 'local' | 'cloud';
export type CapabilityValue = boolean | number | string | null;
export type CapabilityType = 'boolean' | 'number' | 'string' | 'enum';
export interface Capability {
  id: string; baseId: string; title: string; type: CapabilityType;
  getable: boolean; setable: boolean;
  units: string | null; min: number | null; max: number | null; step: number | null; decimals: number | null;
  options: { id: string; title: string }[];
  /** The texts the hub gives for the two states of a yes/no capability, when it gives them. */
  titleTrue: string | null; titleFalse: string | null;
  value: CapabilityValue; lastUpdated: string | null;
}
export interface Device {
  id: string; name: string; zoneId: string | null; deviceClass: string; driverId: string | null;
  available: boolean; unavailableMessage: string | null;
  capabilityOrder: string[]; capabilities: Record<string, Capability>;
  energy: { cumulative: boolean; homeBattery: boolean };
}
/** `icon` and `order` as the hub tells them, when it does. */
export interface Zone { id: string; name: string; parentId: string | null; icon?: string; order?: number }
/** `buttons` are the names on the flow card of the app that the flow begins with, and `off` that it is switched off; only with such a card. */
export interface Flow { id: string; name: string; kind: 'flow' | 'advanced'; startable: boolean; buttons?: string[]; off?: true }
/** How the app on the hub can start flows that are no buttons: not, with a key that the hub refuses, or it can. */
export type FlowAccess = 'none' | 'refused' | 'works';
export interface HomeySnapshot {
  homeyId: string; softwareVersion: string | null; scopes: string[];
  /** Only of the app on the hub. */
  flowAccess?: FlowAccess;
  devices: Record<string, Device>; zones: Record<string, Zone>; flows: Flow[];
}
/** Raw Web API payloads, as saved by the snapshot page and used by the mock. */
export interface RawHomey {
  homeyId: string; softwareVersion: string | null; scopes: string[];
  devices: Record<string, unknown>; zones: Record<string, unknown>;
  flows: Record<string, unknown>; advancedFlows: Record<string, unknown>;
}
