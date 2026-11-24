import { vi } from 'vitest';
import { t } from '../../src/i18n';
import type { Device, Flow } from '../../src/homey/types';
import { createStore } from '../../src/state/store';
import type { DashboardStatus, UiContext } from '../../src/ui/app/context';
import { snapshot } from './build';

/** A UiContext over a real store, with every action a spy and a status the test can change. */
export function fakeContext(devices: Device[], status: Partial<DashboardStatus> = {}, flows: Flow[] = []) {
  let pending: (() => void) | null = null;
  const store = createStore((flush) => { pending = flush; });
  store.load(snapshot(devices, { flows }));
  const actions = {
    toggle: vi.fn(), slide: vi.fn(), press: vi.fn(), setCapability: vi.fn(), guard: vi.fn(), nudge: vi.fn(), lamps: vi.fn(),
    startFlow: vi.fn(async () => true), openDevice: vi.fn(),
  };
  const state: DashboardStatus = { route: 'local', canControl: true, canStartFlows: true, demo: false, ...status };
  /** What a lock, a door or an alarm was told, per device. */
  const busy = new Map<string, NonNullable<ReturnType<UiContext['busy']>>>();
  const ctx: UiContext = { store, t, actions, status: () => state, busy: (id) => busy.get(id) ?? null };
  const flush = () => { const f = pending; pending = null; f?.(); };
  flush();
  return { ctx, store, actions, state, flush, busy };
}
