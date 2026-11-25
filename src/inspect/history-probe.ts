import type { HeroSpec } from '../dashboard/types';

/** What the hub answers about its history, as it is; only for measuring. */
export interface RawHistory {
  logs(): Promise<unknown>;
  entries(id: string, resolution: string | null): Promise<unknown>;
}

/** Every period that a hub might know; null: none is given. */
export const RESOLUTIONS: readonly (string | null)[] = [
  null, 'today', 'yesterday', 'lastHour', 'last6Hours', 'last24Hours', 'last3Days', 'last7Days', 'last14Days', 'last31Days', 'thisWeek', 'thisMonth', 'lastWeek', 'lastMonth', 'thisYear', 'lastYear', 'last2Years',
];
/** Capabilities that say nothing about a brand or an owner. */
const KNOWN = ['measure_battery', 'measure_temperature', 'measure_humidity', 'measure_power', 'meter_power', 'measure_co2', 'measure_luminance', 'onoff', 'dim', 'target_temperature'];
/** Names of fields that may be told. */
const FIELDS = new Set(['values', 'entries', 'start', 'end', 'step', 'updatesIn', 't', 'v', 'id', 'uri', 'type', 'units', 'lastValue', 'resolution', 'min', 'max', 'avg', 'count']);
const ANSWER_MS = 15_000;
const MINUTE_MS = 60_000;
const DEVICE_LOG = /^homey:device:[^:]+:(.+)$/;
const APP_LOG = /^homey:app:([^:]+):(.+)$/;
/** The id of this app: its own logs may be told by their name, which this app chose. */
export const OWN_APP = 'app.expressive.home';
/** Periods for the logs of this app: enough to see whether the hub sums them up per step. */
const OWN_RESOLUTIONS = ['lastHour', 'last24Hours', 'last7Days'];
const OWN_LOGS_TOLD = 4;
/** An id that an app or this app made up, never a name of the owner. */
const PLAIN_ID = /^[a-z][a-z0-9_.-]{0,40}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const kindOf = (value: unknown): string => (value === null || value === undefined ? 'leeg' : typeof value === 'number' ? 'getal' : typeof value === 'boolean' ? 'ja/nee' : typeof value === 'string' ? 'tekst' : 'anders');

function counts(values: readonly string[]): string {
  const found = new Map<string, number>();
  for (const value of values) found.set(value, (found.get(value) ?? 0) + 1);
  return [...found].map(([value, n]) => `${value} ${n}`).join(' ');
}

/** The names of fields, only those that cannot hold anything of the owner; of the others how many. */
function fields(names: readonly string[]): string {
  const known = names.filter((name) => FIELDS.has(name)).sort();
  const others = names.length - known.length;
  return [...known, ...(others > 0 ? [`+${others}`] : [])].join(' ');
}

const failure = (error: unknown): string => {
  const { statusCode, status } = (isRecord(error) || error instanceof Error ? error : {}) as { statusCode?: unknown; status?: unknown };
  const code = typeof statusCode === 'number' ? statusCode : typeof status === 'number' ? status : null;
  return code === null ? 'fout' : `fout ${code}`;
};

const LATE = Symbol('late');

/** What came back, as its shape. */
function shape(answer: unknown, now: number): string {
  const list = Array.isArray(answer) ? answer : isRecord(answer) && Array.isArray(answer['values']) ? answer['values'] : isRecord(answer) && Array.isArray(answer['entries']) ? answer['entries'] : null;
  if (!list) return isRecord(answer) ? `geen lijst, velden ${fields(Object.keys(answer))}` : `geen lijst, ${kindOf(answer)}`;
  const parts = [`lijst van ${list.length}`];
  const entries = list.filter(isRecord);
  if (entries.length > 0) {
    parts.push(`velden ${fields(Object.keys(entries[0]!))}`, `t ${kindOf(entries[0]!['t'])}`, `v ${counts(entries.map((entry) => kindOf(entry['v'])))}`);
    const times = entries.map((entry) => (typeof entry['t'] === 'number' ? entry['t'] : Date.parse(String(entry['t'])))).filter(Number.isFinite).sort((a, b) => a - b);
    const gaps = times.slice(1).map((time, i) => time - times[i]!).sort((a, b) => a - b);
    if (gaps.length > 0) parts.push(`om de ${Math.round(gaps[Math.floor(gaps.length / 2)]! / MINUTE_MS)} min`);
    if (times.length > 0) parts.push(`eerste ${Math.round((now - times[0]!) / MINUTE_MS)} en laatste ${Math.round((now - times.at(-1)!) / MINUTE_MS)} min geleden`);
    const filled = entries.filter((entry) => entry['v'] !== null && entry['v'] !== undefined)
      .map((entry) => (typeof entry['t'] === 'number' ? entry['t'] : Date.parse(String(entry['t'])))).filter(Number.isFinite).sort((a, b) => a - b);
    if (filled.length > 0 && filled.length < entries.length) parts.push(`gevuld van ${Math.round((now - filled[0]!) / MINUTE_MS)} tot ${Math.round((now - filled.at(-1)!) / MINUTE_MS)} min geleden`);
  }
  if (isRecord(answer)) parts.push(`erbij: ${fields(Object.keys(answer).filter((name) => name !== 'values' && name !== 'entries'))}`);
  return parts.join(', ');
}

