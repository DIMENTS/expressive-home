// A tiny invented hub for the gallery: a few devices in every tile state, with actions that change the
// store directly, so tiles can be clicked and dragged without a Homey. Only for development.
import { clampTarget, climateOf, targetStep } from '../../controls/climate';
import type { TileSpec } from '../../dashboard/types';
import type { Capability, CapabilityValue, Device, HomeySnapshot } from '../../homey/types';
import { houseKind } from '../../dashboard/classify';
import { toSnapshot } from '../../homey/map';
import { houseRaw } from '../../mock/house';
import { t } from '../../i18n';
import { createStore } from '../../state/store';
import type { DashboardStatus, UiContext } from '../app/context';

function cap(id: string, partial: Partial<Capability>): Capability {
  return {
    id, baseId: id.split('.')[0]!, title: id, type: 'number', getable: true, setable: false, units: null, min: null, max: null,
    step: null, decimals: null, options: [], titleTrue: null, titleFalse: null, value: null, lastUpdated: null, ...partial,
  };
}

function device(id: string, name: string, deviceClass: string, caps: Capability[], extra: Partial<Device> = {}): Device {
  return {
    id, name, zoneId: null, deviceClass, driverId: null, available: true, unavailableMessage: null,
    energy: { cumulative: false, homeBattery: false }, capabilityOrder: caps.map((c) => c.id),
    capabilities: Object.fromEntries(caps.map((c) => [c.id, c])), ...extra,
  };
}

const lamp = (id: string, name: string, on: boolean, dim: number, extra: Partial<Device> = {}) => device(id, name, 'light', [
  cap('onoff', { type: 'boolean', setable: true, value: on }), cap('dim', { setable: true, min: 0, max: 1, units: '%', decimals: 2, value: dim }),
], extra);
const plug = (id: string, name: string, on: boolean, power: number | null) => device(id, name, 'socket', [
  cap('onoff', { type: 'boolean', setable: true, value: on }), ...(power === null ? [] : [cap('measure_power', { units: 'W', decimals: 2, value: power })]),
]);

/** The devices of the example house that have a tile with buttons. */
const HOUSE: Device[] = Object.values(toSnapshot(houseRaw('nl')).devices).filter((d) => houseKind(d) !== null);

export const GALLERY_DEVICES: Device[] = [
  ...HOUSE,
  lamp('plafond', 'Plafond', true, 0.8), lamp('badkamer', 'Badkamer', false, 1),
  lamp('spot', 'Spot', false, 0.5, { available: false, unavailableMessage: 'Apparaat is offline' }),
  plug('koelkast', 'Koelkast', true, 45.37), plug('koffie', 'Koffiezetter', false, null), plug('boiler', 'Boiler', true, 1234),
  device('klimaat', 'Klimaatsensor', 'sensor', [cap('measure_temperature', { title: 'Temperatuur', units: '°C', decimals: 1, value: 20.5 }), cap('measure_humidity', { title: 'Luchtvochtigheid', units: '%', decimals: 2, value: 52.25 })]),
  device('schoon', 'Schoon water', 'other', [cap('tank_level', { units: '%', value: 64 }), cap('measure_content_volume', { units: 'L', value: 58 }), cap('tank_capacity', { units: 'L', value: 90 })]),
  device('starlink', 'Starlink', 'other', [cap('status', { type: 'string', title: 'Status', value: 'Online' }), cap('download', { title: 'Download', units: 'Mbit/s', decimals: 1, value: 182.4 }), cap('upload', { title: 'Upload', units: 'Mbit/s', value: 21 }), cap('latency', { title: 'Vertraging', units: 'ms', value: 34 })]),
  device('sam', 'Sam', 'sensor', [cap('presence', { type: 'boolean', titleTrue: 'Aanwezig', titleFalse: 'Afwezig', value: true })]),
  device('robin', 'Robin', 'sensor', [cap('presence', { type: 'boolean', titleTrue: 'Aanwezig', titleFalse: 'Afwezig', value: false })]),
  device('rook', 'Rookmelder', 'sensor', [cap('alarm_smoke', { type: 'boolean', titleTrue: 'Rook gemeld', value: true })]),
  device('afstand', 'Afstandsbediening', 'remote', [cap('measure_battery', { units: '%', value: 9 })]),
  device('bel', 'Deurbel', 'button', [cap('button', { type: 'boolean', setable: true, getable: false })]),
];

