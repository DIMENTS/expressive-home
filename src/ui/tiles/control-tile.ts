import { css, html, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type { DeviceTileSpec } from '../../dashboard/types';
import type { Capability, Device } from '../../homey/types';
import { goesAlong, valueAt } from '../model/slider-math';
import { controlStyles } from './control-styles';
import { DeviceTileElement } from './tile-base';
import '../parts/slider';

export interface TileSlider { cap: Capability; fraction: number; label: string; valueText: string; dimmed?: boolean; /** The other way round: an awning is out at the lowest value. */ turned?: boolean }

/** A tile that has a row of buttons when it is wide. What is pressed there is not pressed on the tile. */
export abstract class ControlTileElement<S extends DeviceTileSpec = DeviceTileSpec> extends DeviceTileElement<S> {
  static override styles: CSSResultGroup = [DeviceTileElement.styles, controlStyles, css`
    .controls { flex: none; min-width: 0; margin-top: auto; container-type: inline-size; cursor: default; }
    /* a tap beside the buttons opens the window already: there only the keyboard needs this button, which would lie on them */
    :host([density="compact"]) .tile:has(.controls) .more:not(:focus-visible) { opacity: 0; pointer-events: none; }
    :host([density="compact"]) .controls { flex: 1 1 0; margin-top: 0; --control-height: var(--tile-icon-box); }
  `];

  protected abstract renderControls(device: Device): TemplateResult | typeof nothing;

  protected command(capabilityId: string, value: string | number | boolean): void {
    this.ctx.actions.setCapability(this.spec.deviceId, capabilityId, value);
  }

  private onSlide({ cap, turned }: TileSlider, event: CustomEvent<{ fraction: number }>, final: boolean): void {
    event.stopPropagation();
    if (!final && !goesAlong(cap.baseId)) return;
    const { fraction } = event.detail;
    this.ctx.actions.slide(this.spec.deviceId, cap.id, valueAt(turned ? 1 - fraction : fraction, { min: cap.min ?? 0, max: cap.max ?? 1, step: cap.step }), final);
    // draw again after a release: when nothing changed in the store (no route, no right), live() puts the handle back
    if (final) this.requestUpdate();
  }

  protected renderSlider(slider: TileSlider): TemplateResult {
    return html`<mh-slider .fraction=${live(slider.fraction)} ?dimmed=${slider.dimmed ?? false} label=${slider.label} valueText=${slider.valueText}
      @slide=${(e: CustomEvent<{ fraction: number }>) => this.onSlide(slider, e, false)}
      @commit=${(e: CustomEvent<{ fraction: number }>) => this.onSlide(slider, e, true)}></mh-slider>`;
  }

  protected override renderExtra() {
    const device = this.ctx.store.getDevice(this.spec.deviceId);
    if (!this.wide || !device || this.view.state === 'unavailable') return nothing;
    const controls = this.renderControls(device);
    if (controls === nothing) return nothing;
    const stop = (event: Event): void => event.stopPropagation();
    return html`<div class="controls" ?inert=${this.editing} @pointerdown=${stop} @click=${stop}
      @contextmenu=${(event: Event) => { event.preventDefault(); event.stopPropagation(); }}>${controls}</div>`;
  }
}
