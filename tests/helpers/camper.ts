import camperRaw from '../../src/mock/fixtures/camper.raw.json';
import { generateDashboard } from '../../src/dashboard/generate';
import { toSnapshot } from '../../src/homey/map';
import type { RawHomey } from '../../src/homey/types';
import type { DashboardStatus } from '../../src/ui/app/context';
import { fakeContext } from './ui-context';

/** The anonymised camper as a snapshot, its generated dashboard and a fake context over a real store. */
export function camper(status: Partial<DashboardStatus> = {}) {
  const snapshot = toSnapshot(camperRaw as unknown as RawHomey);
  const dashboard = generateDashboard(snapshot, { grouping: 'type' });
  const fake = fakeContext(Object.values(snapshot.devices), status, snapshot.flows);
  return { snapshot, dashboard, ...fake };
}