export const GALLERY_TILES: Record<string, TileSpec[]> = {
  lights: [
    { kind: 'light', id: 'plafond:light', deviceId: 'plafond', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' },
    { kind: 'light', id: 'badkamer:light', deviceId: 'badkamer', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' },
  ],
  switches: [
    { kind: 'switch', id: 'koelkast:switch', deviceId: 'koelkast', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: 'measure_power' },
    { kind: 'switch', id: 'koffie:switch', deviceId: 'koffie', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: null },
    { kind: 'switch', id: 'boiler:switch', deviceId: 'boiler', size: 'single', onoffCapabilityId: 'onoff', detailCapabilityId: 'measure_power' },
  ],
  others: [
    { kind: 'sensor', id: 'klimaat:t', deviceId: 'klimaat', size: 'single', capabilityId: 'measure_temperature', showCapabilityTitle: true },
    { kind: 'sensor', id: 'klimaat:h', deviceId: 'klimaat', size: 'single', capabilityId: 'measure_humidity', showCapabilityTitle: true },
    { kind: 'tank', id: 'schoon:tank', deviceId: 'schoon', size: 'single', levelCapabilityId: 'tank_level', volumeCapabilityId: 'measure_content_volume', capacityCapabilityId: 'tank_capacity' },
    { kind: 'button', id: 'bel:button', deviceId: 'bel', size: 'single', capabilityId: 'button' },
    { kind: 'multi', id: 'starlink:multi', deviceId: 'starlink', size: 'wide', capabilityIds: ['download', 'upload', 'latency'] },
    { kind: 'generic', id: 'sam:generic', deviceId: 'sam', size: 'single', capabilityId: 'presence' },
    { kind: 'generic', id: 'robin:generic', deviceId: 'robin', size: 'single', capabilityId: 'presence' },
  ],
  states: [
    { kind: 'light', id: 'spot:light', deviceId: 'spot', size: 'wide', onoffCapabilityId: 'onoff', dimCapabilityId: 'dim' },
    { kind: 'generic', id: 'afstand:generic', deviceId: 'afstand', size: 'single', capabilityId: null },
    { kind: 'generic', id: 'rook:generic', deviceId: 'rook', size: 'single', capabilityId: 'alarm_smoke' },
  ],
  house: (['single', 'wide'] as const).flatMap((size) => HOUSE.map((d): TileSpec => ({ kind: houseKind(d)!, id: `${d.id}:${size}`, deviceId: d.id, size }))),
  flows: [
    { kind: 'flow', id: 'f1:flow', flowId: 'f1', flowKind: 'flow', size: 'single' },
    { kind: 'flow', id: 'f2:flow', flowId: 'f2', flowKind: 'flow', size: 'single' },
  ],
};

/** A UiContext over a snapshot whose actions change the store directly; `say` shows what needs a Homey. */
export function contextFor(snapshot: HomeySnapshot, say: (text: string) => void, status: () => DashboardStatus): UiContext {
  const store = createStore((flush) => requestAnimationFrame(flush));
  store.load(snapshot);
  const set = (deviceId: string, capabilityId: string, value: CapabilityValue) => store.apply({ type: 'capability', deviceId, capabilityId, value, at: null });
  return {
    store, t, status, busy: () => null,
    actions: {
      toggle: (spec) => {
        const id = spec.onoffCapabilityId ?? (spec.kind === 'light' ? spec.dimCapabilityId : null);
        if (id) set(spec.deviceId, id, store.getDevice(spec.deviceId)?.capabilities[id]?.value !== true);
      },
      slide: (deviceId, capabilityId, value) => { set(deviceId, capabilityId, value); set(deviceId, 'onoff', true); },
      press: (deviceId) => say(t('tile.pressed', { name: store.getDevice(deviceId)?.name ?? '' })),
      setCapability: set, guard: set,
      lamps: (ids, on) => { for (const id of ids) set(id, 'onoff', on); },
      nudge: (deviceId, steps) => {
        const climate = climateOf(store.getDevice(deviceId)!);
        if (climate) set(deviceId, climate.target.id, clampTarget(climate.target, Number(climate.target.value ?? 20) + steps * targetStep(climate.target)));
      },
      startFlow: async (flowId) => flowId !== 'f2',
      openDevice: (deviceId) => say(`Apparaatvenster: ${store.getDevice(deviceId)?.name ?? deviceId}`),
    },
  };
}

/** A UiContext over the invented hub. */
export function galleryContext(say: (text: string) => void): UiContext {
  const snapshot: HomeySnapshot = {
    homeyId: 'galerij', softwareVersion: null, scopes: [], devices: Object.fromEntries(GALLERY_DEVICES.map((d) => [d.id, d])), zones: {},
    flows: [{ id: 'f1', name: 'Alles uit', kind: 'flow', startable: true }, { id: 'f2', name: 'Slaapstand', kind: 'flow', startable: true }],
  };
  return contextFor(snapshot, say, () => ({ route: 'local', canControl: true, canStartFlows: true, demo: true }));
}
