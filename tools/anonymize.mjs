// Turns a raw Homey snapshot into an anonymised copy that is safe to commit.
// Output records are built from allow-lists: any field not listed is dropped.
// Usage: node tools/anonymize.mjs <in.json> <out.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLASS_NAMES = {
  light: 'Lamp',
  socket: 'Stekker',
  sensor: 'Sensor',
  button: 'Knop',
  battery: 'Accu',
  solarpanel: 'Zonnepaneel',
};

const DEVICE_KEYS = ['class', 'virtualClass', 'available', 'capabilities'];
// The only energy settings the app reads; everything else (batteries, approximations, meter references) is dropped.
const ENERGY_FLAGS = ['cumulative', 'homeBattery'];
const CAPABILITY_KEYS = ['id', 'type', 'getable', 'setable', 'units', 'min', 'max', 'step', 'decimals'];
const FLOW_KEYS = ['enabled', 'triggerable'];

const entries = (record) => Object.entries(record ?? {});
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function pick(source, keys) {
  const out = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

export function anonymize(raw) {
  const zoneIds = new Map(entries(raw.zones).map(([key], i) => [key, `zone-${i + 1}`]));
  const mapZone = (id) => (typeof id === 'string' ? (zoneIds.get(id) ?? null) : null);

  // original name -> anonymised name, used for free text in kept fields
  const nameMap = new Map();
  const originalIds = new Set([raw.homeyId]);
  const remember = (key, record, newName) => {
    originalIds.add(key);
    if (typeof record.id === 'string') originalIds.add(record.id);
    if (typeof record.name === 'string' && record.name.length >= 4) nameMap.set(record.name.toLowerCase(), newName);
  };

  const zones = {};
  for (const [key, zone] of entries(raw.zones)) {
    const id = zoneIds.get(key);
    const name = `Zone ${id.slice('zone-'.length)}`;
    remember(key, zone, name);
    zones[id] = { id, name, parent: mapZone(zone.parent) };
  }

  const appIds = new Map(); // original app id -> app-N
  const driverFallbacks = new Map(); // original non-standard driverId -> driver-N
  const mapDriver = (driverId) => {
    if (typeof driverId !== 'string') return null;
    const match = /^homey:app:([^:]+):(.+)$/s.exec(driverId);
    if (match) {
      if (!appIds.has(match[1])) appIds.set(match[1], `app-${appIds.size + 1}`);
      return `homey:app:${appIds.get(match[1])}:${match[2]}`;
    }
    if (!driverFallbacks.has(driverId)) driverFallbacks.set(driverId, `driver-${driverFallbacks.size + 1}`);
    return driverFallbacks.get(driverId);
  };

  const perClass = new Map();
  const deviceSources = [];
  const devices = {};
  entries(raw.devices).forEach(([key, device], i) => {
    const id = `device-${i + 1}`;
    const label = CLASS_NAMES[device.virtualClass ?? device.class] ?? 'Apparaat';
    const n = (perClass.get(label) ?? 0) + 1;
    perClass.set(label, n);
    const name = `${label} ${n}`;
    remember(key, device, name);
    devices[id] = { id, name, zone: mapZone(device.zone), ...pick(device, DEVICE_KEYS) };
    if (isObj(device.energyObj)) {
      devices[id].energyObj = {};
      for (const flag of ENERGY_FLAGS) if (typeof device.energyObj[flag] === 'boolean') devices[id].energyObj[flag] = device.energyObj[flag];
    } else if (device.energyObj === null) {
      devices[id].energyObj = null;
    }
    if (device.driverId !== undefined) devices[id].driverId = mapDriver(device.driverId);
    deviceSources.push([id, device]);
  });

  const renumber = (record, prefix, label) => {
    const out = {};
    entries(record).forEach(([key, flow], i) => {
      const id = `${prefix}-${i + 1}`;
      const name = `${label} ${i + 1}`;
      remember(key, flow, name);
      out[id] = { id, name, ...pick(flow, FLOW_KEYS) };
    });
    return out;
  };
  const flows = renumber(raw.flows, 'flow', 'Flow');
  const advancedFlows = renumber(raw.advancedFlows, 'advanced', 'Advanced Flow');

  // One pass, longest names first, so replacements are never re-scanned.
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);
  const names = [...nameMap.keys()].sort((a, b) => b.length - a.length);
  const nameRegex = names.length ? new RegExp(names.map(escape).join('|'), 'gi') : null;
  const scrub = (text) => (nameRegex && typeof text === 'string' ? text.replace(nameRegex, (m) => nameMap.get(m.toLowerCase())) : text);
  // A title is text, or an object with one text per language. Anything else in or instead of it is dropped.
  const cleanTitle = (title) => {
    if (typeof title === 'string') return scrub(title);
    if (!isObj(title)) return undefined;
    return Object.fromEntries(entries(title).filter(([, text]) => typeof text === 'string').map(([language, text]) => [language, scrub(text)]));
  };
  const withTitle = (target, title) => {
    const clean = cleanTitle(title);
    if (clean !== undefined) target.title = clean;
    return target;
  };

  for (const [id, device] of deviceSources) {
    const out = devices[id];
    if (typeof device.unavailableMessage === 'string' && device.unavailableMessage !== '') out.unavailableMessage = 'Niet bereikbaar';
    else if (device.unavailableMessage !== undefined) out.unavailableMessage = device.unavailableMessage;
    if (isObj(device.capabilitiesObj)) {
      out.capabilitiesObj = {};
      for (const [capId, cap] of entries(device.capabilitiesObj)) {
        if (!isObj(cap)) continue;
        // Rebuilt in the original key order: id, title, then the rest.
        const { id: capabilityId, ...rest } = pick(cap, CAPABILITY_KEYS);
        const copy = { ...withTitle(capabilityId === undefined ? {} : { id: capabilityId }, cap.title), ...rest };
        if (Array.isArray(cap.values)) {
          copy.values = cap.values.filter(isObj).map((v) => withTitle(pick(v, ['id']), v.title));
        }
        if (cap.value !== undefined) copy.value = cap.type === 'string' && typeof cap.value === 'string' ? 'voorbeeld' : cap.value;
        out.capabilitiesObj[capId] = copy;
      }
    }
  }

  const result = {
    homeyId: 'mock-homey',
    softwareVersion: raw.softwareVersion,
    scopes: raw.scopes,
    devices,
    zones,
    flows,
    advancedFlows,
  };

  // Final guard: no original id may survive anywhere in the output.
  const generated = new Set(['mock-homey']);
  for (const group of [devices, zones, flows, advancedFlows]) for (const id of Object.keys(group)) generated.add(id);
  const text = JSON.stringify(result);
  const generatedApps = new Set(appIds.values());
  for (const id of [...originalIds, ...[...appIds.keys()].filter((a) => !generatedApps.has(a))]) {
    if (typeof id === 'string' && id !== '' && !generated.has(id) && text.includes(id)) {
      throw new Error('Anonymisation is incomplete: an original id is still present in the output.');
    }
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node tools/anonymize.mjs <in.json> <out.json>');
    process.exit(1);
  }
  const result = anonymize(JSON.parse(readFileSync(input, 'utf8')));
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(`${Object.keys(result.devices).length} devices written to ${output}`);
}
