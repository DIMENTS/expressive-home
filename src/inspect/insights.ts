import type { CapRef, HeroSpec } from '../dashboard/types';
import { ConnectionError, type HistoryPeriod, type HistoryPoint, type HomeyClient } from '../homey/client';

type Role = 'solar' | 'consumption' | 'battery';
const PERIODS: HistoryPeriod[] = ['today', 'last24Hours'];
const MINUTE_MS = 60_000;

export interface PeriodMeasurement {
  period: HistoryPeriod; points: number; stepMinutes: number | null;
  firstMinutesAgo: number | null; lastMinutesAgo: number | null; error: string | null;
}
export interface InsightsMeasurement {
  logs: number;
  /** Why the list of logs could not be read; null when it could. */
  listError: string | null;
  /** Per role of the hero ('solar', 'consumption', 'battery'): whether its log exists, and per period what came back. */
  roles: { role: Role; exists: boolean; periods: PeriodMeasurement[] }[];
}

const failureOf = (error: unknown): string => (error instanceof ConnectionError ? error.failure : 'unreachable');

/** The capabilities behind the roles of the hero, in this order; the same sources the chart uses. */
function heroRoles(hero: HeroSpec): { role: Role; ref: CapRef }[] {
  const stat = (role: 'solar' | 'consumption') => hero.stats.find((s) => s.role === role);
  const solar = stat('solar');
  const consumption = stat('consumption');
  const roles: { role: Role; ref: CapRef }[] = [];
  if (solar && solar.role !== 'net') roles.push({ role: 'solar', ref: solar.ref });
  else if (hero.kind === 'solar') roles.push({ role: 'solar', ref: hero.primary });
  if (consumption && consumption.role !== 'net') roles.push({ role: 'consumption', ref: consumption.ref });
  else if (hero.kind === 'consumption') roles.push({ role: 'consumption', ref: hero.primary });
  if (hero.kind === 'battery') roles.push({ role: 'battery', ref: hero.primary });
  return roles;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

function describe(period: HistoryPeriod, points: HistoryPoint[], now: number): PeriodMeasurement {
  const gaps = points.slice(1).map((p, i) => p.at - points[i]!.at);
  const ago = (point: HistoryPoint | undefined) => (point ? Math.round((now - point.at) / MINUTE_MS) : null);
  return {
    period, points: points.length,
    stepMinutes: gaps.length ? Math.round(median(gaps) / MINUTE_MS) : null,
    firstMinutesAgo: ago(points[0]), lastMinutesAgo: ago(points[points.length - 1]), error: null,
  };
}

/** What Insights gives for the hero on this hub: counts and times only, never a name or a value. Never throws. */
export async function measureInsights(client: HomeyClient, hero: HeroSpec | null, now: number): Promise<InsightsMeasurement> {
  let logs;
  try {
    logs = await client.listHistory();
  } catch (error) {
    return { logs: 0, listError: failureOf(error), roles: [] };
  }
  const roles: InsightsMeasurement['roles'] = [];
  for (const { role, ref } of hero ? heroRoles(hero) : []) {
    const source = logs.find((log) => log.deviceId === ref.deviceId && log.capabilityId === ref.capabilityId);
    const exists = source !== undefined;
    const periods: PeriodMeasurement[] = [];
    if (exists) {
      for (const period of PERIODS) {
        try {
          const series = await client.readSeries(source!, period);
          const points = (series?.points ?? []).flatMap((point) => (point.value === null ? [] : [{ at: point.at, value: point.value }]));
          periods.push(describe(period, points, now));
        } catch (error) {
          periods.push({ period, points: 0, stepMinutes: null, firstMinutesAgo: null, lastMinutesAgo: null, error: failureOf(error) });
        }
      }
    }
    roles.push({ role, exists, periods });
  }
  return { logs: logs.length, listError: null, roles: hero ? roles : [] };
}

/** The measurement as lines for the copied result of the inspection page. */
export function insightsText(m: InsightsMeasurement): string {
  if (m.listError !== null) return `insights: lijst lezen mislukt (${m.listError})`;
  const lines = [`insights: ${m.logs} reeksen`];
  if (m.roles.length === 0) lines.push('- blikvanger: geen');
  for (const role of m.roles) {
    lines.push(`- ${role.role}: ${role.exists ? 'bestaat' : 'bestaat niet'}`);
    for (const p of role.periods) {
      if (p.error !== null) {
        lines.push(`  - ${p.period}: fout (${p.error})`);
        continue;
      }
      const parts = [`${p.points} punten`];
      if (p.stepMinutes !== null) parts.push(`om de ${p.stepMinutes} min`);
      if (p.firstMinutesAgo !== null) parts.push(`eerste ${p.firstMinutesAgo} min geleden`);
      if (p.lastMinutesAgo !== null) parts.push(`laatste ${p.lastMinutesAgo} min geleden`);
      lines.push(`  - ${p.period}: ${parts.join(', ')}`);
    }
  }
  return lines.join('\n');
}