/**
 * What the hub tells of its history, for who makes the charts: how many logs, and of a few of them what every period gives.
 * Only shapes, numbers of things and times: never a name, an id or a value. Never throws.
 */
export async function probeHistory(raw: RawHistory, hero: HeroSpec | null, now: number, wait = ANSWER_MS): Promise<string> {
  const inTime = async (ask: () => Promise<unknown>): Promise<unknown> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([ask(), new Promise((done) => { timer = setTimeout(() => done(LATE), wait); })]);
    } finally {
      clearTimeout(timer);
    }
  };
  let logs: unknown;
  try {
    logs = await inTime(() => raw.logs());
  } catch (error) {
    return `geschiedenis, lijst: ${failure(error)}`;
  }
  if (logs === LATE) return 'geschiedenis, lijst: geen antwoord';
  const all = isRecord(logs) ? Object.values(logs).filter(isRecord) : [];
  const ids = all.flatMap((log) => (typeof log['id'] === 'string' ? [log['id']] : []));
  const capability = (id: string): string | null => DEVICE_LOG.exec(id)?.[1] ?? null;
  const own = ids.filter((id) => capability(id) !== null);
  const named = own.map((id) => { const base = capability(id)!.split('.')[0]!; return KNOWN.includes(base) ? base : 'anders'; });
  const order = [...KNOWN, 'anders'].filter((name) => named.includes(name));
  const types = { number: 'getal', boolean: 'ja/nee' } as const;
  const ofApps = ids.filter((id) => APP_LOG.test(id));
  const ofThisApp = ofApps.filter((id) => APP_LOG.exec(id)![1] === OWN_APP);
  const counted = ofApps.length === 0 ? `${own.length} van apparaten` : `${own.length} van apparaten, ${ofApps.length} van apps, waarvan ${ofThisApp.length} van dit appje`;
  const lines = [
    `geschiedenis, reeksen: ${all.length} (${counted}); ${(['number', 'boolean'] as const).map((type) => `${types[type]} ${all.filter((log) => log['type'] === type).length}`).join(', ')}`,
    `- soorten: ${order.map((name) => `${name} ${named.filter((other) => other === name).length}`).join(', ')}`,
    `- velden van een reeks: ${all[0] ? fields(Object.keys(all[0])) : '-'}`,
  ];
  const wanted: [string, string][] = [];
  if (hero) {
    const roles: [string, { deviceId: string; capabilityId: string }][] = [[hero.kind, hero.primary], ...hero.stats.flatMap((stat): [string, { deviceId: string; capabilityId: string }][] => ('ref' in stat ? [[stat.role, stat.ref]] : []))];
    const found = roles.map(([role, ref]) => ({ role, id: `homey:device:${ref.deviceId}:${ref.capabilityId}` }));
    lines.push(`- blikvanger: ${found.map(({ role, id }) => `${role} bestaat${ids.includes(id) ? '' : ' niet'}`).join(', ')}`);
    for (const { role, id } of found) if (ids.includes(id)) wanted.push([role, id]);
  }
  for (const name of ['measure_temperature', 'measure_power', 'onoff']) {
    const id = own.find((one) => capability(one) === name && !wanted.some(([, other]) => other === one));
    if (id) wanted.push([name, id]);
  }
  for (const [name, id] of wanted) {
    for (const resolution of RESOLUTIONS) {
      let told: string;
      try {
        const answer = await inTime(() => raw.entries(id, resolution));
        told = answer === LATE ? 'geen antwoord' : shape(answer, now);
      } catch (error) {
        told = failure(error);
      }
      lines.push(`- ${name}, ${resolution ?? 'zonder periode'}: ${told}`);
    }
  }
  for (const id of ofThisApp.slice(0, OWN_LOGS_TOLD)) {
    const local = APP_LOG.exec(id)![2]!;
    const name = PLAIN_ID.test(local) ? local : '(eigen)';
    for (const resolution of OWN_RESOLUTIONS) {
      let told: string;
      try {
        const answer = await inTime(() => raw.entries(id, resolution));
        told = answer === LATE ? 'geen antwoord' : shape(answer, now);
      } catch (error) {
        told = failure(error);
      }
      lines.push(`- dit appje, ${name}, ${resolution}: ${told}`);
    }
  }
  return lines.join('\n');
}

/**
 * The shape of the capability behind the shore power: its type, and for words their ids, which the app of the device made up.
 * Never the titles; an id that might be anything else is not told.
 */
export function describeShore(capability: { id?: string; type: string; options: readonly { id: string; title?: string }[]; value: unknown } | undefined): string {
  if (!capability) return 'walstroom: geen';
  if (capability.type !== 'enum' && capability.type !== 'string') return `walstroom: ${capability.type}, nu ${kindOf(capability.value)}`;
  const ids = capability.options.map((option) => option.id);
  const plain = ids.length > 0 && ids.every((id) => PLAIN_ID.test(id));
  const now = typeof capability.value === 'string' && plain && ids.includes(capability.value) ? capability.value : capability.value === null ? 'leeg' : '(eigen)';
  return `walstroom: ${capability.type}, woorden ${plain ? ids.join(' ') : '(eigen)'}, nu ${now}`;
}
