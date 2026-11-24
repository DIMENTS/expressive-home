import { isButton } from './buttons';
import type { Flow, HomeySnapshot } from './types';

/** What can be chosen of the flows: the buttons, also while their flows are off, and what can be started by hand; on the app on the hub that last only with a key. */
export function offeredFlows(snapshot: Pick<HomeySnapshot, 'flows' | 'flowAccess'>): Flow[] {
  return snapshot.flows.filter((flow) => isButton(flow.id) || (flow.startable && snapshot.flowAccess !== 'none'));
}
