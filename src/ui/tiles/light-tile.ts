import { css, html, nothing, type CSSResultGroup, type PropertyValues } from 'lit';
import { live } from 'lit/directives/live.js';
import type { DeviceTileSpec } from '../../dashboard/types';
import { formatValue, joinValue } from '../../i18n/format';
import { dimBox, dimLevel, type DimBox } from '../model/dim-math';
import { createThrottle, fractionOf, SLIDER_SEND_MS, valueAt } from '../model/slider-math';
import type { IconName } from '../icons/icons';
import type { DimFrom } from '../parts/dimmer';
import { HELD_BUZZ_MS, observeHoldDim } from '../parts/hold-dim';
import { themePixels } from '../theme-pixels';
import { DeviceTileElement } from './tile-base';
import '../parts/slider';
import { SLIDER_PARTS } from '../part-names';

/**
 * A lamp tile is held and dimmed; `level` is the place in its range, 0 to 1, `percent` what the tile will say of
 * what the lamp gets there, `from` the place of the tile in the window.
 */
export interface DimDetail { phase: 'start' | 'move' | 'end'; tileId: string; box: DimBox; from: DimFrom; level: number; percent: number; name: string; icon: IconName }

type LightSpec = Extract<DeviceTileSpec, { kind: 'light' }>;

/**
 * The lamp tile. Wide: icon beside name and state ("Aan · 80%"), the slider below (beside it
 * in compact). A tap toggles; dragging dims live and the controller turns a lamp that is off on. Single, and on a
 * phone: without the slider; the state shows the level. Holding it then, and swiping up and down without lifting, dims
 *: it reports `dim`, for the dimmer it grows into.
 */
export class MhLightTile extends DeviceTileElement<LightSpec> {
  static override styles: CSSResultGroup = [DeviceTileElement.styles, css`
    mh-slider { flex: none; width: 100%; }
    :host([density="compact"]) mh-slider { flex: 1 1 0; width: auto; }
  `];

  /** What goes on while the tile is held. */
  private dimming: { box: DimBox; from: DimFrom; level: number; changed: boolean } | null = null;
  private throttle = createThrottle((level) => this.dim(level, false), SLIDER_SEND_MS, {
    now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });

  private get range() {
    const dim = this.ctx.store.getDevice(this.spec.deviceId)?.capabilities[this.spec.dimCapabilityId];
    return dim?.setable ? { min: dim.min ?? 0, max: dim.max ?? 1, step: dim.step ?? null, value: dim.value } : null;
  }

  private dim(level: number, final: boolean): void {
    const { range } = this;
    if (range) this.ctx.actions.slide(this.spec.deviceId, this.spec.dimCapabilityId, valueAt(level, range), final);
  }

  private report(phase: DimDetail['phase']): void {
    if (!this.dimming) return;
    const { box, from, level } = this.dimming;
    const { range } = this;
    const percent = Math.round((range ? fractionOf(valueAt(level, range), range) : level) * 100);
    const detail: DimDetail = { phase, tileId: this.spec.id, box, from, level, percent, name: this.view.name, icon: this.view.icon };
    this.dispatchEvent(new CustomEvent('dim', { detail, bubbles: true, composed: true }));
  }

  private startDim(y: number): void {
    const { range } = this;
    const { left, top, width, height } = this.getBoundingClientRect();
    const edge = themePixels('space-8');
    const level = range && this.view.state === 'on' && typeof range.value === 'number' ? fractionOf(range.value, range) : 0;
    const box = dimBox({ left, top, width }, y, level, { height: themePixels('dimmer-height'), grow: themePixels('dimmer-grow') }, { top: edge, bottom: window.innerHeight - edge });
    this.dimming = { box, from: { left, top, width, height }, level, changed: false };
    navigator.vibrate?.(HELD_BUZZ_MS);
    this.report('start');
  }

  private moveDim(y: number): void {
    if (!this.dimming) return;
    const level = dimLevel(this.dimming.box, y);
    if (level === this.dimming.level) return;
    this.dimming = { ...this.dimming, level, changed: true };
    this.throttle.push(level);
    this.report('move');
  }

  private endDim(swiped: boolean, lifted: boolean): void {
    if (!this.dimming) return;
    this.throttle.cancel();
    // a finger that only slipped, on a lamp that is off and stays so, leaves its brightness alone
    if (swiped && this.dimming.changed) this.dim(this.dimming.level, true);
    this.report('end');
    this.dimming = null;
    // held, and lifted without swiping: the window of the lamp, as everywhere
    if (!swiped && lifted) this.openDevice();
  }

  protected override watchHold(box: HTMLElement): () => void {
    if (this.wide) return super.watchHold(box);
    return observeHoldDim(box, {
      enabled: () => !this.editing,
      canDim: () => {
        const status = this.ctx.status();
        return this.view.state !== 'unavailable' && status.route !== null && status.canControl && this.range !== null;
      },
      start: (y) => this.startDim(y), move: (y) => this.moveDim(y), end: (swiped, lifted) => this.endDim(swiped, lifted), open: () => this.openDevice(),
    });
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    // with or without the slider it is held in another way
    if (changed.has('wide') && changed.get('wide') !== undefined) this.hold();
  }

  private onSlide(event: CustomEvent<{ fraction: number }>, final: boolean): void {
    event.stopPropagation();
    const dim = this.ctx.store.getDevice(this.spec.deviceId)?.capabilities[this.spec.dimCapabilityId];
    const value = valueAt(event.detail.fraction, { min: dim?.min ?? 0, max: dim?.max ?? 1, step: dim?.step ?? null });
    this.ctx.actions.slide(this.spec.deviceId, this.spec.dimCapabilityId, value, final);
    // draw again after a release: when nothing changed in the store (no route, no right), live() puts the handle back
    if (final) this.requestUpdate();
  }

  protected override renderExtra() {
    if (this.view.state === 'unavailable' || !this.wide) return nothing;
    const dim = this.ctx.store.getDevice(this.spec.deviceId)?.capabilities[this.spec.dimCapabilityId];
    return html`<mh-slider exportparts=${SLIDER_PARTS} .fraction=${live((this.view.level ?? 0) / 100)} ?dimmed=${this.view.state !== 'on'} ?inert=${this.editing}
      label=${this.ctx.t('tile.brightness', { name: this.view.name })} valueText=${joinValue(formatValue(dim, 'tile', this.ctx.t))}
      @slide=${(e: CustomEvent<{ fraction: number }>) => this.onSlide(e, false)}
      @commit=${(e: CustomEvent<{ fraction: number }>) => this.onSlide(e, true)}></mh-slider>`;
  }
}

if (!customElements.get('mh-light-tile')) customElements.define('mh-light-tile', MhLightTile);
