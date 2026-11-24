import type { CapabilityValue } from '../../homey/types';
import type { UiContext } from '../app/context';

/** Something dangerous was asked for with a short tap: the app asks whether that is meant. */
export interface DangerDetail { deviceId: string; capabilityId: string; value: CapabilityValue }

/** Reports that a question is needed first. Where nothing can be done, the notice says why instead. */
export function askDanger(from: EventTarget, ctx: UiContext, deviceId: string, capabilityId: string, value: CapabilityValue): void {
  const { route, canControl } = ctx.status();
  // the plain way never leads to something dangerous: here it only tells why not
  if (route === null || !canControl) ctx.actions.setCapability(deviceId, capabilityId, value);
  else from.dispatchEvent(new CustomEvent<DangerDetail>('confirm-danger', { detail: { deviceId, capabilityId, value }, bubbles: true, composed: true }));
}
