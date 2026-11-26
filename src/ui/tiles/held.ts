import { css, html, type TemplateResult } from 'lit';
import { isGuarded } from '../../controls/danger';
import type { Device } from '../../homey/types';
import type { UiContext } from '../app/context';
import type { HeldCommand } from '../model/held-view';
import { askDanger } from '../parts/ask-danger';
import '../parts/hold-button';

/** A button for something that is held when it cannot be undone; on a tile or at the top of a window. */
export function heldButton(host: HTMLElement, ctx: UiContext, device: Device, command: HeldCommand, options: { large?: boolean; enabled?: boolean } = {}): TemplateResult {
  const go = (event: Event): void => {
    event.stopPropagation();
    if (isGuarded(device, command.capabilityId)) ctx.actions.guard(device.id, command.capabilityId, command.value);
    else ctx.actions.setCapability(device.id, command.capabilityId, command.value);
  };
  return html`<mh-hold-button text=${command.text} short=${command.short} label=${command.label} icon=${command.icon} ?guarded=${command.guarded}
    ?busy=${ctx.busy(device.id) !== null} ?main=${command.main} ?large=${options.large ?? false} ?disabled=${options.enabled === false}
    @go=${go} @ask=${(event: Event) => { event.stopPropagation(); askDanger(host, ctx, device.id, command.capabilityId, command.value); }}></mh-hold-button>`;
}

/** How far: a battery, a program. The part reaches it as --_level through the CSSOM. */
export const meterStyles = css`
  .meter { position: relative; flex: 2 1 0; min-width: 0; height: var(--tank-bar-height); border-radius: var(--shape-full); background: var(--slider-track); overflow: hidden; }
  .meter i { position: absolute; inset: 0 auto 0 0; width: calc(var(--_level, 0) * 1%); border-radius: inherit; background: var(--slider-fill); }
  /* the button beside it has the most room, for its words */
  .line > .meter ~ mh-hold-button { flex: 3 1 0; }
`;

export const meter = (): TemplateResult => html`<span class="meter" aria-hidden="true"><i></i></span>`;
